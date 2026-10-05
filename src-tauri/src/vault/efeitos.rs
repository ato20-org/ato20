use std::path::PathBuf;

use serde_json::{Map, Value};

use super::atomic::{read_json, write_json};
use super::characters::efeito_valido;
use super::Vault;
use crate::error::{AppError, AppResult};

/// Os efeitos que a CAMPANHA criou: o fogo azul, a brasa que o mestre montou
/// no editor. A terceira fonte do catalogo, ao lado da fabrica e dos plugins
/// -- ver `lib/efeitos.ts`.
///
/// Mora em `efeitos.json` na raiz, ao lado de `condicoes.json` e pela mesma
/// razao: e da campanha, viaja no zip com ela, e nenhuma leitura da lista de
/// recentes quer saber de fogo.
///
/// O efeito e guardado como o editor o escreve, e o Rust confere so a CASCA:
/// o id, o titulo, a dica e o tamanho. Os numeros de cada camada -- tamanho,
/// quadros, velocidade -- quem prende e o TS, ao resolver o efeito para
/// desenhar, e o faz para todo efeito, venha de onde vier (ver
/// `resolverExterno`, `particulasDosEfeitos`). Validar camada por camada aqui
/// seria escrever a mesma regra duas vezes, e as duas divergiriam no primeiro
/// campo novo.
const ARQUIVO: &str = "efeitos.json";

/// O prefixo dos ids da campanha. O mesmo que o plugin `campanha` nao pode
/// usar -- ver `extensoes::PREFIXO_DA_CAMPANHA`.
const PREFIXO: &str = "campanha/";

/// Quantos efeitos cabem numa campanha. Trinta e dois: o seletor da condicao
/// e uma grade, e passando disso ela vira uma lista que ninguem le.
pub const MAX_EFEITOS: usize = 32;

/// O teto de um efeito gravado, em bytes. Folgado para todas as camadas com
/// texto de sobra; o que passa disso nao e efeito, e o arquivo viaja no quadro
/// declarativo para cada aparelho da mesa.
pub const MAX_BYTES: usize = 16 * 1024;

const MAX_TITULO: usize = 40;
const MAX_DICA: usize = 120;

fn path(vault: &Vault) -> PathBuf {
    vault.root.join(ARQUIVO)
}

/// O id tem a forma `campanha/{slug}`?
fn id_da_campanha(id: &str) -> bool {
    id.starts_with(PREFIXO) && efeito_valido(id)
}

/// Os efeitos da campanha. Campanha sem o arquivo nao tem nenhum. Entrada
/// torta -- editada a mao -- fica de fora na leitura, e o resto continua: um
/// efeito ruim nao derruba os outros.
pub fn load(vault: &Vault) -> AppResult<Vec<Value>> {
    let lidos: Vec<Value> = read_json(&path(vault))?.unwrap_or_default();

    Ok(lidos
        .into_iter()
        .filter(|efeito| {
            efeito
                .get("id")
                .and_then(Value::as_str)
                .is_some_and(id_da_campanha)
        })
        .collect())
}

fn save(vault: &Vault, efeitos: &[Value]) -> AppResult<()> {
    write_json(&path(vault), &efeitos)
}

fn erro(causa: String) -> AppError {
    AppError::Malformed {
        file: ARQUIVO.into(),
        cause: causa,
    }
}

/// Um efeito em branco, no fim da lista. O id sai sorteado e nunca muda --
/// renomear o efeito nao pode soltar as condicoes que o apontam.
pub fn criar(vault: &Vault) -> AppResult<Value> {
    let mut efeitos = load(vault)?;

    if efeitos.len() >= MAX_EFEITOS {
        return Err(erro(format!("a campanha ja tem {MAX_EFEITOS} efeitos")));
    }

    let id = loop {
        let sorteio = uuid::Uuid::new_v4().simple().to_string();
        let candidato = format!("{PREFIXO}{}", &sorteio[..8]);
        if !efeitos
            .iter()
            .any(|efeito| efeito.get("id").and_then(Value::as_str) == Some(&candidato))
        {
            break candidato;
        }
    };

    let mut novo = Map::new();
    novo.insert("id".into(), Value::String(id));
    novo.insert("titulo".into(), Value::String("Efeito novo".into()));
    let novo = Value::Object(novo);

    efeitos.push(novo.clone());
    save(vault, &efeitos)?;

    Ok(novo)
}

/// Grava o efeito inteiro, como o editor o tem, no lugar do que tinha o mesmo
/// id. Devolve como ficou: titulo e dica aparados.
pub fn salvar(vault: &Vault, efeito: Value) -> AppResult<Value> {
    let Value::Object(mut campos) = efeito else {
        return Err(erro("o efeito tem de ser um objeto".into()));
    };

    let id = campos
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| id_da_campanha(id))
        .map(str::to_string)
        .ok_or_else(|| erro("o efeito nao tem um id da campanha".into()))?;

    let titulo = campos
        .get("titulo")
        .and_then(Value::as_str)
        .map(|titulo| titulo.trim().chars().take(MAX_TITULO).collect::<String>())
        .filter(|titulo| !titulo.is_empty())
        .unwrap_or_else(|| "Efeito".to_string());
    campos.insert("titulo".into(), Value::String(titulo));

    match campos.get("dica").and_then(Value::as_str) {
        Some(dica) if !dica.trim().is_empty() => {
            let curta = dica.trim().chars().take(MAX_DICA).collect::<String>();
            campos.insert("dica".into(), Value::String(curta));
        }
        _ => {
            campos.remove("dica");
        }
    }

    // A origem e de quem resolve, e nao de quem grava: um efeito da campanha
    // tem sempre a do acervo. Gravada, ela poderia apontar para outro lugar.
    campos.remove("origem");

    let efeito = Value::Object(campos);
    let bytes = serde_json::to_vec(&efeito).map(|v| v.len()).unwrap_or(usize::MAX);
    if bytes > MAX_BYTES {
        return Err(erro(format!(
            "o efeito tem {} KB; o teto e {} KB",
            bytes / 1024,
            MAX_BYTES / 1024
        )));
    }

    let mut efeitos = load(vault)?;
    let lugar = efeitos
        .iter()
        .position(|atual| atual.get("id").and_then(Value::as_str) == Some(id.as_str()))
        .ok_or_else(|| erro(format!("a campanha nao tem o efeito {id}")))?;

    efeitos[lugar] = efeito.clone();
    save(vault, &efeitos)?;

    Ok(efeito)
}

/// Tira o efeito da campanha. As condicoes que o apontam ficam com o id, e
/// mostram so o selo -- a regra do efeito que a tela nao conhece.
pub fn apagar(vault: &Vault, id: &str) -> AppResult<()> {
    let efeitos = load(vault)?;
    let antes = efeitos.len();
    let restantes: Vec<Value> = efeitos
        .into_iter()
        .filter(|efeito| efeito.get("id").and_then(Value::as_str) != Some(id))
        .collect();

    if restantes.len() == antes {
        return Err(erro(format!("a campanha nao tem o efeito {id}")));
    }

    save(vault, &restantes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::create(dir.path().join("campanha"), "Campanha").unwrap();
        (dir, vault)
    }

    #[test]
    fn campanha_sem_arquivo_nao_tem_efeito() {
        let (_tmp, vault) = vault();

        assert!(load(&vault).unwrap().is_empty());
    }

    #[test]
    fn criar_da_um_efeito_em_branco_com_id_da_campanha() {
        let (_tmp, vault) = vault();
        let novo = criar(&vault).unwrap();
        let id = novo["id"].as_str().unwrap();

        assert!(id.starts_with("campanha/"));
        assert!(efeito_valido(id));
        assert_eq!(novo["titulo"], "Efeito novo");
        assert_eq!(load(&vault).unwrap().len(), 1);
    }

    #[test]
    fn salvar_grava_o_efeito_inteiro_e_apara_a_casca() {
        let (_tmp, vault) = vault();
        let id = criar(&vault).unwrap()["id"].as_str().unwrap().to_string();

        let salvo = salvar(
            &vault,
            json!({
                "id": id,
                "titulo": format!("  {}  ", "F".repeat(60)),
                "dica": "   ",
                "origem": { "plugin": "outro", "versao": "1" },
                "luz": { "raio": 2.5, "efeito": "fogo" },
            }),
        )
        .unwrap();

        assert_eq!(salvo["titulo"].as_str().unwrap().chars().count(), MAX_TITULO);
        assert!(salvo.get("dica").is_none());
        assert!(salvo.get("origem").is_none());
        assert_eq!(load(&vault).unwrap()[0]["luz"]["raio"], 2.5);
    }

    #[test]
    fn salvar_recusa_id_de_fora_efeito_que_nao_existe_e_efeito_gigante() {
        let (_tmp, vault) = vault();
        let id = criar(&vault).unwrap()["id"].as_str().unwrap().to_string();

        assert!(salvar(&vault, json!({ "id": "chamas", "titulo": "X" })).is_err());
        assert!(salvar(&vault, json!({ "id": "campanha/nao-existe", "titulo": "X" })).is_err());
        assert!(salvar(&vault, json!([1, 2])).is_err());
        assert!(salvar(&vault, json!({ "id": id, "dica": "x", "lixo": "y".repeat(MAX_BYTES) })).is_err());
    }

    #[test]
    fn o_teto_e_trinta_e_dois() {
        let (_tmp, vault) = vault();
        for _ in 0..MAX_EFEITOS {
            criar(&vault).unwrap();
        }

        assert!(criar(&vault).is_err());
    }

    #[test]
    fn apagar_tira_so_aquele() {
        let (_tmp, vault) = vault();
        let a = criar(&vault).unwrap()["id"].as_str().unwrap().to_string();
        let b = criar(&vault).unwrap()["id"].as_str().unwrap().to_string();

        apagar(&vault, &a).unwrap();

        let ids: Vec<String> = load(&vault)
            .unwrap()
            .iter()
            .map(|efeito| efeito["id"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(ids, vec![b]);
        assert!(apagar(&vault, &a).is_err());
    }

    #[test]
    fn entrada_torta_no_disco_fica_de_fora_e_o_resto_le() {
        let (_tmp, vault) = vault();
        let bom = criar(&vault).unwrap();
        std::fs::write(
            path(&vault),
            serde_json::to_string(&json!([bom, { "id": "chamas" }, 7, { "titulo": "sem id" }]))
                .unwrap(),
        )
        .unwrap();

        assert_eq!(load(&vault).unwrap(), vec![bom]);
    }
}
