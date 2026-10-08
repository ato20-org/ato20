use serde::{Serialize, Serializer};

/// Uma mensagem nos dois idiomas do aplicativo.
///
/// O Rust nao sabe em que idioma a tela esta, e nao precisa saber: manda os
/// dois, e quem mostra escolhe -- ver `call` em `src/lib/vault/bridge.ts`. Um
/// idioma guardado aqui seria estado a sincronizar com a configuracao da
/// maquina, e o celular nem fala o idioma do Mestre necessariamente.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Texto {
    pub pt: String,
    pub en: String,
}

/// `texto!("a pasta {nome} sumiu", "the folder {nome} is gone")`: as duas
/// linguas de uma mensagem, com os mesmos argumentos do `format!`. Cada
/// argumento tem de aparecer nas duas, ou o `format!` recusa -- e e isso que
/// impede o ingles de perder o nome do arquivo que o portugues mostra.
#[macro_export]
macro_rules! texto {
    ($pt:literal, $en:literal $(,)?) => {
        $crate::error::Texto { pt: format!($pt), en: format!($en) }
    };
    ($pt:literal, $en:literal, $($argumento:tt)+) => {
        $crate::error::Texto {
            pt: format!($pt, $($argumento)+),
            en: format!($en, $($argumento)+),
        }
    };
}

/// Erro que atravessa o IPC.
///
/// Uma variante por causa real, e nao um `String` so, porque a tela trata
/// diferente: campanha ausente pede escolher pasta, disco cheio pede
/// providencia do usuario, e JSON corrompido pede olhar o arquivo. Achatar
/// tudo em texto obrigaria o TypeScript a adivinhar por substring.
#[derive(Debug)]
pub enum AppError {
    /// Nenhuma campanha aberta. Toda operacao de vault depende de uma.
    NoCampaign,
    /// A pasta existe mas nao e uma campanha, ou esta com o `config.json` ilegivel.
    NotACampaign(String),
    /// A campanha estava aberta e a pasta dela deixou de existir no disco.
    ///
    /// Apagada, movida ou num volume que foi desconectado, com o Mestre ainda
    /// na mesa. Variante propria, e nao `NoCampaign`, porque a providencia e
    /// outra: ali nao ha campanha e a tela mostra a porta; aqui ha uma, com a
    /// cena inteira ainda na memoria, e a tela tem de dizer QUAL pasta sumiu
    /// para o mestre ir atras dela. Ver `Vault::verificar`.
    CampanhaSumiu(String),
    Io(std::io::Error),
    /// Arquivo do vault que existe mas nao decodifica.
    Malformed { file: String, cause: String },
    Db(rusqlite::Error),
    /// O tipo de arquivo nao entra no acervo.
    UnsupportedKind(String),
    /// A pasta escolhida nao e uma extensao, ou o manifesto dela nao serve.
    ExtensaoInvalida(Texto),
    /// Nao houve como abrir um endereco no navegador do sistema.
    ///
    /// Variante propria porque a providencia e do USUARIO e nao do aplicativo:
    /// a maquina nao tem quem abra link, e o caminho de saida e colar o
    /// endereco no navegador a mao. Ver `abrir_no_navegador`.
    SemNavegador(String),
    /// A extensao pede uma API mais nova que a deste aplicativo.
    ///
    /// Variante propria, e nao uma `ExtensaoInvalida` com o texto dentro,
    /// porque a providencia e outra: aqui quem esta velho e o ATO20, e a tela
    /// tem de dizer isso em vez de mandar falar com quem escreveu a extensao.
    ExtensaoIncompativel { pede: u32, temos: u32 },
    /// Nao deu para baixar um plugin do catalogo: sem rede, GitHub fora, zip
    /// grande demais.
    ///
    /// Variante propria porque a providencia e de REDE e nao do plugin: tentar
    /// de novo mais tarde, e nao falar com quem o escreveu. O zip que chegou e
    /// nao serve e `ExtensaoInvalida`. Ver `catalogo::instalar`.
    DownloadFalhou(Texto),
    /// A pasta escolhida para importar nao serve: nao e pasta, ou e grande
    /// demais para ser o que se quer importar. Ver `importar::ler_pasta`.
    PastaInvalida(Texto),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NoCampaign => write!(f, "Nenhuma campanha aberta."),
            Self::NotACampaign(path) => {
                write!(f, "A pasta {path} nao e uma campanha do ATO20.")
            }
            Self::CampanhaSumiu(path) => {
                write!(f, "A pasta da campanha sumiu do disco: {path}")
            }
            Self::Io(cause) => write!(f, "Falha de disco: {cause}"),
            Self::Malformed { file, cause } => {
                write!(f, "O arquivo {file} esta ilegivel: {cause}")
            }
            Self::Db(cause) => write!(f, "Falha no banco de estado: {cause}"),
            Self::UnsupportedKind(mime) => {
                write!(f, "Tipo de arquivo nao suportado: {mime}")
            }
            Self::SemNavegador(motivo) => {
                write!(f, "Nao foi possivel abrir o navegador. {motivo}")
            }
            Self::ExtensaoInvalida(motivo) => {
                write!(f, "Extensao invalida: {}", motivo.pt)
            }
            Self::ExtensaoIncompativel { pede, temos } => write!(
                f,
                "Esta extensao pede a API {pede} e este ATO20 fala a {temos}. Atualize o aplicativo."
            ),
            Self::DownloadFalhou(motivo) => {
                write!(f, "Nao foi possivel baixar o plugin: {}.", motivo.pt)
            }
            Self::PastaInvalida(motivo) => write!(f, "{}", motivo.pt),
        }
    }
}

impl AppError {
    /// A mesma mensagem do `Display`, em ingles. Ver `Texto`.
    pub fn em_ingles(&self) -> String {
        match self {
            Self::NoCampaign => "No campaign open.".to_string(),
            Self::NotACampaign(path) => format!("The folder {path} is not an ATO20 campaign."),
            Self::CampanhaSumiu(path) => format!("The campaign folder is gone from the disk: {path}"),
            Self::Io(cause) => format!("Disk error: {cause}"),
            Self::Malformed { file, cause } => format!("The file {file} is unreadable: {cause}"),
            Self::Db(cause) => format!("State database error: {cause}"),
            Self::UnsupportedKind(mime) => format!("Unsupported file type: {mime}"),
            Self::SemNavegador(motivo) => format!("Could not open the browser. {motivo}"),
            Self::ExtensaoInvalida(motivo) => format!("Invalid plugin: {}", motivo.en),
            Self::ExtensaoIncompativel { pede, temos } => format!(
                "This plugin needs API {pede} and this ATO20 speaks {temos}. Update the app."
            ),
            Self::DownloadFalhou(motivo) => {
                format!("Could not download the plugin: {}.", motivo.en)
            }
            Self::PastaInvalida(motivo) => motivo.en.clone(),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(cause: std::io::Error) -> Self {
        Self::Io(cause)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(cause: rusqlite::Error) -> Self {
        Self::Db(cause)
    }
}

/// O `code` acompanha a mensagem para a tela poder ramificar sem ler texto.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;

        let code = match self {
            Self::NoCampaign => "sem-campanha",
            Self::NotACampaign(_) => "nao-e-campanha",
            Self::CampanhaSumiu(_) => "campanha-sumiu",
            Self::Io(_) => "disco",
            Self::Malformed { .. } => "ilegivel",
            Self::Db(_) => "banco",
            Self::UnsupportedKind(_) => "tipo-nao-suportado",
            Self::SemNavegador(_) => "sem-navegador",
            Self::ExtensaoInvalida(_) => "extensao-invalida",
            Self::ExtensaoIncompativel { .. } => "extensao-incompativel",
            Self::DownloadFalhou(_) => "download",
            Self::PastaInvalida(_) => "pasta-invalida",
        };

        let mut out = serializer.serialize_struct("AppError", 3)?;
        out.serialize_field("code", code)?;
        out.serialize_field("message", &self.to_string())?;
        out.serialize_field("messageEn", &self.em_ingles())?;
        out.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
