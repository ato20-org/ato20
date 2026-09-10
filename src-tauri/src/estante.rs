//! A estante: os livros de regras desta MAQUINA.

use std::path::{Path, PathBuf};

use crate::db::Livro;
use crate::error::{AppError, AppResult};
use crate::vault::{mime, now_ms};

/// Onde os livros ficam, dado o diretorio de dados do aplicativo.
///
/// Em `app_data_dir` e nao em `app_config_dir`, onde mora o `ato20.db`: um
/// manual de trezentas paginas e DADO, e diretorio de configuracao costuma
/// entrar em backup e sincronizacao que ninguem quer carregando oitenta
/// megabytes de PDF.
pub fn dir(base: &Path) -> PathBuf {
    base.join("estante")
}

/// O caminho de um livro, pelo id.
///
/// A extensao e sempre `.pdf` porque so PDF entra -- ver `import`. Isso torna o
/// caminho DERIVAVEL do id, pela mesma razao que o acervo derivava o dele: a
/// rota que serve o arquivo nao pode varrer o diretorio a cada requisicao.
pub fn path_for(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.pdf"))
}

/// O id tem a forma que a estante emite?
///
/// Trinta e dois digitos hexadecimais, que e o `Uuid::simple` de `import`. A
/// pergunta existe para a ROTA do daemon: o id dela vem da URL, e um id
/// arbitrario juntado a um diretorio e leitura de arquivo qualquer da maquina
/// do mestre -- a porta esta na rede local, nao so em loopback.
///
/// Checar a FORMA, e nao consultar o banco, e o que mantem o daemon sem handle
/// do `AppDb`. E suficiente: uma cadeia de 32 hexadecimais nao contem `/` nem
/// `..`, entao nao ha caminho para escapar do diretorio. Id bem formado que nao
/// existe no disco cai em 404, que e a mesma resposta.
pub fn id_valido(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// Copia um arquivo de fora para a estante.
///
/// Copia, e nao guarda o caminho de origem: o livro escolhido de um pendrive ou
/// de uma pasta que o mestre reorganiza depois viraria um vinculo morto, e a
/// falha apareceria no meio da sessao -- que e exatamente quando ele precisa
/// consultar a regra.
///
/// So PDF. O leitor e pdf.js, e aceitar um EPUB aqui daria um livro na estante
/// que nao abre; recusar na entrada e onde o mestre ainda tem o dialogo aberto
/// para escolher outro.
pub fn import(dir: &Path, origem: &Path) -> AppResult<Livro> {
    let nome = origem
        .file_name()
        .map(|nome| nome.to_string_lossy().to_string())
        .unwrap_or_default();

    let tipo = mime::from_name(&nome);
    if tipo != "application/pdf" {
        return Err(AppError::UnsupportedKind(tipo.to_string()));
    }

    std::fs::create_dir_all(dir)?;

    let id = uuid::Uuid::new_v4().simple().to_string();
    let destino = path_for(dir, &id);

    let tamanho = std::fs::copy(origem, &destino)?;

    Ok(Livro {
        id,
        // O nome do arquivo sem a extensao serve de titulo: e o que o mestre
        // reconhece. Renomear na estante nao existe nesta etapa -- quando
        // existir, o `titulo` e que muda, e `arquivo` continua dizendo de onde
        // o livro veio.
        titulo: origem
            .file_stem()
            .map(|nome| nome.to_string_lossy().to_string())
            .unwrap_or_else(|| nome.clone()),
        arquivo: nome,
        tamanho: tamanho as i64,
        paginas: None,
        pagina: 1,
        aberto_em: now_ms(),
    })
}

/// Apaga o arquivo do livro.
///
/// Arquivo que ja nao esta la nao e erro: o registro sair do banco e o que tira
/// o livro da estante, e falhar aqui deixaria uma linha impossivel de remover
/// pela tela.
pub fn remove(dir: &Path, id: &str) -> AppResult<()> {
    match std::fs::remove_file(path_for(dir, id)) {
        Ok(()) => Ok(()),
        Err(cause) if cause.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(cause) => Err(cause.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn so_pdf_entra() {
        // O tipo e recusado ANTES de o diretorio ser criado ou o arquivo lido,
        // entao um caminho que nao existe serve ao teste.
        let erro = import(
            &std::env::temp_dir().join("ato20-estante-teste"),
            Path::new("/tmp/livro.epub"),
        )
        .unwrap_err();

        assert!(matches!(erro, AppError::UnsupportedKind(_)));
    }

    #[test]
    fn id_da_estante_nao_escapa_do_diretorio() {
        assert!(id_valido(&uuid::Uuid::new_v4().simple().to_string()));

        // O que a rota tem de recusar antes de juntar ao diretorio.
        assert!(!id_valido("../../../etc/passwd"));
        assert!(!id_valido("../ato20.db"));
        assert!(!id_valido(""));
        // Do tamanho certo, mas fora do hexadecimal.
        assert!(!id_valido("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"));
    }
}
