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
    fn recusa_nome_que_sai_da_pasta() {
        let (_dir, vault) = vault();
        assert!(read(&vault, "../config.json").is_err());
        assert!(read(&vault, "x/y.md").is_err());
        assert!(read(&vault, "sem-extensao").is_err());
    }
}
