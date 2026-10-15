//! A presenca no Discord: o "Jogando ATO20" com o que o mestre esta fazendo.
//!
//! O texto nasce na tela -- e la que moram o idioma e o estado do Mestre -- e
//! chega aqui pronto. Este modulo so o leva ao Discord, pelo socket IPC que o
//! cliente do Discord abre na maquina. Nada sai para a rede: e uma conversa
//! entre dois processos locais.
//!
//! A mao, e nao com o crate `discord-rich-presence`: o protocolo e um cabecalho
//! de oito bytes e um JSON, e `serde_json` e `uuid` ja estao no binario. Escrever
//! aqui tambem deixa decidir ONDE procurar o socket -- o Discord de Flatpak e o
//! de Snap o abrem em subpastas que um crate generico nao precisa conhecer.

use std::io::{self, Read, Write};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::State;

/// O id da aplicacao no Discord Developer Portal.
///
/// E o NOME dessa aplicacao que o Discord mostra em "Jogando ...", e e por isso
/// que ela se chama ATO20 la. Nao e segredo: todo programa com presenca no
/// Discord leva o seu no binario.
///
/// Vazio desliga o modulo inteiro -- a thread nem sobe.
const APLICACAO: &str = "1557475417261088868";

/// A imagem grande do cartao. Por URL, e nao por asset subido no portal: o
/// icone ja esta publico no repositorio, e assim o portal so precisa do nome.
const IMAGEM: &str =
    "https://raw.githubusercontent.com/ato20-org/ato20/main/src-tauri/icons/icon.png";

/// O intervalo minimo entre dois envios.
///
/// O Discord aceita cinco `SET_ACTIVITY` a cada vinte segundos e descarta o
/// resto. Trocar de cena tres vezes seguidas e um gesto so; o que importa e o
/// ULTIMO estado, e e ele que sai depois do respiro.
const RESPIRO: Duration = Duration::from_secs(4);

/// De quanto em quanto tempo tentar de novo com o Discord fechado.
///
/// O mestre abre o Discord depois do ATO20 com frequencia. Uma tentativa e uma
/// chamada de `connect` num caminho que nao existe: nada que pese.
const REPESCA: Duration = Duration::from_secs(20);

/// De quanto em quanto tempo reenviar o mesmo estado.
///
/// Um socket morto so se revela quando se escreve nele: se o Discord reiniciar
/// com o mestre parado no mesmo mapa, sem reenvio a presenca sumiria ate a
/// proxima troca de cena. Um envio por minuto fica longe do limite.
const RENOVO: Duration = Duration::from_secs(60);

/// O maior quadro que se aceita do Discord. As respostas tem poucas centenas
/// de bytes; um tamanho absurdo no cabecalho e socket dessincronizado.
const MAIOR_QUADRO: usize = 64 * 1024;

const OP_HANDSHAKE: u32 = 0;
const OP_QUADRO: u32 = 1;
const OP_FECHAR: u32 = 2;
const OP_PING: u32 = 3;
const OP_PONG: u32 = 4;

/// O que a tela pede para mostrar. Espelha `Atividade` de `lib/presenca.ts`.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Atividade {
    /// A primeira linha: "Editando mapa", "Mestrando campanha".
    pub detalhes: String,
    /// A segunda linha, quando ha.
    pub estado: Option<String>,
    /// Quando a sessao comecou, em ms desde a epoca. Vira o cronometro.
    pub inicio: Option<i64>,
    /// Jogadores presentes e cadastrados: o "(2 de 4)" depois do estado.
    pub grupo: Option<[u32; 2]>,
    pub botao: Option<Botao>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Botao {
    pub rotulo: String,
    pub url: String,
}

/// A caixa de correio da thread. `None` na fila e "limpar a presenca".
pub struct Presenca {
    fila: Sender<Option<Atividade>>,
}

impl Presenca {
    /// Sobe a thread, se houver aplicacao configurada.
    ///
    /// Thread propria, e nao uma tarefa no tokio do daemon: tudo aqui e E/S
    /// bloqueante num socket local, e um Discord que demore a responder nao
    /// pode ocupar um trabalhador de quem serve a TV.
    pub fn iniciar() -> Self {
        let (fila, caixa) = mpsc::channel();

        if !APLICACAO.is_empty() {
            let subiu = std::thread::Builder::new()
                .name("presenca".into())
                .spawn(move || correr(caixa));

            if let Err(causa) = subiu {
                log::warn!("presenca do Discord nao subiu: {causa}");
            }
        }

        // Sem thread o receptor caiu junto com `caixa`, e todo envio falha em
        // silencio -- que e o comportamento certo para "desligado".
        Self { fila }
    }
}

/// Troca a presenca. `None` limpa.
///
/// Nunca falha para a tela: presenca e enfeite, e o Mestre nao tem o que fazer
/// com um Discord fechado.
#[tauri::command]
pub fn definir_presenca(presenca: State<'_, Presenca>, atividade: Option<Atividade>) {
    let _ = presenca.fila.send(atividade);
}

/// O laco da thread: guarda o ULTIMO pedido e o entrega quando der.
fn correr(caixa: Receiver<Option<Atividade>>) {
    let mut conexao: Option<Conexao> = None;
    let mut desejada: Option<Atividade> = None;
    // Comeca entregue: antes do primeiro pedido nao ha nada para mostrar, e
    // conectar so para limpar um cartao vazio seria trabalho a toa.
    let mut entregue = true;
    let mut ultimo_envio: Option<Instant> = None;
    let mut ultima_tentativa: Option<Instant> = None;
    // So para nao repetir o mesmo aviso a cada vinte segundos no log.
    let mut avisou = false;

    loop {
        let espera = if entregue {
            // Ocioso. Com algo na tela do Discord, o renovo; sem, so um pedido
            // acorda -- renovar um cartao limpo nao confere nada.
            conexao
                .as_ref()
                .filter(|_| desejada.is_some())
                .map(|_| RENOVO)
        } else {
            let respiro = falta(ultimo_envio, RESPIRO);
            let repesca = if conexao.is_none() {
                falta(ultima_tentativa, REPESCA)
            } else {
                Duration::ZERO
            };
            Some(respiro.max(repesca))
        };

        let recebido = match espera {
            None => match caixa.recv() {
                Ok(pedido) => Some(pedido),
                Err(_) => return,
            },
            Some(tempo) => match caixa.recv_timeout(tempo) {
                Ok(pedido) => Some(pedido),
                Err(RecvTimeoutError::Timeout) => None,
                Err(RecvTimeoutError::Disconnected) => return,
            },
        };

        match recebido {
            Some(pedido) => {
                // Os que chegaram juntos: so o ultimo vale.
                let mut ultimo = pedido;
                loop {
                    match caixa.try_recv() {
                        Ok(seguinte) => ultimo = seguinte,
                        Err(TryRecvError::Empty) => break,
                        Err(TryRecvError::Disconnected) => return,
                    }
                }

                if ultimo != desejada {
                    desejada = ultimo;
                    entregue = false;
                }
            }
            // O renovo venceu: reenviar o mesmo, para descobrir se o socket
            // ainda tem alguem do outro lado.
            None if entregue => entregue = false,
            None => {}
        }

        if entregue || falta(ultimo_envio, RESPIRO) > Duration::ZERO {
            continue;
        }

        if conexao.is_none() {
            // Limpar sem conexao e o mesmo que ja estar limpo.
            if desejada.is_none() {
                entregue = true;
                continue;
            }

            if falta(ultima_tentativa, REPESCA) > Duration::ZERO {
                continue;
            }

            ultima_tentativa = Some(Instant::now());

            match Conexao::abrir() {
                Ok(nova) => {
                    log::info!("presenca do Discord conectada");
                    avisou = false;
                    conexao = Some(nova);
                }
                // Discord fechado e o caso comum, e nao merece log.
                Err(causa) if causa.kind() == io::ErrorKind::NotFound => continue,
                Err(causa) => {
                    if !avisou {
                        log::warn!("presenca do Discord nao conectou: {causa}");
                        avisou = true;
                    }
                    continue;
                }
            }
        }

        let Some(atual) = conexao.as_mut() else {
            continue;
        };

        ultimo_envio = Some(Instant::now());

        match atual.definir(desejada.as_ref()) {
            Ok(()) => entregue = true,
            Err(causa) => {
                // O Discord fechou. Fica pendente, e a repesca o reentrega.
                log::info!("presenca do Discord desconectada: {causa}");
                conexao = None;
                ultima_tentativa = Some(Instant::now());
            }
        }
    }
}

/// Quanto falta para `intervalo` passar desde `desde`. Zero se nunca houve.
fn falta(desde: Option<Instant>, intervalo: Duration) -> Duration {
    desde.map_or(Duration::ZERO, |momento| {
        intervalo.saturating_sub(momento.elapsed())
    })
}

#[cfg(unix)]
type Socket = std::os::unix::net::UnixStream;

#[cfg(windows)]
type Socket = std::fs::File;

struct Conexao {
    socket: Socket,
}

impl Conexao {
    /// O primeiro socket que aceitar, ja com o aperto de mao feito.
    fn abrir() -> io::Result<Self> {
        let mut ultimo_erro = io::Error::from(io::ErrorKind::NotFound);

        for caminho in candidatos() {
            match conectar(&caminho) {
                Ok(socket) => {
                    let mut conexao = Self { socket };
                    conexao.apertar_a_mao()?;
                    return Ok(conexao);
                }
                Err(causa) if causa.kind() == io::ErrorKind::NotFound => {}
                Err(causa) => ultimo_erro = causa,
            }
        }

        Err(ultimo_erro)
    }

    fn apertar_a_mao(&mut self) -> io::Result<()> {
        escrever(
            &mut self.socket,
            OP_HANDSHAKE,
            &json!({ "v": 1, "client_id": APLICACAO }),
        )?;

        // A resposta e o `READY`. Um id de aplicacao recusado volta como
        // `OP_FECHAR`, com o motivo no corpo.
        let (op, corpo) = ler(&mut self.socket)?;
        if op == OP_FECHAR {
            return Err(io::Error::other(format!("Discord recusou: {corpo}")));
        }

        Ok(())
    }

    fn definir(&mut self, atividade: Option<&Atividade>) -> io::Result<()> {
        let nonce = uuid::Uuid::new_v4().to_string();
        let pedido = pedido(std::process::id(), atividade, &nonce);

        escrever(&mut self.socket, OP_QUADRO, &pedido)?;

        // Ler a resposta, e nao so escrever: sem leitura o buffer do socket
        // enche ao longo de uma sessao longa. E e ela que diz se o Discord
        // recusou o cartao -- campo grande demais, botao torto.
        loop {
            let (op, corpo) = ler(&mut self.socket)?;

            match op {
                OP_PING => escrever(&mut self.socket, OP_PONG, &corpo)?,
                OP_FECHAR => return Err(io::Error::other(format!("Discord fechou: {corpo}"))),
                OP_QUADRO if corpo["nonce"] == nonce.as_str() => {
                    if corpo["evt"] == "ERROR" {
                        log::warn!("Discord recusou a presenca: {}", corpo["data"]);
                    }
                    return Ok(());
                }
                _ => {}
            }
        }
    }
}

#[cfg(unix)]
fn conectar(caminho: &std::path::Path) -> io::Result<Socket> {
    let socket = Socket::connect(caminho)?;
    // Um Discord travado nao pode prender a thread para sempre num `read`.
    socket.set_read_timeout(Some(Duration::from_secs(5)))?;
    Ok(socket)
}

#[cfg(windows)]
fn conectar(caminho: &std::path::Path) -> io::Result<Socket> {
    std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(caminho)
}

/// Onde o Discord pode ter aberto o socket, na ordem de tentativa.
///
/// O nativo abre em `$XDG_RUNTIME_DIR/discord-ipc-N`; o de Flatpak e o de Snap
/// abrem na pasta da propria caixa de areia, dentro do mesmo diretorio. O `N`
/// vai de 0 a 9 porque cada cliente aberto ao mesmo tempo -- o estavel e o
/// Canary, digamos -- pega o proximo livre.
#[cfg(unix)]
fn candidatos() -> Vec<std::path::PathBuf> {
    let mut bases: Vec<std::path::PathBuf> = ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"]
        .iter()
        .filter_map(std::env::var_os)
        .map(std::path::PathBuf::from)
        .collect();
    bases.push("/tmp".into());

    caminhos_em(&bases)
}

#[cfg(unix)]
fn caminhos_em(bases: &[std::path::PathBuf]) -> Vec<std::path::PathBuf> {
    const CAIXAS: [&str; 5] = [
        "",
        "app/com.discordapp.Discord",
        "app/com.discordapp.DiscordCanary",
        "app/dev.vencord.Vesktop",
        "snap.discord",
    ];

    let mut vistos = std::collections::HashSet::new();
    let mut caminhos = Vec::new();

    for base in bases {
        // `TMPDIR` e `XDG_RUNTIME_DIR` costumam ser o mesmo lugar.
        if !vistos.insert(base) {
            continue;
        }

        for caixa in CAIXAS {
            for n in 0..10 {
                caminhos.push(base.join(caixa).join(format!("discord-ipc-{n}")));
            }
        }
    }

    caminhos
}

#[cfg(windows)]
fn candidatos() -> Vec<std::path::PathBuf> {
    (0..10)
        .map(|n| format!(r"\\.\pipe\discord-ipc-{n}").into())
        .collect()
}

/// O `SET_ACTIVITY`, ou o que limpa a presenca quando nao ha atividade.
fn pedido(pid: u32, atividade: Option<&Atividade>, nonce: &str) -> Value {
    let mut args = json!({ "pid": pid });

    if let Some(atividade) = atividade.and_then(cartao) {
        args["activity"] = atividade;
    }

    json!({ "cmd": "SET_ACTIVITY", "args": args, "nonce": nonce })
}

/// O cartao como o Discord o espera.
///
/// `None` quando nao sobra nem a primeira linha: o Discord recusa o cartao
/// INTEIRO por um campo invalido, e entao vale mais limpar do que mandar algo
/// que vai voltar como erro.
fn cartao(atividade: &Atividade) -> Option<Value> {
    let mut cartao = json!({
        "details": campo(&atividade.detalhes)?,
        "assets": { "large_image": IMAGEM, "large_text": "ATO20" },
    });

    if let Some(estado) = atividade.estado.as_deref().and_then(campo) {
        cartao["state"] = estado.into();
    }

    if let Some(inicio) = atividade.inicio.filter(|ms| *ms > 0) {
        // Em segundos, como a biblioteca oficial de RPC sempre mandou.
        cartao["timestamps"] = json!({ "start": inicio / 1000 });
    }

    // O Discord recusa grupo com presentes acima do total, ou vazio.
    if let Some([presentes, total]) = atividade.grupo {
        if presentes > 0 && presentes <= total {
            cartao["party"] = json!({ "size": [presentes, total] });
        }
    }

    if let Some(botao) = &atividade.botao {
        let rotulo: String = botao.rotulo.trim().chars().take(32).collect();
        if !rotulo.is_empty() && botao.url.starts_with("https://") {
            cartao["buttons"] = json!([{ "label": rotulo, "url": botao.url }]);
        }
    }

    Some(cartao)
}

/// Um texto do cartao dentro dos limites do Discord: de 2 a 128 caracteres.
fn campo(texto: &str) -> Option<String> {
    let texto = texto.trim();
    if texto.chars().count() < 2 {
        return None;
    }

    Some(texto.chars().take(128).collect())
}

/// Um quadro: operacao e tamanho em little-endian, depois o JSON.
///
/// Num `write_all` so, e nao cabecalho e corpo separados: no Windows o pipe do
/// Discord e de MENSAGEM, e duas escritas seriam duas mensagens.
fn escrever(saida: &mut impl Write, op: u32, corpo: &Value) -> io::Result<()> {
    let json = serde_json::to_vec(corpo)?;
    let tamanho = u32::try_from(json.len()).map_err(io::Error::other)?;

    let mut quadro = Vec::with_capacity(8 + json.len());
    quadro.extend_from_slice(&op.to_le_bytes());
    quadro.extend_from_slice(&tamanho.to_le_bytes());
    quadro.extend_from_slice(&json);

    saida.write_all(&quadro)?;
    saida.flush()
}

fn ler(entrada: &mut impl Read) -> io::Result<(u32, Value)> {
    let mut cabecalho = [0u8; 8];
    entrada.read_exact(&mut cabecalho)?;

    let op = u32::from_le_bytes([cabecalho[0], cabecalho[1], cabecalho[2], cabecalho[3]]);
    let tamanho = u32::from_le_bytes([cabecalho[4], cabecalho[5], cabecalho[6], cabecalho[7]]);
    let tamanho = usize::try_from(tamanho).map_err(io::Error::other)?;

    if tamanho > MAIOR_QUADRO {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("quadro de {tamanho} bytes"),
        ));
    }

    let mut corpo = vec![0u8; tamanho];
    entrada.read_exact(&mut corpo)?;

    Ok((op, serde_json::from_slice(&corpo)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn atividade() -> Atividade {
        Atividade {
            detalhes: "Mestrando campanha".into(),
            estado: Some("No mapa".into()),
            inicio: Some(1_760_000_000_123),
            grupo: Some([2, 4]),
            botao: Some(Botao {
                rotulo: "Conhecer o ATO20".into(),
                url: "https://ato20.valbmig.com.br".into(),
            }),
        }
    }

    #[test]
    fn quadro_vai_e_volta() {
        let corpo = json!({ "cmd": "SET_ACTIVITY", "nonce": "a" });
        let mut buffer = Vec::new();
        escrever(&mut buffer, OP_QUADRO, &corpo).unwrap();

        assert_eq!(&buffer[..4], &1u32.to_le_bytes());
        assert_eq!(buffer.len(), 8 + serde_json::to_vec(&corpo).unwrap().len());

        let (op, lido) = ler(&mut buffer.as_slice()).unwrap();
        assert_eq!(op, OP_QUADRO);
        assert_eq!(lido, corpo);
    }

    #[test]
    fn quadro_gigante_e_recusado_antes_de_alocar() {
        let mut buffer = Vec::new();
        buffer.extend_from_slice(&OP_QUADRO.to_le_bytes());
        buffer.extend_from_slice(&u32::MAX.to_le_bytes());

        let erro = ler(&mut buffer.as_slice()).unwrap_err();
        assert_eq!(erro.kind(), io::ErrorKind::InvalidData);
    }

    #[test]
    fn cartao_completo() {
        let cartao = cartao(&atividade()).unwrap();

        assert_eq!(cartao["details"], "Mestrando campanha");
        assert_eq!(cartao["state"], "No mapa");
        assert_eq!(cartao["timestamps"]["start"], 1_760_000_000);
        assert_eq!(cartao["party"]["size"], json!([2, 4]));
        assert_eq!(cartao["buttons"][0]["label"], "Conhecer o ATO20");
        assert_eq!(cartao["assets"]["large_image"], IMAGEM);
    }

    #[test]
    fn cartao_descarta_o_que_o_discord_recusaria() {
        let cartao = cartao(&Atividade {
            detalhes: "Editando mapa".into(),
            // Nome de campanha de uma letra: abaixo do minimo do Discord.
            estado: Some("A".into()),
            inicio: None,
            grupo: Some([5, 4]),
            botao: Some(Botao {
                rotulo: "Site".into(),
                url: "http://inseguro".into(),
            }),
        })
        .unwrap();

        assert!(cartao.get("state").is_none());
        assert!(cartao.get("party").is_none());
        assert!(cartao.get("buttons").is_none());
        assert!(cartao.get("timestamps").is_none());
    }

    #[test]
    fn sem_primeira_linha_nao_ha_cartao() {
        let mut vazia = atividade();
        vazia.detalhes = " ".into();

        assert!(cartao(&vazia).is_none());

        // E o pedido vira o de limpar.
        let pedido = pedido(42, Some(&vazia), "n");
        assert!(pedido["args"].get("activity").is_none());
        assert_eq!(pedido["args"]["pid"], 42);
    }

    #[test]
    fn campo_corta_em_128_caracteres() {
        let longo = "á".repeat(200);
        assert_eq!(campo(&longo).unwrap().chars().count(), 128);
    }

    #[test]
    fn pedido_de_limpar_nao_leva_atividade() {
        let pedido = pedido(7, None, "n");

        assert_eq!(pedido["cmd"], "SET_ACTIVITY");
        assert!(pedido["args"].get("activity").is_none());
    }

    #[test]
    fn atividade_chega_da_tela_em_camel_case() {
        let lida: Atividade = serde_json::from_value(json!({
            "detalhes": "Editando quadro",
            "estado": null,
            "inicio": null,
            "grupo": [1, 3],
            "botao": { "rotulo": "Conhecer o ATO20", "url": "https://ato20.valbmig.com.br" },
        }))
        .unwrap();

        assert_eq!(lida.grupo, Some([1, 3]));
    }

    #[cfg(unix)]
    #[test]
    fn caminhos_cobrem_flatpak_e_nao_repetem_base() {
        let base = std::path::PathBuf::from("/run/user/1000");
        let caminhos = caminhos_em(&[base.clone(), base.clone()]);

        assert_eq!(caminhos.len(), 50);
        assert_eq!(caminhos[0], base.join("discord-ipc-0"));
        assert!(caminhos.contains(&base.join("app/com.discordapp.Discord/discord-ipc-0")));
    }
}
