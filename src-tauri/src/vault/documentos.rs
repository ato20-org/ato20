use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use super::atomic::write_atomic;
use super::slug::{slugify_with_fallback, unique_file};
use super::Vault;
use crate::error::{AppError, AppResult};

/// Os documentos do quadro: arquivos `.md` soltos em `documentos/`.
///
/// Arquivo e nao campo da cena, de proposito: e Markdown, e Markdown existe
/// para ser aberto em outro editor. A cena guarda so o nome do arquivo, a
/// posicao e o tamanho do cartao -- ver `Documento` no TypeScript. O Rust nao
/// le o conteudo: grava e devolve bytes, como faz com a cena.
pub fn dir(vault: &Vault) -> PathBuf {
    vault.root.join("documentos")
}

/// So o nome do arquivo, sem caminho. Um `..` ou uma barra aqui sairia da
/// pasta da campanha, e o nome vem da cena, que e JSON editavel a mao.
fn caminho(vault: &Vault, arquivo: &str) -> AppResult<PathBuf> {
    let valido = !arquivo.is_empty()
        && arquivo.ends_with(".md")
        && !arquivo.contains('/')
        && !arquivo.contains('\\')
        && !arquivo.contains("..");
    if !valido {
        return Err(AppError::Malformed {
            file: arquivo.to_string(),
            cause: "nome de documento invalido".into(),
        });
    }
    Ok(dir(vault).join(arquivo))
}

/// Cria um documento vazio e devolve o nome do arquivo. O nome sai do titulo,
/// como o da cena, e nao muda quando o titulo muda: renomear nao move arquivo.
pub fn create(vault: &Vault, titulo: &str) -> AppResult<String> {
    let pasta = dir(vault);
    fs::create_dir_all(&pasta)?;

    let taken: HashSet<String> = fs::read_dir(&pasta)?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect();

    let arquivo = unique_file(&slugify_with_fallback(titulo, "documento"), "md", &taken);
    write_atomic(&pasta.join(&arquivo), b"")?;

    Ok(arquivo)
}

/// O texto inteiro. Arquivo que sumiu devolve vazio: o cartao continua no
/// quadro, e escrever nele recria o arquivo.
pub fn read(vault: &Vault, arquivo: &str) -> AppResult<String> {
    let path = caminho(vault, arquivo)?;
    match fs::read_to_string(&path) {
        Ok(texto) => Ok(texto),
        Err(cause) if cause.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(cause) => Err(cause.into()),
    }
}

/// As medidas de um documento, para a lista de Arquivos.
///
/// Contadas aqui e nao no TypeScript porque a lista quer tres numeros por
/// nota, e mandar o texto inteiro de cada `.md` pelo IPC so para contar
/// palavras na tela custaria a campanha toda a cada abertura do painel.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Medida {
    pub arquivo: String,
    /// Bytes no disco, como o acervo mostra o tamanho do arquivo.
    pub bytes: u64,
    pub linhas: usize,
    pub palavras: usize,
}

/// Mede TODOS os `.md` da pasta de uma vez. Pasta que ainda nao existe devolve
/// lista vazia: campanha nova nao tem documento nenhum.
pub fn medir(vault: &Vault) -> AppResult<Vec<Medida>> {
    let pasta = dir(vault);
    let entradas = match fs::read_dir(&pasta) {
        Ok(entradas) => entradas,
        Err(cause) if cause.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(cause) => return Err(cause.into()),
    };

    let mut medidas = Vec::new();
    for entrada in entradas.filter_map(|entrada| entrada.ok()) {
        let Ok(arquivo) = entrada.file_name().into_string() else {
            continue;
        };
        if !arquivo.ends_with(".md") {
            continue;
        }
        // Arquivo que sumiu ou nao e texto nao derruba a lista: as outras
        // notas continuam com as medidas delas.
        let Ok(texto) = fs::read_to_string(entrada.path()) else {
            continue;
        };
        medidas.push(Medida {
            arquivo,
            bytes: texto.len() as u64,
            linhas: texto.lines().count(),
            palavras: texto.split_whitespace().count(),
        });
    }

    Ok(medidas)
}

pub fn write(vault: &Vault, arquivo: &str, texto: &str) -> AppResult<()> {
    let path = caminho(vault, arquivo)?;
    write_atomic(&path, texto.as_bytes())
}

/// Apaga o arquivo. Ja nao existir nao e erro: o cartao foi removido, e e
/// isso que importa.
pub fn delete(vault: &Vault, arquivo: &str) -> AppResult<()> {
    let path = caminho(vault, arquivo)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(cause) if cause.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(cause) => Err(cause.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::Config;

    fn vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = Vault {
            root: dir.path().to_path_buf(),
            config: Config {
                versao: 1,
                nome: "t".into(),
                codigo: "c".into(),
                criada_em: 0,
            },
        };
        (dir, vault)
    }

    #[test]
    fn cria_le_grava_e_apaga() {
        let (_dir, vault) = vault();
        let arquivo = create(&vault, "Rede de PNJs").unwrap();
        assert_eq!(arquivo, "rede-de-pnjs.md");
        assert_eq!(read(&vault, &arquivo).unwrap(), "");

        write(&vault, &arquivo, "# Olá").unwrap();
        assert_eq!(read(&vault, &arquivo).unwrap(), "# Olá");

        let segundo = create(&vault, "Rede de PNJs").unwrap();
        assert_ne!(segundo, arquivo);

        delete(&vault, &arquivo).unwrap();
        assert_eq!(read(&vault, &arquivo).unwrap(), "");
        delete(&vault, &arquivo).unwrap();
    }

    #[test]
    fn mede_bytes_linhas_e_palavras() {
        let (_dir, vault) = vault();
        assert!(medir(&vault).unwrap().is_empty());

        let arquivo = create(&vault, "Rede").unwrap();
        write(&vault, &arquivo, "# Titulo\numa linha com cinco palavras\n").unwrap();

        let medidas = medir(&vault).unwrap();
        assert_eq!(medidas.len(), 1);
        assert_eq!(medidas[0].arquivo, arquivo);
        assert_eq!(medidas[0].bytes, 38);
        assert_eq!(medidas[0].linhas, 2);
        assert_eq!(medidas[0].palavras, 7);
    }

    #[test]
    fn recusa_nome_que_sai_da_pasta() {
        let (_dir, vault) = vault();
        assert!(read(&vault, "../config.json").is_err());
        assert!(read(&vault, "x/y.md").is_err());
        assert!(read(&vault, "sem-extensao").is_err());
    }
}
