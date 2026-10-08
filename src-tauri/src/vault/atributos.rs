use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::atomic::{read_json, write_json};
use super::characters::{ajustar_atributo, Atributo, MAX_ATRIBUTOS};
use super::Vault;
use crate::error::{AppError, AppResult};

/// Os atributos que toda ficha desta campanha comeca tendo.
///
/// O par de `medidores.json`, e pelas mesmas razoes: arquivo proprio na raiz,
/// e nao o `config.json`, que e lido para cada campanha da lista de recentes;
/// viaja no zip, e e o que faz o mestre montar o sistema uma vez.
///
/// ## Modelo e um MOLDE, nao um vinculo
///
/// Criar um modelo materializa o atributo em cada personagem, e dali em diante
/// o atributo e DELE. Editar o modelo depois nao empurra nada para as fichas:
/// o mestre que pos FOR 5 no Edgar nao pode perder o 5 porque mexeu no padrao
/// da campanha.
const ARQUIVO: &str = "atributos.json";

/// Quantos modelos cabem numa campanha. O teto da ficha, porque viram atributo.
pub const MAX_MODELOS: usize = MAX_ATRIBUTOS;

/// Um atributo de fabrica: a sigla e o valor com que ele nasce.
///
/// O `valor` e o de PARTIDA, e e o que distingue o molde do medidor: o 10 de
/// cada atributo do D&D, o 1 do Ordem. Na ficha ele vira do personagem.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Modelo {
    pub id: String,
    pub sigla: String,
    pub valor: i64,
    /// A descricao que o atributo materializado ja traz. Ver
    /// `Atributo::descricao`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub descricao: Option<String>,
}

impl Modelo {
    /// O atributo que este modelo produz numa ficha. Id novo, sem volta para
    /// o modelo -- ver `modelos::Modelo::materializar`.
    pub fn materializar(&self) -> Atributo {
        Atributo {
            id: uuid::Uuid::new_v4().to_string(),
            sigla: self.sigla.clone(),
            valor: self.valor,
            descricao: self.descricao.clone(),
        }
    }

    /// Passa pelo mesmo ajuste da ficha: o molde nao pode guardar uma sigla
    /// que a ficha cortaria.
    fn ajustar(&mut self) {
        let mut atributo = self.materializar();
        ajustar_atributo(&mut atributo);

        self.sigla = atributo.sigla;
        self.valor = atributo.valor;
        self.descricao = atributo.descricao;
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

fn sem_modelo(id: &str) -> AppError {
    AppError::Malformed {
        file: ARQUIVO.into(),
        cause: format!("a campanha nao tem o atributo {id}"),
    }
}

pub fn criar(vault: &Vault, sigla: &str, valor: i64, descricao: Option<&str>) -> AppResult<Modelo> {
    let mut modelos = load(vault)?;

    if modelos.len() >= MAX_MODELOS {
        return Err(AppError::Malformed {
            file: ARQUIVO.into(),
            cause: format!("a campanha ja tem {MAX_MODELOS} atributos"),
        });
    }

    let mut modelo = Modelo {
        id: uuid::Uuid::new_v4().to_string(),
        sigla: sigla.to_string(),
        valor,
        descricao: descricao.map(str::to_string),
    };
    modelo.ajustar();

    modelos.push(modelo.clone());
    save(vault, &modelos)?;

    Ok(modelo)
}

/// O que se pode trocar num modelo. Ausente nao mexe.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchModelo {
    pub sigla: Option<String>,
    pub valor: Option<i64>,
    /// `Some("")` apaga a descricao.
    pub descricao: Option<String>,
}

/// Edita um modelo. NAO mexe nas fichas -- ver a nota do molde, no topo.
pub fn editar(vault: &Vault, modelo_id: &str, patch: PatchModelo) -> AppResult<Modelo> {
    let mut modelos = load(vault)?;

    let modelo = modelos
        .iter_mut()
        .find(|m| m.id == modelo_id)
        .ok_or_else(|| sem_modelo(modelo_id))?;

    if let Some(sigla) = patch.sigla {
        modelo.sigla = sigla;
    }
    if let Some(valor) = patch.valor {
        modelo.valor = valor;
    }
    if let Some(descricao) = patch.descricao {
        modelo.descricao = Some(descricao);
    }
    modelo.ajustar();
    let saida = modelo.clone();

    save(vault, &modelos)?;

    Ok(saida)
}

/// Tira o modelo da campanha. Os atributos que ele produziu FICAM nas fichas,
/// pela mesma razao dos medidores: sao dos personagens desde que nasceram.
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
    fn campanha_sem_arquivo_nao_tem_atributo() {
        let (_tmp, vault) = vault();

        assert!(load(&vault).unwrap().is_empty());
    }

    #[test]
    fn cria_ajusta_e_edita() {
        let (_tmp, vault) = vault();

        let modelo = criar(&vault, " Vigor ", 2000, None).unwrap();
        assert_eq!(modelo.sigla, "Vigor");
        assert_eq!(modelo.valor, characters::MAX_VALOR_ATRIBUTO);

        let editado = editar(
            &vault,
            &modelo.id,
            PatchModelo {
                valor: Some(1),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(editado.sigla, "Vigor");
        assert_eq!(load(&vault).unwrap()[0].valor, 1);
    }

    #[test]
    fn editar_o_modelo_nao_mexe_na_ficha() {
        let (_tmp, vault) = vault();
        let p = characters::create(&vault, "Edgar").unwrap();

        let modelo = criar(&vault, "FOR", 1, Some("Forca")).unwrap();
        characters::acrescentar_atributos(&vault, &p.id, vec![modelo.materializar()]).unwrap();

        editar(
            &vault,
            &modelo.id,
            PatchModelo {
                valor: Some(3),
                ..Default::default()
            },
        )
        .unwrap();
        remover(&vault, &modelo.id).unwrap();

        let ficha = &characters::load(&vault).unwrap()[0].atributos;
        assert_eq!(ficha.len(), 1);
        assert_eq!(ficha[0].valor, 1);
        // A descricao veio do molde, junto com a sigla.
        assert_eq!(ficha[0].descricao.as_deref(), Some("Forca"));
        assert_ne!(ficha[0].id, modelo.id);
    }

    #[test]
    fn teto_da_campanha() {
        let (_tmp, vault) = vault();

        for i in 0..MAX_MODELOS {
            criar(&vault, &format!("A{i}"), 1, None).unwrap();
        }

        assert!(criar(&vault, "Mais", 1, None).is_err());
    }

    #[test]
    fn reaplicar_so_poe_o_que_falta() {
        // O caminho do "aplicar em todos": a ficha que ja tem a sigla fica
        // como esta, e a que nao tem ganha.
        let (_tmp, vault) = vault();
        let p = characters::create(&vault, "Edgar").unwrap();
        characters::criar_atributo(&vault, &p.id, "FOR", 5).unwrap();

        criar(&vault, "FOR", 1, None).unwrap();
        criar(&vault, "VIG", 1, None).unwrap();
        let novos = || {
            load(&vault)
                .unwrap()
                .iter()
                .map(Modelo::materializar)
                .collect()
        };

        assert_eq!(
            characters::acrescentar_atributos(&vault, &p.id, novos()).unwrap(),
            1
        );
        assert_eq!(
            characters::acrescentar_atributos(&vault, &p.id, novos()).unwrap(),
            0
        );

        let ficha = &characters::load(&vault).unwrap()[0].atributos;
        let lido: Vec<(&str, i64)> = ficha.iter().map(|a| (a.sigla.as_str(), a.valor)).collect();
        assert_eq!(lido, [("FOR", 5), ("VIG", 1)]);
    }
}
