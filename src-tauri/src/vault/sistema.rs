//! Aplicar um sistema de plugin numa campanha: os atributos, os medidores, o
//! molde dos detalhes e as condicoes dele entram no que a campanha ja tem.
//!
//! JUNTA, e nunca substitui. O que tem o mesmo nome fica como o mestre deixou
//! -- a "Vida" que ele recoloriu, a Classe em que ele acrescentou uma opcao --,
//! e o que nao cabe no teto fica de fora e volta na lista. Nada sai: trocar de
//! sistema apagando o anterior seria apagar o trabalho dele, e esse gesto, se
//! um dia existir, tem de ter nome proprio.
//!
//! Sem vinculo, como todo molde: a campanha nao lembra de onde o padrao veio,
//! e desinstalar o plugin nao mexe nela. Ver `extensoes::Sistema`.

use serde::Serialize;

use super::{atributos, condicoes, detalhes, modelos, Vault};
use crate::error::AppResult;
use crate::extensoes::Sistema;

/// O que aconteceu com uma lista do sistema.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Juntados {
    pub entraram: usize,
    /// Os que a campanha ja tinha com o mesmo nome, e ficaram como estavam.
    pub ja_havia: usize,
    /// Os que passariam do teto da campanha, pelo nome.
    pub nao_couberam: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Aplicado {
    pub atributos: Juntados,
    pub medidores: Juntados,
    pub grupos: Juntados,
    pub detalhes: Juntados,
    pub condicoes: Juntados,
    /// Quantos personagens que ja existiam ganharam alguma coisa. Zero quando
    /// o mestre nao pediu.
    pub alcancados: usize,
}

/// Junta o sistema ao padrao da campanha. NAO mexe nas fichas: quem pede isso
/// e o comando, com os "aplicar em todos" de cada lista.
pub fn aplicar(vault: &Vault, sistema: &Sistema) -> AppResult<Aplicado> {
    let (grupos, detalhes) = detalhes::juntar_molde(vault, &sistema.detalhes)?;

    Ok(Aplicado {
        atributos: atributos::juntar(vault, &sistema.atributos)?,
        medidores: modelos::juntar(vault, &sistema.medidores)?,
        grupos,
        detalhes,
        condicoes: condicoes::juntar(vault, &sistema.condicoes)?,
        alcancados: 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extensoes::{
        AtributoDoSistema, CondicaoDoSistema, DetalhesDoSistema, GrupoDoSistema, MedidorDoSistema,
        ModeloDoSistema,
    };
    use crate::vault::characters::{self, Estilo};

    fn vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::create(dir.path().join("campanha"), "Campanha").unwrap();
        (dir, vault)
    }

    fn ordem() -> Sistema {
        Sistema {
            id: "ordem".into(),
            titulo: crate::extensoes::TextoDePlugin::Um("Ordem".into()),
            atributos: ["AGI", "FOR", "INT"]
                .iter()
                .map(|sigla| AtributoDoSistema {
                    sigla: sigla.to_string(),
                    valor: 1,
                    descricao: None,
                })
                .collect(),
            medidores: vec![MedidorDoSistema {
                nome: "PV".into(),
                cor: "#ef4444".into(),
                estilo: Estilo::Barra,
                maximo: 20,
                escondido: false,
                estilo_extensao: Some("ordem-segredo-na-floresta/pv".into()),
            }],
            detalhes: DetalhesDoSistema {
                grupos: vec![GrupoDoSistema {
                    nome: "Identidade".into(),
                    exibicao: detalhes::Exibicao::Linhas,
                }],
                modelos: vec![ModeloDoSistema {
                    grupo: "identidade".into(),
                    rotulo: "Classe".into(),
                    tipo: detalhes::Tipo::Escolha,
                    valor: None,
                    opcoes: vec!["Combatente".into(), "Ocultista".into()],
                    descricao: None,
                }],
            },
            condicoes: vec![CondicaoDoSistema {
                nome: "Morrendo".into(),
                cor: "#ef4444".into(),
                icone: Some("caveira".into()),
                efeito: None,
            }],
        }
    }

    #[test]
    fn campanha_vazia_recebe_tudo() {
        let (_dir, vault) = vault();
        let aplicado = aplicar(&vault, &ordem()).unwrap();

        assert_eq!(aplicado.atributos.entraram, 3);
        assert_eq!(aplicado.medidores.entraram, 1);
        assert_eq!(aplicado.grupos.entraram, 1);
        assert_eq!(aplicado.detalhes.entraram, 1);
        assert_eq!(aplicado.condicoes.entraram, 1);

        let medidor = &modelos::load(&vault).unwrap()[0];
        assert_eq!(medidor.maximo, 20);
        assert_eq!(
            medidor.estilo_extensao.as_deref(),
            Some("ordem-segredo-na-floresta/pv")
        );
        // O detalhe cai no grupo com o nome que o grupo tem, e nao com a
        // caixa em que o sistema o escreveu.
        assert_eq!(
            detalhes::molde(&vault).unwrap().modelos[0].grupo,
            "Identidade"
        );
    }

    #[test]
    fn aplicar_duas_vezes_nao_duplica_e_respeita_o_que_o_mestre_mudou() {
        let (_dir, vault) = vault();
        aplicar(&vault, &ordem()).unwrap();

        // O mestre aumenta o PV de fabrica para 30.
        let pv = modelos::load(&vault).unwrap()[0].id.clone();
        modelos::editar(
            &vault,
            &pv,
            modelos::PatchModelo {
                maximo: Some(30),
                ..Default::default()
            },
        )
        .unwrap();

        let de_novo = aplicar(&vault, &ordem()).unwrap();

        assert_eq!(de_novo.atributos.entraram, 0);
        assert_eq!(de_novo.atributos.ja_havia, 3);
        assert_eq!(de_novo.detalhes.ja_havia, 1);
        assert_eq!(atributos::load(&vault).unwrap().len(), 3);
        assert_eq!(modelos::load(&vault).unwrap()[0].maximo, 30);
    }

    #[test]
    fn o_que_passa_do_teto_fica_de_fora_pelo_nome() {
        let (_dir, vault) = vault();
        for i in 0..characters::MAX_ATRIBUTOS - 1 {
            atributos::criar(&vault, &format!("X{i}"), 1, None).unwrap();
        }

        let aplicado = aplicar(&vault, &ordem()).unwrap();

        assert_eq!(aplicado.atributos.entraram, 1);
        assert_eq!(aplicado.atributos.nao_couberam, vec!["FOR", "INT"]);
    }
}
