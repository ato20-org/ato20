//! O bestiario de um plugin: as fichas prontas que ele traz para o Compendio.
//!
//! O manifesto DECLARA a colecao (`extensoes::ColecaoDoBestiario`), e as
//! fichas moram num arquivo a parte, ao lado dele:
//!
//! ```json
//! { "grupos": [{ "nome": "Combate" }, { "nome": "Ataques", "exibicao": "lista" }],
//!   "moldes": [{ "id": "zumbi", "nome": "Zumbi", "tags": ["Sangue"],
//!                "atributos": [{ "sigla": "AGI", "valor": 2 }],
//!                "medidores": [{ "nome": "PV", "maximo": 45 }],
//!                "detalhes": [{ "grupo": "Combate", "rotulo": "Defesa", "tipo": "numero", "valor": 19 }] }] }
//! ```
//!
//! Os grupos ficam no arquivo, e nao em cada ficha: as quinhentas ameacas de
//! um sistema usam os mesmos seis, e repeti-los em cada uma seria quinhentas
//! chances de escrever o mesmo grupo de dois jeitos.
//!
//! O arquivo e conferido na IMPORTACAO, inteiro, como as imagens declaradas:
//! e o momento em que o autor ainda esta olhando para a pasta. E de novo a cada
//! leitura, porque a pasta instalada pode ser editada por fora, e o que chega a
//! campanha tem de ser o que passou pela regra.
//!
//! Sem vinculo, como todo molde: trazer COPIA a ficha para a campanha, e o
//! plugin atualizado depois nao mexe nela. Ver `compendio::trazer_do_plugin`.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{AppError, AppResult, Texto};
use crate::extensoes::{
    self, AtributoDoSistema, ColecaoDoBestiario, GrupoDoSistema, Manifesto, TextoDePlugin,
    IMAGEM_DE_MEDIDOR_MAX, IMAGENS_DE_MEDIDOR,
};
use crate::vault::characters::{self, chave_do_nome, Estilo};
use crate::vault::{detalhes, modelos};

/// O teto do arquivo de uma colecao, em bytes.
///
/// Quinhentas fichas com descricao longa cabem em dois megas; quatro e folga.
/// O teto existe porque o arquivo e lido inteiro na memoria a cada vez que o
/// Compendio abre, e um JSON de um giga travaria a janela antes de qualquer
/// erro aparecer.
pub const ARQUIVO_MAX: u64 = 4 * 1024 * 1024;

/// Quantas fichas uma colecao traz. O mesmo folgado da biblioteca de
/// condicoes (`compendio::MAX_CONDICOES_NO_COMPENDIO`): e lista que se filtra
/// por tag e busca, e nao uma fileira que se le inteira.
pub const MAX_MOLDES: usize = 500;

/// O teto do nome de uma ficha. Cabe no rotulo de uma rolagem no fio ("Nome
/// - Luta", `fio::MAX_ROTULO`), que e onde o nome da ameaca mais aparece.
pub const MAX_NOME: usize = 60;

/// O teto da `fonte`: "Sobrevivendo ao Horror, p. 212" cabe, um paragrafo nao.
pub const MAX_FONTE: usize = 120;

/// O teto de uma URL de imagem. O mesmo de navegador, e muito mais do que um
/// endereco de imagem de verdade pede.
pub const MAX_URL: usize = 2048;

/// O arquivo de uma colecao.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bestiario {
    /// Os grupos que as fichas usam, com a exibicao de cada um. Trazer junta
    /// ao molde da campanha so os que a ficha trazida usa.
    #[serde(default)]
    pub grupos: Vec<GrupoDoSistema>,
    pub moldes: Vec<MoldeDoBestiario>,
}

/// Uma ficha pronta.
///
/// Os textos sao `String`, e nao `TextoDePlugin`, pela regra do `Sistema`: sao
/// DADO que vai para a campanha. Traduzir "Mordida" faria a mesma ameaca
/// gravar outra coisa na mesa em ingles.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoldeDoBestiario {
    pub id: String,
    pub nome: String,
    #[serde(default)]
    pub tags: Vec<String>,
    /// De onde a ficha veio: o livro, o suplemento, a colecao de quem a fez.
    /// Vai no card, e e o que deixa o mestre -- e o plugin -- dar o credito.
    #[serde(default)]
    pub fonte: Option<String>,
    /// Um arquivo da pasta do plugin, ou uma URL https. Ver `Imagem`.
    #[serde(default)]
    pub retrato: Option<String>,
    /// A peca no mapa. Mesma forma do retrato.
    #[serde(default)]
    pub miniatura: Option<String>,
    /// Uma aura do plugin, por cima da da colecao: o chefe dourado no meio
    /// dos goblins. Ver `extensoes::Aura`.
    #[serde(default)]
    pub aura: Option<String>,
    #[serde(default)]
    pub atributos: Vec<AtributoDoSistema>,
    #[serde(default)]
    pub medidores: Vec<MedidorDoMolde>,
    #[serde(default)]
    pub detalhes: Vec<DetalheDoMolde>,
}

/// Um medidor da ficha: o nome e o teto. Ele nasce cheio.
///
/// Cor e estilo sao opcionais porque quem decide como a vida se desenha e a
/// CAMPANHA: o PV da ameaca trazida veste o modelo de PV que a mesa ja tem, com
/// a cor e o pincel que o mestre escolheu. O que vem aqui so vale quando a
/// campanha nao tem modelo com esse nome.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedidorDoMolde {
    pub nome: String,
    pub maximo: i64,
    #[serde(default)]
    pub cor: Option<String>,
    #[serde(default)]
    pub estilo: Option<Estilo>,
}

/// Um detalhe da ficha, ja com o valor DESTA ameaca: a Defesa 19, a Luta
/// `2d20+10`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetalheDoMolde {
    /// O nome de um grupo declarado no arquivo.
    pub grupo: String,
    pub rotulo: String,
    #[serde(default)]
    pub tipo: detalhes::Tipo,
    #[serde(default)]
    pub valor: Option<Value>,
    #[serde(default)]
    pub opcoes: Vec<String>,
    #[serde(default)]
    pub descricao: Option<String>,
    #[serde(default)]
    pub rolagem: Option<String>,
}

/// Onde esta a imagem de uma ficha.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Imagem<'a> {
    /// Um arquivo da pasta do plugin, copiado para o acervo ao trazer.
    Arquivo(&'a str),
    /// Uma URL, baixada para o acervo ao trazer.
    ///
    /// Existe para o plugin que aponta a imagem em vez de carrega-la: o
    /// repositorio nao guarda a arte, e cada mestre a baixa para a propria
    /// mesa.
    Url(&'a str),
}

impl<'a> Imagem<'a> {
    /// Pela forma: o que tem `://` e endereco, o resto e arquivo. O `http://`
    /// cai em `Url` para ser recusado com o motivo certo, e nao como "arquivo
    /// que nao esta na pasta".
    pub fn de(valor: &'a str) -> Self {
        if valor.contains("://") {
            Self::Url(valor)
        } else {
            Self::Arquivo(valor)
        }
    }
}

impl MoldeDoBestiario {
    /// A aura desta ficha: a dela, ou a da colecao.
    pub fn aura<'a>(&'a self, colecao: &'a ColecaoDoBestiario) -> Option<&'a str> {
        self.aura.as_deref().or(colecao.aura.as_deref())
    }

    /// O retrato e a miniatura, nessa ordem, os que existem.
    pub fn imagens(&self) -> impl Iterator<Item = Imagem<'_>> {
        [&self.retrato, &self.miniatura]
            .into_iter()
            .flatten()
            .map(|valor| Imagem::de(valor))
    }
}

/// A URL serve para baixar uma imagem?
///
/// `https`, e com NOME de maquina. O endereco IP e o `localhost` ficam de fora
/// porque o download roda nesta maquina, dentro da rede de casa: um plugin que
/// apontasse para `192.168.0.1` faria o ATO20 bater no roteador de quem clicou
/// em "Trazer". Imagem de verdade mora num site, e site tem nome.
pub fn url_valida(url: &str) -> bool {
    if url.len() > MAX_URL || !url.starts_with("https://") {
        return false;
    }

    // `domain()` e `None` para endereco IP, de qualquer versao: e a pergunta
    // "tem nome?" ja respondida pelo leitor de URL.
    reqwest::Url::parse(url).ok().is_some_and(|lida| {
        lida.domain().is_some_and(|nome| {
            let nome = nome.to_ascii_lowercase();
            nome != "localhost" && !nome.ends_with(".localhost")
        })
    })
}

/// O arquivo da colecao faz sentido?
///
/// Os mesmos tetos que a campanha tem, e pela mesma razao do sistema: o que a
/// gravacao cortaria calada -- a sigla de sete letras, o oitavo medidor -- vira
/// erro aqui, onde o autor ve, e nao uma ameaca que chega torta na mesa. Os
/// repetidos tambem: trazer pula pelo NOME, e a segunda "AGI" sumiria sem
/// ninguem saber por que.
pub fn validar(bestiario: &Bestiario, colecao: &str) -> Result<(), Texto> {
    let tamanho = |texto: &str| texto.trim().chars().count();

    if bestiario.moldes.is_empty() || bestiario.moldes.len() > MAX_MOLDES {
        return Err(crate::texto!(
            "o bestiario {colecao:?} traz {} fichas; vai de 1 a {MAX_MOLDES}",
            "the bestiary {colecao:?} brings {} sheets; it goes from 1 to {MAX_MOLDES}",
            bestiario.moldes.len()
        ));
    }

    if bestiario.grupos.len() > detalhes::MAX_GRUPOS {
        return Err(crate::texto!(
            "o bestiario {colecao:?} declara {} grupos; a campanha guarda {}",
            "the bestiary {colecao:?} declares {} groups; a campaign holds {}",
            bestiario.grupos.len(),
            detalhes::MAX_GRUPOS
        ));
    }

    let mut grupos: Vec<String> = Vec::new();
    for grupo in &bestiario.grupos {
        let nome = &grupo.nome;
        if tamanho(nome) == 0 || tamanho(nome) > detalhes::MAX_NOME_DO_GRUPO {
            return Err(crate::texto!(
                "o bestiario {colecao:?} tem o grupo {nome:?}; o nome precisa ter de 1 a {} letras",
                "the bestiary {colecao:?} has the group {nome:?}; the name must have 1 to {} characters",
                detalhes::MAX_NOME_DO_GRUPO
            ));
        }
        if grupos.contains(&chave_do_nome(nome)) {
            return Err(crate::texto!(
                "o bestiario {colecao:?} declara o grupo {nome:?} duas vezes",
                "the bestiary {colecao:?} declares the group {nome:?} twice"
            ));
        }
        grupos.push(chave_do_nome(nome));
    }

    let mut ids: HashSet<&str> = HashSet::new();
    for molde in &bestiario.moldes {
        let id = &molde.id;
        if !extensoes::id_valido(id) {
            return Err(crate::texto!(
                "o bestiario {colecao:?} tem a ficha {id:?}; o id e so minusculas, digitos e hifen",
                "the bestiary {colecao:?} has the sheet {id:?}; the id is only lowercase letters, digits and hyphens"
            ));
        }
        if !ids.insert(id) {
            return Err(crate::texto!(
                "o bestiario {colecao:?} tem duas fichas com o id {id:?}",
                "the bestiary {colecao:?} has two sheets with the id {id:?}"
            ));
        }
        validar_molde(molde, &grupos).map_err(|motivo| Texto {
            pt: format!("a ficha {id:?} do bestiario {colecao:?} {}", motivo.pt),
            en: format!("the sheet {id:?} in the bestiary {colecao:?} {}", motivo.en),
        })?;
    }

    Ok(())
}

/// Uma ficha, contra os tetos da campanha. O motivo volta sem o sujeito ("tem
/// 13 atributos..."), e quem chama poe o nome da ficha na frente.
fn validar_molde(molde: &MoldeDoBestiario, grupos: &[String]) -> Result<(), Texto> {
    let tamanho = |texto: &str| texto.trim().chars().count();

    let nome = &molde.nome;
    if tamanho(nome) == 0 || tamanho(nome) > MAX_NOME {
        return Err(crate::texto!(
            "tem o nome {nome:?}; ele precisa ter de 1 a {MAX_NOME} letras",
            "has the name {nome:?}; it must have 1 to {MAX_NOME} characters"
        ));
    }

    if molde.tags.len() > crate::compendio::MAX_TAGS {
        return Err(crate::texto!(
            "tem {} tags; o teto e {}",
            "has {} tags; the limit is {}",
            molde.tags.len(),
            crate::compendio::MAX_TAGS
        ));
    }
    for tag in &molde.tags {
        if tamanho(tag) == 0 || tamanho(tag) > crate::compendio::MAX_LETRAS_DA_TAG {
            return Err(crate::texto!(
                "tem a tag {tag:?}; ela precisa ter de 1 a {} letras",
                "has the tag {tag:?}; it must have 1 to {} characters",
                crate::compendio::MAX_LETRAS_DA_TAG
            ));
        }
    }

    if let Some(aura) = &molde.aura {
        if !extensoes::id_valido(aura) {
            return Err(crate::texto!(
                "aponta a aura {aura:?}; o id e so minusculas, digitos e hifen",
                "points to the aura {aura:?}; the id is only lowercase letters, digits and hyphens"
            ));
        }
    }

    if let Some(fonte) = &molde.fonte {
        if tamanho(fonte) > MAX_FONTE {
            return Err(crate::texto!(
                "tem uma fonte de mais de {MAX_FONTE} letras",
                "has a source longer than {MAX_FONTE} characters"
            ));
        }
    }

    for imagem in molde.imagens() {
        validar_imagem(imagem)?;
    }

    if molde.atributos.len() > characters::MAX_ATRIBUTOS {
        return Err(crate::texto!(
            "tem {} atributos; o personagem guarda {}",
            "has {} attributes; a character holds {}",
            molde.atributos.len(),
            characters::MAX_ATRIBUTOS
        ));
    }
    let mut siglas: Vec<String> = Vec::new();
    for atributo in &molde.atributos {
        let sigla = &atributo.sigla;
        if tamanho(sigla) == 0 || tamanho(sigla) > characters::MAX_SIGLA {
            return Err(crate::texto!(
                "tem o atributo {sigla:?}; a sigla precisa ter de 1 a {} letras",
                "has the attribute {sigla:?}; the abbreviation must have 1 to {} characters",
                characters::MAX_SIGLA
            ));
        }
        if siglas.contains(&chave_do_nome(sigla)) {
            return Err(crate::texto!(
                "tem o atributo {sigla:?} duas vezes",
                "has the attribute {sigla:?} twice"
            ));
        }
        siglas.push(chave_do_nome(sigla));
        if atributo.valor.abs() > characters::MAX_VALOR_ATRIBUTO {
            return Err(crate::texto!(
                "tem {sigla} {}; o valor vai ate {}",
                "has {sigla} {}; the value goes up to {}",
                atributo.valor,
                characters::MAX_VALOR_ATRIBUTO
            ));
        }
        if atributo
            .descricao
            .as_deref()
            .is_some_and(|descricao| descricao.chars().count() > characters::MAX_DESCRICAO_ATRIBUTO)
        {
            return Err(crate::texto!(
                "tem a descricao de {sigla} com mais de {} letras",
                "has a description of {sigla} longer than {} characters",
                characters::MAX_DESCRICAO_ATRIBUTO
            ));
        }
    }

    if molde.medidores.len() > characters::MAX_MEDIDORES {
        return Err(crate::texto!(
            "tem {} medidores; o personagem guarda {}",
            "has {} meters; a character holds {}",
            molde.medidores.len(),
            characters::MAX_MEDIDORES
        ));
    }
    validar_medidores(&molde.medidores)?;

    if molde.detalhes.len() > detalhes::MAX_DETALHES {
        return Err(crate::texto!(
            "tem {} detalhes; o personagem guarda {}",
            "has {} details; a character holds {}",
            molde.detalhes.len(),
            detalhes::MAX_DETALHES
        ));
    }
    let mut pares: Vec<(String, String)> = Vec::new();
    for detalhe in &molde.detalhes {
        validar_detalhe(detalhe, grupos)?;

        let par = (chave_do_nome(&detalhe.grupo), chave_do_nome(&detalhe.rotulo));
        if pares.contains(&par) {
            return Err(crate::texto!(
                "tem o detalhe {:?} do grupo {:?} duas vezes",
                "has the detail {:?} of the group {:?} twice",
                detalhe.rotulo.trim(),
                detalhe.grupo.trim()
            ));
        }
        pares.push(par);
    }

    Ok(())
}

/// A imagem que a ficha -- ou o item (`itens_do_plugin`) -- aponta tem a
/// forma certa? Um arquivo de imagem dentro da pasta, ou uma URL que
/// `url_valida` aceita. Se o arquivo EXISTE e conferido na importacao, ver
/// `imagem_fora_da_pasta`. O motivo volta sem o sujeito.
pub(crate) fn validar_imagem(imagem: Imagem) -> Result<(), Texto> {
    match imagem {
        Imagem::Arquivo(rel) => {
            let extensao = rel.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase());
            let e_imagem = extensao.is_some_and(|e| IMAGENS_DE_MEDIDOR.contains(&e.as_str()));
            if !extensoes::caminho_relativo_seguro(rel) || !e_imagem {
                return Err(crate::texto!(
                    "aponta para a imagem {rel:?}; tem de ser um arquivo da pasta ({})",
                    "points to the image {rel:?}; it must be a file inside the folder ({})",
                    IMAGENS_DE_MEDIDOR.join(", ")
                ));
            }
        }
        Imagem::Url(url) => {
            if !url_valida(url) {
                return Err(crate::texto!(
                    "aponta para a imagem {url:?}; a URL tem de ser https, com o nome de um site",
                    "points to the image {url:?}; the URL must be https, with a site name"
                ));
            }
        }
    }

    Ok(())
}

/// Os medidores de uma ficha, ou de um item, contra as regras do modelo da
/// campanha: o nome que cabe e nao se repete, o maximo, a cor. Quantos cabem
/// e de quem chama -- o teto do personagem nao e o do item. O motivo volta
/// sem o sujeito.
pub(crate) fn validar_medidores(medidores: &[MedidorDoMolde]) -> Result<(), Texto> {
    let tamanho = |texto: &str| texto.trim().chars().count();

    let mut vistos: Vec<String> = Vec::new();
    for medidor in medidores {
        let nome = &medidor.nome;
        if tamanho(nome) == 0 || tamanho(nome) > characters::MAX_NOME_MEDIDOR {
            return Err(crate::texto!(
                "tem o medidor {nome:?}; o nome precisa ter de 1 a {} letras",
                "has the meter {nome:?}; the name must have 1 to {} characters",
                characters::MAX_NOME_MEDIDOR
            ));
        }
        if vistos.contains(&chave_do_nome(nome)) {
            return Err(crate::texto!(
                "tem o medidor {nome:?} duas vezes",
                "has the meter {nome:?} twice"
            ));
        }
        vistos.push(chave_do_nome(nome));
        if !(1..=modelos::MAX_VALOR).contains(&medidor.maximo) {
            return Err(crate::texto!(
                "tem o medidor {nome:?} com maximo {}; vai de 1 a {}",
                "has the meter {nome:?} with a maximum of {}; it goes from 1 to {}",
                medidor.maximo,
                modelos::MAX_VALOR
            ));
        }
        if let Some(cor) = &medidor.cor {
            if !extensoes::cor_hex_valida(cor) {
                return Err(crate::texto!(
                    "tem o medidor {nome:?} com a cor {cor:?}, que nao e hex, como \"#ef4444\"",
                    "has the meter {nome:?} with the color {cor:?}, which is not hex, like \"#ef4444\""
                ));
            }
        }
    }

    Ok(())
}

fn validar_detalhe(detalhe: &DetalheDoMolde, grupos: &[String]) -> Result<(), Texto> {
    use detalhes::Tipo;

    let tamanho = |texto: &str| texto.trim().chars().count();
    let rotulo = detalhe.rotulo.trim();
    let grupo = detalhe.grupo.trim();

    if !grupos.contains(&chave_do_nome(grupo)) {
        return Err(crate::texto!(
            "poe o detalhe {rotulo:?} no grupo {grupo:?}, que o arquivo nao declara em `grupos`",
            "puts the detail {rotulo:?} in the group {grupo:?}, which the file does not declare in `grupos`"
        ));
    }
    if rotulo.is_empty() || tamanho(rotulo) > detalhes::MAX_ROTULO {
        return Err(crate::texto!(
            "tem o detalhe {rotulo:?}; o rotulo precisa ter de 1 a {} letras",
            "has the detail {rotulo:?}; the label must have 1 to {} characters",
            detalhes::MAX_ROTULO
        ));
    }

    let escolha = detalhe.tipo == Tipo::Escolha;
    if escolha && (detalhe.opcoes.is_empty() || detalhe.opcoes.len() > detalhes::MAX_OPCOES) {
        return Err(crate::texto!(
            "tem o detalhe {rotulo:?}, que e escolha e precisa de 1 a {} opcoes",
            "has the detail {rotulo:?}, which is a choice and needs 1 to {} options",
            detalhes::MAX_OPCOES
        ));
    }
    if !escolha && !detalhe.opcoes.is_empty() {
        return Err(crate::texto!(
            "tem opcoes no detalhe {rotulo:?}, que nao e escolha",
            "has options in the detail {rotulo:?}, which is not a choice"
        ));
    }

    // O valor que o tipo guarda. A gravacao cortaria o texto longo e prenderia
    // o numero grande calada; aqui o autor ve. Texto que nao cabe numa linha
    // e descricao, e e para la que a mensagem aponta.
    if let Some(valor) = &detalhe.valor {
        let serve = match (detalhe.tipo, valor) {
            (Tipo::Numero, Value::Number(numero)) => numero
                .as_i64()
                .or_else(|| numero.as_f64().map(|f| f.round() as i64))
                .is_some_and(|inteiro| inteiro.abs() <= detalhes::MAX_NUMERO),
            (Tipo::Texto, Value::String(texto)) => tamanho(texto) <= detalhes::MAX_TEXTO,
            (Tipo::Texto, Value::Number(_)) => true,
            (Tipo::Escolha, Value::String(texto)) => {
                detalhe.opcoes.iter().any(|opcao| opcao.trim() == texto.trim())
            }
            _ => false,
        };
        if !serve {
            return Err(crate::texto!(
                "tem no detalhe {rotulo:?} um valor que o tipo nao guarda: numero ate {}, texto ate {} letras (o resto vai na descricao), escolha entre as opcoes",
                "has a value in the detail {rotulo:?} that its type does not hold: a number up to {}, text up to {} characters (the rest goes in the description), a choice among the options",
                detalhes::MAX_NUMERO,
                detalhes::MAX_TEXTO
            ));
        }
    }

    if detalhe
        .descricao
        .as_deref()
        .is_some_and(|descricao| descricao.chars().count() > detalhes::MAX_DESCRICAO)
    {
        return Err(crate::texto!(
            "tem a descricao do detalhe {rotulo:?} com mais de {} letras",
            "has a description of the detail {rotulo:?} longer than {} characters",
            detalhes::MAX_DESCRICAO
        ));
    }

    // Lida pelo mesmo leitor que rola a expressao do celular: o que passa aqui
    // e o que rola na mesa.
    if let Some(rolagem) = &detalhe.rolagem {
        if tamanho(rolagem) > detalhes::MAX_ROLAGEM || crate::serve::expressao::ler(rolagem).is_err()
        {
            return Err(crate::texto!(
                "tem no detalhe {rotulo:?} a rolagem {rolagem:?}, que nao e uma expressao como `2d20+10`",
                "has in the detail {rotulo:?} the roll {rolagem:?}, which is not an expression like `2d20+10`"
            ));
        }
    }

    Ok(())
}

/// Le o arquivo de uma colecao de plugin -- o bestiario, os itens --, sem
/// conferir o que ele traz: isso e de quem chama.
///
/// `grupo` e a chave do manifesto que declara a colecao, para o erro dizer
/// onde procurar. `symlink_metadata`, como nas imagens declaradas: a copia da
/// importacao pula link simbolico, e um arquivo que fosse link passaria aqui e
/// faltaria na pasta instalada.
pub(crate) fn ler_colecao<T: serde::de::DeserializeOwned>(
    caminho: &Path,
    grupo: &str,
    id: &str,
    arquivo: &str,
) -> AppResult<T> {
    let tamanho = std::fs::symlink_metadata(caminho)
        .ok()
        .filter(|meta| meta.is_file())
        .map(|meta| meta.len());

    match tamanho {
        None => {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "a colecao {id:?} de `{grupo}` aponta para {arquivo:?}, que nao esta na pasta",
                "the collection {id:?} in `{grupo}` points to {arquivo:?}, which is not in the folder"
            )));
        }
        Some(bytes) if bytes > ARQUIVO_MAX => {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "o arquivo {arquivo:?} da colecao {id:?} de `{grupo}` tem {} KB; o teto e {} KB",
                "the file {arquivo:?} of the collection {id:?} in `{grupo}` is {} KB; the limit is {} KB",
                bytes / 1024,
                ARQUIVO_MAX / 1024
            )));
        }
        Some(_) => {}
    }

    let cru = std::fs::read_to_string(caminho)?;
    serde_json::from_str(&cru).map_err(|cause| AppError::Malformed {
        file: arquivo.to_string(),
        cause: cause.to_string(),
    })
}

/// Le e confere o arquivo de uma colecao do bestiario.
fn ler_arquivo(caminho: &Path, colecao: &ColecaoDoBestiario) -> AppResult<Bestiario> {
    let bestiario: Bestiario = ler_colecao(caminho, "bestiario", &colecao.id, &colecao.arquivo)?;
    validar(&bestiario, &colecao.id).map_err(AppError::ExtensaoInvalida)?;

    Ok(bestiario)
}

/// A imagem que a ficha, ou o item, aponta na pasta falta ou passa do teto? O
/// motivo volta sem o sujeito, como em `validar_imagem`.
pub(crate) fn imagem_fora_da_pasta(pasta: &Path, rel: &str) -> Option<Texto> {
    let tamanho = std::fs::symlink_metadata(pasta.join(rel))
        .ok()
        .filter(|meta| meta.is_file())
        .map(|meta| meta.len());

    match tamanho {
        None => Some(crate::texto!(
            "aponta para {rel:?}, que nao esta na pasta",
            "points to {rel:?}, which is not in the folder"
        )),
        Some(bytes) if bytes > IMAGEM_DE_MEDIDOR_MAX => Some(crate::texto!(
            "tem a imagem {rel:?} com {} KB; o teto e {} KB",
            "has the image {rel:?} at {} KB; the limit is {} KB",
            bytes / 1024,
            IMAGEM_DE_MEDIDOR_MAX / 1024
        )),
        Some(_) => None,
    }
}

/// Os arquivos das colecoes de uma pasta de plugin, e as imagens que eles
/// citam, existem e servem? Chamada na importacao, ao lado de
/// `validar_imagens_declaradas`.
pub fn validar_pasta(pasta: &Path, manifesto: &Manifesto) -> AppResult<()> {
    for colecao in &manifesto.contribui.bestiario {
        let bestiario = ler_arquivo(&pasta.join(&colecao.arquivo), colecao)?;

        for molde in &bestiario.moldes {
            if let Some(aura) = &molde.aura {
                if !manifesto.contribui.auras.iter().any(|a| &a.id == aura) {
                    return Err(AppError::ExtensaoInvalida(crate::texto!(
                        "a ficha {:?} do bestiario {:?} aponta a aura {aura:?}, que o plugin nao declara em `auras`",
                        "the sheet {:?} in the bestiary {:?} points to the aura {aura:?}, which the plugin does not declare in `auras`",
                        molde.id,
                        colecao.id
                    )));
                }
            }

            for imagem in molde.imagens() {
                let Imagem::Arquivo(rel) = imagem else {
                    continue;
                };

                if let Some(motivo) = imagem_fora_da_pasta(pasta, rel) {
                    return Err(AppError::ExtensaoInvalida(Texto {
                        pt: format!("a ficha {:?} do bestiario {:?} {}", molde.id, colecao.id, motivo.pt),
                        en: format!("the sheet {:?} in the bestiary {:?} {}", molde.id, colecao.id, motivo.en),
                    }));
                }
            }
        }
    }

    Ok(())
}

fn sem_colecao(extensao: &str, colecao: &str) -> AppError {
    AppError::ExtensaoInvalida(crate::texto!(
        "o plugin {extensao:?} nao tem o bestiario {colecao:?} -- foi desinstalado?",
        "the plugin {extensao:?} has no bestiary {colecao:?}: was it uninstalled?"
    ))
}

/// A colecao instalada, lida do DISCO e conferida de novo.
///
/// Do disco, e nao da tela, como o sistema em `sistema_aplicar`: o que entra
/// na campanha e o que passou pela regra, e nao o que a webview diz que o
/// plugin traz.
pub fn ler(dir: &Path, extensao: &str, colecao: &str) -> AppResult<(ColecaoDoBestiario, Bestiario)> {
    if !extensoes::id_valido(extensao) {
        return Err(sem_colecao(extensao, colecao));
    }

    let declarada = extensoes::ler_manifesto(&dir.join(extensao))?
        .contribui
        .bestiario
        .into_iter()
        .find(|c| c.id == colecao)
        .ok_or_else(|| sem_colecao(extensao, colecao))?;

    let caminho = extensoes::caminho_do_arquivo(dir, extensao, &declarada.arquivo)
        .ok_or_else(|| sem_colecao(extensao, colecao))?;
    let bestiario = ler_arquivo(&caminho, &declarada)?;

    Ok((declarada, bestiario))
}

/// A ficha inteira de um plugin, para LER sem trazer: a previa que o card do
/// Compendio abre. Os grupos vao junto, porque e por eles que a ficha se divide
/// e se desenha -- a lista de Acoes, as linhas de Combate.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FichaCompleta {
    pub grupos: Vec<GrupoDoSistema>,
    pub molde: MoldeDoBestiario,
    /// A aura da ficha: a dela, ou a da colecao. So o id, como no `Resumo`.
    pub aura: Option<String>,
}

/// Le uma ficha da colecao instalada, sem gravar nada: ver a ameaca nao a poe
/// na campanha. Trazer e outro gesto (`compendio::trazer_do_plugin`).
pub fn ficha(dir: &Path, extensao: &str, colecao: &str, molde: &str) -> AppResult<FichaCompleta> {
    let (declarada, bestiario) = ler(dir, extensao, colecao)?;
    let achado = bestiario.moldes.into_iter().find(|m| m.id == molde).ok_or_else(|| {
        AppError::Recusado(crate::texto!(
            "o bestiario {colecao:?} nao tem mais a ficha {molde:?}",
            "the bestiary {colecao:?} no longer has the sheet {molde:?}"
        ))
    })?;
    let aura = achado.aura(&declarada).map(str::to_string);

    Ok(FichaCompleta {
        grupos: bestiario.grupos,
        molde: achado,
        aura,
    })
}

/// O arquivo de imagem de um plugin, se ele for uma imagem que cabe.
///
/// Qualquer imagem da pasta, e nao so as que uma ficha cita: conferir contra
/// as fichas pediria reler o arquivo da colecao a cada card. A pasta do plugin
/// nao guarda segredo -- o protocolo `ato20-ext://` ja serve os arquivos
/// dela --, e a guarda que importa e a de `caminho_do_arquivo`: nada sai da
/// pasta.
pub fn caminho_da_imagem(dir: &Path, extensao: &str, rel: &str) -> Option<PathBuf> {
    let extensao_do_arquivo = rel.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase())?;
    if !IMAGENS_DE_MEDIDOR.contains(&extensao_do_arquivo.as_str()) {
        return None;
    }

    let caminho = extensoes::caminho_do_arquivo(dir, extensao, rel)?;
    let tamanho = std::fs::metadata(&caminho).ok()?.len();

    (tamanho <= IMAGEM_DE_MEDIDOR_MAX).then_some(caminho)
}

/// O prazo de uma imagem. Curto: e um arquivo de alguns KB, e quem espera e o
/// mestre que arrastou a ameaca para o mapa no meio da sessao.
const PRAZO_DA_IMAGEM: std::time::Duration = std::time::Duration::from_secs(20);

/// Quantos redirecionamentos a imagem segue. CDN de imagem redireciona uma ou
/// duas vezes; mais que isso e laco.
const REDIRECIONAMENTOS: usize = 3;

/// O maior lado que uma imagem baixada pode declarar no cabecalho. O mesmo
/// teto do canvas das fontes de retrato: um PNG de dois megas que diz ter
/// cem mil pixels de lado viraria gigas na hora de gerar a miniatura.
const LADO_MAX: usize = 8192;

/// Um cliente so para a vida do aplicativo, criado no primeiro download. O
/// mesmo arranjo do catalogo (`catalogo::cliente`), com uma regra a mais: o
/// redirecionamento tambem tem de levar a uma URL que `url_valida` aceita --
/// senao o site de fora redirecionaria o ATO20 para o roteador de casa.
fn cliente() -> Result<&'static reqwest::Client, Texto> {
    static CLIENTE: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();

    if let Some(cliente) = CLIENTE.get() {
        return Ok(cliente);
    }

    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }

    let redirecionar = reqwest::redirect::Policy::custom(|tentativa| {
        if tentativa.previous().len() >= REDIRECIONAMENTOS || !url_valida(tentativa.url().as_str()) {
            tentativa.stop()
        } else {
            tentativa.follow()
        }
    });

    let cliente = reqwest::Client::builder()
        .timeout(PRAZO_DA_IMAGEM)
        .redirect(redirecionar)
        .user_agent(concat!("ATO20/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|causa| falha_de_rede(&causa))?;

    Ok(CLIENTE.get_or_init(|| cliente))
}

fn falha_de_rede(causa: &reqwest::Error) -> Texto {
    if causa.is_timeout() {
        return crate::texto!(
            "a imagem demorou demais para chegar",
            "the image took too long to arrive"
        );
    }
    crate::texto!(
        "a imagem nao chegou: {causa}",
        "the image did not arrive: {causa}"
    )
}

/// Baixa a imagem de uma ficha para ela entrar no acervo da campanha.
///
/// Devolve o nome do arquivo -- o da ficha, com a extensao que os BYTES dizem
/// -- e os bytes, ou o motivo de nao ter vindo. Motivo, e nao erro: a ficha
/// entra sem a imagem, e o mestre fica sabendo por que.
///
/// O tipo sai dos bytes, e nao do `Content-Type` nem da URL: o servidor que
/// diz `image/png` para uma pagina de erro em HTML existe, e a URL de CDN
/// muitas vezes nem tem extensao. As medidas saem do cabecalho e param em
/// `LADO_MAX` antes de qualquer decodificacao.
pub async fn baixar_imagem(url: &str, nome: &str) -> Result<(String, Vec<u8>), Texto> {
    if !url_valida(url) {
        return Err(crate::texto!(
            "{url:?} nao e uma URL https com o nome de um site",
            "{url:?} is not an https URL with a site name"
        ));
    }

    let mut resposta = cliente()?
        .get(url)
        .send()
        .await
        .map_err(|causa| falha_de_rede(&causa))?;

    let status = resposta.status();
    if !status.is_success() {
        let codigo = status.as_u16();
        return Err(crate::texto!(
            "o site da imagem respondeu {codigo}",
            "the image site answered {codigo}"
        ));
    }

    let grande_demais = || {
        crate::texto!(
            "a imagem passa de {} KB",
            "the image is larger than {} KB",
            IMAGEM_DE_MEDIDOR_MAX / 1024
        )
    };
    if resposta
        .content_length()
        .is_some_and(|tamanho| tamanho > IMAGEM_DE_MEDIDOR_MAX)
    {
        return Err(grande_demais());
    }

    // De novo no fluxo: o `Content-Length` e o que o servidor DIZ, e o que
    // chega pode ser maior.
    let mut bytes = Vec::new();
    while let Some(pedaco) = resposta.chunk().await.map_err(|causa| falha_de_rede(&causa))? {
        if (bytes.len() + pedaco.len()) as u64 > IMAGEM_DE_MEDIDOR_MAX {
            return Err(grande_demais());
        }
        bytes.extend_from_slice(&pedaco);
    }

    let extensao = extensao_da_imagem(&bytes).ok_or_else(|| {
        crate::texto!(
            "o que veio de {url:?} nao e uma imagem ({})",
            "what came from {url:?} is not an image ({})",
            IMAGENS_DE_MEDIDOR.join(", ")
        )
    })?;

    Ok((format!("{}.{extensao}", nome.trim()), bytes))
}

/// A extensao que os bytes dizem ter, entre as que a mesa aceita, e so se as
/// medidas do cabecalho couberem em `LADO_MAX`.
fn extensao_da_imagem(bytes: &[u8]) -> Option<&'static str> {
    use imagesize::{Compression, ImageType};

    let extensao = match imagesize::image_type(bytes).ok()? {
        ImageType::Png => "png",
        ImageType::Jpeg => "jpg",
        ImageType::Gif => "gif",
        ImageType::Webp => "webp",
        ImageType::Heif(Compression::Av1) => "avif",
        _ => return None,
    };

    let medidas = imagesize::blob_size(bytes).ok()?;
    let cabe = (1..=LADO_MAX).contains(&medidas.width) && (1..=LADO_MAX).contains(&medidas.height);

    cabe.then_some(extensao)
}

/// Uma ficha, como o card do Compendio a mostra: sem os detalhes, que so a
/// campanha le depois de trazer.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resumo {
    pub id: String,
    pub nome: String,
    pub tags: Vec<String>,
    pub fonte: Option<String>,
    /// O arquivo da pasta que o card desenha: a miniatura, ou o retrato. A
    /// imagem por URL fica de fora: o card nao vai a rede antes de alguem
    /// pedir para trazer.
    pub imagem: Option<String>,
    /// A aura do card: a da ficha, ou a da colecao. So o id: a definicao vem
    /// do manifesto, que a tela ja tem.
    pub aura: Option<String>,
}

/// Uma colecao de um plugin ligado, pronta para o Compendio.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listada {
    pub extensao: String,
    pub id: String,
    pub titulo: TextoDePlugin,
    pub sistema: Option<String>,
    /// A aura da pasta da colecao. Ver `extensoes::Aura`.
    pub aura: Option<String>,
    pub moldes: Vec<Resumo>,
    /// O arquivo que quebrou depois de instalado. A colecao aparece com o
    /// motivo, e as outras nao somem por causa dela -- como `extensoes::listar`.
    pub erro: Option<Texto>,
}

/// As colecoes dos plugins ligados.
pub fn listar(dir: &Path, ligada: impl Fn(&str) -> bool) -> AppResult<Vec<Listada>> {
    let mut listadas = Vec::new();

    for manifesto in extensoes::listar(dir)? {
        if !ligada(&manifesto.id) {
            continue;
        }

        for colecao in &manifesto.contribui.bestiario {
            let lida = extensoes::caminho_do_arquivo(dir, &manifesto.id, &colecao.arquivo)
                .ok_or_else(|| sem_colecao(&manifesto.id, &colecao.id))
                .and_then(|caminho| ler_arquivo(&caminho, colecao));

            let (moldes, erro) = match lida {
                Ok(bestiario) => (
                    bestiario.moldes.iter().map(|molde| resumo(molde, colecao)).collect(),
                    None,
                ),
                Err(AppError::ExtensaoInvalida(motivo)) => (Vec::new(), Some(motivo)),
                Err(cause) => (
                    Vec::new(),
                    Some(Texto {
                        pt: cause.to_string(),
                        en: cause.to_string(),
                    }),
                ),
            };

            listadas.push(Listada {
                extensao: manifesto.id.clone(),
                id: colecao.id.clone(),
                titulo: colecao.titulo.clone(),
                sistema: colecao.sistema.clone(),
                aura: colecao.aura.clone(),
                moldes,
                erro,
            });
        }
    }

    Ok(listadas)
}

fn resumo(molde: &MoldeDoBestiario, colecao: &ColecaoDoBestiario) -> Resumo {
    let arquivo = |valor: &Option<String>| match valor.as_deref().map(Imagem::de) {
        Some(Imagem::Arquivo(rel)) => Some(rel.to_string()),
        _ => None,
    };

    Resumo {
        id: molde.id.clone(),
        nome: molde.nome.trim().to_string(),
        tags: crate::compendio::normalizar_tags(molde.tags.clone()),
        fonte: molde.fonte.as_deref().map(str::trim).map(str::to_string),
        imagem: arquivo(&molde.miniatura).or_else(|| arquivo(&molde.retrato)),
        aura: molde.aura(colecao).map(str::to_string),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn escrever(pasta: &Path, nome: &str, conteudo: &str) {
        let caminho = pasta.join(nome);
        std::fs::create_dir_all(caminho.parent().unwrap()).unwrap();
        std::fs::write(caminho, conteudo).unwrap();
    }

    /// Uma ficha que passa, com um campo trocado por quem quer quebrar.
    fn com_molde(troca: &str) -> String {
        let base = r##"{"id":"zumbi","nome":"Zumbi de Sangue","tags":["Sangue","VD 40"],
            "fonte":"Livro de Regras","miniatura":"bestiario/zumbi.webp",
            "atributos":[{"sigla":"AGI","valor":2},{"sigla":"FOR","valor":3}],
            "medidores":[{"nome":"PV","maximo":45}],
            "detalhes":[{"grupo":"Combate","rotulo":"Defesa","tipo":"numero","valor":19},
                        {"grupo":"Ataques","rotulo":"Mordida","valor":"2d6+5 corte","rolagem":"2d20+10",
                         "descricao":"Padrao. Agredir."}]}"##;
        let mut json: Value = serde_json::from_str(base).unwrap();
        if let Some((chave, valor)) = troca.split_once('=') {
            json[chave] = serde_json::from_str(valor).unwrap();
        }
        format!(
            r#"{{"grupos":[{{"nome":"Combate"}},{{"nome":"Ataques","exibicao":"lista"}}],"moldes":[{json}]}}"#
        )
    }

    fn validado(json: &str) -> Result<(), Texto> {
        let bestiario: Bestiario = serde_json::from_str(json).map_err(|cause| Texto {
            pt: cause.to_string(),
            en: cause.to_string(),
        })?;
        validar(&bestiario, "ameacas")
    }

    #[test]
    fn a_ficha_completa_passa() {
        validado(&com_molde("")).unwrap();

        let bestiario: Bestiario = serde_json::from_str(&com_molde("")).unwrap();
        let molde = &bestiario.moldes[0];
        assert_eq!(molde.detalhes[1].rolagem.as_deref(), Some("2d20+10"));
        assert_eq!(bestiario.grupos[1].exibicao, detalhes::Exibicao::Lista);
        assert_eq!(
            molde.imagens().collect::<Vec<_>>(),
            [Imagem::Arquivo("bestiario/zumbi.webp")]
        );
    }

    #[test]
    fn ficha_torta_e_recusada() {
        for troca in [
            r##"id="Zumbi""##,
            r##"nome="""##,
            r##"tags=["uma tag que passa com folga do teto de trinta e duas"]"##,
            r##"miniatura="../fora.webp""##,
            r##"miniatura="bestiario/zumbi.svg""##,
            r##"miniatura="http://exemplo.com/zumbi.webp""##,
            r##"miniatura="https://192.168.0.1/zumbi.webp""##,
            r##"miniatura="https://localhost/zumbi.webp""##,
            r##"atributos=[{"sigla":"AGILIDADE","valor":2}]"##,
            r##"atributos=[{"sigla":"AGI","valor":2},{"sigla":"agi","valor":3}]"##,
            r##"atributos=[{"sigla":"AGI","valor":5000}]"##,
            r##"medidores=[{"nome":"PV","maximo":0}]"##,
            r##"medidores=[{"nome":"PV","maximo":5,"cor":"vermelho"}]"##,
            r##"medidores=[{"nome":"PV","maximo":5},{"nome":"pv","maximo":6}]"##,
            r##"detalhes=[{"grupo":"Pericias","rotulo":"Luta"}]"##,
            r##"detalhes=[{"grupo":"Combate","rotulo":"Defesa","tipo":"numero","valor":"dezenove"}]"##,
            r##"detalhes=[{"grupo":"Combate","rotulo":"Defesa","tipo":"numero","valor":1000000}]"##,
            r##"detalhes=[{"grupo":"Combate","rotulo":"X","tipo":"escolha"}]"##,
            r##"detalhes=[{"grupo":"Combate","rotulo":"X","opcoes":["a"]}]"##,
            r##"detalhes=[{"grupo":"Combate","rotulo":"X","tipo":"escolha","opcoes":["a"],"valor":"b"}]"##,
            r##"detalhes=[{"grupo":"Combate","rotulo":"Luta","rolagem":"dois d20"}]"##,
            r##"detalhes=[{"grupo":"Combate","rotulo":"X"},{"grupo":"combate","rotulo":"x"}]"##,
        ] {
            assert!(validado(&com_molde(troca)).is_err(), "{troca} devia ser recusado");
        }

        // O texto que nao cabe numa linha e recusado com o caminho de saida:
        // a descricao.
        let longo = format!(
            r#"detalhes=[{{"grupo":"Combate","rotulo":"Resistencias","valor":"{}"}}]"#,
            "x".repeat(detalhes::MAX_TEXTO + 1)
        );
        let erro = validado(&com_molde(&longo)).unwrap_err();
        assert!(erro.pt.contains("descricao"), "{}", erro.pt);
    }

    #[test]
    fn a_imagem_por_url_https_com_nome_passa() {
        validado(&com_molde(
            r##"retrato="https://static.wikia.nocookie.net/ordem/images/zumbi.png?cb=1""##,
        ))
        .unwrap();
    }

    #[test]
    fn colecao_vazia_e_ids_repetidos_sao_recusados() {
        assert!(validado(r#"{"moldes":[]}"#).is_err());

        let molde = r#"{"id":"zumbi","nome":"Zumbi"}"#;
        assert!(validado(&format!(r#"{{"moldes":[{molde},{molde}]}}"#)).is_err());

        let grupos = r#"{"grupos":[{"nome":"Combate"},{"nome":"combate"}],"moldes":[{"id":"a","nome":"A"}]}"#;
        assert!(validado(grupos).is_err());
    }

    fn manifesto_com_bestiario() -> String {
        r#"{"id":"ordem","nome":"Ordem","versao":"1.0.0","apiVersao":12,
            "contribui":{"bestiario":[{"id":"ameacas","titulo":"Ameaças","arquivo":"bestiario/ameacas.json"}]}}"#
            .to_string()
    }

    #[test]
    fn a_importacao_cobra_o_arquivo_e_as_imagens() {
        let base = tempfile::tempdir().unwrap();
        let dir = base.path().join("extensoes");
        let pasta = base.path().join("origem-ordem");
        escrever(&pasta, "manifest.json", &manifesto_com_bestiario());

        let erro = extensoes::importar(&dir, &pasta).unwrap_err();
        assert!(erro.to_string().contains("bestiario/ameacas.json"), "{erro}");

        escrever(&pasta, "bestiario/ameacas.json", &com_molde(""));
        let erro = extensoes::importar(&dir, &pasta).unwrap_err();
        assert!(erro.to_string().contains("bestiario/zumbi.webp"), "{erro}");

        escrever(&pasta, "bestiario/zumbi.webp", "webp");
        extensoes::importar(&dir, &pasta).unwrap();

        let (colecao, bestiario) = ler(&dir, "ordem", "ameacas").unwrap();
        assert_eq!(colecao.titulo, "Ameaças");
        assert_eq!(bestiario.moldes[0].nome, "Zumbi de Sangue");

        assert!(caminho_da_imagem(&dir, "ordem", "bestiario/zumbi.webp").is_some());
        assert!(caminho_da_imagem(&dir, "ordem", "bestiario/ameacas.json").is_none());
        assert!(caminho_da_imagem(&dir, "ordem", "../ordem/bestiario/zumbi.webp").is_none());
    }

    #[test]
    fn a_imagem_baixada_e_conferida_pelos_bytes() {
        let mut png = Vec::new();
        image::RgbaImage::new(2, 3)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        assert_eq!(extensao_da_imagem(&png), Some("png"));

        // A pagina de erro que o servidor chama de imagem.
        assert_eq!(extensao_da_imagem(b"<html>404</html>"), None);

        // O cabecalho que promete um lado maior que o teto.
        let mut gigante = Vec::new();
        image::RgbaImage::new(LADO_MAX as u32 + 1, 1)
            .write_to(&mut std::io::Cursor::new(&mut gigante), image::ImageFormat::Png)
            .unwrap();
        assert_eq!(extensao_da_imagem(&gigante), None);
    }

    #[test]
    fn o_arquivo_que_quebra_depois_de_instalado_aparece_com_o_motivo() {
        let base = tempfile::tempdir().unwrap();
        let dir = base.path().join("extensoes");
        let pasta = dir.join("ordem");
        escrever(&pasta, "manifest.json", &manifesto_com_bestiario());
        escrever(&pasta, "bestiario/ameacas.json", r#"{"moldes":[]}"#);

        let listadas = listar(&dir, |_| true).unwrap();
        assert_eq!(listadas.len(), 1);
        assert!(listadas[0].moldes.is_empty());
        assert!(listadas[0].erro.is_some());

        // Desligado, o plugin nao aparece -- nem com o erro.
        assert!(listar(&dir, |_| false).unwrap().is_empty());

        escrever(&pasta, "bestiario/ameacas.json", &com_molde(""));
        let listadas = listar(&dir, |_| true).unwrap();
        let resumo = &listadas[0].moldes[0];
        assert_eq!(resumo.imagem.as_deref(), Some("bestiario/zumbi.webp"));
        assert_eq!(resumo.tags, ["Sangue", "VD 40"]);
        assert!(listadas[0].erro.is_none());
    }

    #[test]
    fn a_aura_da_colecao_vale_para_a_ficha_e_a_dela_vence() {
        let base = tempfile::tempdir().unwrap();
        let dir = base.path().join("extensoes");
        let pasta = base.path().join("origem-ordem");
        escrever(
            &pasta,
            "manifest.json",
            r##"{"id":"ordem","nome":"Ordem","versao":"1.0.0","apiVersao":12,
                "contribui":{"auras":[{"id":"sangue","titulo":"Sangue","cor":"#b3121f","emblema":"bestiario/sangue.webp"},
                                      {"id":"lendario","titulo":"Lendário","cor":"#d4a72c"}],
                             "bestiario":[{"id":"ameacas","titulo":"Ameaças","arquivo":"bestiario/ameacas.json","aura":"sangue"}]}}"##,
        );
        escrever(&pasta, "bestiario/zumbi.webp", "webp");
        escrever(
            &pasta,
            "bestiario/ameacas.json",
            r#"{"moldes":[{"id":"zumbi","nome":"Zumbi","miniatura":"bestiario/zumbi.webp"},
                          {"id":"diabo","nome":"O Diabo","aura":"lendario"}]}"#,
        );

        // O emblema e conferido na importacao, como as imagens das fichas.
        let erro = extensoes::importar(&dir, &pasta).unwrap_err();
        assert!(erro.to_string().contains("bestiario/sangue.webp"), "{erro}");
        escrever(&pasta, "bestiario/sangue.webp", "webp");
        extensoes::importar(&dir, &pasta).unwrap();

        let listadas = listar(&dir, |_| true).unwrap();
        assert_eq!(listadas[0].aura.as_deref(), Some("sangue"));
        let auras: Vec<_> = listadas[0].moldes.iter().map(|m| m.aura.as_deref()).collect();
        assert_eq!(auras, [Some("sangue"), Some("lendario")]);

        // A previa le a ficha inteira, com a aura dela, sem trazer nada.
        let diabo = ficha(&dir, "ordem", "ameacas", "diabo").unwrap();
        assert_eq!(diabo.molde.nome, "O Diabo");
        assert_eq!(diabo.aura.as_deref(), Some("lendario"));
        assert_eq!(ficha(&dir, "ordem", "ameacas", "zumbi").unwrap().aura.as_deref(), Some("sangue"));
        assert!(ficha(&dir, "ordem", "ameacas", "nenhuma").is_err());

        // A ficha que aponta uma aura que o plugin nao declara nao instala.
        escrever(
            &pasta,
            "bestiario/ameacas.json",
            r#"{"moldes":[{"id":"zumbi","nome":"Zumbi","aura":"morte"}]}"#,
        );
        let erro = extensoes::importar(&dir, &pasta).unwrap_err();
        assert!(erro.to_string().contains("morte"), "{erro}");
    }
}
