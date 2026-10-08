use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::atomic::{read_json, write_json};
use super::players::{mime_for, safe_attachment_name};
use super::{now_ms, Vault};
use crate::error::{AppError, AppResult};

/// Um personagem da campanha.
///
/// Vive no VAULT, e nao no banco de estado, e essa e a decisao central desta
/// segmentacao. Antes o que durava -- a ficha, a imagem da miniatura -- estava
/// pendurado na identidade do jogador: uma linha do SQLite que nasce quando
/// alguem digita um nome no celular e morre quando o mestre a remove. Pior,
/// quem decidia se aquilo existia era o proprio jogador, que podia nunca anexar
/// nada ou apagar tudo no meio da campanha.
///
/// No vault ele e conteudo de campanha como cena e acervo: viaja no zip,
/// sobrevive ao jogador, e pode ser referenciado por quem precisa de algo
/// estavel para apontar -- a miniatura no mapa, e o retrato depois dela.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Personagem {
    pub id: String,
    pub nome: String,
    /// A ficha, pelo NOME do arquivo em `anexos/mestre/`.
    ///
    /// Anexo, e nao asset, porque ficha e documento: costuma ser PDF, e o
    /// acervo so aceita imagem e som. E porque ela nao precisa chegar a TV --
    /// quem a le e o jogador, atras do token dele, e o mestre, pelo IPC.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ficha: Option<String>,
    /// O retrato, por id do ACERVO.
    ///
    /// Asset, e nao anexo, e a razao e a TV: o Espectador nao tem token nem IPC,
    /// e alcanca imagem so por `/asset/{id}`. Um retrato guardado como anexo do
    /// personagem exigiria abrir uma rota publica para arquivo de nome
    /// adivinhavel -- o problema que manter os anexos atras do token resolve.
    ///
    /// Para o mestre isso e invisivel: ele anexa um arquivo, e quem o poe no
    /// acervo e a tela. Ver `character-slots` no lado TypeScript.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retrato: Option<String>,
    /// O retrato AO VIVO, por URL de uma pagina externa.
    ///
    /// Convive com `retrato` em vez de substitui-lo, e a convivencia e o ponto:
    /// a pagina viva depende de internet, e a imagem do acervo nao. Quem tem as
    /// duas mostra a pagina quando ela carrega.
    ///
    /// O valor e a URL INTEIRA, e nao um par fonte-mais-codigo. Quem sabe montar
    /// a URL de um servico e a extensao que declara a fonte, e ela roda na tela
    /// -- guardar o par aqui obrigaria o vault a conhecer as extensoes para
    /// remontar a URL, e uma extensao desinstalada deixaria retrato ilegivel.
    ///
    /// NAO e validada aqui, pelo mesmo motivo que o `retrato` nao e: ver
    /// `set_campo`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retrato_url: Option<String>,
    /// A miniatura, por id do ACERVO. Mesma razao do retrato.
    ///
    /// Uma, e nao uma lista: o campo responde "qual e a peca deste personagem
    /// no mapa AGORA", e essa pergunta tem uma resposta. Houve uma lista aqui,
    /// removida porque pedia ao mestre uma escolha que ele nao tinha por que
    /// fazer -- eram miniaturas sem nome, e escolher entre elas nao queria
    /// dizer nada.
    ///
    /// As `aparencias` sao a razao que faltava: la a escolha tem nome
    /// ("Ferido", "Lobo") e um sentido em cena. Mas elas nao moram aqui --
    /// este campo continua guardando UMA, a da aparencia ativa.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub miniatura: Option<String>,
    /// As aparencias deste personagem, a primeira sendo sempre a Padrao.
    ///
    /// A lista guarda as ALTERNATIVAS; quem manda continua sendo o trio de
    /// cima, que E a aparencia ativa. E a razao de nada mais no aplicativo
    /// precisar saber que aparencia existe: o palco, a TV e o telefone leem
    /// `retrato` e `miniatura` como sempre leram, e a troca e uma troca de
    /// lugar entre a linha que sai e o topo.
    ///
    /// Vazia no disco de uma campanha antiga, e e o gancho da migracao: quem
    /// le sem lista ganha uma Padrao montada do trio de cima. Ver `normalizar`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub aparencias: Vec<Aparencia>,
    /// Qual linha da lista esta no topo agora.
    ///
    /// Guardado, e nao deduzido comparando o trio com cada linha: duas
    /// aparencias com as mesmas imagens existem -- "Padrao" e "Disfarcado" com
    /// o mesmo retrato e miniaturas diferentes -- e a comparacao escolheria a
    /// errada na metade das vezes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aparencia_ativa: Option<String>,
    /// Os medidores deste personagem: vida, sanidade, tochas, municao.
    ///
    /// No INDICE, e nao num `_medidores.json` como o inventario, e a razao e a
    /// publicacao: o Mestre manda o estado da mesa dez vezes por segundo, e o
    /// medidor tem de ir junto para a barra descer na TV no instante em que o
    /// mestre a desce. O indice ja esta inteiro na memoria do aplicativo e ja e
    /// lido por quem monta os retratos; um arquivo por personagem obrigaria a
    /// carregar todos eles no boot e a reler a cada troca de cena, para
    /// economizar a regravacao de alguns kilobytes por golpe.
    ///
    /// Lista e nao mapa: a ordem e a que a coluna ao lado do retrato desenha, e
    /// o mestre a reordena. Um mapa pediria um campo de ordem, e dois medidores
    /// podem gravar o mesmo numero nele.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub medidores: Vec<Medidor>,
    /// As condicoes deste personagem: envenenado, caido, abencoado.
    ///
    /// No INDICE, ao lado dos medidores e pela mesma razao: o selo e o efeito
    /// viajam no quadro que o Mestre publica dez vezes por segundo, e o veneno
    /// tem de aparecer no token no instante em que o mestre o marca.
    ///
    /// Lista, e a ordem vale: e a ordem dos selos na mesa, e quando duas
    /// condicoes pedem o mesmo efeito na figura, quem vence e a primeira.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub condicoes: Vec<Condicao>,
    /// Os atributos deste personagem: FOR 4, AGI 2, INT 1.
    ///
    /// No INDICE, e nao num arquivo da pasta como o inventario: o celular do
    /// jogador ja recebe o personagem inteiro por `GET /eu/personagens`, e os
    /// atributos chegam nele sem rota nova. E e pouco -- uma sigla e um numero
    /// por linha, doze no maximo.
    ///
    /// Ausente nas campanhas de antes deles, e `default` le essas sem migracao:
    /// o campo so chega ao arquivo na primeira vez que alguem cria um.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub atributos: Vec<Atributo>,
    #[serde(rename = "criadoEm")]
    pub criado_em: i64,
}

/// Um medidor: um numero entre zero e um teto, com nome, cor e forma.
///
/// Generico de proposito. "Vital" amarraria em vida, e o mesmo desenho serve
/// para sanidade, municao, carga, moral e tocha acesa -- o que o mestre precisa
/// dizer e "este personagem tem um numero que sobe e desce, e a mesa o ve
/// assim".
///
/// `atual` e `maximo` sao inteiros. Meio ponto de vida existe em algum sistema,
/// mas fracionario pagaria arredondamento em tres telas para um caso que o
/// mestre resolve dobrando a escala -- vinte em vez de dez.
///
/// O espelho em TypeScript e `Medidor`, em `types/character.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Medidor {
    pub id: String,
    pub nome: String,
    /// A cor da barra, da mesma paleta do lapis e das unioes de retrato.
    ///
    /// Guardada como a string que a tela desenha, e nao um indice da paleta:
    /// a paleta e do TypeScript, e o vault nao tem por que conhece-la para
    /// gravar uma cor.
    pub cor: String,
    pub estilo: Estilo,
    pub atual: i64,
    pub maximo: i64,
    /// A mesa nao ve.
    ///
    /// O relogio da desgraca, a corrupcao que ainda nao se manifestou. Filtrado
    /// no DAEMON antes de responder -- ver `sem_ocultos` em `serve` -- e no
    /// Mestre antes de publicar. Um medidor escondido que chegasse ao celular e
    /// sumisse no React ja teria vazado: estaria no JSON que o navegador
    /// guardou.
    pub escondido: bool,
    /// Um estilo que um PLUGIN desenhou, em `{extensaoId}/{estiloId}`.
    ///
    /// Opcional e AO LADO do `estilo`, que continua ali como reserva: a mesa que
    /// nao tem o modelo -- plugin desinstalado, TV com versao antiga -- desenha
    /// a barra de fabrica. E o que deixa o campo existir sem quebrar um
    /// `personagens.json` em lugar nenhum: `Estilo` e estrito, e um valor
    /// desconhecido ali derrubaria o indice inteiro. Aqui e so texto.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub estilo_extensao: Option<String>,
    /// O nome na linha acima da forma, por escolha do mestre.
    ///
    /// AUSENTE segue o estilo -- o de fabrica mostra, o de plugin diz no
    /// `rotulo` dele. Presente vence o estilo: e o mestre quem sabe que a
    /// moldura do coracao ja diz "vida", ou que a mesa nao deve ler o numero.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mostrar_nome: Option<bool>,
    /// O valor (`12/12`, `70%`) na mesma linha. Mesma regra do `mostrar_nome`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mostrar_valor: Option<bool>,
}

/// Como a mesa le o medidor.
///
/// Tres, e cada um responde uma pergunta diferente. `Barra` e a leitura de
/// relance, para vida num combate; `Pontos` conta unidades discretas, para
/// tres cargas de magia ou duas tochas; `Porcentagem` diz o numero sem
/// prometer uma escala, para moral e progresso.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Estilo {
    Barra,
    Pontos,
    Porcentagem,
}

impl Default for Estilo {
    fn default() -> Self {
        Self::Barra
    }
}

/// Um atributo: uma sigla curta e um numero.
///
/// Generico de proposito, como o medidor. A sigla e do sistema -- FOR, AGI e
/// VIG no Ordem, FOR, DES e CON no D&D --, e o app nao sabe nenhuma: quem diz
/// quais existem e o mestre, um por ficha ou de uma vez pela campanha (ver
/// `vault::atributos`).
///
/// Sem teto e sem forma, que e o que o separa do medidor: o atributo nao sobe
/// e desce no meio da cena como a vida. E o numero que se consulta.
///
/// `valor` e inteiro, e cobre o 4 do Ordem, o 16 do D&D e o 60 do Chamado de
/// Cthulhu. Dado como valor ("d8") fica de fora: texto livre perderia a conta
/// que um plugin faria com ele para rolar.
///
/// O espelho em TypeScript e `Atributo`, em `types/character.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Atributo {
    pub id: String,
    pub sigla: String,
    pub valor: i64,
    /// O que o atributo quer dizer, para quem nao conhece o sistema: "VIG --
    /// Vigor, a resistencia do corpo". Aparece no hover do cartao.
    ///
    /// Opcional, e ausente nas fichas de antes dele: a sigla basta para quem ja
    /// joga, e a descricao e para a mesa que esta aprendendo.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub descricao: Option<String>,
}

/// Uma condicao: um selo com nome, icone e cor, e o que ele faz com a figura.
///
/// EXIBICAO, e nada alem. O nucleo mostra que o goblin esta envenenado; quem
/// conta rodadas, tira vida por turno ou remove a condicao sozinha e extensao.
/// E a mesma fronteira do medidor: mostrar estado sim, calcular regra nao.
///
/// Sem numero. "Exaustao 2" existe, mas um numero que sobe e desce ja tem
/// lugar -- e o medidor. Dois jeitos de guardar o mesmo numero poriam o mestre
/// para escolher sem ter por que.
///
/// O espelho em TypeScript e `Condicao`, em `types/character.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Condicao {
    pub id: String,
    pub nome: String,
    /// Da mesma paleta dos medidores. Mesma razao de la para ser a string.
    pub cor: String,
    /// Qual desenho o selo usa, por NOME de uma lista que so a tela conhece.
    ///
    /// String e nao enum: a lista e de icones da interface, e crescer a lista
    /// nao pode exigir uma versao nova do Rust. Nome desconhecido vira o icone
    /// de sempre na tela -- ver `iconeDaCondicao`.
    pub icone: String,
    /// O que a condicao faz com a figura no mapa e no retrato: o ID de um
    /// efeito do catalogo. Ausente = so o selo.
    ///
    /// String e nao enum, pela razao do `icone`: o catalogo cresce -- a
    /// fabrica, os plugins e a propria campanha acrescentam efeitos -- e
    /// crescer nao pode exigir uma versao nova do Rust. Os cinco da fabrica de
    /// antes (`aura`, `tingido`...) continuam sendo ids validos, entao a
    /// campanha gravada antes do catalogo abre igual. Id que a tela nao
    /// conhece desenha so o selo. Ver `efeito_valido`.
    #[serde(
        default,
        deserialize_with = "efeito_tolerante",
        skip_serializing_if = "Option::is_none"
    )]
    pub efeito: Option<String>,
    /// A mesa nao ve -- nem o selo, nem o efeito.
    ///
    /// O mesmo caminho do medidor escondido: filtrado no daemon e no Mestre
    /// antes de publicar. O EFEITO sai junto, e e o que importa: um veneno
    /// secreto que tingisse o token de verde contaria o segredo pela imagem.
    pub escondido: bool,
}

/// Le o efeito, e devolve `None` para o que nao e um id.
///
/// Ao contrario do `Estilo`, que derruba a leitura: o `personagens.json` e um
/// arquivo so, e um efeito torto -- editado a mao, ou de uma versao com outra
/// forma de id -- faria a campanha inteira deixar de abrir. Perder o efeito e
/// cair no selo; perder o indice e perder a mesa.
fn efeito_tolerante<'de, D>(de: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let cru = Option::<serde_json::Value>::deserialize(de)?;

    Ok(cru.and_then(|valor| efeito_em_forma(valor.as_str()?)))
}

/// O id de um efeito tem a forma de um slug -- `aura`, da fabrica -- ou de
/// dois -- `{plugin}/{efeito}`, `campanha/{efeito}`?
///
/// A mesma regra da chave de estilo de medidor, e pela mesma razao: o id vira
/// indice num catalogo que a TV recebe pela rede.
pub(crate) fn efeito_valido(id: &str) -> bool {
    crate::extensoes::id_valido(id) || estilo_extensao_valido(id)
}

/// O efeito sem espaco nas pontas, ou `None` se ele nao tem forma de id.
fn efeito_em_forma(id: &str) -> Option<String> {
    let id = id.trim();

    efeito_valido(id).then(|| id.to_string())
}

/// O id da aparencia que todo personagem tem.
///
/// Fixo, e nao sorteado: a migracao precisa chegar ao mesmo id em toda maquina
/// que abrir a mesma campanha antiga, senao o zip que viaja traria uma Padrao
/// com id diferente do que a outra ponta gravou.
pub const APARENCIA_PADRAO: &str = "padrao";

/// Uma aparencia: um nome e o que ele troca na cara do personagem.
///
/// Troca o RETRATO e a MINIATURA, e nada mais. Nao troca o nome, nao troca a
/// ficha: o personagem continua sendo o mesmo, e o que muda e como ele se
/// mostra na mesa. Uma aparencia que trocasse o nome seria outro personagem, e
/// o token no mapa perderia a amarra com a ficha ao trocar.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Aparencia {
    pub id: String,
    pub nome: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retrato: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retrato_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub miniatura: Option<String>,
}

/// Quem pos o anexo ali.
///
/// E o DIRETORIO, nao um campo de indice: os anexos ficam em
/// `anexos/mestre/` e `anexos/jogador/`. Sem indice para dessincronizar, o
/// sistema de arquivos continua sendo a verdade -- como ja era para o tamanho e
/// o tipo do arquivo -- e a permissao vira uma checagem de caminho em vez de
/// uma consulta.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Autor {
    Mestre,
    Jogador,
}

impl Autor {
    fn pasta(self) -> &'static str {
        match self {
            Self::Mestre => "mestre",
            Self::Jogador => "jogador",
        }
    }

    /// Teto por arquivo, que difere por quem escreve.
    ///
    /// O do jogador e menor de proposito: a entrada dele e NAO CONFIAVEL, vem
    /// de um celular na rede para dentro da pasta da campanha de outra pessoa.
    /// O do mestre e o do acervo, porque ele esta copiando do proprio disco por
    /// IPC e mapa de 200 MB existe.
    pub fn max_bytes(self) -> u64 {
        match self {
            Self::Mestre => 512 * 1024 * 1024,
            Self::Jogador => 64 * 1024 * 1024,
        }
    }
}

/// Um arquivo anexado a um personagem.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Anexo {
    /// Nome do arquivo em disco. E o identificador, e ja vem saneado.
    pub arquivo: String,
    pub tamanho: u64,
    pub mime_type: String,
    pub autor: Autor,
}

/// Quantos anexos um personagem pode ter POR AUTOR.
///
/// Por autor, e nao no total, para o jogador nao poder encher a cota e deixar o
/// mestre sem espaco no personagem dele -- nem o contrario.
pub const MAX_ANEXOS: usize = 30;

fn index_path(vault: &Vault) -> PathBuf {
    vault.root.join("personagens.json")
}

/// A pasta de um personagem.
///
/// O id como diretorio, nunca o nome: nome e editavel e pode repetir, e dois
/// personagens chamados "Edgar" nao podem escrever no mesmo lugar.
pub fn dir(vault: &Vault, id: &str) -> PathBuf {
    vault.root.join("personagens").join(id)
}

pub fn anexos_dir(vault: &Vault, id: &str, autor: Autor) -> PathBuf {
    dir(vault, id).join("anexos").join(autor.pasta())
}

pub fn load(vault: &Vault) -> AppResult<Vec<Personagem>> {
    let mut personagens: Vec<Personagem> = read_json(&index_path(vault))?.unwrap_or_default();
    for personagem in personagens.iter_mut() {
        normalizar(personagem);
    }

    Ok(personagens)
}

/// Da ao personagem a lista de aparencias que ele talvez nao tenha no disco.
///
/// Na LEITURA e nao numa migracao que reescreve o arquivo: campanha antiga e
/// aberta para ser lida, e gravar por causa de uma leitura tornaria abrir uma
/// campanha em modo consulta um evento que suja o disco. Toda escrita daqui
/// passa por `load` antes de `save`, entao a forma nova chega ao arquivo na
/// primeira vez que alguem mexer de verdade.
fn normalizar(personagem: &mut Personagem) {
    if personagem.aparencias.is_empty() {
        personagem.aparencias.push(Aparencia {
            id: APARENCIA_PADRAO.to_string(),
            nome: "Padrão".to_string(),
            retrato: personagem.retrato.clone(),
            retrato_url: personagem.retrato_url.clone(),
            miniatura: personagem.miniatura.clone(),
        });
    }

    // Ativa que nao existe na lista cai na primeira, que e sempre a Padrao.
    // Acontece com o arquivo editado a mao e com a aparencia removida por uma
    // versao mais nova do aplicativo -- em ambos, ficar sem ativa deixaria a
    // escrita seguinte gravar so no topo e perder a linha.
    let vale = personagem
        .aparencia_ativa
        .as_deref()
        .is_some_and(|ativa| personagem.aparencias.iter().any(|a| a.id == ativa));

    if !vale {
        personagem.aparencia_ativa = personagem.aparencias.first().map(|a| a.id.clone());
    }
}

/// A linha que esta no topo, para escrever nela.
fn ativa_mut(personagem: &mut Personagem) -> Option<&mut Aparencia> {
    let ativa = personagem.aparencia_ativa.clone()?;
    personagem.aparencias.iter_mut().find(|a| a.id == ativa)
}

fn save(vault: &Vault, personagens: &[Personagem]) -> AppResult<()> {
    write_json(&index_path(vault), &personagens)
}

/// Confere que o id existe antes de escrever na pasta dele.
///
/// Existe porque o id chega de fora -- do IPC do mestre ou de uma rota do
/// daemon -- e um id que nao esta no indice nao deveria ganhar pasta. Sem isto,
/// um pedido com id inventado criaria `personagens/<qualquer-coisa>/` e o
/// diretorio ficaria la, orfao, sem nada no indice apontando para ele.
fn exige(vault: &Vault, id: &str) -> AppResult<()> {
    if load(vault)?.iter().any(|p| p.id == id) {
        return Ok(());
    }

    Err(AppError::Malformed {
        file: "personagens.json".into(),
        cause: format!("personagem {id} nao existe"),
    })
}

pub fn create(vault: &Vault, nome: &str) -> AppResult<Personagem> {
    let mut personagens = load(vault)?;

    let nome = nome.trim();
    let personagem = Personagem {
        id: uuid::Uuid::new_v4().to_string(),
        // Nome vazio viraria uma linha em branco na lista, impossivel de
        // clicar com confianca. O mestre renomeia depois.
        nome: if nome.is_empty() { "Sem nome".to_string() } else { nome.to_string() },
        ficha: None,
        retrato: None,
        retrato_url: None,
        miniatura: None,
        // Ja com a Padrao, em vez de deixar `normalizar` formar depois: o
        // personagem recem-criado e devolvido a tela ANTES de passar por um
        // `load`, e sem isto a ficha abriria com a lista de aparencias vazia
        // ate a primeira releitura.
        aparencias: vec![Aparencia {
            id: APARENCIA_PADRAO.to_string(),
            nome: "Padrão".to_string(),
            retrato: None,
            retrato_url: None,
            miniatura: None,
        }],
        aparencia_ativa: Some(APARENCIA_PADRAO.to_string()),
        medidores: Vec::new(),
        condicoes: Vec::new(),
        atributos: Vec::new(),
        criado_em: now_ms(),
    };

    personagens.push(personagem.clone());
    save(vault, &personagens)?;

    Ok(personagem)
}

pub fn rename(vault: &Vault, id: &str, nome: &str) -> AppResult<()> {
    let nome = nome.trim();
    if nome.is_empty() {
        return Ok(());
    }

    let mut personagens = load(vault)?;
    for personagem in personagens.iter_mut() {
        if personagem.id == id {
            personagem.nome = nome.to_string();
        }
    }

    save(vault, &personagens)
}

/// Qual dos tres campos nomeados esta sendo preenchido.
///
/// Um enum, e nao tres funcoes quase iguais: os tres guardam uma string
/// opcional no indice, e a unica diferenca e o campo. Tres copias da mesma
/// leitura-e-gravacao seria a terceira que um dia esquece de gravar.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Campo {
    Ficha,
    Retrato,
    Miniatura,
    /// A URL do retrato ao vivo. `lowercase` daria `retratourl`, que a tela
    /// nao escreve -- dai o nome explicito.
    #[serde(rename = "retratoUrl")]
    RetratoUrl,
}

/// Preenche ou limpa um dos campos nomeados. `None` limpa.
///
/// O valor NAO e conferido aqui: a ficha e um nome de arquivo que quem chama
/// acabou de anexar, e o retrato e a miniatura sao ids do acervo, que este
/// modulo nao le. Conferir exigiria o vault de personagens conhecer o indice de
/// assets, e o preco disso e um acoplamento por uma validacao que a tela ja
/// faz ao escolher o arquivo.
pub fn set_campo(vault: &Vault, id: &str, campo: Campo, valor: Option<&str>) -> AppResult<()> {
    let valor = valor.map(str::to_string).filter(|v| !v.trim().is_empty());

    let mut personagens = load(vault)?;
    for personagem in personagens.iter_mut() {
        if personagem.id != id {
            continue;
        }

        match campo {
            Campo::Ficha => personagem.ficha = valor.clone(),
            Campo::Retrato => personagem.retrato = valor.clone(),
            Campo::Miniatura => personagem.miniatura = valor.clone(),
            Campo::RetratoUrl => personagem.retrato_url = valor.clone(),
        }

        // A mesma escrita desce para a aparencia ativa, porque o trio de cima E
        // ela. Aqui dentro e nao em quem chama: este e o unico ponto de escrita
        // desses campos, e deixar a copia por conta do chamador seria contar
        // com todo chamador futuro se lembrar. Esquecer uma vez faz a troca
        // seguinte ressuscitar a imagem antiga por cima da que o mestre acabou
        // de anexar.
        //
        // A ficha fica de fora de proposito: a aparencia troca a CARA, e a
        // ficha e o documento da pessoa -- nao muda porque ele se disfarcou.
        if let Some(ativa) = ativa_mut(personagem) {
            match campo {
                Campo::Ficha => {}
                Campo::Retrato => ativa.retrato = valor.clone(),
                Campo::Miniatura => ativa.miniatura = valor.clone(),
                Campo::RetratoUrl => ativa.retrato_url = valor.clone(),
            }
        }
    }

    save(vault, &personagens)
}

/// O personagem, ou o erro que diz que ele nao existe.
///
/// Devolve o INDICE e nao a referencia: quem chama precisa mexer no personagem
/// e na lista inteira depois, e o emprestimo mutavel de um item preso ate o
/// `save` obrigaria cada funcao a um bloco a mais so para solta-lo.
fn indice(personagens: &[Personagem], id: &str) -> AppResult<usize> {
    personagens
        .iter()
        .position(|p| p.id == id)
        .ok_or_else(|| AppError::Malformed {
            file: "personagens.json".into(),
            cause: format!("personagem {id} nao existe"),
        })
}

fn sem_aparencia(id: &str, aparencia_id: &str) -> AppError {
    AppError::Malformed {
        file: "personagens.json".into(),
        cause: format!("personagem {id} nao tem a aparencia {aparencia_id}"),
    }
}

/// Cria uma aparencia, partindo da que esta no ar.
///
/// COPIA o trio da ativa em vez de nascer vazia, e a razao e o gesto comum:
/// quem cria "Ferido" quer o mesmo rosto com outra miniatura, e uma linha vazia
/// obrigaria a reanexar o retrato que ja estava certo. Quem quiser a linha
/// limpa limpa os campos, que e um clique -- reanexar um arquivo nao e.
pub fn criar_aparencia(vault: &Vault, id: &str, nome: &str) -> AppResult<Aparencia> {
    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;
    let personagem = &mut personagens[alvo];

    let nome = nome.trim();
    let aparencia = Aparencia {
        id: uuid::Uuid::new_v4().to_string(),
        // Mesma razao do personagem sem nome: uma linha em branco na lista e
        // impossivel de clicar com confianca.
        nome: if nome.is_empty() {
            "Sem nome".to_string()
        } else {
            nome.to_string()
        },
        retrato: personagem.retrato.clone(),
        retrato_url: personagem.retrato_url.clone(),
        miniatura: personagem.miniatura.clone(),
    };

    personagem.aparencias.push(aparencia.clone());
    save(vault, &personagens)?;

    Ok(aparencia)
}

/// Renomeia uma aparencia. Nome vazio nao troca nada, como em `rename`.
pub fn renomear_aparencia(
    vault: &Vault,
    id: &str,
    aparencia_id: &str,
    nome: &str,
) -> AppResult<()> {
    let nome = nome.trim();
    if nome.is_empty() {
        return Ok(());
    }

    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;

    let aparencia = personagens[alvo]
        .aparencias
        .iter_mut()
        .find(|a| a.id == aparencia_id)
        .ok_or_else(|| sem_aparencia(id, aparencia_id))?;

    aparencia.nome = nome.to_string();

    save(vault, &personagens)
}

/// Tira uma aparencia da lista.
///
/// A PADRAO nao sai: ela e o estado de quem nunca criou aparencia nenhuma, e
/// uma lista sem ela deixaria o personagem sem para onde voltar depois de
/// remover a que estava no ar.
///
/// Remover a ATIVA cai na Padrao, e o trio de cima vem junto -- dai devolver o
/// personagem inteiro: a tela precisa do retrato e da miniatura novos, e uma
/// segunda leitura para descobri-los deixaria a lista piscando a cara antiga.
pub fn remover_aparencia(vault: &Vault, id: &str, aparencia_id: &str) -> AppResult<Personagem> {
    if aparencia_id == APARENCIA_PADRAO {
        return Err(AppError::Malformed {
            file: "personagens.json".into(),
            cause: "a aparencia padrao nao pode ser removida".into(),
        });
    }

    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;
    let personagem = &mut personagens[alvo];

    if !personagem.aparencias.iter().any(|a| a.id == aparencia_id) {
        return Err(sem_aparencia(id, aparencia_id));
    }

    personagem.aparencias.retain(|a| a.id != aparencia_id);

    // `normalizar` so roda na leitura, e quem ficou sem ativa precisa de uma
    // agora: e este mesmo `personagem` que volta para a tela.
    if personagem.aparencia_ativa.as_deref() == Some(aparencia_id) {
        personagem.aparencia_ativa = Some(APARENCIA_PADRAO.to_string());
        aplicar_ativa(personagem);
    }

    let saida = personagem.clone();
    save(vault, &personagens)?;

    Ok(saida)
}

/// Poe uma aparencia no ar.
///
/// Devolve o personagem ja trocado porque quem chama tem duas coisas a fazer
/// com o resultado: desenhar a ficha nova e reescrever os tokens do mapa. As
/// duas precisam da miniatura nova, e pedi-la numa segunda leitura abriria uma
/// janela em que a lista ja mudou e o mapa ainda nao.
pub fn ativar_aparencia(vault: &Vault, id: &str, aparencia_id: &str) -> AppResult<Personagem> {
    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;
    let personagem = &mut personagens[alvo];

    if !personagem.aparencias.iter().any(|a| a.id == aparencia_id) {
        return Err(sem_aparencia(id, aparencia_id));
    }

    // Guarda o topo na linha que SAI antes de trocar. `set_campo` ja mantem as
    // duas iguais, e por isso isto quase nunca muda alguma coisa -- fica pelo
    // dia em que outro caminho de escrita existir: sem este passo, o que ele
    // gravou no topo sumiria na primeira troca, e o sintoma apareceria longe
    // da causa.
    let saindo = (
        personagem.retrato.clone(),
        personagem.retrato_url.clone(),
        personagem.miniatura.clone(),
    );
    if let Some(linha) = ativa_mut(personagem) {
        linha.retrato = saindo.0;
        linha.retrato_url = saindo.1;
        linha.miniatura = saindo.2;
    }

    personagem.aparencia_ativa = Some(aparencia_id.to_string());
    aplicar_ativa(personagem);

    let saida = personagem.clone();
    save(vault, &personagens)?;

    Ok(saida)
}

/// Sobe o trio da aparencia ativa para o topo do personagem.
fn aplicar_ativa(personagem: &mut Personagem) {
    let Some(ativa) = personagem.aparencia_ativa.clone() else {
        return;
    };
    let Some(linha) = personagem.aparencias.iter().find(|a| a.id == ativa) else {
        return;
    };

    personagem.retrato = linha.retrato.clone();
    personagem.retrato_url = linha.retrato_url.clone();
    personagem.miniatura = linha.miniatura.clone();
}

// --- medidores ---------------------------------------------------------------

/// Quantos medidores cabem num personagem.
///
/// Seis. O limite e de LAYOUT e nao de disco: os medidores desenham numa coluna
/// ao lado do retrato, e passando disso a coluna fica mais alta que o rosto que
/// ela acompanha -- a figura vira apendice do painel em vez do contrario.
pub const MAX_MEDIDORES: usize = 6;

/// O teto do nome de um medidor.
///
/// Curto porque ele e um rotulo ao lado de uma barra, lido de longe numa TV, e
/// nao um campo de texto. "Pontos de Vida Temporarios" ja nao cabe.
const MAX_NOME_MEDIDOR: usize = 24;

/// O teto do valor.
///
/// Existe para o arquivo editado a mao nao produzir uma barra com um numero
/// que nenhuma tela desenha. Um milhao e folgado para qualquer sistema de mesa
/// e ainda cabe num `i64` multiplicado por qualquer coisa que a tela faca.
const MAX_VALOR: i64 = 1_000_000;

fn sem_medidor(id: &str, medidor_id: &str) -> AppError {
    AppError::Malformed {
        file: "personagens.json".into(),
        cause: format!("personagem {id} nao tem o medidor {medidor_id}"),
    }
}

/// Poe o medidor em forma: teto no maximo, e `atual` preso entre zero e ele.
///
/// Aqui e nao na tela, e pelo motivo de sempre neste projeto: a tela e onde o
/// valor e digitado, nao onde ele e decidido. Sao tres telas e um IPC, e a
/// unica delas por onde todo valor passa e esta.
///
/// `maximo` nunca abaixo de um: zero deixaria a barra dividindo por zero e a
/// porcentagem sem resposta, e um medidor que nao pode subir nao e um medidor.
fn ajustar(medidor: &mut Medidor) {
    medidor.nome = texto_curto(&medidor.nome, MAX_NOME_MEDIDOR);
    if medidor.nome.is_empty() {
        medidor.nome = "Medidor".to_string();
    }

    medidor.maximo = medidor.maximo.clamp(1, MAX_VALOR);
    medidor.atual = medidor.atual.clamp(0, medidor.maximo);
}

/// Corta um texto no numero de CARACTERES, e nao de bytes.
///
/// `&texto[..teto]` entra em panico no meio de um acento, e nome de medidor em
/// portugues tem acento na primeira palavra.
fn texto_curto(valor: &str, teto: usize) -> String {
    valor.trim().chars().take(teto).collect()
}

/// Cria um medidor no fim da lista.
///
/// Nasce cheio -- `atual` igual ao `maximo` --, que e o unico estado inicial
/// que nao precisa de um segundo gesto: ninguem cria a vida de um personagem
/// para deixa-la em zero.
pub fn criar_medidor(
    vault: &Vault,
    id: &str,
    nome: &str,
    cor: &str,
    estilo: Estilo,
    maximo: i64,
) -> AppResult<Medidor> {
    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;
    let personagem = &mut personagens[alvo];

    if personagem.medidores.len() >= MAX_MEDIDORES {
        return Err(AppError::Malformed {
            file: "personagens.json".into(),
            cause: format!("o personagem ja tem {MAX_MEDIDORES} medidores"),
        });
    }

    let mut medidor = Medidor {
        id: uuid::Uuid::new_v4().to_string(),
        nome: nome.to_string(),
        cor: cor.to_string(),
        estilo,
        atual: maximo,
        maximo,
        escondido: false,
        estilo_extensao: None,
        mostrar_nome: None,
        mostrar_valor: None,
    };
    ajustar(&mut medidor);

    personagem.medidores.push(medidor.clone());
    save(vault, &personagens)?;

    Ok(medidor)
}

/// O que se pode trocar num medidor.
///
/// Campos opcionais e nao o medidor inteiro: o gesto mais comum da mesa e
/// mexer so no `atual`, e mandar o registro completo a cada golpe faria uma
/// tela desatualizada reescrever por cima do nome que outra acabou de trocar.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchMedidor {
    pub nome: Option<String>,
    pub cor: Option<String>,
    pub estilo: Option<Estilo>,
    pub atual: Option<i64>,
    pub maximo: Option<i64>,
    pub escondido: Option<bool>,
    /// `Some("")` tira o estilo de plugin e volta ao de fabrica.
    pub estilo_extensao: Option<String>,
    pub mostrar_nome: Option<bool>,
    pub mostrar_valor: Option<bool>,
}

/// O teto da chave de um estilo de plugin. Dois slugs e uma barra.
const MAX_ESTILO_EXTENSAO: usize = 130;

/// A chave tem a forma `{extensaoId}/{estiloId}`, os dois slugs?
///
/// A mesma regra do id de extensao, porque a chave vira indice num mapa que a
/// TV recebe pela rede e nome de arquivo do lado do plugin.
pub(crate) fn estilo_extensao_valido(chave: &str) -> bool {
    if chave.len() > MAX_ESTILO_EXTENSAO {
        return false;
    }
    let mut partes = chave.split('/');
    let (Some(extensao), Some(estilo), None) = (partes.next(), partes.next(), partes.next()) else {
        return false;
    };

    crate::extensoes::id_valido(extensao) && crate::extensoes::id_valido(estilo)
}

/// Edita um medidor e devolve como ele ficou depois do clamp.
///
/// Devolve o registro, e nao `()`, porque o valor que a tela mandou e o valor
/// que ela grava podem diferir: baixar o `maximo` abaixo do `atual` puxa o
/// `atual` junto, e a tela que nao soubesse disso mostraria 18/10 ate a
/// releitura seguinte.
pub fn editar_medidor(
    vault: &Vault,
    id: &str,
    medidor_id: &str,
    patch: PatchMedidor,
) -> AppResult<Medidor> {
    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;

    let medidor = personagens[alvo]
        .medidores
        .iter_mut()
        .find(|m| m.id == medidor_id)
        .ok_or_else(|| sem_medidor(id, medidor_id))?;

    aplicar_patch(medidor, patch);
    let saida = medidor.clone();

    save(vault, &personagens)?;

    Ok(saida)
}

/// Poe o patch no medidor e o ajusta. O que `editar_medidor` e
/// `aplicar_medidores` tem em comum, para os dois nao divergirem na ordem dos
/// campos.
fn aplicar_patch(medidor: &mut Medidor, patch: PatchMedidor) {
    if let Some(nome) = patch.nome {
        medidor.nome = nome;
    }
    if let Some(cor) = patch.cor {
        medidor.cor = cor;
    }
    if let Some(estilo) = patch.estilo {
        medidor.estilo = estilo;
    }
    // O `maximo` ANTES do `atual`: subir o teto e encher na mesma chamada e um
    // gesto real, e na ordem inversa o `atual` seria preso ao teto velho.
    if let Some(maximo) = patch.maximo {
        medidor.maximo = maximo;
    }
    if let Some(atual) = patch.atual {
        medidor.atual = atual;
    }
    if let Some(escondido) = patch.escondido {
        medidor.escondido = escondido;
    }
    // Vazio limpa; forma errada e IGNORADA em vez de erro: o lote de um plugin
    // nao pode cair inteiro por uma chave mal escrita, e o medidor continua
    // desenhando o de fabrica -- que e o que ele desenharia de todo jeito.
    if let Some(chave) = patch.estilo_extensao {
        if chave.is_empty() {
            medidor.estilo_extensao = None;
        } else if estilo_extensao_valido(&chave) {
            medidor.estilo_extensao = Some(chave);
        }
    }
    if let Some(mostrar) = patch.mostrar_nome {
        medidor.mostrar_nome = Some(mostrar);
    }
    if let Some(mostrar) = patch.mostrar_valor {
        medidor.mostrar_valor = Some(mostrar);
    }

    ajustar(medidor);
}

/// Uma mudanca num medidor de um personagem, dentro de um lote.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MudancaDeMedidor {
    pub personagem_id: String,
    pub medidor_id: String,
    pub patch: PatchMedidor,
}

/// Aplica varias mudancas de uma vez e grava o indice UMA vez.
///
/// E o caminho dos plugins, e existe por causa de uma conta: cada gravacao do
/// indice e uma releitura, uma reescrita inteira e um `fsync` na thread da
/// janela, seguidos de uma releitura pelo TypeScript e de uma republicacao da
/// cena. Um botao de ataque que tira vida de dez goblins pagaria isso dez
/// vezes por clique; aqui paga uma.
///
/// Medidor que nao existe mais e PULADO, e nao erro: o lote vem de um plugin
/// que leu a lista ha um instante, e um goblin apagado no meio nao pode
/// derrubar o dano nos outros nove. Devolve os medidores como ficaram depois
/// do clamp, na ordem das mudancas aplicadas.
pub fn aplicar_medidores(
    vault: &Vault,
    mudancas: Vec<MudancaDeMedidor>,
) -> AppResult<Vec<Medidor>> {
    let mut personagens = load(vault)?;
    let mut saida = Vec::with_capacity(mudancas.len());

    for mudanca in mudancas {
        let Some(personagem) = personagens
            .iter_mut()
            .find(|p| p.id == mudanca.personagem_id)
        else {
            continue;
        };
        let Some(medidor) = personagem
            .medidores
            .iter_mut()
            .find(|m| m.id == mudanca.medidor_id)
        else {
            continue;
        };

        aplicar_patch(medidor, mudanca.patch);
        saida.push(medidor.clone());
    }

    if !saida.is_empty() {
        save(vault, &personagens)?;
    }

    Ok(saida)
}

/// Tira um medidor da lista.
pub fn remover_medidor(vault: &Vault, id: &str, medidor_id: &str) -> AppResult<()> {
    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;
    let personagem = &mut personagens[alvo];

    if !personagem.medidores.iter().any(|m| m.id == medidor_id) {
        return Err(sem_medidor(id, medidor_id));
    }

    personagem.medidores.retain(|m| m.id != medidor_id);

    save(vault, &personagens)
}

/// Poe os medidores na ordem pedida.
///
/// O que NAO esta na ordem recebida fica no fim, na ordem em que estava. E o
/// que faz um pedido montado numa tela desatualizada -- sem o medidor que outra
/// acabou de criar -- reordenar sem apagar nada.
pub fn reordenar_medidores(vault: &Vault, id: &str, ordem: &[String]) -> AppResult<Vec<Medidor>> {
    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;
    let personagem = &mut personagens[alvo];

    let mut restantes = std::mem::take(&mut personagem.medidores);
    let mut arrumados: Vec<Medidor> = Vec::with_capacity(restantes.len());

    for pedido in ordem {
        if let Some(posicao) = restantes.iter().position(|m| &m.id == pedido) {
            arrumados.push(restantes.remove(posicao));
        }
    }
    arrumados.append(&mut restantes);

    personagem.medidores = arrumados.clone();
    save(vault, &personagens)?;

    Ok(arrumados)
}

/// Acrescenta medidores prontos a um personagem, respeitando o teto.
///
/// Devolve quantos ENTRARAM. Quem ja esta cheio recebe zero e nao vira erro: o
/// chamador esta aplicando um modelo em toda a mesa, e uma ficha cheia nao pode
/// derrubar a aplicacao nas outras trinta.
///
/// ## Nome repetido nao entra
///
/// Quem ja tem um "Vida" nao ganha um segundo. Este caminho e o dos MODELOS da
/// campanha, e ele roda de novo toda vez que o mestre aperta "aplicar em todos"
/// -- sem esta guarda, cada toque duplicaria a coluna inteira de quem ja estava
/// em dia, e desfazer isso seria apagar de ficha em ficha.
///
/// Sem diferenciar maiuscula de minuscula, e depois do `trim` que `ajustar` ja
/// faz: "Vida" e "vida" sao a mesma linha para quem olha a TV, e deixar as duas
/// passarem transformaria a guarda num detalhe de digitacao.
///
/// A comparacao vale tambem DENTRO de `novos`: dois modelos com o mesmo nome
/// deixam so o primeiro entrar. E o mesmo caso, visto do outro lado.
pub fn acrescentar_medidores(vault: &Vault, id: &str, novos: Vec<Medidor>) -> AppResult<usize> {
    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;
    let personagem = &mut personagens[alvo];

    let cabem = MAX_MEDIDORES.saturating_sub(personagem.medidores.len());
    if cabem == 0 {
        return Ok(0);
    }

    let mut tomados: Vec<String> = personagem
        .medidores
        .iter()
        .map(|medidor| chave_do_nome(&medidor.nome))
        .collect();

    let mut entrando: Vec<Medidor> = Vec::new();

    for mut medidor in novos {
        if entrando.len() >= cabem {
            break;
        }

        ajustar(&mut medidor);

        let chave = chave_do_nome(&medidor.nome);
        if tomados.contains(&chave) {
            continue;
        }

        tomados.push(chave);
        entrando.push(medidor);
    }

    let quantos = entrando.len();
    if quantos == 0 {
        return Ok(0);
    }

    personagem.medidores.extend(entrando);
    save(vault, &personagens)?;

    Ok(quantos)
}

/// O nome de um medidor como ele e comparado: sem caixa e sem espaco nas pontas.
///
/// Vale tambem para a condicao: e por ele que "Envenenado" do menu do token
/// acha o "envenenado" que a ficha ja tem.
pub fn chave_do_nome(nome: &str) -> String {
    nome.trim().to_lowercase()
}

// --- atributos --------------------------------------------------------------

/// Quantos atributos cabem num personagem.
///
/// Doze. Limite de LAYOUT: os cartoes desenham em fileiras de quatro na ficha,
/// e tres fileiras ja passam de qualquer sistema de mesa que se joga. Mais que
/// isso seria pericia, e pericia e lista, nao cartao.
pub const MAX_ATRIBUTOS: usize = 12;

/// O teto da sigla. Seis cabe "SANID" e "ESPIR", e ainda cabe no cartao.
const MAX_SIGLA: usize = 6;

/// O teto da descricao. E um balao de hover, e nao a pagina do manual.
pub const MAX_DESCRICAO_ATRIBUTO: usize = 280;

/// O teto do valor, para cima e para baixo.
///
/// Negativo existe -- o modificador que o sistema escreve na ficha, o -1 de
/// quem tem FOR baixa. 999 e folgado para qualquer escala e cabe no cartao sem
/// cortar digito.
pub const MAX_VALOR_ATRIBUTO: i64 = 999;

fn sem_atributo(id: &str, atributo_id: &str) -> AppError {
    AppError::Malformed {
        file: "personagens.json".into(),
        cause: format!("personagem {id} nao tem o atributo {atributo_id}"),
    }
}

/// Poe o atributo em forma: sigla curta e nao vazia, valor dentro do teto.
///
/// Aqui e nao na tela, como o `ajustar` do medidor: a tela e onde o valor e
/// digitado, nao onde ele e decidido.
pub fn ajustar_atributo(atributo: &mut Atributo) {
    atributo.sigla = texto_curto(&atributo.sigla, MAX_SIGLA);
    if atributo.sigla.is_empty() {
        atributo.sigla = "ATR".to_string();
    }

    let teto = MAX_VALOR_ATRIBUTO;
    atributo.valor = atributo.valor.clamp(-teto, teto);

    // Vazia vira ausente: um balao em branco no hover seria pior que nenhum.
    atributo.descricao = atributo
        .descricao
        .as_deref()
        .map(|texto| texto_curto(texto, MAX_DESCRICAO_ATRIBUTO))
        .filter(|texto| !texto.is_empty());
}

/// Cria um atributo no fim da lista.
pub fn criar_atributo(vault: &Vault, id: &str, sigla: &str, valor: i64) -> AppResult<Atributo> {
    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;
    let personagem = &mut personagens[alvo];

    if personagem.atributos.len() >= MAX_ATRIBUTOS {
        return Err(AppError::Malformed {
            file: "personagens.json".into(),
            cause: format!("o personagem ja tem {MAX_ATRIBUTOS} atributos"),
        });
    }

    let mut atributo = Atributo {
        id: uuid::Uuid::new_v4().to_string(),
        sigla: sigla.to_string(),
        valor,
        descricao: None,
    };
    ajustar_atributo(&mut atributo);

    personagem.atributos.push(atributo.clone());
    save(vault, &personagens)?;

    Ok(atributo)
}

/// O que se pode trocar num atributo. Ausente nao mexe.
///
/// Campos opcionais pela mesma razao do `PatchMedidor`: o gesto comum e mexer
/// so no valor, e mandar o registro inteiro deixaria uma tela desatualizada
/// reescrever a sigla que outra acabou de trocar.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchAtributo {
    pub sigla: Option<String>,
    pub valor: Option<i64>,
    /// `Some("")` apaga a descricao.
    pub descricao: Option<String>,
}

/// Edita um atributo e devolve como ele ficou depois do ajuste.
///
/// Devolve o registro porque o valor gravado pode nao ser o mandado: 5000 vira
/// 999, e a tela que nao soubesse disso mostraria o numero que pediu.
pub fn editar_atributo(
    vault: &Vault,
    id: &str,
    atributo_id: &str,
    patch: PatchAtributo,
) -> AppResult<Atributo> {
    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;

    let atributo = personagens[alvo]
        .atributos
        .iter_mut()
        .find(|a| a.id == atributo_id)
        .ok_or_else(|| sem_atributo(id, atributo_id))?;

    if let Some(sigla) = patch.sigla {
        atributo.sigla = sigla;
    }
    if let Some(valor) = patch.valor {
        atributo.valor = valor;
    }
    if let Some(descricao) = patch.descricao {
        atributo.descricao = Some(descricao);
    }
    ajustar_atributo(atributo);
    let saida = atributo.clone();

    save(vault, &personagens)?;

    Ok(saida)
}

/// Tira um atributo da lista.
pub fn remover_atributo(vault: &Vault, id: &str, atributo_id: &str) -> AppResult<()> {
    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;
    let personagem = &mut personagens[alvo];

    if !personagem.atributos.iter().any(|a| a.id == atributo_id) {
        return Err(sem_atributo(id, atributo_id));
    }

    personagem.atributos.retain(|a| a.id != atributo_id);

    save(vault, &personagens)
}

/// Acrescenta atributos ao fim, pulando a sigla que o personagem ja tem.
///
/// O caminho dos modelos da campanha, e a guarda e a mesma de
/// `acrescentar_medidores`: quem ja tem FOR nao ganha um segundo, sem
/// diferenciar caixa. Personagem cheio recebe o que cabe. Devolve quantos
/// entraram.
pub fn acrescentar_atributos(vault: &Vault, id: &str, novos: Vec<Atributo>) -> AppResult<usize> {
    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;
    let personagem = &mut personagens[alvo];

    let cabem = MAX_ATRIBUTOS.saturating_sub(personagem.atributos.len());
    if cabem == 0 {
        return Ok(0);
    }

    let mut tomadas: Vec<String> = personagem
        .atributos
        .iter()
        .map(|atributo| chave_do_nome(&atributo.sigla))
        .collect();

    let mut entrando: Vec<Atributo> = Vec::new();

    for mut atributo in novos {
        if entrando.len() >= cabem {
            break;
        }

        ajustar_atributo(&mut atributo);

        let chave = chave_do_nome(&atributo.sigla);
        if tomadas.contains(&chave) {
            continue;
        }

        tomadas.push(chave);
        entrando.push(atributo);
    }

    let quantos = entrando.len();
    if quantos == 0 {
        return Ok(0);
    }

    personagem.atributos.extend(entrando);
    save(vault, &personagens)?;

    Ok(quantos)
}

// --- condicoes ---------------------------------------------------------------

/// Quantas condicoes cabem num personagem.
///
/// Oito. Limite de LAYOUT, como o dos medidores: os selos desenham numa
/// fileira sobre a cabeca do token, e passando disso a fileira fica mais larga
/// que o nome que ela acompanha.
pub const MAX_CONDICOES: usize = 8;

/// O teto do nome. O mesmo do medidor: e um rotulo, lido de longe.
pub const MAX_NOME_CONDICAO: usize = 24;

/// O teto do nome do icone. Folgado para qualquer nome da lista da tela, e
/// curto o bastante para o arquivo editado a mao nao guardar um paragrafo ali.
const MAX_ICONE: usize = 32;

/// O icone de quem chegou sem nenhum. A tela desenha o mesmo para nome
/// desconhecido, entao os dois casos se leem igual.
pub const ICONE_PADRAO: &str = "circulo";

fn sem_condicao(id: &str, condicao_id: &str) -> AppError {
    AppError::Malformed {
        file: "personagens.json".into(),
        cause: format!("personagem {id} nao tem a condicao {condicao_id}"),
    }
}

/// Poe a condicao em forma: nome curto e nunca vazio, icone curto e nunca
/// vazio, e efeito sem forma de id vira so o selo. A cor passa como veio, pela
/// razao do medidor.
pub fn ajustar_condicao(condicao: &mut Condicao) {
    condicao.efeito = condicao.efeito.as_deref().and_then(efeito_em_forma);

    condicao.nome = texto_curto(&condicao.nome, MAX_NOME_CONDICAO);
    if condicao.nome.is_empty() {
        condicao.nome = "Condição".to_string();
    }

    condicao.icone = texto_curto(&condicao.icone, MAX_ICONE);
    if condicao.icone.is_empty() {
        condicao.icone = ICONE_PADRAO.to_string();
    }
}

/// Cria uma condicao no fim da lista do personagem.
///
/// Nome repetido ENTRA, ao contrario do caminho dos modelos: aqui e o mestre
/// criando uma linha na ficha, e ela nasce com um nome provisorio que ele
/// corrige na hora. Recusar o segundo "Condicao" o obrigaria a renomear a
/// primeira antes de criar a segunda.
pub fn criar_condicao(
    vault: &Vault,
    id: &str,
    nome: &str,
    cor: &str,
    icone: &str,
    efeito: Option<String>,
) -> AppResult<Condicao> {
    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;
    let personagem = &mut personagens[alvo];

    if personagem.condicoes.len() >= MAX_CONDICOES {
        return Err(AppError::Malformed {
            file: "personagens.json".into(),
            cause: format!("o personagem ja tem {MAX_CONDICOES} condicoes"),
        });
    }

    let mut condicao = Condicao {
        id: uuid::Uuid::new_v4().to_string(),
        nome: nome.to_string(),
        cor: cor.to_string(),
        icone: icone.to_string(),
        efeito,
        escondido: false,
    };
    ajustar_condicao(&mut condicao);

    personagem.condicoes.push(condicao.clone());
    save(vault, &personagens)?;

    Ok(condicao)
}

/// O que se pode trocar numa condicao. Ausente nao mexe.
///
/// `efeito` e `Option<Option<_>>`, como a imagem do item do inventario:
/// ausente nao mexe, e presente com `null` TIRA o efeito. Um `Option` so nao
/// conseguiria dizer "volte a ser so o selo".
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchCondicao {
    #[serde(default)]
    pub nome: Option<String>,
    #[serde(default)]
    pub cor: Option<String>,
    #[serde(default)]
    pub icone: Option<String>,
    #[serde(default, deserialize_with = "efeito_presente")]
    pub efeito: Option<Option<String>>,
    #[serde(default)]
    pub escondido: Option<bool>,
}

/// Distingue "campo ausente" de "campo com `null`". Ver `inventory::presente`.
///
/// A forma do id quem confere e `ajustar_condicao`, no fim do `aplicar`: um id
/// torto vira so o selo, como no disco.
fn efeito_presente<'de, D>(de: D) -> Result<Option<Option<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<String>::deserialize(de).map(Some)
}

impl PatchCondicao {
    /// Aplica o patch e poe a condicao em forma. Serve a ficha e aos modelos.
    pub fn aplicar(self, condicao: &mut Condicao) {
        if let Some(nome) = self.nome {
            condicao.nome = nome;
        }
        if let Some(cor) = self.cor {
            condicao.cor = cor;
        }
        if let Some(icone) = self.icone {
            condicao.icone = icone;
        }
        if let Some(efeito) = self.efeito {
            condicao.efeito = efeito;
        }
        if let Some(escondido) = self.escondido {
            condicao.escondido = escondido;
        }

        ajustar_condicao(condicao);
    }
}

/// Edita uma condicao e devolve como ela ficou depois do ajuste.
pub fn editar_condicao(
    vault: &Vault,
    id: &str,
    condicao_id: &str,
    patch: PatchCondicao,
) -> AppResult<Condicao> {
    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;

    let condicao = personagens[alvo]
        .condicoes
        .iter_mut()
        .find(|c| c.id == condicao_id)
        .ok_or_else(|| sem_condicao(id, condicao_id))?;

    patch.aplicar(condicao);
    let saida = condicao.clone();

    save(vault, &personagens)?;

    Ok(saida)
}

/// Tira uma condicao do personagem.
pub fn remover_condicao(vault: &Vault, id: &str, condicao_id: &str) -> AppResult<()> {
    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;
    let personagem = &mut personagens[alvo];

    if !personagem.condicoes.iter().any(|c| c.id == condicao_id) {
        return Err(sem_condicao(id, condicao_id));
    }

    personagem.condicoes.retain(|c| c.id != condicao_id);

    save(vault, &personagens)
}

/// Poe as condicoes na ordem pedida. Mesma regra de `reordenar_medidores`: o
/// que falta no pedido fica no fim, e nada some.
pub fn reordenar_condicoes(
    vault: &Vault,
    id: &str,
    ordem: &[String],
) -> AppResult<Vec<Condicao>> {
    let mut personagens = load(vault)?;
    let alvo = indice(&personagens, id)?;
    let personagem = &mut personagens[alvo];

    let mut restantes = std::mem::take(&mut personagem.condicoes);
    let mut arrumadas: Vec<Condicao> = Vec::with_capacity(restantes.len());

    for pedido in ordem {
        if let Some(posicao) = restantes.iter().position(|c| &c.id == pedido) {
            arrumadas.push(restantes.remove(posicao));
        }
    }
    arrumadas.append(&mut restantes);

    personagem.condicoes = arrumadas.clone();
    save(vault, &personagens)?;

    Ok(arrumadas)
}

/// Liga ou desliga uma condicao, pelo NOME, em varios personagens de uma vez.
///
/// E o gesto do menu do token: o mestre seleciona a horda e marca
/// "Envenenado". Pelo nome, e nao por um id de modelo guardado na condicao,
/// pela mesma razao da guarda de `acrescentar_medidores`: o que a mesa le e o
/// nome, e "Envenenado" que veio do modelo e "envenenado" criado na ficha sao
/// a mesma coisa para quem olha a TV.
///
/// Ligar em quem ja tem nao duplica, e ligar em quem esta cheio nao derruba a
/// volta -- a horda de trinta nao pode parar no goblin que ja tinha oito.
/// Desligar tira TODAS as linhas com aquele nome, que e o que "nao esta mais
/// envenenado" quer dizer.
///
/// Devolve quantos personagens MUDARAM, e grava uma vez so: sao trinta
/// personagens no mesmo arquivo, e trinta regravacoes do indice por um clique
/// seriam trinta chances de a TV ler o arquivo pela metade.
pub fn alternar_condicao(
    vault: &Vault,
    ids: &[String],
    modelo: &Condicao,
    ligar: bool,
) -> AppResult<usize> {
    let mut personagens = load(vault)?;
    let chave = chave_do_nome(&modelo.nome);
    let mut mudaram = 0;

    for personagem in personagens.iter_mut().filter(|p| ids.contains(&p.id)) {
        let tem = personagem
            .condicoes
            .iter()
            .any(|c| chave_do_nome(&c.nome) == chave);

        if ligar {
            if tem || personagem.condicoes.len() >= MAX_CONDICOES {
                continue;
            }

            // Id NOVO, como o medidor materializado: dois personagens com o
            // mesmo id de condicao fariam a ficha editar a linha errada.
            let mut nova = Condicao {
                id: uuid::Uuid::new_v4().to_string(),
                ..modelo.clone()
            };
            ajustar_condicao(&mut nova);
            personagem.condicoes.push(nova);
            mudaram += 1;
        } else if tem {
            personagem
                .condicoes
                .retain(|c| chave_do_nome(&c.nome) != chave);
            mudaram += 1;
        }
    }

    if mudaram > 0 {
        save(vault, &personagens)?;
    }

    Ok(mudaram)
}

/// Aponta TODA condicao com este nome, em todos os personagens, para o efeito.
///
/// E o "muda junto" da condicao com efeito proprio: quando o mestre configura
/// o efeito de "Em chamas" no cardapio, o goblin que ja esta em chamas passa a
/// desenhar o efeito novo. So o efeito -- nome, cor e icone continuam sendo a
/// copia da ficha, como sempre. Pelo NOME, a mesma chave de
/// `alternar_condicao`. Grava uma vez so, e devolve quantas condicoes mudaram.
pub fn apontar_efeito_por_nome(vault: &Vault, nome: &str, efeito: &str) -> AppResult<usize> {
    let mut personagens = load(vault)?;
    let chave = chave_do_nome(nome);
    let mut mudaram = 0;

    for condicao in personagens
        .iter_mut()
        .flat_map(|personagem| personagem.condicoes.iter_mut())
        .filter(|condicao| chave_do_nome(&condicao.nome) == chave)
    {
        if condicao.efeito.as_deref() != Some(efeito) {
            condicao.efeito = Some(efeito.to_string());
            mudaram += 1;
        }
    }

    if mudaram > 0 {
        save(vault, &personagens)?;
    }

    Ok(mudaram)
}

/// Os ids de todos os personagens, para quem precisa percorrer a mesa inteira.
pub fn todos_os_ids(vault: &Vault) -> AppResult<Vec<String>> {
    Ok(load(vault)?.into_iter().map(|p| p.id).collect())
}

/// O personagem sem os medidores e as condicoes que a mesa nao ve.
///
/// Uma funcao, e nao um `skip_serializing_if` no campo: a decisao e de QUEM
/// pergunta, como em `sem_aparencias`. O mestre le o mesmo `Personagem` pelo
/// IPC e precisa da lista inteira para desenhar a ficha.
///
/// Mora aqui e nao em `serve` porque os dois lados a chamam: o daemon antes de
/// responder ao celular, e o Mestre antes de publicar o estado da mesa.
pub fn sem_ocultos(personagem: &Personagem) -> Personagem {
    Personagem {
        medidores: personagem
            .medidores
            .iter()
            .filter(|m| !m.escondido)
            .cloned()
            .collect(),
        condicoes: personagem
            .condicoes
            .iter()
            .filter(|c| !c.escondido)
            .cloned()
            .collect(),
        ..personagem.clone()
    }
}

/// Remove o personagem e a pasta dele.
///
/// O vinculo com jogador NAO e removido aqui: ele vive no banco de estado, e
/// quem o apaga e `players::unlink_all`. Sao dois donos diferentes, e chamar um
/// de dentro do outro faria o vault depender do banco.
pub fn remove(vault: &Vault, id: &str) -> AppResult<()> {
    let personagens: Vec<Personagem> = load(vault)?.into_iter().filter(|p| p.id != id).collect();
    save(vault, &personagens)?;

    let pasta = dir(vault, id);
    if pasta.exists() {
        // Aviso em vez de erro: o indice ja foi gravado, e falhar aqui deixaria
        // a tela dizendo que nao removeu algo que ela nao mostra mais.
        if let Err(cause) = std::fs::remove_dir_all(&pasta) {
            log::warn!("personagem {id} saiu mas {} ficou: {cause}", pasta.display());
        }
    }

    Ok(())
}

pub fn list_anexos(vault: &Vault, id: &str) -> AppResult<Vec<Anexo>> {
    let mut anexos = Vec::new();

    for autor in [Autor::Mestre, Autor::Jogador] {
        let Ok(entries) = std::fs::read_dir(anexos_dir(vault, id, autor)) else {
            // Personagem sem anexo daquele autor nao tem a pasta. Lista vazia,
            // nao erro.
            continue;
        };

        for entry in entries.filter_map(Result::ok) {
            let caminho = entry.path();
            if !caminho.is_file() {
                continue;
            }

            let arquivo = entry.file_name().to_string_lossy().to_string();

            // Envio em curso, ou interrompido: nao e anexo ainda. Ver
            // `anexo_temp`.
            if arquivo.starts_with('.') {
                continue;
            }

            let tamanho = entry.metadata().map(|meta| meta.len()).unwrap_or(0);

            anexos.push(Anexo {
                mime_type: mime_for(&arquivo).to_string(),
                arquivo,
                tamanho,
                autor,
            });
        }
    }

    // Mestre antes de jogador, e alfabetico dentro de cada um: a ordem do
    // `read_dir` e a do sistema de arquivos, que muda entre maquinas e faria a
    // lista se reordenar sozinha entre duas leituras.
    anexos.sort_by(|a, b| match (a.autor, b.autor) {
        (Autor::Mestre, Autor::Jogador) => std::cmp::Ordering::Less,
        (Autor::Jogador, Autor::Mestre) => std::cmp::Ordering::Greater,
        _ => a.arquivo.cmp(&b.arquivo),
    });

    Ok(anexos)
}

/// Caminho de um anexo, conferido.
///
/// O nome passa por `safe_attachment_name` mesmo na LEITURA, e nao so na
/// escrita. E o que impede `../../config.json` de virar caminho: sanear na
/// entrada protege o que este processo grava, e sanear na leitura protege o que
/// ele entrega -- e quem pede a leitura e uma rota da rede.
fn anexo_path(vault: &Vault, id: &str, autor: Autor, arquivo: &str) -> PathBuf {
    anexos_dir(vault, id, autor).join(safe_attachment_name(arquivo))
}

/// O caminho do anexo, para quem precisa do ARQUIVO e nao dos bytes.
///
/// Quem precisa disso e a reducao: ela decodifica a imagem do disco, e ler 8 MB
/// para a memoria antes so para entrega-los ao decodificador seria pagar a
/// copia inteira duas vezes -- ver `variantes::ensure_arquivo`.
pub fn anexo_caminho(vault: &Vault, id: &str, autor: Autor, arquivo: &str) -> PathBuf {
    anexo_path(vault, id, autor, arquivo)
}

/// A chave de cache da reducao de um anexo.
///
/// O acervo usa o id do asset, que ja e um nome de arquivo valido e unico. O
/// anexo nao tem id: ele e identificado por PERSONAGEM + AUTOR + NOME, e nome
/// de arquivo do jogador pode ter acento, espaco e barra. O hash resolve os
/// dois problemas de uma vez -- vira nome seguro, e nao colide entre dois
/// personagens com "ficha.pdf".
///
/// Saneado antes de entrar no hash, e nao depois: a chave tem de ser a mesma
/// que o caminho lido, e `anexo_path` sanea. Sem isso, "ficha .pdf" e
/// "ficha.pdf" -- que viram o mesmo arquivo -- teriam duas reducoes.
///
/// A reducao de um anexo APAGADO fica para tras no cache. E alguns KB por
/// arquivo removido, num diretorio que existe para ser descartavel: quem troca
/// o anexo pelo mesmo nome reescreve a mesma chave, e quem apaga de vez deixa
/// um orfao que nada alcanca.
pub fn anexo_chave(id: &str, autor: Autor, arquivo: &str) -> String {
    let digest = Sha256::digest(
        format!("{id}/{}/{}", autor.pasta(), safe_attachment_name(arquivo)).as_bytes(),
    );

    // Metade do sha256 -- 128 bits. Colisao aqui e a miniatura de um anexo
    // aparecendo noutro, e 128 bits sao mais do que suficiente para uma chave
    // de cache local.
    digest[..16].iter().fold("anexo-".to_string(), |mut chave, byte| {
        use std::fmt::Write as _;
        let _ = write!(chave, "{byte:02x}");
        chave
    })
}

/// Copia um arquivo do disco do mestre para os anexos do personagem.
///
/// Copia, nao move: o arquivo escolhido continua onde estava. Mover deixaria o
/// mestre sem o original por ter anexado uma ficha.
pub fn import_anexo(vault: &Vault, id: &str, origem: &std::path::Path) -> AppResult<Anexo> {
    exige(vault, id)?;

    let nome = origem
        .file_name()
        .map(|nome| nome.to_string_lossy().to_string())
        .unwrap_or_else(|| "arquivo".to_string());

    let bytes = std::fs::metadata(origem)?.len();
    escreve(vault, id, Autor::Mestre, &nome, bytes, |destino| {
        std::fs::copy(origem, destino).map(|_| ())
    })
}

/// Grava um anexo mandado pelo jogador, pela rede.
pub fn write_anexo(vault: &Vault, id: &str, nome: &str, bytes: &[u8]) -> AppResult<Anexo> {
    exige(vault, id)?;

    escreve(vault, id, Autor::Jogador, nome, bytes.len() as u64, |destino| {
        std::fs::write(destino, bytes)
    })
}

/// O que os dois caminhos de escrita tem em comum: limites, nome e pasta.
fn escreve(
    vault: &Vault,
    id: &str,
    autor: Autor,
    nome: &str,
    tamanho: u64,
    gravar: impl FnOnce(&std::path::Path) -> std::io::Result<()>,
) -> AppResult<Anexo> {
    if tamanho > autor.max_bytes() {
        return Err(AppError::Malformed {
            file: nome.to_string(),
            cause: format!("passa do teto de {} MB", autor.max_bytes() / 1024 / 1024),
        });
    }

    let ja_tem = list_anexos(vault, id)?.iter().filter(|a| a.autor == autor).count();
    if ja_tem >= MAX_ANEXOS {
        return Err(AppError::Malformed {
            file: nome.to_string(),
            cause: format!("o limite e de {MAX_ANEXOS} anexos"),
        });
    }

    let arquivo = safe_attachment_name(nome);
    let pasta = anexos_dir(vault, id, autor);
    std::fs::create_dir_all(&pasta)?;

    gravar(&pasta.join(&arquivo))?;

    Ok(Anexo {
        mime_type: mime_for(&arquivo).to_string(),
        arquivo,
        tamanho,
        autor,
    })
}

/// Tipo declarado a partir da extensao, para quem serve o arquivo pela rede.
pub fn mime_do_anexo(arquivo: &str) -> &'static str {
    mime_for(&safe_attachment_name(arquivo))
}

/// Caminho temporario para um envio em curso.
///
/// Na MESMA pasta do destino, para o `rename` final ser dentro do mesmo
/// sistema de arquivos -- entre dispositivos ele viraria copia, e uma copia de
/// 64 MB no fim do upload dobra o tempo e pode falhar pela metade.
///
/// O ponto no nome mantem o temporario fora da listagem: `list_anexos` filtra
/// por arquivo, e um envio interrompido nao deveria aparecer como anexo.
pub fn anexo_temp(vault: &Vault, id: &str, autor: Autor) -> PathBuf {
    anexos_dir(vault, id, autor).join(format!(".envio-{}", uuid::Uuid::new_v4().simple()))
}

/// Adota o temporario como anexo do personagem.
///
/// O limite e conferido AQUI, e nao antes de receber: quantos anexos existem e
/// uma pergunta ao disco, e responder antes do upload deixaria a janela entre a
/// checagem e a gravacao aberta para dois envios simultaneos passarem.
pub fn adopt_anexo(
    vault: &Vault,
    id: &str,
    autor: Autor,
    temp: &std::path::Path,
    nome_enviado: &str,
) -> AppResult<Anexo> {
    let ja_tem = list_anexos(vault, id)?.iter().filter(|a| a.autor == autor).count();
    if ja_tem >= MAX_ANEXOS {
        // O temporario recusado nao pode ficar: ele nao aparece em lista
        // nenhuma, e ninguem o apagaria depois.
        let _ = std::fs::remove_file(temp);

        return Err(AppError::Malformed {
            file: "anexos".into(),
            cause: format!("limite de {MAX_ANEXOS} arquivos por autor"),
        });
    }

    let arquivo = safe_attachment_name(nome_enviado);
    let destino = anexos_dir(vault, id, autor).join(&arquivo);

    std::fs::rename(temp, &destino)?;

    let tamanho = std::fs::metadata(&destino).map(|meta| meta.len()).unwrap_or(0);

    Ok(Anexo {
        mime_type: mime_for(&arquivo).to_string(),
        arquivo,
        tamanho,
        autor,
    })
}

/// Caminho de um anexo que EXISTE, conferido contra travessia.
///
/// Devolve `Option` porque quem chama transmite o arquivo para a mesa: apontar
/// a evidencia para um caminho que nao existe deixaria a TV com um endereco que
/// responde 404, e o mestre sem saber por que.
///
/// Cinto e suspensorio, como no anexo de jogador: mesmo depois de sanear o
/// nome, o caminho tem de cair dentro da pasta daquele autor.
pub fn anexo_existente(
    vault: &Vault,
    id: &str,
    autor: Autor,
    arquivo: &str,
) -> Option<PathBuf> {
    let dir = anexos_dir(vault, id, autor);
    let caminho = dir.join(safe_attachment_name(arquivo));

    if !caminho.starts_with(&dir) || !caminho.is_file() {
        return None;
    }

    Some(caminho)
}

pub fn read_anexo(vault: &Vault, id: &str, autor: Autor, arquivo: &str) -> AppResult<Vec<u8>> {
    Ok(std::fs::read(anexo_path(vault, id, autor, arquivo))?)
}

/// Apaga o anexo, e limpa o campo Ficha se era ele.
///
/// O campo guarda o NOME do arquivo, nao uma referencia que o disco valide --
/// ver `Personagem::ficha`. Sem esta limpeza, apagar a ficha pela lista de
/// arquivos deixava o campo apontando para um nome que nao existe mais: a
/// linha da ficha seguia mostrando o nome, oferecia transmitir, e a
/// transmissao falhava no daemon. Retrato e miniatura nao entram aqui porque
/// guardam id do acervo, e nao anexo.
pub fn remove_anexo(vault: &Vault, id: &str, autor: Autor, arquivo: &str) -> AppResult<()> {
    let caminho = anexo_path(vault, id, autor, arquivo);
    if caminho.exists() {
        std::fs::remove_file(caminho)?;
    }

    // Ficha e sempre anexo do mestre: o jogador apagando um arquivo dele nao
    // pode limpar campo de personagem.
    if autor != Autor::Mestre {
        return Ok(());
    }

    let nome = safe_attachment_name(arquivo);
    let mut personagens = load(vault)?;
    let mut mexeu = false;

    for personagem in personagens.iter_mut() {
        if personagem.id == id && personagem.ficha.as_deref() == Some(nome.as_str()) {
            personagem.ficha = None;
            mexeu = true;
        }
    }

    // Só regrava se mexeu: apagar um anexo qualquer nao deveria reescrever o
    // indice inteiro.
    if mexeu {
        save(vault, &personagens)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::create(dir.path().join("campanha"), "Campanha").unwrap();
        (dir, vault)
    }

    #[test]
    fn cria_e_lista() {
        let (_tmp, vault) = vault();

        let a = create(&vault, "Edgar").unwrap();
        let b = create(&vault, "Mira").unwrap();

        let lista = load(&vault).unwrap();
        assert_eq!(lista.len(), 2);
        assert_eq!(lista[0].id, a.id);
        assert_eq!(lista[1].nome, "Mira");
        assert!(b.ficha.is_none() && b.retrato.is_none() && b.miniatura.is_none());
    }

    #[test]
    fn nome_vazio_ganha_rotulo() {
        let (_tmp, vault) = vault();

        assert_eq!(create(&vault, "   ").unwrap().nome, "Sem nome");
    }

    #[test]
    fn renomear_ignora_vazio() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        rename(&vault, &p.id, "  ").unwrap();

        assert_eq!(load(&vault).unwrap()[0].nome, "Edgar");
    }

    #[test]
    fn campos_nomeados_guardam_e_limpam() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        set_campo(&vault, &p.id, Campo::Ficha, Some("ficha.pdf")).unwrap();
        set_campo(&vault, &p.id, Campo::Retrato, Some("asset-1")).unwrap();
        set_campo(&vault, &p.id, Campo::Miniatura, Some("asset-2")).unwrap();

        let lido = &load(&vault).unwrap()[0];
        assert_eq!(lido.ficha.as_deref(), Some("ficha.pdf"));
        assert_eq!(lido.retrato.as_deref(), Some("asset-1"));
        assert_eq!(lido.miniatura.as_deref(), Some("asset-2"));

        set_campo(&vault, &p.id, Campo::Retrato, None).unwrap();
        assert!(load(&vault).unwrap()[0].retrato.is_none());

        // Espaco em branco limpa igual: um campo com " " seria um id que nao
        // resolve, e a tela mostraria imagem quebrada em vez de campo vazio.
        set_campo(&vault, &p.id, Campo::Miniatura, Some("   ")).unwrap();
        assert!(load(&vault).unwrap()[0].miniatura.is_none());
    }

    /// Campanha gravada antes das aparencias continua abrindo, e ganha a
    /// Padrao montada do que ja estava no topo.
    ///
    /// Se este teste quebrar, abrir uma campanha antiga passou a mostrar
    /// personagem sem aparencia nenhuma -- e a primeira escrita gravaria essa
    /// lista vazia por cima do retrato que estava la.
    #[test]
    fn ficha_antiga_ganha_padrao() {
        let (_tmp, vault) = vault();

        // O arquivo como era: sem `aparencias` e sem `aparenciaAtiva`.
        let antigo = r#"[{"id":"p1","nome":"Edgar","retrato":"a1","miniatura":"a2","criadoEm":1}]"#;
        std::fs::write(index_path(&vault), antigo).unwrap();

        let lido = &load(&vault).unwrap()[0];

        assert_eq!(lido.aparencias.len(), 1);
        assert_eq!(lido.aparencias[0].id, APARENCIA_PADRAO);
        assert_eq!(lido.aparencias[0].retrato.as_deref(), Some("a1"));
        assert_eq!(lido.aparencias[0].miniatura.as_deref(), Some("a2"));
        assert_eq!(lido.aparencia_ativa.as_deref(), Some(APARENCIA_PADRAO));
        // O topo nao se mexeu: quem le `retrato` continua lendo o mesmo.
        assert_eq!(lido.retrato.as_deref(), Some("a1"));
    }

    /// Ir e voltar entre duas aparencias preserva as imagens de cada uma.
    ///
    /// E a afirmacao central do sistema: a aparencia guarda o que era dela, e o
    /// trio de cima e so quem esta no ar. Se quebrar, trocar de aparencia
    /// passou a ser uma via de mao unica que apaga a anterior.
    #[test]
    fn troca_de_ida_e_volta_preserva_as_duas() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        set_campo(&vault, &p.id, Campo::Retrato, Some("rosto")).unwrap();
        set_campo(&vault, &p.id, Campo::Miniatura, Some("peca")).unwrap();

        let ferido = criar_aparencia(&vault, &p.id, "Ferido").unwrap();
        // Nasce copiando a que estava no ar.
        assert_eq!(ferido.retrato.as_deref(), Some("rosto"));

        ativar_aparencia(&vault, &p.id, &ferido.id).unwrap();
        set_campo(&vault, &p.id, Campo::Miniatura, Some("peca-ferida")).unwrap();

        let no_ar = &load(&vault).unwrap()[0];
        assert_eq!(no_ar.miniatura.as_deref(), Some("peca-ferida"));
        assert_eq!(no_ar.retrato.as_deref(), Some("rosto"));

        // De volta a Padrao: a miniatura de antes esta inteira.
        let voltou = ativar_aparencia(&vault, &p.id, APARENCIA_PADRAO).unwrap();
        assert_eq!(voltou.miniatura.as_deref(), Some("peca"));

        // E a Ferida nao perdeu a dela.
        let lido = &load(&vault).unwrap()[0];
        let guardada = lido
            .aparencias
            .iter()
            .find(|a| a.id == ferido.id)
            .expect("a aparencia continua na lista");
        assert_eq!(guardada.miniatura.as_deref(), Some("peca-ferida"));
    }

    /// `set_campo` escreve no topo E na linha ativa.
    ///
    /// E o que impede a troca seguinte de ressuscitar a imagem antiga por cima
    /// da que o mestre acabou de anexar.
    #[test]
    fn set_campo_desce_para_a_aparencia_ativa() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        set_campo(&vault, &p.id, Campo::Retrato, Some("rosto")).unwrap();

        let lido = &load(&vault).unwrap()[0];
        assert_eq!(lido.aparencias[0].retrato.as_deref(), Some("rosto"));

        // A ficha NAO desce: ela e o documento da pessoa, nao a cara dela.
        set_campo(&vault, &p.id, Campo::Ficha, Some("ficha.pdf")).unwrap();
        assert!(load(&vault).unwrap()[0].aparencias[0].retrato.as_deref() == Some("rosto"));
    }

    #[test]
    fn padrao_nao_sai_e_remover_a_ativa_cai_nela() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        set_campo(&vault, &p.id, Campo::Miniatura, Some("peca")).unwrap();
        let lobo = criar_aparencia(&vault, &p.id, "Lobo").unwrap();
        ativar_aparencia(&vault, &p.id, &lobo.id).unwrap();
        set_campo(&vault, &p.id, Campo::Miniatura, Some("peca-lobo")).unwrap();

        assert!(remover_aparencia(&vault, &p.id, APARENCIA_PADRAO).is_err());

        let sobrou = remover_aparencia(&vault, &p.id, &lobo.id).unwrap();
        assert_eq!(sobrou.aparencia_ativa.as_deref(), Some(APARENCIA_PADRAO));
        // O trio de cima voltou junto: a tela nao fica com a cara removida.
        assert_eq!(sobrou.miniatura.as_deref(), Some("peca"));
        assert_eq!(sobrou.aparencias.len(), 1);
    }

    #[test]
    fn anexo_do_mestre_e_do_jogador_convivem() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        write_anexo(&vault, &p.id, "Notas do Jogador.txt", b"oi").unwrap();

        let origem = _tmp.path().join("ficha.pdf");
        std::fs::write(&origem, b"pdf").unwrap();
        import_anexo(&vault, &p.id, &origem).unwrap();

        let anexos = list_anexos(&vault, &p.id).unwrap();
        assert_eq!(anexos.len(), 2);
        // Mestre primeiro, sempre.
        assert_eq!(anexos[0].autor, Autor::Mestre);
        assert_eq!(anexos[0].arquivo, "ficha.pdf");
        assert_eq!(anexos[1].autor, Autor::Jogador);
        assert_eq!(anexos[1].arquivo, "notas-do-jogador.txt");
    }

    #[test]
    fn autor_isola_a_remocao() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        write_anexo(&vault, &p.id, "ficha.pdf", b"do jogador").unwrap();

        // Mesmo NOME, outro autor: remover como mestre nao pode alcancar o
        // arquivo do jogador. E a garantia que vem de o autor ser o diretorio.
        remove_anexo(&vault, &p.id, Autor::Mestre, "ficha.pdf").unwrap();

        let anexos = list_anexos(&vault, &p.id).unwrap();
        assert_eq!(anexos.len(), 1);
        assert_eq!(anexos[0].autor, Autor::Jogador);
    }

    #[test]
    fn apagar_a_ficha_limpa_o_campo() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        let anexo = write_anexo(&vault, &p.id, "ficha-edgar.jpg", b"jpg").unwrap();
        set_campo(&vault, &p.id, Campo::Ficha, Some(&anexo.arquivo)).unwrap();

        remove_anexo(&vault, &p.id, Autor::Mestre, &anexo.arquivo).unwrap();

        // Campo pendurado num arquivo apagado fazia a tela oferecer transmitir
        // uma ficha que nao existe.
        let lido = load(&vault).unwrap();
        assert_eq!(lido[0].ficha, None);
    }

    #[test]
    fn apagar_outro_anexo_nao_mexe_na_ficha() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        write_anexo(&vault, &p.id, "ficha-edgar.jpg", b"jpg").unwrap();
        let outro = write_anexo(&vault, &p.id, "mario.jpg", b"jpg").unwrap();
        set_campo(&vault, &p.id, Campo::Ficha, Some("ficha-edgar.jpg")).unwrap();

        remove_anexo(&vault, &p.id, Autor::Mestre, &outro.arquivo).unwrap();

        let lido = load(&vault).unwrap();
        assert_eq!(lido[0].ficha.as_deref(), Some("ficha-edgar.jpg"));
    }

    #[test]
    fn nome_com_travessia_nao_escapa() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        let anexo = write_anexo(&vault, &p.id, "../../../config.json", b"x").unwrap();

        assert!(!anexo.arquivo.contains('/'));
        assert!(!anexo.arquivo.contains(".."));
        // E o config da campanha continua o que era.
        let config = std::fs::read_to_string(Vault::config_path(&vault.root)).unwrap();
        assert!(config.contains("Campanha"));
    }

    #[test]
    fn recusa_anexo_grande_do_jogador() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        let grande = vec![0u8; 0];
        // O teto e conferido pelo tamanho declarado, entao basta um vetor
        // pequeno com um pedido grande para exercitar o caminho.
        let erro = escreve(
            &vault,
            &p.id,
            Autor::Jogador,
            "mapa.png",
            Autor::Jogador.max_bytes() + 1,
            |destino| std::fs::write(destino, &grande),
        );

        assert!(erro.is_err());
        assert!(list_anexos(&vault, &p.id).unwrap().is_empty());
    }

    #[test]
    fn id_inventado_nao_cria_pasta() {
        let (_tmp, vault) = vault();

        assert!(write_anexo(&vault, "nao-existe", "ficha.pdf", b"x").is_err());
        assert!(!dir(&vault, "nao-existe").exists());
    }

    #[test]
    fn remover_leva_a_pasta() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();
        write_anexo(&vault, &p.id, "ficha.pdf", b"x").unwrap();

        remove(&vault, &p.id).unwrap();

        assert!(load(&vault).unwrap().is_empty());
        assert!(!dir(&vault, &p.id).exists());
    }

    // --- medidores -----------------------------------------------------------

    fn com_medidor(vault: &Vault, maximo: i64) -> (String, Medidor) {
        let p = create(vault, "Edgar").unwrap();
        let m = criar_medidor(vault, &p.id, "Vida", "#ef4444", Estilo::Barra, maximo).unwrap();

        (p.id, m)
    }

    #[test]
    fn medidor_nasce_cheio() {
        let (_tmp, vault) = vault();
        let (_, m) = com_medidor(&vault, 20);

        assert_eq!(m.atual, 20);
        assert_eq!(m.maximo, 20);
        assert!(!m.escondido);
    }

    #[test]
    fn atual_nao_passa_do_maximo_nem_fica_negativo() {
        let (_tmp, vault) = vault();
        let (id, m) = com_medidor(&vault, 10);

        let acima = editar_medidor(
            &vault,
            &id,
            &m.id,
            PatchMedidor {
                atual: Some(99),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(acima.atual, 10);

        let abaixo = editar_medidor(
            &vault,
            &id,
            &m.id,
            PatchMedidor {
                atual: Some(-5),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(abaixo.atual, 0);
    }

    #[test]
    fn baixar_o_maximo_puxa_o_atual_junto() {
        // E por isso que `editar_medidor` devolve o registro: a tela mandou
        // `maximo: 4` e nao teria como saber que o `atual` virou 4 tambem.
        let (_tmp, vault) = vault();
        let (id, m) = com_medidor(&vault, 20);

        let apertado = editar_medidor(
            &vault,
            &id,
            &m.id,
            PatchMedidor {
                maximo: Some(4),
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(apertado.maximo, 4);
        assert_eq!(apertado.atual, 4);
    }

    #[test]
    fn subir_o_teto_e_encher_na_mesma_chamada() {
        // O `maximo` e aplicado ANTES do `atual`. Na ordem inversa o valor novo
        // seria preso ao teto velho, e o medidor subiria pela metade.
        let (_tmp, vault) = vault();
        let (id, m) = com_medidor(&vault, 5);

        let subido = editar_medidor(
            &vault,
            &id,
            &m.id,
            PatchMedidor {
                maximo: Some(30),
                atual: Some(30),
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(subido.atual, 30);
    }

    #[test]
    fn maximo_zero_vira_um() {
        let (_tmp, vault) = vault();
        let (id, m) = com_medidor(&vault, 10);

        let zerado = editar_medidor(
            &vault,
            &id,
            &m.id,
            PatchMedidor {
                maximo: Some(0),
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(zerado.maximo, 1);
    }

    #[test]
    fn nome_vazio_nao_deixa_linha_em_branco() {
        let (_tmp, vault) = vault();
        let (id, m) = com_medidor(&vault, 10);

        let sem_nome = editar_medidor(
            &vault,
            &id,
            &m.id,
            PatchMedidor {
                nome: Some("   ".into()),
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(sem_nome.nome, "Medidor");
    }

    #[test]
    fn nome_longo_e_cortado_sem_quebrar_acento() {
        let (_tmp, vault) = vault();
        let (id, m) = com_medidor(&vault, 10);

        let cortado = editar_medidor(
            &vault,
            &id,
            &m.id,
            PatchMedidor {
                nome: Some("á".repeat(200)),
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(cortado.nome.chars().count(), MAX_NOME_MEDIDOR);
    }

    #[test]
    fn o_setimo_medidor_e_recusado() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        for _ in 0..MAX_MEDIDORES {
            criar_medidor(&vault, &p.id, "Vida", "#ef4444", Estilo::Barra, 10).unwrap();
        }

        assert!(criar_medidor(&vault, &p.id, "Vida", "#ef4444", Estilo::Barra, 10).is_err());
        assert_eq!(load(&vault).unwrap()[0].medidores.len(), MAX_MEDIDORES);
    }

    #[test]
    fn o_lote_aplica_em_varios_personagens_e_pula_o_que_sumiu() {
        let (_tmp, vault) = vault();
        let a = create(&vault, "Goblin A").unwrap();
        let b = create(&vault, "Goblin B").unwrap();
        let ma = criar_medidor(&vault, &a.id, "Vida", "#ef4444", Estilo::Barra, 10).unwrap();
        let mb = criar_medidor(&vault, &b.id, "Vida", "#ef4444", Estilo::Barra, 10).unwrap();

        let saida = aplicar_medidores(
            &vault,
            vec![
                MudancaDeMedidor {
                    personagem_id: a.id.clone(),
                    medidor_id: ma.id.clone(),
                    patch: PatchMedidor { atual: Some(7), ..Default::default() },
                },
                // O teto puxa o valor: pediu 50 num maximo 10.
                MudancaDeMedidor {
                    personagem_id: b.id.clone(),
                    medidor_id: mb.id.clone(),
                    patch: PatchMedidor { atual: Some(50), ..Default::default() },
                },
                // Um goblin que ja nao existe nao derruba o dano nos outros.
                MudancaDeMedidor {
                    personagem_id: "sumiu".into(),
                    medidor_id: "x".into(),
                    patch: PatchMedidor { atual: Some(1), ..Default::default() },
                },
            ],
        )
        .unwrap();

        assert_eq!(saida.iter().map(|m| m.atual).collect::<Vec<_>>(), vec![7, 10]);

        let lidos = load(&vault).unwrap();
        assert_eq!(lidos[0].medidores[0].atual, 7);
        assert_eq!(lidos[1].medidores[0].atual, 10);
    }

    #[test]
    fn sem_ocultos_tira_o_escondido_e_mantem_o_resto() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        let visivel = criar_medidor(&vault, &p.id, "Vida", "#ef4444", Estilo::Barra, 10).unwrap();
        let secreto =
            criar_medidor(&vault, &p.id, "Corrupção", "#a855f7", Estilo::Pontos, 6).unwrap();
        editar_medidor(
            &vault,
            &p.id,
            &secreto.id,
            PatchMedidor {
                escondido: Some(true),
                ..Default::default()
            },
        )
        .unwrap();

        let inteiro = &load(&vault).unwrap()[0];
        assert_eq!(inteiro.medidores.len(), 2);

        let filtrado = sem_ocultos(inteiro);
        assert_eq!(filtrado.medidores.len(), 1);
        assert_eq!(filtrado.medidores[0].id, visivel.id);
        // O resto do personagem atravessa intacto: e um filtro, nao uma copia
        // parcial.
        assert_eq!(filtrado.nome, "Edgar");
        assert_eq!(filtrado.aparencias.len(), inteiro.aparencias.len());
    }

    #[test]
    fn reordenar_poe_na_ordem_e_nao_perde_quem_faltou() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        let a = criar_medidor(&vault, &p.id, "A", "#ef4444", Estilo::Barra, 10).unwrap();
        let b = criar_medidor(&vault, &p.id, "B", "#f59e0b", Estilo::Barra, 10).unwrap();
        let c = criar_medidor(&vault, &p.id, "C", "#22c55e", Estilo::Barra, 10).unwrap();

        // O pedido nao menciona `c` -- e o que acontece com uma tela que montou
        // a ordem antes de outra criar o terceiro. Ele fica no fim, nao some.
        let ordem = reordenar_medidores(&vault, &p.id, &[c.id.clone(), a.id.clone()]).unwrap();

        assert_eq!(
            ordem.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
            vec![c.id.as_str(), a.id.as_str(), b.id.as_str()]
        );
    }

    #[test]
    fn legenda_nasce_seguindo_o_estilo_e_o_mestre_a_escolhe() {
        let (_tmp, vault) = vault();
        let (id, m) = com_medidor(&vault, 12);

        // Ausente no arquivo: a ficha antiga e a nova leem igual.
        assert_eq!((m.mostrar_nome, m.mostrar_valor), (None, None));
        let cru = std::fs::read_to_string(index_path(&vault)).unwrap();
        assert!(!cru.contains("mostrarNome") && !cru.contains("mostrarValor"));

        let m = editar_medidor(
            &vault,
            &id,
            &m.id,
            PatchMedidor {
                mostrar_valor: Some(false),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!((m.mostrar_nome, m.mostrar_valor), (None, Some(false)));

        // Outro patch nao mexe no que o mestre escolheu.
        let m = editar_medidor(
            &vault,
            &id,
            &m.id,
            PatchMedidor {
                mostrar_nome: Some(false),
                atual: Some(3),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            (m.mostrar_nome, m.mostrar_valor),
            (Some(false), Some(false))
        );
        assert_eq!(
            load(&vault).unwrap()[0].medidores[0].mostrar_nome,
            Some(false)
        );
    }

    #[test]
    fn campanha_antiga_abre_sem_medidor_nenhum() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        // O campo nao e gravado quando esta vazio, entao o arquivo de uma
        // versao anterior e exatamente este: sem a chave.
        let cru = std::fs::read_to_string(index_path(&vault)).unwrap();
        assert!(!cru.contains("medidores"));

        assert!(load(&vault).unwrap()[0].medidores.is_empty());
        assert_eq!(load(&vault).unwrap()[0].id, p.id);
    }

    // --- condicoes -----------------------------------------------------------

    fn veneno() -> Condicao {
        Condicao {
            id: "modelo-veneno".into(),
            nome: "Envenenado".into(),
            cor: "#22c55e".into(),
            icone: "frasco".into(),
            efeito: Some("tingido".into()),
            escondido: false,
        }
    }

    #[test]
    fn condicao_nasce_com_o_que_foi_pedido() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        let c = criar_condicao(
            &vault,
            &p.id,
            "Envenenado",
            "#22c55e",
            "frasco",
            Some("tingido".into()),
        )
        .unwrap();

        assert_eq!(c.nome, "Envenenado");
        assert_eq!(c.efeito.as_deref(), Some("tingido"));
        assert!(!c.escondido);
        assert_eq!(load(&vault).unwrap()[0].condicoes.len(), 1);
    }

    #[test]
    fn condicao_sem_nome_nem_icone_ganha_os_de_sempre() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        let c = criar_condicao(&vault, &p.id, "  ", "#ef4444", "", None).unwrap();

        assert_eq!(c.nome, "Condição");
        assert_eq!(c.icone, ICONE_PADRAO);
    }

    #[test]
    fn a_nona_condicao_e_recusada() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        for _ in 0..MAX_CONDICOES {
            criar_condicao(&vault, &p.id, "Caído", "#ef4444", "cama", None).unwrap();
        }

        assert!(criar_condicao(&vault, &p.id, "Caído", "#ef4444", "cama", None).is_err());
        assert_eq!(load(&vault).unwrap()[0].condicoes.len(), MAX_CONDICOES);
    }

    #[test]
    fn patch_com_null_tira_o_efeito_e_ausente_nao_mexe() {
        // E a razao do `Option<Option<_>>`: sem ele, "volte a ser so o selo" e
        // "troque so o nome" chegariam iguais.
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();
        let c = criar_condicao(
            &vault,
            &p.id,
            "Envenenado",
            "#22c55e",
            "frasco",
            Some("tingido".into()),
        )
        .unwrap();

        let so_nome: PatchCondicao = serde_json::from_str(r#"{"nome":"Veneno"}"#).unwrap();
        let renomeada = editar_condicao(&vault, &p.id, &c.id, so_nome).unwrap();
        assert_eq!(renomeada.nome, "Veneno");
        assert_eq!(renomeada.efeito.as_deref(), Some("tingido"));

        let sem_efeito: PatchCondicao = serde_json::from_str(r#"{"efeito":null}"#).unwrap();
        let limpa = editar_condicao(&vault, &p.id, &c.id, sem_efeito).unwrap();
        assert_eq!(limpa.efeito, None);
    }

    #[test]
    fn efeito_que_a_versao_nao_conhece_fica_gravado() {
        // O catalogo cresce: um efeito de plugin, ou de uma versao futura, e um
        // id que esta versao nao desenha -- e nao um id a apagar. Quem decide
        // que vira so o selo e a tela.
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();
        criar_condicao(&vault, &p.id, "Brilhando", "#f59e0b", "estrela", None).unwrap();

        let cru = std::fs::read_to_string(index_path(&vault)).unwrap();
        let mut json: serde_json::Value = serde_json::from_str(&cru).unwrap();
        json[0]["condicoes"][0]["efeito"] = serde_json::json!("ordem-paranormal/sangue");
        std::fs::write(index_path(&vault), json.to_string()).unwrap();

        let lido = &load(&vault).unwrap()[0];
        assert_eq!(lido.condicoes[0].efeito.as_deref(), Some("ordem-paranormal/sangue"));
    }

    #[test]
    fn efeito_torto_no_disco_cai_no_selo_e_nao_derruba_o_indice() {
        // O indice e um arquivo so: falhar aqui seria perder a mesa inteira
        // por um halo editado a mao.
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();
        criar_condicao(&vault, &p.id, "Brilhando", "#f59e0b", "estrela", None).unwrap();

        for torto in [
            serde_json::json!(7),
            serde_json::json!({ "id": "aura" }),
            serde_json::json!("Aura Forte"),
            serde_json::json!("../aura"),
            serde_json::json!("a/b/c"),
        ] {
            let cru = std::fs::read_to_string(index_path(&vault)).unwrap();
            let mut json: serde_json::Value = serde_json::from_str(&cru).unwrap();
            json[0]["condicoes"][0]["efeito"] = torto.clone();
            std::fs::write(index_path(&vault), json.to_string()).unwrap();

            let lido = &load(&vault).unwrap()[0];
            assert_eq!(lido.condicoes.len(), 1, "{torto}");
            assert_eq!(lido.condicoes[0].efeito, None, "{torto}");
        }
    }

    #[test]
    fn efeito_tem_forma_de_um_ou_dois_slugs() {
        assert!(efeito_valido("aura"));
        assert!(efeito_valido("em-chamas"));
        assert!(efeito_valido("ordem-paranormal/sangue"));
        assert!(efeito_valido("campanha/brasa-2"));

        assert!(!efeito_valido(""));
        assert!(!efeito_valido("Aura"));
        assert!(!efeito_valido("/aura"));
        assert!(!efeito_valido("plugin/"));
        assert!(!efeito_valido("a/b/c"));
    }

    #[test]
    fn patch_com_efeito_torto_vira_so_o_selo() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();
        let c = criar_condicao(&vault, &p.id, "Envenenado", "#22c55e", "frasco", None).unwrap();

        let torto: PatchCondicao = serde_json::from_str(r#"{"efeito":"  Fogo!  "}"#).unwrap();
        assert_eq!(editar_condicao(&vault, &p.id, &c.id, torto).unwrap().efeito, None);

        let certo: PatchCondicao = serde_json::from_str(r#"{"efeito":" em-chamas "}"#).unwrap();
        assert_eq!(
            editar_condicao(&vault, &p.id, &c.id, certo).unwrap().efeito.as_deref(),
            Some("em-chamas"),
        );
    }

    #[test]
    fn alternar_liga_na_horda_sem_duplicar_e_desliga_pelo_nome() {
        let (_tmp, vault) = vault();
        let a = create(&vault, "Goblin 1").unwrap();
        let b = create(&vault, "Goblin 2").unwrap();
        let fora = create(&vault, "Edgar").unwrap();

        // O segundo goblin ja estava envenenado, escrito com outra caixa.
        criar_condicao(&vault, &b.id, "envenenado", "#22c55e", "frasco", None).unwrap();

        let ids = vec![a.id.clone(), b.id.clone()];
        let ligou = alternar_condicao(&vault, &ids, &veneno(), true).unwrap();
        assert_eq!(ligou, 1);

        let todos = load(&vault).unwrap();
        let de = |id: &str| todos.iter().find(|p| p.id == id).unwrap().condicoes.clone();
        assert_eq!(de(&a.id).len(), 1);
        assert_eq!(de(&b.id).len(), 1);
        assert!(de(&fora.id).is_empty());
        // Id proprio, e nao o do modelo.
        assert_ne!(de(&a.id)[0].id, veneno().id);

        let desligou = alternar_condicao(&vault, &ids, &veneno(), false).unwrap();
        assert_eq!(desligou, 2);
        assert!(load(&vault).unwrap().iter().all(|p| p.condicoes.is_empty()));
    }

    #[test]
    fn alternar_pula_quem_esta_cheio_e_segue_a_volta() {
        let (_tmp, vault) = vault();
        let cheio = create(&vault, "Cheio").unwrap();
        let livre = create(&vault, "Livre").unwrap();

        for n in 0..MAX_CONDICOES {
            criar_condicao(&vault, &cheio.id, &format!("C{n}"), "#ef4444", "cama", None)
                .unwrap();
        }

        let ids = vec![cheio.id.clone(), livre.id.clone()];
        let ligou = alternar_condicao(&vault, &ids, &veneno(), true).unwrap();

        assert_eq!(ligou, 1);
        let todos = load(&vault).unwrap();
        assert_eq!(todos[0].condicoes.len(), MAX_CONDICOES);
        assert_eq!(todos[1].condicoes.len(), 1);
    }

    #[test]
    fn sem_ocultos_tira_a_condicao_escondida() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        let visivel = criar_condicao(&vault, &p.id, "Caído", "#ef4444", "cama", None).unwrap();
        let secreta = criar_condicao(
            &vault,
            &p.id,
            "Amaldiçoado",
            "#a855f7",
            "caveira",
            Some("aura".into()),
        )
        .unwrap();
        editar_condicao(
            &vault,
            &p.id,
            &secreta.id,
            PatchCondicao {
                escondido: Some(true),
                ..Default::default()
            },
        )
        .unwrap();

        let filtrado = sem_ocultos(&load(&vault).unwrap()[0]);
        assert_eq!(filtrado.condicoes.len(), 1);
        assert_eq!(filtrado.condicoes[0].id, visivel.id);
    }

    #[test]
    fn campanha_antiga_abre_sem_condicao_nenhuma() {
        let (_tmp, vault) = vault();
        create(&vault, "Edgar").unwrap();

        let cru = std::fs::read_to_string(index_path(&vault)).unwrap();
        assert!(!cru.contains("condicoes"));

        assert!(load(&vault).unwrap()[0].condicoes.is_empty());
    }

    #[test]
    fn campanha_antiga_abre_sem_atributo_nenhum() {
        // O indice de antes dos atributos, escrito a mao: sem o campo, ele
        // tem de ler, e o arquivo nao pode ganhar o campo so por ter sido lido.
        let (_tmp, vault) = vault();
        let antigo = r#"[{"id":"p1","nome":"Edgar","criadoEm":1}]"#;
        std::fs::write(index_path(&vault), antigo).unwrap();

        assert!(load(&vault).unwrap()[0].atributos.is_empty());

        create(&vault, "Mira").unwrap();
        let cru = std::fs::read_to_string(index_path(&vault)).unwrap();
        assert!(!cru.contains("atributos"));
    }

    #[test]
    fn atributo_ajusta_sigla_e_valor() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        let longo = criar_atributo(&vault, &p.id, "  Sanidade ", 5000).unwrap();
        assert_eq!(longo.sigla, "Sanida");
        assert_eq!(longo.valor, MAX_VALOR_ATRIBUTO);

        let vazio = criar_atributo(&vault, &p.id, "   ", -5000).unwrap();
        assert_eq!(vazio.sigla, "ATR");
        assert_eq!(vazio.valor, -MAX_VALOR_ATRIBUTO);

        let editado = editar_atributo(
            &vault,
            &p.id,
            &longo.id,
            PatchAtributo {
                valor: Some(4),
                ..Default::default()
            },
        )
        .unwrap();
        // Mexer so no valor nao toca a sigla.
        assert_eq!(editado.sigla, "Sanida");
        assert_eq!(editado.valor, 4);

        let lido = &load(&vault).unwrap()[0].atributos;
        assert_eq!(lido.len(), 2);
        assert_eq!(lido[0].valor, 4);
    }

    #[test]
    fn atributo_tem_teto_e_remove() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        let primeiro = criar_atributo(&vault, &p.id, "A0", 1).unwrap();
        for i in 1..MAX_ATRIBUTOS {
            criar_atributo(&vault, &p.id, &format!("A{i}"), 1).unwrap();
        }
        assert!(criar_atributo(&vault, &p.id, "Mais", 1).is_err());

        remover_atributo(&vault, &p.id, &primeiro.id).unwrap();
        assert_eq!(load(&vault).unwrap()[0].atributos.len(), MAX_ATRIBUTOS - 1);
        assert!(remover_atributo(&vault, &p.id, &primeiro.id).is_err());
    }

    #[test]
    fn acrescentar_atributos_pula_sigla_repetida() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();
        criar_atributo(&vault, &p.id, "FOR", 3).unwrap();

        let novo = |sigla: &str| Atributo {
            id: uuid::Uuid::new_v4().to_string(),
            sigla: sigla.to_string(),
            valor: 1,
            descricao: None,
        };

        // "for" e o FOR que ele ja tem; o segundo AGI e o mesmo do primeiro.
        let entraram =
            acrescentar_atributos(&vault, &p.id, vec![novo("for"), novo("AGI"), novo("agi")])
                .unwrap();
        assert_eq!(entraram, 1);

        let lido = &load(&vault).unwrap()[0].atributos;
        let siglas: Vec<&str> = lido.iter().map(|a| a.sigla.as_str()).collect();
        assert_eq!(siglas, ["FOR", "AGI"]);
        // O FOR que ja estava na ficha fica com o valor dele.
        assert_eq!(lido[0].valor, 3);
    }

    #[test]
    fn descricao_do_atributo_corta_e_vazia_apaga() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();
        let atributo = criar_atributo(&vault, &p.id, "VIG", 1).unwrap();
        assert!(atributo.descricao.is_none());

        let patch = |descricao: &str| PatchAtributo {
            descricao: Some(descricao.to_string()),
            ..Default::default()
        };

        let longa = "a".repeat(MAX_DESCRICAO_ATRIBUTO + 50);
        let editado = editar_atributo(&vault, &p.id, &atributo.id, patch(&longa)).unwrap();
        assert_eq!(
            editado.descricao.map(|texto| texto.chars().count()),
            Some(MAX_DESCRICAO_ATRIBUTO)
        );

        let editado = editar_atributo(&vault, &p.id, &atributo.id, patch("  Vigor  ")).unwrap();
        assert_eq!(editado.descricao.as_deref(), Some("Vigor"));

        let editado = editar_atributo(&vault, &p.id, &atributo.id, patch("   ")).unwrap();
        assert!(editado.descricao.is_none());

        // Mexer so no valor nao apaga a descricao.
        editar_atributo(&vault, &p.id, &atributo.id, patch("Vigor")).unwrap();
        let editado = editar_atributo(
            &vault,
            &p.id,
            &atributo.id,
            PatchAtributo {
                valor: Some(3),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(editado.descricao.as_deref(), Some("Vigor"));
    }
}
