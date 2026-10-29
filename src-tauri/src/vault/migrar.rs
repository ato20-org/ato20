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

use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use super::atomic::{read_json, write_json};
use super::board::Order;
use super::characters::{self, Autor};
use super::inventory::{self, Entrada};
use super::itens::{self, Imagem, Item};
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

/// O inventario da versao 2, guardado ao lado do novo em cada personagem.
///
/// Pela razao do `pastas.antigo.json`: e a unica copia dos itens como eram se a
/// conversao errar, e um arquivo pequeno por personagem custa menos que a
/// mochila de alguem perdida sem volta. Fica fora do pacote -- ver
/// `pacote::exportar` --, e viaja no zip da campanha inteira como o resto.
pub const INVENTARIO_ANTIGO: &str = "_inventario.antigo.json";

/// Leva a campanha da versao `de` para a atual, passo a passo.
pub fn migrar(vault: &Vault, de: u32) -> AppResult<()> {
    if de < 2 {
        acervo_na_arvore(vault)?;
    }

    if de < 3 {
        itens_da_campanha(vault)?;
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

/// Versao 3: o item sai do inventario e vai para o catalogo da campanha.
///
/// Ate a 2, `personagens/{id}/_inventario.json` guardava os itens INTEIROS.
/// Agora o item mora em `itens.json`, na raiz, e o inventario guarda uma
/// entrada por item -- o id, a quantidade e o escondido daquele inventario. Ver
/// `itens`.
///
/// Cada item antigo vira um item do catalogo com o MESMO id: cena, ponto de
/// mapa ou plugin que ja o citava continua citando. A foto do jogador continua
/// no arquivo onde estava, e a imagem passa a dizer em que personagem ela mora.
/// Nenhum arquivo se move.
///
/// So os personagens do INDICE: uma pasta orfa nao e lida por ninguem, e
/// adotar os itens dela poria no catalogo do mestre coisas que ele nunca viu.
///
/// Repetivel: o catalogo e gravado ANTES dos inventarios, e o inventario que
/// ja esta na forma nova e pulado. Quem cair entre um e outro roda de novo,
/// acha no catalogo os itens que ja gravou -- iguais, porque a conversao e
/// deterministica -- e nao os duplica.
///
/// Um inventario ilegivel nao segura a campanha fechada: fica como esta, com um
/// aviso no log, e a ficha dele mostra o erro que ja mostrava antes.
fn itens_da_campanha(vault: &Vault) -> AppResult<()> {
    let _vez = itens::travar();

    let mut catalogo = itens::load(vault)?;
    let mut convertidos = Vec::new();

    for personagem in characters::todos_os_ids(vault)? {
        let caminho = characters::dir(vault, &personagem).join(inventory::ARQUIVO);

        let valor = match read_json::<Value>(&caminho) {
            Ok(Some(valor)) => valor,
            Ok(None) => continue,
            Err(cause) => {
                log::warn!("inventario de {personagem} fica como esta: {cause}");
                continue;
            }
        };

        if let Some(entradas) = converter_inventario(&personagem, &valor, &mut catalogo) {
            convertidos.push((personagem, caminho, entradas));
        }
    }

    if convertidos.is_empty() {
        return Ok(());
    }

    itens::save(vault, &catalogo)?;

    for (personagem, caminho, entradas) in convertidos {
        // A copia ANTES de reescrever, e so a primeira: quem cair entre a
        // copia e a gravacao roda de novo e acharia o mesmo arquivo antigo, mas
        // a copia que vale e a de antes de qualquer tentativa.
        let guardado = characters::dir(vault, &personagem).join(INVENTARIO_ANTIGO);
        if !guardado.exists() {
            std::fs::copy(&caminho, &guardado)?;
        }

        inventory::save(vault, &personagem, &entradas)?;
    }

    Ok(())
}

/// O item como a versao 2 o gravava, dentro do inventario.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItemAntigo {
    id: String,
    nome: String,
    #[serde(default)]
    descricao: String,
    #[serde(default)]
    imagem: Option<ImagemAntiga>,
    #[serde(default)]
    quantidade: Option<u32>,
    autor: Autor,
    #[serde(default)]
    escondido: bool,
    #[serde(rename = "criadoEm", default)]
    criado_em: i64,
}

/// A imagem da versao 2: o anexo nao dizia de que personagem era, porque so
/// podia ser do dono do inventario.
#[derive(Debug, Deserialize)]
#[serde(tag = "tipo", rename_all = "lowercase")]
enum ImagemAntiga {
    Asset { id: String },
    Anexo { autor: Autor, arquivo: String },
}

/// Um elemento do inventario na forma da versao 2: tem nome e nao tem
/// `itemId`. A entrada nova tem `itemId` e nunca nome.
fn forma_antiga(valor: &Value) -> bool {
    valor.get("nome").is_some() && valor.get("itemId").is_none()
}

/// Converte um inventario da versao 2, se for um: poe os itens no `catalogo` e
/// devolve as entradas que apontam para eles. `None` quando nao ha nada a
/// converter -- inventario vazio ou ja na forma nova.
///
/// Fora do passo da migracao porque o PACOTE tambem precisa dela: um pacote
/// exportado por um ATO20 de antes, ou uma campanha da versao 2 aberta como
/// pacote, traz o inventario na forma antiga. Ver `pacote::Fonte::ler`.
///
/// Um mesmo id em dois personagens acontece: importar um personagem de pacote
/// na MESMA campanha copiava o inventario com os ids. Copias iguais viram UM
/// item, que e o que "item e item" quer; copias que divergiram -- a foto de
/// cada uma mora numa pasta, o jogador de cada uma editou -- viram dois, e a
/// segunda ganha um id derivado do original e do personagem. Derivado, e nao
/// sorteado, para a migracao repetida achar a copia que ja fez. Ver
/// `id_da_copia`.
pub(crate) fn converter_inventario(
    personagem: &str,
    valor: &Value,
    catalogo: &mut Vec<Item>,
) -> Option<Vec<Entrada>> {
    let lista = valor.as_array()?;
    if !lista.iter().any(forma_antiga) {
        return None;
    }

    let mut entradas: Vec<Entrada> = Vec::with_capacity(lista.len());

    for elemento in lista {
        let entrada = if forma_antiga(elemento) {
            let antigo = match serde_json::from_value::<ItemAntigo>(elemento.clone()) {
                Ok(antigo) => antigo,
                Err(cause) => {
                    log::warn!(
                        "item ilegivel no inventario de {personagem} ficou de fora: {cause}"
                    );
                    continue;
                }
            };

            let item = Item {
                id: antigo.id,
                nome: antigo.nome,
                descricao: antigo.descricao,
                imagem: antigo.imagem.map(|imagem| match imagem {
                    ImagemAntiga::Asset { id } => Imagem::Asset { id },
                    ImagemAntiga::Anexo { autor, arquivo } => Imagem::Anexo {
                        personagem: personagem.to_string(),
                        autor,
                        arquivo,
                    },
                }),
                // A versao 2 nao tinha nem um nem outro.
                atributos: Vec::new(),
                medidores: Vec::new(),
                autor: antigo.autor,
                // Na versao 2 o jogador so criava pelo proprio personagem, e o
                // item so saia dali pelas maos do mestre: o dono do inventario
                // e por onde ele nasceu.
                criado_por: (antigo.autor == Autor::Jogador).then(|| personagem.to_string()),
                tags: Vec::new(),
                aura: None,
                compendio: false,
                do_plugin: None,
                criado_em: antigo.criado_em,
            };

            Entrada {
                item_id: no_catalogo(catalogo, item, personagem),
                quantidade: antigo.quantidade.unwrap_or(1).max(1),
                escondido: antigo.escondido,
                adicionado_em: antigo.criado_em,
                medidores: Default::default(),
            }
        } else {
            match serde_json::from_value::<Entrada>(elemento.clone()) {
                Ok(entrada) => entrada,
                Err(cause) => {
                    log::warn!(
                        "entrada ilegivel no inventario de {personagem} ficou de fora: {cause}"
                    );
                    continue;
                }
            }
        };

        // Duas linhas do mesmo item no mesmo inventario viram uma, somada: o
        // resto do modulo procura a entrada pelo id e acharia so a primeira.
        match entradas.iter_mut().find(|ja| ja.item_id == entrada.item_id) {
            Some(ja) => ja.quantidade = ja.quantidade.saturating_add(entrada.quantidade),
            None => entradas.push(entrada),
        }
    }

    Some(entradas)
}

/// Poe o item no catalogo, se ainda nao estiver, e devolve o id com que ficou.
fn no_catalogo(catalogo: &mut Vec<Item>, item: Item, personagem: &str) -> String {
    match catalogo.iter().find(|ja| ja.id == item.id) {
        None => {
            let id = item.id.clone();
            catalogo.push(item);
            id
        }
        // A migracao repetida, ou a mesma coisa em duas mochilas.
        Some(ja) if *ja == item => item.id,
        Some(_) => {
            let id = id_da_copia(&item.id, personagem);
            if !catalogo.iter().any(|ja| ja.id == id) {
                catalogo.push(Item {
                    id: id.clone(),
                    ..item
                });
            }
            id
        }
    }
}

/// O id da copia divergente de um item, no formato de um uuid.
///
/// Do hash do id original com o personagem, e nao sorteado: a migracao que
/// cair no meio roda de novo, e tem de chegar ao MESMO id para achar a copia
/// que ja gravou em vez de fazer outra. No formato de uuid para nao ser o unico
/// id do catalogo que a tela estranha.
fn id_da_copia(id: &str, personagem: &str) -> String {
    let digest = Sha256::digest(format!("{id}/{personagem}").as_bytes());
    let hex: String = digest[..16]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();

    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
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

    // --- versao 3: os itens da campanha -----------------------------------

    /// Uma campanha da versao 2 com dois personagens: o Edgar com um item do
    /// mestre (imagem do acervo, escondido) e um do jogador (foto anexada), e a
    /// Mira sem inventario nenhum. Devolve os ids dos dois.
    fn campanha_v2(raiz: &std::path::Path) -> (Vault, String, String) {
        let mut vault = Vault::create(raiz, "Lendas").unwrap();
        vault.config.versao = 2;
        write_json(&Vault::config_path(raiz), &vault.config).unwrap();

        let edgar = characters::create(&vault, "Edgar").unwrap().id;
        let mira = characters::create(&vault, "Mira").unwrap().id;
        characters::write_anexo(&vault, &edgar, "espada.png", b"png").unwrap();

        std::fs::write(
            characters::dir(&vault, &edgar).join(inventory::ARQUIVO),
            r#"[{"id":"i-elmo","nome":"Elmo","descricao":"runico","imagem":{"tipo":"asset","id":"a-elmo"},
                 "quantidade":1,"autor":"mestre","escondido":true,"criadoEm":10},
                {"id":"i-espada","nome":"Espada","imagem":{"tipo":"anexo","autor":"jogador","arquivo":"espada.png"},
                 "quantidade":3,"autor":"jogador","escondido":false,"criadoEm":20}]"#,
        )
        .unwrap();

        (vault, edgar, mira)
    }

    fn catalogo(vault: &Vault) -> Vec<Item> {
        itens::load(vault).unwrap()
    }

    #[test]
    fn o_item_sai_do_inventario_e_vai_para_o_catalogo() {
        let raiz = tempfile::tempdir().unwrap();
        let (mut vault, edgar, mira) = campanha_v2(raiz.path());

        vault.migrar().unwrap();

        // O mesmo id: o que ja citava o item continua citando.
        let itens = catalogo(&vault);
        assert_eq!(itens.len(), 2);
        let elmo = itens.iter().find(|item| item.id == "i-elmo").unwrap();
        assert_eq!(elmo.nome, "Elmo");
        assert_eq!(elmo.descricao, "runico");
        assert_eq!(
            elmo.imagem,
            Some(Imagem::Asset {
                id: "a-elmo".into()
            })
        );
        assert_eq!(elmo.autor, Autor::Mestre);
        assert_eq!(elmo.criado_por, None);
        assert_eq!(elmo.criado_em, 10);

        // A foto continua onde estava, e a imagem passa a dizer de quem.
        let espada = itens.iter().find(|item| item.id == "i-espada").unwrap();
        assert_eq!(
            espada.imagem,
            Some(Imagem::Anexo {
                personagem: edgar.clone(),
                autor: Autor::Jogador,
                arquivo: "espada.png".into(),
            })
        );
        assert_eq!(espada.criado_por.as_deref(), Some(edgar.as_str()));
        assert!(characters::anexo_caminho(&vault, &edgar, Autor::Jogador, "espada.png").is_file());

        // O inventario de antes fica ao lado, intacto.
        let guardado = characters::dir(&vault, &edgar).join(INVENTARIO_ANTIGO);
        assert!(std::fs::read_to_string(&guardado).unwrap().contains("\"nome\":\"Elmo\""));

        // Quantidade e escondido ficam na entrada.
        assert_eq!(
            inventory::load(&vault, &edgar).unwrap(),
            vec![
                Entrada {
                    item_id: "i-elmo".into(),
                    quantidade: 1,
                    escondido: true,
                    adicionado_em: 10,
                    medidores: Default::default(),
                },
                Entrada {
                    item_id: "i-espada".into(),
                    quantidade: 3,
                    escondido: false,
                    adicionado_em: 20,
                    medidores: Default::default(),
                },
            ]
        );

        // Quem nao tinha inventario continua sem, e a foto segue fora da aba
        // de Arquivos.
        assert!(!characters::dir(&vault, &mira)
            .join(inventory::ARQUIVO)
            .exists());
        assert_eq!(
            itens::anexos_usados(&vault, &edgar).unwrap(),
            vec![(Autor::Jogador, "espada.png".to_string())]
        );
        let config: crate::vault::Config = read_json(&Vault::config_path(raiz.path()))
            .unwrap()
            .unwrap();
        assert_eq!(config.versao, 3);
    }

    #[test]
    fn repetir_a_migracao_dos_itens_nao_duplica() {
        let raiz = tempfile::tempdir().unwrap();
        let (vault, edgar, _) = campanha_v2(raiz.path());
        let caminho = characters::dir(&vault, &edgar).join(inventory::ARQUIVO);
        let antigo = std::fs::read(&caminho).unwrap();

        migrar(&vault, 2).unwrap();
        let primeira = (catalogo(&vault), std::fs::read(&caminho).unwrap());

        // De novo, como se nada tivesse acontecido: o inventario ja esta na
        // forma nova e e pulado.
        migrar(&vault, 2).unwrap();
        assert_eq!(catalogo(&vault), primeira.0);
        assert_eq!(std::fs::read(&caminho).unwrap(), primeira.1);

        // O pior caso: o app caiu depois de gravar o catalogo e antes do
        // inventario. O catalogo ja tem os itens, e nao os ganha de novo.
        std::fs::write(&caminho, &antigo).unwrap();
        migrar(&vault, 2).unwrap();
        assert_eq!(catalogo(&vault), primeira.0);
        assert_eq!(std::fs::read(&caminho).unwrap(), primeira.1);
    }

    #[test]
    fn copias_do_mesmo_item_em_duas_mochilas() {
        let raiz = tempfile::tempdir().unwrap();
        let (vault, _, mira) = campanha_v2(raiz.path());

        // A Mira veio de um pacote importado na mesma campanha: os ids do
        // inventario vieram junto. O elmo e igual; a espada tem a foto noutra
        // pasta e foi renomeada.
        characters::write_anexo(&vault, &mira, "espada.png", b"png").unwrap();
        std::fs::write(
            characters::dir(&vault, &mira).join(inventory::ARQUIVO),
            r#"[{"id":"i-elmo","nome":"Elmo","descricao":"runico","imagem":{"tipo":"asset","id":"a-elmo"},
                 "quantidade":2,"autor":"mestre","escondido":false,"criadoEm":10},
                {"id":"i-espada","nome":"Espada da Mira","imagem":{"tipo":"anexo","autor":"jogador","arquivo":"espada.png"},
                 "quantidade":1,"autor":"jogador","escondido":false,"criadoEm":20}]"#,
        )
        .unwrap();

        migrar(&vault, 2).unwrap();

        // O elmo igual vira um item so, com uma quantidade em cada mochila; a
        // espada que divergiu vira duas.
        let itens = catalogo(&vault);
        assert_eq!(itens.len(), 3);
        let da_mira = inventory::load(&vault, &mira).unwrap();
        assert_eq!(da_mira[0].item_id, "i-elmo");
        assert_eq!(da_mira[0].quantidade, 2);
        let copia = itens
            .iter()
            .find(|item| item.id == da_mira[1].item_id)
            .unwrap();
        assert_ne!(copia.id, "i-espada");
        assert_eq!(copia.nome, "Espada da Mira");
        assert_eq!(copia.criado_por.as_deref(), Some(mira.as_str()));

        // E repetir chega ao mesmo id da copia, sem fazer outra.
        let caminho = characters::dir(&vault, &mira).join(inventory::ARQUIVO);
        std::fs::write(
            &caminho,
            r#"[{"id":"i-espada","nome":"Espada da Mira","imagem":{"tipo":"anexo","autor":"jogador","arquivo":"espada.png"},
                 "quantidade":1,"autor":"jogador","escondido":false,"criadoEm":20}]"#,
        )
        .unwrap();
        migrar(&vault, 2).unwrap();
        assert_eq!(catalogo(&vault).len(), 3);
        assert_eq!(inventory::load(&vault, &mira).unwrap()[0].item_id, copia.id);
    }

    #[test]
    fn pasta_fora_do_indice_e_inventario_ilegivel_ficam_como_estao() {
        let raiz = tempfile::tempdir().unwrap();
        let (mut vault, edgar, mira) = campanha_v2(raiz.path());

        let orfa = vault.root.join("personagens").join("orfa");
        std::fs::create_dir_all(&orfa).unwrap();
        let antigo =
            r#"[{"id":"i-orfa","nome":"Bussola","quantidade":1,"autor":"mestre","criadoEm":1}]"#;
        std::fs::write(orfa.join(inventory::ARQUIVO), antigo).unwrap();
        std::fs::create_dir_all(characters::dir(&vault, &mira)).unwrap();
        std::fs::write(
            characters::dir(&vault, &mira).join(inventory::ARQUIVO),
            "{ isto nao e json",
        )
        .unwrap();

        vault.migrar().unwrap();

        // A campanha abre, o Edgar foi convertido, e o resto nao foi tocado.
        assert_eq!(inventory::load(&vault, &edgar).unwrap().len(), 2);
        assert!(catalogo(&vault).iter().all(|item| item.id != "i-orfa"));
        assert_eq!(
            std::fs::read_to_string(orfa.join(inventory::ARQUIVO)).unwrap(),
            antigo
        );
    }

    #[test]
    fn campanha_sem_inventario_nao_ganha_catalogo() {
        let raiz = tempfile::tempdir().unwrap();
        let mut vault = Vault::create(raiz.path(), "Vazia").unwrap();
        vault.config.versao = 2;
        characters::create(&vault, "Edgar").unwrap();

        vault.migrar().unwrap();

        assert!(!vault.root.join(itens::ARQUIVO).exists());
        assert_eq!(vault.config.versao, crate::vault::VAULT_VERSION);
    }
}
