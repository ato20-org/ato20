//! O que a Galeria do Mestre pede ao disco e ao sistema.
//!
//! Duas familias de imagem moram em lugares diferentes: o acervo, em
//! `assets/{id}.{ext}`, e os anexos de personagem, em
//! `personagens/{id}/anexos/{autor}/`. A Galeria mostra as duas juntas, e os
//! gestos do botao direito -- mostrar na pasta, abrir com, propriedades --
//! precisam do ARQUIVO de cada uma. Este modulo e o unico lugar que sabe
//! transformar "esta imagem da Galeria" num caminho.
//!
//! A webview nunca manda caminho. Manda o descritor -- id do asset, ou
//! personagem + autor + nome --, e o caminho e derivado aqui, conferido contra
//! o que a campanha tem. A mesma cerca de `estante_abrir`: um comando que abre
//! programa da maquina com um argumento vindo da tela nao pode ser "abra o que
//! eu mandar".

use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::vault::characters::{self, Autor};
use crate::vault::{assets, variantes, Vault};

/// Uma imagem da Galeria, como a tela a identifica.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "tipo", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ArquivoDaGaleria {
    Asset {
        id: String,
    },
    /// O `autor` e parte da identidade, como em `character_detach`: "mapa.png"
    /// do mestre e "mapa.png" do jogador sao dois arquivos.
    Anexo {
        personagem_id: String,
        autor: Autor,
        arquivo: String,
    },
}

/// Um anexo de personagem que e imagem, com o que a Galeria mostra dele.
///
/// O nome do personagem vem junto, e nao so o id: a Galeria e uma grade de
/// arquivos de varios personagens, e "de quem e isto" e a segunda pergunta
/// depois de "o que e isto".
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnexoNaGaleria {
    pub personagem_id: String,
    pub personagem: String,
    pub arquivo: String,
    pub autor: Autor,
    pub mime_type: String,
    pub tamanho: u64,
    /// Milissegundos desde a epoca. O anexo nao tem data de importacao como o
    /// asset; a data do arquivo e o que ha, e e o que ordena a grade.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modificado_em: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub largura: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub altura: Option<u32>,
}

/// Todo anexo de personagem que e imagem, de todos os personagens.
///
/// Sem a subtracao do `character_attachments`, que tira as fotos de item: la a
/// lista e do que se escolhe para a ficha, aqui e de TODA imagem da campanha, e
/// a foto da espada do Edgar e uma delas.
///
/// As medidas saem do cabecalho, pelo `imagesize`, como na importacao do
/// acervo: ler o arquivo inteiro para saber a largura seria decodificar cada
/// print de ficha a cada vez que a Galeria abre.
pub fn anexos(vault: &Vault) -> AppResult<Vec<AnexoNaGaleria>> {
    let mut lista = Vec::new();

    for personagem in characters::load(vault)? {
        for anexo in characters::list_anexos(vault, &personagem.id)? {
            if !anexo.mime_type.starts_with("image/") {
                continue;
            }

            let caminho =
                characters::anexo_caminho(vault, &personagem.id, anexo.autor, &anexo.arquivo);

            let modificado_em = std::fs::metadata(&caminho)
                .and_then(|meta| meta.modified())
                .ok()
                .and_then(|instante| instante.duration_since(UNIX_EPOCH).ok())
                .map(|desde| desde.as_millis() as i64);

            let medida = imagesize::size(&caminho).ok();

            lista.push(AnexoNaGaleria {
                personagem_id: personagem.id.clone(),
                personagem: personagem.nome.clone(),
                arquivo: anexo.arquivo,
                autor: anexo.autor,
                mime_type: anexo.mime_type,
                tamanho: anexo.tamanho,
                modificado_em,
                largura: medida.as_ref().map(|m| m.width as u32),
                altura: medida.as_ref().map(|m| m.height as u32),
            });
        }
    }

    Ok(lista)
}

fn sumiu(nome: &str) -> AppError {
    AppError::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!("{nome} nao esta mais no disco"),
    ))
}

/// O arquivo de uma imagem da Galeria, conferido, e o tipo dela.
///
/// O asset e procurado no indice, e nao montado do id: o caminho depende da
/// extensao, que sai do `mime_type` gravado. O anexo exige que o personagem
/// EXISTA na campanha -- `anexo_existente` confere que o nome nao escapa da
/// pasta do personagem, mas a pasta e montada do id, e um id com `..` levaria a
/// pasta junto.
pub fn caminho(vault: &Vault, alvo: &ArquivoDaGaleria) -> AppResult<(PathBuf, String)> {
    match alvo {
        ArquivoDaGaleria::Asset { id } => {
            let meta = assets::find(vault, id)?.ok_or_else(|| sumiu(id))?;

            let caminho = assets::asset_path(vault, &meta);
            if !caminho.is_file() {
                return Err(sumiu(&meta.name));
            }

            Ok((caminho, meta.mime_type))
        }
        ArquivoDaGaleria::Anexo {
            personagem_id,
            autor,
            arquivo,
        } => {
            let existe = characters::load(vault)?
                .iter()
                .any(|personagem| &personagem.id == personagem_id);
            if !existe {
                return Err(sumiu(arquivo));
            }

            let caminho = characters::anexo_existente(vault, personagem_id, *autor, arquivo)
                .ok_or_else(|| sumiu(arquivo))?;

            Ok((caminho, characters::mime_do_anexo(arquivo).to_string()))
        }
    }
}

/// Quantas miniaturas de anexo se fazem ao mesmo tempo.
///
/// A Galeria abre e pede a de todos os anexos de uma vez. Sem teto, cada uma
/// vira um `spawn_blocking` decodificando um print de ficha inteiro, e trinta
/// juntos sao gigabytes de bitmap numa maquina de 8 GB. Duas e o que o daemon
/// tambem se permite -- ver `mini_gate` em `serve`.
static VEZ_DA_MINIATURA: LazyLock<tokio::sync::Semaphore> =
    LazyLock::new(|| tokio::sync::Semaphore::new(2));

/// A miniatura de 160px de um anexo, em bytes, ou o original quando ela nao sai.
///
/// A mesma reducao e a MESMA chave de cache da rota do jogador
/// (`/eu/personagens/{id}/anexos/{autor}/{arquivo}/mini`): a miniatura que a
/// Galeria fez e a que o celular do jogador recebe, e vice-versa.
///
/// Por IPC e nao pela rota, porque a rota de anexo e do JOGADOR, atras do token
/// dele -- ver `read_character_file_variante`. O mestre le pelo canal binario,
/// como em `character_attachment_bytes`.
///
/// Recebe o vault por valor, e nao a caixa: quem chama tira o caminho com a
/// tranca e a solta antes de decodificar. Segurar a campanha durante a reducao
/// pararia qualquer gravacao da cena enquanto a Galeria enche.
pub async fn miniatura_do_anexo(
    vault: Vault,
    origem: PathBuf,
    personagem_id: &str,
    autor: Autor,
    arquivo: &str,
) -> AppResult<Vec<u8>> {
    let chave = characters::anexo_chave(personagem_id, autor, arquivo);

    if let Some(pronta) = variantes::pronta(&vault, variantes::Variante::Mini, &chave, &origem) {
        return Ok(std::fs::read(pronta)?);
    }

    let _vez = VEZ_DA_MINIATURA
        .acquire()
        .await
        .map_err(|cause| AppError::Io(std::io::Error::other(cause.to_string())))?;

    let nome = arquivo.to_string();

    tokio::task::spawn_blocking(move || {
        match variantes::ensure_arquivo(&vault, variantes::Variante::Mini, &origem, &chave, &nome)
        {
            Ok(caminho) => Ok(std::fs::read(caminho)?),
            // Toda falha cai no original, como na rota: um `.png` que nao e
            // PNG existe, e disco cheio nao pode deixar o quadrado vazio.
            Err(cause) => {
                log::warn!("galeria: miniatura de {nome} nao saiu: {cause}");
                Ok(std::fs::read(&origem)?)
            }
        }
    })
    .await
    .map_err(|cause| AppError::Io(std::io::Error::other(format!("tarefa morreu: {cause}"))))?
}

/// Um programa que abre o arquivo.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Programa {
    /// O id do sistema -- no Linux, o nome do `.desktop`. E o que volta em
    /// `abrir_com`.
    pub id: String,
    pub nome: String,
    /// O que o sistema usa quando se da dois cliques no arquivo.
    pub padrao: bool,
}

/// O que o submenu "Abrir com" oferece para um tipo de arquivo.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgramasDoArquivo {
    pub programas: Vec<Programa>,
    /// O sistema tem um seletor proprio de "abrir com" -- o do Windows. Quando
    /// tem, a lista vem vazia e o menu oferece o seletor: enumerar os
    /// programas do registro a mao seria refazer o que ele ja faz.
    pub seletor: bool,
}

/// Os programas registrados para o tipo, com o padrao primeiro.
///
/// No Linux, pelo GIO: e a mesma lista que o "Abrir com" do gerenciador de
/// arquivos mostra, montada dos `.desktop` instalados. `should_show` tira o que
/// o proprio pacote pediu para esconder de menus.
#[cfg(target_os = "linux")]
pub fn programas(mime: &str) -> ProgramasDoArquivo {
    use gio::prelude::*;

    let tipo = gio::content_type_from_mime_type(mime)
        .map(|tipo| tipo.to_string())
        .unwrap_or_else(|| mime.to_string());

    let padrao = gio::AppInfo::default_for_type(&tipo, false)
        .and_then(|app| app.id())
        .map(|id| id.to_string());

    let mut programas: Vec<Programa> = gio::AppInfo::all_for_type(&tipo)
        .into_iter()
        .filter(|app| app.should_show())
        .filter_map(|app| {
            let id = app.id()?.to_string();

            Some(Programa {
                padrao: padrao.as_deref() == Some(id.as_str()),
                nome: app.display_name().to_string(),
                id,
            })
        })
        .collect();

    programas.sort_by(|a, b| {
        b.padrao
            .cmp(&a.padrao)
            .then_with(|| a.nome.to_lowercase().cmp(&b.nome.to_lowercase()))
    });
    programas.dedup_by(|a, b| a.id == b.id);

    ProgramasDoArquivo {
        programas,
        seletor: false,
    }
}

#[cfg(target_os = "windows")]
pub fn programas(_mime: &str) -> ProgramasDoArquivo {
    ProgramasDoArquivo {
        programas: Vec::new(),
        seletor: true,
    }
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
pub fn programas(_mime: &str) -> ProgramasDoArquivo {
    ProgramasDoArquivo {
        programas: Vec::new(),
        seletor: false,
    }
}

fn nao_abriu(caminho: &Path, cause: impl std::fmt::Display) -> AppError {
    AppError::Io(std::io::Error::other(format!("{}: {cause}", caminho.display())))
}

/// Abre o arquivo num programa da lista, ou no padrao quando `programa` falta.
///
/// O programa pedido tem de estar entre os que o sistema registra para o tipo:
/// e a lista que a tela mostrou, e um id fora dela seria a tela escolhendo um
/// executavel qualquer da maquina.
pub fn abrir_com(caminho: &Path, mime: &str, programa: Option<&str>) -> AppResult<()> {
    let Some(programa) = programa else {
        return tauri_plugin_opener::open_path(caminho, None::<&str>)
            .map_err(|cause| nao_abriu(caminho, cause));
    };

    abrir_no_programa(caminho, mime, programa)
}

#[cfg(target_os = "linux")]
fn abrir_no_programa(caminho: &Path, mime: &str, programa: &str) -> AppResult<()> {
    use gio::prelude::*;

    let tipo = gio::content_type_from_mime_type(mime)
        .map(|tipo| tipo.to_string())
        .unwrap_or_else(|| mime.to_string());

    let app = gio::AppInfo::all_for_type(&tipo)
        .into_iter()
        .find(|app| app.id().is_some_and(|id| id == programa))
        .ok_or_else(|| nao_abriu(caminho, format!("{programa} nao abre {mime}")))?;

    app.launch(&[gio::File::for_path(caminho)], None::<&gio::AppLaunchContext>)
        .map_err(|cause| nao_abriu(caminho, cause))
}

#[cfg(not(target_os = "linux"))]
fn abrir_no_programa(caminho: &Path, _mime: &str, programa: &str) -> AppResult<()> {
    Err(nao_abriu(caminho, format!("{programa}: sem lista de programas aqui")))
}

/// O seletor "Abrir com" do proprio sistema.
///
/// Windows: o `OpenAs_RunDLL` do shell, o mesmo dialogo do botao direito no
/// Explorer. O caminho vai CRU, sem aspas: o `rundll32` entrega o resto da
/// linha inteiro ao `OpenAs_RunDLL`, que o le como um caminho so -- com aspas,
/// elas virariam parte do nome. E sem o prefixo `\\?\`, que o dialogo nao
/// entende.
#[cfg(target_os = "windows")]
pub fn escolher_programa(caminho: &Path) -> AppResult<()> {
    use std::os::windows::process::CommandExt;

    std::process::Command::new("rundll32.exe")
        .raw_arg("shell32.dll,OpenAs_RunDLL")
        .raw_arg(para_mostrar(caminho))
        .spawn()
        .map(|_| ())
        .map_err(|cause| nao_abriu(caminho, cause))
}

#[cfg(not(target_os = "windows"))]
pub fn escolher_programa(caminho: &Path) -> AppResult<()> {
    abrir_com(caminho, "", None)
}

/// Abre o gerenciador de arquivos com o arquivo selecionado.
pub fn mostrar_na_pasta(caminho: &Path) -> AppResult<()> {
    tauri_plugin_opener::reveal_item_in_dir(caminho).map_err(|cause| nao_abriu(caminho, cause))
}

/// O caminho como a pessoa o escreveria.
///
/// No Windows, sem o `\\?\` que um caminho canonizado ganha: e o que a janela
/// de propriedades mostra e o que o `rundll32` recebe, e nenhum dos dois quer o
/// prefixo. Caminho de rede (`\\?\UNC\`) fica como esta.
pub fn para_mostrar(caminho: &Path) -> String {
    let texto = caminho.display().to_string();

    if cfg!(target_os = "windows") && !texto.starts_with(r"\\?\UNC\") {
        if let Some(resto) = texto.strip_prefix(r"\\?\") {
            return resto.to_string();
        }
    }

    texto
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn o_descritor_chega_da_tela_em_camel_case() {
        let asset: ArquivoDaGaleria =
            serde_json::from_str(r#"{"tipo":"asset","id":"abc"}"#).unwrap();
        assert!(matches!(asset, ArquivoDaGaleria::Asset { id } if id == "abc"));

        let anexo: ArquivoDaGaleria = serde_json::from_str(
            r#"{"tipo":"anexo","personagemId":"p1","autor":"jogador","arquivo":"mapa.png"}"#,
        )
        .unwrap();
        assert!(matches!(
            anexo,
            ArquivoDaGaleria::Anexo { personagem_id, autor: Autor::Jogador, arquivo }
                if personagem_id == "p1" && arquivo == "mapa.png"
        ));
    }

    #[test]
    fn caminho_comum_sai_como_entrou() {
        assert_eq!(para_mostrar(Path::new("/tmp/a b/c.png")), "/tmp/a b/c.png");
    }

    /// Um PNG de 2x3 de verdade: a medida tem de sair do cabecalho.
    fn png(largura: u32, altura: u32) -> Vec<u8> {
        let mut bytes = Vec::new();
        image::RgbaImage::new(largura, altura)
            .write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();
        bytes
    }

    fn campanha() -> (tempfile::TempDir, Vault, String) {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::create(dir.path().join("campanha"), "Campanha").unwrap();
        let personagem = characters::create(&vault, "Edgar").unwrap().id;
        (dir, vault, personagem)
    }

    #[test]
    fn lista_so_o_anexo_que_e_imagem_com_dono_e_medida() {
        let (_tmp, vault, edgar) = campanha();
        characters::write_anexo(&vault, &edgar, "mapa.png", &png(2, 3)).unwrap();
        characters::write_anexo(&vault, &edgar, "ficha.pdf", b"%PDF-1.4").unwrap();

        let lista = anexos(&vault).unwrap();

        assert_eq!(lista.len(), 1, "{lista:?}");
        assert_eq!(lista[0].arquivo, "mapa.png");
        assert_eq!(lista[0].personagem, "Edgar");
        assert_eq!(lista[0].autor, Autor::Jogador);
        assert_eq!((lista[0].largura, lista[0].altura), (Some(2), Some(3)));
        assert!(lista[0].modificado_em.is_some());
    }

    #[test]
    fn acha_o_anexo_de_quem_existe() {
        let (_tmp, vault, edgar) = campanha();
        characters::write_anexo(&vault, &edgar, "mapa.png", &png(1, 1)).unwrap();

        let (caminho, mime) = caminho(
            &vault,
            &ArquivoDaGaleria::Anexo {
                personagem_id: edgar,
                autor: Autor::Jogador,
                arquivo: "mapa.png".into(),
            },
        )
        .unwrap();

        assert!(caminho.is_file());
        assert_eq!(mime, "image/png");
    }

    /// O id do personagem monta a pasta, e um id com `..` levaria a pasta
    /// junto: so vale o personagem que a campanha tem.
    #[test]
    fn recusa_personagem_que_a_campanha_nao_tem() {
        let (_tmp, vault, edgar) = campanha();
        characters::write_anexo(&vault, &edgar, "mapa.png", &png(1, 1)).unwrap();

        let fora = ArquivoDaGaleria::Anexo {
            personagem_id: format!("../personagens/{edgar}"),
            autor: Autor::Jogador,
            arquivo: "mapa.png".into(),
        };

        assert!(caminho(&vault, &fora).is_err());
    }

    #[test]
    fn asset_que_nao_existe_e_erro_e_nao_caminho() {
        let (_tmp, vault, _) = campanha();

        assert!(caminho(&vault, &ArquivoDaGaleria::Asset { id: "nada".into() }).is_err());
    }
}
