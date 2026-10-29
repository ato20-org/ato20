//! Os itens da campanha.
//!
//! Item e item: ele e da CAMPANHA, e nao de quem o carrega. O catalogo mora em
//! `itens.json`, na raiz do vault, e o inventario de cada personagem guarda so
//! referencias a ele -- ver `inventory`. A mesma pocao pode estar na mochila de
//! tres personagens, e corrigir o nome dela aqui corrige nos tres.
//!
//! Ate a versao 2 do vault o item morava DENTRO do inventario. Isso respondia
//! mal a duas coisas que a mesa pede: dar a mesma coisa a mais de um personagem
//! (eram copias, que divergiam na primeira correcao de digitacao) e ter itens
//! que ainda nao sao de ninguem -- o bau que o grupo nao abriu, o anel pregado
//! num ponto do mapa. A conversao esta em `migrar::itens_da_campanha`.
//!
//! O que e de UM inventario -- quantas unidades, e se o jogador daquele
//! personagem ve -- fica na entrada do inventario, e nao aqui: o mestre esconde
//! o anel amaldicoado na mochila de um e o mostra na de outro.
//!
//! Os ATRIBUTOS ("Dano: 1d8+2") sao do item, iguais em toda mochila. Os
//! MEDIDORES sao definidos aqui (nome, cor, maximo), mas o valor de cada um e
//! da entrada: a espada do Edgar em 7/10 de durabilidade e a da Mira em 10/10
//! sao o mesmo item. Ver `inventory::atuais`.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use serde::{Deserialize, Serialize};

use super::atomic::{read_json, write_json};
use super::characters::{self, Autor};
use super::modelos::{self, Modelo};
use super::{inventory, now_ms, Vault};
use crate::error::{AppError, AppResult};

/// O catalogo, na raiz do vault.
///
/// Um arquivo so, e nao um por item: a pergunta que mais se faz a ele e "quais
/// sao os itens", que a janela do mestre faz ao abrir, e mil arquivos pequenos
/// seriam mil leituras para responde-la. Viaja no zip sem nada a mais -- o
/// empacotador varre a raiz com `walk`, ver `zip::exportar`.
pub const ARQUIVO: &str = "itens.json";

/// Quantos itens a campanha pode ter, somados todos os autores.
///
/// Existe porque a criacao do jogador chega pela rede, e o catalogo e relido
/// inteiro a cada inventario listado: sem teto, um celular em laco faria cada
/// abertura de ficha ler megabytes. Cinco mil e mais do que qualquer campanha
/// real junta, e recusar acima disso e recusar, nao truncar -- nao ha "comeco"
/// de um item que valha guardar.
pub const MAX_ITENS_NA_CAMPANHA: usize = 5_000;

/// Tetos de texto, em CARACTERES e nao em bytes.
///
/// Truncam em vez de recusar, como a nota do jogador: quem colou um texto longo
/// prefere o comeco dele guardado a um erro que perde tudo.
pub(crate) const MAX_NOME: usize = 120;
pub(crate) const MAX_DESCRICAO: usize = 4_000;

/// Quantos atributos cabem num item.
///
/// O teto e de LEITURA, e nao de disco: e uma ficha de item, lida de relance na
/// janela do mestre e no celular, e duas dezenas de linhas ja e uma tabela que
/// ninguem le inteira. O que passar e cortado, e nao recusado -- a tela sempre
/// manda a lista inteira, e recusar perderia tambem as linhas que cabiam.
pub const MAX_ATRIBUTOS_DO_ITEM: usize = 24;

/// O teto do nome de um atributo, em caracteres. Um rotulo ("Dano", "Peso"),
/// e nao uma frase.
pub const MAX_NOME_DO_ATRIBUTO: usize = 40;

/// O teto do valor de um atributo, em caracteres. Cabe "1d8+2 cortante, +1d6
/// contra mortos-vivos"; o que e mais longo que isso e descricao.
pub const MAX_VALOR_DO_ATRIBUTO: usize = 120;

/// Quantos medidores cabem num item.
///
/// O mesmo teto do personagem, e pela mesma razao: e um limite de LAYOUT -- a
/// coluna de barras ao lado da imagem --, e um item com mais medidores que um
/// personagem desenharia uma coluna mais alta que a figura que ela acompanha.
pub const MAX_MEDIDORES_DO_ITEM: usize = characters::MAX_MEDIDORES;

/// A trava do catalogo E dos inventarios.
///
/// Antes cada inventario era um arquivo que so o seu personagem tocava, e a
/// janela entre ler e gravar era de uma pessoa so. Com um `itens.json` que o
/// mestre grava pelo IPC e varios celulares gravam pelo daemon -- cada um numa
/// thread --, ler, mudar e gravar sem trava perde atualizacao de verdade: dois
/// jogadores criando item no mesmo instante, e o segundo `save` apaga o item do
/// primeiro.
///
/// UMA trava para os dois arquivos, e nao uma por arquivo: quase toda operacao
/// mexe nos dois (criar pelo inventario grava o item e a entrada; remover do
/// catalogo limpa todos os inventarios), e duas travas pedidas em ordens
/// diferentes por dois caminhos sao um deadlock esperando acontecer. O custo e
/// serializar escritas que nao conflitariam -- sao milissegundos de disco numa
/// mesa de seis pessoas.
///
/// Tem um segundo motivo, menos visivel: `write_atomic` grava por um temporario
/// com o PID no nome, entao duas threads do mesmo processo gravando o mesmo
/// arquivo dividiriam o temporario. A trava tambem fecha isso.
///
/// Global ao processo, e nao do `Vault`: o `Vault` e clonado a cada pedido do
/// daemon, e uma trava dentro dele seria uma por copia. So uma campanha fica
/// aberta por vez, entao travar "a campanha" e travar o processo.
///
/// LER nao trava: a gravacao e atomica (`write_atomic`), e quem le ve o arquivo
/// velho inteiro ou o novo inteiro.
static TRAVA: Mutex<()> = Mutex::new(());

/// Toma a trava de `TRAVA`.
///
/// Envenenada, segue em frente: ela nao guarda dado nenhum, so a vez. Uma
/// thread que entrou em panico no meio de uma gravacao deixou, no pior caso, o
/// arquivo antigo inteiro -- `write_atomic` garante isso --, e recusar toda
/// escrita dali em diante seria trocar um panico isolado por um inventario que
/// nao grava mais ate reiniciar o aplicativo.
///
/// Quem segura a trava chama as funcoes `_destravado`, e NUNCA as publicas
/// deste modulo ou de `inventory`: o `Mutex` da biblioteca padrao nao e
/// reentrante, e a segunda tomada na mesma thread trava para sempre.
pub(crate) fn travar() -> MutexGuard<'static, ()> {
    TRAVA
        .lock()
        .unwrap_or_else(|envenenada| envenenada.into_inner())
}

/// De onde a imagem do item vem.
///
/// Uniao marcada, e nao dois campos opcionais, porque os dois bracos sao
/// exclusivos e tem transportes diferentes ate a TV:
///
/// `Asset` e o acervo, alcancavel por `/asset/{id}` sem token. E o que o mestre
/// escolhe, porque so ele importa para o acervo.
///
/// `Anexo` e a foto que o JOGADOR subiu do celular. Ela chega a mesa por
/// `character_attachment_share` -- um id sorteado em `/evidencia/{id}` que
/// morre quando sai do ar. Copiar esse arquivo para o acervo na transmissao
/// seria mais simples aqui e pior la: deixaria um duplicado por transmissao na
/// biblioteca de imagens. E a mesma decisao que `character_attachment_share` ja
/// tomou para a ficha.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum Imagem {
    /// Id do acervo.
    Asset { id: String },
    /// A foto de um jogador: mora em
    /// `personagens/{personagem}/anexos/{autor}/{arquivo}`, atras do token.
    ///
    /// Fica na pasta do personagem por onde foi enviada, e NAO e copiada para
    /// o acervo quando o item passa a outro inventario: o acervo e do mestre, e
    /// um celular na rede nao pode faze-lo crescer -- ver `set_inventory_image`
    /// em `serve`. Quem carrega o item por outro personagem a ve pela rota da
    /// imagem do inventario, que confere que o item esta no inventario DELE.
    ///
    /// `personagem`, e nao `personagemId`: o empacotador trata toda chave
    /// `personagemId` como "leve este personagem junto" -- ver
    /// `pacote::personagens_citados` --, e uma foto de item nao e motivo para
    /// arrastar o personagem para um pacote. O autor faz parte da
    /// identificacao, como sempre: "espada.png" do mestre e do jogador sao dois
    /// arquivos.
    Anexo {
        personagem: String,
        autor: Autor,
        arquivo: String,
    },
}

/// Um par nome e valor livre de um item: "Dano: 1d8+2 cortante", "Peso: 2 kg".
///
/// Texto e nao numero, ao contrario do atributo do personagem: o que se anota
/// num item e dado de dano, peso com unidade, alcance em metros -- e o app nao
/// faz conta com nenhum deles. Do ITEM, e nao da entrada: a espada corta igual
/// em qualquer mochila.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtributoDoItem {
    /// Como a tela diz em qual linha mexer. Vazio, ausente ou repetido ganha
    /// um uuid novo -- ver `atributos_validos`.
    #[serde(default)]
    pub id: String,
    pub nome: String,
    #[serde(default)]
    pub valor: String,
    /// O jogador nao ve: o "amaldicoado" que so se descobre ao vestir.
    /// Cortado no DAEMON, como o item escondido -- ver `inventory::sem_ocultos`.
    #[serde(default)]
    pub escondido: bool,
}

/// Uma coisa da campanha.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub nome: String,
    #[serde(default)]
    pub descricao: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub imagem: Option<Imagem>,
    /// Os pares nome e valor do item, na ordem da tela. Ver `AtributoDoItem`.
    ///
    /// Fora do JSON quando vazio, como a `imagem`: o item de sempre continua
    /// com a forma de antes, no disco e no fio.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub atributos: Vec<AtributoDoItem>,
    /// Os medidores que o item DEFINE: durabilidade, cargas, municao.
    ///
    /// Um `modelos::Modelo`, e nao um `Medidor`: o que mora aqui e o molde, sem
    /// valor atual. O valor e de cada mochila -- a espada do Edgar em 7/10, a
    /// da Mira em 10/10 -- e mora na entrada do inventario, ver
    /// `inventory::Entrada::medidores`. O mesmo tipo dos modelos da campanha
    /// para valerem as mesmas regras de nome, maximo e estilo de plugin.
    ///
    /// Encolher o `maximo` ou tirar um medidor daqui nao reescreve mochila
    /// nenhuma: a leitura prende o valor guardado ao maximo de hoje e ignora o
    /// de medidor que nao existe mais. Ver `inventory::atuais`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub medidores: Vec<Modelo>,
    /// Quem criou.
    ///
    /// Campo, e nao diretorio como nos anexos: item nao e arquivo, e a razao
    /// que fez o autor do anexo virar pasta -- o sistema de arquivos ser a
    /// verdade, sem indice para dessincronizar -- nao tem o que fazer aqui. O
    /// que ele decide e quem pode mexer: ver `inventory::pode_mexer`.
    pub autor: Autor,
    /// So no item criado por um jogador: o personagem pelo qual ele o criou.
    ///
    /// E o que decide quem pode edita-lo pelo celular. O autor sozinho nao
    /// basta desde que o item deixou de ser de um inventario so: o que o
    /// jogador do Edgar escreveu e o mestre deu tambem a Mira aparece no
    /// celular da Mira, e ela nao pode reescreve-lo. O personagem, e nao o
    /// jogador: o vinculo jogador-personagem vive no banco de estado, que nao
    /// viaja no zip, e o personagem e o que continua o mesmo do outro lado.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub criado_por: Option<String>,
    /// As tags do Compendio: "arma", "magico", "consumivel". Organizacao do
    /// mestre, para filtrar -- ver `compendio::normalizar_tags`. No item, e
    /// nao numa pasta do board, porque viajam com ele para o ATO20 e de volta.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    /// A aura de plugin do item: `{plugin}/{aura}`, a borda dourada do
    /// lendario. Ver `characters::Personagem::aura`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aura: Option<String>,
    /// Um MOLDE do Compendio, e nao um item da campanha: a espada preparada
    /// que ainda nao entrou no jogo. Fica no mesmo `itens.json`, e por isso se
    /// edita na mesma janela; quem lista separa -- o `useItensStore` guarda os
    /// moldes a parte, e a janela de Itens e as mochilas nao os veem. Nao vai
    /// para mochila nenhuma: `inventory::dar` recusa. Por em jogo copia o
    /// molde no catalogo -- ver `compendio::duplicar_item`.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub compendio: bool,
    /// De que item de plugin este molde foi trazido: `{plugin}/{colecao}/{item}`.
    ///
    /// So no MOLDE, como em `characters::Personagem::do_plugin`: e o que deixa
    /// a segunda pistola trazida do plugin sair do molde que a primeira deixou,
    /// sem trazer o item -- e a imagem dele -- de novo. A copia no catalogo nao
    /// a leva (`compendio::duplicar_item`). Ver
    /// `compendio::trazer_item_do_plugin`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub do_plugin: Option<String>,
    #[serde(rename = "criadoEm")]
    pub criado_em: i64,
}

fn path(vault: &Vault) -> PathBuf {
    vault.root.join(ARQUIVO)
}

/// O catalogo como esta no disco. Ver `listar` para a ordem da tela.
pub fn load(vault: &Vault) -> AppResult<Vec<Item>> {
    Ok(read_json(&path(vault))?.unwrap_or_default())
}

/// Grava o catalogo. Quem chama segura `travar`.
pub(crate) fn save(vault: &Vault, itens: &[Item]) -> AppResult<()> {
    write_json(&path(vault), &itens)
}

/// O catalogo inteiro, na ordem em que os itens nasceram.
///
/// Ordenado pela data, e nao pela posicao no arquivo: a migracao e a
/// importacao de pacote acrescentam itens antigos no fim, e a lista do mestre
/// os mostraria depois dos que ele criou ontem. Estavel, para dois itens da
/// mesma migracao manterem a ordem do inventario de onde vieram.
pub fn listar(vault: &Vault) -> AppResult<Vec<Item>> {
    let mut itens = load(vault)?;
    itens.sort_by_key(|item| item.criado_em);
    Ok(itens)
}

pub(crate) fn texto(valor: &str, teto: usize) -> String {
    valor.trim().chars().take(teto).collect()
}

/// Um id que ainda nao foi usado nesta lista: o que veio, ou um uuid novo se
/// veio vazio ou repetido.
///
/// Repetido ganha id novo, e nao derruba o pedido: duas linhas com o mesmo id
/// fariam a tela editar as duas com um clique, e o valor de um medidor na
/// mochila -- guardado pelo id -- valeria para os dois. A PRIMEIRA fica com o
/// id, que e a que ja existia na tela que mandou a lista.
fn id_unico(id: String, usados: &mut HashSet<String>) -> String {
    if !id.is_empty() && usados.insert(id.clone()) {
        return id;
    }

    loop {
        let novo = uuid::Uuid::new_v4().to_string();
        if usados.insert(novo.clone()) {
            return novo;
        }
    }
}

/// Os atributos em forma: textos aparados e cortados no teto, sem nome vazio,
/// no maximo `MAX_ATRIBUTOS_DO_ITEM`, cada um com id proprio.
///
/// Nome vazio sai, e nao vira "Atributo": e a linha nova que a tela abriu e
/// ninguem preencheu, e guarda-la poria um rotulo inventado na ficha. Valor
/// vazio fica -- "Amaldicoado" sem valor e um atributo inteiro. O corte do
/// teto vem DEPOIS de tirar os vazios, para uma linha em branco no meio nao
/// custar o lugar de uma preenchida no fim.
pub(crate) fn atributos_validos(lista: Vec<AtributoDoItem>) -> Vec<AtributoDoItem> {
    let mut usados = HashSet::new();

    lista
        .into_iter()
        .filter_map(|atributo| {
            let nome = texto(&atributo.nome, MAX_NOME_DO_ATRIBUTO);
            (!nome.is_empty()).then(|| AtributoDoItem {
                nome,
                valor: texto(&atributo.valor, MAX_VALOR_DO_ATRIBUTO),
                ..atributo
            })
        })
        .take(MAX_ATRIBUTOS_DO_ITEM)
        .map(|atributo| AtributoDoItem {
            id: id_unico(atributo.id.trim().to_string(), &mut usados),
            ..atributo
        })
        .collect()
}

/// Os medidores em forma: as regras do modelo da campanha (`modelos::normalizar`),
/// no maximo `MAX_MEDIDORES_DO_ITEM`, cada um com id proprio.
///
/// Nome vazio vira "Medidor", como no modelo, em vez de sair: o medidor tem
/// cor e maximo, e e uma linha que o mestre quis mesmo sem nome. O id importa
/// mais aqui do que no atributo: e a chave do valor guardado em cada mochila,
/// e a tela que manda a lista de volta tem de manter o id de quem ja existia
/// para o valor continuar valendo.
pub(crate) fn medidores_validos(lista: Vec<Modelo>) -> Vec<Modelo> {
    let mut usados = HashSet::new();

    lista
        .into_iter()
        .take(MAX_MEDIDORES_DO_ITEM)
        .map(|mut medidor| {
            modelos::normalizar(&mut medidor);
            medidor.id = id_unico(medidor.id.trim().to_string(), &mut usados);
            medidor
        })
        .collect()
}

pub(crate) fn nao_existe(item_id: &str) -> AppError {
    AppError::Malformed {
        file: ARQUIVO.into(),
        cause: format!("o item {item_id} nao existe"),
    }
}

/// O que se informa para criar um item no catalogo. Tudo opcional.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Novo {
    #[serde(default)]
    pub nome: String,
    #[serde(default)]
    pub descricao: String,
    #[serde(default)]
    pub imagem: Option<Imagem>,
    /// Ver `Item::atributos`. Passa por `atributos_validos`.
    #[serde(default)]
    pub atributos: Option<Vec<AtributoDoItem>>,
    /// Ver `Item::medidores`. Passa por `medidores_validos`.
    #[serde(default)]
    pub medidores: Option<Vec<Modelo>>,
}

/// Monta um item novo e o poe no catalogo em memoria. Nao grava.
///
/// Separado do `criar` para `inventory::add` poder criar o item e a entrada
/// numa vez so da trava, conferindo o limite do inventario ANTES de gravar
/// qualquer um dos dois arquivos.
pub(crate) fn montar(
    itens: &mut Vec<Item>,
    autor: Autor,
    criado_por: Option<&str>,
    novo: Novo,
) -> AppResult<Item> {
    if itens.len() >= MAX_ITENS_NA_CAMPANHA {
        return Err(AppError::Malformed {
            file: ARQUIVO.into(),
            cause: format!("a campanha ja tem {MAX_ITENS_NA_CAMPANHA} itens"),
        });
    }

    let nome = texto(&novo.nome, MAX_NOME);

    let item = Item {
        id: uuid::Uuid::new_v4().to_string(),
        // Nome vazio viraria um quadro sem legenda na grade, indistinguivel de
        // um slot vazio. O dono renomeia depois.
        nome: if nome.is_empty() {
            "Item sem nome".to_string()
        } else {
            nome
        },
        descricao: texto(&novo.descricao, MAX_DESCRICAO),
        imagem: novo.imagem,
        atributos: novo.atributos.map(atributos_validos).unwrap_or_default(),
        medidores: novo.medidores.map(medidores_validos).unwrap_or_default(),
        autor,
        // So o do jogador guarda por onde nasceu: e o que `pode_mexer` confere,
        // e o item do mestre nao tem para quem perguntar.
        criado_por: match autor {
            Autor::Jogador => criado_por.map(str::to_string),
            Autor::Mestre => None,
        },
        tags: Vec::new(),
        aura: None,
        compendio: false,
        do_plugin: None,
        criado_em: now_ms(),
    };

    itens.push(item.clone());

    Ok(item)
}

/// Cria um item no catalogo, sem inventario nenhum.
///
/// E o gesto do mestre na janela de Itens: o bau que ninguem abriu ainda. O
/// item criado pela ficha passa por `inventory::add`, que cria o item e a
/// entrada juntos.
pub fn criar(vault: &Vault, autor: Autor, criado_por: Option<&str>, novo: Novo) -> AppResult<Item> {
    let _vez = travar();

    let mut itens = load(vault)?;
    let item = montar(&mut itens, autor, criado_por, novo)?;
    save(vault, &itens)?;

    Ok(item)
}

/// O que se pode trocar num item do catalogo. `None` = nao mexe neste campo.
///
/// `imagem` e `Option<Option<_>>` de proposito: ausente nao mexe, e presente
/// com `null` LIMPA. Um `Option` so nao conseguiria dizer "tire a imagem".
///
/// `atributos` e `medidores`, presentes, TROCAM a lista inteira, e nao mesclam:
/// a tela edita a ficha do item como um todo e manda tudo, e mesclar exigiria
/// um jeito de dizer "esta linha saiu" que a lista inteira ja diz. Lista vazia
/// apaga todos; ausente nao mexe.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Patch {
    #[serde(default)]
    pub nome: Option<String>,
    #[serde(default)]
    pub descricao: Option<String>,
    #[serde(default, deserialize_with = "presente")]
    pub imagem: Option<Option<Imagem>>,
    #[serde(default)]
    pub atributos: Option<Vec<AtributoDoItem>>,
    #[serde(default)]
    pub medidores: Option<Vec<Modelo>>,
}

impl Patch {
    /// O patch nao mexe em nada do catalogo. Quem pergunta e `inventory::update`,
    /// para nao regravar o `itens.json` inteiro por uma troca de quantidade.
    pub(crate) fn vazio(&self) -> bool {
        self.nome.is_none()
            && self.descricao.is_none()
            && self.imagem.is_none()
            && self.atributos.is_none()
            && self.medidores.is_none()
    }
}

/// Distingue "campo ausente" de "campo com `null`".
///
/// Sem isto os dois chegariam como `None`, e `{"imagem": null}` -- o pedido de
/// TIRAR a imagem -- seria indistinguivel de um patch que so troca o nome. A
/// funcao so e chamada quando a chave existe no JSON, e por isso embrulhar o
/// que veio em `Some` ja e a resposta inteira.
pub(crate) fn presente<'de, D>(de: D) -> Result<Option<Option<Imagem>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<Imagem>::deserialize(de).map(Some)
}

/// Aplica o patch a um item em memoria.
fn aplicar(item: &mut Item, patch: Patch) {
    if let Some(nome) = patch.nome {
        let nome = texto(&nome, MAX_NOME);
        // Vazio nao apaga o nome, como no `rename` do personagem: o campo
        // limpo sem querer deixaria uma linha em branco impossivel de clicar.
        if !nome.is_empty() {
            item.nome = nome;
        }
    }

    if let Some(descricao) = patch.descricao {
        item.descricao = texto(&descricao, MAX_DESCRICAO);
    }

    if let Some(imagem) = patch.imagem {
        item.imagem = imagem;
    }

    if let Some(atributos) = patch.atributos {
        item.atributos = atributos_validos(atributos);
    }

    // So a definicao muda. O valor guardado em cada mochila fica como esta: a
    // leitura o prende ao maximo novo e ignora o do medidor que saiu -- ver
    // `inventory::atuais` --, e reescrever todos os inventarios aqui seria
    // abrir N arquivos por um ajuste de cor.
    if let Some(medidores) = patch.medidores {
        item.medidores = medidores_validos(medidores);
    }
}

/// `editar` sem a trava, para quem ja a segura.
pub(crate) fn editar_destravado(vault: &Vault, id: &str, patch: Patch) -> AppResult<Item> {
    let mut itens = load(vault)?;

    let item = itens
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or_else(|| nao_existe(id))?;

    aplicar(item, patch);

    let item = item.clone();
    save(vault, &itens)?;

    Ok(item)
}

/// Troca nome, descricao, imagem, atributos ou medidores. Muda o item em TODO
/// inventario que o tem.
///
/// So o mestre chega aqui direto. O jogador edita pelo inventario -- ver
/// `inventory::update` --, que confere antes se o item e dele.
pub fn editar(vault: &Vault, id: &str, patch: Patch) -> AppResult<Item> {
    let _vez = travar();
    editar_destravado(vault, id, patch)
}

/// Apaga o item da campanha, e com ele cada entrada dele nos inventarios.
///
/// Os inventarios primeiro, e o catalogo depois: se o aplicativo cair no meio,
/// sobra o item no catalogo, e apagar de novo termina o servico. Na ordem
/// inversa sobrariam entradas apontando para um item que nao existe -- a
/// leitura as pula, mas elas ficariam no arquivo para sempre.
///
/// Percorre os personagens do INDICE: uma pasta orfa, sem personagem, nao e
/// listada por ninguem, e o inventario dela nao aparece em lugar nenhum.
///
/// A foto do jogador vai junto, porque ela so existia para ser a imagem deste
/// item: deixa-la faria o arquivo reaparecer na aba de Arquivos do personagem,
/// que esconde so o que um item usa -- ver `anexos_usados`. Asset NAO e
/// apagado: o acervo e do mestre, a mesma imagem pode estar em dez itens e numa
/// cena, e apagar por remocao de item tiraria de baixo dos outros.
///
/// Os pontos do mapa, os handouts e as pecas que citam o item sao do BOARD, que
/// este modulo nao conhece -- a cena e opaca para o Rust. Quem os limpa e a
/// tela, que e a dona do board.
pub fn remover(vault: &Vault, id: &str) -> AppResult<()> {
    let _vez = travar();
    remover_destravado(vault, id)
}

/// Marca ou desmarca itens como molde do Compendio. Id que nao existe e
/// ignorado, como em `characters::marcar_compendio`.
pub fn marcar_compendio(vault: &Vault, ids: &[String], compendio: bool) -> AppResult<()> {
    if ids.is_empty() {
        return Ok(());
    }

    let _vez = travar();
    let mut itens = load(vault)?;
    for item in itens.iter_mut().filter(|item| ids.contains(&item.id)) {
        item.compendio = compendio;
    }
    save(vault, &itens)
}

/// Troca as tags do item. Quem normaliza e quem chama -- ver
/// `compendio::definir_tags`.
pub fn set_tags(vault: &Vault, id: &str, tags: Vec<String>) -> AppResult<()> {
    let _vez = travar();
    let mut itens = load(vault)?;

    itens
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or_else(|| nao_existe(id))?
        .tags = tags;

    save(vault, &itens)
}

/// Troca a aura do item, ou a tira. Ver `compendio::definir_aura`.
pub fn set_aura(vault: &Vault, id: &str, aura: Option<String>) -> AppResult<()> {
    let _vez = travar();
    let mut itens = load(vault)?;

    itens
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or_else(|| nao_existe(id))?
        .aura = aura;

    save(vault, &itens)
}

pub(crate) fn remover_destravado(vault: &Vault, id: &str) -> AppResult<()> {
    let mut itens = load(vault)?;
    let Some(posicao) = itens.iter().position(|item| item.id == id) else {
        return Err(nao_existe(id));
    };

    for personagem in characters::todos_os_ids(vault)? {
        let entradas = inventory::load(vault, &personagem)?;
        if entradas.iter().any(|entrada| entrada.item_id == id) {
            let restantes: Vec<inventory::Entrada> = entradas
                .into_iter()
                .filter(|entrada| entrada.item_id != id)
                .collect();
            inventory::save(vault, &personagem, &restantes)?;
        }
    }

    let item = itens.remove(posicao);
    save(vault, &itens)?;

    apagar_anexo_orfao(vault, &itens, item.imagem.as_ref(), id);

    Ok(())
}

/// Apaga o arquivo da foto se ela era anexo e nenhum OUTRO item a usa.
///
/// `itens` e o catalogo ja sem o item que largou a foto (ou com ele ja
/// apontando para a foto nova). A conferencia existe porque o mestre pode
/// apontar dois itens para o mesmo anexo pelo IPC, e a migracao de uma
/// campanha com copias do mesmo item faz o mesmo -- apagar o arquivo de um
/// tiraria a imagem do outro.
///
/// Aviso em vez de erro: o catalogo ja foi gravado, e falhar aqui deixaria a
/// tela dizendo que nao fez algo que ela ja mostra feito.
pub(crate) fn apagar_anexo_orfao(
    vault: &Vault,
    itens: &[Item],
    imagem: Option<&Imagem>,
    item_id: &str,
) {
    let Some(Imagem::Anexo {
        personagem,
        autor,
        arquivo,
    }) = imagem
    else {
        return;
    };

    if itens.iter().any(|outro| outro.imagem.as_ref() == imagem) {
        return;
    }

    let caminho = characters::anexo_caminho(vault, personagem, *autor, arquivo);
    if caminho.is_file() {
        if let Err(cause) = std::fs::remove_file(&caminho) {
            log::warn!("item {item_id}: {} ficou: {cause}", caminho.display());
        }
    }
}

/// Troca a imagem de um item por um anexo recem-gravado.
///
/// Separado de `editar` porque o gesto do jogador e outro: ele manda um arquivo
/// por multipart, e o anexo so existe depois de gravado. A imagem ANTERIOR, se
/// era anexo, e apagada aqui -- trocar a foto de um item cinco vezes deixaria
/// cinco arquivos na pasta, e nenhum deles listado.
///
/// Sem a trava e sem conferir quem pede: o unico caminho ate aqui e
/// `inventory::set_imagem_anexo`, que toma a trava e confere se o item e de
/// quem o pede antes de chamar.
pub(crate) fn set_imagem_anexo_destravado(
    vault: &Vault,
    id: &str,
    personagem: &str,
    autor: Autor,
    arquivo: &str,
) -> AppResult<Item> {
    let mut itens = load(vault)?;

    let item = itens
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or_else(|| nao_existe(id))?;

    let anterior = item.imagem.replace(Imagem::Anexo {
        personagem: personagem.to_string(),
        autor,
        arquivo: arquivo.to_string(),
    });

    let item = item.clone();
    save(vault, &itens)?;

    apagar_anexo_orfao(vault, &itens, anterior.as_ref(), id);

    Ok(item)
}

/// Algum item do catalogo usa este anexo como imagem?
///
/// Quem pergunta e quem vai apagar o arquivo de fora deste modulo -- a
/// promocao para o acervo, em `commands` --, para nao tirar a foto de baixo de
/// outro item que aponta para ela.
pub fn anexo_em_uso(
    vault: &Vault,
    personagem: &str,
    autor: Autor,
    arquivo: &str,
) -> AppResult<bool> {
    Ok(load(vault)?.iter().any(|item| {
        matches!(
            &item.imagem,
            Some(Imagem::Anexo { personagem: p, autor: a, arquivo: f })
                if p == personagem && *a == autor && f == arquivo
        )
    }))
}

/// Os anexos deste personagem que sao imagem de algum item.
///
/// Existe para a lista de ARQUIVOS do personagem nao mostra-los. E a mesma
/// ideia do `escopo` do acervo, e pelo mesmo motivo: sem isto, subir a foto de
/// oito itens encheria a aba de arquivos de imagens soltas que ninguem vai
/// abrir dali, misturando o que se anexa com o que ja foi escolhido.
///
/// Do CATALOGO, e nao do inventario do personagem: a foto mora na pasta de
/// quem a subiu, e continua la quando o item passa a outra mochila. Derivado a
/// cada leitura, e nao marcado no arquivo: e um filtro sobre algumas centenas
/// de itens ja lidos, contra um campo a manter sincronizado com o disco.
pub fn anexos_usados(vault: &Vault, personagem: &str) -> AppResult<Vec<(Autor, String)>> {
    Ok(load(vault)?
        .into_iter()
        .filter_map(|item| match item.imagem {
            Some(Imagem::Anexo {
                personagem: dono,
                autor,
                arquivo,
            }) if dono == personagem => Some((autor, arquivo)),
            _ => None,
        })
        .collect())
}

/// Quem carrega o que: uma linha por item em cada inventario.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Portador {
    pub item_id: String,
    pub personagem_id: String,
    pub quantidade: u32,
    pub escondido: bool,
    /// O valor de cada medidor do item NESTA mochila, como a ficha o le. Ver
    /// `inventory::atuais`.
    ///
    /// Aqui tambem, e nao so no inventario: a janela do item que o mestre abre
    /// de uma mochila le quantidade, escondido e medidores desta lista, e
    /// abrir o inventario so para o valor da durabilidade seria uma leitura a
    /// mais por janela.
    pub atuais: BTreeMap<String, i64>,
}

/// Todas as entradas de todos os inventarios, para a janela de Itens dizer
/// "com Edgar e Mira" sem abrir uma ficha por item.
///
/// Uma lista plana, e nao um mapa por item: quem a le agrupa do jeito que a
/// tela pedir, e o JSON fica o mesmo para "quem tem este item" e "o que este
/// personagem tem". Pelos personagens do INDICE, como `remover`; entradas que
/// apontam para item que nao existe mais ficam de fora, como na leitura do
/// inventario.
pub fn portadores(vault: &Vault) -> AppResult<Vec<Portador>> {
    let catalogo = por_id(load(vault)?);

    let mut portadores = Vec::new();
    for personagem in characters::todos_os_ids(vault)? {
        for entrada in inventory::load(vault, &personagem)? {
            if let Some(item) = catalogo.get(&entrada.item_id) {
                portadores.push(Portador {
                    atuais: inventory::atuais(item, &entrada),
                    item_id: entrada.item_id,
                    personagem_id: personagem.clone(),
                    quantidade: entrada.quantidade,
                    escondido: entrada.escondido,
                });
            }
        }
    }

    Ok(portadores)
}

/// Acrescenta itens que vieram de um pacote, ja com id novo. Ver
/// `vault::pacote`.
///
/// Nunca sobrescreve: id que ja existe fica o que esta no catalogo. O pacote
/// sorteia id novo para tudo que traz, entao isso so acontece com um pacote
/// feito a mao -- e ai o item da campanha vence, como o efeito de mesmo nome.
/// Para no teto da campanha e devolve quantos entraram; quem chama sabe quais
/// ficaram de fora pela ordem.
pub fn adotar(vault: &Vault, novos: Vec<Item>) -> AppResult<usize> {
    if novos.is_empty() {
        return Ok(0);
    }

    let _vez = travar();

    let mut itens = load(vault)?;
    let mut ids: HashSet<String> = itens.iter().map(|item| item.id.clone()).collect();
    let mut entraram = 0;

    for item in novos {
        if itens.len() >= MAX_ITENS_NA_CAMPANHA {
            break;
        }
        if ids.insert(item.id.clone()) {
            itens.push(item);
            entraram += 1;
        }
    }

    save(vault, &itens)?;

    Ok(entraram)
}

/// O catalogo por id, para quem junta entradas com itens.
pub(crate) fn por_id(itens: Vec<Item>) -> HashMap<String, Item> {
    itens
        .into_iter()
        .map(|item| (item.id.clone(), item))
        .collect()
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

    /// Prende uma foto ao item como o daemon faz, sem passar pela conferencia
    /// de dono do inventario -- o que se testa aqui e o catalogo.
    fn set_imagem_anexo(
        vault: &Vault,
        id: &str,
        personagem: &str,
        autor: Autor,
        arquivo: &str,
    ) -> AppResult<Item> {
        let _vez = travar();
        set_imagem_anexo_destravado(vault, id, personagem, autor, arquivo)
    }

    #[test]
    fn sem_arquivo_o_catalogo_e_vazio() {
        let (_tmp, vault, _) = vault();

        assert!(load(&vault).unwrap().is_empty());
        assert!(portadores(&vault).unwrap().is_empty());
    }

    #[test]
    fn criar_no_catalogo_nao_poe_em_inventario_nenhum() {
        let (_tmp, vault, p) = vault();

        let item = criar(&vault, Autor::Mestre, None, novo("Bau trancado")).unwrap();

        assert_eq!(item.nome, "Bau trancado");
        assert_eq!(item.autor, Autor::Mestre);
        assert_eq!(item.criado_por, None);
        assert_eq!(load(&vault).unwrap(), vec![item]);
        assert!(inventory::load(&vault, &p).unwrap().is_empty());
    }

    #[test]
    fn so_o_item_do_jogador_guarda_por_onde_nasceu() {
        let (_tmp, vault, p) = vault();

        // O mestre nao tem para quem perguntar: o personagem que viesse aqui
        // seria ignorado.
        let do_mestre = criar(&vault, Autor::Mestre, Some(&p), novo("Tocha")).unwrap();
        let do_jogador = criar(&vault, Autor::Jogador, Some(&p), novo("Corda")).unwrap();

        assert_eq!(do_mestre.criado_por, None);
        assert_eq!(do_jogador.criado_por.as_deref(), Some(p.as_str()));
    }

    #[test]
    fn nome_vazio_ganha_rotulo_e_texto_longo_trunca() {
        let (_tmp, vault, _) = vault();

        let vazio = criar(&vault, Autor::Mestre, None, novo("   ")).unwrap();
        assert_eq!(vazio.nome, "Item sem nome");

        let longo = criar(
            &vault,
            Autor::Mestre,
            None,
            Novo {
                nome: "a".repeat(MAX_NOME + 50),
                descricao: "b".repeat(MAX_DESCRICAO + 50),
                ..Novo::default()
            },
        )
        .unwrap();
        assert_eq!(longo.nome.chars().count(), MAX_NOME);
        assert_eq!(longo.descricao.chars().count(), MAX_DESCRICAO);
    }

    #[test]
    fn editar_muda_o_item_em_todo_inventario() {
        let (_tmp, vault, edgar) = vault();
        let mira = characters::create(&vault, "Mira").unwrap().id;

        let item = criar(&vault, Autor::Mestre, None, novo("Pocao")).unwrap();
        inventory::dar(&vault, &edgar, &item.id, Some(3)).unwrap();
        inventory::dar(&vault, &mira, &item.id, None).unwrap();

        editar(
            &vault,
            &item.id,
            Patch {
                nome: Some("Pocao de cura".into()),
                ..Patch::default()
            },
        )
        .unwrap();

        // Um item so, visto de dois inventarios -- com a quantidade de cada um.
        let do_edgar = inventory::listar(&vault, &edgar).unwrap();
        let da_mira = inventory::listar(&vault, &mira).unwrap();
        assert_eq!(do_edgar[0].item.nome, "Pocao de cura");
        assert_eq!(da_mira[0].item.nome, "Pocao de cura");
        assert_eq!(do_edgar[0].quantidade, 3);
        assert_eq!(da_mira[0].quantidade, 1);
    }

    #[test]
    fn imagem_presente_com_null_limpa_e_ausente_nao_mexe() {
        let (_tmp, vault, _) = vault();

        let item = criar(
            &vault,
            Autor::Mestre,
            None,
            Novo {
                nome: "Elmo".into(),
                imagem: Some(Imagem::Asset {
                    id: "asset-1".into(),
                }),
                ..Novo::default()
            },
        )
        .unwrap();

        let patch: Patch = serde_json::from_str(r#"{"nome":"Elmo runico"}"#).unwrap();
        let editado = editar(&vault, &item.id, patch).unwrap();
        assert_eq!(
            editado.imagem,
            Some(Imagem::Asset {
                id: "asset-1".into()
            })
        );

        let patch: Patch = serde_json::from_str(r#"{"imagem":null}"#).unwrap();
        let editado = editar(&vault, &item.id, patch).unwrap();
        assert!(editado.imagem.is_none());
    }

    #[test]
    fn remover_limpa_todo_inventario_e_leva_o_anexo() {
        let (_tmp, vault, edgar) = vault();
        let mira = characters::create(&vault, "Mira").unwrap().id;

        let foto = characters::write_anexo(&vault, &edgar, "espada.png", b"png").unwrap();
        let espada = criar(&vault, Autor::Jogador, Some(&edgar), novo("Espada")).unwrap();
        set_imagem_anexo(&vault, &espada.id, &edgar, Autor::Jogador, &foto.arquivo).unwrap();
        let tocha = criar(&vault, Autor::Mestre, None, novo("Tocha")).unwrap();

        for personagem in [&edgar, &mira] {
            inventory::dar(&vault, personagem, &espada.id, None).unwrap();
            inventory::dar(&vault, personagem, &tocha.id, None).unwrap();
        }

        remover(&vault, &espada.id).unwrap();

        // Saiu do catalogo e das duas mochilas; a tocha ficou onde estava.
        assert_eq!(load(&vault).unwrap(), vec![tocha.clone()]);
        for personagem in [&edgar, &mira] {
            let ids: Vec<String> = inventory::load(&vault, personagem)
                .unwrap()
                .into_iter()
                .map(|entrada| entrada.item_id)
                .collect();
            assert_eq!(ids, vec![tocha.id.clone()]);
        }

        // E a foto foi junto: ela so existia para ser a imagem da espada.
        assert!(characters::list_anexos(&vault, &edgar).unwrap().is_empty());
    }

    #[test]
    fn remover_poupa_o_asset_e_o_anexo_que_outro_item_usa() {
        let (_tmp, vault, edgar) = vault();

        let foto = characters::write_anexo(&vault, &edgar, "mapa.png", b"png").unwrap();
        let um = criar(&vault, Autor::Mestre, None, novo("Mapa rasgado")).unwrap();
        let outro = criar(&vault, Autor::Mestre, None, novo("Mapa inteiro")).unwrap();
        for item in [&um, &outro] {
            set_imagem_anexo(&vault, &item.id, &edgar, Autor::Jogador, &foto.arquivo).unwrap();
        }
        let elmo = criar(
            &vault,
            Autor::Mestre,
            None,
            Novo {
                nome: "Elmo".into(),
                imagem: Some(Imagem::Asset {
                    id: "asset-1".into(),
                }),
                ..Novo::default()
            },
        )
        .unwrap();

        remover(&vault, &um.id).unwrap();
        remover(&vault, &elmo.id).unwrap();

        // O outro mapa continua com a foto no disco.
        assert_eq!(characters::list_anexos(&vault, &edgar).unwrap().len(), 1);
        assert!(remover(&vault, &um.id).is_err());
    }

    #[test]
    fn trocar_a_foto_apaga_a_anterior() {
        let (_tmp, vault, p) = vault();

        let velha = characters::write_anexo(&vault, &p, "velha.png", b"png").unwrap();
        let item = criar(&vault, Autor::Jogador, Some(&p), novo("Espada")).unwrap();
        set_imagem_anexo(&vault, &item.id, &p, Autor::Jogador, &velha.arquivo).unwrap();

        let nova = characters::write_anexo(&vault, &p, "nova.png", b"png").unwrap();
        let item = set_imagem_anexo(&vault, &item.id, &p, Autor::Jogador, &nova.arquivo).unwrap();

        let anexos = characters::list_anexos(&vault, &p).unwrap();
        assert_eq!(anexos.len(), 1);
        assert_eq!(anexos[0].arquivo, "nova.png");
        assert_eq!(
            item.imagem,
            Some(Imagem::Anexo {
                personagem: p.clone(),
                autor: Autor::Jogador,
                arquivo: "nova.png".into(),
            })
        );
    }

    #[test]
    fn anexos_usados_vem_do_catalogo_e_nao_do_inventario() {
        let (_tmp, vault, edgar) = vault();
        let mira = characters::create(&vault, "Mira").unwrap().id;

        let foto = characters::write_anexo(&vault, &edgar, "espada.png", b"png").unwrap();
        characters::write_anexo(&vault, &edgar, "diario.txt", b"oi").unwrap();

        let espada = inventory::add(
            &vault,
            &edgar,
            Autor::Jogador,
            inventory::Novo {
                nome: "Espada".into(),
                ..inventory::Novo::default()
            },
        )
        .unwrap();
        inventory::set_imagem_anexo(
            &vault,
            &edgar,
            &espada.item.id,
            &foto.arquivo,
            Autor::Jogador,
        )
        .unwrap();

        // A espada passa para a Mira, e a foto continua sendo do Edgar: e na
        // pasta dele que ela mora, e e da aba de Arquivos dele que ela sai.
        inventory::mover(&vault, &edgar, &mira, &espada.item.id).unwrap();

        assert_eq!(
            anexos_usados(&vault, &edgar).unwrap(),
            vec![(Autor::Jogador, "espada.png".to_string())]
        );
        assert!(anexos_usados(&vault, &mira).unwrap().is_empty());
        assert!(anexo_em_uso(&vault, &edgar, Autor::Jogador, "espada.png").unwrap());
        assert!(!anexo_em_uso(&vault, &edgar, Autor::Jogador, "diario.txt").unwrap());
    }

    #[test]
    fn portadores_lista_cada_inventario() {
        let (_tmp, vault, edgar) = vault();
        let mira = characters::create(&vault, "Mira").unwrap().id;

        let pocao = criar(&vault, Autor::Mestre, None, novo("Pocao")).unwrap();
        let anel = criar(&vault, Autor::Mestre, None, novo("Anel")).unwrap();
        inventory::dar(&vault, &edgar, &pocao.id, Some(2)).unwrap();
        inventory::dar(&vault, &mira, &pocao.id, None).unwrap();
        inventory::dar(&vault, &mira, &anel.id, None).unwrap();
        inventory::update(
            &vault,
            &mira,
            &anel.id,
            inventory::Patch {
                escondido: Some(true),
                ..inventory::Patch::default()
            },
            Autor::Mestre,
        )
        .unwrap();

        let lista = portadores(&vault).unwrap();

        assert_eq!(lista.len(), 3);
        assert!(lista.contains(&Portador {
            item_id: pocao.id.clone(),
            personagem_id: edgar.clone(),
            quantidade: 2,
            escondido: false,
            atuais: BTreeMap::new(),
        }));
        assert!(lista.contains(&Portador {
            item_id: anel.id.clone(),
            personagem_id: mira.clone(),
            quantidade: 1,
            escondido: true,
            atuais: BTreeMap::new(),
        }));
    }

    fn atributo(id: &str, nome: &str, valor: &str) -> AtributoDoItem {
        AtributoDoItem {
            id: id.to_string(),
            nome: nome.to_string(),
            valor: valor.to_string(),
            escondido: false,
        }
    }

    fn medidor(id: &str, nome: &str, maximo: i64) -> Modelo {
        Modelo {
            id: id.to_string(),
            nome: nome.to_string(),
            cor: "#ef4444".into(),
            estilo: characters::Estilo::Barra,
            maximo,
            escondido: false,
            estilo_extensao: None,
            mostrar_nome: None,
            mostrar_valor: None,
        }
    }

    #[test]
    fn atributos_sao_aparados_cortados_e_sem_nome_vazio() {
        let (_tmp, vault, _) = vault();

        let item = criar(
            &vault,
            Autor::Mestre,
            None,
            Novo {
                nome: "Espada".into(),
                atributos: Some(vec![
                    atributo("a1", "  Dano  ", "  1d8+2 cortante  "),
                    // A linha nova que ninguem preencheu sai.
                    atributo("a2", "   ", "sem rotulo"),
                    atributo("a3", &"n".repeat(MAX_NOME_DO_ATRIBUTO + 10), ""),
                    atributo("a4", "Peso", &"v".repeat(MAX_VALOR_DO_ATRIBUTO + 10)),
                ]),
                ..Novo::default()
            },
        )
        .unwrap();

        let nomes: Vec<&str> = item.atributos.iter().map(|a| a.nome.as_str()).collect();
        assert_eq!(nomes.len(), 3);
        assert_eq!(nomes[0], "Dano");
        assert_eq!(item.atributos[0].valor, "1d8+2 cortante");
        assert_eq!(item.atributos[0].id, "a1");
        assert_eq!(item.atributos[1].nome.chars().count(), MAX_NOME_DO_ATRIBUTO);
        // Valor vazio fica: "Amaldicoado" sem valor e um atributo inteiro.
        assert_eq!(item.atributos[1].valor, "");
        assert_eq!(item.atributos[2].valor.chars().count(), MAX_VALOR_DO_ATRIBUTO);

        // E e o que esta no disco, nao so o que voltou.
        assert_eq!(load(&vault).unwrap()[0].atributos, item.atributos);
    }

    #[test]
    fn atributo_sem_id_ou_repetido_ganha_um_novo_e_o_teto_corta() {
        let (_tmp, vault, _) = vault();

        let mut lista = vec![
            atributo("", "Sem id", "1"),
            atributo("igual", "Primeiro", "2"),
            atributo("igual", "Segundo", "3"),
            // O vazio no meio nao custa o lugar de ninguem no fim.
            atributo("x", "", ""),
        ];
        lista.extend((0..MAX_ATRIBUTOS_DO_ITEM).map(|n| atributo("", &format!("Extra {n}"), "")));

        let item = criar(
            &vault,
            Autor::Mestre,
            None,
            Novo {
                nome: "Anel".into(),
                atributos: Some(lista),
                ..Novo::default()
            },
        )
        .unwrap();

        assert_eq!(item.atributos.len(), MAX_ATRIBUTOS_DO_ITEM);
        assert_eq!(item.atributos[0].nome, "Sem id");
        assert!(!item.atributos[0].id.is_empty());
        // O primeiro fica com o id; o repetido ganha outro.
        assert_eq!(item.atributos[1].id, "igual");
        assert_eq!(item.atributos[2].nome, "Segundo");
        assert_ne!(item.atributos[2].id, "igual");

        let ids: HashSet<&str> = item.atributos.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(ids.len(), item.atributos.len());
        assert_eq!(item.atributos.last().unwrap().nome, "Extra 20");
    }

    #[test]
    fn patch_troca_a_lista_inteira_e_ausente_nao_mexe() {
        let (_tmp, vault, _) = vault();

        let item = criar(
            &vault,
            Autor::Mestre,
            None,
            Novo {
                nome: "Espada".into(),
                atributos: Some(vec![atributo("a1", "Dano", "1d8"), atributo("a2", "Peso", "2 kg")]),
                medidores: Some(vec![medidor("m1", "Durabilidade", 10)]),
                ..Novo::default()
            },
        )
        .unwrap();

        // Ausente: so o nome muda.
        let patch: Patch = serde_json::from_str(r#"{"nome":"Espada longa"}"#).unwrap();
        let editado = editar(&vault, &item.id, patch).unwrap();
        assert_eq!(editado.atributos, item.atributos);
        assert_eq!(editado.medidores, item.medidores);

        // Presente: troca, e nao mescla -- o "Peso" que nao veio saiu.
        let patch: Patch = serde_json::from_str(
            r#"{"atributos":[{"id":"a1","nome":"Dano","valor":"1d10"}]}"#,
        )
        .unwrap();
        let editado = editar(&vault, &item.id, patch).unwrap();
        assert_eq!(editado.atributos, vec![atributo("a1", "Dano", "1d10")]);
        assert_eq!(editado.medidores, item.medidores);

        // Lista vazia apaga todos, e o item volta a forma de antes no disco.
        let patch: Patch = serde_json::from_str(r#"{"atributos":[],"medidores":[]}"#).unwrap();
        let editado = editar(&vault, &item.id, patch).unwrap();
        assert!(editado.atributos.is_empty() && editado.medidores.is_empty());
        let json = serde_json::to_value(&editado).unwrap();
        assert!(json.get("atributos").is_none());
        assert!(json.get("medidores").is_none());
    }

    #[test]
    fn medidores_seguem_a_regra_do_modelo_da_campanha() {
        let (_tmp, vault, _) = vault();

        let mut torto = medidor("m1", &"d".repeat(characters::MAX_NOME_MEDIDOR + 10), 0);
        torto.estilo_extensao = Some("../fora".into());
        let mut lista = vec![
            torto,
            medidor("", "   ", 5),
            medidor("m3", "Cargas", modelos::MAX_VALOR + 1),
            medidor("m3", "Municao", 20),
        ];
        lista.extend((0..MAX_MEDIDORES_DO_ITEM).map(|n| medidor("", &format!("Extra {n}"), 3)));

        // Pelo JSON, como a tela manda: sem `id`, `estilo` e `escondido`.
        let patch: Patch = serde_json::from_str(
            r##"{"medidores":[{"nome":"Fome","cor":"#22c55e","maximo":4}]}"##,
        )
        .unwrap();
        let item = criar(&vault, Autor::Mestre, None, novo("Arco")).unwrap();
        let so_um = editar(&vault, &item.id, patch).unwrap();
        assert_eq!(so_um.medidores.len(), 1);
        assert!(!so_um.medidores[0].id.is_empty());
        assert_eq!(so_um.medidores[0].estilo, characters::Estilo::Barra);

        let item = editar(
            &vault,
            &item.id,
            Patch {
                medidores: Some(lista),
                ..Patch::default()
            },
        )
        .unwrap();

        assert_eq!(item.medidores.len(), MAX_MEDIDORES_DO_ITEM);
        // Maximo zero vira um, nome longo corta, chave de plugin torta sai.
        assert_eq!(item.medidores[0].maximo, 1);
        assert_eq!(
            item.medidores[0].nome.chars().count(),
            characters::MAX_NOME_MEDIDOR
        );
        assert_eq!(item.medidores[0].estilo_extensao, None);
        // Nome vazio vira "Medidor", como no modelo, e ganha id.
        assert_eq!(item.medidores[1].nome, "Medidor");
        assert!(!item.medidores[1].id.is_empty());
        assert_eq!(item.medidores[2].maximo, modelos::MAX_VALOR);
        // O id repetido ganha outro: e a chave do valor em cada mochila.
        assert_eq!(item.medidores[2].id, "m3");
        assert_ne!(item.medidores[3].id, "m3");
    }

    #[test]
    fn portadores_traz_o_valor_de_cada_mochila() {
        let (_tmp, vault, edgar) = vault();
        let mira = characters::create(&vault, "Mira").unwrap().id;

        let espada = criar(
            &vault,
            Autor::Mestre,
            None,
            Novo {
                nome: "Espada".into(),
                medidores: Some(vec![medidor("dur", "Durabilidade", 10)]),
                ..Novo::default()
            },
        )
        .unwrap();
        inventory::dar(&vault, &edgar, &espada.id, None).unwrap();
        inventory::dar(&vault, &mira, &espada.id, None).unwrap();
        inventory::update(
            &vault,
            &edgar,
            &espada.id,
            inventory::Patch {
                atuais: Some(BTreeMap::from([("dur".to_string(), 7)])),
                ..inventory::Patch::default()
            },
            Autor::Mestre,
        )
        .unwrap();

        let lista = portadores(&vault).unwrap();
        let de = |personagem: &str| {
            lista
                .iter()
                .find(|p| p.personagem_id == personagem)
                .unwrap()
                .atuais
                .clone()
        };

        assert_eq!(de(&edgar), BTreeMap::from([("dur".to_string(), 7)]));
        assert_eq!(de(&mira), BTreeMap::from([("dur".to_string(), 10)]));
        // O mesmo que a ficha de cada um le.
        for personagem in [&edgar, &mira] {
            assert_eq!(
                de(personagem),
                inventory::listar(&vault, personagem).unwrap()[0].atuais
            );
        }
    }

    #[test]
    fn o_catalogo_tem_teto() {
        let (_tmp, vault, _) = vault();

        // Gravado direto, e nao por cinco mil `criar`: o que se testa e a
        // recusa no teto, nao o laco.
        let cheio: Vec<Item> = (0..MAX_ITENS_NA_CAMPANHA)
            .map(|n| Item {
                id: format!("item-{n}"),
                nome: format!("Item {n}"),
                descricao: String::new(),
                imagem: None,
                atributos: Vec::new(),
                medidores: Vec::new(),
                autor: Autor::Mestre,
                criado_por: None,
                tags: Vec::new(),
                aura: None,
                compendio: false,
                do_plugin: None,
                criado_em: n as i64,
            })
            .collect();
        save(&vault, &cheio).unwrap();

        assert!(criar(&vault, Autor::Mestre, None, novo("mais um")).is_err());
        assert_eq!(adotar(&vault, vec![cheio[0].clone()]).unwrap(), 0);
        assert_eq!(load(&vault).unwrap().len(), MAX_ITENS_NA_CAMPANHA);
    }

    #[test]
    fn adotar_nunca_sobrescreve() {
        let (_tmp, vault, _) = vault();

        let item = criar(&vault, Autor::Mestre, None, novo("Tocha")).unwrap();
        let impostor = Item {
            nome: "Outra coisa".into(),
            ..item.clone()
        };
        let novo_de_verdade = Item {
            id: "vindo-do-pacote".into(),
            ..item.clone()
        };

        assert_eq!(adotar(&vault, vec![impostor, novo_de_verdade]).unwrap(), 1);

        let itens = load(&vault).unwrap();
        assert_eq!(itens.len(), 2);
        assert_eq!(itens[0].nome, "Tocha");
    }

    /// Varios celulares criando item no mesmo instante, cada um numa thread do
    /// daemon. Sem a trava, o `save` de um apagava o item que o outro acabara
    /// de gravar -- e o temporario de `write_atomic` era o mesmo para os dois.
    #[test]
    fn escritas_ao_mesmo_tempo_nao_se_perdem() {
        let (_tmp, vault, edgar) = vault();
        let mira = characters::create(&vault, "Mira").unwrap().id;

        let threads: Vec<_> = (0..8)
            .map(|n| {
                let vault = vault.clone();
                let personagem = if n % 2 == 0 {
                    edgar.clone()
                } else {
                    mira.clone()
                };

                std::thread::spawn(move || {
                    for k in 0..5 {
                        inventory::add(
                            &vault,
                            &personagem,
                            Autor::Jogador,
                            inventory::Novo {
                                nome: format!("item {n}-{k}"),
                                ..inventory::Novo::default()
                            },
                        )
                        .unwrap();
                        criar(&vault, Autor::Mestre, None, novo(&format!("solto {n}-{k}")))
                            .unwrap();
                    }
                })
            })
            .collect();

        for thread in threads {
            thread.join().unwrap();
        }

        assert_eq!(load(&vault).unwrap().len(), 80);
        assert_eq!(inventory::load(&vault, &edgar).unwrap().len(), 20);
        assert_eq!(inventory::load(&vault, &mira).unwrap().len(), 20);
    }
}
