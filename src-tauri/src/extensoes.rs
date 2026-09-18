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
pub const API_VERSAO: u32 = 1;

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
    pub nome: String,
    pub versao: String,
    #[serde(default)]
    pub autor: Option<String>,
    /// De onde ela veio, para a tela ter o que mostrar antes de habilitar.
    #[serde(default)]
    pub repositorio: Option<String>,
    #[serde(default)]
    pub descricao: Option<String>,
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
}

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
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Painel {
    pub id: String,
    pub titulo: String,
    /// A linha de baixo na aba, quando ha.
    #[serde(default)]
    pub subtitulo: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comando {
    pub id: String,
    pub titulo: String,
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
    pub grupo: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ferramenta {
    pub id: String,
    pub titulo: String,
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
    pub titulo: String,
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
    pub rotulo: String,
    /// O molde da URL, com `{codigo}` onde entra o que o mestre cola.
    pub modelo: String,
    /// O nome do campo que o mestre preenche -- "Codigo do agente".
    pub campo: String,
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
            AppError::ExtensaoInvalida(format!(
                "a pasta nao tem {MANIFESTO} -- nao e uma extensao do ATO20"
            ))
        } else {
            AppError::Io(cause)
        }
    })?;

    let manifesto: Manifesto =
        serde_json::from_str(&cru).map_err(|cause| AppError::Malformed {
            file: MANIFESTO.to_string(),
            cause: cause.to_string(),
        })?;

    if !id_valido(&manifesto.id) {
        return Err(AppError::ExtensaoInvalida(format!(
            "o id {:?} nao serve: so minusculas, digitos e hifen, ate 64",
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
    for (campo, valor) in [("tema", &manifesto.tema), ("principal", &manifesto.principal)] {
        if let Some(rel) = valor {
            if !caminho_relativo_seguro(rel) {
                return Err(AppError::ExtensaoInvalida(format!(
                    "o caminho de {campo} ({rel:?}) sai da pasta da extensao"
                )));
            }
        }
    }

    for fonte in &manifesto.retratos {
        validar_fonte(fonte)?;
    }

    validar_contribuicoes(&manifesto)?;

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
        || !c.camadas.is_empty();

    // Quem implementa contribuicao e o modulo. Declarar sem `principal` daria
    // uma aba na lista de telas que abre vazia, e um comando no menu que nao
    // faz nada -- e a causa estaria num arquivo que nao existe.
    if declarou_algo && manifesto.principal.is_none() {
        return Err(AppError::ExtensaoInvalida(
            "a extensao declara contribuicoes mas nao tem `principal`; nada as implementaria"
                .to_string(),
        ));
    }

    let grupos: [(&str, Vec<(&String, &String)>); 4] = [
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
    ];

    for (nome, itens) in grupos {
        let mut vistos: Vec<&str> = Vec::new();

        for (id, titulo) in itens {
            // Mesma forma do id de extensao, e pelo mesmo motivo: este id entra
            // em chave de janela e em id de ferramenta, que viram texto em
            // lugares que nao esperam barra nem espaco.
            if !id_valido(id) {
                return Err(AppError::ExtensaoInvalida(format!(
                    "o id {id:?} em `{nome}` nao serve: so minusculas, digitos e hifen"
                )));
            }

            // Titulo vazio daria uma aba sem nome, impossivel de achar de novo.
            if titulo.trim().is_empty() {
                return Err(AppError::ExtensaoInvalida(format!(
                    "a contribuicao {id:?} em `{nome}` esta sem titulo"
                )));
            }

            // Repetido dentro do MESMO grupo e ambiguidade de verdade: duas
            // telas com o mesmo id disputariam a mesma chave de janela. Entre
            // grupos nao ha conflito -- um painel e uma ferramenta chamados
            // `notas` sao coisas diferentes.
            if vistos.contains(&id.as_str()) {
                return Err(AppError::ExtensaoInvalida(format!(
                    "o id {id:?} aparece duas vezes em `{nome}`"
                )));
            }

            vistos.push(id);
        }
    }

    // Icone de ferramenta e caminho dentro da pasta, e vale a mesma guarda do
    // `tema` e do `principal`.
    for ferramenta in &c.ferramentas {
        if let Some(icone) = &ferramenta.icone {
            if !caminho_relativo_seguro(icone) {
                return Err(AppError::ExtensaoInvalida(format!(
                    "o icone de {:?} ({icone:?}) sai da pasta da extensao",
                    ferramenta.id
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
        return Err(AppError::ExtensaoInvalida(format!(
            "a fonte de retrato {:?} nao serve: so minusculas, digitos e hifen",
            fonte.fonte
        )));
    }

    // `https` e nao `http`: a pagina e embutida na janela do Mestre e nas
    // telas da mesa, e uma origem em texto claro na rede de casa e alcancavel
    // por quem estiver nela. Nao e o modelo de ameaca deste projeto, mas
    // recusar aqui custa uma linha.
    if !fonte.modelo.starts_with("https://") {
        return Err(AppError::ExtensaoInvalida(format!(
            "o modelo da fonte {:?} precisa comecar com https://",
            fonte.fonte
        )));
    }

    if !fonte.modelo.contains("{codigo}") {
        return Err(AppError::ExtensaoInvalida(format!(
            "o modelo da fonte {:?} nao tem {{codigo}}, entao daria a mesma URL para todo personagem",
            fonte.fonte
        )));
    }

    if fonte.largura == 0
        || fonte.altura == 0
        || fonte.largura > CANVAS_MAX
        || fonte.altura > CANVAS_MAX
    {
        return Err(AppError::ExtensaoInvalida(format!(
            "o canvas da fonte {:?} precisa estar entre 1 e {CANVAS_MAX}",
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
    achadas.sort_by(|a, b| a.nome.to_lowercase().cmp(&b.nome.to_lowercase()));

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
        return Err(AppError::ExtensaoInvalida(format!("id invalido: {id:?}")));
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
            ler(base.path(), &com_fonte("modelo", "http://exemplo.com/s/{codigo}")).unwrap_err(),
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
        assert_eq!(m.contribui.comandos[0].atalho.as_deref(), Some("Ctrl+Shift+F"));
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
                &com_contrib(
                    r#"{"paineis":[{"id":"t","titulo":"A"},{"id":"t","titulo":"B"}]}"#
                )
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
    fn contribuicao_sem_titulo_e_recusada() {
        let base = tempfile::tempdir().unwrap();

        // Aba sem nome e impossivel de achar de novo.
        assert!(matches!(
            ler(base.path(), &com_contrib(r#"{"paineis":[{"id":"t","titulo":"  "}]}"#))
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
}
