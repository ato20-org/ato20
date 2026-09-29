//! As configuracoes: um `configuracoes.json` da MAQUINA e um da CAMPANHA.
//!
//! E o par User/Workspace do VSCode. O da maquina fica ao lado do `ato20.db`,
//! no diretorio de configuracao do app; o da campanha fica na raiz da pasta
//! dela, e viaja no zip. Quem decide o que vale e a TELA: a campanha vence a
//! maquina, e a maquina vence o padrao -- ver `lib/configuracoes/registro.ts`.
//!
//! JSON OPACO, como a cena. O Rust nao conhece chave nenhuma: `ato20.zoom`,
//! `meu-plugin.cor` e o que vier depois sao a mesma coisa para ele, um objeto
//! que se le e se grava inteiro. Espelhar as chaves aqui obrigaria a mexer no
//! Rust a cada configuracao nova da tela ou de um plugin, para uma coisa que
//! so a tela le. A unica regra e a forma: a raiz e um objeto, e ele cabe em
//! 256 KB -- e o que impede um plugin de guardar um mapa dentro da
//! configuracao e fazer a abertura do aplicativo ler megabytes antes da porta.
//!
//! Arquivo e nao a tabela `prefs` do `ato20.db`, que existe e ninguem le. O
//! pedido era "como o VSCode": um arquivo que se abre no editor, se edita a
//! mao e se poe em backup. E a campanha ja e feita de arquivos assim.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::vault::atomic::{read_json, write_json};
use crate::vault::Vault;

/// O nome do arquivo, nos dois escopos.
pub const ARQUIVO: &str = "configuracoes.json";

/// O maior arquivo que se aceita gravar.
///
/// Ele e lido inteiro na abertura do aplicativo (maquina) e da campanha
/// (campanha), antes de a tela aparecer. Configuracao e um punhado de chaves
/// com numero, texto e booleano; 256 KB sao milhares delas.
pub const MAX_BYTES: usize = 256 * 1024;

/// O de que escopo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Escopo {
    Maquina,
    Campanha,
}

pub fn caminho_da_maquina(config_dir: &Path) -> PathBuf {
    config_dir.join(ARQUIVO)
}

pub fn caminho_da_campanha(vault: &Vault) -> PathBuf {
    vault.root.join(ARQUIVO)
}

/// Le o arquivo. Ausente e `{}`: ninguem configurou nada ainda.
///
/// Corrompido e erro, e nao `{}`: sobrescrever um arquivo que o mestre editou
/// a mao e errou uma virgula apagaria tudo o que ele escreveu. A tela mostra
/// o erro e segue com os padroes, sem gravar, ate alguem consertar.
pub fn ler(caminho: &Path) -> AppResult<Value> {
    Ok(read_json::<Value>(caminho)?.unwrap_or_else(|| Value::Object(Default::default())))
}

/// Grava o objeto inteiro, atomico como todo arquivo do vault.
pub fn gravar(caminho: &Path, valor: &Value) -> AppResult<()> {
    if !valor.is_object() {
        return Err(AppError::Malformed {
            file: ARQUIVO.to_string(),
            cause: "a raiz tem de ser um objeto".to_string(),
        });
    }

    let tamanho = serde_json::to_vec(valor)
        .map(|b| b.len())
        .unwrap_or(usize::MAX);
    if tamanho > MAX_BYTES {
        return Err(AppError::Malformed {
            file: ARQUIVO.to_string(),
            cause: format!("{tamanho} bytes; o teto e {MAX_BYTES}"),
        });
    }

    // O diretorio de configuracao pode nao existir na primeira gravacao: o
    // `ato20.db` o cria, mas a ordem entre os dois nao e garantida em quem
    // roda fora do aplicativo.
    if let Some(pai) = caminho.parent() {
        fs::create_dir_all(pai)?;
    }

    write_json(caminho, valor)
}

/// Garante que o arquivo exista, para "abrir no editor" ter o que abrir.
pub fn garantir(caminho: &Path) -> AppResult<()> {
    if caminho.exists() {
        return Ok(());
    }

    gravar(caminho, &Value::Object(Default::default()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ausente_e_um_objeto_vazio() {
        let base = tempfile::tempdir().unwrap();
        assert_eq!(
            ler(&caminho_da_maquina(base.path())).unwrap(),
            serde_json::json!({})
        );
    }

    #[test]
    fn ida_e_volta_preserva_o_que_o_rust_nao_conhece() {
        let base = tempfile::tempdir().unwrap();
        let caminho = caminho_da_maquina(base.path());
        let valor = serde_json::json!({
            "ato20.zoom": 1.25,
            "meu-plugin.cor": "#bd93f9",
            "meu-plugin.lista": [1, 2, 3],
        });

        gravar(&caminho, &valor).unwrap();

        // Opaco de verdade: chave que o Rust nunca viu sai igual a como entrou.
        assert_eq!(ler(&caminho).unwrap(), valor);
    }

    #[test]
    fn raiz_que_nao_e_objeto_e_recusada() {
        let base = tempfile::tempdir().unwrap();
        let caminho = caminho_da_maquina(base.path());

        assert!(matches!(
            gravar(&caminho, &serde_json::json!([1, 2])).unwrap_err(),
            AppError::Malformed { .. }
        ));
        assert!(!caminho.exists());
    }

    #[test]
    fn arquivo_grande_demais_e_recusado() {
        let base = tempfile::tempdir().unwrap();
        let caminho = caminho_da_maquina(base.path());
        let valor = serde_json::json!({ "x": "a".repeat(MAX_BYTES) });

        assert!(matches!(
            gravar(&caminho, &valor).unwrap_err(),
            AppError::Malformed { .. }
        ));
    }

    #[test]
    fn arquivo_corrompido_e_erro_e_nao_vazio() {
        let base = tempfile::tempdir().unwrap();
        let caminho = caminho_da_maquina(base.path());
        fs::write(&caminho, b"{ \"zoom\": 1,").unwrap();

        // Sobrescrever o que o mestre editou a mao apagaria o trabalho dele.
        assert!(matches!(
            ler(&caminho).unwrap_err(),
            AppError::Malformed { .. }
        ));
    }

    #[test]
    fn garantir_cria_um_objeto_vazio_uma_vez() {
        let base = tempfile::tempdir().unwrap();
        let caminho = caminho_da_maquina(base.path());

        garantir(&caminho).unwrap();
        gravar(&caminho, &serde_json::json!({ "a": 1 })).unwrap();
        garantir(&caminho).unwrap();

        // A segunda chamada nao apaga o que ja estava la.
        assert_eq!(ler(&caminho).unwrap(), serde_json::json!({ "a": 1 }));
    }
}
