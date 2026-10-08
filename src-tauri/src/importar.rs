//! A leitura do que se importa de fora: uma pasta de notas, um vault do
//! Obsidian, ou arquivos soltos, para a campanha aberta.
//!
//! So LE. Quem decide o que cada arquivo vira -- nota, imagem do acervo,
//! quadro -- e o TypeScript, em `src/lib/obsidian/`: o indice das notas e as
//! pastas de Arquivos moram no store da tela, e uma escrita daqui por baixo
//! dele deixaria a sessao aberta sem ver nada ate recarregar.
//!
//! A pasta e do usuario, escolhida no seletor, e pode ser qualquer uma -- o
//! vault nao precisa ter `.obsidian`, uma pasta de markdown solta tambem
//! serve. Por isso os tetos: quem aponta o `$HOME` por engano recebe uma
//! recusa em vez de um aplicativo parado lendo cem mil arquivos.

use std::path::Path;

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::texto;
use crate::vault::mime;

/// Quantos arquivos o vault pode ter, contando so os que entram.
pub const MAX_ARQUIVOS: usize = 5000;

/// O maior `.md` ou `.canvas` que se le. Acima disto nao e nota, e o arquivo
/// entra na lista dos ignorados.
pub const MAX_TEXTO: u64 = 2 * 1024 * 1024;

/// Uma nota ou um board: o caminho relativo ao vault, com `/`, e o texto.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ArquivoDeTexto {
    pub caminho: String,
    pub texto: String,
}

/// Um anexo: imagem, som, video ou PDF. So o caminho -- quem copia e o
/// `asset_import`, de disco para disco.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct Anexo {
    /// Relativo ao vault, com `/`: e ele que espelha as pastas no acervo.
    pub caminho: String,
    /// O caminho inteiro, para o `asset_import`.
    pub absoluto: String,
}

/// O que a pasta ou os arquivos tem, ja separado.
#[derive(Debug, Serialize)]
pub struct Leitura {
    /// O nome da pasta: e o da pasta que recebe o import. Vazio quando sao
    /// arquivos soltos, que entram na raiz. Ver `ler_arquivos`.
    pub nome: String,
    /// A pasta tem `.obsidian`: e um vault. A tela avisa quando o mestre pediu
    /// um vault e escolheu uma pasta comum -- importa igual, mas ele confere.
    pub obsidian: bool,
    pub notas: Vec<ArquivoDeTexto>,
    pub boards: Vec<ArquivoDeTexto>,
    pub anexos: Vec<Anexo>,
    /// Relativos, com `/`: o que existe e nao entra -- tipo desconhecido ou
    /// texto grande demais. A tela conta quantos, para o resumo nao mentir.
    pub ignorados: Vec<String>,
}

/// O anexo e o que o acervo sabe mostrar ou tocar: imagem, som, video e PDF.
/// O resto de um vault -- CSS de tema, script, JSON de plugin -- nao e conteudo
/// da campanha.
fn e_anexo(nome: &str) -> bool {
    let tipo = mime::from_name(nome);

    tipo.starts_with("image/")
        || tipo.starts_with("audio/")
        || tipo.starts_with("video/")
        || tipo == "application/pdf"
}

impl Leitura {
    fn nova(nome: String, obsidian: bool) -> Self {
        Self {
            nome,
            obsidian,
            notas: Vec::new(),
            boards: Vec::new(),
            anexos: Vec::new(),
            ignorados: Vec::new(),
        }
    }

    /// Poe um arquivo na lista certa, ou na dos ignorados.
    ///
    /// `contados` e o teto: so conta o que entra, e o arquivo que passa dele
    /// recusa a leitura inteira em vez de importar metade.
    fn classificar(
        &mut self,
        caminho: &Path,
        relativo: String,
        tamanho: u64,
        contados: &mut usize,
    ) -> AppResult<()> {
        let nome = caminho
            .file_name()
            .map(|nome| nome.to_string_lossy().into_owned())
            .unwrap_or_default();
        let extensao = nome.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
        let de_texto = nome.contains('.') && (extensao == "md" || extensao == "canvas");

        if !de_texto && !e_anexo(&nome) {
            self.ignorados.push(relativo);
            return Ok(());
        }

        *contados += 1;
        if *contados > MAX_ARQUIVOS {
            return Err(AppError::PastaInvalida(texto!(
                "Sao mais de {} arquivos para importar. Escolha a pasta das notas, e nao uma acima dela.",
                "That is more than {} files to import. Pick the notes folder, not one above it.",
                MAX_ARQUIVOS
            )));
        }

        if !de_texto {
            self.anexos.push(Anexo {
                caminho: relativo,
                absoluto: caminho.to_string_lossy().into_owned(),
            });
            return Ok(());
        }

        if tamanho > MAX_TEXTO {
            self.ignorados.push(relativo);
            return Ok(());
        }

        // Sem recusar o que nao e UTF-8: uma nota de outra codificacao chega
        // com o caractere estranho trocado, e nao some.
        let bytes = std::fs::read(caminho)?;
        let arquivo = ArquivoDeTexto {
            caminho: relativo,
            texto: String::from_utf8_lossy(&bytes).into_owned(),
        };

        if extensao == "md" {
            self.notas.push(arquivo);
        } else {
            self.boards.push(arquivo);
        }

        Ok(())
    }
}

/// Le uma pasta inteira: um vault do Obsidian ou uma pasta qualquer de notas.
///
/// Pula tudo o que comeca com ponto -- `.obsidian`, `.git`, `.trash`, os
/// ocultos do sistema -- e todo link simbolico: um link para a pasta de cima
/// faria a varredura andar em circulo. A ordem e a alfabetica, para a mesma
/// pasta virar sempre a mesma arvore.
pub fn ler_pasta(raiz: &Path) -> AppResult<Leitura> {
    if !raiz.is_dir() {
        return Err(AppError::PastaInvalida(texto!(
            "{} nao e uma pasta.",
            "{} is not a folder.",
            raiz.display()
        )));
    }

    let nome = raiz
        .file_name()
        .map(|nome| nome.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Importado".to_string());

    let mut leitura = Leitura::nova(nome, raiz.join(".obsidian").is_dir());
    let mut contados = 0usize;
    let mut pendentes = vec![raiz.to_path_buf()];

    while let Some(pasta) = pendentes.pop() {
        let mut entradas = std::fs::read_dir(&pasta)?
            .filter_map(Result::ok)
            .collect::<Vec<_>>();
        entradas.sort_by_key(|entrada| entrada.file_name());

        // As subpastas entram na pilha de tras para frente: a `pop` as tira
        // na ordem alfabetica.
        let mut subpastas = Vec::new();

        for entrada in entradas {
            if entrada.file_name().to_string_lossy().starts_with('.') {
                continue;
            }

            let caminho = entrada.path();
            let Ok(meta) = std::fs::symlink_metadata(&caminho) else {
                continue;
            };
            if meta.file_type().is_symlink() {
                continue;
            }
            if meta.is_dir() {
                subpastas.push(caminho);
                continue;
            }

            let relativo = relativo(raiz, &caminho);
            leitura.classificar(&caminho, relativo, meta.len(), &mut contados)?;
        }

        pendentes.extend(subpastas.into_iter().rev());
    }

    Ok(leitura)
}

/// Le arquivos soltos, escolhidos um a um no seletor.
///
/// Sem pasta: o `nome` vazio diz a tela que nada se espelha -- a nota entra na
/// raiz de Arquivos e o anexo na raiz do acervo. O caminho de cada um e so o
/// nome do arquivo; dois de mesmo nome vindos de pastas diferentes ganham um
/// prefixo, para um nao tomar o lugar do outro.
pub fn ler_arquivos(caminhos: &[String]) -> AppResult<Leitura> {
    let mut leitura = Leitura::nova(String::new(), false);
    let mut contados = 0usize;
    let mut usados = std::collections::HashSet::new();

    for caminho in caminhos {
        let caminho = Path::new(caminho);
        let Ok(meta) = std::fs::metadata(caminho) else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }

        let nome = caminho
            .file_name()
            .map(|nome| nome.to_string_lossy().into_owned())
            .unwrap_or_default();
        let mut relativo = nome.clone();
        let mut repetido = 1;
        while !usados.insert(relativo.to_lowercase()) {
            repetido += 1;
            relativo = format!("{repetido}/{nome}");
        }

        leitura.classificar(caminho, relativo, meta.len(), &mut contados)?;
    }

    Ok(leitura)
}

/// O que um caminho arrastado do sistema e, para a tela dizer antes de soltar.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct Identidade {
    pub caminho: String,
    pub nome: String,
    /// `pasta`, `vault` (pasta com `.obsidian`) ou `arquivo`.
    pub tipo: &'static str,
}

/// Diz o que cada caminho e, sem ler nada dentro.
///
/// E o que roda enquanto o arquivo ainda esta no ar sobre o painel: o tipo do
/// caminho e a existencia do `.obsidian`, duas perguntas ao sistema por item.
/// Ler a pasta inteira aqui seria fazer o import duas vezes, e a primeira com
/// o mestre esperando o rotulo aparecer. O caminho que sumiu fica de fora.
pub fn identificar(caminhos: &[String]) -> Vec<Identidade> {
    caminhos
        .iter()
        .filter_map(|caminho| {
            let alvo = Path::new(caminho);
            let meta = std::fs::metadata(alvo).ok()?;
            let nome = alvo
                .file_name()
                .map(|nome| nome.to_string_lossy().into_owned())
                .unwrap_or_else(|| caminho.clone());
            let tipo = if !meta.is_dir() {
                "arquivo"
            } else if alvo.join(".obsidian").is_dir() {
                "vault"
            } else {
                "pasta"
            };

            Some(Identidade {
                caminho: caminho.clone(),
                nome,
                tipo,
            })
        })
        .collect()
}

/// O caminho relativo ao vault, com `/` em qualquer sistema: e a chave com que
/// o TypeScript cruza o `![[...]]` com o anexo e espelha as pastas.
fn relativo(raiz: &Path, caminho: &Path) -> String {
    caminho
        .strip_prefix(raiz)
        .unwrap_or(caminho)
        .components()
        .map(|parte| parte.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn escrever(raiz: &Path, caminho: &str, conteudo: &[u8]) {
        let alvo = raiz.join(caminho);
        std::fs::create_dir_all(alvo.parent().unwrap()).unwrap();
        std::fs::write(alvo, conteudo).unwrap();
    }

    #[test]
    fn separa_notas_boards_e_anexos_em_ordem() {
        let raiz = tempfile::tempdir().unwrap();
        let raiz = raiz.path();
        escrever(raiz, "Personagens/Npc/Padre.md", b"**Idade:** 73");
        escrever(raiz, "Mapa.canvas", br#"{"nodes":[],"edges":[]}"#);
        escrever(raiz, "Imagens/Poco.jpg", b"jpg");
        escrever(raiz, "Historia.md", b"# Historia");
        escrever(raiz, "Trilha/tema.mp3", b"mp3");

        let leitura = ler_pasta(raiz).unwrap();

        let notas: Vec<_> = leitura
            .notas
            .iter()
            .map(|nota| nota.caminho.as_str())
            .collect();
        assert_eq!(notas, ["Historia.md", "Personagens/Npc/Padre.md"]);
        assert_eq!(leitura.notas[1].texto, "**Idade:** 73");
        assert_eq!(leitura.boards[0].caminho, "Mapa.canvas");

        let anexos: Vec<_> = leitura
            .anexos
            .iter()
            .map(|anexo| anexo.caminho.as_str())
            .collect();
        assert_eq!(anexos, ["Imagens/Poco.jpg", "Trilha/tema.mp3"]);
        assert!(Path::new(&leitura.anexos[0].absoluto).is_absolute());
    }

    #[test]
    fn pula_o_oculto_e_lista_o_que_nao_entra() {
        let raiz = tempfile::tempdir().unwrap();
        let raiz = raiz.path();
        escrever(raiz, ".obsidian/plugins/x/main.js", b"js");
        escrever(raiz, ".git/HEAD", b"ref");
        escrever(raiz, ".oculta.md", b"nao");
        escrever(raiz, "script.sh", b"echo");
        escrever(raiz, "Nota.md", b"sim");

        let leitura = ler_pasta(raiz).unwrap();

        assert_eq!(leitura.notas.len(), 1);
        assert_eq!(leitura.ignorados, ["script.sh"]);
        // Tem `.obsidian`: e um vault.
        assert!(leitura.obsidian);
    }

    #[test]
    fn arquivos_soltos_entram_pelo_nome_e_o_repetido_ganha_prefixo() {
        let raiz = tempfile::tempdir().unwrap();
        let raiz = raiz.path();
        escrever(raiz, "a/Nota.md", b"um");
        escrever(raiz, "b/nota.md", b"dois");
        escrever(raiz, "b/foto.png", b"png");
        escrever(raiz, "b/script.sh", b"echo");

        let caminhos: Vec<String> = [
            "a/Nota.md",
            "b/nota.md",
            "b/foto.png",
            "b/script.sh",
            "nao-existe.md",
        ]
        .iter()
        .map(|c| raiz.join(c).to_string_lossy().into_owned())
        .collect();
        let leitura = ler_arquivos(&caminhos).unwrap();

        assert_eq!(leitura.nome, "");
        assert!(!leitura.obsidian);
        let notas: Vec<_> = leitura
            .notas
            .iter()
            .map(|nota| nota.caminho.as_str())
            .collect();
        assert_eq!(notas, ["Nota.md", "2/nota.md"]);
        assert_eq!(leitura.notas[1].texto, "dois");
        assert_eq!(leitura.anexos[0].caminho, "foto.png");
        assert_eq!(leitura.ignorados, ["script.sh"]);
    }

    #[test]
    fn texto_que_nao_e_utf8_chega_trocado_e_nao_some() {
        let raiz = tempfile::tempdir().unwrap();
        escrever(raiz.path(), "Latin1.md", b"caf\xe9");

        let leitura = ler_pasta(raiz.path()).unwrap();

        assert_eq!(leitura.notas[0].texto, "caf\u{fffd}");
    }

    #[test]
    fn identifica_pasta_vault_e_arquivo_sem_ler_dentro() {
        let raiz = tempfile::tempdir().unwrap();
        let raiz = raiz.path();
        escrever(raiz, "Lendas/.obsidian/app.json", b"{}");
        escrever(raiz, "Fotos/a.png", b"png");
        escrever(raiz, "solta.md", b"x");

        let caminhos: Vec<String> = ["Lendas", "Fotos", "solta.md", "sumiu"]
            .iter()
            .map(|c| raiz.join(c).to_string_lossy().into_owned())
            .collect();
        let tipos: Vec<_> = identificar(&caminhos)
            .into_iter()
            .map(|identidade| (identidade.nome, identidade.tipo))
            .collect();

        assert_eq!(
            tipos,
            [
                ("Lendas".to_string(), "vault"),
                ("Fotos".to_string(), "pasta"),
                ("solta.md".to_string(), "arquivo"),
            ]
        );
    }

    #[test]
    fn recusa_o_que_nao_e_pasta() {
        let raiz = tempfile::tempdir().unwrap();
        let arquivo = raiz.path().join("solto.md");
        std::fs::write(&arquivo, b"x").unwrap();

        assert!(matches!(
            ler_pasta(&arquivo),
            Err(AppError::PastaInvalida(_))
        ));
    }
}
