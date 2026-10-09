use std::path::PathBuf;

use super::atomic::{read_json, write_json};
use super::characters::{ajustar_condicao, chave_do_nome, Condicao, PatchCondicao};
use super::Vault;
use crate::error::{AppError, AppResult};

/// As condicoes que esta campanha oferece: o cardapio do menu do token.
///
/// Mora em `condicoes.json` na raiz, ao lado de `medidores.json` e pela mesma
/// razao: o `config.json` e a identidade da campanha, lido para cada pasta da
/// lista de recentes, e nenhuma daquelas leituras quer saber de veneno. Viaja
/// no zip como o resto da raiz, e e o que faz o mestre montar a lista uma vez.
///
/// ## Cardapio, e nao molde
///
/// O avesso do modelo de medidor. Aquele materializa em TODA ficha na hora,
/// porque "esta mesa tem Sanidade" vale para todo mundo. Condicao e de
/// momento: ninguem nasce envenenado. Criar uma aqui nao toca em ficha
/// nenhuma; ela so passa a estar a um clique no menu do token.
///
/// Quando o mestre a marca num token, o personagem ganha uma COPIA, e dali em
/// diante a copia e dele -- mesma regra do medidor, e pela mesma razao: editar
/// o cardapio no meio da sessao nao pode trocar a cor do veneno que a mesa ja
/// esta vendo. O modelo e reconhecido na ficha pelo NOME, e nao por um id
/// guardado na copia. Ver `characters::alternar_condicao`.
///
/// Um modelo de condicao E uma condicao, e por isso o tipo e o mesmo: ao
/// contrario do medidor, que perde o `atual`, aqui nao ha nada que seja so do
/// personagem.
const ARQUIVO: &str = "condicoes.json";

/// Quantas condicoes cabem no cardapio.
///
/// Dezesseis. O limite e do MENU: passando disso o submenu do token vira uma
/// lista que se rola, e o gesto deixa de ser "botao direito, Envenenado".
pub const MAX_MODELOS: usize = 16;

fn path(vault: &Vault) -> PathBuf {
    vault.root.join(ARQUIVO)
}

/// O cardapio. Campanha sem o arquivo devolve lista vazia, e nao uma lista
/// inventada: sugestao e um gesto com nome, na tela.
pub fn load(vault: &Vault) -> AppResult<Vec<Condicao>> {
    Ok(read_json(&path(vault))?.unwrap_or_default())
}

fn save(vault: &Vault, modelos: &[Condicao]) -> AppResult<()> {
    write_json(&path(vault), &modelos)
}

fn sem_modelo(id: &str) -> AppError {
    AppError::Malformed {
        file: ARQUIVO.into(),
        cause: format!("a campanha nao tem a condicao {id}"),
    }
}

/// O modelo, ou o erro que diz que ele nao existe.
/// Acrescenta condicoes que vieram de um pacote, cada uma com id novo. As que
/// passam do teto ficam de fora: quem chamou ja contou as vagas e avisou.
pub fn adotar(vault: &Vault, novas: Vec<Condicao>) -> AppResult<()> {
    if novas.is_empty() {
        return Ok(());
    }

    let mut modelos = load(vault)?;
    for mut condicao in novas {
        if modelos.len() >= MAX_MODELOS {
            break;
        }
        condicao.id = uuid::Uuid::new_v4().to_string();
        ajustar_condicao(&mut condicao);
        modelos.push(condicao);
    }

    save(vault, &modelos)
}

/// Junta as condicoes de um sistema ao cardapio da campanha, pelo nome. Ver
/// `vault::sistema`.
pub fn juntar(
    vault: &Vault,
    novas: &[crate::extensoes::CondicaoDoSistema],
) -> AppResult<super::sistema::Juntados> {
    let mut modelos = load(vault)?;
    let mut juntados = super::sistema::Juntados::default();

    for nova in novas {
        let chave = chave_do_nome(&nova.nome);
        if modelos.iter().any(|m| chave_do_nome(&m.nome) == chave) {
            juntados.ja_havia += 1;
        } else if modelos.len() >= MAX_MODELOS {
            juntados.nao_couberam.push(nova.nome.trim().to_string());
        } else {
            let mut condicao = Condicao {
                id: uuid::Uuid::new_v4().to_string(),
                nome: nova.nome.clone(),
                cor: nova.cor.clone(),
                icone: nova.icone.clone().unwrap_or_default(),
                efeito: nova.efeito.clone(),
                escondido: false,
            };
            ajustar_condicao(&mut condicao);
            modelos.push(condicao);
            juntados.entraram += 1;
        }
    }

    if juntados.entraram > 0 {
        save(vault, &modelos)?;
    }

    Ok(juntados)
}

pub fn buscar(vault: &Vault, modelo_id: &str) -> AppResult<Condicao> {
    load(vault)?
        .into_iter()
        .find(|m| m.id == modelo_id)
        .ok_or_else(|| sem_modelo(modelo_id))
}

pub fn criar(
    vault: &Vault,
    nome: &str,
    cor: &str,
    icone: &str,
    efeito: Option<String>,
) -> AppResult<Condicao> {
    let mut modelos = load(vault)?;

    if modelos.len() >= MAX_MODELOS {
        return Err(AppError::Malformed {
            file: ARQUIVO.into(),
            cause: format!("a campanha ja tem {MAX_MODELOS} condicoes"),
        });
    }

    let mut modelo = Condicao {
        id: uuid::Uuid::new_v4().to_string(),
        nome: nome.to_string(),
        cor: cor.to_string(),
        icone: icone.to_string(),
        efeito,
        escondido: false,
    };
    ajustar_condicao(&mut modelo);

    modelos.push(modelo.clone());
    save(vault, &modelos)?;

    Ok(modelo)
}

/// Edita um modelo. NAO empurra a mudanca para as fichas -- a copia e delas.
pub fn editar(vault: &Vault, modelo_id: &str, patch: PatchCondicao) -> AppResult<Condicao> {
    let mut modelos = load(vault)?;

    let modelo = modelos
        .iter_mut()
        .find(|m| m.id == modelo_id)
        .ok_or_else(|| sem_modelo(modelo_id))?;

    patch.aplicar(modelo);
    let saida = modelo.clone();

    save(vault, &modelos)?;

    Ok(saida)
}

/// Da ao modelo o efeito proprio dele, e aponta para o mesmo efeito toda copia
/// com o nome dele nas fichas: configurar o fogo de "Em chamas" muda tambem
/// quem ja esta em chamas. Ver `characters::apontar_efeito_por_nome`.
///
/// O efeito tem de ter forma de id -- a mesma regra da condicao.
pub fn vincular_efeito(vault: &Vault, modelo_id: &str, efeito: &str) -> AppResult<Condicao> {
    if !super::characters::efeito_valido(efeito) {
        return Err(AppError::Malformed {
            file: ARQUIVO.into(),
            cause: format!("{efeito:?} nao e um id de efeito"),
        });
    }

    let mut modelos = load(vault)?;
    let modelo = modelos
        .iter_mut()
        .find(|m| m.id == modelo_id)
        .ok_or_else(|| sem_modelo(modelo_id))?;

    modelo.efeito = Some(efeito.to_string());
    let saida = modelo.clone();
    save(vault, &modelos)?;

    super::characters::apontar_efeito_por_nome(vault, &saida.nome, efeito)?;

    Ok(saida)
}

/// Tira o modelo do cardapio. As copias que ele deixou nas fichas FICAM: o
/// goblin continua envenenado, so deixa de haver o atalho para envenenar o
/// proximo.
pub fn remover(vault: &Vault, modelo_id: &str) -> AppResult<()> {
    let modelos = load(vault)?;

    if !modelos.iter().any(|m| m.id == modelo_id) {
        return Err(sem_modelo(modelo_id));
    }

    save(
        vault,
        &modelos
            .into_iter()
            .filter(|m| m.id != modelo_id)
            .collect::<Vec<_>>(),
    )
}

/// Poe o cardapio na ordem pedida. A ordem e a do submenu do token. Mesma
/// regra de `modelos::reordenar`: o que falta no pedido fica no fim.
pub fn reordenar(vault: &Vault, ordem: &[String]) -> AppResult<Vec<Condicao>> {
    let mut restantes = load(vault)?;
    let mut arrumados: Vec<Condicao> = Vec::with_capacity(restantes.len());

    for pedido in ordem {
        if let Some(posicao) = restantes.iter().position(|m| &m.id == pedido) {
            arrumados.push(restantes.remove(posicao));
        }
    }
    arrumados.append(&mut restantes);

    save(vault, &arrumados)?;

    Ok(arrumados)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::characters;

    fn vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::create(dir.path().join("campanha"), "Campanha").unwrap();
        (dir, vault)
    }

    #[test]
    fn campanha_sem_arquivo_nao_tem_condicao() {
        let (_tmp, vault) = vault();

        assert!(load(&vault).unwrap().is_empty());
    }

    #[test]
    fn criar_nao_toca_em_ficha_nenhuma() {
        // O avesso do modelo de medidor: ninguem nasce envenenado.
        let (_tmp, vault) = vault();
        characters::create(&vault, "Edgar").unwrap();

        criar(&vault, "Envenenado", "#22c55e", "frasco", Some("tingido".into())).unwrap();

        assert_eq!(load(&vault).unwrap().len(), 1);
        assert!(characters::load(&vault).unwrap()[0].condicoes.is_empty());
    }

    #[test]
    fn passar_do_teto_e_recusado() {
        let (_tmp, vault) = vault();

        for n in 0..MAX_MODELOS {
            criar(&vault, &format!("C{n}"), "#ef4444", "cama", None).unwrap();
        }

        assert!(criar(&vault, "Mais uma", "#ef4444", "cama", None).is_err());
    }

    #[test]
    fn editar_o_modelo_nao_mexe_na_copia_da_ficha() {
        let (_tmp, vault) = vault();
        let modelo =
            criar(&vault, "Envenenado", "#22c55e", "frasco", Some("tingido".into())).unwrap();
        let p = characters::create(&vault, "Edgar").unwrap();
        characters::alternar_condicao(&vault, &[p.id.clone()], &modelo, true).unwrap();

        editar(
            &vault,
            &modelo.id,
            PatchCondicao {
                cor: Some("#a855f7".into()),
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(characters::load(&vault).unwrap()[0].condicoes[0].cor, "#22c55e");
    }

    #[test]
    fn remover_o_modelo_deixa_a_copia_na_ficha() {
        let (_tmp, vault) = vault();
        let modelo = criar(&vault, "Caído", "#ef4444", "cama", None).unwrap();
        let p = characters::create(&vault, "Edgar").unwrap();
        characters::alternar_condicao(&vault, &[p.id.clone()], &modelo, true).unwrap();

        remover(&vault, &modelo.id).unwrap();

        assert!(load(&vault).unwrap().is_empty());
        assert_eq!(characters::load(&vault).unwrap()[0].condicoes.len(), 1);
    }

    #[test]
    fn reordenar_poe_na_ordem_e_nao_perde_quem_faltou() {
        let (_tmp, vault) = vault();

        let a = criar(&vault, "A", "#ef4444", "cama", None).unwrap();
        let b = criar(&vault, "B", "#f59e0b", "cama", None).unwrap();
        let c = criar(&vault, "C", "#22c55e", "cama", None).unwrap();

        let ordem = reordenar(&vault, &[c.id.clone(), a.id.clone()]).unwrap();

        let ids: Vec<_> = ordem.iter().map(|m| m.id.clone()).collect();
        assert_eq!(ids, vec![c.id, a.id, b.id]);
    }

    #[test]
    fn vincular_da_o_efeito_ao_modelo_e_as_copias_com_o_nome_dele() {
        // O "muda junto": quem ja estava em chamas passa a desenhar o efeito
        // configurado. Quem tem outra condicao nao muda.
        let (_tmp, vault) = vault();
        let modelo = criar(&vault, "Em chamas", "#f59e0b", "chama", Some("chamas".into())).unwrap();
        let p = characters::create(&vault, "Goblin").unwrap();
        characters::alternar_condicao(&vault, &[p.id.clone()], &modelo, true).unwrap();
        characters::criar_condicao(&vault, &p.id, "Envenenado", "#22c55e", "frasco", None).unwrap();

        let ligado = vincular_efeito(&vault, &modelo.id, "campanha/a1b2c3d4").unwrap();

        assert_eq!(ligado.efeito.as_deref(), Some("campanha/a1b2c3d4"));
        assert_eq!(load(&vault).unwrap()[0].efeito.as_deref(), Some("campanha/a1b2c3d4"));
        let condicoes = &characters::load(&vault).unwrap()[0].condicoes;
        let por_nome = |nome: &str| condicoes.iter().find(|c| c.nome == nome).unwrap().efeito.clone();
        assert_eq!(por_nome("Em chamas").as_deref(), Some("campanha/a1b2c3d4"));
        assert_eq!(por_nome("Envenenado"), None);
    }

    #[test]
    fn vincular_recusa_efeito_sem_forma_de_id() {
        let (_tmp, vault) = vault();
        let modelo = criar(&vault, "Em chamas", "#f59e0b", "chama", None).unwrap();

        assert!(vincular_efeito(&vault, &modelo.id, "../fogo").is_err());
        assert!(vincular_efeito(&vault, "nao-existe", "campanha/a1b2c3d4").is_err());
    }
}