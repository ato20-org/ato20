use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::atomic::{read_json, write_json};
use super::characters::{self, Autor};
use super::itens::{self, AtributoDoItem, Imagem, Item};
use super::modelos::Modelo;
use super::{now_ms, Vault};
use crate::error::{AppError, AppResult};

/// O inventario de um personagem: o que ele carrega, por REFERENCIA.
///
/// O item mora no catalogo da campanha -- ver `itens` --, e o inventario guarda
/// so o id dele, com o que e deste inventario: quantas unidades e se o jogador
/// ve. A mesma pocao na mochila de tres personagens e um item e tres entradas,
/// e corrigir o nome dela corrige nos tres.
///
/// Arquivo PROPRIO dentro de `personagens/{id}/`, e nao um campo do
/// `personagens.json`, pela mesma razao que as notas moraram para fora dele: o
/// indice e relido inteiro para responder "quais sao os personagens", uma
/// pergunta que a lista do mestre faz a cada abertura de janela. Carregar
/// dentro dele o inventario de todo mundo faria cada renomeacao regravar, e
/// cada listagem de nome ler, dezenas de entradas que ninguem pediu.
///
/// Viaja no zip sem nada a mais: o empacotador varre a raiz do vault com
/// `walk`, e nao uma lista de arquivos conhecidos -- ver `zip::exportar`.
pub const ARQUIVO: &str = "_inventario.json";

/// Um item dentro de um inventario.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entrada {
    pub item_id: String,
    /// Quantas unidades NESTE inventario. Nunca zero -- ver `quantidade_valida`.
    #[serde(default = "uma")]
    pub quantidade: u32,
    /// O jogador deste personagem nao ve.
    ///
    /// Na entrada, e nao no item: o mestre esconde o anel amaldicoado na
    /// mochila de um e o mostra na de outro. So o mestre marca, e a filtragem
    /// acontece no DAEMON, nunca na tela: um item escondido que chega ao
    /// celular e depois some no React ja vazou.
    #[serde(default)]
    pub escondido: bool,
    #[serde(default)]
    pub adicionado_em: i64,
    /// O valor atual de cada medidor do item NESTA mochila, pelo id do medidor.
    ///
    /// Na entrada, e nao no item, pela mesma razao da quantidade: a espada do
    /// Edgar esta em 7/10 de durabilidade e a da Mira em 10/10, e as duas sao
    /// o mesmo item do catalogo. Medidor sem valor aqui esta CHEIO -- e o
    /// estado de quem acabou de receber o item, e nao gravar nada para ele
    /// poupa reescrever todas as mochilas quando o mestre cria um medidor.
    ///
    /// Nao e conferido contra o item na leitura do disco: o valor de um
    /// medidor que saiu do item, ou acima de um maximo que encolheu, fica aqui
    /// ate a proxima escrita desta entrada, e quem le passa por `atuais`, que
    /// prende e filtra.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub medidores: BTreeMap<String, i64>,
}

fn uma() -> u32 {
    1
}

/// O valor de cada medidor do item numa mochila, como a ficha o desenha.
///
/// Um por medidor que o item TEM hoje: o guardado na entrada, preso entre zero
/// e o maximo de hoje, ou o maximo quando a entrada nao guarda nada -- o
/// medidor que ninguem mexeu esta cheio. O valor de um medidor que saiu do
/// item fica de fora.
///
/// Prender na leitura, e nao reescrever as mochilas quando o mestre encolhe o
/// maximo, e o que deixa a edicao do item gravar um arquivo so. E e reversivel
/// de graca: o maximo que volta a crescer devolve o valor que estava guardado.
pub(crate) fn atuais(item: &Item, entrada: &Entrada) -> BTreeMap<String, i64> {
    item.medidores
        .iter()
        .map(|medidor| {
            let valor = entrada
                .medidores
                .get(&medidor.id)
                .map_or(medidor.maximo, |guardado| (*guardado).clamp(0, medidor.maximo));
            (medidor.id.clone(), valor)
        })
        .collect()
}

/// O item como um inventario o mostra: o do catalogo, mais o que e da entrada.
///
/// Achatado, e nao um par `{item, entrada}`, para a ficha e o celular
/// continuarem lendo `nome` e `quantidade` do mesmo objeto, como liam quando o
/// item morava dentro do inventario. A forma do JSON ficou a mesma de antes,
/// com `criadoPor` e `atuais` a mais.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoInventario {
    #[serde(flatten)]
    pub item: Item,
    pub quantidade: u32,
    pub escondido: bool,
    /// O valor de cada medidor do item nesta mochila, ja preso ao maximo e com
    /// o cheio preenchido. Ver `atuais`.
    ///
    /// `atuais`, e nao `medidores`: o item achatado ja traz `medidores` -- a
    /// definicao --, e o mesmo nome no mesmo objeto seria uma colisao no JSON.
    pub atuais: BTreeMap<String, i64>,
}

impl NoInventario {
    fn de(item: Item, entrada: &Entrada) -> Self {
        Self {
            atuais: atuais(&item, entrada),
            item,
            quantidade: entrada.quantidade,
            escondido: entrada.escondido,
        }
    }
}

/// Quantos itens CRIADOS POR JOGADOR cabem num inventario.
///
/// Conta o que o jogador escreveu, e nao o que o mestre deu: o teto existe
/// porque a criacao do jogador chega pela rede, e o item que o mestre cria ou
/// entrega e um gesto da janela dele, que nao precisa de cerca. Contado pelo
/// autor do ITEM, e nao por quem pos a entrada ali: o item que um jogador
/// escreveu e o mestre deu a outro personagem ocupa a cota deste tambem -- a
/// cota mede o que entra no inventario vindo de celular, e nao de quem foi o
/// gesto de entregar.
pub const MAX_ITENS_POR_AUTOR: usize = 40;

fn path(vault: &Vault, personagem: &str) -> PathBuf {
    characters::dir(vault, personagem).join(ARQUIVO)
}

/// As entradas como estao no disco, sem o catalogo. Ver `listar`.
pub fn load(vault: &Vault, personagem: &str) -> AppResult<Vec<Entrada>> {
    Ok(read_json(&path(vault, personagem))?.unwrap_or_default())
}

/// Grava as entradas. Quem chama segura `itens::travar`.
pub(crate) fn save(vault: &Vault, personagem: &str, entradas: &[Entrada]) -> AppResult<()> {
    // A pasta do personagem so nasce quando algo e gravado nela: um personagem
    // sem anexo e sem item nunca teve diretorio, e `write_json` nao cria o pai.
    std::fs::create_dir_all(characters::dir(vault, personagem))?;

    write_json(&path(vault, personagem), &entradas)
}

/// O inventario como a tela o desenha: cada entrada com o item dela.
///
/// Entrada que aponta para um item que nao existe mais e PULADA, em silencio. A
/// remocao do catalogo limpa os inventarios antes de tirar o item -- ver
/// `itens::remover` --, entao ela so aparece com um arquivo editado a mao ou
/// copiado de outra campanha, e um quadro vazio na grade nao ajudaria ninguem a
/// entender isso.
pub fn listar(vault: &Vault, personagem: &str) -> AppResult<Vec<NoInventario>> {
    let catalogo = itens::por_id(itens::load(vault)?);

    Ok(load(vault, personagem)?
        .iter()
        .filter_map(|entrada| {
            catalogo
                .get(&entrada.item_id)
                .map(|item| NoInventario::de(item.clone(), entrada))
        })
        .collect())
}

/// O que aquele autor pode VER.
///
/// O mestre ve tudo; o jogador nao ve o escondido -- nem o escondido que ele
/// mesmo teria criado, o que nao acontece porque `add` nao deixa o jogador
/// esconder nada. E, dos itens que ve, nao ve o atributo e o medidor
/// escondidos: ver `sem_ocultos`.
pub fn visiveis(itens: Vec<NoInventario>, para: Autor) -> Vec<NoInventario> {
    match para {
        Autor::Mestre => itens,
        Autor::Jogador => itens
            .into_iter()
            .filter(|item| !item.escondido)
            .map(sem_ocultos)
            .collect(),
    }
}

/// O item sem os atributos e medidores escondidos, e sem o valor destes.
///
/// Para TODA resposta ao celular que leva um item -- a lista, e tambem o que
/// o POST, o PATCH e o PUT da foto devolvem. Cortado aqui, e nao na tela, pelo
/// motivo de sempre: o "amaldicoado" que chega ao celular e some no React ja
/// esta no JSON que o navegador guardou.
///
/// Do item que o jogador mesmo escreveu tambem: o mestre pode ter acrescentado
/// a ele um atributo escondido, e o autor do item nao e dono do segredo.
pub fn sem_ocultos(mut no: NoInventario) -> NoInventario {
    no.item.atributos.retain(|atributo| !atributo.escondido);
    no.item.medidores.retain(|medidor| !medidor.escondido);

    let medidores = &no.item.medidores;
    no.atuais
        .retain(|id, _| medidores.iter().any(|medidor| &medidor.id == id));

    no
}

/// Quem pede, por este personagem, pode mexer neste item?
///
/// O mestre alcanca tudo -- e o lado dele da segmentacao, o mesmo dos anexos. O
/// jogador so o que ele proprio criou, e so pelo personagem por onde criou: o
/// item que o mestre pos ali e leitura para ele, e nao pode sumir porque alguem
/// se irritou com a sessao; o que o jogador do Edgar escreveu e o mestre deu
/// tambem a Mira e leitura para a Mira, pelo mesmo motivo.
///
/// Publica porque o daemon pergunta ANTES de receber uma foto -- ver
/// `set_inventory_image` em `serve`.
pub fn pode_mexer(item: &Item, personagem: &str, quem: Autor) -> bool {
    quem == Autor::Mestre
        || (item.autor == Autor::Jogador && item.criado_por.as_deref() == Some(personagem))
}

fn nao_e_seu(item_id: &str) -> AppError {
    AppError::Malformed {
        file: ARQUIVO.into(),
        cause: format!("o item {item_id} nao e seu"),
    }
}

fn nao_esta_aqui(item_id: &str) -> AppError {
    AppError::Malformed {
        file: ARQUIVO.into(),
        cause: format!("o item {item_id} nao esta neste inventario"),
    }
}

/// Zero unidades seria um item que existe e nao existe ao mesmo tempo, e a
/// grade mostraria um quadro com "0" embaixo. Quem chegou a zero quer remover.
fn quantidade_valida(valor: u32) -> u32 {
    valor.max(1)
}

/// O que se informa para criar um item ja dentro de um inventario. Tudo
/// opcional menos o nome.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Novo {
    #[serde(default)]
    pub nome: String,
    #[serde(default)]
    pub descricao: String,
    #[serde(default)]
    pub quantidade: Option<u32>,
    /// So o mestre. A do celular e ignorada -- ver `add`.
    #[serde(default)]
    pub imagem: Option<Imagem>,
    /// So o mestre. Um `true` vindo do celular e ignorado -- ver `add`.
    #[serde(default)]
    pub escondido: bool,
    /// So o mestre, como os dois abaixo. Ver `itens::Novo` e `catalogo_permitido`.
    #[serde(default)]
    pub atributos: Option<Vec<AtributoDoItem>>,
    /// A DEFINICAO dos medidores do item. O valor nasce cheio -- nao ha o que
    /// informar dele na criacao.
    #[serde(default)]
    pub medidores: Option<Vec<Modelo>>,
}

/// A imagem que o jogador pode mandar em JSON: nenhuma.
///
/// A foto do jogador entra pelo multipart -- `set_inventory_image` em `serve`
/// --, que grava o arquivo e escreve a `Imagem` do lado do servidor, com o
/// personagem por onde ela chegou. Aceitar a uniao inteira no corpo deixaria o
/// celular apontar o proprio item para `personagens/{outro}/anexos/mestre/...`,
/// e a rota da imagem do inventario serviria o arquivo de um personagem que nao
/// e dele. Asset seria inofensivo -- o acervo ja e publico em `/asset/{id}` --,
/// mas nenhuma tela do celular o escolhe, e uma regra so e mais facil de
/// conferir do que uma excecao.
fn imagem_permitida(imagem: Option<Imagem>, quem: Autor) -> Option<Imagem> {
    match quem {
        Autor::Mestre => imagem,
        Autor::Jogador => None,
    }
}

/// Atributos e medidores do item -- a definicao na criacao, o valor na
/// mochila -- que o pedido pode escrever: so os do mestre.
///
/// A tela do celular nao edita nenhum deles, e aceita-los do corpo seria
/// deixar um pedido montado a mao reescrever a ficha que o mestre montou no
/// item -- inclusive apagar o atributo escondido que o jogador nem ve -- ou
/// encher a carga da varinha que o mestre vinha descontando. Ignorado em
/// silencio, e nao recusado, como o `escondido`: o resto do pedido e
/// legitimo.
fn catalogo_permitido<T>(lista: Option<T>, quem: Autor) -> Option<T> {
    match quem {
        Autor::Mestre => lista,
        Autor::Jogador => None,
    }
}

/// Cria um item no catalogo e o poe neste inventario, numa vez so.
///
/// E o "+" da ficha e o "novo item" do celular: quem cria pela mochila quer o
/// item NA mochila, e criar no catalogo e depois dar seriam duas gravacoes com
/// uma janela entre elas. O item do jogador guarda o personagem por onde
/// nasceu -- e o que `pode_mexer` confere depois.
///
/// O catalogo e gravado antes do inventario: se o aplicativo cair entre os
/// dois, sobra um item sem dono no catalogo, que o mestre ve e apaga; na ordem
/// inversa sobraria uma entrada apontando para nada.
pub fn add(vault: &Vault, personagem: &str, autor: Autor, novo: Novo) -> AppResult<NoInventario> {
    characters::exige(vault, personagem)?;

    let _vez = itens::travar();

    let mut catalogo = itens::load(vault)?;
    let mut entradas = load(vault, personagem)?;

    if autor == Autor::Jogador {
        let dos_jogadores = {
            let por_id = itens::por_id(catalogo.clone());
            entradas
                .iter()
                .filter(|entrada| {
                    por_id
                        .get(&entrada.item_id)
                        .is_some_and(|item| item.autor == Autor::Jogador)
                })
                .count()
        };

        if dos_jogadores >= MAX_ITENS_POR_AUTOR {
            return Err(AppError::Malformed {
                file: ARQUIVO.into(),
                cause: format!("o limite e de {MAX_ITENS_POR_AUTOR} itens"),
            });
        }
    }

    let item = itens::montar(
        &mut catalogo,
        autor,
        Some(personagem),
        itens::Novo {
            nome: novo.nome,
            descricao: novo.descricao,
            imagem: imagem_permitida(novo.imagem, autor),
            atributos: catalogo_permitido(novo.atributos, autor),
            medidores: catalogo_permitido(novo.medidores, autor),
        },
    )?;

    let entrada = Entrada {
        item_id: item.id.clone(),
        quantidade: quantidade_valida(novo.quantidade.unwrap_or(1)),
        // Esconder e do mestre. O campo chega no corpo de uma rota que o
        // celular tambem chama, e aceita-lo de la deixaria o jogador criar item
        // que o proprio celular dele nao lista de volta -- confuso para ele, e
        // um buraco na regra para quem monta o pedido a mao.
        escondido: novo.escondido && autor == Autor::Mestre,
        adicionado_em: item.criado_em,
        // Cheio: medidor sem valor na entrada e medidor cheio. Ver `atuais`.
        medidores: BTreeMap::new(),
    };

    itens::save(vault, &catalogo)?;
    entradas.push(entrada.clone());
    save(vault, personagem, &entradas)?;

    Ok(NoInventario::de(item, &entrada))
}

/// Da um item do catalogo a um personagem: o arrasto da janela de Itens para a
/// ficha, ou para o token.
///
/// So o mestre chega aqui -- e comando de IPC, sem rota no daemon. Se o
/// personagem ja tem o item, SOMA a quantidade: dar mais uma pocao a quem ja
/// tem duas e ficar com tres, e nao com duas linhas de "Pocao" na grade. Sem
/// quantidade, uma.
///
/// Nova, a entrada nasce visivel: quem quer esconder o que deu esconde depois,
/// na ficha, e um item dado as escondidas por padrao seria um item que o
/// jogador nunca recebe. E com os medidores cheios. Quem ja tinha o item fica
/// com os valores que tinha: as unidades a mais entram na mesma linha, e a
/// linha tem um valor so por medidor.
pub fn dar(
    vault: &Vault,
    personagem: &str,
    item_id: &str,
    quantidade: Option<u32>,
) -> AppResult<NoInventario> {
    characters::exige(vault, personagem)?;

    let _vez = itens::travar();

    let item = itens::load(vault)?
        .into_iter()
        .find(|item| item.id == item_id)
        .ok_or_else(|| itens::nao_existe(item_id))?;

    // O molde nao e de ninguem: na mochila, ele seria o item do jogador, e
    // preparar a espada no Compendio mexeria na espada de quem a carrega.
    if item.compendio {
        return Err(AppError::Recusado(crate::texto!(
            "Um molde do Compêndio não vai para a mochila. Ponha em jogo antes de dar.",
            "A Compendium template can't go in a backpack. Put it in play before giving it."
        )));
    }

    let mais = quantidade_valida(quantidade.unwrap_or(1));
    let mut entradas = load(vault, personagem)?;

    let entrada = match entradas
        .iter_mut()
        .find(|entrada| entrada.item_id == item_id)
    {
        Some(entrada) => {
            entrada.quantidade = entrada.quantidade.saturating_add(mais);
            entrada.clone()
        }
        None => {
            let entrada = Entrada {
                item_id: item_id.to_string(),
                quantidade: mais,
                escondido: false,
                adicionado_em: now_ms(),
                medidores: BTreeMap::new(),
            };
            entradas.push(entrada.clone());
            entrada
        }
    };

    save(vault, personagem, &entradas)?;

    Ok(NoInventario::de(item, &entrada))
}

/// O que se pode trocar num item, visto de um inventario. `None` = nao mexe.
///
/// `nome`, `descricao` e `imagem` vao para o CATALOGO -- mudam o item em todo
/// inventario que o tem. `quantidade`, `escondido` e `atuais` ficam nesta
/// entrada.
///
/// `imagem` e `Option<Option<_>>` de proposito: ausente nao mexe, e presente
/// com `null` LIMPA. Ver `itens::presente`.
///
/// Os `atributos` e a definicao dos `medidores` do item NAO passam por aqui,
/// so por `itens::Patch` (`item_update`): sao listas inteiras do catalogo, e
/// a tela do mestre as edita na ficha do item, e nao da mochila. Aceita-las
/// aqui tambem daria dois caminhos para a mesma escrita, e um corpo com
/// `medidores` (a definicao) ao lado de `atuais` (o valor) que ninguem le sem
/// consultar o codigo. Chegando no corpo, sao ignoradas como campo
/// desconhecido -- inclusive do celular.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Patch {
    #[serde(default)]
    pub nome: Option<String>,
    #[serde(default)]
    pub descricao: Option<String>,
    #[serde(default)]
    pub quantidade: Option<u32>,
    #[serde(default, deserialize_with = "itens::presente")]
    pub imagem: Option<Option<Imagem>>,
    #[serde(default)]
    pub escondido: Option<bool>,
    /// So o mestre. O valor atual de medidores do item NESTA mochila, pelo id
    /// do medidor -- a mesma forma de `NoInventario::atuais`, que e onde a tela
    /// o le. Grava em `Entrada::medidores`.
    ///
    /// MESCLA, e nao troca: o que nao vem fica como estava, e e o gesto da
    /// mesa -- baixar a durabilidade da espada depois do golpe -- que mexe num
    /// medidor por vez. Cada valor e preso entre zero e o maximo do medidor;
    /// id que o item nao tem e ignorado, para a entrada nao guardar chave que
    /// nenhuma leitura usa.
    #[serde(default)]
    pub atuais: Option<BTreeMap<String, i64>>,
}

/// A entrada e o item dela, conferidos: o item esta neste inventario, existe
/// no catalogo, e quem pede pode mexer nele.
///
/// A entrada primeiro: um item que existe no catalogo mas nao esta neste
/// inventario nao e alcancavel por aqui -- o celular so mexe no que esta na
/// mochila do personagem dele, e o id de um item de outra mochila nao pode
/// virar porta de entrada para editar.
fn conferido(
    vault: &Vault,
    personagem: &str,
    item_id: &str,
    quem: Autor,
) -> AppResult<(Vec<Entrada>, usize, Item)> {
    let entradas = load(vault, personagem)?;
    let posicao = entradas
        .iter()
        .position(|entrada| entrada.item_id == item_id)
        .ok_or_else(|| nao_esta_aqui(item_id))?;

    let item = itens::load(vault)?
        .into_iter()
        .find(|item| item.id == item_id)
        .ok_or_else(|| itens::nao_existe(item_id))?;

    if !pode_mexer(&item, personagem, quem) {
        return Err(nao_e_seu(item_id));
    }

    Ok((entradas, posicao, item))
}

pub fn update(
    vault: &Vault,
    personagem: &str,
    item_id: &str,
    patch: Patch,
    quem: Autor,
) -> AppResult<NoInventario> {
    let _vez = itens::travar();

    let (mut entradas, posicao, mut item) = conferido(vault, personagem, item_id, quem)?;

    let do_item = itens::Patch {
        nome: patch.nome,
        descricao: patch.descricao,
        // O jogador so LIMPA a imagem por aqui; trocar e pelo multipart. Ver
        // `imagem_permitida`.
        imagem: match (patch.imagem, quem) {
            (Some(None), _) => Some(None),
            (Some(imagem), Autor::Mestre) => Some(imagem),
            _ => None,
        },
        // Listas do catalogo so por `itens::editar`. Ver `Patch`.
        atributos: None,
        medidores: None,
    };

    if !do_item.vazio() {
        item = itens::editar_destravado(vault, item_id, do_item)?;
    }

    let entrada = &mut entradas[posicao];
    let antes = entrada.clone();

    if let Some(quantidade) = patch.quantidade {
        entrada.quantidade = quantidade_valida(quantidade);
    }

    // Esconder continua sendo do mestre, tambem na edicao: sem esta checagem, o
    // jogador esconderia do mestre o item que ele mesmo criou.
    if let (Some(escondido), Autor::Mestre) = (patch.escondido, quem) {
        entrada.escondido = escondido;
    }

    // O valor dos medidores tambem e do mestre: a tela do celular so le, e a
    // durabilidade da espada e o mestre quem desconta.
    if let Some(valores) = catalogo_permitido(patch.atuais, quem) {
        for (id, valor) in valores {
            if let Some(medidor) = item.medidores.iter().find(|medidor| medidor.id == id) {
                entrada.medidores.insert(id, valor.clamp(0, medidor.maximo));
            }
        }
    }

    // A poda preguicosa: ja que a entrada vai ser gravada, sai o valor de
    // medidor que o item nao tem mais. Ver `Entrada::medidores`.
    entrada
        .medidores
        .retain(|id, _| item.medidores.iter().any(|medidor| &medidor.id == id));

    let entrada = entrada.clone();
    if entrada != antes {
        save(vault, personagem, &entradas)?;
    }

    Ok(NoInventario::de(item, &entrada))
}

/// Tira o item DESTE inventario.
///
/// Do mestre, tira so a entrada: o item continua no catalogo, porque item e
/// item -- a espada que saiu da mochila do Edgar ainda existe, e pode ir para o
/// chao do mapa ou para outra ficha.
///
/// Do jogador, so o que ele mesmo criou por este personagem (ver `pode_mexer`),
/// e se ninguem mais carrega o item ele sai do CATALOGO tambem, com a foto
/// dele. E a nota que o jogador escreveu e apagou: deixa-la no catalogo do
/// mestre seria guardar o que o autor jogou fora. Se outro inventario ainda o
/// tem -- o mestre o deu a mais alguem --, o item fica, e sai so desta mochila.
pub fn remove(vault: &Vault, personagem: &str, item_id: &str, quem: Autor) -> AppResult<()> {
    let _vez = itens::travar();

    let (entradas, posicao) = match quem {
        // O mestre alcanca tambem a entrada que aponta para um item que nao
        // existe mais: e a unica forma de limpar uma, e ela nao aparece em
        // listagem nenhuma para ser conferida.
        Autor::Mestre => {
            let entradas = load(vault, personagem)?;
            let posicao = entradas
                .iter()
                .position(|entrada| entrada.item_id == item_id)
                .ok_or_else(|| nao_esta_aqui(item_id))?;
            (entradas, posicao)
        }
        Autor::Jogador => {
            let (entradas, posicao, _) = conferido(vault, personagem, item_id, quem)?;
            (entradas, posicao)
        }
    };

    let mut restantes = entradas;
    restantes.remove(posicao);
    save(vault, personagem, &restantes)?;

    if quem == Autor::Jogador && !carregado_por_alguem(vault, item_id)? {
        itens::remover_destravado(vault, item_id)?;
    }

    Ok(())
}

/// Algum inventario ainda tem este item?
fn carregado_por_alguem(vault: &Vault, item_id: &str) -> AppResult<bool> {
    for personagem in characters::todos_os_ids(vault)? {
        if load(vault, &personagem)?
            .iter()
            .any(|entrada| entrada.item_id == item_id)
        {
            return Ok(true);
        }
    }

    Ok(false)
}

/// Troca a foto de um item pelo anexo recem-gravado pelo celular.
///
/// O anexo e do personagem por onde chegou: `anexos/{autor}` dentro da pasta
/// DELE, mesmo que o item tenha sido dado tambem a outros. Confere de novo,
/// agora sob a trava, o que o daemon conferiu antes de receber o arquivo: entre
/// as duas conferencias o upload levou segundos, e o mestre pode ter tirado o
/// item da mochila nesse meio tempo.
pub fn set_imagem_anexo(
    vault: &Vault,
    personagem: &str,
    item_id: &str,
    arquivo: &str,
    quem: Autor,
) -> AppResult<NoInventario> {
    let _vez = itens::travar();

    let (entradas, posicao, _) = conferido(vault, personagem, item_id, quem)?;
    let item = itens::set_imagem_anexo_destravado(vault, item_id, personagem, quem, arquivo)?;

    Ok(NoInventario::de(item, &entradas[posicao]))
}

/// Passa um item de um personagem para outro.
///
/// So o mestre chega aqui: e comando de IPC, sem rota equivalente no daemon. O
/// jogador entregando item a outro jogador seria uma transferencia entre dois
/// personagens que ele nao necessariamente tem os dois, e a mesa resolve isso
/// pedindo ao mestre.
///
/// Move a ENTRADA, e nada no disco alem dos dois inventarios: o item e o mesmo,
/// e a foto dele continua na pasta de quem a subiu -- ver `itens::Imagem`. Se
/// o destino ja tem o item, as quantidades SOMAM, e o `escondido` do destino
/// fica; se nao tem, a entrada chega como estava, escondida ou nao.
///
/// Os valores dos medidores vao com a entrada: a espada que passa do Edgar a
/// Mira em 7/10 chega em 7/10, porque e a mesma espada. Se o destino ja tinha o
/// item, ficam os do destino, como o `escondido`.
///
/// O destino e gravado antes da origem: se o aplicativo cair entre os dois, o
/// item fica nos dois inventarios -- um a mais que o mestre tira --, em vez de
/// em nenhum.
pub fn mover(vault: &Vault, de: &str, para: &str, item_id: &str) -> AppResult<NoInventario> {
    if de == para {
        return Err(AppError::Malformed {
            file: ARQUIVO.into(),
            cause: "o item ja esta nesse personagem".into(),
        });
    }

    characters::exige(vault, para)?;

    let _vez = itens::travar();

    let (origem, posicao, item) = conferido(vault, de, item_id, Autor::Mestre)?;
    let movida = origem[posicao].clone();

    let mut destino = load(vault, para)?;
    let entrada = match destino
        .iter_mut()
        .find(|entrada| entrada.item_id == item_id)
    {
        Some(entrada) => {
            entrada.quantidade = entrada.quantidade.saturating_add(movida.quantidade);
            entrada.clone()
        }
        None => {
            destino.push(movida.clone());
            movida
        }
    };
    save(vault, para, &destino)?;

    let restantes: Vec<Entrada> = origem
        .into_iter()
        .filter(|entrada| entrada.item_id != item_id)
        .collect();
    save(vault, de, &restantes)?;

    Ok(NoInventario::de(item, &entrada))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> (tempfile::TempDir, Vault, String) {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::create(dir.path().join("campanha"), "Campanha").unwrap();
        let personagem = characters::create(&vault, "Edgar").unwrap().id;
        (dir, vault, personagem)
    }

    fn novo(nome: &str) -> Novo {
        Novo {
            nome: nome.to_string(),
            ..Novo::default()
        }
    }

    fn do_catalogo(vault: &Vault, nome: &str) -> Item {
        itens::criar(
            vault,
            Autor::Mestre,
            None,
            itens::Novo {
                nome: nome.to_string(),
                ..itens::Novo::default()
            },
        )
        .unwrap()
    }

    #[test]
    fn sem_arquivo_o_inventario_e_vazio() {
        let (_tmp, vault, p) = vault();

        assert!(load(&vault, &p).unwrap().is_empty());
        assert!(listar(&vault, &p).unwrap().is_empty());
    }

    #[test]
    fn cria_no_catalogo_e_no_inventario_de_uma_vez() {
        let (_tmp, vault, p) = vault();

        let item = add(
            &vault,
            &p,
            Autor::Jogador,
            Novo {
                nome: "Poção".into(),
                quantidade: Some(3),
                ..Novo::default()
            },
        )
        .unwrap();

        assert_eq!(item.item.nome, "Poção");
        assert_eq!(item.quantidade, 3);
        assert_eq!(item.item.autor, Autor::Jogador);
        // O item do jogador sabe por onde nasceu: e o que decide quem o edita.
        assert_eq!(item.item.criado_por.as_deref(), Some(p.as_str()));
        assert!(!item.escondido);

        assert_eq!(itens::load(&vault).unwrap(), vec![item.item.clone()]);
        assert_eq!(
            load(&vault, &p).unwrap(),
            vec![Entrada {
                item_id: item.item.id.clone(),
                quantidade: 3,
                escondido: false,
                adicionado_em: item.item.criado_em,
                medidores: BTreeMap::new(),
            }]
        );
    }

    #[test]
    fn a_forma_do_json_e_a_de_antes_com_criado_por() {
        let (_tmp, vault, p) = vault();

        let item = add(&vault, &p, Autor::Jogador, novo("Corda")).unwrap();
        let json = serde_json::to_value(&item).unwrap();

        // Achatado: a ficha e o celular leem `nome` e `quantidade` do mesmo
        // objeto, como liam quando o item morava no inventario.
        assert_eq!(json["id"], item.item.id.as_str());
        assert_eq!(json["nome"], "Corda");
        assert_eq!(json["descricao"], "");
        assert_eq!(json["autor"], "jogador");
        assert_eq!(json["criadoPor"], p.as_str());
        assert_eq!(json["quantidade"], 1);
        assert_eq!(json["escondido"], false);
        assert!(json["criadoEm"].is_i64());
        assert!(json.get("imagem").is_none());
        // Sem atributo e sem medidor, o item nao ganha chave nenhuma a mais; a
        // entrada traz o mapa vazio, que a tela le sem perguntar se existe.
        assert!(json.get("atributos").is_none());
        assert!(json.get("medidores").is_none());
        assert_eq!(json["atuais"], serde_json::json!({}));
    }

    #[test]
    fn nome_vazio_ganha_rotulo_e_quantidade_zero_vira_uma() {
        let (_tmp, vault, p) = vault();

        let item = add(
            &vault,
            &p,
            Autor::Mestre,
            Novo {
                nome: "   ".into(),
                quantidade: Some(0),
                ..Novo::default()
            },
        )
        .unwrap();

        assert_eq!(item.item.nome, "Item sem nome");
        assert_eq!(item.quantidade, 1);
        assert_eq!(item.item.criado_por, None);
    }

    #[test]
    fn texto_longo_trunca_em_vez_de_recusar() {
        let (_tmp, vault, p) = vault();

        let item = add(
            &vault,
            &p,
            Autor::Mestre,
            Novo {
                nome: "a".repeat(itens::MAX_NOME + 50),
                descricao: "b".repeat(itens::MAX_DESCRICAO + 50),
                ..Novo::default()
            },
        )
        .unwrap();

        assert_eq!(item.item.nome.chars().count(), itens::MAX_NOME);
        assert_eq!(item.item.descricao.chars().count(), itens::MAX_DESCRICAO);
    }

    #[test]
    fn jogador_nao_esconde_nem_criando_nem_editando() {
        let (_tmp, vault, p) = vault();

        let item = add(
            &vault,
            &p,
            Autor::Jogador,
            Novo {
                nome: "Adaga".into(),
                escondido: true,
                ..Novo::default()
            },
        )
        .unwrap();

        // O `true` do corpo foi ignorado: esconder e do mestre.
        assert!(!item.escondido);

        let editado = update(
            &vault,
            &p,
            &item.item.id,
            Patch {
                escondido: Some(true),
                ..Patch::default()
            },
            Autor::Jogador,
        )
        .unwrap();

        assert!(!editado.escondido);
    }

    #[test]
    fn jogador_nao_aponta_a_imagem_para_arquivo_de_ninguem() {
        let (_tmp, vault, p) = vault();
        let outro = characters::create(&vault, "Mira").unwrap().id;

        let alheia = Imagem::Anexo {
            personagem: outro.clone(),
            autor: Autor::Mestre,
            arquivo: "segredo.pdf".into(),
        };

        // Nem criando...
        let item = add(
            &vault,
            &p,
            Autor::Jogador,
            Novo {
                nome: "Isca".into(),
                imagem: Some(alheia.clone()),
                ..Novo::default()
            },
        )
        .unwrap();
        assert!(item.item.imagem.is_none());

        // ...nem editando. Limpar, sim.
        let editado = update(
            &vault,
            &p,
            &item.item.id,
            Patch {
                imagem: Some(Some(alheia)),
                ..Patch::default()
            },
            Autor::Jogador,
        )
        .unwrap();
        assert!(editado.item.imagem.is_none());
    }

    #[test]
    fn escondido_e_de_cada_inventario() {
        let (_tmp, vault, edgar) = vault();
        let mira = characters::create(&vault, "Mira").unwrap().id;

        add(&vault, &edgar, Autor::Mestre, novo("Adaga")).unwrap();
        let anel = do_catalogo(&vault, "Anel amaldiçoado");
        dar(&vault, &edgar, &anel.id, None).unwrap();
        dar(&vault, &mira, &anel.id, None).unwrap();

        update(
            &vault,
            &edgar,
            &anel.id,
            Patch {
                escondido: Some(true),
                ..Patch::default()
            },
            Autor::Mestre,
        )
        .unwrap();

        let do_mestre = visiveis(listar(&vault, &edgar).unwrap(), Autor::Mestre);
        assert_eq!(do_mestre.len(), 2);

        let do_jogador = visiveis(listar(&vault, &edgar).unwrap(), Autor::Jogador);
        assert_eq!(do_jogador.len(), 1);
        assert_eq!(do_jogador[0].item.nome, "Adaga");

        // Na mochila da Mira o mesmo anel continua visivel.
        assert_eq!(
            visiveis(listar(&vault, &mira).unwrap(), Autor::Jogador).len(),
            1
        );
    }

    #[test]
    fn jogador_nao_mexe_no_item_do_mestre() {
        let (_tmp, vault, p) = vault();

        let item = add(&vault, &p, Autor::Mestre, novo("Espada do mestre")).unwrap();

        assert!(update(
            &vault,
            &p,
            &item.item.id,
            Patch {
                nome: Some("Minha agora".into()),
                ..Patch::default()
            },
            Autor::Jogador,
        )
        .is_err());

        assert!(remove(&vault, &p, &item.item.id, Autor::Jogador).is_err());

        // E o item continua o que era, no catalogo e na mochila.
        let lista = listar(&vault, &p).unwrap();
        assert_eq!(lista.len(), 1);
        assert_eq!(lista[0].item.nome, "Espada do mestre");
    }

    #[test]
    fn jogador_nao_mexe_no_item_que_outro_jogador_escreveu() {
        let (_tmp, vault, edgar) = vault();
        let mira = characters::create(&vault, "Mira").unwrap().id;

        // O jogador do Edgar escreveu; o mestre deu a Mira tambem.
        let carta = add(&vault, &edgar, Autor::Jogador, novo("Carta do Edgar")).unwrap();
        dar(&vault, &mira, &carta.item.id, None).unwrap();

        let reescrita = Patch {
            nome: Some("Carta da Mira".into()),
            ..Patch::default()
        };
        assert!(update(
            &vault,
            &mira,
            &carta.item.id,
            reescrita.clone(),
            Autor::Jogador
        )
        .is_err());
        assert!(remove(&vault, &mira, &carta.item.id, Autor::Jogador).is_err());

        // Pelo Edgar, por onde nasceu, pode.
        let editada = update(&vault, &edgar, &carta.item.id, reescrita, Autor::Jogador).unwrap();
        assert_eq!(editada.item.nome, "Carta da Mira");
    }

    #[test]
    fn item_de_outra_mochila_nao_e_alcancavel_por_esta() {
        let (_tmp, vault, edgar) = vault();
        let mira = characters::create(&vault, "Mira").unwrap().id;

        // Criado pelo Edgar, mas so na mochila da Mira: o id nao pode virar
        // porta de entrada pela ficha do Edgar.
        let carta = add(&vault, &edgar, Autor::Jogador, novo("Carta")).unwrap();
        mover(&vault, &edgar, &mira, &carta.item.id).unwrap();

        assert!(update(
            &vault,
            &edgar,
            &carta.item.id,
            Patch::default(),
            Autor::Jogador
        )
        .is_err());
        assert!(remove(&vault, &edgar, &carta.item.id, Autor::Jogador).is_err());
    }

    #[test]
    fn mestre_mexe_no_item_do_jogador() {
        let (_tmp, vault, p) = vault();

        let item = add(&vault, &p, Autor::Jogador, novo("Corda")).unwrap();

        update(
            &vault,
            &p,
            &item.item.id,
            Patch {
                escondido: Some(true),
                nome: Some("Corda velha".into()),
                ..Patch::default()
            },
            Autor::Mestre,
        )
        .unwrap();

        let lista = listar(&vault, &p).unwrap();
        assert!(lista[0].escondido);
        assert_eq!(lista[0].item.nome, "Corda velha");
    }

    #[test]
    fn nome_vazio_no_patch_nao_apaga() {
        let (_tmp, vault, p) = vault();
        let item = add(&vault, &p, Autor::Mestre, novo("Tocha")).unwrap();

        update(
            &vault,
            &p,
            &item.item.id,
            Patch {
                nome: Some("  ".into()),
                ..Patch::default()
            },
            Autor::Mestre,
        )
        .unwrap();

        assert_eq!(listar(&vault, &p).unwrap()[0].item.nome, "Tocha");
    }

    #[test]
    fn quantidade_e_da_entrada_e_nome_e_do_catalogo() {
        let (_tmp, vault, edgar) = vault();
        let mira = characters::create(&vault, "Mira").unwrap().id;

        let pocao = do_catalogo(&vault, "Pocao");
        dar(&vault, &edgar, &pocao.id, None).unwrap();
        dar(&vault, &mira, &pocao.id, None).unwrap();

        update(
            &vault,
            &edgar,
            &pocao.id,
            Patch {
                quantidade: Some(5),
                nome: Some("Pocao de cura".into()),
                ..Patch::default()
            },
            Autor::Mestre,
        )
        .unwrap();

        let do_edgar = &listar(&vault, &edgar).unwrap()[0];
        let da_mira = &listar(&vault, &mira).unwrap()[0];
        assert_eq!((do_edgar.quantidade, da_mira.quantidade), (5, 1));
        assert_eq!(da_mira.item.nome, "Pocao de cura");
    }

    #[test]
    fn imagem_presente_com_null_limpa_e_ausente_nao_mexe() {
        let (_tmp, vault, p) = vault();

        let item = add(
            &vault,
            &p,
            Autor::Mestre,
            Novo {
                nome: "Elmo".into(),
                imagem: Some(Imagem::Asset {
                    id: "asset-1".into(),
                }),
                ..Novo::default()
            },
        )
        .unwrap();

        // Ausente: a imagem fica.
        let patch: Patch = serde_json::from_str(r#"{"nome":"Elmo runico"}"#).unwrap();
        update(&vault, &p, &item.item.id, patch, Autor::Mestre).unwrap();
        assert_eq!(
            listar(&vault, &p).unwrap()[0].item.imagem,
            Some(Imagem::Asset {
                id: "asset-1".into()
            })
        );

        // Presente com `null`: sai.
        let patch: Patch = serde_json::from_str(r#"{"imagem":null}"#).unwrap();
        update(&vault, &p, &item.item.id, patch, Autor::Mestre).unwrap();
        assert!(listar(&vault, &p).unwrap()[0].item.imagem.is_none());
    }

    #[test]
    fn limite_conta_so_o_que_o_jogador_escreveu() {
        let (_tmp, vault, p) = vault();

        for n in 0..MAX_ITENS_POR_AUTOR {
            add(&vault, &p, Autor::Jogador, novo(&format!("item {n}"))).unwrap();
        }

        assert!(add(&vault, &p, Autor::Jogador, novo("mais um")).is_err());

        // O mestre continua criando e dando: o teto e para o que chega pela
        // rede, e o gesto da janela dele nao precisa de cerca.
        assert!(add(&vault, &p, Autor::Mestre, novo("do mestre")).is_ok());
        let bau = do_catalogo(&vault, "Bau");
        assert!(dar(&vault, &p, &bau.id, None).is_ok());
    }

    #[test]
    fn dar_soma_a_quantidade_de_quem_ja_tem() {
        let (_tmp, vault, p) = vault();
        let pocao = do_catalogo(&vault, "Pocao");

        let primeira = dar(&vault, &p, &pocao.id, None).unwrap();
        assert_eq!(primeira.quantidade, 1);

        let depois = dar(&vault, &p, &pocao.id, Some(2)).unwrap();
        assert_eq!(depois.quantidade, 3);

        // Uma linha so na grade, com tres.
        assert_eq!(load(&vault, &p).unwrap().len(), 1);
    }

    #[test]
    fn dar_item_que_nao_existe_ou_a_ninguem_e_recusado() {
        let (_tmp, vault, p) = vault();
        let pocao = do_catalogo(&vault, "Pocao");

        assert!(dar(&vault, &p, "nao-existe", None).is_err());
        assert!(dar(&vault, "personagem-inventado", &pocao.id, None).is_err());
        assert!(load(&vault, &p).unwrap().is_empty());
        assert!(!characters::dir(&vault, "personagem-inventado").exists());
    }

    #[test]
    fn mestre_tira_da_mochila_e_o_item_fica_na_campanha() {
        let (_tmp, vault, p) = vault();

        let item = add(&vault, &p, Autor::Mestre, novo("Tocha")).unwrap();
        remove(&vault, &p, &item.item.id, Autor::Mestre).unwrap();

        assert!(load(&vault, &p).unwrap().is_empty());
        // Item e item: saiu da mochila, continua no catalogo.
        assert_eq!(itens::load(&vault).unwrap(), vec![item.item]);
    }

    #[test]
    fn jogador_apaga_o_que_escreveu_e_some_do_catalogo_com_a_foto() {
        let (_tmp, vault, p) = vault();

        let foto = characters::write_anexo(&vault, &p, "espada.png", b"png").unwrap();
        let item = add(&vault, &p, Autor::Jogador, novo("Espada")).unwrap();
        set_imagem_anexo(&vault, &p, &item.item.id, &foto.arquivo, Autor::Jogador).unwrap();

        remove(&vault, &p, &item.item.id, Autor::Jogador).unwrap();

        assert!(load(&vault, &p).unwrap().is_empty());
        assert!(itens::load(&vault).unwrap().is_empty());
        assert!(characters::list_anexos(&vault, &p).unwrap().is_empty());
    }

    #[test]
    fn jogador_apaga_o_que_escreveu_mas_quem_mais_tem_fica_com_ele() {
        let (_tmp, vault, edgar) = vault();
        let mira = characters::create(&vault, "Mira").unwrap().id;

        let carta = add(&vault, &edgar, Autor::Jogador, novo("Carta")).unwrap();
        dar(&vault, &mira, &carta.item.id, None).unwrap();

        remove(&vault, &edgar, &carta.item.id, Autor::Jogador).unwrap();

        // Saiu da mochila do Edgar; a Mira continua com ela, e ela continua
        // existindo.
        assert!(load(&vault, &edgar).unwrap().is_empty());
        assert_eq!(listar(&vault, &mira).unwrap()[0].item.nome, "Carta");
        assert_eq!(itens::load(&vault).unwrap().len(), 1);
    }

    #[test]
    fn mestre_limpa_a_entrada_que_aponta_para_nada() {
        let (_tmp, vault, p) = vault();

        let item = add(&vault, &p, Autor::Mestre, novo("Tocha")).unwrap();
        // O catalogo perdeu o item por fora -- arquivo editado a mao.
        itens::save(&vault, &[]).unwrap();

        // A leitura pula; o mestre ainda consegue tirar a entrada.
        assert!(listar(&vault, &p).unwrap().is_empty());
        assert!(remove(&vault, &p, &item.item.id, Autor::Jogador).is_err());
        remove(&vault, &p, &item.item.id, Autor::Mestre).unwrap();
        assert!(load(&vault, &p).unwrap().is_empty());
    }

    #[test]
    fn a_leitura_pula_entrada_sem_item() {
        let (_tmp, vault, p) = vault();

        let tocha = add(&vault, &p, Autor::Mestre, novo("Tocha")).unwrap();
        let mut entradas = load(&vault, &p).unwrap();
        entradas.push(Entrada {
            item_id: "sumiu".into(),
            quantidade: 2,
            escondido: false,
            adicionado_em: 0,
            medidores: BTreeMap::new(),
        });
        save(&vault, &p, &entradas).unwrap();

        assert_eq!(listar(&vault, &p).unwrap(), vec![tocha]);
    }

    #[test]
    fn trocar_a_imagem_apaga_a_anterior() {
        let (_tmp, vault, p) = vault();

        let velha = characters::write_anexo(&vault, &p, "velha.png", b"png").unwrap();
        let item = add(&vault, &p, Autor::Jogador, novo("Espada")).unwrap();
        set_imagem_anexo(&vault, &p, &item.item.id, &velha.arquivo, Autor::Jogador).unwrap();

        let nova = characters::write_anexo(&vault, &p, "nova.png", b"png").unwrap();
        let trocado =
            set_imagem_anexo(&vault, &p, &item.item.id, &nova.arquivo, Autor::Jogador).unwrap();

        let anexos = characters::list_anexos(&vault, &p).unwrap();
        assert_eq!(anexos.len(), 1);
        assert_eq!(anexos[0].arquivo, "nova.png");
        assert_eq!(
            trocado.item.imagem,
            Some(Imagem::Anexo {
                personagem: p.clone(),
                autor: Autor::Jogador,
                arquivo: "nova.png".into(),
            })
        );
    }

    #[test]
    fn foto_so_no_proprio_item() {
        let (_tmp, vault, p) = vault();

        let do_mestre = add(&vault, &p, Autor::Mestre, novo("Espada do mestre")).unwrap();

        assert!(set_imagem_anexo(&vault, &p, &do_mestre.item.id, "x.png", Autor::Jogador).is_err());
        assert!(listar(&vault, &p).unwrap()[0].item.imagem.is_none());
    }

    #[test]
    fn mover_leva_a_entrada_e_a_foto_fica_onde_esta() {
        let (_tmp, vault, de) = vault();
        let para = characters::create(&vault, "Mira").unwrap().id;

        let foto = characters::write_anexo(&vault, &de, "espada.png", b"png").unwrap();
        let item = add(
            &vault,
            &de,
            Autor::Jogador,
            Novo {
                nome: "Espada".into(),
                quantidade: Some(2),
                ..Novo::default()
            },
        )
        .unwrap();
        set_imagem_anexo(&vault, &de, &item.item.id, &foto.arquivo, Autor::Jogador).unwrap();

        let movido = mover(&vault, &de, &para, &item.item.id).unwrap();

        assert!(load(&vault, &de).unwrap().is_empty());
        assert_eq!(movido.quantidade, 2);
        assert_eq!(listar(&vault, &para).unwrap(), vec![movido.clone()]);

        // O arquivo nao mudou de pasta: a imagem diz em que personagem ela
        // mora, e quem carrega o item a ve pela rota da imagem do inventario.
        assert_eq!(characters::list_anexos(&vault, &de).unwrap().len(), 1);
        assert!(characters::list_anexos(&vault, &para).unwrap().is_empty());
        assert_eq!(
            movido.item.imagem,
            Some(Imagem::Anexo {
                personagem: de.clone(),
                autor: Autor::Jogador,
                arquivo: "espada.png".into(),
            })
        );
    }

    #[test]
    fn mover_para_quem_ja_tem_soma() {
        let (_tmp, vault, de) = vault();
        let para = characters::create(&vault, "Mira").unwrap().id;

        let pocao = do_catalogo(&vault, "Pocao");
        dar(&vault, &de, &pocao.id, Some(2)).unwrap();
        dar(&vault, &para, &pocao.id, Some(3)).unwrap();

        let movido = mover(&vault, &de, &para, &pocao.id).unwrap();

        assert_eq!(movido.quantidade, 5);
        assert_eq!(load(&vault, &para).unwrap().len(), 1);
        assert!(load(&vault, &de).unwrap().is_empty());
    }

    #[test]
    fn mover_mantem_o_escondido_da_entrada() {
        let (_tmp, vault, de) = vault();
        let para = characters::create(&vault, "Mira").unwrap().id;

        let anel = add(
            &vault,
            &de,
            Autor::Mestre,
            Novo {
                nome: "Anel".into(),
                escondido: true,
                ..Novo::default()
            },
        )
        .unwrap();

        assert!(mover(&vault, &de, &para, &anel.item.id).unwrap().escondido);
    }

    #[test]
    fn mover_para_o_mesmo_personagem_e_recusado() {
        let (_tmp, vault, p) = vault();
        let item = add(&vault, &p, Autor::Mestre, novo("Tocha")).unwrap();

        assert!(mover(&vault, &p, &p, &item.item.id).is_err());
        assert!(mover(&vault, &p, "personagem-inventado", &item.item.id).is_err());
        assert_eq!(load(&vault, &p).unwrap().len(), 1);
    }

    #[test]
    fn item_inventado_nao_passa() {
        let (_tmp, vault, p) = vault();

        assert!(update(&vault, &p, "nao-existe", Patch::default(), Autor::Mestre).is_err());
        assert!(remove(&vault, &p, "nao-existe", Autor::Mestre).is_err());
        assert!(mover(&vault, &p, "outro", "nao-existe").is_err());
    }

    fn medidor(id: &str, maximo: i64, escondido: bool) -> Modelo {
        Modelo {
            id: id.to_string(),
            nome: id.to_string(),
            cor: "#ef4444".into(),
            estilo: characters::Estilo::Barra,
            maximo,
            escondido,
            estilo_extensao: None,
            mostrar_nome: None,
            mostrar_valor: None,
        }
    }

    /// Uma espada do catalogo com Durabilidade 10 e Cargas 3.
    fn espada(vault: &Vault) -> Item {
        itens::criar(
            vault,
            Autor::Mestre,
            None,
            itens::Novo {
                nome: "Espada".into(),
                medidores: Some(vec![medidor("dur", 10, false), medidor("cargas", 3, false)]),
                ..itens::Novo::default()
            },
        )
        .unwrap()
    }

    fn valores(pares: &[(&str, i64)]) -> BTreeMap<String, i64> {
        pares.iter().map(|(id, v)| (id.to_string(), *v)).collect()
    }

    fn mexer_nos_medidores(
        vault: &Vault,
        personagem: &str,
        item: &str,
        pares: &[(&str, i64)],
        quem: Autor,
    ) -> NoInventario {
        update(
            vault,
            personagem,
            item,
            Patch {
                atuais: Some(valores(pares)),
                ..Patch::default()
            },
            quem,
        )
        .unwrap()
    }

    #[test]
    fn medidor_sem_valor_na_mochila_esta_cheio() {
        let (_tmp, vault, p) = vault();
        let espada = espada(&vault);

        let no = dar(&vault, &p, &espada.id, None).unwrap();

        assert_eq!(no.atuais, valores(&[("dur", 10), ("cargas", 3)]));
        // Cheio e a ausencia: a entrada nao grava nada para isso.
        assert!(load(&vault, &p).unwrap()[0].medidores.is_empty());
    }

    #[test]
    fn o_valor_e_preso_ao_maximo_e_id_desconhecido_e_ignorado() {
        let (_tmp, vault, p) = vault();
        let espada = espada(&vault);
        dar(&vault, &p, &espada.id, None).unwrap();

        let no = mexer_nos_medidores(
            &vault,
            &p,
            &espada.id,
            &[("dur", 15), ("cargas", -2), ("inventado", 4)],
            Autor::Mestre,
        );
        assert_eq!(no.atuais, valores(&[("dur", 10), ("cargas", 0)]));

        // MESCLA: mexer em um nao volta o outro ao cheio.
        let no = mexer_nos_medidores(&vault, &p, &espada.id, &[("dur", 7)], Autor::Mestre);
        assert_eq!(no.atuais, valores(&[("dur", 7), ("cargas", 0)]));

        // A chave inventada nao chegou ao disco.
        assert_eq!(
            load(&vault, &p).unwrap()[0].medidores,
            valores(&[("dur", 7), ("cargas", 0)])
        );
    }

    #[test]
    fn cada_mochila_tem_o_seu_valor() {
        let (_tmp, vault, edgar) = vault();
        let mira = characters::create(&vault, "Mira").unwrap().id;
        let espada = espada(&vault);
        dar(&vault, &edgar, &espada.id, None).unwrap();
        dar(&vault, &mira, &espada.id, None).unwrap();

        mexer_nos_medidores(&vault, &edgar, &espada.id, &[("dur", 7)], Autor::Mestre);

        assert_eq!(listar(&vault, &edgar).unwrap()[0].atuais["dur"], 7);
        assert_eq!(listar(&vault, &mira).unwrap()[0].atuais["dur"], 10);

        // Dar mais uma a quem ja tem nao mexe no valor da linha; mover leva o
        // valor junto, porque e a mesma espada.
        assert_eq!(dar(&vault, &edgar, &espada.id, None).unwrap().atuais["dur"], 7);
        let terceiro = characters::create(&vault, "Lobo").unwrap().id;
        assert_eq!(mover(&vault, &edgar, &terceiro, &espada.id).unwrap().atuais["dur"], 7);
    }

    #[test]
    fn encolher_o_maximo_prende_a_leitura_sem_reescrever_a_mochila() {
        let (_tmp, vault, p) = vault();
        let espada = espada(&vault);
        dar(&vault, &p, &espada.id, None).unwrap();
        mexer_nos_medidores(&vault, &p, &espada.id, &[("dur", 7)], Autor::Mestre);

        let com_maximo = |maximo: i64| itens::Patch {
            medidores: Some(vec![medidor("dur", maximo, false), medidor("cargas", 3, false)]),
            ..itens::Patch::default()
        };

        itens::editar(&vault, &espada.id, com_maximo(5)).unwrap();
        assert_eq!(listar(&vault, &p).unwrap()[0].atuais["dur"], 5);
        assert_eq!(load(&vault, &p).unwrap()[0].medidores["dur"], 7);

        // O maximo que volta a crescer devolve o que estava guardado.
        itens::editar(&vault, &espada.id, com_maximo(10)).unwrap();
        assert_eq!(listar(&vault, &p).unwrap()[0].atuais["dur"], 7);
    }

    #[test]
    fn medidor_que_sai_do_item_sai_dos_atuais_e_da_entrada_na_escrita() {
        let (_tmp, vault, p) = vault();
        let espada = espada(&vault);
        dar(&vault, &p, &espada.id, None).unwrap();
        mexer_nos_medidores(&vault, &p, &espada.id, &[("dur", 7), ("cargas", 1)], Autor::Mestre);

        itens::editar(
            &vault,
            &espada.id,
            itens::Patch {
                medidores: Some(vec![medidor("cargas", 3, false)]),
                ..itens::Patch::default()
            },
        )
        .unwrap();

        assert_eq!(listar(&vault, &p).unwrap()[0].atuais, valores(&[("cargas", 1)]));
        // A entrada ainda guarda a durabilidade: a edicao do item nao abriu
        // mochila nenhuma...
        assert!(load(&vault, &p).unwrap()[0].medidores.contains_key("dur"));

        // ...e a primeira escrita desta entrada a poda.
        update(
            &vault,
            &p,
            &espada.id,
            Patch {
                quantidade: Some(2),
                ..Patch::default()
            },
            Autor::Mestre,
        )
        .unwrap();
        assert_eq!(load(&vault, &p).unwrap()[0].medidores, valores(&[("cargas", 1)]));
    }

    #[test]
    fn jogador_nao_escreve_atributo_nem_medidor() {
        let (_tmp, vault, p) = vault();

        let dur = vec![medidor("dur", 10, false)];
        let anotado = vec![itens::AtributoDoItem {
            id: String::new(),
            nome: "Dano".into(),
            valor: "1d4".into(),
            escondido: false,
        }];

        // Criando pelo celular: o corpo traz os dois, e os dois sao ignorados.
        let corda = add(
            &vault,
            &p,
            Autor::Jogador,
            Novo {
                nome: "Corda".into(),
                atributos: Some(anotado.clone()),
                medidores: Some(dur.clone()),
                ..Novo::default()
            },
        )
        .unwrap();
        assert!(corda.item.atributos.is_empty());
        assert!(corda.item.medidores.is_empty());

        // O mestre poe a ficha no item que o jogador escreveu...
        itens::editar(
            &vault,
            &corda.item.id,
            itens::Patch {
                atributos: Some(anotado),
                medidores: Some(dur),
                ..itens::Patch::default()
            },
        )
        .unwrap();

        // ...e o jogador, mesmo dono do item, nao a reescreve nem mexe no
        // valor. Pelo JSON, como o celular manda: as listas do catalogo nem
        // sao campo deste patch.
        let patch: Patch =
            serde_json::from_str(r#"{"atributos":[],"medidores":[],"atuais":{"dur":1}}"#).unwrap();
        let editado = update(&vault, &p, &corda.item.id, patch, Autor::Jogador).unwrap();
        assert_eq!(editado.item.atributos.len(), 1);
        assert_eq!(editado.item.medidores.len(), 1);
        assert_eq!(editado.atuais["dur"], 10);
        assert!(load(&vault, &p).unwrap()[0].medidores.is_empty());

        // Nem o mestre troca a lista do catalogo por aqui: e `itens::editar`.
        let patch: Patch = serde_json::from_str(r#"{"atributos":[]}"#).unwrap();
        update(&vault, &p, &corda.item.id, patch, Autor::Mestre).unwrap();
        assert_eq!(itens::load(&vault).unwrap()[0].atributos.len(), 1);
    }

    #[test]
    fn o_jogador_nao_ve_atributo_nem_medidor_escondido() {
        let (_tmp, vault, p) = vault();

        let anel = add(
            &vault,
            &p,
            Autor::Mestre,
            Novo {
                nome: "Anel".into(),
                atributos: Some(vec![
                    itens::AtributoDoItem {
                        id: "brilho".into(),
                        nome: "Brilho".into(),
                        valor: "fraco".into(),
                        escondido: false,
                    },
                    itens::AtributoDoItem {
                        id: "maldicao".into(),
                        nome: "Maldicao".into(),
                        valor: "nao sai do dedo".into(),
                        escondido: true,
                    },
                ]),
                medidores: Some(vec![medidor("cargas", 3, false), medidor("corrupcao", 5, true)]),
                ..Novo::default()
            },
        )
        .unwrap();
        mexer_nos_medidores(&vault, &p, &anel.item.id, &[("corrupcao", 2)], Autor::Mestre);

        let do_mestre = &visiveis(listar(&vault, &p).unwrap(), Autor::Mestre)[0];
        assert_eq!(do_mestre.item.atributos.len(), 2);
        assert_eq!(do_mestre.atuais, valores(&[("cargas", 3), ("corrupcao", 2)]));

        let do_jogador = &visiveis(listar(&vault, &p).unwrap(), Autor::Jogador)[0];
        let ids: Vec<&str> = do_jogador.item.atributos.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(ids, ["brilho"]);
        let ids: Vec<&str> = do_jogador.item.medidores.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(ids, ["cargas"]);
        assert_eq!(do_jogador.atuais, valores(&[("cargas", 3)]));

        let json = serde_json::to_string(do_jogador).unwrap();
        assert!(!json.contains("nao sai do dedo") && !json.contains("corrupcao"), "{json}");
    }

    #[test]
    fn remover_o_personagem_leva_o_inventario_e_nao_o_item() {
        let (_tmp, vault, p) = vault();
        let item = add(&vault, &p, Autor::Mestre, novo("Tocha")).unwrap();

        characters::remove(&vault, &p).unwrap();

        // A pasta inteira sai em `characters::remove`, e o inventario mora
        // dentro dela -- nao ha indice separado a limpar. O item e da campanha
        // e continua nela.
        assert!(!characters::dir(&vault, &p).exists());
        assert!(load(&vault, &p).unwrap().is_empty());
        assert_eq!(itens::load(&vault).unwrap(), vec![item.item]);
    }
}
