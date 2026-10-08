//! As migracoes do formato da campanha, de uma versao para a seguinte.
//!
//! Rodam quando o mestre ABRE a campanha (`campaign_open`), e nao em todo
//! `Vault::open`: a lista de campanhas recentes abre cada uma para ler a capa,
//! e listar nao pode reescrever a pasta de ninguem.
//!
//! Cada passo e repetivel. O `config.json` so ganha a versao nova depois de o
//! passo terminar, entao o aplicativo que cair no meio roda o passo de novo na
//! proxima abertura -- e o passo tem de achar o que ja fez e nao fazer duas
//! vezes.

use std::collections::HashSet;

use serde_json::{json, Value};

use super::atomic::{read_json, write_json};
use super::board::Order;
use super::{assets, Vault};
use crate::error::AppResult;

/// O id da pasta "Biblioteca" que a migracao para a versao 2 cria.
///
/// Fixo, e nao sorteado: e por ele que a migracao repetida acha a pasta que ja
/// criou. Os outros ids sao uuid, e este nao colide com nenhum.
pub const PASTA_DA_BIBLIOTECA: &str = "acervo-biblioteca";

/// O nome do arquivo de pastas do acervo depois da migracao. Guardado, e nao
/// apagado: e a unica copia da arvore antiga se algo der errado.
const PASTAS_ANTIGAS: &str = "pastas.antigo.json";

/// Leva a campanha da versao `de` para a atual, passo a passo.
pub fn migrar(vault: &Vault, de: u32) -> AppResult<()> {
    if de < 2 {
        acervo_na_arvore(vault)?;
    }

    Ok(())
}

/// Versao 2: o acervo entra na arvore de Arquivos.
///
/// Ate a 1, o acervo tinha as pastas dele, num arquivo proprio, e Arquivos as
/// dele, no indice da campanha. Agora a arvore e uma so, e e a de Arquivos:
///
/// - uma pasta "Biblioteca" nasce na raiz, recolhida;
/// - cada pasta do acervo vira uma pasta da arvore dentro dela, com o MESMO
///   id -- o `folder_id` de cada arquivo continua valendo sem ser reescrito;
/// - o arquivo que estava solto na raiz do acervo vai para a Biblioteca, e o
///   que apontava para uma pasta que nao existe tambem.
///
/// O que tem dono (retrato, fundo de cena, imagem de efeito) e o som ficam
/// como estao: nao aparecem na arvore, e mover nao muda nada para eles.
///
/// Sem indice da campanha (`ordem.json`) nao ha onde guardar as pastas: a
/// campanha nunca teve o quadro gravado, e os arquivos aparecem na raiz da
/// arvore. O arquivo de pastas antigo fica onde esta.
fn acervo_na_arvore(vault: &Vault) -> AppResult<()> {
    let Some(mut ordem) = read_json::<Order>(&vault.order_path())? else {
        return Ok(());
    };

    let pastas_do_acervo = assets::folders(vault)?;
    let mut acervo = assets::index(vault)?;
    let entra = |asset: &assets::AssetMeta| asset.escopo.is_none() && asset.kind != "audio";

    let ids_do_acervo: HashSet<String> = pastas_do_acervo
        .iter()
        .map(|pasta| pasta.id.clone())
        .collect();

    if pastas_do_acervo.is_empty() && !acervo.iter().any(entra) {
        return guardar_pastas_antigas(vault);
    }

    // --- as pastas, no indice da campanha -------------------------------------

    let mut pastas = match ordem.pastas.take() {
        Some(Value::Array(pastas)) => pastas,
        _ => Vec::new(),
    };
    let ja_tem: HashSet<String> = pastas
        .iter()
        .filter_map(|pasta| pasta.get("id").and_then(Value::as_str).map(str::to_string))
        .collect();

    if !ja_tem.contains(PASTA_DA_BIBLIOTECA) {
        pastas.push(json!({
            "id": PASTA_DA_BIBLIOTECA,
            "nome": "Biblioteca",
            "recolhido": true,
        }));
    }

    for pasta in &pastas_do_acervo {
        if ja_tem.contains(&pasta.id) {
            continue;
        }

        // A mae que nao existe (pasta orfa no arquivo antigo) cai na
        // Biblioteca, e nao na raiz: o que era do acervo fica junto.
        let mae = pasta
            .parent_id
            .as_ref()
            .filter(|mae| ids_do_acervo.contains(*mae))
            .map_or(PASTA_DA_BIBLIOTECA, String::as_str);

        pastas.push(json!({
            "id": pasta.id,
            "nome": pasta.name,
            "parentId": mae,
            "recolhido": true,
        }));
    }

    ordem.pastas = Some(Value::Array(pastas));
    write_json(&vault.order_path(), &ordem)?;

    // --- os arquivos soltos, para a Biblioteca ---------------------------------

    let mut mudou = false;
    for asset in acervo.iter_mut().filter(|asset| entra(asset)) {
        let numa_pasta = asset
            .folder_id
            .as_ref()
            .is_some_and(|pasta| ids_do_acervo.contains(pasta));

        if !numa_pasta {
            asset.folder_id = Some(PASTA_DA_BIBLIOTECA.to_string());
            mudou = true;
        }
    }

    if mudou {
        assets::write_index(vault, &acervo)?;
    }

    guardar_pastas_antigas(vault)
}

/// Tira o arquivo de pastas do acervo do caminho, guardando-o ao lado.
fn guardar_pastas_antigas(vault: &Vault) -> AppResult<()> {
    let antigas = vault.folders_path();
    if antigas.exists() {
        std::fs::rename(&antigas, vault.root.join(PASTAS_ANTIGAS))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::Vault;

    /// Uma campanha da versao 1: acervo com pastas proprias e o indice com uma
    /// pasta de Arquivos que ja existia.
    fn campanha_v1(raiz: &std::path::Path, com_ordem: bool) -> Vault {
        let mut vault = Vault::create(raiz, "Lendas").unwrap();
        vault.config.versao = 1;
        write_json(&Vault::config_path(raiz), &vault.config).unwrap();

        if com_ordem {
            std::fs::write(
                vault.order_path(),
                r#"{"versao":1,"cenas":[],"editando":null,"noAr":null,
                    "pastas":[{"id":"p-arquivos","nome":"Sessao 1"}]}"#,
            )
            .unwrap();
        }

        std::fs::write(
            vault.folders_path(),
            r#"[{"id":"f-npc","name":"NPC","createdAt":1},
                {"id":"f-vila","name":"Vila","createdAt":2,"parentId":"f-npc"},
                {"id":"f-orfa","name":"Orfa","createdAt":3,"parentId":"sumiu"}]"#,
        )
        .unwrap();

        std::fs::write(
            vault.assets_index_path(),
            r#"[{"id":"a-solta","kind":"image","name":"poco.jpg","mimeType":"image/jpeg","size":1,"createdAt":1},
                {"id":"a-npc","kind":"image","name":"padre.png","mimeType":"image/png","size":1,"createdAt":2,"folderId":"f-npc"},
                {"id":"a-perdida","kind":"file","name":"regras.pdf","mimeType":"application/pdf","size":1,"createdAt":3,"folderId":"apagada"},
                {"id":"a-retrato","kind":"image","name":"r.png","mimeType":"image/png","size":1,"createdAt":4,"escopo":"personagem"},
                {"id":"a-som","kind":"audio","name":"tema.mp3","mimeType":"audio/mpeg","size":1,"createdAt":5}]"#,
        )
        .unwrap();

        vault
    }

    fn pastas(vault: &Vault) -> Vec<Value> {
        let ordem: Order = read_json(&vault.order_path()).unwrap().unwrap();
        match ordem.pastas {
            Some(Value::Array(pastas)) => pastas,
            _ => Vec::new(),
        }
    }

    fn pasta_de(vault: &Vault, id: &str) -> Option<String> {
        assets::index(vault)
            .unwrap()
            .into_iter()
            .find(|asset| asset.id == id)
            .and_then(|asset| asset.folder_id)
    }

    #[test]
    fn o_acervo_entra_na_biblioteca_com_as_mesmas_pastas() {
        let raiz = tempfile::tempdir().unwrap();
        let mut vault = campanha_v1(raiz.path(), true);

        vault.migrar().unwrap();

        let pastas = pastas(&vault);
        let por_id = |id: &str| pastas.iter().find(|p| p["id"] == id).cloned();

        // A pasta que ja era de Arquivos continua, e a Biblioteca nasce ao lado.
        assert!(por_id("p-arquivos").is_some());
        let biblioteca = por_id(PASTA_DA_BIBLIOTECA).unwrap();
        assert_eq!(biblioteca["nome"], "Biblioteca");
        assert_eq!(biblioteca["recolhido"], true);
        assert!(biblioteca.get("parentId").is_none());

        // Mesmo id, e a arvore preservada; a orfa cai na Biblioteca.
        assert_eq!(por_id("f-npc").unwrap()["parentId"], PASTA_DA_BIBLIOTECA);
        assert_eq!(por_id("f-vila").unwrap()["parentId"], "f-npc");
        assert_eq!(por_id("f-orfa").unwrap()["parentId"], PASTA_DA_BIBLIOTECA);

        // Solta e perdida vao para a Biblioteca; a que tinha pasta fica nela.
        assert_eq!(
            pasta_de(&vault, "a-solta").as_deref(),
            Some(PASTA_DA_BIBLIOTECA)
        );
        assert_eq!(
            pasta_de(&vault, "a-perdida").as_deref(),
            Some(PASTA_DA_BIBLIOTECA)
        );
        assert_eq!(pasta_de(&vault, "a-npc").as_deref(), Some("f-npc"));
        // Retrato e som nao entram na arvore.
        assert_eq!(pasta_de(&vault, "a-retrato"), None);
        assert_eq!(pasta_de(&vault, "a-som"), None);

        // O arquivo antigo guardado ao lado, e a versao nova gravada.
        assert!(!vault.folders_path().exists());
        assert!(raiz.path().join(PASTAS_ANTIGAS).exists());
        let config: crate::vault::Config = read_json(&Vault::config_path(raiz.path()))
            .unwrap()
            .unwrap();
        assert_eq!(config.versao, crate::vault::VAULT_VERSION);
    }

    #[test]
    fn repetir_a_migracao_nao_duplica_nada() {
        let raiz = tempfile::tempdir().unwrap();
        let vault = campanha_v1(raiz.path(), true);
        // O pior caso: o arquivo de pastas ainda la, como se o app tivesse
        // caido antes de guarda-lo.
        let antigas = std::fs::read(vault.folders_path()).unwrap();

        migrar(&vault, 1).unwrap();
        std::fs::write(vault.folders_path(), &antigas).unwrap();
        migrar(&vault, 1).unwrap();

        let ids: Vec<String> = pastas(&vault)
            .iter()
            .map(|p| p["id"].as_str().unwrap().to_string())
            .collect();
        let unicos: HashSet<&String> = ids.iter().collect();
        assert_eq!(ids.len(), unicos.len());
        assert_eq!(ids.len(), 5);
    }

    #[test]
    fn sem_indice_da_campanha_nada_muda() {
        let raiz = tempfile::tempdir().unwrap();
        let mut vault = campanha_v1(raiz.path(), false);

        vault.migrar().unwrap();

        assert!(read_json::<Order>(&vault.order_path()).unwrap().is_none());
        assert!(vault.folders_path().exists());
        assert_eq!(pasta_de(&vault, "a-solta"), None);
    }

    #[test]
    fn acervo_vazio_nao_cria_biblioteca() {
        let raiz = tempfile::tempdir().unwrap();
        let mut vault = campanha_v1(raiz.path(), true);
        std::fs::write(vault.assets_index_path(), "[]").unwrap();
        std::fs::remove_file(vault.folders_path()).unwrap();

        vault.migrar().unwrap();

        assert!(pastas(&vault)
            .iter()
            .all(|p| p["id"] != PASTA_DA_BIBLIOTECA));
    }

    #[test]
    fn campanha_nova_ja_nasce_na_versao_atual() {
        let raiz = tempfile::tempdir().unwrap();
        let mut vault = Vault::create(raiz.path(), "Nova").unwrap();
        assert_eq!(vault.config.versao, crate::vault::VAULT_VERSION);

        vault.migrar().unwrap();
        assert!(read_json::<Order>(&vault.order_path()).unwrap().is_none());
    }
}
