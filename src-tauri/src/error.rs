use serde::{Serialize, Serializer};

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
    Io(std::io::Error),
    /// Arquivo do vault que existe mas nao decodifica.
    Malformed { file: String, cause: String },
    Db(rusqlite::Error),
    /// O tipo de arquivo nao entra no acervo.
    UnsupportedKind(String),
    /// A pasta escolhida nao e uma extensao, ou o manifesto dela nao serve.
    ExtensaoInvalida(String),
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
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NoCampaign => write!(f, "Nenhuma campanha aberta."),
            Self::NotACampaign(path) => {
                write!(f, "A pasta {path} nao e uma campanha do ATO20.")
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
                write!(f, "Extensao invalida: {motivo}")
            }
            Self::ExtensaoIncompativel { pede, temos } => write!(
                f,
                "Esta extensao pede a API {pede} e este ATO20 fala a {temos}. Atualize o aplicativo."
            ),
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
            Self::Io(_) => "disco",
            Self::Malformed { .. } => "ilegivel",
            Self::Db(_) => "banco",
            Self::UnsupportedKind(_) => "tipo-nao-suportado",
            Self::SemNavegador(_) => "sem-navegador",
            Self::ExtensaoInvalida(_) => "extensao-invalida",
            Self::ExtensaoIncompativel { .. } => "extensao-incompativel",
        };

        let mut out = serializer.serialize_struct("AppError", 2)?;
        out.serialize_field("code", code)?;
        out.serialize_field("message", &self.to_string())?;
        out.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
