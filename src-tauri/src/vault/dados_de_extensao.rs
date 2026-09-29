//! O que cada PLUGIN guarda em cada personagem: `personagens/{id}/_extensoes.json`.
//!
//! Arquivo por personagem, e nao um campo em `personagens.json`, pelo mesmo
//! motivo do inventario: o indice e reescrito inteiro -- e sincronizado no
//! disco -- a cada clique de medidor, e carregar dentro dele o guardado de N
//! plugins faria cada `+1` de vida regravar dado alheio. Aqui o plugin le sob
//! demanda, grava so o seu, e o indice nao sabe que ele existe.
//!
//! Duas metades por plugin, e a fronteira e a REDE. `privado` nunca sai do
//! Mestre: e onde mora a nota do mestre sobre o personagem, a iniciativa
//! secreta, o que o plugin nao quer que o jogador leia. `publico` e o que o
//! celular do DONO do personagem pode receber -- a habilidade que o jogador ve
//! na tela dele, o recurso que ele gasta. O daemon so entrega `publico`, e so
//! a quem esta vinculado ao personagem; ver `publicos`.
//!
//! JSON opaco, como a cena e as configuracoes: o formato e do plugin, e o
//! aplicativo nao le o que tem dentro. O unico limite e o tamanho, por plugin,
//! para um deles nao encher o disco do mestre nem fazer o celular baixar
//! megabytes ao abrir a ficha.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::atomic::{read_json, write_json};
use super::characters;
use super::Vault;
use crate::error::{AppError, AppResult};

const ARQUIVO: &str = "_extensoes.json";

/// O maior guardado de UM plugin num personagem, as duas metades somadas.
///
/// Sessenta e quatro KB e uma ficha inteira de qualquer sistema em JSON, com
/// folga. O que nao cabe e imagem -- e imagem vai para o acervo ou para os
/// anexos, que existem para isso.
pub const MAX_BYTES: usize = 64 * 1024;

/// As duas metades. Ausente no disco = `null` nas duas.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Guardado {
    #[serde(default)]
    pub privado: Value,
    #[serde(default)]
    pub publico: Value,
}

/// O arquivo inteiro: por id de extensao.
type Arquivo = BTreeMap<String, Guardado>;

fn path(vault: &Vault, personagem: &str) -> PathBuf {
    characters::dir(vault, personagem).join(ARQUIVO)
}

fn load(vault: &Vault, personagem: &str) -> AppResult<Arquivo> {
    Ok(read_json(&path(vault, personagem))?.unwrap_or_default())
}

fn save(vault: &Vault, personagem: &str, arquivo: &Arquivo) -> AppResult<()> {
    // A pasta do personagem so nasce quando algo e gravado nela, como no
    // inventario: `write_json` nao cria o pai.
    std::fs::create_dir_all(characters::dir(vault, personagem))?;

    write_json(&path(vault, personagem), arquivo)
}

/// O que uma extensao guardou num personagem. Nunca falha por ausencia.
pub fn ler(vault: &Vault, personagem: &str, extensao: &str) -> AppResult<Guardado> {
    Ok(load(vault, personagem)?
        .remove(extensao)
        .unwrap_or_default())
}

/// Grava uma ou as duas metades. `None` deixa a metade como esta.
///
/// Para APAGAR uma metade manda-se `Some(Value::Null)`; com as duas nulas a
/// entrada do plugin sai do arquivo, e um arquivo vazio e apagado. E o que
/// deixa desinstalar um plugin sem sobrar lixo em trinta pastas.
pub fn gravar(
    vault: &Vault,
    personagem: &str,
    extensao: &str,
    privado: Option<Value>,
    publico: Option<Value>,
) -> AppResult<Guardado> {
    let mut arquivo = load(vault, personagem)?;
    let mut atual = arquivo.remove(extensao).unwrap_or_default();

    if let Some(privado) = privado {
        atual.privado = privado;
    }
    if let Some(publico) = publico {
        atual.publico = publico;
    }

    let tamanho = serde_json::to_vec(&atual)
        .map(|b| b.len())
        .unwrap_or(usize::MAX);
    if tamanho > MAX_BYTES {
        return Err(AppError::Malformed {
            file: ARQUIVO.to_string(),
            cause: format!(
                "{extensao} quer guardar {tamanho} bytes no personagem; o teto e {MAX_BYTES}"
            ),
        });
    }

    if !(atual.privado.is_null() && atual.publico.is_null()) {
        arquivo.insert(extensao.to_string(), atual.clone());
    }

    if arquivo.is_empty() {
        let caminho = path(vault, personagem);
        if caminho.exists() {
            std::fs::remove_file(caminho)?;
        }
    } else {
        save(vault, personagem, &arquivo)?;
    }

    Ok(atual)
}

/// So a metade PUBLICA de cada plugin, para o celular do dono.
///
/// Uma funcao propria, e nao um filtro no chamador, pela razao de sempre: e o
/// unico caminho por onde este arquivo chega a rede, e a metade privada nao
/// pode depender de quem chamou lembrar de tira-la.
pub fn publicos(vault: &Vault, personagem: &str) -> AppResult<BTreeMap<String, Value>> {
    Ok(load(vault, personagem)?
        .into_iter()
        .filter(|(_, g)| !g.publico.is_null())
        .map(|(id, g)| (id, g.publico))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn vault() -> (tempfile::TempDir, Vault, String) {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::create(dir.path().join("campanha"), "Campanha").unwrap();
        let personagem = characters::create(&vault, "Edgar").unwrap().id;
        (dir, vault, personagem)
    }

    #[test]
    fn ausente_e_nulo_nas_duas_metades() {
        let (_d, vault, p) = vault();
        assert_eq!(ler(&vault, &p, "plug").unwrap(), Guardado::default());
    }

    #[test]
    fn ida_e_volta_e_opaca_e_por_plugin() {
        let (_d, vault, p) = vault();

        gravar(
            &vault,
            &p,
            "a",
            Some(json!({"iniciativa": 17})),
            Some(json!(["ataque"])),
        )
        .unwrap();
        gravar(&vault, &p, "b", Some(json!("segredo")), None).unwrap();

        let a = ler(&vault, &p, "a").unwrap();
        assert_eq!(a.privado, json!({"iniciativa": 17}));
        assert_eq!(a.publico, json!(["ataque"]));

        // O outro plugin nao ve nem mexe no guardado deste.
        let b = ler(&vault, &p, "b").unwrap();
        assert_eq!(b.privado, json!("segredo"));
        assert!(b.publico.is_null());
    }

    #[test]
    fn none_deixa_a_metade_como_esta() {
        let (_d, vault, p) = vault();

        gravar(&vault, &p, "a", Some(json!(1)), Some(json!(2))).unwrap();
        let depois = gravar(&vault, &p, "a", None, Some(json!(3))).unwrap();

        assert_eq!(depois.privado, json!(1));
        assert_eq!(depois.publico, json!(3));
    }

    #[test]
    fn publicos_nunca_levam_a_metade_privada() {
        let (_d, vault, p) = vault();

        gravar(
            &vault,
            &p,
            "a",
            Some(json!("nota do mestre")),
            Some(json!({"pa": 3})),
        )
        .unwrap();
        gravar(&vault, &p, "so-privado", Some(json!("segredo")), None).unwrap();

        let publicos = publicos(&vault, &p).unwrap();
        assert_eq!(publicos.get("a"), Some(&json!({"pa": 3})));
        // Plugin sem metade publica nem aparece: a ausencia e o que impede o
        // celular de saber que existe algo guardado.
        assert!(!publicos.contains_key("so-privado"));
        assert!(!serde_json::to_string(&publicos)
            .unwrap()
            .contains("segredo"));
    }

    #[test]
    fn nulo_nas_duas_apaga_a_entrada_e_o_arquivo_vazio() {
        let (_d, vault, p) = vault();

        gravar(&vault, &p, "a", Some(json!(1)), None).unwrap();
        assert!(path(&vault, &p).exists());

        gravar(&vault, &p, "a", Some(Value::Null), Some(Value::Null)).unwrap();
        assert!(!path(&vault, &p).exists());
    }

    #[test]
    fn grande_demais_e_recusado_sem_gravar() {
        let (_d, vault, p) = vault();

        gravar(&vault, &p, "a", Some(json!(1)), None).unwrap();
        let erro = gravar(&vault, &p, "a", Some(json!("x".repeat(MAX_BYTES))), None).unwrap_err();

        assert!(matches!(erro, AppError::Malformed { .. }));
        // O que estava la continua la.
        assert_eq!(ler(&vault, &p, "a").unwrap().privado, json!(1));
    }
}
