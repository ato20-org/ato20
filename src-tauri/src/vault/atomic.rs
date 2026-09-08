use std::fs;
use std::io::Write;
use std::path::Path;

use crate::error::AppResult;

/// Grava por arquivo temporario e `rename`.
///
/// Nao e preciosismo. O board e gravado a cada 400ms de edicao, e um `write`
/// direto que e interrompido no meio -- bateria acabando, `kill`, disco cheio
/// -- deixa o arquivo truncado. Um `cenas/floresta.json` pela metade nao volta
/// a abrir, e a cena esta perdida sem nenhum aviso ate a proxima abertura.
///
/// `rename` no mesmo diretorio e atomico no POSIX e no NTFS: ou o arquivo
/// antigo continua inteiro, ou o novo esta inteiro. Nunca a mistura.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let parent = path.parent().unwrap_or(Path::new("."));
    fs::create_dir_all(parent)?;

    // O temporario fica no MESMO diretorio de proposito: `rename` entre
    // sistemas de arquivos diferentes nao e atomico, e `/tmp` costuma ser
    // outro ponto de montagem.
    let tmp = path.with_extension(format!(
        "{}.tmp-{}",
        path.extension().and_then(|e| e.to_str()).unwrap_or(""),
        std::process::id()
    ));

    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        // Sem o `sync_all` o `rename` pode chegar ao disco antes do conteudo,
        // e uma queda de energia nesse intervalo publica um arquivo vazio.
        file.sync_all()?;
    }

    fs::rename(&tmp, path)?;

    Ok(())
}

/// Grava um valor como JSON indentado.
///
/// Indentado e nao compacto porque o vault existe para ser lido e versionado:
/// um `ordem.json` numa linha unica faz o `git diff` de uma cena renomeada
/// mostrar o arquivo inteiro.
pub fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> AppResult<()> {
    let mut bytes = serde_json::to_vec_pretty(value).map_err(|cause| {
        crate::error::AppError::Malformed {
            file: path.display().to_string(),
            cause: cause.to_string(),
        }
    })?;
    bytes.push(b'\n');

    write_atomic(path, &bytes)
}

/// Le um JSON do vault. `None` quando o arquivo ainda nao existe.
///
/// Ausencia nao e erro: campanha nova nao tem `retratos.json`, e tratar isso
/// como falha obrigaria todo chamador a criar arquivo vazio antes de ler.
pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> AppResult<Option<T>> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(cause) if cause.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(cause) => return Err(cause.into()),
    };

    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|cause| crate::error::AppError::Malformed {
            file: path.display().to_string(),
            cause: cause.to_string(),
        })
}
