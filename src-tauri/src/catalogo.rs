//! Instalar um plugin do catalogo: baixar o zip do repositorio no GitHub e
//! passar pelo mesmo `extensoes::importar` do botao Importar.
//!
//! Baixa aqui, e nao na webview, porque o `codeload.github.com`, que entrega o
//! zip, nao libera CORS para ela. A webview so le o `manifest.json` do
//! repositorio (o `raw.githubusercontent.com` libera) para saber a versao.
//!
//! O endereco do zip e montado AQUI a partir de `https://github.com/{dono}/{repo}`,
//! e a tela nunca passa uma URL para baixar: o comando nao vira um cliente HTTP
//! para qualquer lugar.

use std::io::{BufWriter, Cursor, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;

use zip::ZipArchive;

use crate::error::{AppError, AppResult};
use crate::extensoes::{self, Manifesto};

/// O maior zip que se baixa. O plugin de tema mais pesado de hoje tem 2 MB.
const TETO_DO_ZIP: u64 = 50 * 1024 * 1024;

/// O maximo que o zip pode virar no disco, contado no que SAI, e nao no que o
/// cabecalho promete: e o numero que uma bomba de zip mente.
const TETO_EXTRAIDO: u64 = 200 * 1024 * 1024;

const TETO_DE_ENTRADAS: usize = 5_000;

/// Do pedido ao ultimo byte. Um zip de plugin chega em segundos; um minuto
/// cobre rede ruim sem deixar o botao girando para sempre.
const PRAZO: Duration = Duration::from_secs(60);

/// `dono` e `repo` de `https://github.com/{dono}/{repo}`, com `/` ou `.git` no
/// fim tolerados. Qualquer outra coisa e `None`: o catalogo so aponta para a
/// raiz de um repositorio.
pub fn repositorio_do_github(url: &str) -> Option<(String, String)> {
    let caminho = url.strip_prefix("https://github.com/")?;
    let caminho = caminho.trim_end_matches('/');
    let caminho = caminho.strip_suffix(".git").unwrap_or(caminho);

    let (dono, repo) = caminho.split_once('/')?;

    let dono_ok = !dono.is_empty()
        && dono.len() <= 39
        && !dono.starts_with('-')
        && dono.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    let repo_ok = !repo.is_empty()
        && repo.len() <= 100
        && repo != "."
        && repo != ".."
        && repo
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));

    (dono_ok && repo_ok).then(|| (dono.to_string(), repo.to_string()))
}

/// O zip da branch principal, o mesmo do "Code → Download ZIP" do GitHub.
fn endereco_do_zip(dono: &str, repo: &str) -> String {
    format!("https://codeload.github.com/{dono}/{repo}/zip/HEAD")
}

/// Baixa o zip do repositorio, extrai numa pasta temporaria e importa.
///
/// Recusa o zip cujo manifesto tem outro id que o do card: importar sobrescreve
/// pelo id, e um repositorio que trouxesse o id de outro plugin apagaria o
/// plugin errado.
pub async fn instalar(dir: PathBuf, repositorio: String, id: String) -> AppResult<Manifesto> {
    let Some((dono, repo)) = repositorio_do_github(&repositorio) else {
        return Err(AppError::ExtensaoInvalida(crate::texto!(
            "o repositorio {repositorio} nao e um endereco do GitHub (https://github.com/dono/nome)",
            "the repository {repositorio} is not a GitHub address (https://github.com/owner/name)"
        )));
    };

    let bytes = baixar(&endereco_do_zip(&dono, &repo)).await?;

    tokio::task::spawn_blocking(move || {
        let temporaria = PastaTemporaria::nova(&id)?;
        let raiz = extrair(&bytes, &temporaria.0)?;

        let manifesto = extensoes::ler_manifesto(&raiz)?;
        if manifesto.id != id {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "o repositorio traz o plugin {}, e o catalogo esperava {id}",
                "the repository holds the plugin {}, and the catalog expected {id}",
                manifesto.id
            )));
        }

        extensoes::importar(&dir, &raiz)
    })
    .await
    .map_err(|causa| {
        AppError::Io(std::io::Error::other(format!(
            "tarefa morreu na thread: {causa}"
        )))
    })?
}

/// Um cliente so para a vida do aplicativo, criado no primeiro download.
fn cliente() -> AppResult<&'static reqwest::Client> {
    static CLIENTE: OnceLock<reqwest::Client> = OnceLock::new();

    if let Some(cliente) = CLIENTE.get() {
        return Ok(cliente);
    }

    // O reqwest vem sem provedor de criptografia (`rustls-no-provider`), o
    // mesmo arranjo do atualizador: instala o `ring` se ninguem instalou antes.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }

    let cliente = reqwest::Client::builder()
        .timeout(PRAZO)
        .user_agent(concat!("ATO20/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|causa| falha_de_rede(&causa))?;

    Ok(CLIENTE.get_or_init(|| cliente))
}

async fn baixar(url: &str) -> AppResult<Vec<u8>> {
    let mut resposta = cliente()?
        .get(url)
        .send()
        .await
        .map_err(|causa| falha_de_rede(&causa))?;

    let status = resposta.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(AppError::DownloadFalhou(crate::texto!(
            "o repositorio nao existe ou e privado",
            "the repository does not exist or is private"
        )));
    }
    if !status.is_success() {
        let codigo = status.as_u16();
        return Err(AppError::DownloadFalhou(crate::texto!(
            "o GitHub respondeu {codigo}",
            "GitHub answered {codigo}"
        )));
    }

    if resposta
        .content_length()
        .is_some_and(|tamanho| tamanho > TETO_DO_ZIP)
    {
        return Err(grande_demais());
    }

    let mut bytes = Vec::new();
    while let Some(pedaco) = resposta
        .chunk()
        .await
        .map_err(|causa| falha_de_rede(&causa))?
    {
        if (bytes.len() + pedaco.len()) as u64 > TETO_DO_ZIP {
            return Err(grande_demais());
        }
        bytes.extend_from_slice(&pedaco);
    }

    Ok(bytes)
}

fn falha_de_rede(causa: &reqwest::Error) -> AppError {
    if causa.is_timeout() {
        return AppError::DownloadFalhou(crate::texto!(
            "o GitHub demorou demais para responder",
            "GitHub took too long to answer"
        ));
    }

    AppError::DownloadFalhou(crate::texto!(
        "sem conexao com o GitHub ({causa})",
        "no connection to GitHub ({causa})"
    ))
}

fn grande_demais() -> AppError {
    let mb = TETO_DO_ZIP / 1024 / 1024;
    AppError::DownloadFalhou(crate::texto!(
        "o zip passa de {mb} MB",
        "the zip is over {mb} MB"
    ))
}

/// Extrai o zip em `destino` e devolve a pasta que tem o `manifest.json`.
///
/// O GitHub poe tudo dentro de uma pasta `repo-branch/`; um zip montado a mao
/// pode vir sem ela. Os dois servem.
///
/// As defesas sao as do import de campanha: `enclosed_name` contra zip-slip,
/// so componente normal no caminho, link simbolico pulado e teto contado no
/// que sai.
pub fn extrair(bytes: &[u8], destino: &Path) -> AppResult<PathBuf> {
    let mut arquivo = ZipArchive::new(Cursor::new(bytes)).map_err(zip_ilegivel)?;

    if arquivo.len() > TETO_DE_ENTRADAS {
        return Err(AppError::ExtensaoInvalida(crate::texto!(
            "o zip tem mais de {TETO_DE_ENTRADAS} arquivos",
            "the zip has more than {TETO_DE_ENTRADAS} files"
        )));
    }

    let mut total = 0u64;

    for i in 0..arquivo.len() {
        let mut entrada = arquivo.by_index(i).map_err(zip_ilegivel)?;

        let Some(relativo) = entrada.enclosed_name() else {
            log::warn!("catalogo: entrada {i} com nome inseguro, ignorada");
            continue;
        };
        if relativo
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
        {
            continue;
        }
        if entrada.is_symlink() {
            continue;
        }

        let alvo = destino.join(&relativo);

        if entrada.is_dir() {
            std::fs::create_dir_all(&alvo)?;
            continue;
        }
        if let Some(pai) = alvo.parent() {
            std::fs::create_dir_all(pai)?;
        }

        let mut saida = BufWriter::new(std::fs::File::create(&alvo)?);
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let lidos = entrada.read(&mut buffer)?;
            if lidos == 0 {
                break;
            }

            total += lidos as u64;
            if total > TETO_EXTRAIDO {
                let mb = TETO_EXTRAIDO / 1024 / 1024;
                return Err(AppError::ExtensaoInvalida(crate::texto!(
                    "o zip descompactado passa de {mb} MB",
                    "the unzipped content is over {mb} MB"
                )));
            }

            saida.write_all(&buffer[..lidos])?;
        }
        saida.flush()?;
    }

    raiz_do_plugin(destino)
}

fn raiz_do_plugin(destino: &Path) -> AppResult<PathBuf> {
    if destino.join("manifest.json").is_file() {
        return Ok(destino.to_path_buf());
    }

    let pastas: Vec<PathBuf> = std::fs::read_dir(destino)?
        .filter_map(Result::ok)
        .filter(|item| item.file_type().is_ok_and(|tipo| tipo.is_dir()))
        .map(|item| item.path())
        .collect();

    match pastas.as_slice() {
        [unica] if unica.join("manifest.json").is_file() => Ok(unica.clone()),
        _ => Err(AppError::ExtensaoInvalida(crate::texto!(
            "o repositorio nao tem manifest.json na raiz",
            "the repository has no manifest.json at its root"
        ))),
    }
}

fn zip_ilegivel(causa: zip::result::ZipError) -> AppError {
    AppError::ExtensaoInvalida(crate::texto!(
        "o zip baixado nao abre ({causa})",
        "the downloaded zip does not open ({causa})"
    ))
}

/// Uma pasta em `/tmp` que se apaga ao sair do escopo, deu certo ou nao.
struct PastaTemporaria(PathBuf);

impl PastaTemporaria {
    fn nova(id: &str) -> AppResult<Self> {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default();
        let nome: String = id
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
            .take(64)
            .collect();
        let pasta = std::env::temp_dir().join(format!("ato20-plugin-{nome}-{nanos}"));
        std::fs::create_dir_all(&pasta)?;

        Ok(Self(pasta))
    }
}

impl Drop for PastaTemporaria {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zip::write::SimpleFileOptions;

    fn zip_com(arquivos: &[(&str, &str)]) -> Vec<u8> {
        let mut bytes = Cursor::new(Vec::new());
        let mut escritor = zip::ZipWriter::new(&mut bytes);
        for (nome, conteudo) in arquivos {
            escritor
                .start_file(*nome, SimpleFileOptions::default())
                .unwrap();
            escritor.write_all(conteudo.as_bytes()).unwrap();
        }
        escritor.finish().unwrap();
        bytes.into_inner()
    }

    #[test]
    fn le_o_endereco_do_repositorio() {
        let par = |a: &str, b: &str| Some((a.to_string(), b.to_string()));

        assert_eq!(
            repositorio_do_github("https://github.com/valb-mig/ato20.obs.plugin"),
            par("valb-mig", "ato20.obs.plugin")
        );
        assert_eq!(
            repositorio_do_github("https://github.com/valb-mig/ato20.obs.plugin/"),
            par("valb-mig", "ato20.obs.plugin")
        );
        assert_eq!(
            repositorio_do_github("https://github.com/valb-mig/plugin.git"),
            par("valb-mig", "plugin")
        );
    }

    #[test]
    fn recusa_o_que_nao_e_raiz_de_repositorio() {
        for url in [
            "http://github.com/a/b",
            "https://gitlab.com/a/b",
            "https://github.com/a",
            "https://github.com/a/b/tree/main",
            "https://github.com/../b",
            "https://github.com/a/..",
            "https://github.com/-a/b",
            "https://github.com/a/b?x=1",
            "https://github.com.evil.com/a/b",
        ] {
            assert_eq!(repositorio_do_github(url), None, "{url}");
        }
    }

    #[test]
    fn tira_a_pasta_que_o_github_poe_em_volta() {
        let destino = tempfile::tempdir().unwrap();
        let zip = zip_com(&[
            ("plugin-HEAD/manifest.json", "{}"),
            ("plugin-HEAD/tema.css", ""),
        ]);

        let raiz = extrair(&zip, destino.path()).unwrap();

        assert_eq!(raiz, destino.path().join("plugin-HEAD"));
        assert!(raiz.join("tema.css").is_file());
    }

    #[test]
    fn aceita_o_manifesto_na_raiz_do_zip() {
        let destino = tempfile::tempdir().unwrap();
        let zip = zip_com(&[("manifest.json", "{}")]);

        assert_eq!(extrair(&zip, destino.path()).unwrap(), destino.path());
    }

    #[test]
    fn recusa_zip_sem_manifesto() {
        let destino = tempfile::tempdir().unwrap();
        let zip = zip_com(&[("a/README.md", ""), ("b/manifest.json", "{}")]);

        assert!(matches!(
            extrair(&zip, destino.path()),
            Err(AppError::ExtensaoInvalida(_))
        ));
    }

    #[test]
    fn nao_escreve_fora_da_pasta() {
        let fora = tempfile::tempdir().unwrap();
        let destino = fora.path().join("dentro");
        std::fs::create_dir_all(&destino).unwrap();
        let zip = zip_com(&[("../fugiu.txt", "x"), ("p/manifest.json", "{}")]);

        extrair(&zip, &destino).unwrap();

        assert!(!fora.path().join("fugiu.txt").exists());
    }
}
