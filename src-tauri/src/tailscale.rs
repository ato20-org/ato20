//! O Tailscale do mestre, pela CLI.
//!
//! A mesa pela internet sem servidor do ATO20: o Funnel do Tailscale publica a
//! porta do daemon num `https://<maquina>.<tailnet>.ts.net`, e o jogador entra
//! pelo navegador sem instalar nada. O aplicativo nao conhece a conta do mestre
//! nem guarda credencial nenhuma: ele pergunta e manda na CLI que o proprio
//! mestre instalou, como ele faria no terminal.
//!
//! CLI e nao a LocalAPI: a CLI e a mesma nos tres sistemas, e a LocalAPI muda
//! de transporte de sistema para sistema e nao e contrato publico.
//!
//! So a porta 443, e so quando ela esta livre ou ja e nossa: um Funnel que o
//! mestre usa para outra coisa nao e tomado, e fechar desliga so a 443 em vez
//! do `funnel reset`, que apagaria tudo o que ele configurou.

use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

/// O que o convite precisa saber do Tailscale desta maquina.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Estado {
    /// A CLI existe nesta maquina.
    pub instalado: bool,
    /// Logado e falando com o servidor da Tailscale. Uma maquina removida da
    /// tailnet continua com a interface e o IP, e e isto que a denuncia.
    pub online: bool,
    /// O nome MagicDNS, sem o ponto final: `valb.tail59085e.ts.net`.
    pub nome: Option<String>,
    /// O Funnel aponta para o daemon: o endereco publico da mesa.
    pub funil: Option<String>,
    /// O que o mestre precisa resolver, quando ha algo.
    pub problema: Option<Problema>,
}

/// Por que o Funnel nao abre, com o que a tela oferece para resolver.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "tipo", rename_all = "camelCase")]
pub enum Problema {
    /// Instalado, mas sem login, desligado ou fora da tailnet.
    Desconectado,
    /// O Funnel nao esta liberado na tailnet. O link leva a pagina que libera.
    FunilNaoLiberado { link: String },
    /// Linux: so root ou o operador mexem no Serve.
    SemOperador { comando: String },
    /// A 443 desta maquina ja serve outra coisa, e o ATO20 nao a toma.
    PortaOcupada,
    /// O resto, com a ultima linha que a CLI disse.
    Outro { mensagem: String },
}

/// Quanto se espera pela CLI. Ela fala com o `tailscaled` local, e qualquer
/// coisa acima disso e o daemon dela travado, nao lentidao.
const LIMITE_DE_CONSULTA: Duration = Duration::from_secs(5);

/// Quanto se espera para abrir. Mais folga: a primeira abertura pede o
/// certificado HTTPS. E quando o Funnel nao esta liberado a CLI fica esperando
/// alguem liberar, e o limite e o que devolve o link para a tela.
const LIMITE_DE_ABERTURA: Duration = Duration::from_secs(20);

/// A situacao agora.
pub fn estado(porta: u16) -> Estado {
    if cli().is_none() {
        return Estado::default();
    }

    let desconectado = Estado {
        instalado: true,
        problema: Some(Problema::Desconectado),
        ..Estado::default()
    };

    let Some(status) = consultar(&["status", "--json"]) else {
        return desconectado;
    };
    let (online, nome) = ler_status(&status);
    if !online {
        return Estado {
            nome,
            ..desconectado
        };
    }

    let funil = match consultar(&["funnel", "status", "--json"]).map(|json| ler_porta(&json, porta))
    {
        Some(Porta443::Nossa(host)) => Some(format!("https://{host}")),
        _ => None,
    };

    Estado {
        instalado: true,
        online: true,
        nome,
        funil,
        problema: None,
    }
}

/// Abre o Funnel para o daemon e devolve a situacao depois.
pub fn abrir(porta: u16) -> Estado {
    let atual = estado(porta);
    if !atual.online || atual.funil.is_some() {
        return atual;
    }

    if let Some(Porta443::Ocupada) =
        consultar(&["funnel", "status", "--json"]).map(|json| ler_porta(&json, porta))
    {
        return Estado {
            problema: Some(Problema::PortaOcupada),
            ..atual
        };
    }

    let alvo = porta.to_string();
    let problema = match rodar(&["funnel", "--bg", "--yes", &alvo], LIMITE_DE_ABERTURA) {
        Ok(saida) if saida.sucesso => None,
        Ok(saida) => Some(problema_de(&saida.texto)),
        Err(causa) => Some(Problema::Outro { mensagem: causa }),
    };

    match problema {
        Some(problema) => Estado {
            problema: Some(problema),
            ..atual
        },
        None => {
            let depois = estado(porta);
            if depois.funil.is_some() {
                return depois;
            }

            Estado {
                problema: Some(Problema::Outro {
                    mensagem: "o Funnel nao apareceu depois de aberto".into(),
                }),
                ..depois
            }
        }
    }
}

/// Fecha o Funnel, se ele for nosso, e devolve a situacao depois.
pub fn fechar(porta: u16) -> Estado {
    fechar_se_nosso(porta);
    estado(porta)
}

/// Fecha sem perguntar nada a ninguem: na saida do aplicativo, e na abertura
/// seguinte a um travamento, porque o `--bg` sobrevive ao processo e ate a
/// reiniciar a maquina. Um Funnel aberto que ninguem lembra e uma porta da
/// casa do mestre aberta para a rua.
pub fn fechar_se_nosso(porta: u16) {
    if cli().is_none() {
        return;
    }

    let nosso = consultar(&["funnel", "status", "--json"])
        .is_some_and(|json| matches!(ler_porta(&json, porta), Porta443::Nossa(_)));
    if !nosso {
        return;
    }

    match rodar(&["funnel", "--https=443", "off"], LIMITE_DE_CONSULTA) {
        Ok(saida) if saida.sucesso => log::info!("tailscale: funnel fechado"),
        Ok(saida) => log::warn!("tailscale: funnel nao fechou: {}", saida.texto.trim()),
        Err(causa) => log::warn!("tailscale: funnel nao fechou: {causa}"),
    }
}

// --- a leitura do que a CLI devolve ------------------------------------------

/// Online e o nome, do `tailscale status --json`.
///
/// `BackendState` diz se o `tailscaled` esta de pe; `Self.Online` diz se o
/// servidor da Tailscale conhece esta maquina. So os dois juntos fazem o
/// endereco responder: com a maquina removida do painel o backend segue
/// `Running`, com IP e tudo, e ninguem a alcanca.
fn ler_status(json: &Value) -> (bool, Option<String>) {
    let rodando = json["BackendState"].as_str() == Some("Running");
    let online = rodando && json["Self"]["Online"].as_bool() == Some(true);
    let nome = json["Self"]["DNSName"]
        .as_str()
        .map(|nome| nome.trim_end_matches('.').to_string())
        .filter(|nome| !nome.is_empty());

    (online, nome)
}

#[derive(Debug, PartialEq, Eq)]
enum Porta443 {
    Livre,
    /// Aberta para a internet e apontando para o daemon. Leva o host.
    Nossa(String),
    /// Servindo outra coisa.
    Ocupada,
}

/// De quem e a 443, pelo `tailscale funnel status --json`.
///
/// O formato e o `ServeConfig` do Tailscale: `TCP` diz o que escuta em cada
/// porta, `Web` o que cada `host:porta` serve por caminho, e `AllowFunnel`
/// quais deles estao abertos para a internet.
fn ler_porta(json: &Value, porta: u16) -> Porta443 {
    if json["TCP"].get("443").is_none() {
        return Porta443::Livre;
    }

    let servico = json["Web"].as_object().and_then(|web| {
        web.iter()
            .find_map(|(chave, servico)| Some((chave.strip_suffix(":443")?, chave, servico)))
    });
    let Some((host, chave, servico)) = servico else {
        // A 443 escuta, mas sem HTTP: um encaminhamento TCP de outra coisa.
        return Porta443::Ocupada;
    };

    let nosso = servico["Handlers"]["/"]["Proxy"]
        .as_str()
        .is_some_and(|proxy| aponta_para(proxy, porta));
    let aberto = json["AllowFunnel"][chave.as_str()].as_bool() == Some(true);

    match (nosso, aberto) {
        (true, true) => Porta443::Nossa(host.to_string()),
        // `tailscale serve` para o daemon, so na tailnet: abrir o Funnel por
        // cima dele nao tira nada de ninguem.
        (true, false) => Porta443::Livre,
        (false, _) => Porta443::Ocupada,
    }
}

fn aponta_para(proxy: &str, porta: u16) -> bool {
    let alvo = proxy.trim_start_matches("http://").trim_end_matches('/');

    alvo == format!("127.0.0.1:{porta}") || alvo == format!("localhost:{porta}")
}

/// O que a falha da CLI quer dizer para o mestre.
fn problema_de(texto: &str) -> Problema {
    if let Some(link) = link_da_tailscale(texto) {
        return Problema::FunilNaoLiberado { link };
    }

    if texto.contains("--operator") || texto.contains("Access denied") {
        let usuario = std::env::var("USER").unwrap_or_else(|_| "$USER".into());
        return Problema::SemOperador {
            comando: format!("sudo tailscale set --operator={usuario}"),
        };
    }

    let mensagem = texto
        .lines()
        .map(str::trim)
        .filter(|linha| !linha.is_empty())
        .last()
        .unwrap_or("a CLI do Tailscale falhou sem dizer por que")
        .to_string();

    Problema::Outro { mensagem }
}

/// O link que a CLI imprime quando falta liberar algo no painel.
fn link_da_tailscale(texto: &str) -> Option<String> {
    let inicio = texto.find("https://login.tailscale.com/")?;
    let link = texto[inicio..].split_whitespace().next()?;

    Some(link.to_string())
}

// --- a CLI --------------------------------------------------------------------

/// Onde a CLI mora.
///
/// O PATH primeiro, e depois onde cada instalador oficial a poe. Procurado a
/// cada vez, e nao guardado: o mestre que instala o Tailscale com o ATO20
/// aberto tem de ver o botao sem reabrir nada.
fn cli() -> Option<PathBuf> {
    let nome = if cfg!(windows) {
        "tailscale.exe"
    } else {
        "tailscale"
    };

    if let Some(caminhos) = std::env::var_os("PATH") {
        if let Some(achado) = std::env::split_paths(&caminhos)
            .map(|pasta| pasta.join(nome))
            .find(|candidato| candidato.is_file())
        {
            return Some(achado);
        }
    }

    let fixos: &[&str] = if cfg!(windows) {
        &[r"C:\Program Files\Tailscale\tailscale.exe"]
    } else if cfg!(target_os = "macos") {
        &[
            "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
            "/opt/homebrew/bin/tailscale",
            "/usr/local/bin/tailscale",
        ]
    } else {
        &["/usr/bin/tailscale", "/usr/local/bin/tailscale"]
    };

    fixos
        .iter()
        .map(PathBuf::from)
        .find(|candidato| candidato.is_file())
}

struct Saida {
    sucesso: bool,
    /// A saida e o erro juntos: a CLI escreve o link e a mensagem num ou
    /// noutro conforme a versao.
    texto: String,
}

/// Uma consulta que devolve JSON. Qualquer falha e `None`: quem pergunta trata
/// como "nao sei", que na tela e o mesmo que desconectado.
fn consultar(args: &[&str]) -> Option<Value> {
    let saida = rodar(args, LIMITE_DE_CONSULTA).ok()?;
    if !saida.sucesso {
        return None;
    }

    serde_json::from_str(&saida.texto).ok()
}

/// Roda a CLI com tempo-limite.
///
/// Esperar com `try_wait`, e nao com `output()`: a CLI fica parada esperando
/// alguem liberar o Funnel no painel, e sem limite o botao da tela ficaria
/// girando para sempre. Estourado o limite, o processo morre e o que ele ja
/// disse (o link) volta mesmo assim.
fn rodar(args: &[&str], limite: Duration) -> Result<Saida, String> {
    let caminho = cli().ok_or_else(|| "Tailscale nao instalado".to_string())?;

    let mut comando = Command::new(caminho);
    comando
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    sem_janela(&mut comando);

    let mut filho = comando
        .spawn()
        .map_err(|causa| format!("a CLI do Tailscale nao abriu: {causa}"))?;

    let ler = |fluxo: Option<Box<dyn Read + Send>>| {
        std::thread::spawn(move || {
            let mut texto = String::new();
            if let Some(mut fluxo) = fluxo {
                let _ = fluxo.read_to_string(&mut texto);
            }
            texto
        })
    };
    let saida = ler(filho
        .stdout
        .take()
        .map(|f| Box::new(f) as Box<dyn Read + Send>));
    let erro = ler(filho
        .stderr
        .take()
        .map(|f| Box::new(f) as Box<dyn Read + Send>));

    let inicio = Instant::now();
    let sucesso = loop {
        match filho.try_wait() {
            Ok(Some(status)) => break status.success(),
            Ok(None) if inicio.elapsed() < limite => std::thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                let _ = filho.kill();
                let _ = filho.wait();
                break false;
            }
            Err(causa) => return Err(format!("a CLI do Tailscale sumiu: {causa}")),
        }
    };

    let mut texto = saida.join().unwrap_or_default();
    texto.push_str(&erro.join().unwrap_or_default());

    Ok(Saida { sucesso, texto })
}

/// No Windows, cada processo de console abre uma janela preta por um instante.
/// Sem isto, abrir o convite piscaria uma janela a cada consulta.
#[cfg(windows)]
fn sem_janela(comando: &mut Command) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    comando.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn sem_janela(_: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn online_pede_o_backend_de_pe_e_a_maquina_conhecida() {
        let viva = json!({
            "BackendState": "Running",
            "Self": { "Online": true, "DNSName": "valb.tail59085e.ts.net." }
        });
        assert_eq!(
            ler_status(&viva),
            (true, Some("valb.tail59085e.ts.net".to_string()))
        );

        // A maquina removida do painel: backend de pe, servidor sem ela.
        let removida = json!({
            "BackendState": "Running",
            "Self": { "Online": false, "DNSName": "valb.tail59085e.ts.net." }
        });
        assert!(!ler_status(&removida).0);

        let sem_login = json!({ "BackendState": "NeedsLogin", "Self": { "DNSName": "" } });
        assert_eq!(ler_status(&sem_login), (false, None));
    }

    #[test]
    fn a_443_e_nossa_so_aberta_e_apontando_para_o_daemon() {
        let nossa = json!({
            "TCP": { "443": { "HTTPS": true } },
            "Web": { "pc.ts.net:443": { "Handlers": { "/": { "Proxy": "http://127.0.0.1:20200" } } } },
            "AllowFunnel": { "pc.ts.net:443": true }
        });
        assert_eq!(
            ler_porta(&nossa, 20200),
            Porta443::Nossa("pc.ts.net".into())
        );

        // Outra porta do daemon: e de outra janela do ATO20, nao desta.
        assert_eq!(ler_porta(&nossa, 20201), Porta443::Ocupada);

        let so_na_tailnet = json!({
            "TCP": { "443": { "HTTPS": true } },
            "Web": { "pc.ts.net:443": { "Handlers": { "/": { "Proxy": "http://localhost:20200/" } } } }
        });
        assert_eq!(ler_porta(&so_na_tailnet, 20200), Porta443::Livre);

        let outro_servico = json!({
            "TCP": { "443": { "HTTPS": true } },
            "Web": { "pc.ts.net:443": { "Handlers": { "/": { "Proxy": "http://127.0.0.1:8096" } } } },
            "AllowFunnel": { "pc.ts.net:443": true }
        });
        assert_eq!(ler_porta(&outro_servico, 20200), Porta443::Ocupada);

        let tcp_cru = json!({ "TCP": { "443": { "TCPForward": "127.0.0.1:22" } } });
        assert_eq!(ler_porta(&tcp_cru, 20200), Porta443::Ocupada);

        assert_eq!(ler_porta(&json!({}), 20200), Porta443::Livre);
    }

    #[test]
    fn a_falha_da_cli_vira_o_que_o_mestre_faz() {
        let nao_liberado = "Funnel is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/funnel?node=abc123\n\n";
        assert_eq!(
            problema_de(nao_liberado),
            Problema::FunilNaoLiberado {
                link: "https://login.tailscale.com/f/funnel?node=abc123".into()
            }
        );

        let sem_operador = "Access denied: serve config denied\n\nUse 'sudo tailscale funnel 20200'.\nTo not require root, use 'sudo tailscale set --operator=$USER' once.";
        assert!(matches!(
            problema_de(sem_operador),
            Problema::SemOperador { .. }
        ));

        assert_eq!(
            problema_de("algo deu errado\n\nfalha final\n"),
            Problema::Outro {
                mensagem: "falha final".into()
            }
        );
    }
}
