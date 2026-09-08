use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::atomic::{read_json, write_json};
use super::{now_ms, Vault};
use crate::error::{AppError, AppResult};

/// Metadado de um arquivo do acervo. O binario fica em `assets/`.
///
/// `remoteAt` e `remoteRoomId` sairam junto com o Supabase: eles respondiam
/// "este arquivo ja subiu, e para qual sala", pergunta que nao existe mais
/// quando o arquivo mora no disco de quem opera.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetMeta {
    pub id: String,
    /// `image` ou `audio`.
    pub kind: String,
    pub name: String,
    pub mime_type: String,
    pub size: u64,
    pub created_at: i64,
    /// Medidas naturais. So existem para imagem.
    ///
    /// Lidas do CABECALHO do arquivo na importacao, sem decodificar (ver
    /// `import`). Ausencia e estado valido -- arquivo com cabecalho ilegivel
    /// entra sem medida, e a cena perde so a proporcao sugerida ao arrastar.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub natural_width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub natural_height: Option<u32>,
    /// Pasta em que o mestre guardou. Ausente = raiz.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
}

/// Pasta do acervo. So raiz, sem aninhamento.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetFolder {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

fn kind_for(mime: &str) -> AppResult<&'static str> {
    if mime.starts_with("image/") {
        Ok("image")
    } else if mime.starts_with("audio/") {
        Ok("audio")
    } else {
        Err(AppError::UnsupportedKind(mime.to_string()))
    }
}

/// Caminho do binario. Derivado do id e do tipo, nunca do nome que o usuario
/// deu -- nome de arquivo vindo de fora nao toca caminho.
pub fn asset_path(vault: &Vault, meta: &AssetMeta) -> PathBuf {
    vault
        .assets_dir()
        .join(format!("{}.{}", meta.id, super::mime::extension_for(&meta.mime_type)))
}

pub fn index(vault: &Vault) -> AppResult<Vec<AssetMeta>> {
    Ok(read_json(&vault.assets_index_path())?.unwrap_or_default())
}

fn write_index(vault: &Vault, assets: &[AssetMeta]) -> AppResult<()> {
    write_json(&vault.assets_index_path(), &assets)
}

/// O acervo, do mais novo para o mais velho.
pub fn list(vault: &Vault, kind: Option<&str>) -> AppResult<Vec<AssetMeta>> {
    let mut assets = index(vault)?;

    if let Some(kind) = kind {
        assets.retain(|asset| asset.kind == kind);
    }

    assets.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(assets)
}

pub fn find(vault: &Vault, id: &str) -> AppResult<Option<AssetMeta>> {
    Ok(index(vault)?.into_iter().find(|asset| asset.id == id))
}

/// Traz arquivos de fora para o acervo, copiando.
///
/// E o caminho do mestre importando imagem e som, e ele COPIA em vez de mover:
/// o arquivo escolhido e do usuario, esta na pasta dele, e provavelmente e
/// usado por outra coisa. Mover seria arrancar.
///
/// Substituiu o envio por HTTP, e a diferenca nao e so de gosto. Antes o
/// navegador lia o arquivo inteiro, mandava por multipart pelo loopback e o
/// daemon gravava -- tres travessias para o que o sistema de arquivos faz numa.
/// Um mapa de 80MB pagava isso todo, e o limite de corpo do axum cortava o
/// stream no meio.
///
/// As medidas saem do CABECALHO da imagem, sem decodificar. Elas eram medidas na
/// webview, o que fazia sentido enquanto o arquivo passava por la; agora ele
/// nunca chega ao navegador.
///
/// Devolve o que entrou e o motivo do que ficou de fora, em vez de falhar no
/// primeiro erro: quem escolheu doze arquivos e teve um recusado quer os onze e
/// quer saber qual.
pub fn import(vault: &Vault, origens: &[PathBuf]) -> AppResult<(Vec<AssetMeta>, Vec<String>)> {
    std::fs::create_dir_all(vault.assets_dir())?;

    let mut aceitos = Vec::new();
    let mut recusados = Vec::new();
    let mut indice = index(vault)?;

    for origem in origens {
        let nome = origem
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "arquivo".to_string());

        let mime_type = super::mime::from_name(&nome).to_string();

        let kind = match kind_for(&mime_type) {
            Ok(kind) => kind,
            Err(_) => {
                recusados.push(format!("{nome}: o acervo aceita imagem e som"));
                continue;
            }
        };

        let tamanho = match std::fs::metadata(origem) {
            Ok(meta) => meta.len(),
            Err(cause) => {
                recusados.push(format!("{nome}: {cause}"));
                continue;
            }
        };

        // So imagem tem medida, e ausencia nao impede a entrada: sem ela a cena
        // perde a proporcao sugerida ao arrastar, e o arquivo continua valendo.
        let (largura, altura) = if kind == "image" {
            match imagesize::size(origem) {
                Ok(medida) => (Some(medida.width as u32), Some(medida.height as u32)),
                Err(cause) => {
                    log::warn!("acervo: {nome} sem medidas legiveis: {cause}");
                    (None, None)
                }
            }
        } else {
            (None, None)
        };

        let meta = AssetMeta {
            id: uuid::Uuid::new_v4().to_string(),
            kind: kind.to_string(),
            name: nome.clone(),
            mime_type,
            size: tamanho,
            created_at: now_ms(),
            natural_width: largura,
            natural_height: altura,
            folder_id: None,
        };

        // Binario primeiro, indice depois -- mesma ordem de `adopt`, e pelo
        // mesmo motivo: o pior caso e um binario orfao, que nao aparece em
        // lista nenhuma, e nao uma linha apontando para o vazio.
        if let Err(cause) = std::fs::copy(origem, asset_path(vault, &meta)) {
            recusados.push(format!("{nome}: {cause}"));
            continue;
        }

        indice.push(meta.clone());
        aceitos.push(meta);
    }

    // Uma gravacao do indice para o lote inteiro, e nao uma por arquivo:
    // importar uma pasta de trinta mapas reescreveria o indice trinta vezes.
    if !aceitos.is_empty() {
        write_index(vault, &indice)?;
    }

    Ok((aceitos, recusados))
}

pub fn delete(vault: &Vault, id: &str) -> AppResult<()> {
    let mut assets = index(vault)?;

    let Some(position) = assets.iter().position(|asset| asset.id == id) else {
        return Ok(());
    };

    let meta = assets.remove(position);

    // Indice primeiro: se o `remove_file` falhar, o arquivo ja saiu da lista e
    // o mestre nao ve mais nada quebrado. O contrario deixaria uma linha
    // apontando para um binario que nao existe.
    write_index(vault, &assets)?;

    if let Err(cause) = std::fs::remove_file(asset_path(vault, &meta)) {
        if cause.kind() != std::io::ErrorKind::NotFound {
            log::warn!("acervo: {} saiu do indice mas o binario ficou: {cause}", meta.id);
        }
    }

    Ok(())
}

/// Move para uma pasta. `None` devolve a raiz. So metadado: o binario nao anda.
pub fn set_folder(vault: &Vault, id: &str, folder_id: Option<String>) -> AppResult<()> {
    let mut assets = index(vault)?;

    let Some(asset) = assets.iter_mut().find(|asset| asset.id == id) else {
        return Ok(());
    };

    asset.folder_id = folder_id;

    write_index(vault, &assets)
}

// --- pastas -----------------------------------------------------------------

/// Em ordem alfabetica: a lista e navegada com o olho, nao por recencia.
pub fn folders(vault: &Vault) -> AppResult<Vec<AssetFolder>> {
    let mut folders: Vec<AssetFolder> =
        read_json(&vault.folders_path())?.unwrap_or_default();

    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(folders)
}

pub fn create_folder(vault: &Vault, name: &str) -> AppResult<AssetFolder> {
    let folder = AssetFolder {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.trim().to_string(),
        created_at: now_ms(),
    };

    let mut all = folders(vault)?;
    all.push(folder.clone());
    write_json(&vault.folders_path(), &all)?;

    Ok(folder)
}

pub fn rename_folder(vault: &Vault, id: &str, name: &str) -> AppResult<()> {
    let mut all = folders(vault)?;

    let Some(folder) = all.iter_mut().find(|folder| folder.id == id) else {
        return Ok(());
    };

    folder.name = name.trim().to_string();

    write_json(&vault.folders_path(), &all)
}

/// Apaga a pasta e devolve o conteudo a raiz.
///
/// Nunca apaga arquivo: perder um mapa por um clique em "apagar pasta" seria
/// dano desproporcional ao gesto, e o arquivo e o que custou trabalho.
pub fn delete_folder(vault: &Vault, id: &str) -> AppResult<()> {
    let mut all = folders(vault)?;
    all.retain(|folder| folder.id != id);
    write_json(&vault.folders_path(), &all)?;

    let mut assets = index(vault)?;
    let mut touched = false;

    for asset in assets.iter_mut() {
        if asset.folder_id.as_deref() == Some(id) {
            asset.folder_id = None;
            touched = true;
        }
    }

    if touched {
        write_index(vault, &assets)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    fn campanha() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");

        (dir, vault)
    }

    /// Um PNG minimo de verdade, para o leitor de cabecalho ter o que ler.
    ///
    /// Bytes a mao em vez de um crate de imagem: o que se testa e que as
    /// medidas chegam ao indice, e para isso basta um cabecalho valido.
    fn png(largura: u32, altura: u32) -> Vec<u8> {
        let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        bytes.extend_from_slice(&13u32.to_be_bytes());
        bytes.extend_from_slice(b"IHDR");
        bytes.extend_from_slice(&largura.to_be_bytes());
        bytes.extend_from_slice(&altura.to_be_bytes());
        bytes.extend_from_slice(&[8, 6, 0, 0, 0]);
        bytes.extend_from_slice(&[0, 0, 0, 0]);

        bytes
    }

    /// Escreve um arquivo FORA da campanha, como o do usuario.
    fn de_fora(dir: &Path, nome: &str, conteudo: &[u8]) -> PathBuf {
        let origem = dir.join("de-fora");
        std::fs::create_dir_all(&origem).expect("origem");

        let caminho = origem.join(nome);
        std::fs::write(&caminho, conteudo).expect("arquivo");

        caminho
    }

    #[test]
    fn importar_copia_e_nao_move() {
        let (dir, vault) = campanha();
        let origem = de_fora(dir.path(), "mapa.png", &png(1920, 1080));

        let (aceitos, recusados) = import(&vault, &[origem.clone()]).expect("import");

        assert!(recusados.is_empty(), "{recusados:?}");
        assert_eq!(aceitos.len(), 1);

        // O arquivo e do usuario e provavelmente usado por outra coisa: mover
        // seria arrancar.
        assert!(origem.is_file(), "o original foi movido");
        assert!(asset_path(&vault, &aceitos[0]).is_file());
    }

    #[test]
    fn medidas_saem_do_cabecalho() {
        let (dir, vault) = campanha();
        let origem = de_fora(dir.path(), "mapa.png", &png(1920, 1080));

        let (aceitos, _) = import(&vault, &[origem]).expect("import");

        assert_eq!(aceitos[0].natural_width, Some(1920));
        assert_eq!(aceitos[0].natural_height, Some(1080));
        assert_eq!(aceitos[0].mime_type, "image/png");
        assert_eq!(aceitos[0].kind, "image");
    }

    #[test]
    fn audio_entra_sem_medida() {
        let (dir, vault) = campanha();
        let origem = de_fora(dir.path(), "trilha.ogg", b"nao e ogg de verdade");

        let (aceitos, recusados) = import(&vault, &[origem]).expect("import");

        assert!(recusados.is_empty(), "{recusados:?}");
        assert_eq!(aceitos[0].kind, "audio");
        assert_eq!(aceitos[0].natural_width, None);
    }

    #[test]
    fn imagem_com_cabecalho_ilegivel_entra_sem_medida() {
        let (dir, vault) = campanha();
        let origem = de_fora(dir.path(), "quebrada.png", b"isto nao e png");

        let (aceitos, recusados) = import(&vault, &[origem]).expect("import");

        // Ausencia de medida nao impede a entrada: a cena perde so a proporcao
        // sugerida ao arrastar, e o arquivo continua valendo.
        assert!(recusados.is_empty(), "{recusados:?}");
        assert_eq!(aceitos.len(), 1);
        assert_eq!(aceitos[0].natural_width, None);
    }

    #[test]
    fn caminho_vem_do_id_e_nao_do_nome_do_arquivo() {
        let (dir, vault) = campanha();
        // Nome hostil de um arquivo escolhido no dialogo.
        let origem = de_fora(dir.path(), "..-mapa.png", &png(10, 10));

        let (aceitos, _) = import(&vault, &[origem]).expect("import");
        let caminho = asset_path(&vault, &aceitos[0]);

        assert_eq!(caminho.parent(), Some(vault.assets_dir().as_path()));
        assert!(caminho
            .file_name()
            .expect("nome")
            .to_string_lossy()
            .starts_with(&aceitos[0].id));
    }

    #[test]
    fn lote_com_um_recusado_traz_o_resto_e_o_motivo() {
        let (dir, vault) = campanha();

        let bom = de_fora(dir.path(), "mapa.png", &png(100, 100));
        let ruim = de_fora(dir.path(), "livro.pdf", b"%PDF");
        let som = de_fora(dir.path(), "trilha.mp3", b"som");

        let (aceitos, recusados) = import(&vault, &[bom, ruim, som]).expect("import");

        // Quem escolheu tres e teve um recusado quer os dois e quer saber qual.
        assert_eq!(aceitos.len(), 2);
        assert_eq!(recusados.len(), 1);
        assert!(recusados[0].contains("livro.pdf"), "{recusados:?}");
        assert_eq!(list(&vault, None).expect("list").len(), 2);
    }

    #[test]
    fn arquivo_que_nao_existe_nao_derruba_o_lote() {
        let (dir, vault) = campanha();
        let bom = de_fora(dir.path(), "mapa.png", &png(10, 10));

        let (aceitos, recusados) =
            import(&vault, &[bom, dir.path().join("sumiu.png")]).expect("import");

        assert_eq!(aceitos.len(), 1);
        assert_eq!(recusados.len(), 1);
    }

    #[test]
    fn lista_filtra_por_tipo_e_ordena_do_mais_novo() {
        let (dir, vault) = campanha();

        let a = de_fora(dir.path(), "a.png", &png(10, 10));
        import(&vault, &[a]).expect("a");
        std::thread::sleep(std::time::Duration::from_millis(5));

        let b = de_fora(dir.path(), "b.png", &png(10, 10));
        let t = de_fora(dir.path(), "t.ogg", b"som");
        import(&vault, &[b, t]).expect("b");

        let imagens = list(&vault, Some("image")).expect("list");
        assert_eq!(imagens.len(), 2);
        assert_eq!(imagens[0].name, "b.png", "o mais novo vem primeiro");
        assert_eq!(list(&vault, Some("audio")).expect("list").len(), 1);
    }

    #[test]
    fn apagar_tira_do_indice_e_do_disco() {
        let (dir, vault) = campanha();
        let origem = de_fora(dir.path(), "mapa.png", &png(10, 10));

        let (aceitos, _) = import(&vault, &[origem]).expect("import");
        delete(&vault, &aceitos[0].id).expect("delete");

        assert!(list(&vault, None).expect("list").is_empty());
        assert!(!asset_path(&vault, &aceitos[0]).exists());
    }

    #[test]
    fn apagar_pasta_devolve_o_conteudo_a_raiz() {
        let (dir, vault) = campanha();

        let pasta = create_folder(&vault, "Mapas").expect("folder");
        let origem = de_fora(dir.path(), "mapa.png", &png(10, 10));
        let (aceitos, _) = import(&vault, &[origem]).expect("import");
        let id = aceitos[0].id.clone();

        set_folder(&vault, &id, Some(pasta.id.clone())).expect("move");
        assert_eq!(
            find(&vault, &id).expect("find").expect("meta").folder_id,
            Some(pasta.id.clone())
        );

        delete_folder(&vault, &pasta.id).expect("delete folder");

        // Nunca apaga arquivo: perder um mapa por um clique em "apagar pasta"
        // seria dano desproporcional ao gesto.
        let ainda = find(&vault, &id).expect("find").expect("meta");
        assert_eq!(ainda.folder_id, None);
        assert!(asset_path(&vault, &ainda).exists());
        assert!(folders(&vault).expect("folders").is_empty());
    }

    #[test]
    fn pastas_saem_em_ordem_alfabetica() {
        let (_dir, vault) = campanha();

        create_folder(&vault, "Retratos").expect("f");
        create_folder(&vault, "mapas").expect("f");
        create_folder(&vault, "Fichas").expect("f");

        let nomes: Vec<String> =
            folders(&vault).expect("folders").into_iter().map(|f| f.name).collect();
        assert_eq!(nomes, vec!["Fichas", "mapas", "Retratos"]);
    }
}
