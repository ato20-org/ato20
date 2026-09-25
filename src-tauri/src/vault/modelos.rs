use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::atomic::{read_json, write_json};
use super::characters::{Estilo, Medidor, MAX_MEDIDORES};
use super::Vault;
use crate::error::{AppError, AppResult};

/// Os medidores que toda ficha desta campanha comeca tendo.
///
/// Mora em `medidores.json` na raiz, e nao no `config.json`: aquele e a
/// IDENTIDADE da campanha, lido pela porta do Mestre para cada pasta da lista
/// de recentes -- doze campanhas viram doze leituras, e nenhuma delas quer
/// saber de modelo de medidor. Arquivo proprio tambem e o que o resto do vault
/// ja faz: retratos, trilha, pastas.
///
/// Viaja no zip, como todo o resto da raiz. Uma campanha exportada leva os
/// modelos dela, que e o que faz o mestre montar o sistema uma vez.
///
/// ## Modelo e um MOLDE, nao um vinculo
///
/// Criar um modelo materializa um medidor de verdade em cada personagem, e a
/// partir dali o medidor e DELE: o mestre renomeia, troca a cor, apaga. Editar
/// o modelo depois nao empurra nada -- para isso existe `aplicar_em_todos`, que
/// e um gesto com nome. O vinculo vivo seria a outra escolha possivel, e ela
/// faz o mestre perder o ajuste que fez num personagem sem ter pedido.
const ARQUIVO: &str = "medidores.json";

/// Quantos modelos cabem numa campanha.
///
/// O mesmo teto dos medidores de um personagem, e pela mesma razao: eles viram
/// medidores, e um sistema com mais modelos que o teto criaria fichas que
/// nascem ja recusando parte deles.
pub const MAX_MODELOS: usize = MAX_MEDIDORES;

const MAX_NOME: usize = 24;
const MAX_VALOR: i64 = 1_000_000;

/// Um medidor de fabrica: tudo que um `Medidor` tem, menos o valor.
///
/// Sem `atual` de proposito. O valor e do PERSONAGEM -- e a unica coisa que
/// distingue o goblin com tres de vida do goblin com vinte --, e guardar um
/// aqui daria ao mestre um campo para preencher que nao quer dizer nada. O
/// medidor materializado nasce cheio.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Modelo {
    pub id: String,
    pub nome: String,
    pub cor: String,
    pub estilo: Estilo,
    pub maximo: i64,
    pub escondido: bool,
}

impl Modelo {
    /// O medidor que este modelo produz numa ficha.
    ///
    /// Id NOVO, e nao o do modelo: dois personagens teriam o mesmo id, e o id e
    /// como a tela e o IPC dizem em qual linha mexer. E o medidor materializado
    /// nao aponta de volta para o modelo -- ele nao e uma referencia, e um
    /// molde usado uma vez.
    pub fn materializar(&self) -> Medidor {
        Medidor {
            id: uuid::Uuid::new_v4().to_string(),
            nome: self.nome.clone(),
            cor: self.cor.clone(),
            estilo: self.estilo,
            atual: self.maximo,
            maximo: self.maximo,
            escondido: self.escondido,
        }
    }
}

fn path(vault: &Vault) -> PathBuf {
    vault.root.join(ARQUIVO)
}

/// Os modelos da campanha. Campanha sem o arquivo devolve lista vazia.
pub fn load(vault: &Vault) -> AppResult<Vec<Modelo>> {
    Ok(read_json(&path(vault))?.unwrap_or_default())
}

fn save(vault: &Vault, modelos: &[Modelo]) -> AppResult<()> {
    write_json(&path(vault), &modelos)
}

/// Corta um texto no numero de CARACTERES, e nao de bytes.
///
/// `&texto[..teto]` entra em panico no meio de um acento, e nome de medidor em
/// portugues tem acento na primeira palavra.
fn texto_curto(valor: &str, teto: usize) -> String {
    valor.trim().chars().take(teto).collect()
}

fn ajustar(modelo: &mut Modelo) {
    modelo.nome = texto_curto(&modelo.nome, MAX_NOME);
    if modelo.nome.is_empty() {
        modelo.nome = "Medidor".to_string();
    }

    modelo.maximo = modelo.maximo.clamp(1, MAX_VALOR);
}

fn sem_modelo(id: &str) -> AppError {
    AppError::Malformed {
        file: ARQUIVO.into(),
        cause: format!("a campanha nao tem o modelo {id}"),
    }
}

pub fn criar(
    vault: &Vault,
    nome: &str,
    cor: &str,
    estilo: Estilo,
    maximo: i64,
) -> AppResult<Modelo> {
    let mut modelos = load(vault)?;

    if modelos.len() >= MAX_MODELOS {
        return Err(AppError::Malformed {
            file: ARQUIVO.into(),
            cause: format!("a campanha ja tem {MAX_MODELOS} modelos"),
        });
    }

    let mut modelo = Modelo {
        id: uuid::Uuid::new_v4().to_string(),
        nome: nome.to_string(),
        cor: cor.to_string(),
        estilo,
        maximo,
        escondido: false,
    };
    ajustar(&mut modelo);

    modelos.push(modelo.clone());
    save(vault, &modelos)?;

    Ok(modelo)
}

/// O que se pode trocar num modelo. Ausente nao mexe.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchModelo {
    pub nome: Option<String>,
    pub cor: Option<String>,
    pub estilo: Option<Estilo>,
    pub maximo: Option<i64>,
    pub escondido: Option<bool>,
}

pub fn editar(vault: &Vault, modelo_id: &str, patch: PatchModelo) -> AppResult<Modelo> {
    let mut modelos = load(vault)?;

    let modelo = modelos
        .iter_mut()
        .find(|m| m.id == modelo_id)
        .ok_or_else(|| sem_modelo(modelo_id))?;

    if let Some(nome) = patch.nome {
        modelo.nome = nome;
    }
    if let Some(cor) = patch.cor {
        modelo.cor = cor;
    }
    if let Some(estilo) = patch.estilo {
        modelo.estilo = estilo;
    }
    if let Some(maximo) = patch.maximo {
        modelo.maximo = maximo;
    }
    if let Some(escondido) = patch.escondido {
        modelo.escondido = escondido;
    }

    ajustar(modelo);
    let saida = modelo.clone();

    save(vault, &modelos)?;

    Ok(saida)
}

/// Tira o modelo da campanha.
///
/// Os medidores que ele ja produziu FICAM. Eles sao dos personagens desde o
/// instante em que nasceram, e apagar o molde nao pode apagar o que a mesa
/// vinha usando a sessao inteira -- a vida de todo mundo sumiria de uma vez,
/// no meio de um combate, por causa de um clique num painel de configuracao.
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
    fn campanha_sem_arquivo_nao_tem_modelo() {
        // E o caso de toda campanha aberta antes desta feature: a ausencia do
        // arquivo nao pode ser erro, e nem inventar um modelo que ninguem pediu.
        let (_tmp, vault) = vault();

        assert!(load(&vault).unwrap().is_empty());
    }

    #[test]
    fn cria_e_le() {
        let (_tmp, vault) = vault();

        let modelo = criar(&vault, "Vida", "#ef4444", Estilo::Barra, 20).unwrap();

        assert_eq!(modelo.nome, "Vida");
        assert_eq!(modelo.maximo, 20);
        assert_eq!(load(&vault).unwrap().len(), 1);
    }

    #[test]
    fn materializar_nasce_cheio_e_com_id_proprio() {
        // Id novo e nao o do modelo: dois personagens ficariam com o mesmo id, e
        // o id e como a tela e o IPC dizem em qual linha mexer.
        let (_tmp, vault) = vault();
        let modelo = criar(&vault, "Vida", "#ef4444", Estilo::Barra, 20).unwrap();

        let medidor = modelo.materializar();

        assert_eq!(medidor.atual, 20);
        assert_eq!(medidor.maximo, 20);
        assert_eq!(medidor.nome, "Vida");
        assert_ne!(medidor.id, modelo.id);
        assert_ne!(modelo.materializar().id, medidor.id);
    }

    #[test]
    fn nome_vazio_nao_deixa_linha_em_branco() {
        let (_tmp, vault) = vault();

        let modelo = criar(&vault, "   ", "#ef4444", Estilo::Barra, 10).unwrap();

        assert_eq!(modelo.nome, "Medidor");
    }

    #[test]
    fn maximo_zero_vira_um() {
        let (_tmp, vault) = vault();

        let modelo = criar(&vault, "Vida", "#ef4444", Estilo::Barra, 0).unwrap();

        assert_eq!(modelo.maximo, 1);
    }

    #[test]
    fn passar_do_teto_e_recusado() {
        let (_tmp, vault) = vault();

        for _ in 0..MAX_MODELOS {
            criar(&vault, "Vida", "#ef4444", Estilo::Barra, 10).unwrap();
        }

        assert!(criar(&vault, "Vida", "#ef4444", Estilo::Barra, 10).is_err());
        assert_eq!(load(&vault).unwrap().len(), MAX_MODELOS);
    }

    #[test]
    fn editar_nao_mexe_no_que_ja_foi_materializado() {
        // O modelo e um MOLDE. Trocar a cor dele nao pode trocar a cor de um
        // medidor que a mesa vem usando a sessao inteira -- para empurrar existe
        // um gesto com nome, em `modelos_aplicar_em_todos`.
        let (_tmp, vault) = vault();
        let modelo = criar(&vault, "Vida", "#ef4444", Estilo::Barra, 20).unwrap();

        let p = characters::create(&vault, "Edgar").unwrap();
        characters::acrescentar_medidores(&vault, &p.id, vec![modelo.materializar()]).unwrap();

        editar(
            &vault,
            &modelo.id,
            PatchModelo {
                cor: Some("#22c55e".into()),
                ..Default::default()
            },
        )
        .unwrap();

        let ficha = &characters::load(&vault).unwrap()[0];
        assert_eq!(ficha.medidores[0].cor, "#ef4444");
    }

    #[test]
    fn remover_o_modelo_nao_apaga_o_medidor_de_ninguem() {
        // Apagar o molde nao pode sumir com a vida de toda a mesa de uma vez,
        // no meio de um combate, por causa de um clique num painel.
        let (_tmp, vault) = vault();
        let modelo = criar(&vault, "Vida", "#ef4444", Estilo::Barra, 20).unwrap();

        let p = characters::create(&vault, "Edgar").unwrap();
        characters::acrescentar_medidores(&vault, &p.id, vec![modelo.materializar()]).unwrap();

        remover(&vault, &modelo.id).unwrap();

        assert!(load(&vault).unwrap().is_empty());
        assert_eq!(characters::load(&vault).unwrap()[0].medidores.len(), 1);
    }

    #[test]
    fn nome_que_a_ficha_ja_tem_nao_entra_de_novo() {
        // Este caminho roda toda vez que o mestre aperta "aplicar em todos".
        // Sem a guarda, cada toque duplicaria a coluna de quem ja estava em dia.
        let (_tmp, vault) = vault();
        let modelo = criar(&vault, "Vida", "#ef4444", Estilo::Barra, 20).unwrap();
        let p = characters::create(&vault, "Edgar").unwrap();

        // A primeira aplicacao entra. O que interessa e a SEGUNDA, que e o
        // mestre apertando "aplicar em todos" de novo.
        let primeira =
            characters::acrescentar_medidores(&vault, &p.id, vec![modelo.materializar()]).unwrap();
        let segunda =
            characters::acrescentar_medidores(&vault, &p.id, vec![modelo.materializar()]).unwrap();

        assert_eq!(primeira, 1);
        assert_eq!(segunda, 0);
        assert_eq!(characters::load(&vault).unwrap()[0].medidores.len(), 1);
    }

    #[test]
    fn a_comparacao_de_nome_ignora_caixa_e_espaco() {
        let (_tmp, vault) = vault();
        let p = characters::create(&vault, "Edgar").unwrap();
        characters::criar_medidor(&vault, &p.id, "Vida", "#ef4444", Estilo::Barra, 10).unwrap();

        let modelo = criar(&vault, "  vida  ", "#22c55e", Estilo::Pontos, 5).unwrap();
        let entraram =
            characters::acrescentar_medidores(&vault, &p.id, vec![modelo.materializar()]).unwrap();

        assert_eq!(entraram, 0);
        assert_eq!(characters::load(&vault).unwrap()[0].medidores.len(), 1);
    }

    #[test]
    fn dois_modelos_de_mesmo_nome_entram_uma_vez_so() {
        // O mesmo caso visto do outro lado: a guarda vale dentro da propria
        // leva, nao so contra o que a ficha ja tinha.
        let (_tmp, vault) = vault();
        let p = characters::create(&vault, "Edgar").unwrap();

        let a = criar(&vault, "Vida", "#ef4444", Estilo::Barra, 20).unwrap();
        let b = criar(&vault, "VIDA", "#22c55e", Estilo::Pontos, 5).unwrap();

        let entraram = characters::acrescentar_medidores(
            &vault,
            &p.id,
            vec![a.materializar(), b.materializar()],
        )
        .unwrap();

        assert_eq!(entraram, 1);
        assert_eq!(characters::load(&vault).unwrap()[0].medidores[0].maximo, 20);
    }

    #[test]
    fn nome_diferente_continua_entrando() {
        let (_tmp, vault) = vault();
        let p = characters::create(&vault, "Edgar").unwrap();
        characters::criar_medidor(&vault, &p.id, "Vida", "#ef4444", Estilo::Barra, 10).unwrap();

        let modelo = criar(&vault, "Sanidade", "#a855f7", Estilo::Pontos, 5).unwrap();
        let entraram =
            characters::acrescentar_medidores(&vault, &p.id, vec![modelo.materializar()]).unwrap();

        assert_eq!(entraram, 1);
        assert_eq!(characters::load(&vault).unwrap()[0].medidores.len(), 2);
    }

    #[test]
    fn ficha_cheia_recebe_zero_e_nao_derruba_a_aplicacao() {
        let (_tmp, vault) = vault();
        let p = characters::create(&vault, "Edgar").unwrap();

        // Nomes distintos de proposito: com seis "Vida" o teto seria alcancado
        // mas a guarda de nome recusaria antes dele, e o teste passaria pelo
        // motivo errado.
        for n in 0..characters::MAX_MEDIDORES {
            let nome = format!("Medidor {n}");
            characters::criar_medidor(&vault, &p.id, &nome, "#ef4444", Estilo::Barra, 10).unwrap();
        }

        let modelo = criar(&vault, "Sanidade", "#a855f7", Estilo::Pontos, 5).unwrap();
        let entraram =
            characters::acrescentar_medidores(&vault, &p.id, vec![modelo.materializar()]).unwrap();

        assert_eq!(entraram, 0);
        assert_eq!(
            characters::load(&vault).unwrap()[0].medidores.len(),
            characters::MAX_MEDIDORES
        );
    }
}
