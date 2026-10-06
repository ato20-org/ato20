//! As extensoes: o que a MAQUINA carrega alem do que veio no aplicativo.
//!
//! Mesmo lugar e mesma logica da estante -- `app_data_dir`, e nao o diretorio
//! de configuracao onde mora o `ato20.db`: uma extensao e DADO, e pode trazer
//! imagem e fonte junto. E como a estante, ela nao pertence a campanha nenhuma:
//! um tema serve todas as mesas, e exportar uma campanha nao leva o tema de
//! quem a montou.
//!
//! O que a extensao E fica no `manifest.json` dentro da pasta dela, e nao no
//! banco. O banco guarda uma coisa so -- se esta habilitada --, porque essa e a
//! unica que o usuario decide e que nao viaja junto com a pasta. Copiar a pasta
//! para outra maquina tem de bastar para instalar.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

/// A versao da API que este aplicativo fala.
///
/// O manifesto declara a dele, e uma extensao que pede versao MAIOR e recusada
/// na entrada, com o numero na mensagem. E o unico jeito de "atualize o ATO20"
/// aparecer como resposta em vez de um painel que nao desenha -- a alternativa
/// e carregar e quebrar em runtime, longe do gesto que causou.
///
/// Versao MENOR continua valendo: o compromisso e nao tirar nada da API 1
/// enquanto houver extensao pedindo 1.
///
/// A 2 abriu a API para o resto do aplicativo -- janelas, componentes,
/// personagem, medidor, dado -- sem tirar nada da 1: um plugin que pede 1
/// recebe o mesmo objeto de antes, com o que a 2 acrescentou ao lado.
///
/// A 3 acrescentou as `paginas` (o plugin servido na rede, para o OBS e o
/// que mais abrir um navegador), a `ativacao` na abertura e o tipo `lista` de
/// configuracao, e e por eles que o numero subiu: um ATO20 anterior leria o
/// manifesto, ignoraria o campo que nao conhece e aceitaria o plugin -- e a
/// pagina dele responderia 404 sem aviso nenhum. Pedindo 3, o plugin e
/// recusado na entrada com "atualize o ATO20".
///
/// A 4 acrescentou `chat` -- o plugin escreve no fio da campanha (texto, e
/// rolagem com rotulo e modificador) e o ouve. Nada no manifesto mudou; o
/// numero sobe porque um plugin que chama `api.chat.postar` num ATO20 de API 3
/// quebraria em runtime, longe do gesto de instalar. Pedindo 4, ele e recusado
/// na entrada.
///
/// A 5 acrescentou ao manifesto o estilo de medidor em `camadas` de imagem e o
/// `rotulo`. Um ATO20 de API 4 recusaria o plugin por "falta `arquivo`", que
/// manda o autor procurar o erro no lugar errado; pedindo 5, ele ouve
/// "atualize o ATO20".
///
/// A 6 acrescentou os `efeitos` de condicao. Um ATO20 de API 5 ignoraria o
/// campo e aceitaria o plugin, e as condicoes que apontam para os efeitos dele
/// mostrariam so o selo sem aviso nenhum; pedindo 6, ele ouve "atualize o
/// ATO20".
///
/// A 7 acrescentou o texto por idioma no manifesto -- todo texto mostrado
/// pode ser um mapa, `{ "pt-BR": ..., "en": ... }`, ver `TextoDePlugin` -- e
/// os `rotulos` de configuracao, o texto mostrado de cada opcao. Um ATO20 de
/// API 6 recusaria o mapa como JSON ilegivel, que manda o autor procurar o
/// erro no arquivo; e ignoraria os `rotulos`, mostrando o valor cru de cada
/// opcao sem aviso. Pedindo 7, ele ouve "atualize o ATO20".
pub const API_VERSAO: u32 = 7;

/// Quantas contribuicoes de um MESMO tipo uma extensao pode declarar.
///
/// Teto e nao liberdade porque cada uma vira uma linha num menu, um botao numa
/// barra ou uma entrada na tabela de atalhos, e um manifesto com dez mil
/// paineis travaria a lista de telas antes de o mestre conseguir desligar o
/// plugin. Trinta e dois e mais do que qualquer extensao real declara, e cabe
/// numa lista que ainda se le.
pub const MAX_CONTRIBUICOES: usize = 32;

/// O nome do arquivo que faz de uma pasta uma extensao.
const MANIFESTO: &str = "manifest.json";

/// Onde as extensoes ficam, dado o diretorio de dados do aplicativo.
pub fn dir(base: &Path) -> PathBuf {
    base.join("extensoes")
}

/// O id tem a forma que uma extensao pode ter?
///
/// Aqui o id e ESCOLHIDO pelo autor -- `pergaminho`, `dados-fudge` --, e nao
/// sorteado como o da estante. Isso muda a pergunta: nao da para exigir 32
/// hexadecimais, entao a guarda tem de ser a forma do slug.
///
/// Minusculas, digitos e hifen. O conjunto e o ponto: sem `/`, sem `\`, sem `.`
/// e sem `:`, nenhum id junta ao diretorio e escapa dele -- e `..` cai fora
/// porque o ponto nao esta na lista. A pergunta existe para o PROTOCOLO, cujo
/// id vem da URL, e para a importacao, cujo id vem de um JSON que o autor
/// escreveu.
///
/// Sessenta e quatro de teto porque o id vira nome de diretorio, e ha sistema
/// de arquivos que para em 255 bytes.
pub fn id_valido(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

/// Um texto que o plugin MOSTRA: uma string, como sempre, ou um mapa por
/// idioma -- `{ "pt-BR": "Iniciativa", "en": "Initiative" }`.
///
/// Volta para a tela no MESMO formato em que veio, e quem escolhe o idioma e
/// o front, pelo idioma da tela. O Rust nao sabe qual e, e nao precisa: so
/// aceita, confere as chaves e repassa. Resolver aqui obrigaria a reler os
/// manifestos a cada troca de idioma.
///
/// So para texto que alguem LE. Id, valor gravado (`Configuracao::opcoes`) e
/// modo (`EstiloDeMedidor::rotulo`) continuam `String`: traduzir um deles
/// mudaria o que o plugin grava ou o que a mesa desenha.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TextoDePlugin {
    Um(String),
    PorIdioma(BTreeMap<String, String>),
}

impl TextoDePlugin {
    /// O texto de quem nao escolhe idioma: a ordenacao, o log, os testes.
    ///
    /// No mapa, `pt-BR`, `pt`, `en` e o primeiro que houver, nessa ordem --
    /// a lingua de origem do aplicativo antes da que o mundo le. Mapa vazio
    /// da vazio, e a validacao ja o recusa onde o texto e obrigatorio.
    pub fn principal(&self) -> &str {
        match self {
            Self::Um(texto) => texto,
            Self::PorIdioma(mapa) => ["pt-BR", "pt", "en"]
                .iter()
                .find_map(|idioma| mapa.get(*idioma))
                .or_else(|| mapa.values().next())
                .map_or("", String::as_str),
        }
    }

    /// Sem nada para mostrar em ALGUM idioma.
    ///
    /// Um valor em branco no mapa conta: a aba sem nome apareceria so para
    /// quem usa aquele idioma, e o autor, testando no dele, nunca a veria.
    pub fn vazio(&self) -> bool {
        match self {
            Self::Um(texto) => texto.trim().is_empty(),
            Self::PorIdioma(mapa) => {
                mapa.is_empty() || mapa.values().any(|texto| texto.trim().is_empty())
            }
        }
    }

    /// O maior numero de letras entre os idiomas. Um teto de tamanho vale
    /// para todos: a dica longa em ingles quebra a linha do mesmo jeito.
    pub fn maior_comprimento(&self) -> usize {
        match self {
            Self::Um(texto) => texto.chars().count(),
            Self::PorIdioma(mapa) => mapa
                .values()
                .map(|texto| texto.chars().count())
                .max()
                .unwrap_or(0),
        }
    }

    /// A primeira chave do mapa que nao e um codigo de idioma.
    fn idioma_invalido(&self) -> Option<&str> {
        match self {
            Self::Um(_) => None,
            Self::PorIdioma(mapa) => mapa
                .keys()
                .map(String::as_str)
                .find(|idioma| !codigo_de_idioma_valido(idioma)),
        }
    }
}

/// `assert_eq!(ferramenta.titulo, "Pincel")`: compara o `principal`, e e o
/// que deixa quem manda string continuar se comparando com string.
impl PartialEq<&str> for TextoDePlugin {
    fn eq(&self, outro: &&str) -> bool {
        self.principal() == *outro
    }
}

/// `pt`, `en`, `pt-BR`, `en-US`: duas minusculas e, se houver, hifen e duas
/// maiusculas. Fechado assim porque a chave e o que o front compara com o
/// idioma da tela, e `PT_br` ou `portugues` seriam um texto que nunca aparece.
fn codigo_de_idioma_valido(codigo: &str) -> bool {
    let b = codigo.as_bytes();
    match b.len() {
        2 => b.iter().all(u8::is_ascii_lowercase),
        5 => {
            b[..2].iter().all(u8::is_ascii_lowercase)
                && b[2] == b'-'
                && b[3..].iter().all(u8::is_ascii_uppercase)
        }
        _ => false,
    }
}

/// O que uma extensao diz de si.
///
/// Este tipo atravessa o IPC -- o espelho dele em TypeScript e `Manifesto`, em
/// `src/lib/extensoes/manifesto.ts`. Campo novo aqui precisa de campo novo la.
///
/// `tema` e `principal` sao os dois caminhos que a extensao pode oferecer, e os
/// dois sao opcionais: extensao so de tema nao tem JS, e extensao so de codigo
/// nao tem CSS. Uma que nao traz nenhum dos dois e valida e nao faz nada -- o
/// que e o estado de quem esta comecando a escrever a sua.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifesto {
    pub id: String,
    pub nome: TextoDePlugin,
    pub versao: String,
    #[serde(default)]
    pub autor: Option<String>,
    /// De onde ela veio, para a tela ter o que mostrar antes de habilitar.
    #[serde(default)]
    pub repositorio: Option<String>,
    #[serde(default)]
    pub descricao: Option<TextoDePlugin>,
    pub api_versao: u32,
    /// O CSS, relativo a pasta da extensao.
    #[serde(default)]
    pub tema: Option<String>,
    /// O modulo ESM, relativo a pasta da extensao.
    #[serde(default)]
    pub principal: Option<String>,
    /// As fontes de retrato ao vivo que esta extensao ensina. Ver `FonteRetrato`.
    #[serde(default)]
    pub retratos: Vec<FonteRetrato>,
    /// O que ela acrescenta a interface. Ver `Contribuicoes`.
    #[serde(default)]
    pub contribui: Contribuicoes,
    /// Quando o modulo e importado. Ausente = quando alguem abre o painel ou
    /// dispara o comando. Ver `ATIVACOES`.
    #[serde(default)]
    pub ativacao: Option<String>,
}

impl Manifesto {
    /// Todo texto que o plugin mostra, com o caminho dele no manifesto.
    ///
    /// Uma lista so, e nao uma checagem em cada validacao: campo de texto novo
    /// entra aqui com uma linha, e a guarda das chaves de idioma vale para ele
    /// sem ninguem lembrar. O caminho vai para a mensagem de erro, e e o mesmo
    /// nas duas linguas porque e o JSON que o autor escreveu.
    fn textos(&self) -> Vec<(String, &TextoDePlugin)> {
        let mut textos: Vec<(String, &TextoDePlugin)> = vec![("nome".into(), &self.nome)];
        textos.extend(
            self.descricao
                .iter()
                .map(|texto| ("descricao".into(), texto)),
        );

        for fonte in &self.retratos {
            textos.push((format!("retratos[{}].rotulo", fonte.fonte), &fonte.rotulo));
            textos.push((format!("retratos[{}].campo", fonte.fonte), &fonte.campo));
        }

        let c = &self.contribui;
        let caminho =
            |grupo: &str, id: &str, campo: &str| format!("contribui.{grupo}[{id}].{campo}");

        for x in &c.paineis {
            textos.push((caminho("paineis", &x.id, "titulo"), &x.titulo));
            if let Some(subtitulo) = &x.subtitulo {
                textos.push((caminho("paineis", &x.id, "subtitulo"), subtitulo));
            }
        }
        for x in &c.comandos {
            textos.push((caminho("comandos", &x.id, "titulo"), &x.titulo));
            if let Some(grupo) = &x.grupo {
                textos.push((caminho("comandos", &x.id, "grupo"), grupo));
            }
        }
        for x in &c.ferramentas {
            textos.push((caminho("ferramentas", &x.id, "titulo"), &x.titulo));
        }
        for x in &c.camadas {
            textos.push((caminho("camadas", &x.id, "titulo"), &x.titulo));
        }
        for x in &c.itens_de_menu {
            textos.push((caminho("itensDeMenu", &x.id, "titulo"), &x.titulo));
        }
        for x in &c.secoes {
            textos.push((caminho("secoes", &x.id, "titulo"), &x.titulo));
        }
        for x in &c.estilos_de_medidor {
            textos.push((caminho("estilosDeMedidor", &x.id, "titulo"), &x.titulo));
        }
        for x in &c.paginas {
            textos.push((caminho("paginas", &x.id, "titulo"), &x.titulo));
        }
        for x in &c.efeitos {
            textos.push((caminho("efeitos", &x.id, "titulo"), &x.titulo));
            if let Some(dica) = &x.dica {
                textos.push((caminho("efeitos", &x.id, "dica"), dica));
            }
        }
        for x in &c.configuracoes {
            textos.push((caminho("configuracoes", &x.chave, "titulo"), &x.titulo));
            if let Some(descricao) = &x.descricao {
                textos.push((caminho("configuracoes", &x.chave, "descricao"), descricao));
            }
            for (opcao, rotulo) in &x.rotulos {
                textos.push((
                    caminho("configuracoes", &x.chave, &format!("rotulos.{opcao}")),
                    rotulo,
                ));
            }
        }

        textos
    }
}

/// As chaves dos textos por idioma sao codigos de idioma?
fn validar_idiomas(manifesto: &Manifesto) -> AppResult<()> {
    for (campo, texto) in manifesto.textos() {
        if let Some(idioma) = texto.idioma_invalido() {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "`{campo}` tem a chave {idioma:?}, que nao e um codigo de idioma; use como \"pt-BR\" ou \"en\"",
                "`{campo}` has the key {idioma:?}, which is not a language code; use one like \"pt-BR\" or \"en\""
            )));
        }
    }

    Ok(())
}

/// Os momentos em que um plugin pode pedir para ser importado.
///
/// `abertura` e o que o VSCode chama de `onStartupFinished`: o modulo sobe com
/// a campanha, sem esperar gesto nenhum. Existe para o plugin que trabalha
/// SOZINHO -- escuta a mesa e publica para uma pagina, como o do OBS -- e que
/// no modo preguicoso so comecaria quando o mestre abrisse o painel dele.
/// Lista fechada, como os alvos de menu: um nome errado seria um plugin que
/// nunca carrega, e o autor descobriria na live.
pub const ATIVACOES: &[&str] = &["abertura"];

/// O que uma extensao acrescenta a interface, DECLARADO.
///
/// Declarado e nao descoberto executando o modulo, e a diferenca compra duas
/// coisas. A tela de Plugins lista o que cada extensao faz sem rodar uma linha
/// do codigo dela -- que e exatamente a informacao que alguem quer ANTES de
/// habilitar um plugin de estranho. E o modulo so precisa ser importado quando
/// alguem abre o painel ou dispara o comando: dez extensoes instaladas nao
/// custam dez modulos na abertura da janela, que e onde o mestre esta esperando
/// a mesa abrir.
///
/// E o modelo do VSCode, e a razao dele e a mesma: uma extensao que declara o
/// que faz pode ser listada, pesquisada e carregada tarde. Uma que so descobre
/// isso rodando obriga o app a rodar todas para saber o que existe.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Contribuicoes {
    /// Telas que se atracam no dock, como as de fabrica.
    #[serde(default)]
    pub paineis: Vec<Painel>,
    /// Acoes, alcancaveis por tecla e por menu.
    #[serde(default)]
    pub comandos: Vec<Comando>,
    /// Modos do palco, como o lapis e o postit.
    #[serde(default)]
    pub ferramentas: Vec<Ferramenta>,
    /// Camadas sobre o mapa. Do MESTRE -- ver a nota em `Camada`.
    #[serde(default)]
    pub camadas: Vec<Camada>,
    /// O que a extensao deixa o mestre ajustar. Ver `Configuracao`.
    #[serde(default)]
    pub configuracoes: Vec<Configuracao>,
    /// Opcoes novas nos menus que ja existem. Ver `ItemDeMenu`.
    #[serde(default)]
    pub itens_de_menu: Vec<ItemDeMenu>,
    /// Secoes novas na ficha do personagem. Ver `Secao`.
    #[serde(default)]
    pub secoes: Vec<Secao>,
    /// Corpos que substituem os de fabrica. Ver `Substituto`.
    #[serde(default)]
    pub substitutos: Vec<Substituto>,
    /// Estilos de medidor desenhados em SVG. Ver `EstiloDeMedidor`.
    #[serde(default)]
    pub estilos_de_medidor: Vec<EstiloDeMedidor>,
    /// Paginas que o daemon serve na rede. Ver `Pagina`.
    #[serde(default)]
    pub paginas: Vec<Pagina>,
    /// Efeitos de condicao. Ver `Efeito`.
    #[serde(default)]
    pub efeitos: Vec<Efeito>,
}

/// Um efeito de condicao: o que a figura faz quando uma condicao aponta para
/// `{extensao}/{id}`.
///
/// DECLARATIVO, como o estilo de medidor, e pela mesma razao: chega a TV e ao
/// celular sem rodar codigo do plugin. E o que deixa existir o pack de efeitos
/// so com `manifest.json`, como um pacote de texturas. O espelho em TypeScript
/// e `DefinicaoDeEfeito`, em `types/efeito.ts`; os efeitos de fabrica sao
/// escritos no mesmo formato.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Efeito {
    pub id: String,
    pub titulo: TextoDePlugin,
    /// Uma linha dizendo para que serve, embaixo do seletor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dica: Option<TextoDePlugin>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub figura: Option<FiguraDoEfeito>,
    /// Uma imagem em volta da figura: o fogo, a fumaca, o circulo. Ver
    /// `Externo`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub externo: Option<Externo>,
    /// Uma textura pintada DENTRO da figura: a rachadura, a escama. Ver
    /// `Interno`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interno: Option<Interno>,
    /// A luz que a figura emana: a tocha viva, a aura que clareia. Ver
    /// `LuzDoEfeito`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub luz: Option<LuzDoEfeito>,
    /// O que a figura solta: a fagulha, a gota. Passa como veio -- quem prende
    /// cada numero e o TS, ao desenhar, como nos efeitos da campanha (ver
    /// `vault::efeitos`); aqui so a imagem, se houver, e conferida. Antes deste
    /// campo, a particula do plugin era descartada calada.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub particulas: Option<serde_json::Value>,
    /// O efeito tambem serve a uma AREA do chao. Ver `AreaDoEfeito`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub area: Option<AreaDoEfeito>,
    /// O chao do efeito na area: a textura deitada. Ver `BaseDoEfeito`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base: Option<BaseDoEfeito>,
}

/// Uma grade de quadros: quantos por linha, quantos ao todo, e a velocidade.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Quadros {
    pub colunas: u32,
    pub total: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fps: Option<f64>,
}

/// Uma imagem animada do pack: a chama que a area repete, o chao dela. Os
/// mesmos campos que o TS le -- ver `BaseDoEfeito` em `types/efeito.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagemAnimada {
    pub imagem: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quadros: Option<Quadros>,
    /// A mesma grade em outros tamanhos, pelo lado do QUADRO em pixels.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mipmaps: Option<BTreeMap<String, String>>,
    /// `condicao`, ou o caminho de uma rampa de cor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cores: Option<String>,
}

impl ImagemAnimada {
    /// As imagens que ela usa: a principal, os mipmaps e a rampa.
    fn imagens(&self) -> impl Iterator<Item = &str> {
        std::iter::once(self.imagem.as_str())
            .chain(self.mipmaps.iter().flat_map(|mipmaps| mipmaps.values().map(String::as_str)))
            .chain(self.cores.iter().map(String::as_str).filter(|cores| *cores != "condicao"))
    }
}

/// O efeito numa AREA do chao: a cor de uma area nova, o FOCO que ela repete
/// segmento a segmento, e como ela divide a casa da grade. Ver `AreaDoEfeito`
/// em `types/efeito.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AreaDoEfeito {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cor: Option<String>,
    /// O foco, em vezes o segmento.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub escala: Option<f64>,
    /// Segmentos por lado de casa.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub divisoes: Option<f64>,
    /// O minimo de segmentos no menor lado da area.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub densidade: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub foco: Option<ImagemAnimada>,
}

/// O chao de um efeito em area: a textura deitada, ladrilhada e recortada na
/// forma. Ver `BaseDoEfeito` em `types/efeito.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseDoEfeito {
    #[serde(flatten)]
    pub imagem: ImagemAnimada,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacidade: Option<f64>,
    /// O ladrilho, em vezes o segmento.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub escala: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub escurece: Option<f64>,
}

/// A luz de um efeito. Entra na luz da cena como a lanterna do token, e vai
/// com ele aonde ele for.
///
/// O `raio` e em VEZES o lado maior da figura, e nao em unidade de cena como a
/// lanterna: o pack nao conhece a escala do mapa, e o dragao em chamas clareia
/// mais que o rato em chamas.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LuzDoEfeito {
    pub raio: f64,
    /// Ausente = a cor da condicao.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cor: Option<String>,
    /// De 0 a 1. Ausente = inteira.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intensidade: Option<f64>,
    /// `fogo`, `pulsando` ou `piscando`. Ausente = fixa. Ver `EFEITOS_DA_LUZ`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub efeito: Option<String>,
}

/// Como a luz de um efeito se mexe. Espelho de `EFEITOS_DA_LUZ`, em
/// `types/scene.ts` -- os mesmos da luz cravada e da lanterna.
pub const EFEITOS_DA_LUZ: &[&str] = &["fogo", "pulsando", "piscando"];

/// Os limites do raio da luz de um efeito, em vezes a figura. Abaixo de meio
/// a luz nao sai de baixo dela; acima de dez ela acende o mapa inteiro.
pub const RAIO_DA_LUZ_MIN: f64 = 0.5;
pub const RAIO_DA_LUZ_MAX: f64 = 10.0;

impl Efeito {
    /// As imagens que o efeito usa, relativas a pasta. Entram na lista do que
    /// o daemon serve, como as do estilo de medidor -- ver `imagens_servidas`.
    pub fn imagens(&self) -> Vec<&str> {
        let mut imagens: Vec<&str> = Vec::new();
        imagens.extend(self.externo.as_ref().map(|externo| externo.imagem.as_str()));
        imagens.extend(self.interno.as_ref().map(|interno| interno.textura.as_str()));
        imagens.extend(
            self.particulas
                .as_ref()
                .and_then(|particulas| particulas.get("imagem"))
                .and_then(serde_json::Value::as_str),
        );
        if let Some(foco) = self.area.as_ref().and_then(|area| area.foco.as_ref()) {
            imagens.extend(foco.imagens());
        }
        if let Some(base) = &self.base {
            imagens.extend(base.imagem.imagens());
        }

        imagens
    }

    /// Mexe em alguma coisa?
    fn faz_algo(&self) -> bool {
        self.figura.as_ref().is_some_and(FiguraDoEfeito::faz_algo)
            || self.externo.is_some()
            || self.interno.is_some()
            || self.luz.is_some()
            || self.particulas.is_some()
            || self.area.as_ref().is_some_and(|area| area.foco.is_some())
            || self.base.is_some()
    }
}

/// Uma imagem em volta da figura, do tamanho dela vezes `tamanho`.
///
/// Esticada na caixa, como o token: a figura quadrada leva o fogo quadrado.
/// `ancora` diz de onde ela cresce -- do centro (a aura), da base (a fogueira
/// que sobe dos pes) ou do topo (a nuvem sobre a cabeca).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Externo {
    pub imagem: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tamanho: Option<f64>,
    /// `atras` (o de sempre) ou `frente`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lado: Option<String>,
    /// `centro` (o de sempre), `base` ou `topo`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ancora: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacidade: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub animacao: Option<Animacao>,
}

/// Uma textura pintada sobre a figura, so onde ha figura, uma vez -- vira
/// parte da pele, como a tinta.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Interno {
    pub textura: String,
    /// Quanto ela cobre, de 0 a 1.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub forca: Option<f64>,
}

/// Uma animacao DECLARADA: o "script" de um efeito e dado, e nao codigo,
/// porque a TV e o celular nao rodam codigo de plugin. Sao quatro movimentos
/// que o palco anima so com `transform` e `opacity`, os que o compositor faz
/// sem refazer layout.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Animacao {
    /// `pulsar`, `girar`, `flutuar` ou `piscar`. Ver `ANIMACOES`.
    pub tipo: String,
    /// Segundos por ciclo.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub periodo: Option<f64>,
    /// De 0 a 1: quanto o movimento se afasta do parado.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intensidade: Option<f64>,
}

/// Os movimentos que uma `Animacao` pode pedir.
pub const ANIMACOES: &[&str] = &["pulsar", "girar", "flutuar", "piscar"];

/// De onde o externo cresce.
pub const ANCORAS: &[&str] = &["centro", "base", "topo"];

/// De que lado da figura o externo fica.
pub const LADOS: &[&str] = &["atras", "frente"];

/// Os limites do `tamanho` do externo, em vezes a figura.
///
/// Dois e o teto pela regra do palco: o que sai da caixa de um plano infla a
/// camada composta do WebKitGTK, e um fogo de cinco tokens em volta de um so
/// seria isso. Mesmo dentro do teto, o externo encolhe perto da borda do mapa
/// para nao sair dele -- ver `tamanhoNoPlano` no TS.
pub const TAMANHO_DO_EXTERNO_MIN: f64 = 0.25;
pub const TAMANHO_DO_EXTERNO_MAX: f64 = 2.0;

/// Os limites do periodo de uma animacao, em segundos. Abaixo de um quinto de
/// segundo e pisca-pisca; acima de trinta ninguem ve mexer.
pub const PERIODO_MIN: f64 = 0.2;
pub const PERIODO_MAX: f64 = 30.0;

/// O que o efeito faz com a propria figura. Ver `FiguraDoEfeito` no TS, que
/// diz o custo de cada um.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FiguraDoEfeito {
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub halo: bool,
    /// Quanto a cor da condicao cobre a figura, de 0 a 1.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tinta: Option<f64>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub cinza: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub translucido: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub tremor: bool,
}

impl FiguraDoEfeito {
    /// Mexe em alguma coisa?
    pub fn faz_algo(&self) -> bool {
        self.halo || self.tinta.is_some() || self.cinza || self.translucido || self.tremor
    }
}

/// O teto da dica de um efeito. Uma linha embaixo do seletor, e nao um texto.
const MAX_DICA_DO_EFEITO: usize = 120;

/// O prefixo dos efeitos que a CAMPANHA cria. Um plugin com este id
/// disputaria os mesmos ids -- `campanha/brasa` seria dos dois.
pub const PREFIXO_DA_CAMPANHA: &str = "campanha";

impl Contribuicoes {
    /// As imagens que o daemon serve na rede por causa do que foi declarado --
    /// dos estilos de medidor e dos efeitos --, cada uma com quem a pediu, para
    /// o erro dizer de quem e o arquivo que falta. Ver `serve::serve_plugin`.
    pub fn imagens_servidas(&self) -> Vec<(crate::error::Texto, &str)> {
        let estilos = self.estilos_de_medidor.iter().flat_map(|estilo| {
            estilo.imagens().into_iter().map(move |imagem| {
                (
                    crate::texto!("o estilo {:?}", "the meter style {:?}", estilo.id),
                    imagem,
                )
            })
        });
        let efeitos = self.efeitos.iter().flat_map(|efeito| {
            efeito.imagens().into_iter().map(move |imagem| {
                (
                    crate::texto!("o efeito {:?}", "the effect {:?}", efeito.id),
                    imagem,
                )
            })
        });

        estilos.chain(efeitos).collect()
    }
}

/// Uma pagina do plugin, servida pelo daemon em `/plugin/{id}/{arquivo}`.
///
/// E o unico caminho por onde codigo de plugin sai do Mestre, e sai para um
/// NAVEGADOR, nao para a janela: quem abre e o OBS da maquina que transmite,
/// a TV, qualquer aparelho com o link. La a pagina nao tem IPC nem disco, e o
/// daemon a entrega com `Content-Security-Policy: sandbox allow-scripts` --
/// origem opaca, sem `localStorage` nem cookie da origem do daemon. E o que
/// impede a pagina de um plugin de ler o token de um jogador que a abra no
/// mesmo navegador do celular. Ver `serve::serve_plugin`.
///
/// Declarar a pagina e o que publica a PASTA: plugin sem pagina nao tem
/// arquivo nenhum alcancavel pela rede.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pagina {
    pub id: String,
    pub titulo: TextoDePlugin,
    /// O `.html`, relativo a pasta da extensao.
    pub arquivo: String,
}

/// Um estilo de medidor que a extensao desenhou: um `.svg` com variaveis, OU
/// `camadas` de imagem -- um dos dois, nunca os dois.
///
/// DECLARATIVO, e e a razao de ele chegar a TV e ao celular: nenhum codigo do
/// plugin roda fora do Mestre, e um SVG filtrado e dado, nao codigo. Quem le o
/// arquivo e filtra e a tela do Mestre (`svg-modelo.ts`); o Rust so garante
/// que o caminho fica dentro da pasta e que a altura faz sentido. As camadas
/// nem isso pedem: sao o proprio JSON, validado aqui, e a mesa desenha as
/// imagens que ele aponta. Ver `Camadas`.
///
/// `altura` e a altura da FORMA em fracao da largura do medidor -- 0,2 e uma
/// barra fina, 1 e um quadrado. Declarada aqui porque a caixa sobre o token e
/// medida antes de o SVG desenhar, e sem o numero a TV nao saberia quanto
/// reservar.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstiloDeMedidor {
    pub id: String,
    pub titulo: TextoDePlugin,
    /// O `.svg`, relativo a pasta da extensao. Ausente nas `camadas`.
    #[serde(default)]
    pub arquivo: Option<String>,
    pub altura: f64,
    #[serde(default)]
    pub camadas: Option<Camadas>,
    /// A linha de nome e valor sobre a forma. Ver `ROTULOS`.
    #[serde(default)]
    pub rotulo: Option<String>,
}

impl EstiloDeMedidor {
    /// As imagens que este estilo pede, na ordem em que aparecem.
    ///
    /// E a lista do que o daemon serve na rede por causa dele -- arquivo por
    /// arquivo, e nao a pasta: um plugin que so desenha medidor nao publica o
    /// resto do que trouxe. Ver `serve::serve_plugin`.
    pub fn imagens(&self) -> Vec<&str> {
        let Some(camadas) = &self.camadas else {
            return Vec::new();
        };

        let mut imagens: Vec<&str> = Vec::new();
        imagens.extend(camadas.moldura.as_deref());
        imagens.extend(camadas.mascara.as_deref());
        match &camadas.conteudo {
            Conteudo::Barra { imagem, vazio, .. } => {
                imagens.extend(vazio.as_deref());
                imagens.extend(imagem.as_deref());
            }
            Conteudo::Pontos { cheio, vazio } => {
                imagens.extend(cheio.as_deref());
                imagens.extend(vazio.as_deref());
            }
            Conteudo::Sequencia { quadros } => imagens.extend(quadros.iter().map(String::as_str)),
        }

        imagens
    }
}

/// Os limites da altura. Abaixo de 0,05 nao se ve; acima de 3 a forma e mais
/// alta que tres larguras, e a coluna do retrato viraria uma torre.
pub const ALTURA_MIN: f64 = 0.05;
pub const ALTURA_MAX: f64 = 3.0;

/// O que a linha acima da forma mostra.
///
/// `acima` e o de sempre, nome e valor. `nome` tira o valor, para a moldura
/// que ja escreve o numero; `nenhum` tira a linha, para o coracao que racha e
/// dispensa legenda. Ausente e `acima`.
pub const ROTULOS: &[&str] = &["acima", "nome", "nenhum"];

/// Um medidor feito de imagens: o conteudo embaixo, a moldura por cima.
///
/// E o caminho de quem desenha num editor de imagem e nao em SVG -- a moldura
/// de pergaminho, o frasco de sangue em GIF. As coordenadas sao FRACAO da
/// forma, e nao pixel: a forma escala com a coluna do retrato, e o encaixe
/// escala junto sem o autor saber o tamanho de tela nenhuma.
///
/// Sem 9-slice de proposito. A largura do medidor muda, mas a proporcao e a
/// `altura` declarada, entao a moldura so cresce inteira -- nunca estica.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Camadas {
    /// Por cima de tudo, a forma inteira.
    #[serde(default)]
    pub moldura: Option<String>,
    /// Recorta o conteudo pelo alfa, para formas que nao sao retangulo.
    #[serde(default)]
    pub mascara: Option<String>,
    /// Onde o conteudo entra. Ausente e a forma inteira.
    #[serde(default)]
    pub encaixe: Option<Encaixe>,
    pub conteudo: Conteudo,
    /// O valor escrito DENTRO da forma, por cima de tudo. Ver `Texto`.
    #[serde(default)]
    pub texto: Option<Texto>,
}

/// O valor (`11/13`, `70%`) escrito dentro da forma, por cima da moldura.
///
/// E o que a barra de pincel de uma mesa de streaming faz: o numero no meio da
/// tinta, sem legenda em cima. Fonte do aplicativo, e nao do plugin -- uma
/// fonte de plugin teria de viajar para cada TV, e nao e o que separa um tema
/// do outro. As cores sao hex e so hex: vao parar num `style`, e uma string
/// livre ali seria CSS do plugin dentro da mesa.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Texto {
    /// Ausente e o encaixe do conteudo.
    #[serde(default)]
    pub encaixe: Option<Encaixe>,
    /// Ausente e branco.
    #[serde(default)]
    pub cor: Option<String>,
    /// O contorno que separa o numero da tinta. Ausente e quase preto.
    #[serde(default)]
    pub contorno: Option<String>,
    /// O corpo do texto, em fracao da altura do encaixe dele. Ausente e 0,7.
    #[serde(default)]
    pub tamanho: Option<f64>,
}

/// Os limites do `tamanho` do texto. Abaixo de 0,2 nao se le; acima de 1,5 o
/// numero vaza do encaixe para cima e para baixo.
pub const TAMANHO_DO_TEXTO_MIN: f64 = 0.2;
pub const TAMANHO_DO_TEXTO_MAX: f64 = 1.5;

/// Uma cor `#rgb`, `#rgba`, `#rrggbb` ou `#rrggbbaa`. Ver `Texto`.
pub fn cor_hex_valida(cor: &str) -> bool {
    let Some(digitos) = cor.strip_prefix('#') else {
        return false;
    };

    matches!(digitos.len(), 3 | 4 | 6 | 8) && digitos.chars().all(|c| c.is_ascii_hexdigit())
}

/// O encaixe cabe na forma?
///
/// Um milesimo de folga: `0.06 + 0.94` nao da 1 em ponto flutuante, e recusar
/// a conta certa do autor seria pior que aceitar um encaixe que passa da borda
/// por um fio.
fn encaixe_cabe(encaixe: &Encaixe) -> bool {
    let Encaixe {
        x,
        y,
        largura,
        altura,
    } = *encaixe;

    [x, y, largura, altura].iter().all(|n| n.is_finite())
        && x >= 0.0
        && y >= 0.0
        && largura > 0.0
        && altura > 0.0
        && x + largura <= 1.001
        && y + altura <= 1.001
}

/// Um retangulo em fracao da forma: `x` e `largura` da largura, `y` e
/// `altura` da altura.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Encaixe {
    pub x: f64,
    pub y: f64,
    pub largura: f64,
    pub altura: f64,
}

/// Como o valor ocupa o encaixe.
///
/// Os tres modos sao os tres estilos de fabrica (barra, pontos) mais o que so
/// imagem sabe fazer: trocar de quadro conforme o valor -- o coracao que
/// racha, a sanidade que distorce. Sem imagem, barra e pontos pintam com a cor
/// do medidor.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "modo", rename_all = "camelCase")]
pub enum Conteudo {
    Barra {
        #[serde(default)]
        direcao: Direcao,
        #[serde(default)]
        imagem: Option<String>,
        /// O trecho VAZIO: desenhado inteiro embaixo, e a parte cheia o
        /// cobre. Ausente, o vazio e transparente.
        #[serde(default)]
        vazio: Option<String>,
    },
    Pontos {
        #[serde(default)]
        cheio: Option<String>,
        #[serde(default)]
        vazio: Option<String>,
    },
    /// Do vazio ao cheio. O primeiro so aparece no zero.
    Sequencia { quadros: Vec<String> },
}

/// Para onde a barra cresce.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Direcao {
    #[default]
    Direita,
    Esquerda,
    Cima,
    Baixo,
}

/// As imagens que um estilo em camadas aceita. Raster, e so.
///
/// O `.svg` fica de fora por SEGURANCA, e nao por gosto: estas vao para a
/// rede, e um SVG aberto como documento roda script na origem do daemon --
/// que e onde o celular do jogador guarda o token. Moldura vetorial continua
/// possivel pelo estilo `.svg`, que passa pelo filtro.
pub const IMAGENS_DE_MEDIDOR: &[&str] = &["png", "webp", "gif", "jpg", "jpeg", "avif"];

/// O teto de uma imagem de medidor, em bytes.
///
/// Cada TV e cada celular baixa todas, e um GIF de dez megas por medidor
/// travaria a mesa que abre no meio da sessao. Dois megas cabem uma
/// animacao curta de 512px, que e mais do que a coluna do retrato mostra.
pub const IMAGEM_DE_MEDIDOR_MAX: u64 = 2 * 1024 * 1024;

/// Quantos quadros uma `sequencia` pode ter. Cada quadro e um arquivo que a
/// mesa baixa; dezesseis ja distinguem cada faixa de vida que alguem le.
pub const QUADROS_MAX: usize = 16;

/// Um item que a extensao poe num menu do aplicativo.
///
/// O `alvo` diz QUAL menu: o botao direito no token, na luz, na area escondida,
/// no vazio do palco, ou a linha de uma lista. A lista de alvos e fechada e
/// vive aqui, porque o item que aponta para um menu que nao existe nunca
/// apareceria -- e o autor descobriria isso no meio da mesa.
///
/// O titulo e declarado para o item aparecer ANTES do modulo ser importado; o
/// clique e o que importa o modulo, como o comando.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemDeMenu {
    pub id: String,
    pub titulo: TextoDePlugin,
    pub alvo: String,
    /// Nome de icone da lista do aplicativo -- ver `lib/extensoes/icones.ts`.
    #[serde(default)]
    pub icone: Option<String>,
}

/// Os menus em que uma extensao pode por item.
///
/// `palco.*` e o botao direito no palco, pelo que esta na mao; `linha.*` e o
/// menu de uma linha de lista, botao direito e tres pontos.
pub const ALVOS_DE_MENU: &[&str] = &[
    "palco.token",
    "palco.luz",
    "palco.area",
    "palco.quadro",
    "palco.parede",
    "palco.retrato",
    "palco.vazio",
    "linha.cena",
    "linha.personagem",
    "linha.retrato",
    "linha.imagem",
    "linha.quadro",
    "linha.nota",
];

/// Uma secao nova na ficha do personagem.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Secao {
    pub id: String,
    pub titulo: TextoDePlugin,
    /// So `ficha` por ora. O campo existe para a proxima nao pedir migracao.
    pub alvo: String,
}

pub const ALVOS_DE_SECAO: &[&str] = &["ficha"];

/// Um corpo de fabrica que a extensao troca pelo dela.
///
/// `secao:medidores` troca o miolo de uma secao da ficha; `janela:personagem`
/// troca uma janela inteira. Desligar o plugin devolve o de fabrica. Dois
/// plugins no mesmo alvo: vale o primeiro por ordem de nome, e a tela de
/// Plugins diz quem venceu.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Substituto {
    pub alvo: String,
}

pub const SECOES_DE_FABRICA: &[&str] = &[
    "campos",
    "aparencias",
    "medidores",
    "condicoes",
    "inventario",
    "arquivos",
    "nota",
];

pub const JANELAS_DE_FABRICA: &[&str] = &[
    "personagens",
    "personagem",
    "configuracao",
    "estante",
    "miniplayer",
    "rolagens",
    "chat",
    "cenas",
    "quadros",
    "retratos",
    "imagens",
    "sons",
    "camadas",
];

/// O alvo de um substituto existe?
pub fn alvo_de_substituto_valido(alvo: &str) -> bool {
    if let Some(secao) = alvo.strip_prefix("secao:") {
        return SECOES_DE_FABRICA.contains(&secao);
    }
    if let Some(janela) = alvo.strip_prefix("janela:") {
        return JANELAS_DE_FABRICA.contains(&janela);
    }

    false
}

/// Uma configuracao que a extensao declara, como as `contributes.configuration`
/// do VSCode.
///
/// DECLARATIVA: a tela de Configuracoes desenha o campo a partir daqui, sem
/// importar o modulo. E o que faz um plugin desligado ainda mostrar o que ele
/// deixaria ajustar, e um plugin so de tema ter configuracao sem ter JS.
///
/// A chave e `{id da extensao}.{nome}`, e o prefixo e obrigatorio: e o que
/// impede dois plugins de disputarem `cor`, e um plugin de escrever em
/// `ato20.zoom`. Quem valida o valor GRAVADO e a tela, na leitura, contra
/// `tipo`; o Rust so garante que a declaracao faz sentido -- `padrao` do tipo
/// declarado, `escolha` com opcoes, `numero` dentro do intervalo.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Configuracao {
    pub chave: String,
    pub titulo: TextoDePlugin,
    #[serde(default)]
    pub descricao: Option<TextoDePlugin>,
    pub tipo: TipoConfiguracao,
    pub padrao: serde_json::Value,
    /// Onde ela pode ser gravada. Ausente = nos dois, e a campanha vence.
    #[serde(default)]
    pub escopo: EscopoConfiguracao,
    /// As opcoes de uma `escolha`. Vazio nos outros tipos.
    ///
    /// Sao VALORES -- o que fica gravado --, e por isso `String` e nao
    /// `TextoDePlugin`: traduzir a opcao mudaria o que o plugin le de volta.
    /// O que a tela MOSTRA de cada uma e `rotulos`.
    #[serde(default)]
    pub opcoes: Vec<String>,
    /// O texto mostrado de cada opcao, pela opcao. Ausente = a propria opcao.
    #[serde(default)]
    pub rotulos: BTreeMap<String, TextoDePlugin>,
    /// O intervalo de um `numero`. Ausente = sem limite.
    #[serde(default)]
    pub minimo: Option<f64>,
    #[serde(default)]
    pub maximo: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TipoConfiguracao {
    Booleano,
    Numero,
    Texto,
    Escolha,
    /// Uma lista de textos. Sem controle na tela gerada: quem a edita e o
    /// painel do proprio plugin, que sabe o que os itens sao (e o editor JSON).
    Lista,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum EscopoConfiguracao {
    Maquina,
    Campanha,
    #[default]
    Ambos,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Painel {
    pub id: String,
    pub titulo: TextoDePlugin,
    /// A linha de baixo na aba, quando ha.
    #[serde(default)]
    pub subtitulo: Option<TextoDePlugin>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comando {
    pub id: String,
    pub titulo: TextoDePlugin,
    /// Como o atalho se escreve -- "Ctrl+Shift+F". Opcional.
    ///
    /// NAO pode roubar um atalho de fabrica, e nao precisa ser conferido aqui
    /// para isso: a tabela do Mestre e consultada em ordem, e os do plugin
    /// entram DEPOIS. Quem casa primeiro executa, entao `Ctrl+Z` declarado por
    /// uma extensao nunca alcanca o desfazer.
    #[serde(default)]
    pub atalho: Option<String>,
    /// Sob que titulo ele aparece na lista de Configuracoes.
    #[serde(default)]
    pub grupo: Option<TextoDePlugin>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ferramenta {
    pub id: String,
    pub titulo: TextoDePlugin,
    /// Arquivo de icone dentro da pasta da extensao.
    #[serde(default)]
    pub icone: Option<String>,
}

/// Uma camada que a extensao desenha sobre o mapa.
///
/// Do MESTRE, e nao da mesa. Plugin so alcanca o Mestre nesta etapa, entao o
/// que ele desenha vive na bancada -- que e exatamente o que os alfinetes e os
/// postits ja sao. O dado dela entra em `scene.extensoes` e sai do payload
/// publicado pelo mesmo caminho que apaga aqueles dois, o que a faz nascer
/// sigilosa por construcao em vez de por lembranca.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Camada {
    pub id: String,
    pub titulo: TextoDePlugin,
}

/// Uma fonte de retrato ao vivo: como montar a URL de um servico, e em que
/// tamanho a pagina dele foi desenhada.
///
/// DECLARATIVA, sem uma linha de JS, e isso e o que ela tem de melhor: o que
/// varia entre um servico e outro e um molde de URL e duas medidas. Codigo aqui
/// pediria a API de plugin inteira para resolver uma interpolacao de string.
///
/// `largura` e `altura` sao o que separa isto de "cole um link". Paginas de
/// overlay sao desenhadas para o canvas do OBS e tem layout de pixel FIXO --
/// medido no C.R.I.S.: pontos de quebra em 1023, 1260 e 1280, e a 420px de
/// largura aparece so um canto do card. Entao o quadro renderiza no tamanho de
/// projeto e a tela o ESCALA para caber no retrato, que e o que o OBS faz.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FonteRetrato {
    /// O id curto da fonte, no mesmo formato de um id de extensao.
    pub fonte: String,
    /// Como ela se chama para quem escolhe no menu.
    pub rotulo: TextoDePlugin,
    /// O molde da URL, com `{codigo}` onde entra o que o mestre cola.
    pub modelo: String,
    /// O nome do campo que o mestre preenche -- "Codigo do agente".
    pub campo: TextoDePlugin,
    /// O canvas de projeto da pagina, em pixels.
    pub largura: u32,
    pub altura: u32,
    /// Um codigo de exemplo, para o campo ter `placeholder`.
    #[serde(default)]
    pub exemplo: Option<String>,
}

/// O maior canvas que uma fonte pode declarar.
///
/// Teto e nao liberdade porque o numero vira o tamanho de um elemento que a
/// tela desenha: um `largura` de um milhao faria a webview alocar um quadro que
/// nao cabe na memoria, e o retrato some levando a cena junto.
const CANVAS_MAX: u32 = 8192;

/// Uma extensao instalada: o que ela diz de si, mais o que a maquina decidiu.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Extensao {
    #[serde(flatten)]
    pub manifesto: Manifesto,
    pub habilitada: bool,
}

/// Le e valida o manifesto de uma pasta.
///
/// Valida ANTES de copiar qualquer coisa: manifesto quebrado tem de ser erro na
/// hora em que o dialogo de escolher pasta ainda esta na cabeca de quem clicou,
/// e nao meia pasta em `extensoes/` para alguem limpar depois.
pub fn ler_manifesto(pasta: &Path) -> AppResult<Manifesto> {
    let caminho = pasta.join(MANIFESTO);

    let cru = std::fs::read_to_string(&caminho).map_err(|cause| {
        if cause.kind() == std::io::ErrorKind::NotFound {
            AppError::ExtensaoInvalida(crate::texto!(
                "a pasta nao tem {MANIFESTO} -- nao e uma extensao do ATO20",
                "the folder has no {MANIFESTO}: it is not an ATO20 plugin"
            ))
        } else {
            AppError::Io(cause)
        }
    })?;

    let manifesto: Manifesto = serde_json::from_str(&cru).map_err(|cause| AppError::Malformed {
        file: MANIFESTO.to_string(),
        cause: cause.to_string(),
    })?;

    if !id_valido(&manifesto.id) {
        return Err(AppError::ExtensaoInvalida(crate::texto!(
            "o id {:?} nao serve: so minusculas, digitos e hifen, ate 64",
            "the id {:?} is not valid: only lowercase letters, digits and hyphens, up to 64",
            manifesto.id
        )));
    }

    if manifesto.api_versao > API_VERSAO {
        return Err(AppError::ExtensaoIncompativel {
            pede: manifesto.api_versao,
            temos: API_VERSAO,
        });
    }

    // Caminho declarado que escapa da pasta e a mesma falha que o id: o
    // `tema.css` vira `<link>` e o `principal` vira `import`, e os dois saem
    // daqui. Recusar na entrada e o que dispensa a checagem em cada leitura.
    for (campo, valor) in [
        ("tema", &manifesto.tema),
        ("principal", &manifesto.principal),
    ] {
        if let Some(rel) = valor {
            if !caminho_relativo_seguro(rel) {
                return Err(AppError::ExtensaoInvalida(crate::texto!(
                    "o caminho de {campo} ({rel:?}) sai da pasta da extensao",
                    "the path in {campo} ({rel:?}) leaves the plugin folder"
                )));
            }
        }
    }

    for fonte in &manifesto.retratos {
        validar_fonte(fonte)?;
    }

    validar_contribuicoes(&manifesto)?;
    validar_idiomas(&manifesto)?;

    if let Some(ativacao) = &manifesto.ativacao {
        if !ATIVACOES.contains(&ativacao.as_str()) {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "a ativacao {ativacao:?} nao existe; as ativacoes sao {}",
                "unknown `ativacao` {ativacao:?}; the options are {}",
                ATIVACOES.join(", ")
            )));
        }
        // Subir na abertura e importar o `principal`. Sem ele, o plugin
        // pediria para carregar algo que nao existe.
        if manifesto.principal.is_none() {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "a extensao pede `ativacao` mas nao tem `principal`",
                "the plugin sets `ativacao` but has no `principal`"
            )));
        }
    }

    Ok(manifesto)
}

/// O que a extensao declara acrescentar faz sentido?
///
/// Recusa na IMPORTACAO pela mesma razao das fontes: com a mesa montada, uma
/// aba que abre vazia ou um atalho que nao faz nada custam a sessao. Aqui o
/// dialogo de escolher pasta ainda esta na cabeca de quem clicou.
fn validar_contribuicoes(manifesto: &Manifesto) -> AppResult<()> {
    let c = &manifesto.contribui;

    let declarou_algo = !c.paineis.is_empty()
        || !c.comandos.is_empty()
        || !c.ferramentas.is_empty()
        || !c.camadas.is_empty()
        || !c.itens_de_menu.is_empty()
        || !c.secoes.is_empty()
        || !c.substitutos.is_empty();

    // Quem implementa contribuicao e o modulo. Declarar sem `principal` daria
    // uma aba na lista de telas que abre vazia, e um comando no menu que nao
    // faz nada -- e a causa estaria num arquivo que nao existe.
    if declarou_algo && manifesto.principal.is_none() {
        return Err(AppError::ExtensaoInvalida(crate::texto!(
            "a extensao declara contribuicoes mas nao tem `principal`; nada as implementaria",
            "the plugin declares contributions but has no `principal`; nothing would implement them"
        )));
    }

    // `Vec` e nao array de tamanho fixo: cada tipo novo de contribuicao entra
    // aqui com uma linha, e o compilador nao cobra o numero.
    let grupos: Vec<(&str, Vec<(&String, &TextoDePlugin)>)> = vec![
        (
            "paineis",
            c.paineis.iter().map(|x| (&x.id, &x.titulo)).collect(),
        ),
        (
            "comandos",
            c.comandos.iter().map(|x| (&x.id, &x.titulo)).collect(),
        ),
        (
            "ferramentas",
            c.ferramentas.iter().map(|x| (&x.id, &x.titulo)).collect(),
        ),
        (
            "camadas",
            c.camadas.iter().map(|x| (&x.id, &x.titulo)).collect(),
        ),
        (
            "itensDeMenu",
            c.itens_de_menu.iter().map(|x| (&x.id, &x.titulo)).collect(),
        ),
        (
            "secoes",
            c.secoes.iter().map(|x| (&x.id, &x.titulo)).collect(),
        ),
        (
            "estilosDeMedidor",
            c.estilos_de_medidor.iter().map(|x| (&x.id, &x.titulo)).collect(),
        ),
        (
            "paginas",
            c.paginas.iter().map(|x| (&x.id, &x.titulo)).collect(),
        ),
        (
            "efeitos",
            c.efeitos.iter().map(|x| (&x.id, &x.titulo)).collect(),
        ),
    ];

    for (nome, itens) in grupos {
        if itens.len() > MAX_CONTRIBUICOES {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "`{nome}` declara {} itens; o teto e {MAX_CONTRIBUICOES}",
                "`{nome}` declares {} items; the limit is {MAX_CONTRIBUICOES}",
                itens.len()
            )));
        }

        let mut vistos: Vec<&str> = Vec::new();

        for (id, titulo) in itens {
            // Mesma forma do id de extensao, e pelo mesmo motivo: este id entra
            // em chave de janela e em id de ferramenta, que viram texto em
            // lugares que nao esperam barra nem espaco.
            if !id_valido(id) {
                return Err(AppError::ExtensaoInvalida(crate::texto!(
                    "o id {id:?} em `{nome}` nao serve: so minusculas, digitos e hifen",
                    "the id {id:?} in `{nome}` is not valid: only lowercase letters, digits and hyphens"
                )));
            }

            // Titulo vazio daria uma aba sem nome, impossivel de achar de novo.
            // Em qualquer idioma: ver `TextoDePlugin::vazio`.
            if titulo.vazio() {
                return Err(AppError::ExtensaoInvalida(crate::texto!(
                    "a contribuicao {id:?} em `{nome}` esta sem titulo",
                    "the contribution {id:?} in `{nome}` has no `titulo`"
                )));
            }

            // Repetido dentro do MESMO grupo e ambiguidade de verdade: duas
            // telas com o mesmo id disputariam a mesma chave de janela. Entre
            // grupos nao ha conflito -- um painel e uma ferramenta chamados
            // `notas` sao coisas diferentes.
            if vistos.contains(&id.as_str()) {
                return Err(AppError::ExtensaoInvalida(crate::texto!(
                    "o id {id:?} aparece duas vezes em `{nome}`",
                    "the id {id:?} appears twice in `{nome}`"
                )));
            }

            vistos.push(id);
        }
    }

    validar_configuracoes(manifesto)?;
    validar_encaixes(manifesto)?;

    // Icone de ferramenta e caminho dentro da pasta, e vale a mesma guarda do
    // `tema` e do `principal`.
    for ferramenta in &c.ferramentas {
        if let Some(icone) = &ferramenta.icone {
            if !caminho_relativo_seguro(icone) {
                return Err(AppError::ExtensaoInvalida(crate::texto!(
                    "o icone de {:?} ({icone:?}) sai da pasta da extensao",
                    "the icon of {:?} ({icone:?}) leaves the plugin folder",
                    ferramenta.id
                )));
            }
        }
    }

    Ok(())
}

/// Os encaixes apontam para lugares que existem?
///
/// Item de menu para um menu que nao existe, secao para um alvo que nao e a
/// ficha, substituto para uma janela que nao ha: nenhum deles apareceria, e o
/// autor descobriria no meio da mesa. Recusar aqui e dizer o nome certo.
fn validar_encaixes(manifesto: &Manifesto) -> AppResult<()> {
    let c = &manifesto.contribui;

    for item in &c.itens_de_menu {
        if !ALVOS_DE_MENU.contains(&item.alvo.as_str()) {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "o item de menu {:?} aponta para {:?}; os alvos sao {}",
                "the menu item {:?} points to {:?}; the targets are {}",
                item.id,
                item.alvo,
                ALVOS_DE_MENU.join(", ")
            )));
        }
    }

    for secao in &c.secoes {
        if !ALVOS_DE_SECAO.contains(&secao.alvo.as_str()) {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "a secao {:?} aponta para {:?}; os alvos sao {}",
                "the section {:?} points to {:?}; the targets are {}",
                secao.id,
                secao.alvo,
                ALVOS_DE_SECAO.join(", ")
            )));
        }
    }

    if c.substitutos.len() > MAX_CONTRIBUICOES {
        return Err(AppError::ExtensaoInvalida(crate::texto!(
            "`substitutos` declara {} itens; o teto e {MAX_CONTRIBUICOES}",
            "`substitutos` declares {} items; the limit is {MAX_CONTRIBUICOES}",
            c.substitutos.len()
        )));
    }

    for estilo in &c.estilos_de_medidor {
        validar_estilo(estilo)?;
    }

    if !c.efeitos.is_empty() && manifesto.id == PREFIXO_DA_CAMPANHA {
        return Err(AppError::ExtensaoInvalida(crate::texto!(
            "uma extensao chamada {PREFIXO_DA_CAMPANHA:?} nao pode declarar efeitos: o nome e o dos efeitos da campanha",
            "a plugin named {PREFIXO_DA_CAMPANHA:?} cannot declare effects: that name belongs to the campaign's own effects"
        )));
    }

    for efeito in &c.efeitos {
        validar_efeito(efeito)?;
    }

    for pagina in &c.paginas {
        if !caminho_relativo_seguro(&pagina.arquivo)
            || !pagina.arquivo.to_ascii_lowercase().ends_with(".html")
        {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "a pagina {:?} aponta para {:?}; tem de ser um .html dentro da pasta",
                "the page {:?} points to {:?}; it must be an .html file inside the folder",
                pagina.id,
                pagina.arquivo
            )));
        }
    }

    let mut vistos: Vec<&str> = Vec::new();
    for substituto in &c.substitutos {
        if !alvo_de_substituto_valido(&substituto.alvo) {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "o substituto aponta para {:?}; use `secao:{{{}}}` ou `janela:{{{}}}`",
                "the replacement points to {:?}; use `secao:{{{}}}` or `janela:{{{}}}`",
                substituto.alvo,
                SECOES_DE_FABRICA.join("|"),
                JANELAS_DE_FABRICA.join("|")
            )));
        }
        if vistos.contains(&substituto.alvo.as_str()) {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "o substituto {:?} aparece duas vezes",
                "the replacement {:?} appears twice",
                substituto.alvo
            )));
        }
        vistos.push(&substituto.alvo);
    }

    Ok(())
}

/// Uma grade de quadros que faz sentido: inteira, cheia, com fps de 1 a 60.
fn quadros_validos(quadros: &Quadros) -> bool {
    quadros.colunas > 0
        && quadros.total > 0
        && quadros.total % quadros.colunas == 0
        && quadros
            .fps
            .map_or(true, |fps| fps.is_finite() && (1.0..=60.0).contains(&fps))
}

/// A imagem animada: grade valida, mipmaps com o lado em numero. O caminho de
/// cada imagem e conferido junto com as outras, em `Efeito::imagens`.
fn imagem_animada_valida(imagem: &ImagemAnimada, campo: &str) -> Result<(), crate::error::Texto> {
    if imagem.quadros.as_ref().is_some_and(|quadros| !quadros_validos(quadros)) {
        return Err(crate::texto!(
            "tem `{campo}.quadros` torto: o total e multiplo das colunas, e o fps vai de 1 a 60",
            "has a malformed `{campo}.quadros`: `total` must be a multiple of `colunas`, and `fps` goes from 1 to 60"
        ));
    }
    if let Some(mipmaps) = &imagem.mipmaps {
        if mipmaps
            .keys()
            .any(|lado| lado.parse::<u32>().map_or(true, |lado| lado == 0))
        {
            return Err(crate::texto!(
                "tem `{campo}.mipmaps` com um lado que nao e numero",
                "has `{campo}.mipmaps` with a size that is not a number"
            ));
        }
    }
    Ok(())
}

/// O bloco `area` e o `base`, com numeros que fazem sentido. Os limites sao os
/// mesmos que o TS prende ao desenhar -- ver `escalaDoFoco`, `divisoesDoEfeito`
/// e `baseDoEfeito`.
fn validar_area(
    area: Option<&AreaDoEfeito>,
    base: Option<&BaseDoEfeito>,
) -> Result<(), crate::error::Texto> {
    let entre = |valor: Option<f64>, min: f64, max: f64| {
        valor.map_or(true, |v| v.is_finite() && (min..=max).contains(&v))
    };

    if let Some(area) = area {
        if area.cor.as_deref().is_some_and(|cor| !cor_hex_valida(cor)) {
            return Err(crate::texto!(
                "tem `area.cor` que nao e uma cor #rrggbb",
                "has `area.cor` that is not a #rrggbb color"
            ));
        }
        if !entre(area.escala, 1.0, 2.5) {
            return Err(crate::texto!(
                "tem `area.escala` fora de 1 a 2,5",
                "has `area.escala` out of range (1 to 2.5)"
            ));
        }
        if !entre(area.divisoes, 1.0, 4.0) {
            return Err(crate::texto!(
                "tem `area.divisoes` fora de 1 a 4",
                "has `area.divisoes` out of range (1 to 4)"
            ));
        }
        if !entre(area.densidade, 0.0, 16.0) {
            return Err(crate::texto!(
                "tem `area.densidade` fora de 0 a 16",
                "has `area.densidade` out of range (0 to 16)"
            ));
        }
        if let Some(foco) = &area.foco {
            imagem_animada_valida(foco, "area.foco")?;
        }
    }

    if let Some(base) = base {
        imagem_animada_valida(&base.imagem, "base")?;
        if !entre(base.opacidade, 0.0, 1.0) || !entre(base.escurece, 0.0, 1.0) {
            return Err(crate::texto!(
                "tem `base.opacidade` ou `base.escurece` fora de 0 a 1",
                "has `base.opacidade` or `base.escurece` out of range (0 to 1)"
            ));
        }
        if !entre(base.escala, 0.5, 4.0) {
            return Err(crate::texto!(
                "tem `base.escala` fora de 0,5 a 4",
                "has `base.escala` out of range (0.5 to 4)"
            ));
        }
    }

    Ok(())
}

/// Um efeito desenha alguma coisa, com numeros que fazem sentido?
///
/// Efeito que nao mexe em nada seria uma opcao no seletor que, escolhida, nao
/// muda a figura -- e o mestre procuraria o defeito na mesa.
fn validar_efeito(efeito: &Efeito) -> AppResult<()> {
    // O motivo chega nas duas linguas e ganha o sujeito em cada uma; por isso
    // o `Texto` montado a mao, e nao o `texto!`, que usa os mesmos argumentos.
    let invalido = |motivo: crate::error::Texto| {
        Err(AppError::ExtensaoInvalida(crate::error::Texto {
            pt: format!("o efeito {:?} {}", efeito.id, motivo.pt),
            en: format!("the effect {:?} {}", efeito.id, motivo.en),
        }))
    };

    if efeito
        .dica
        .as_ref()
        .is_some_and(|dica| dica.maior_comprimento() > MAX_DICA_DO_EFEITO)
    {
        return invalido(crate::texto!(
            "tem dica maior que {MAX_DICA_DO_EFEITO} letras",
            "has a `dica` longer than {MAX_DICA_DO_EFEITO} characters"
        ));
    }

    if !efeito.faz_algo() {
        return invalido(crate::texto!(
            "nao desenha nada: declare `figura`, `externo`, `interno`, `luz`, `particulas`, `area.foco` ou `base`",
            "draws nothing: declare `figura`, `externo`, `interno`, `luz`, `particulas`, `area.foco` or `base`"
        ));
    }

    if let Some(particulas) = &efeito.particulas {
        if !particulas.is_object() {
            return invalido(crate::texto!(
                "tem `particulas` que nao e um objeto",
                "has `particulas` that is not an object"
            ));
        }
    }

    if let Err(motivo) = validar_area(efeito.area.as_ref(), efeito.base.as_ref()) {
        return invalido(motivo);
    }

    let fracao = |valor: Option<f64>| valor.map_or(true, |v| v.is_finite() && (0.0..=1.0).contains(&v));

    if let Some(figura) = &efeito.figura {
        if !fracao(figura.tinta) {
            return invalido(crate::texto!(
                "tem `tinta` fora de 0 a 1",
                "has `tinta` out of range (0 to 1)"
            ));
        }
    }

    for imagem in efeito.imagens() {
        let raster = imagem
            .rsplit_once('.')
            .is_some_and(|(_, ext)| IMAGENS_DE_MEDIDOR.contains(&ext.to_ascii_lowercase().as_str()));
        if !caminho_relativo_seguro(imagem) || !raster {
            return invalido(crate::texto!(
                "aponta para {imagem:?}; tem de ser {} dentro da pasta",
                "points to {imagem:?}; it must be a {} file inside the folder",
                IMAGENS_DE_MEDIDOR.join("/")
            ));
        }
    }

    if let Some(externo) = &efeito.externo {
        if let Some(tamanho) = externo.tamanho {
            if !tamanho.is_finite()
                || !(TAMANHO_DO_EXTERNO_MIN..=TAMANHO_DO_EXTERNO_MAX).contains(&tamanho)
            {
                return invalido(crate::texto!(
                    "tem `externo.tamanho` fora de {TAMANHO_DO_EXTERNO_MIN} a {TAMANHO_DO_EXTERNO_MAX}",
                    "has `externo.tamanho` out of range ({TAMANHO_DO_EXTERNO_MIN} to {TAMANHO_DO_EXTERNO_MAX})"
                ));
            }
        }
        if !fracao(externo.opacidade) {
            return invalido(crate::texto!(
                "tem `externo.opacidade` fora de 0 a 1",
                "has `externo.opacidade` out of range (0 to 1)"
            ));
        }
        for (campo, valor, aceitos) in [
            ("lado", &externo.lado, LADOS),
            ("ancora", &externo.ancora, ANCORAS),
        ] {
            if let Some(valor) = valor {
                if !aceitos.contains(&valor.as_str()) {
                    return invalido(crate::texto!(
                        "pede `externo.{campo}` {valor:?}; os valores sao {}",
                        "sets `externo.{campo}` to {valor:?}; the options are {}",
                        aceitos.join(", ")
                    ));
                }
            }
        }
        if let Some(animacao) = &externo.animacao {
            if !ANIMACOES.contains(&animacao.tipo.as_str()) {
                return invalido(crate::texto!(
                    "pede a animacao {:?}; as animacoes sao {}",
                    "asks for the animation {:?}; the animations are {}",
                    animacao.tipo,
                    ANIMACOES.join(", ")
                ));
            }
            if let Some(periodo) = animacao.periodo {
                if !periodo.is_finite() || !(PERIODO_MIN..=PERIODO_MAX).contains(&periodo) {
                    return invalido(crate::texto!(
                        "tem `periodo` fora de {PERIODO_MIN} a {PERIODO_MAX} segundos",
                        "has `periodo` out of range ({PERIODO_MIN} to {PERIODO_MAX} seconds)"
                    ));
                }
            }
            if !fracao(animacao.intensidade) {
                return invalido(crate::texto!(
                    "tem `intensidade` fora de 0 a 1",
                    "has `intensidade` out of range (0 to 1)"
                ));
            }
        }
    }

    if let Some(interno) = &efeito.interno {
        if !fracao(interno.forca) {
            return invalido(crate::texto!(
                "tem `interno.forca` fora de 0 a 1",
                "has `interno.forca` out of range (0 to 1)"
            ));
        }
    }

    if let Some(luz) = &efeito.luz {
        if !luz.raio.is_finite() || !(RAIO_DA_LUZ_MIN..=RAIO_DA_LUZ_MAX).contains(&luz.raio) {
            return invalido(crate::texto!(
                "tem `luz.raio` fora de {RAIO_DA_LUZ_MIN} a {RAIO_DA_LUZ_MAX} vezes a figura",
                "has `luz.raio` out of range ({RAIO_DA_LUZ_MIN} to {RAIO_DA_LUZ_MAX} times the figure)"
            ));
        }
        if !fracao(luz.intensidade) {
            return invalido(crate::texto!(
                "tem `luz.intensidade` fora de 0 a 1",
                "has `luz.intensidade` out of range (0 to 1)"
            ));
        }
        if luz.cor.as_deref().is_some_and(|cor| !cor_hex_valida(cor)) {
            return invalido(crate::texto!(
                "tem `luz.cor` que nao e uma cor `#rrggbb`",
                "has `luz.cor` that is not a `#rrggbb` color"
            ));
        }
        if let Some(movimento) = &luz.efeito {
            if !EFEITOS_DA_LUZ.contains(&movimento.as_str()) {
                return invalido(crate::texto!(
                    "pede `luz.efeito` {movimento:?}; os efeitos sao {}",
                    "sets `luz.efeito` to {movimento:?}; the options are {}",
                    EFEITOS_DA_LUZ.join(", ")
                ));
            }
        }
    }

    Ok(())
}

/// Um estilo de medidor desenha alguma coisa, e so com o que e da pasta?
///
/// So a FORMA do que foi declarado: o arquivo existir e caber no teto e da
/// importacao (`validar_imagens_declaradas`). Aqui roda a cada leitura do
/// manifesto, e um arquivo apagado por fora nao pode tirar o plugin da lista
/// -- e na lista que fica o botao de desinstalar.
fn validar_estilo(estilo: &EstiloDeMedidor) -> AppResult<()> {
    // Como em `validar_efeito`: o sujeito entra em cada lingua do motivo.
    let invalido = |motivo: crate::error::Texto| {
        Err(AppError::ExtensaoInvalida(crate::error::Texto {
            pt: format!("o estilo {:?} {}", estilo.id, motivo.pt),
            en: format!("the meter style {:?} {}", estilo.id, motivo.en),
        }))
    };

    if !estilo.altura.is_finite() || !(ALTURA_MIN..=ALTURA_MAX).contains(&estilo.altura) {
        return invalido(crate::texto!(
            "tem de ter altura entre {ALTURA_MIN} e {ALTURA_MAX}",
            "must have `altura` between {ALTURA_MIN} and {ALTURA_MAX}"
        ));
    }

    if let Some(rotulo) = &estilo.rotulo {
        if !ROTULOS.contains(&rotulo.as_str()) {
            return invalido(crate::texto!(
                "pede o rotulo {rotulo:?}; os rotulos sao {}",
                "sets `rotulo` to {rotulo:?}; the options are {}",
                ROTULOS.join(", ")
            ));
        }
    }

    match (&estilo.arquivo, &estilo.camadas) {
        (Some(arquivo), None) => {
            if !caminho_relativo_seguro(arquivo) || !arquivo.to_ascii_lowercase().ends_with(".svg")
            {
                return invalido(crate::texto!(
                    "aponta para {arquivo:?}; tem de ser um .svg dentro da pasta",
                    "points to {arquivo:?}; it must be an .svg file inside the folder"
                ));
            }
        }
        (None, Some(camadas)) => {
            let encaixes = camadas.encaixe.iter().chain(
                camadas
                    .texto
                    .iter()
                    .filter_map(|texto| texto.encaixe.as_ref()),
            );
            for encaixe in encaixes {
                if !encaixe_cabe(encaixe) {
                    return invalido(crate::texto!(
                        "tem um encaixe fora da forma; x, y, largura e altura sao fracoes de 0 a 1",
                        "has an `encaixe` outside the shape; x, y, largura and altura are fractions from 0 to 1"
                    ));
                }
            }

            if let Some(texto) = &camadas.texto {
                for cor in texto.cor.iter().chain(texto.contorno.iter()) {
                    if !cor_hex_valida(cor) {
                        return invalido(crate::texto!(
                            "pede a cor {cor:?} no texto; use hex, como #fff ou #1a0d0dcc",
                            "uses the color {cor:?} in `texto`; use hex, like #fff or #1a0d0dcc"
                        ));
                    }
                }
                if let Some(tamanho) = texto.tamanho {
                    if !tamanho.is_finite()
                        || !(TAMANHO_DO_TEXTO_MIN..=TAMANHO_DO_TEXTO_MAX).contains(&tamanho)
                    {
                        return invalido(crate::texto!(
                            "tem um texto de tamanho {tamanho}; vai de {TAMANHO_DO_TEXTO_MIN} a {TAMANHO_DO_TEXTO_MAX}",
                            "has a `texto` of size {tamanho}; the range is {TAMANHO_DO_TEXTO_MIN} to {TAMANHO_DO_TEXTO_MAX}"
                        ));
                    }
                }
            }

            if let Conteudo::Sequencia { quadros } = &camadas.conteudo {
                if !(2..=QUADROS_MAX).contains(&quadros.len()) {
                    return invalido(crate::texto!(
                        "tem uma sequencia de {} quadros; vai de 2 a {QUADROS_MAX}",
                        "has a sequence of {} frames; the range is 2 to {QUADROS_MAX}",
                        quadros.len()
                    ));
                }
            }

            for imagem in estilo.imagens() {
                let extensao = imagem.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase());
                let e_imagem = extensao.is_some_and(|e| IMAGENS_DE_MEDIDOR.contains(&e.as_str()));
                if !caminho_relativo_seguro(imagem) || !e_imagem {
                    return invalido(crate::texto!(
                        "aponta para {imagem:?}; tem de ser uma imagem dentro da pasta ({})",
                        "points to {imagem:?}; it must be an image inside the folder ({})",
                        IMAGENS_DE_MEDIDOR.join(", ")
                    ));
                }
            }
        }
        (Some(_), Some(_)) => {
            return invalido(crate::texto!(
                "declara `arquivo` e `camadas`; escolha um dos dois",
                "declares both `arquivo` and `camadas`; pick one"
            ));
        }
        (None, None) => {
            return invalido(crate::texto!(
                "nao declara `arquivo` (.svg) nem `camadas`",
                "declares neither `arquivo` (.svg) nor `camadas`"
            ));
        }
    }

    Ok(())
}

/// As imagens dos estilos e dos efeitos existem e cabem no teto?
///
/// Na IMPORTACAO, e nao em `ler_manifesto`: e o momento em que o autor ainda
/// esta olhando para a pasta, e o erro diz qual arquivo faltou. Depois disso
/// uma imagem que some e so um medidor sem moldura, ou um fogo que nao
/// aparece -- o daemon responde 404 e a TV desenha o resto.
fn validar_imagens_declaradas(pasta: &Path, manifesto: &Manifesto) -> AppResult<()> {
    for (dono, imagem) in manifesto.contribui.imagens_servidas() {
        // `symlink_metadata`: a copia pula link simbolico, e uma imagem que
        // fosse link passaria aqui e faltaria na pasta instalada.
        let tamanho = std::fs::symlink_metadata(pasta.join(imagem))
            .ok()
            .filter(|meta| meta.is_file())
            .map(|meta| meta.len());

        match tamanho {
            // O `dono` ja vem nas duas linguas: o `Texto` e montado a mao.
            None => {
                return Err(AppError::ExtensaoInvalida(crate::error::Texto {
                    pt: format!("{} aponta para {imagem:?}, que nao esta na pasta", dono.pt),
                    en: format!(
                        "{} points to {imagem:?}, which is not in the folder",
                        dono.en
                    ),
                }));
            }
            Some(bytes) if bytes > IMAGEM_DE_MEDIDOR_MAX => {
                return Err(AppError::ExtensaoInvalida(crate::error::Texto {
                    pt: format!(
                        "a imagem {imagem:?} ({}) tem {} KB; o teto e {} KB",
                        dono.pt,
                        bytes / 1024,
                        IMAGEM_DE_MEDIDOR_MAX / 1024
                    ),
                    en: format!(
                        "the image {imagem:?} ({}) is {} KB; the limit is {} KB",
                        dono.en,
                        bytes / 1024,
                        IMAGEM_DE_MEDIDOR_MAX / 1024
                    ),
                }));
            }
            Some(_) => {}
        }
    }

    Ok(())
}

/// As configuracoes declaradas fazem sentido?
///
/// Nao exigem `principal`: sao declarativas, e um tema pode ter uma. Ficam
/// fora de `declarou_algo` por isso.
fn validar_configuracoes(manifesto: &Manifesto) -> AppResult<()> {
    let lista = &manifesto.contribui.configuracoes;

    if lista.len() > MAX_CONTRIBUICOES {
        return Err(AppError::ExtensaoInvalida(crate::texto!(
            "`configuracoes` declara {} itens; o teto e {MAX_CONTRIBUICOES}",
            "`configuracoes` declares {} items; the limit is {MAX_CONTRIBUICOES}",
            lista.len()
        )));
    }

    let prefixo = format!("{}.", manifesto.id);
    let mut vistas: Vec<&str> = Vec::new();

    for c in lista {
        // O prefixo e a cerca: `cor` viraria disputa entre plugins, e
        // `ato20.zoom` deixaria um plugin redefinir o padrao do aplicativo.
        let nome = c.chave.strip_prefix(&prefixo).ok_or_else(|| {
            AppError::ExtensaoInvalida(crate::texto!(
                "a chave {:?} tem de comecar com {prefixo:?}",
                "the key {:?} must start with {prefixo:?}",
                c.chave
            ))
        })?;

        // O que vem depois do prefixo segue a regra do slug, com o ponto a
        // mais para agrupar: `meu-plugin.dados.cor`.
        if nome.is_empty()
            || !nome
                .split('.')
                .all(|parte| !parte.is_empty() && id_valido(parte))
        {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "a chave {:?} nao serve: depois do prefixo, so minusculas, digitos, hifen e ponto",
                "the key {:?} is not valid: after the prefix, only lowercase letters, digits, hyphens and dots",
                c.chave
            )));
        }

        if c.titulo.vazio() {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "a configuracao {:?} esta sem titulo",
                "the setting {:?} has no `titulo`",
                c.chave
            )));
        }

        if vistas.contains(&c.chave.as_str()) {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "a chave {:?} aparece duas vezes",
                "the key {:?} appears twice",
                c.chave
            )));
        }
        vistas.push(&c.chave);

        // O padrao tem de ser do tipo declarado: e ele que a tela mostra
        // quando ninguem mexeu, e um `padrao: "sim"` num booleano desenharia
        // uma chave sem estado.
        let do_tipo = match c.tipo {
            TipoConfiguracao::Booleano => c.padrao.is_boolean(),
            TipoConfiguracao::Numero => c.padrao.is_number(),
            TipoConfiguracao::Texto => c.padrao.is_string(),
            TipoConfiguracao::Escolha => c.padrao.is_string(),
            TipoConfiguracao::Lista => c
                .padrao
                .as_array()
                .is_some_and(|itens| itens.iter().all(|item| item.is_string())),
        };
        if !do_tipo {
            return Err(AppError::ExtensaoInvalida(crate::texto!(
                "o padrao de {:?} nao e do tipo declarado",
                "the `padrao` of {:?} does not match its `tipo`",
                c.chave
            )));
        }

        match c.tipo {
            TipoConfiguracao::Escolha => {
                if c.opcoes.is_empty() {
                    return Err(AppError::ExtensaoInvalida(crate::texto!(
                        "a escolha {:?} nao tem opcoes",
                        "the choice {:?} has no `opcoes`",
                        c.chave
                    )));
                }
                let padrao = c.padrao.as_str().unwrap_or_default();
                if !c.opcoes.iter().any(|o| o == padrao) {
                    return Err(AppError::ExtensaoInvalida(crate::texto!(
                        "o padrao de {:?} nao esta entre as opcoes",
                        "the `padrao` of {:?} is not one of its `opcoes`",
                        c.chave
                    )));
                }
            }
            TipoConfiguracao::Numero => {
                let padrao = c.padrao.as_f64().unwrap_or_default();
                if let (Some(min), Some(max)) = (c.minimo, c.maximo) {
                    if min > max {
                        return Err(AppError::ExtensaoInvalida(crate::texto!(
                            "o intervalo de {:?} esta invertido",
                            "the range of {:?} is reversed (`minimo` above `maximo`)",
                            c.chave
                        )));
                    }
                }
                if c.minimo.is_some_and(|min| padrao < min)
                    || c.maximo.is_some_and(|max| padrao > max)
                {
                    return Err(AppError::ExtensaoInvalida(crate::texto!(
                        "o padrao de {:?} esta fora do intervalo",
                        "the `padrao` of {:?} is outside its range",
                        c.chave
                    )));
                }
            }
            _ => {}
        }

        // Rotulo de opcao que nao existe e erro de digitacao na chave: a
        // opcao de verdade apareceria com o valor cru, e o autor nao veria
        // por que. Fora de `escolha` nao ha opcoes, e qualquer rotulo cai aqui.
        for (opcao, rotulo) in &c.rotulos {
            if !c.opcoes.contains(opcao) {
                return Err(AppError::ExtensaoInvalida(crate::texto!(
                    "o rotulo {opcao:?} de {:?} nao esta entre as opcoes",
                    "the `rotulos` entry {opcao:?} of {:?} is not one of its `opcoes`",
                    c.chave
                )));
            }
            if rotulo.vazio() {
                return Err(AppError::ExtensaoInvalida(crate::texto!(
                    "o rotulo da opcao {opcao:?} de {:?} esta vazio",
                    "the label of option {opcao:?} in {:?} is empty",
                    c.chave
                )));
            }
        }
    }

    Ok(())
}

/// Uma fonte de retrato serve?
///
/// Recusa na IMPORTACAO, e nao na hora de desenhar: um molde sem `{codigo}`
/// produziria a mesma URL para todo personagem, e descobrir isso com a mesa
/// montada custa a sessao. Aqui o dialogo de escolher pasta ainda esta na
/// cabeca de quem clicou.
fn validar_fonte(fonte: &FonteRetrato) -> AppResult<()> {
    if !id_valido(&fonte.fonte) {
        return Err(AppError::ExtensaoInvalida(crate::texto!(
            "a fonte de retrato {:?} nao serve: so minusculas, digitos e hifen",
            "the portrait source {:?} is not valid: only lowercase letters, digits and hyphens",
            fonte.fonte
        )));
    }

    // `https` e nao `http`: a pagina e embutida na janela do Mestre e nas
    // telas da mesa, e uma origem em texto claro na rede de casa e alcancavel
    // por quem estiver nela. Nao e o modelo de ameaca deste projeto, mas
    // recusar aqui custa uma linha.
    if !fonte.modelo.starts_with("https://") {
        return Err(AppError::ExtensaoInvalida(crate::texto!(
            "o modelo da fonte {:?} precisa comecar com https://",
            "the `modelo` of source {:?} must start with https://",
            fonte.fonte
        )));
    }

    if !fonte.modelo.contains("{codigo}") {
        return Err(AppError::ExtensaoInvalida(crate::texto!(
            "o modelo da fonte {:?} nao tem {{codigo}}, entao daria a mesma URL para todo personagem",
            "the `modelo` of source {:?} has no {{codigo}}, so every character would get the same URL",
            fonte.fonte
        )));
    }

    if fonte.largura == 0
        || fonte.altura == 0
        || fonte.largura > CANVAS_MAX
        || fonte.altura > CANVAS_MAX
    {
        return Err(AppError::ExtensaoInvalida(crate::texto!(
            "o canvas da fonte {:?} precisa estar entre 1 e {CANVAS_MAX}",
            "the canvas of source {:?} must be between 1 and {CANVAS_MAX}",
            fonte.fonte
        )));
    }

    Ok(())
}

/// Um caminho de dentro da extensao pode ser servido?
///
/// Relativo, sem `..`, sem raiz e sem barra invertida. A barra invertida entra
/// na lista porque o Windows a trata como separador e um `..\\` passaria pela
/// checagem de `..` feita por segmento de `/`.
///
/// Vazio e recusado: ele juntaria ao diretorio e daria a PASTA, e servir um
/// diretorio como arquivo e o tipo de coisa que responde algo estranho em vez
/// de 404.
pub fn caminho_relativo_seguro(rel: &str) -> bool {
    !rel.is_empty()
        && !rel.starts_with('/')
        && !rel.contains('\\')
        && !rel.contains('\0')
        && rel.split('/').all(|parte| parte != ".." && parte != "")
}

/// O arquivo de uma extensao, se o pedido for legitimo.
///
/// `None` -- e nao um caminho que depois falha ao abrir -- porque quem chama e
/// o protocolo, e ele precisa responder 404 igual para id torto e para arquivo
/// ausente. Distinguir os dois na resposta contaria quais extensoes existem.
pub fn caminho_do_arquivo(dir: &Path, id: &str, rel: &str) -> Option<PathBuf> {
    if !id_valido(id) || !caminho_relativo_seguro(rel) {
        return None;
    }

    let caminho = dir.join(id).join(rel);

    // A checagem de forma acima ja impede a travessia, e esta segunda existe
    // para o caso que ela nao ve: um LINK SIMBOLICO dentro da pasta da
    // extensao, que e caminho legitimo na forma e aponta para fora no disco.
    // `canonicalize` resolve o link e falha se o arquivo nao existe, que e o
    // mesmo `None` de qualquer outro pedido que nao se atende.
    let real = caminho.canonicalize().ok()?;
    let raiz = dir.canonicalize().ok()?;

    if !real.starts_with(&raiz) || !real.is_file() {
        return None;
    }

    Some(real)
}

/// O que esta instalado, lido do disco.
///
/// Pasta com manifesto quebrado e PULADA, com aviso no log, e nao derruba a
/// lista: uma extensao mal escrita nao pode esconder as outras -- inclusive
/// porque a tela de onde se desinstala e essa mesma lista, e uma lista vazia
/// deixaria a extensao ruim sem caminho de saida.
pub fn listar(dir: &Path) -> AppResult<Vec<Manifesto>> {
    let leitura = match std::fs::read_dir(dir) {
        Ok(leitura) => leitura,
        // Diretorio ausente e o estado de quem nunca instalou nada. Ele nasce
        // na primeira importacao, e nao na abertura do aplicativo, para nao
        // deixar uma pasta vazia na maquina de quem nunca vai usar isto.
        Err(cause) if cause.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(cause) => return Err(cause.into()),
    };

    let mut achadas = Vec::new();

    for entrada in leitura.flatten() {
        let pasta = entrada.path();
        if !pasta.is_dir() {
            continue;
        }

        let nome_da_pasta = entrada.file_name().to_string_lossy().to_string();

        match ler_manifesto(&pasta) {
            // O id do manifesto TEM de ser o nome da pasta. E dele que sai a
            // URL do protocolo, entao dois discordando dariam uma extensao
            // listada cujo tema nunca carrega.
            Ok(manifesto) if manifesto.id == nome_da_pasta => achadas.push(manifesto),
            Ok(manifesto) => log::warn!(
                "extensao em {nome_da_pasta:?} se diz {:?}; ignorada",
                manifesto.id
            ),
            Err(cause) => log::warn!("extensao em {nome_da_pasta:?} ignorada: {cause}"),
        }
    }

    // Por nome, e nao na ordem do `read_dir`, que e a do sistema de arquivos e
    // muda sozinha: lista que se reordena entre duas aberturas faz o usuario
    // procurar de novo o que ele ja tinha achado.
    achadas.sort_by(|a, b| {
        a.nome
            .principal()
            .to_lowercase()
            .cmp(&b.nome.principal().to_lowercase())
    });

    Ok(achadas)
}

/// Copia uma pasta de fora para `extensoes/`.
///
/// Copia, e nao aponta para o lugar de origem, pela mesma razao da estante: uma
/// extensao aberta de um pendrive ou de uma pasta que o usuario reorganiza
/// depois viraria um vinculo morto, e a falha apareceria na proxima abertura do
/// aplicativo -- longe do gesto que a causou.
///
/// SOBRESCREVE se o id ja existe, ao contrario do import de campanha, que
/// recusa. A diferenca e o que esta em jogo: campanha importada por cima apaga
/// cenas que so existem ali, e extensao nao guarda nada dentro de si -- o que o
/// usuario acumulou vive no `localStorage` e na cena. Sobrescrever e como se
/// ATUALIZA uma extensao, e recusar obrigaria a desinstalar antes de instalar a
/// versao nova.
pub fn importar(dir: &Path, origem: &Path) -> AppResult<Manifesto> {
    let manifesto = ler_manifesto(origem)?;
    validar_imagens_declaradas(origem, &manifesto)?;

    let destino = dir.join(&manifesto.id);

    // Instalar por cima de si mesma apagaria a origem no meio da copia.
    if origem.canonicalize().ok() == destino.canonicalize().ok() {
        return Ok(manifesto);
    }

    std::fs::create_dir_all(dir)?;

    // Apaga antes de copiar, e nao mescla: a versao nova de uma extensao pode
    // ter menos arquivos que a antiga, e mesclar deixaria o arquivo removido
    // servindo para sempre. E a mesma armadilha do `clean:web-resources`, que
    // ja custou um bug neste projeto.
    if destino.exists() {
        std::fs::remove_dir_all(&destino)?;
    }

    copiar_arvore(origem, &destino)?;

    Ok(manifesto)
}

/// Copia recursiva, pulando link simbolico.
///
/// O link e pulado e nao seguido porque seguir traz o ALVO para dentro de
/// `extensoes/`, e o alvo pode ser `~/.ssh`. Depois de copiado ele seria um
/// arquivo comum na pasta da extensao, que o protocolo serve sem nada estranho
/// a notar -- a travessia aconteceria na importacao, longe de onde ela apareceria.
fn copiar_arvore(origem: &Path, destino: &Path) -> AppResult<()> {
    std::fs::create_dir_all(destino)?;

    for entrada in std::fs::read_dir(origem)? {
        let entrada = entrada?;
        let tipo = entrada.file_type()?;

        if tipo.is_symlink() {
            log::warn!("link simbolico pulado na importacao: {:?}", entrada.path());
            continue;
        }

        let alvo = destino.join(entrada.file_name());

        if tipo.is_dir() {
            copiar_arvore(&entrada.path(), &alvo)?;
        } else {
            std::fs::copy(entrada.path(), &alvo)?;
        }
    }

    Ok(())
}

/// Apaga a pasta da extensao.
///
/// Pasta que ja nao esta la nao e erro, pelo mesmo motivo da estante: quem tira
/// a extensao da lista e o registro sair do banco, e falhar aqui deixaria uma
/// linha impossivel de remover pela tela.
pub fn remover(dir: &Path, id: &str) -> AppResult<()> {
    if !id_valido(id) {
        return Err(AppError::ExtensaoInvalida(crate::texto!(
            "id invalido: {id:?}",
            "invalid id: {id:?}"
        )));
    }

    match std::fs::remove_dir_all(dir.join(id)) {
        Ok(()) => Ok(()),
        Err(cause) if cause.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(cause) => Err(cause.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn escrever(pasta: &Path, nome: &str, conteudo: &str) {
        std::fs::create_dir_all(pasta).unwrap();
        std::fs::write(pasta.join(nome), conteudo).unwrap();
    }

    fn manifesto_de(id: &str) -> String {
        format!(
            r#"{{"id":"{id}","nome":"Tema {id}","versao":"1.0.0","apiVersao":1,"tema":"tema.css"}}"#
        )
    }

    /// Uma extensao pronta numa pasta de origem.
    fn origem(base: &Path, id: &str) -> PathBuf {
        let pasta = base.join(format!("origem-{id}"));
        escrever(&pasta, MANIFESTO, &manifesto_de(id));
        escrever(&pasta, "tema.css", ":root{--background:#000}");
        pasta
    }

    #[test]
    fn id_de_extensao_nao_escapa_do_diretorio() {
        assert!(id_valido("pergaminho"));
        assert!(id_valido("dados-fudge"));
        assert!(id_valido("tema2"));

        // O que a importacao e o protocolo tem de recusar antes de juntar ao
        // diretorio. O ponto fora da lista e o que mata `..` de graca.
        assert!(!id_valido(".."));
        assert!(!id_valido("../../etc/passwd"));
        assert!(!id_valido("tema/../../ato20.db"));
        assert!(!id_valido("tema.css"));
        assert!(!id_valido("Pergaminho"));
        assert!(!id_valido("tema extensao"));
        assert!(!id_valido(""));
        assert!(!id_valido(&"a".repeat(65)));
    }

    #[test]
    fn caminho_de_dentro_da_extensao_nao_sobe() {
        assert!(caminho_relativo_seguro("tema.css"));
        assert!(caminho_relativo_seguro("css/tema.css"));

        assert!(!caminho_relativo_seguro("../manifest.json"));
        assert!(!caminho_relativo_seguro("css/../../ato20.db"));
        assert!(!caminho_relativo_seguro("/etc/passwd"));
        assert!(!caminho_relativo_seguro("..\\ato20.db"));
        assert!(!caminho_relativo_seguro("css//tema.css"));
        assert!(!caminho_relativo_seguro(""));
    }

    #[test]
    fn api_do_futuro_e_recusada_com_o_numero() {
        let base = tempfile::tempdir().unwrap();
        let pasta = base.path().join("futura");
        escrever(
            &pasta,
            MANIFESTO,
            r#"{"id":"futura","nome":"Futura","versao":"1.0.0","apiVersao":99}"#,
        );

        let erro = ler_manifesto(&pasta).unwrap_err();

        // O numero tem de sobreviver ate a tela: "atualize o ATO20" so e uma
        // resposta util quando diz o que a extensao pediu.
        assert!(
            matches!(erro, AppError::ExtensaoIncompativel { pede: 99, temos } if temos == API_VERSAO)
        );
    }

    #[test]
    fn as_duas_versoes_da_api_sao_aceitas() {
        let base = tempfile::tempdir().unwrap();

        // O compromisso da API: subir a versao nao pode recusar quem pede a
        // anterior. Um tema escrito para a 1 continua instalando na 2.
        for versao in 1..=API_VERSAO {
            let pasta = base.path().join(format!("v{versao}"));
            escrever(
                &pasta,
                MANIFESTO,
                &format!(
                    r#"{{"id":"v{versao}","nome":"V","versao":"1.0.0","apiVersao":{versao}}}"#
                ),
            );

            assert_eq!(ler_manifesto(&pasta).unwrap().api_versao, versao);
        }
    }

    #[test]
    fn manifesto_que_aponta_para_fora_e_recusado() {
        let base = tempfile::tempdir().unwrap();
        let pasta = base.path().join("safada");
        escrever(
            &pasta,
            MANIFESTO,
            r#"{"id":"safada","nome":"Safada","versao":"1.0.0","apiVersao":1,"tema":"../../../etc/passwd"}"#,
        );

        assert!(matches!(
            ler_manifesto(&pasta).unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    /// Um manifesto com uma fonte de retrato, e o campo que se quer quebrar.
    fn com_fonte(campo: &str, valor: &str) -> String {
        let base = r#""fonte":"cris","rotulo":"C.R.I.S.","modelo":"https://exemplo.com/s/{codigo}","campo":"Codigo","largura":1920,"altura":1100"#;
        let trocado = match campo {
            "fonte" => base.replace(r#""fonte":"cris""#, &format!(r#""fonte":"{valor}""#)),
            "modelo" => base.replace(
                r#""modelo":"https://exemplo.com/s/{codigo}""#,
                &format!(r#""modelo":"{valor}""#),
            ),
            "largura" => base.replace(r#""largura":1920"#, &format!(r#""largura":{valor}"#)),
            _ => base.to_string(),
        };

        format!(
            r#"{{"id":"fontes","nome":"Fontes","versao":"1.0.0","apiVersao":1,"retratos":[{{{trocado}}}]}}"#
        )
    }

    fn ler(base: &Path, json: &str) -> AppResult<Manifesto> {
        let pasta = base.join("fontes");
        escrever(&pasta, MANIFESTO, json);
        ler_manifesto(&pasta)
    }

    #[test]
    fn fonte_de_retrato_entra_inteira() {
        let base = tempfile::tempdir().unwrap();
        let manifesto = ler(base.path(), &com_fonte("", "")).unwrap();

        let fonte = &manifesto.retratos[0];
        assert_eq!(fonte.fonte, "cris");
        assert_eq!(fonte.largura, 1920);
        assert_eq!(fonte.altura, 1100);
        assert!(fonte.modelo.contains("{codigo}"));
    }

    #[test]
    fn extensao_sem_retratos_continua_valida() {
        let base = tempfile::tempdir().unwrap();
        // O campo e `default`: um tema nao escreve `"retratos": []` para ser lido.
        let manifesto = ler(
            base.path(),
            r#"{"id":"fontes","nome":"So tema","versao":"1.0.0","apiVersao":1,"tema":"tema.css"}"#,
        )
        .unwrap();

        assert!(manifesto.retratos.is_empty());
    }

    #[test]
    fn molde_sem_codigo_e_recusado() {
        let base = tempfile::tempdir().unwrap();

        // Sem `{codigo}` a URL seria a mesma para todo personagem, e descobrir
        // isso com a mesa montada custa a sessao.
        let erro = ler(
            base.path(),
            &com_fonte("modelo", "https://exemplo.com/stream/fixo"),
        )
        .unwrap_err();

        assert!(matches!(erro, AppError::ExtensaoInvalida(_)));
    }

    #[test]
    fn molde_sem_https_e_recusado() {
        let base = tempfile::tempdir().unwrap();

        assert!(matches!(
            ler(
                base.path(),
                &com_fonte("modelo", "http://exemplo.com/s/{codigo}")
            )
            .unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    #[test]
    fn canvas_absurdo_e_recusado() {
        let base = tempfile::tempdir().unwrap();

        // O numero vira o tamanho de um elemento que a webview aloca.
        for largura in ["0", "999999"] {
            assert!(
                matches!(
                    ler(base.path(), &com_fonte("largura", largura)).unwrap_err(),
                    AppError::ExtensaoInvalida(_)
                ),
                "largura {largura} passou"
            );
        }
    }

    #[test]
    fn id_de_fonte_segue_a_mesma_regra_do_id_de_extensao() {
        let base = tempfile::tempdir().unwrap();

        assert!(matches!(
            ler(base.path(), &com_fonte("fonte", "../escapa")).unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    /// Um manifesto com `contribui`, e o pedaco que se quer quebrar.
    fn com_contrib(corpo: &str) -> String {
        format!(
            r#"{{"id":"plug","nome":"Plug","versao":"1.0.0","apiVersao":1,"principal":"main.js","contribui":{corpo}}}"#
        )
    }

    #[test]
    fn contribuicoes_entram_inteiras() {
        let base = tempfile::tempdir().unwrap();
        let m = ler(
            base.path(),
            &com_contrib(
                r#"{"paineis":[{"id":"tabela","titulo":"Tabela"}],
                    "comandos":[{"id":"rolar","titulo":"Rolar","atalho":"Ctrl+Shift+F"}],
                    "ferramentas":[{"id":"pincel","titulo":"Pincel"}],
                    "camadas":[{"id":"grade","titulo":"Grade"}]}"#,
            ),
        )
        .unwrap();

        assert_eq!(m.contribui.paineis[0].id, "tabela");
        assert_eq!(
            m.contribui.comandos[0].atalho.as_deref(),
            Some("Ctrl+Shift+F")
        );
        assert_eq!(m.contribui.ferramentas[0].titulo, "Pincel");
        assert_eq!(m.contribui.camadas.len(), 1);
    }

    #[test]
    fn extensao_sem_contribuicoes_continua_valida() {
        let base = tempfile::tempdir().unwrap();
        // O campo e `default`: um tema nao escreve `"contribui": {}` para ser lido.
        let m = ler(
            base.path(),
            r#"{"id":"plug","nome":"So tema","versao":"1.0.0","apiVersao":1,"tema":"tema.css"}"#,
        )
        .unwrap();

        assert!(m.contribui.paineis.is_empty());
        assert!(m.contribui.comandos.is_empty());
    }

    #[test]
    fn declarar_sem_principal_e_recusado() {
        let base = tempfile::tempdir().unwrap();
        let pasta = base.path().join("plug");
        // Sem `principal`, a aba abriria vazia e o comando nao faria nada -- e a
        // causa estaria num arquivo que nao existe.
        escrever(
            &pasta,
            MANIFESTO,
            r#"{"id":"plug","nome":"Plug","versao":"1.0.0","apiVersao":1,
                "contribui":{"paineis":[{"id":"tabela","titulo":"Tabela"}]}}"#,
        );

        assert!(matches!(
            ler_manifesto(&pasta).unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    #[test]
    fn id_repetido_no_mesmo_grupo_e_recusado() {
        let base = tempfile::tempdir().unwrap();

        // Duas telas com o mesmo id disputariam a mesma chave de janela.
        assert!(matches!(
            ler(
                base.path(),
                &com_contrib(r#"{"paineis":[{"id":"t","titulo":"A"},{"id":"t","titulo":"B"}]}"#)
            )
            .unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    #[test]
    fn o_mesmo_id_em_grupos_diferentes_e_permitido() {
        let base = tempfile::tempdir().unwrap();

        // Um painel e uma ferramenta chamados `notas` sao coisas diferentes.
        let m = ler(
            base.path(),
            &com_contrib(
                r#"{"paineis":[{"id":"notas","titulo":"Notas"}],
                    "ferramentas":[{"id":"notas","titulo":"Notas"}]}"#,
            ),
        )
        .unwrap();

        assert_eq!(m.contribui.paineis[0].id, m.contribui.ferramentas[0].id);
    }

    #[test]
    fn contribuicoes_demais_no_mesmo_grupo_sao_recusadas() {
        let base = tempfile::tempdir().unwrap();

        // Cada painel vira uma linha na lista de telas; dez mil travariam a
        // lista antes de o mestre alcancar o interruptor do plugin.
        let paineis: Vec<String> = (0..=MAX_CONTRIBUICOES)
            .map(|i| format!(r#"{{"id":"p{i}","titulo":"P"}}"#))
            .collect();

        assert!(matches!(
            ler(
                base.path(),
                &com_contrib(&format!(r#"{{"paineis":[{}]}}"#, paineis.join(",")))
            )
            .unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    /// Um manifesto SEM `principal` com uma configuracao. Declarativa, entao
    /// nao precisa de modulo.
    fn com_config(corpo: &str) -> String {
        format!(
            r#"{{"id":"plug","nome":"Plug","versao":"1.0.0","apiVersao":2,"tema":"tema.css","contribui":{{"configuracoes":[{corpo}]}}}}"#
        )
    }

    #[test]
    fn configuracao_entra_inteira_e_sem_principal() {
        let base = tempfile::tempdir().unwrap();
        let m = ler(
            base.path(),
            &com_config(
                r#"{"chave":"plug.cor","titulo":"Cor","tipo":"escolha","padrao":"azul","opcoes":["azul","rubi"],"escopo":"campanha"}"#,
            ),
        )
        .unwrap();

        let c = &m.contribui.configuracoes[0];
        assert_eq!(c.chave, "plug.cor");
        assert_eq!(c.tipo, TipoConfiguracao::Escolha);
        assert_eq!(c.escopo, EscopoConfiguracao::Campanha);
        assert_eq!(c.opcoes, vec!["azul", "rubi"]);
    }

    #[test]
    fn configuracao_sem_escopo_vale_nos_dois() {
        let base = tempfile::tempdir().unwrap();
        let m = ler(
            base.path(),
            &com_config(
                r#"{"chave":"plug.ligado","titulo":"Ligado","tipo":"booleano","padrao":true}"#,
            ),
        )
        .unwrap();

        assert_eq!(
            m.contribui.configuracoes[0].escopo,
            EscopoConfiguracao::Ambos
        );
    }

    #[test]
    fn configuracao_sem_o_prefixo_da_extensao_e_recusada() {
        let base = tempfile::tempdir().unwrap();

        // Sem o prefixo, `cor` viraria disputa entre plugins e `ato20.zoom`
        // deixaria um plugin redefinir o padrao do aplicativo.
        for chave in [
            "cor",
            "ato20.zoom",
            "outro.cor",
            "plug.",
            "plug.Cor",
            "plug.a..b",
        ] {
            assert!(
                matches!(
                    ler(
                        base.path(),
                        &com_config(&format!(
                            r#"{{"chave":"{chave}","titulo":"X","tipo":"texto","padrao":""}}"#
                        ))
                    )
                    .unwrap_err(),
                    AppError::ExtensaoInvalida(_)
                ),
                "{chave} devia ser recusada"
            );
        }
    }

    #[test]
    fn configuracao_com_padrao_de_outro_tipo_e_recusada() {
        let base = tempfile::tempdir().unwrap();

        for (tipo, padrao) in [("booleano", "\"sim\""), ("numero", "\"1\""), ("texto", "1")] {
            assert!(matches!(
                ler(
                    base.path(),
                    &com_config(&format!(
                        r#"{{"chave":"plug.x","titulo":"X","tipo":"{tipo}","padrao":{padrao}}}"#
                    ))
                )
                .unwrap_err(),
                AppError::ExtensaoInvalida(_)
            ));
        }
    }

    #[test]
    fn escolha_exige_opcoes_com_o_padrao_dentro() {
        let base = tempfile::tempdir().unwrap();

        assert!(matches!(
            ler(
                base.path(),
                &com_config(r#"{"chave":"plug.x","titulo":"X","tipo":"escolha","padrao":"a"}"#)
            )
            .unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
        assert!(matches!(
            ler(
                base.path(),
                &com_config(
                    r#"{"chave":"plug.x","titulo":"X","tipo":"escolha","padrao":"c","opcoes":["a","b"]}"#
                )
            )
            .unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    #[test]
    fn numero_respeita_o_intervalo_declarado() {
        let base = tempfile::tempdir().unwrap();

        assert!(matches!(
            ler(
                base.path(),
                &com_config(
                    r#"{"chave":"plug.x","titulo":"X","tipo":"numero","padrao":11,"minimo":0,"maximo":10}"#
                )
            )
            .unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
        assert!(matches!(
            ler(
                base.path(),
                &com_config(
                    r#"{"chave":"plug.x","titulo":"X","tipo":"numero","padrao":5,"minimo":10,"maximo":0}"#
                )
            )
            .unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    #[test]
    fn encaixes_entram_inteiros() {
        let base = tempfile::tempdir().unwrap();
        let m = ler(
            base.path(),
            &com_contrib(
                r#"{"itensDeMenu":[{"id":"atacar","titulo":"Atacar","alvo":"palco.token","icone":"espadas"}],
                    "secoes":[{"id":"habilidades","titulo":"Habilidades","alvo":"ficha"}],
                    "substitutos":[{"alvo":"secao:medidores"},{"alvo":"janela:rolagens"}]}"#,
            ),
        )
        .unwrap();

        assert_eq!(m.contribui.itens_de_menu[0].alvo, "palco.token");
        assert_eq!(m.contribui.secoes[0].alvo, "ficha");
        assert_eq!(m.contribui.substitutos.len(), 2);
    }

    #[test]
    fn estilo_de_medidor_exige_svg_dentro_da_pasta_e_altura_sensata() {
        let base = tempfile::tempdir().unwrap();

        let m = ler(
            base.path(),
            &com_contrib(
                r#"{"estilosDeMedidor":[{"id":"coracao","titulo":"Coracao","arquivo":"estilos/coracao.svg","altura":0.4}]}"#,
            ),
        )
        .unwrap();
        assert_eq!(m.contribui.estilos_de_medidor[0].altura, 0.4);

        for corpo in [
            r#"{"estilosDeMedidor":[{"id":"x","titulo":"X","arquivo":"../fora.svg","altura":0.4}]}"#,
            r#"{"estilosDeMedidor":[{"id":"x","titulo":"X","arquivo":"x.png","altura":0.4}]}"#,
            r#"{"estilosDeMedidor":[{"id":"x","titulo":"X","arquivo":"x.svg","altura":0}]}"#,
            r#"{"estilosDeMedidor":[{"id":"x","titulo":"X","arquivo":"x.svg","altura":50}]}"#,
        ] {
            assert!(
                matches!(
                    ler(base.path(), &com_contrib(corpo)).unwrap_err(),
                    AppError::ExtensaoInvalida(_)
                ),
                "{corpo} devia ser recusado"
            );
        }
    }

    /// Um pack de efeitos: so o manifesto, sem `principal` nem arquivo.
    fn com_efeitos(id: &str, efeitos: &str) -> String {
        format!(
            r#"{{"id":"{id}","nome":"Pack","versao":"1.0.0","apiVersao":6,"contribui":{{"efeitos":{efeitos}}}}}"#
        )
    }

    #[test]
    fn pack_de_efeitos_entra_so_com_o_manifesto() {
        let base = tempfile::tempdir().unwrap();
        let m = ler(
            base.path(),
            &com_efeitos(
                "ordem",
                r#"[{"id":"sangrando","titulo":"Sangrando","dica":"Escorre.","figura":{"tinta":0.6,"tremor":true}}]"#,
            ),
        )
        .unwrap();

        let efeito = &m.contribui.efeitos[0];
        assert_eq!(efeito.id, "sangrando");
        assert_eq!(efeito.figura.as_ref().unwrap().tinta, Some(0.6));
        assert!(efeito.figura.as_ref().unwrap().tremor);
        assert!(!efeito.figura.as_ref().unwrap().halo);
    }

    #[test]
    fn efeito_que_nao_desenha_ou_tem_numero_torto_e_recusado() {
        let base = tempfile::tempdir().unwrap();
        let longa = "a".repeat(MAX_DICA_DO_EFEITO + 1);

        for efeitos in [
            r#"[{"id":"nada","titulo":"Nada"}]"#.to_string(),
            r#"[{"id":"nada","titulo":"Nada","figura":{}}]"#.to_string(),
            r#"[{"id":"forte","titulo":"Forte","figura":{"tinta":1.5}}]"#.to_string(),
            r#"[{"id":"fraco","titulo":"Fraco","figura":{"tinta":-0.1}}]"#.to_string(),
            r#"[{"id":"Sangue","titulo":"Sangue","figura":{"halo":true}}]"#.to_string(),
            format!(r#"[{{"id":"falante","titulo":"Falante","dica":"{longa}","figura":{{"halo":true}}}}]"#),
        ] {
            assert!(
                matches!(
                    ler(base.path(), &com_efeitos("ordem", &efeitos)).unwrap_err(),
                    AppError::ExtensaoInvalida(_)
                ),
                "{efeitos} devia ser recusado"
            );
        }
    }

    #[test]
    fn efeito_com_externo_interno_e_animacao_entra() {
        let base = tempfile::tempdir().unwrap();
        let m = ler(
            base.path(),
            &com_efeitos(
                "ordem",
                r#"[{"id":"em-chamas","titulo":"Em chamas",
                     "externo":{"imagem":"fx/fogo.webp","tamanho":1.6,"lado":"frente","ancora":"base",
                                "opacidade":0.9,"animacao":{"tipo":"flutuar","periodo":1.2,"intensidade":0.5}},
                     "interno":{"textura":"fx/brasa.png","forca":0.4}}]"#,
            ),
        )
        .unwrap();

        let efeito = &m.contribui.efeitos[0];
        assert_eq!(efeito.imagens(), vec!["fx/fogo.webp", "fx/brasa.png"]);
        assert_eq!(
            m.contribui
                .imagens_servidas()
                .into_iter()
                .map(|(_, imagem)| imagem)
                .collect::<Vec<_>>(),
            vec!["fx/fogo.webp", "fx/brasa.png"]
        );
    }

    #[test]
    fn efeito_em_area_entra_com_o_chao_os_elementos_e_as_particulas() {
        let base = tempfile::tempdir().unwrap();
        let m = ler(
            base.path(),
            &com_efeitos(
                "ordem",
                r##"[{"id":"nevoa","titulo":"Névoa",
                     "area":{"cor":"#22c55e","escala":1.4,"divisoes":2,"densidade":4,
                             "foco":{"imagem":"fx/bolha.webp","quadros":{"colunas":4,"total":16,"fps":12},
                                     "mipmaps":{"64":"fx/bolha-64.webp"},"cores":"condicao"}},
                     "base":{"imagem":"fx/chao.webp","escala":2,"escurece":0.4,"cores":"fx/rampa.png"},
                     "particulas":{"quantidade":8,"imagem":"fx/gota.png"}}]"##,
            ),
        )
        .unwrap();

        let efeito = &m.contribui.efeitos[0];
        assert_eq!(
            efeito.imagens(),
            vec![
                "fx/gota.png",
                "fx/bolha.webp",
                "fx/bolha-64.webp",
                "fx/chao.webp",
                "fx/rampa.png"
            ]
        );

        // O que vai para o TS: os blocos inteiros, no formato que ele lê -- a
        // base com a imagem no mesmo nível dos números dela.
        let json = serde_json::to_value(efeito).unwrap();
        assert_eq!(json["area"]["foco"]["quadros"]["total"], 16);
        assert_eq!(json["base"]["imagem"], "fx/chao.webp");
        assert_eq!(json["base"]["escurece"], 0.4);
        assert_eq!(json["particulas"]["quantidade"], 8);
    }

    #[test]
    fn efeito_em_area_torto_e_recusado() {
        let base = tempfile::tempdir().unwrap();

        for efeito in [
            r##""area":{"cor":"verde","foco":{"imagem":"b.png"}}"##,
            r##""area":{"divisoes":9,"foco":{"imagem":"b.png"}}"##,
            r##""area":{"escala":5,"foco":{"imagem":"b.png"}}"##,
            r##""area":{"foco":{"imagem":"b.svg"}}"##,
            r##""area":{"foco":{"imagem":"b.png","quadros":{"colunas":4,"total":6}}}"##,
            r##""area":{"foco":{"imagem":"b.png","quadros":{"colunas":4,"total":8,"fps":200}}}"##,
            r##""area":{"foco":{"imagem":"b.png","mipmaps":{"grande":"b2.png"}}}"##,
            r##""base":{"imagem":"../fora.png"}"##,
            r##""base":{"imagem":"c.png","escala":10}"##,
            r##""base":{"imagem":"c.png","escurece":2}"##,
            r##""particulas":[1,2]"##,
            r##""particulas":{"imagem":"/abs.png"}"##,
        ] {
            let corpo = format!(r#"[{{"id":"x","titulo":"X",{efeito}}}]"#);
            assert!(ler(base.path(), &com_efeitos("ordem", &corpo)).is_err(), "{efeito}");
        }
    }

    #[test]
    fn externo_e_interno_tortos_sao_recusados() {
        let base = tempfile::tempdir().unwrap();

        for efeito in [
            r#"{"imagem":"../fora.png"}"#,
            r#"{"imagem":"fogo.svg"}"#,
            r#"{"imagem":"fogo.png","tamanho":5}"#,
            r#"{"imagem":"fogo.png","tamanho":0.1}"#,
            r#"{"imagem":"fogo.png","lado":"dentro"}"#,
            r#"{"imagem":"fogo.png","ancora":"meio"}"#,
            r#"{"imagem":"fogo.png","opacidade":2}"#,
            r#"{"imagem":"fogo.png","animacao":{"tipo":"explodir"}}"#,
            r#"{"imagem":"fogo.png","animacao":{"tipo":"girar","periodo":0.01}}"#,
            r#"{"imagem":"fogo.png","animacao":{"tipo":"girar","intensidade":3}}"#,
        ] {
            let corpo = format!(r#"[{{"id":"x","titulo":"X","externo":{efeito}}}]"#);
            assert!(ler(base.path(), &com_efeitos("ordem", &corpo)).is_err(), "{efeito}");
        }

        for interno in [r#"{"textura":"/abs.png"}"#, r#"{"textura":"t.png","forca":1.2}"#] {
            let corpo = format!(r#"[{{"id":"x","titulo":"X","interno":{interno}}}]"#);
            assert!(ler(base.path(), &com_efeitos("ordem", &corpo)).is_err(), "{interno}");
        }
    }

    #[test]
    fn importar_cobra_a_imagem_do_efeito() {
        let base = tempfile::tempdir().unwrap();
        let destino = base.path().join("instaladas");
        let origem = base.path().join("pack");
        escrever(
            &origem,
            MANIFESTO,
            &com_efeitos(
                "ordem",
                r#"[{"id":"fogo","titulo":"Fogo","externo":{"imagem":"fogo.png"}}]"#,
            ),
        );

        // Sem o arquivo, a importacao diz qual faltou.
        assert!(importar(&destino, &origem).is_err());

        std::fs::write(origem.join("fogo.png"), b"png").unwrap();
        assert!(importar(&destino, &origem).is_ok());
    }

    #[test]
    fn efeito_so_de_luz_entra_e_luz_torta_e_recusada() {
        let base = tempfile::tempdir().unwrap();
        let m = ler(
            base.path(),
            &com_efeitos(
                "ordem",
                r##"[{"id":"tocha","titulo":"Tocha","luz":{"raio":3,"cor":"#ffaa33","intensidade":0.8,"efeito":"fogo"}}]"##,
            ),
        )
        .unwrap();
        assert_eq!(m.contribui.efeitos[0].luz.as_ref().unwrap().raio, 3.0);

        for luz in [
            r##"{"raio":0.1}"##,
            r##"{"raio":40}"##,
            r##"{"raio":2,"intensidade":1.5}"##,
            r##"{"raio":2,"cor":"laranja"}"##,
            r##"{"raio":2,"efeito":"explodindo"}"##,
        ] {
            let corpo = format!(r#"[{{"id":"x","titulo":"X","luz":{luz}}}]"#);
            assert!(ler(base.path(), &com_efeitos("ordem", &corpo)).is_err(), "{luz}");
        }
    }

    #[test]
    fn plugin_chamado_campanha_nao_declara_efeito() {
        // `campanha/brasa` seria dele e da campanha ao mesmo tempo.
        let base = tempfile::tempdir().unwrap();
        let efeitos = r#"[{"id":"brasa","titulo":"Brasa","figura":{"halo":true}}]"#;

        assert!(ler(base.path(), &com_efeitos(PREFIXO_DA_CAMPANHA, efeitos)).is_err());
        assert!(ler(base.path(), &com_efeitos("ordem", efeitos)).is_ok());
    }

    /// Um plugin que so desenha medidor: sem `principal`, sem SVG.
    fn com_estilos(estilos: &str) -> String {
        format!(
            r#"{{"id":"ordem","nome":"Ordem","versao":"1.0.0","apiVersao":5,"contribui":{{"estilosDeMedidor":{estilos}}}}}"#
        )
    }

    #[test]
    fn estilo_em_camadas_entra_inteiro_e_dispensa_principal() {
        let base = tempfile::tempdir().unwrap();

        let m = ler(
            base.path(),
            &com_estilos(
                r#"[
                  {"id":"vida","titulo":"Vida","altura":0.22,"rotulo":"nome",
                   "camadas":{"moldura":"m/vida.webp","mascara":"m/mascara.png",
                     "encaixe":{"x":0.06,"y":0.25,"largura":0.94,"altura":0.5},
                     "conteudo":{"modo":"barra","direcao":"cima","imagem":"m/sangue.gif"}}},
                  {"id":"cargas","titulo":"Cargas","altura":0.2,
                   "camadas":{"conteudo":{"modo":"pontos","cheio":"m/cheio.png"}}},
                  {"id":"sanidade","titulo":"Sanidade","altura":1,"rotulo":"nenhum",
                   "camadas":{"conteudo":{"modo":"sequencia","quadros":["s/0.png","s/1.png","s/2.png"]}}}
                ]"#,
            ),
        )
        .unwrap();

        let [vida, cargas, sanidade] = &m.contribui.estilos_de_medidor[..] else {
            panic!("tres estilos");
        };

        assert_eq!(vida.rotulo.as_deref(), Some("nome"));
        assert_eq!(
            vida.camadas.as_ref().unwrap().conteudo,
            Conteudo::Barra {
                direcao: Direcao::Cima,
                imagem: Some("m/sangue.gif".into()),
                vazio: None,
            }
        );
        assert_eq!(
            vida.imagens(),
            ["m/vida.webp", "m/mascara.png", "m/sangue.gif"]
        );

        // Sem imagem de vazio, sem moldura, sem encaixe: tudo opcional.
        assert_eq!(cargas.imagens(), ["m/cheio.png"]);
        assert!(cargas.camadas.as_ref().unwrap().encaixe.is_none());

        assert_eq!(sanidade.imagens(), ["s/0.png", "s/1.png", "s/2.png"]);
    }

    #[test]
    fn estilo_em_camadas_so_aceita_imagem_da_pasta_e_encaixe_na_forma() {
        let base = tempfile::tempdir().unwrap();
        let barra = |extra: &str| {
            com_estilos(&format!(
                r#"[{{"id":"x","titulo":"X","altura":0.2,"camadas":{{{extra}"conteudo":{{"modo":"barra"}}}}}}]"#
            ))
        };

        // O caso que cabe na conta do autor e nao na do ponto flutuante.
        assert!(ler(
            base.path(),
            &barra(r#""encaixe":{"x":0.06,"y":0,"largura":0.94,"altura":1},"#)
        )
        .is_ok());

        for json in [
            // SVG nao: ele vai para a rede, e la roda script.
            barra(r#""moldura":"moldura.svg","#),
            barra(r#""moldura":"../fora.png","#),
            barra(r#""moldura":"sem-extensao","#),
            barra(r#""mascara":"mascara.html","#),
            barra(r#""encaixe":{"x":0.5,"y":0,"largura":0.6,"altura":1},"#),
            barra(r#""encaixe":{"x":0,"y":0,"largura":0,"altura":1},"#),
            barra(r#""encaixe":{"x":-0.1,"y":0,"largura":0.5,"altura":1},"#),
            com_estilos(
                r#"[{"id":"x","titulo":"X","altura":0.2,"camadas":{"conteudo":{"modo":"sequencia","quadros":["a.png"]}}}]"#,
            ),
            com_estilos(&format!(
                r#"[{{"id":"x","titulo":"X","altura":0.2,"camadas":{{"conteudo":{{"modo":"sequencia","quadros":[{}]}}}}}}]"#,
                vec![r#""q.png""#; QUADROS_MAX + 1].join(",")
            )),
            com_estilos(
                r#"[{"id":"x","titulo":"X","altura":0.2,"arquivo":"x.svg","camadas":{"conteudo":{"modo":"barra"}}}]"#,
            ),
            com_estilos(r#"[{"id":"x","titulo":"X","altura":0.2}]"#),
            com_estilos(
                r#"[{"id":"x","titulo":"X","altura":0.2,"arquivo":"x.svg","rotulo":"dentro"}]"#,
            ),
        ] {
            assert!(
                matches!(
                    ler(base.path(), &json).unwrap_err(),
                    AppError::ExtensaoInvalida(_)
                ),
                "{json} devia ser recusado"
            );
        }

        // Modo que nao existe e erro de forma do JSON, e o serde ja diz qual.
        let desconhecido = com_estilos(
            r#"[{"id":"x","titulo":"X","altura":0.2,"camadas":{"conteudo":{"modo":"anel"}}}]"#,
        );
        assert!(matches!(
            ler(base.path(), &desconhecido).unwrap_err(),
            AppError::Malformed { .. }
        ));
    }

    #[test]
    fn estilo_em_camadas_escreve_o_valor_dentro_com_cor_hex() {
        let base = tempfile::tempdir().unwrap();
        let com_texto = |texto: &str| {
            com_estilos(&format!(
                r#"[{{"id":"pv","titulo":"PV","altura":0.15,"camadas":{{
                    "conteudo":{{"modo":"barra","imagem":"cheio.png","vazio":"vazio.png"}},
                    "texto":{texto}}}}}]"#
            ))
        };

        let m = ler(
            base.path(),
            &com_texto(r##"{"cor":"#fff","contorno":"#1a0d0dcc","tamanho":0.6,"encaixe":{"x":0,"y":0.1,"largura":1,"altura":0.8}}"##),
        )
        .unwrap();
        let estilo = &m.contribui.estilos_de_medidor[0];
        // O vazio vem antes do cheio: e a ordem em que a mesa desenha.
        assert_eq!(estilo.imagens(), ["vazio.png", "cheio.png"]);
        assert_eq!(
            estilo
                .camadas
                .as_ref()
                .unwrap()
                .texto
                .as_ref()
                .unwrap()
                .tamanho,
            Some(0.6)
        );

        assert!(ler(base.path(), &com_texto("{}")).is_ok());

        for texto in [
            r##"{"cor":"red"}"##,
            r##"{"cor":"#ffffff; background:url(x)"}"##,
            r##"{"contorno":"#12345"}"##,
            r##"{"tamanho":3}"##,
            r##"{"encaixe":{"x":0.5,"y":0,"largura":0.6,"altura":1}}"##,
        ] {
            assert!(
                matches!(
                    ler(base.path(), &com_texto(texto)).unwrap_err(),
                    AppError::ExtensaoInvalida(_)
                ),
                "{texto} devia ser recusado"
            );
        }
    }

    #[test]
    fn importar_recusa_imagem_de_medidor_que_falta_ou_pesa() {
        let base = tempfile::tempdir().unwrap();
        let dir = base.path().join("extensoes");
        let pasta = base.path().join("origem-ordem");
        escrever(
            &pasta,
            MANIFESTO,
            &com_estilos(
                r#"[{"id":"vida","titulo":"Vida","altura":0.2,
                     "camadas":{"moldura":"m/vida.png","conteudo":{"modo":"barra"}}}]"#,
            ),
        );

        let erro = importar(&dir, &pasta).unwrap_err();
        assert!(erro.to_string().contains("m/vida.png"), "{erro}");

        escrever(
            &pasta.join("m"),
            "vida.png",
            &"x".repeat(IMAGEM_DE_MEDIDOR_MAX as usize + 1),
        );
        assert!(matches!(
            importar(&dir, &pasta).unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));

        escrever(&pasta.join("m"), "vida.png", "png");
        importar(&dir, &pasta).unwrap();
        assert!(dir.join("ordem/m/vida.png").is_file());
    }

    #[cfg(unix)]
    #[test]
    fn importar_recusa_imagem_de_medidor_que_e_link() {
        let base = tempfile::tempdir().unwrap();
        let pasta = base.path().join("origem-ordem");
        escrever(
            &pasta,
            MANIFESTO,
            &com_estilos(
                r#"[{"id":"vida","titulo":"Vida","altura":0.2,
                     "camadas":{"moldura":"vida.png","conteudo":{"modo":"barra"}}}]"#,
            ),
        );
        escrever(base.path(), "fora.png", "png");
        std::os::unix::fs::symlink(base.path().join("fora.png"), pasta.join("vida.png")).unwrap();

        // A copia pularia o link, e o estilo apontaria para o nada.
        assert!(importar(&base.path().join("extensoes"), &pasta).is_err());
    }

    #[test]
    fn pagina_exige_html_dentro_da_pasta() {
        let base = tempfile::tempdir().unwrap();

        let m = ler(
            base.path(),
            &com_contrib(r#"{"paginas":[{"id":"camera","titulo":"Camera","arquivo":"web/camera.html"}]}"#),
        )
        .unwrap();
        assert_eq!(m.contribui.paginas[0].arquivo, "web/camera.html");

        for corpo in [
            r#"{"paginas":[{"id":"x","titulo":"X","arquivo":"../fora.html"}]}"#,
            r#"{"paginas":[{"id":"x","titulo":"X","arquivo":"x.js"}]}"#,
            r#"{"paginas":[{"id":"x","titulo":"","arquivo":"x.html"}]}"#,
        ] {
            assert!(
                matches!(
                    ler(base.path(), &com_contrib(corpo)).unwrap_err(),
                    AppError::ExtensaoInvalida(_)
                ),
                "{corpo} devia ser recusado"
            );
        }
    }

    #[test]
    fn ativacao_so_da_lista_e_com_principal() {
        let base = tempfile::tempdir().unwrap();

        let com = |ativacao: &str, principal: &str| {
            format!(
                r#"{{"id":"plug","nome":"Plug","versao":"1.0.0","apiVersao":3,{principal}"ativacao":"{ativacao}"}}"#
            )
        };

        let m = ler(base.path(), &com("abertura", r#""principal":"main.js","#)).unwrap();
        assert_eq!(m.ativacao.as_deref(), Some("abertura"));

        for json in [com("sempre", r#""principal":"main.js","#), com("abertura", "")] {
            assert!(
                matches!(ler(base.path(), &json).unwrap_err(), AppError::ExtensaoInvalida(_)),
                "{json} devia ser recusado"
            );
        }
    }

    #[test]
    fn configuracao_lista_quer_padrao_de_textos() {
        let base = tempfile::tempdir().unwrap();

        let m = ler(
            base.path(),
            &com_config(r#"{"chave":"plug.ocultos","titulo":"Ocultos","tipo":"lista","padrao":["mestre"],"escopo":"campanha"}"#),
        )
        .unwrap();
        assert_eq!(m.contribui.configuracoes[0].tipo, TipoConfiguracao::Lista);

        for padrao in [r#""mestre""#, "[1]"] {
            let json = format!(r#"{{"chave":"plug.x","titulo":"X","tipo":"lista","padrao":{padrao}}}"#);
            assert!(
                matches!(ler(base.path(), &com_config(&json)).unwrap_err(), AppError::ExtensaoInvalida(_)),
                "{padrao} devia ser recusado"
            );
        }
    }

    #[test]
    fn encaixe_para_lugar_que_nao_existe_e_recusado() {
        let base = tempfile::tempdir().unwrap();

        for corpo in [
            r#"{"itensDeMenu":[{"id":"x","titulo":"X","alvo":"palco.chao"}]}"#,
            r#"{"secoes":[{"id":"x","titulo":"X","alvo":"janela"}]}"#,
            r#"{"substitutos":[{"alvo":"secao:vida"}]}"#,
            r#"{"substitutos":[{"alvo":"janela:mestre"}]}"#,
            r#"{"substitutos":[{"alvo":"medidores"}]}"#,
            r#"{"substitutos":[{"alvo":"secao:medidores"},{"alvo":"secao:medidores"}]}"#,
        ] {
            assert!(
                matches!(
                    ler(base.path(), &com_contrib(corpo)).unwrap_err(),
                    AppError::ExtensaoInvalida(_)
                ),
                "{corpo} devia ser recusado"
            );
        }
    }

    #[test]
    fn contribuicao_sem_titulo_e_recusada() {
        let base = tempfile::tempdir().unwrap();

        // Aba sem nome e impossivel de achar de novo.
        assert!(matches!(
            ler(
                base.path(),
                &com_contrib(r#"{"paineis":[{"id":"t","titulo":"  "}]}"#)
            )
            .unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    #[test]
    fn id_de_contribuicao_segue_a_regra_do_slug() {
        let base = tempfile::tempdir().unwrap();

        assert!(matches!(
            ler(
                base.path(),
                &com_contrib(r#"{"comandos":[{"id":"../fuga","titulo":"Fuga"}]}"#)
            )
            .unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    #[test]
    fn icone_de_ferramenta_nao_sai_da_pasta() {
        let base = tempfile::tempdir().unwrap();

        assert!(matches!(
            ler(
                base.path(),
                &com_contrib(
                    r#"{"ferramentas":[{"id":"p","titulo":"P","icone":"../../etc/passwd"}]}"#
                )
            )
            .unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    #[test]
    fn pasta_sem_manifesto_nao_e_extensao() {
        let base = tempfile::tempdir().unwrap();
        let pasta = base.path().join("qualquer");
        escrever(&pasta, "leia-me.txt", "oi");

        assert!(matches!(
            ler_manifesto(&pasta).unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    #[test]
    fn importar_copia_a_arvore_inteira() {
        let base = tempfile::tempdir().unwrap();
        let dir = dir(base.path());
        let de = origem(base.path(), "pergaminho");
        escrever(&de.join("fontes"), "serif.woff2", "binario");

        let manifesto = importar(&dir, &de).unwrap();

        assert_eq!(manifesto.id, "pergaminho");
        assert!(dir.join("pergaminho").join("tema.css").is_file());
        assert!(dir
            .join("pergaminho")
            .join("fontes")
            .join("serif.woff2")
            .is_file());
    }

    #[test]
    fn reinstalar_nao_deixa_arquivo_da_versao_anterior() {
        let base = tempfile::tempdir().unwrap();
        let dir = dir(base.path());
        let de = origem(base.path(), "pergaminho");
        escrever(&de, "sobra.css", "/* some na versao seguinte */");

        importar(&dir, &de).unwrap();
        assert!(dir.join("pergaminho").join("sobra.css").is_file());

        // A versao nova, sem o arquivo que a anterior tinha.
        std::fs::remove_file(de.join("sobra.css")).unwrap();
        importar(&dir, &de).unwrap();

        assert!(!dir.join("pergaminho").join("sobra.css").exists());
        assert!(dir.join("pergaminho").join("tema.css").is_file());
    }

    #[test]
    fn manifesto_quebrado_nao_esconde_as_outras() {
        let base = tempfile::tempdir().unwrap();
        let dir = dir(base.path());

        importar(&dir, &origem(base.path(), "boa")).unwrap();
        escrever(&dir.join("ruim"), MANIFESTO, "{ isto nao e json");
        // Pasta cujo manifesto se diz outra coisa: a URL do protocolo sai do
        // nome da pasta, entao as duas discordando nunca carregariam.
        escrever(&dir.join("mentirosa"), MANIFESTO, &manifesto_de("outra"));

        let listadas = listar(&dir).unwrap();

        assert_eq!(listadas.len(), 1);
        assert_eq!(listadas[0].id, "boa");
    }

    #[test]
    fn sem_diretorio_a_lista_e_vazia_e_nao_erro() {
        let base = tempfile::tempdir().unwrap();

        assert!(listar(&dir(base.path())).unwrap().is_empty());
    }

    #[test]
    fn o_protocolo_so_alcanca_dentro_da_extensao() {
        let base = tempfile::tempdir().unwrap();
        let dir = dir(base.path());
        importar(&dir, &origem(base.path(), "pergaminho")).unwrap();

        // Um segredo ao lado de `extensoes/`, que e onde o `ato20.db` mora.
        escrever(base.path(), "ato20.db", "segredo");

        assert!(caminho_do_arquivo(&dir, "pergaminho", "tema.css").is_some());

        assert!(caminho_do_arquivo(&dir, "pergaminho", "../../ato20.db").is_none());
        assert!(caminho_do_arquivo(&dir, "..", "ato20.db").is_none());
        assert!(caminho_do_arquivo(&dir, "pergaminho", "nao-existe.css").is_none());
        // A propria pasta nao e arquivo.
        assert!(caminho_do_arquivo(&dir, "pergaminho", "fontes").is_none());
    }

    #[cfg(unix)]
    #[test]
    fn link_simbolico_nao_entra_na_importacao() {
        let base = tempfile::tempdir().unwrap();
        let dir = dir(base.path());
        let de = origem(base.path(), "curiosa");

        escrever(base.path(), "segredo.txt", "conteudo que nao pode viajar");
        std::os::unix::fs::symlink(base.path().join("segredo.txt"), de.join("vazamento.txt"))
            .unwrap();

        importar(&dir, &de).unwrap();

        // Nem o link nem o conteudo dele chegaram ao destino.
        assert!(!dir.join("curiosa").join("vazamento.txt").exists());
        assert!(dir.join("curiosa").join("tema.css").is_file());
    }

    #[cfg(unix)]
    #[test]
    fn link_plantado_depois_nao_e_servido() {
        let base = tempfile::tempdir().unwrap();
        let dir = dir(base.path());
        importar(&dir, &origem(base.path(), "curiosa")).unwrap();

        // Quem tem a pasta pode plantar o link DEPOIS de instalada: a guarda de
        // forma nao ve isso, e por isso `caminho_do_arquivo` resolve o link.
        escrever(base.path(), "segredo.txt", "conteudo que nao pode vazar");
        std::os::unix::fs::symlink(
            base.path().join("segredo.txt"),
            dir.join("curiosa").join("atalho.txt"),
        )
        .unwrap();

        assert!(caminho_do_arquivo(&dir, "curiosa", "atalho.txt").is_none());
    }

    #[test]
    fn remover_leva_a_pasta_e_perdoa_o_que_nao_existe() {
        let base = tempfile::tempdir().unwrap();
        let dir = dir(base.path());
        importar(&dir, &origem(base.path(), "pergaminho")).unwrap();

        remover(&dir, "pergaminho").unwrap();
        assert!(!dir.join("pergaminho").exists());

        // Chamar de novo continua sendo sucesso.
        remover(&dir, "pergaminho").unwrap();

        // Mas um id torto nao vira `remove_dir_all` em lugar nenhum.
        assert!(matches!(
            remover(&dir, "../../..").unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    // --- texto por idioma (API 7) -------------------------------------------

    /// Um manifesto de API 7 com um painel, uma configuracao de escolha e uma
    /// fonte de retrato, e os textos que se quer trocar.
    fn com_idiomas(nome: &str, titulo_do_painel: &str, rotulos: &str) -> String {
        format!(
            r#"{{"id":"plug","nome":{nome},"versao":"1.0.0","apiVersao":7,"principal":"main.js",
                "descricao":{{"pt-BR":"Rola a iniciativa","en":"Rolls initiative"}},
                "retratos":[{{"fonte":"cris","rotulo":{{"pt-BR":"Agente","en":"Agent"}},
                              "modelo":"https://exemplo.com/s/{{codigo}}",
                              "campo":{{"pt-BR":"Codigo do agente","en":"Agent code"}},
                              "largura":1920,"altura":1100}}],
                "contribui":{{
                  "paineis":[{{"id":"ordem","titulo":{titulo_do_painel},"subtitulo":{{"en":"Order"}}}}],
                  "comandos":[{{"id":"rolar","titulo":"Rolar","grupo":{{"pt":"Combate","en":"Combat"}}}}],
                  "configuracoes":[{{"chave":"plug.modo","titulo":{{"pt-BR":"Modo","en":"Mode"}},
                                     "tipo":"escolha","padrao":"auto","opcoes":["auto","manual"],
                                     "rotulos":{rotulos}}}]}}}}"#
        )
    }

    #[test]
    fn texto_por_idioma_entra_e_volta_no_mesmo_formato() {
        let base = tempfile::tempdir().unwrap();
        let json = com_idiomas(
            r#"{"pt-BR":"Iniciativa","en":"Initiative"}"#,
            r#"{"pt-BR":"Ordem","en":"Order"}"#,
            r#"{"auto":{"pt-BR":"Automatico","en":"Automatic"},"manual":"Manual"}"#,
        );
        let m = ler(base.path(), &json).unwrap();

        assert_eq!(m.nome, "Iniciativa");
        assert_eq!(m.contribui.paineis[0].titulo, "Ordem");
        // Sem `pt-BR` nem `pt`, o principal e o ingles.
        assert_eq!(m.contribui.paineis[0].subtitulo.as_ref().unwrap(), &"Order");
        assert_eq!(m.contribui.comandos[0].grupo.as_ref().unwrap(), &"Combate");
        assert_eq!(m.retratos[0].campo, "Codigo do agente");
        assert_eq!(m.contribui.configuracoes[0].rotulos["manual"], "Manual");

        // A tela escolhe o idioma, entao o mapa tem de chegar como mapa -- e a
        // string, como string.
        let ida = serde_json::to_value(&m).unwrap();
        let cru: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(ida["nome"], cru["nome"]);
        assert_eq!(ida["descricao"], cru["descricao"]);
        assert_eq!(ida["retratos"][0]["rotulo"], cru["retratos"][0]["rotulo"]);
        assert_eq!(ida["retratos"][0]["campo"], cru["retratos"][0]["campo"]);
        assert_eq!(ida["contribui"]["paineis"], cru["contribui"]["paineis"]);
        assert_eq!(
            ida["contribui"]["comandos"][0]["grupo"],
            cru["contribui"]["comandos"][0]["grupo"]
        );
        assert_eq!(ida["contribui"]["comandos"][0]["titulo"], "Rolar");
        assert_eq!(
            ida["contribui"]["configuracoes"][0]["rotulos"],
            cru["contribui"]["configuracoes"][0]["rotulos"]
        );

        // E o que voltou le de novo igual: o front pode devolver o manifesto.
        let volta: Manifesto = serde_json::from_value(ida).unwrap();
        assert_eq!(volta, m);
    }

    #[test]
    fn texto_em_string_continua_valendo_e_sem_rotulos() {
        let base = tempfile::tempdir().unwrap();
        let m = ler(
            base.path(),
            &com_config(
                r#"{"chave":"plug.cor","titulo":"Cor","descricao":"A cor da mesa","tipo":"escolha","padrao":"azul","opcoes":["azul","rubi"]}"#,
            ),
        )
        .unwrap();

        let c = &m.contribui.configuracoes[0];
        assert_eq!(c.titulo, TextoDePlugin::Um("Cor".into()));
        assert!(c.rotulos.is_empty());

        let ida = serde_json::to_value(&m).unwrap();
        assert_eq!(ida["nome"], "Plug");
        assert_eq!(ida["contribui"]["configuracoes"][0]["titulo"], "Cor");
        assert_eq!(
            ida["contribui"]["configuracoes"][0]["descricao"],
            "A cor da mesa"
        );
        assert_eq!(
            ida["contribui"]["configuracoes"][0]["rotulos"],
            serde_json::json!({})
        );
    }

    #[test]
    fn principal_prefere_portugues_depois_ingles_depois_o_primeiro() {
        let mapa = |pares: &[(&str, &str)]| {
            TextoDePlugin::PorIdioma(
                pares
                    .iter()
                    .map(|(k, v)| (k.to_string(), v.to_string()))
                    .collect(),
            )
        };

        assert_eq!(
            mapa(&[("en", "Order"), ("pt-BR", "Ordem")]).principal(),
            "Ordem"
        );
        assert_eq!(
            mapa(&[("en", "Order"), ("pt", "Ordem")]).principal(),
            "Ordem"
        );
        assert_eq!(
            mapa(&[("es", "Orden"), ("en", "Order")]).principal(),
            "Order"
        );
        assert_eq!(
            mapa(&[("es", "Orden"), ("fr", "Ordre")]).principal(),
            "Orden"
        );
        assert_eq!(mapa(&[]).principal(), "");
        assert_eq!(TextoDePlugin::Um("Ordem".into()).principal(), "Ordem");
    }

    #[test]
    fn chave_de_idioma_que_nao_e_codigo_e_recusada() {
        let base = tempfile::tempdir().unwrap();

        for chave in [
            "portugues",
            "PT",
            "pt_BR",
            "pt-br",
            "ptb",
            "",
            "p",
            "pt-BRA",
            "1a",
        ] {
            let nome = format!(r#"{{"{chave}":"Iniciativa"}}"#);
            let erro = ler(base.path(), &com_idiomas(&nome, r#""Ordem""#, "{}")).unwrap_err();
            assert!(
                matches!(erro, AppError::ExtensaoInvalida(_)),
                "{chave:?} devia ser recusada"
            );
            // A mensagem diz onde e qual, nas duas linguas.
            assert!(erro.to_string().contains("`nome`"), "{erro}");
            assert!(
                erro.em_ingles().contains(&format!("{chave:?}")),
                "{}",
                erro.em_ingles()
            );
        }

        // Em qualquer texto, e nao so no nome: no rotulo de uma opcao tambem.
        let erro = ler(
            base.path(),
            &com_idiomas(
                r#""Iniciativa""#,
                r#""Ordem""#,
                r#"{"auto":{"ingles":"Automatic"}}"#,
            ),
        )
        .unwrap_err();
        assert!(erro.to_string().contains("rotulos.auto"), "{erro}");

        for chave in ["pt", "en", "pt-BR", "en-US", "es"] {
            let nome = format!(r#"{{"{chave}":"Iniciativa"}}"#);
            assert!(
                ler(base.path(), &com_idiomas(&nome, r#""Ordem""#, "{}")).is_ok(),
                "{chave:?} devia passar"
            );
        }
    }

    #[test]
    fn titulo_por_idioma_vazio_conta_como_sem_titulo() {
        let base = tempfile::tempdir().unwrap();

        // Mapa vazio, ou um idioma em branco: a aba sem nome apareceria para
        // quem usa aquele idioma.
        for titulo in ["{}", r#"{"pt-BR":"Ordem","en":"  "}"#, r#"{"en":""}"#] {
            assert!(
                matches!(
                    ler(base.path(), &com_idiomas(r#""Iniciativa""#, titulo, "{}")).unwrap_err(),
                    AppError::ExtensaoInvalida(_)
                ),
                "{titulo} devia ser recusado"
            );
        }

        // O mesmo na configuracao, que e conferida por outro caminho.
        assert!(matches!(
            ler(
                base.path(),
                &com_config(
                    r#"{"chave":"plug.cor","titulo":{"pt-BR":"Cor","en":" "},"tipo":"texto","padrao":""}"#
                )
            )
            .unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    #[test]
    fn dica_por_idioma_respeita_o_teto_em_todos() {
        let base = tempfile::tempdir().unwrap();
        let longa = "a".repeat(MAX_DICA_DO_EFEITO + 1);

        // O portugues cabe, o ingles nao: o teto vale para o maior.
        let json = com_efeitos(
            "ordem",
            &format!(
                r#"[{{"id":"falante","titulo":"Falante","dica":{{"pt-BR":"Curta","en":"{longa}"}},"figura":{{"halo":true}}}}]"#
            ),
        );
        assert!(matches!(
            ler(base.path(), &json).unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    #[test]
    fn rotulo_de_opcao_que_nao_existe_e_recusado() {
        let base = tempfile::tempdir().unwrap();

        // `automatico` nao e opcao: erro de digitacao na chave, e a opcao de
        // verdade apareceria com o valor cru.
        let erro = ler(
            base.path(),
            &com_idiomas(
                r#""Iniciativa""#,
                r#""Ordem""#,
                r#"{"automatico":"Automatico"}"#,
            ),
        )
        .unwrap_err();
        assert!(matches!(erro, AppError::ExtensaoInvalida(_)));
        assert!(erro.to_string().contains("automatico"), "{erro}");

        // Rotulo em branco tambem: uma opcao sem nome nao se escolhe.
        assert!(matches!(
            ler(
                base.path(),
                &com_idiomas(
                    r#""Iniciativa""#,
                    r#""Ordem""#,
                    r#"{"auto":{"pt-BR":"Auto","en":""}}"#
                ),
            )
            .unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));

        // Fora de `escolha` nao ha opcao para rotular.
        assert!(matches!(
            ler(
                base.path(),
                &com_config(
                    r#"{"chave":"plug.ligado","titulo":"Ligado","tipo":"booleano","padrao":true,"rotulos":{"true":"Sim"}}"#
                )
            )
            .unwrap_err(),
            AppError::ExtensaoInvalida(_)
        ));
    }

    #[test]
    fn lista_ordena_pelo_nome_principal() {
        let base = tempfile::tempdir().unwrap();
        let dir = dir(base.path());

        for (id, nome) in [
            ("zeta", r#"{"en":"Alpha","pt-BR":"Zeta"}"#),
            ("beta", r#""beta""#),
            ("alfa", r#"{"en":"Zulu","pt":"Alfa"}"#),
        ] {
            escrever(
                &dir.join(id),
                MANIFESTO,
                &format!(r#"{{"id":"{id}","nome":{nome},"versao":"1.0.0","apiVersao":7}}"#),
            );
        }

        let ids: Vec<String> = listar(&dir).unwrap().into_iter().map(|m| m.id).collect();
        assert_eq!(ids, vec!["alfa", "beta", "zeta"]);
    }
}
