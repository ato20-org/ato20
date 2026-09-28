pub mod assets;
pub mod atomic;
pub mod board;
pub mod characters;
pub mod documentos;
pub mod inventory;
pub mod mime;
pub mod modelos;
pub mod variantes;
pub mod players;
pub mod session;
pub mod slug;
pub mod zip;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use atomic::{read_json, write_json};

/// Versao do formato do vault.
///
/// Gravada no `config.json` para uma versao futura saber migrar uma campanha
/// antiga em vez de abri-la errada em silencio. Uma campanha com versao MAIOR
/// que esta e recusada: abrir com codigo velho um formato novo grava por cima
/// do que nao entende.
pub const VAULT_VERSION: u32 = 1;

/// Identidade da campanha, no `config.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub versao: u32,
    pub nome: String,
    /// O codigo que o Jogador e o Espectador digitam para achar esta mesa.
    ///
    /// Nasce com a campanha e viaja no zip: e o mesmo codigo depois de
    /// importar noutra maquina, senao todo jogador teria de reconfigurar o
    /// celular a cada troca de aparelho do mestre.
    pub codigo: String,
    #[serde(rename = "criadaEm")]
    pub criada_em: i64,
}

/// Uma campanha aberta.
#[derive(Debug, Clone)]
pub struct Vault {
    pub root: PathBuf,
    pub config: Config,
}

/// O que a tela precisa saber da campanha aberta.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignInfo {
    pub path: String,
    pub nome: String,
    pub codigo: String,
    pub versao: u32,
}

impl Vault {
    pub fn config_path(root: &Path) -> PathBuf {
        root.join("config.json")
    }

    /// A identidade de uma campanha que NAO esta aberta.
    ///
    /// Existe para a porta do Mestre, que lista as recentes: ela quer o nome
    /// e a data de nascimento de cada pasta sem montar um `Vault` para cada uma
    /// -- abrir doze campanhas para desenhar doze linhas.
    ///
    /// Sem a checagem de versao do `open`, de proposito. Ali ela protege quem
    /// vai ESCREVER na campanha; aqui quem le so quer desenhar uma linha, e uma
    /// campanha de formato futuro deve aparecer na lista para poder ser
    /// escolhida -- e recusada pelo `open`, que e onde a recusa tem o que
    /// dizer.
    pub fn read_config(root: &Path) -> AppResult<Config> {
        read_json(&Self::config_path(root))?
            .ok_or_else(|| AppError::NotACampaign(root.display().to_string()))
    }

    pub fn scenes_dir(&self) -> PathBuf {
        self.root.join("cenas")
    }

    pub fn assets_dir(&self) -> PathBuf {
        self.root.join("assets")
    }

    pub fn order_path(&self) -> PathBuf {
        self.root.join("ordem.json")
    }

    pub fn assets_index_path(&self) -> PathBuf {
        self.root.join("assets.json")
    }

    pub fn folders_path(&self) -> PathBuf {
        self.root.join("pastas.json")
    }

    pub fn portraits_path(&self) -> PathBuf {
        self.root.join("retratos.json")
    }

    pub fn track_path(&self) -> PathBuf {
        self.root.join("trilha.json")
    }

    /// Estado que NAO viaja no zip: sessao, jogadores, conectados.
    ///
    /// Escondido num ponto e fora do export de proposito. A regra que decide o
    /// que mora aqui e uma pergunta so: se este arquivo se perder, a campanha
    /// quebra? Se sim, o lugar e o vault, nao aqui.
    pub fn state_dir(&self) -> PathBuf {
        self.root.join(".ato20")
    }

    /// A pasta ainda esta no disco.
    ///
    /// O `Vault` e um caminho guardado na memoria, e nada o revalida sozinho:
    /// com a pasta apagada por fora, `read_json` devolvia `None` para tudo -- a
    /// mesa aparecia VAZIA, como campanha nova -- e a primeira gravacao
    /// recriava a pasta pela metade, sem `config.json`, porque `write_atomic`
    /// cria o diretorio-pai. Um esqueleto que a proxima abertura recusa.
    ///
    /// Chamada em toda entrada -- `com_vault` nos comandos, as rotas do daemon
    /// -- e nao dentro de cada leitura e escrita: um `stat` por operacao, ao
    /// lado do I/O que a operacao ja faz, e nenhuma escrita chega a acontecer
    /// numa campanha morta. A janela que sobra e apagar a pasta DURANTE um
    /// comando, e ela nao paga um `create_dir_all` condicional em cada funcao
    /// de escrita.
    ///
    /// Olha o `config.json` e nao a raiz: uma raiz que existe sem ele e
    /// justamente o esqueleto descrito acima.
    pub fn verificar(&self) -> AppResult<()> {
        if Self::config_path(&self.root).is_file() {
            return Ok(());
        }

        Err(AppError::CampanhaSumiu(self.root.display().to_string()))
    }

    pub fn info(&self) -> CampaignInfo {
        CampaignInfo {
            path: self.root.display().to_string(),
            nome: self.config.nome.clone(),
            codigo: self.config.codigo.clone(),
            versao: self.config.versao,
        }
    }

    /// Abre uma campanha existente.
    pub fn open(root: impl AsRef<Path>) -> AppResult<Self> {
        let root = root.as_ref().to_path_buf();

        let config: Config = read_json(&Self::config_path(&root))?
            .ok_or_else(|| AppError::NotACampaign(root.display().to_string()))?;

        if config.versao > VAULT_VERSION {
            return Err(AppError::NotACampaign(format!(
                "{} foi criada por uma versao mais nova do ATO20 (formato {}, este entende {})",
                root.display(),
                config.versao,
                VAULT_VERSION
            )));
        }

        Ok(Self { root, config })
    }

    /// Cria a campanha em `root`.
    ///
    /// Recusa pasta que ja tem `config.json`: abrir e criar sao gestos
    /// diferentes, e sobrescrever a identidade de uma campanha existente
    /// perderia o codigo que os celulares da mesa conhecem.
    pub fn create(root: impl AsRef<Path>, nome: &str) -> AppResult<Self> {
        let root = root.as_ref().to_path_buf();

        if Self::config_path(&root).exists() {
            return Self::open(root);
        }

        std::fs::create_dir_all(&root)?;

        let config = Config {
            versao: VAULT_VERSION,
            nome: nome.trim().to_string(),
            codigo: new_room_code(),
            criada_em: now_ms(),
        };

        write_json(&Self::config_path(&root), &config)?;

        let vault = Self { root, config };
        std::fs::create_dir_all(vault.scenes_dir())?;
        std::fs::create_dir_all(vault.assets_dir())?;
        std::fs::create_dir_all(vault.state_dir())?;

        Ok(vault)
    }
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Alfabeto do codigo da mesa.
///
/// Sem `O`, `0`, `I`, `1` e `L`: o codigo e lido em voz alta na mesa e digitado
/// num celular, e as duas confusoes classicas custam uma tentativa a cada vez.
const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";

fn new_room_code() -> String {
    // Uuid v4 e a fonte de aleatoriedade que o crate ja fornece; nao e segredo
    // criptografico, e o codigo da mesa nao pretende ser -- ver a nota de
    // seguranca no README sobre a rede local.
    let bytes = uuid::Uuid::new_v4().as_bytes().to_owned();

    bytes
        .iter()
        .take(6)
        .map(|b| CODE_ALPHABET[*b as usize % CODE_ALPHABET.len()] as char)
        .collect()
}
