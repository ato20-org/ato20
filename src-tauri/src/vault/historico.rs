use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::{json, Value};

use super::{fio, now_ms, Vault};
use crate::error::{AppError, AppResult};

/// O historico da campanha: o que aconteceu na mesa, um acontecimento por linha.
///
/// O irmao do fio (`fio.rs`), e pelas mesmas razoes: arquivo so de acrescimo na
/// RAIZ da campanha, que viaja no zip sem codigo nenhum, aparece no `git diff`
/// e sobrevive a queda no meio de uma escrita -- no maximo a ultima linha fica
/// pela metade, e a leitura a pula.
///
/// A conversa e as rolagens NAO entram aqui: ja moram no fio, e a janela do
/// historico as le de la e as intercala pela hora. Duas copias da mesma frase
/// divergiriam na primeira linha apagada.
///
/// O Rust nao decide o formato de cada acontecimento -- so confere a casca
/// (`tipo`, `id`, `quando`) e grava. Quem os escreve e o Mestre, que ja ve o
/// antes e o depois de cada mudanca, e este arquivo, nos poucos que so o Rust
/// enxerga (o item que o celular tirou da mochila). Espelhar cada tipo aqui
/// cobraria migracao nos dois lados a cada campo novo, como o retrato em
/// `session.rs`. O espelho do lado da tela e `src/types/historico.ts`.
pub const ARQUIVO: &str = "historico.jsonl";

/// Teto de um registro serializado, em bytes. Um acontecimento e uma frase com
/// nomes, e nao um capitulo: o marco mais longo cabe com folga.
pub const MAX_REGISTRO: usize = 8 * 1024;

/// Teto do texto de um marco, em caracteres. O mesmo da mensagem do fio.
pub const MAX_MARCO: usize = fio::MAX_TEXTO;

/// Teto do `tipo` e do `id`. Sao chaves, e nao texto.
const MAX_CHAVE: usize = 80;

/// Quantos registros uma chamada grava. A tela junta os de um mesmo instante
/// -- a rodada que vira e a cena que entra no ar --, e nao mais que isso.
const MAX_POR_VEZ: usize = 200;

/// Quem escreve aqui sao dois: o comando do Mestre e o proprio Rust, no meio de
/// um gesto do celular. A trava e o que deixa cada um escrever as SUAS linhas
/// inteiras, sem uma no meio da outra.
static TRAVA: Mutex<()> = Mutex::new(());

pub fn caminho(vault: &Vault) -> PathBuf {
    vault.root.join(ARQUIVO)
}

/// O que a janela do historico le.
///
/// Na primeira leitura, os acontecimentos e o fio inteiro, numa chamada so: a
/// janela intercala os dois pela hora, e duas leituras em tempos diferentes
/// poderiam pegar uma rolagem e nao o golpe que ela causou.
///
/// Depois, so o que entrou no fim do arquivo desde `tamanho` -- e sem o fio, que
/// a janela ja recebe ao vivo pelo fluxo do daemon. E o que deixa a janela
/// aberta ver o item que o celular tirou da mochila sem reler a campanha
/// inteira a cada poucos segundos.
#[derive(Debug, Serialize)]
pub struct Leitura {
    pub registros: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fio: Option<Vec<fio::Linha>>,
    /// Ate onde o arquivo foi lido, em bytes: o `desde` da proxima leitura.
    pub tamanho: u64,
}

/// Um registro com a casca certa, e do tamanho certo.
///
/// O marco tem o texto conferido aqui porque e o unico campo que alguem digita.
fn conferido(registro: Value) -> AppResult<String> {
    let recusa = |motivo: &str| AppError::Malformed {
        file: ARQUIVO.to_string(),
        cause: motivo.to_string(),
    };

    let Value::Object(campos) = &registro else {
        return Err(recusa("registro que nao e objeto"));
    };

    let chave = |nome: &str| {
        campos
            .get(nome)
            .and_then(Value::as_str)
            .filter(|valor| !valor.is_empty() && valor.len() <= MAX_CHAVE)
    };

    let tipo = chave("tipo").ok_or_else(|| recusa("registro sem tipo"))?;
    chave("id").ok_or_else(|| recusa("registro sem id"))?;
    if !campos.get("quando").is_some_and(Value::is_i64) {
        return Err(recusa("registro sem quando"));
    }

    if tipo == "marco" || tipo == "editado" {
        let texto = campos.get("texto").and_then(Value::as_str).unwrap_or("");
        if texto.trim().is_empty() || texto.chars().count() > MAX_MARCO {
            return Err(recusa("marco sem texto, ou longo demais"));
        }
    }

    let texto = serde_json::to_string(&registro).map_err(|cause| recusa(&cause.to_string()))?;
    if texto.len() > MAX_REGISTRO {
        return Err(recusa("registro grande demais"));
    }

    Ok(texto)
}

/// Acrescenta os registros ao fim do arquivo, todos ou nenhum.
///
/// Confere tudo antes de escrever: um registro torto no meio de um lote nao
/// deixa metade dele no arquivo. Depois, um `write_all` so e `sync_data`, como
/// o fio.
pub fn acrescentar(vault: &Vault, registros: Vec<Value>) -> AppResult<()> {
    if registros.is_empty() {
        return Ok(());
    }
    if registros.len() > MAX_POR_VEZ {
        return Err(AppError::Malformed {
            file: ARQUIVO.to_string(),
            cause: format!("{} registros de uma vez", registros.len()),
        });
    }

    let mut texto = String::new();
    for registro in registros {
        texto.push_str(&conferido(registro)?);
        texto.push('\n');
    }

    let _vez = TRAVA.lock().unwrap_or_else(|envenenada| envenenada.into_inner());

    let mut arquivo = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(caminho(vault))?;
    arquivo.write_all(texto.as_bytes())?;
    arquivo.sync_data()?;

    Ok(())
}

/// O historico inteiro, na ordem em que foi escrito.
pub fn ler(vault: &Vault) -> AppResult<Vec<Value>> {
    Ok(ler_desde(vault, 0)?.0)
}

/// Os registros do byte `desde` em diante, e ate onde leu.
///
/// So linhas INTEIRAS: a que esta sendo escrita agora, sem o `\n` ainda, fica
/// para a proxima leitura, que comeca nela. Um `desde` alem do fim e um arquivo
/// que encolheu -- a campanha foi trocada por um zip importado --, e a leitura
/// recomeca do zero.
///
/// Linha que nao decodifica e PULADA, com aviso no log, como no fio: uma
/// editada a mao, ou o resto de uma queda no meio de uma escrita antiga. Marco
/// editado e apagado continuam aqui como escritos -- quem resolve a lapide e a
/// tela, que e quem sabe o que cada tipo quer dizer.
pub fn ler_desde(vault: &Vault, desde: u64) -> AppResult<(Vec<Value>, u64)> {
    let mut arquivo = match std::fs::File::open(caminho(vault)) {
        Ok(arquivo) => arquivo,
        Err(cause) if cause.kind() == std::io::ErrorKind::NotFound => return Ok((Vec::new(), 0)),
        Err(cause) => return Err(cause.into()),
    };

    let desde = if desde > arquivo.metadata()?.len() { 0 } else { desde };
    arquivo.seek(SeekFrom::Start(desde))?;
    let mut bytes = Vec::new();
    arquivo.read_to_end(&mut bytes)?;

    let inteiras = bytes.iter().rposition(|byte| *byte == b'\n').map_or(0, |fim| fim + 1);
    let texto = String::from_utf8_lossy(&bytes[..inteiras]);

    let mut registros = Vec::new();
    for crua in texto.lines() {
        if crua.trim().is_empty() {
            continue;
        }

        match serde_json::from_str::<Value>(crua) {
            Ok(registro @ Value::Object(_)) => registros.push(registro),
            Ok(_) => log::warn!("{ARQUIVO}: linha que nao e um registro"),
            Err(cause) => log::warn!("{ARQUIVO}: linha ilegivel ({cause})"),
        }
    }

    Ok((registros, desde + inteiras as u64))
}

/// O que a janela pede. Sem `desde`, tudo e o fio junto; com, so o fim novo.
/// Ver `Leitura`.
pub fn ler_para_a_janela(vault: &Vault, desde: Option<u64>) -> AppResult<Leitura> {
    let (registros, tamanho) = ler_desde(vault, desde.unwrap_or(0))?;

    Ok(Leitura {
        registros,
        fio: if desde.is_none() { Some(fio::ler(vault)?) } else { None },
        tamanho,
    })
}

/// Um acontecimento que o proprio Rust viu, com id e hora.
///
/// `campos` e o resto do registro, sem `tipo`, `id` e `quando`.
pub fn novo(tipo: &str, campos: Value) -> Value {
    let mut registro = json!({
        "tipo": tipo,
        "id": uuid::Uuid::new_v4().to_string(),
        "quando": now_ms(),
    });

    if let (Value::Object(destino), Value::Object(origem)) = (&mut registro, campos) {
        destino.extend(origem);
    }

    registro
}

/// Grava um acontecimento que o Rust viu, sem derrubar quem o causou.
///
/// O item ja saiu da mochila quando isto roda: um disco cheio que perde a linha
/// do historico nao pode desfazer o gesto, nem devolver erro ao celular por
/// algo que deu certo. Fica o aviso no log.
pub fn registrar(vault: &Vault, tipo: &str, campos: Value) {
    if let Err(cause) = acrescentar(vault, vec![novo(tipo, campos)]) {
        log::warn!("{ARQUIVO}: {tipo} nao registrado ({cause})");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::create(dir.path().join("campanha"), "Campanha").unwrap();
        (dir, vault)
    }

    fn marco(id: &str, texto: &str) -> Value {
        json!({ "tipo": "marco", "id": id, "quando": 10, "texto": texto })
    }

    #[test]
    fn grava_e_le_na_ordem() {
        let (_dir, vault) = vault();

        acrescentar(&vault, vec![marco("a", "Chegaram à vila")]).unwrap();
        registrar(&vault, "item", json!({ "acao": "dado", "item": "Corda" }));

        let lidos = ler(&vault).unwrap();
        assert_eq!(lidos.len(), 2);
        assert_eq!(lidos[0]["texto"], "Chegaram à vila");
        assert_eq!(lidos[1]["tipo"], "item");
        assert_eq!(lidos[1]["item"], "Corda");
        assert!(lidos[1]["id"].as_str().is_some_and(|id| !id.is_empty()));
        assert!(lidos[1]["quando"].as_i64().is_some_and(|quando| quando > 0));
    }

    #[test]
    fn sem_arquivo_e_historico_vazio() {
        let (_dir, vault) = vault();

        assert!(ler(&vault).unwrap().is_empty());
    }

    #[test]
    fn lote_com_um_torto_nao_grava_nada() {
        let (_dir, vault) = vault();

        let torto = json!({ "tipo": "cena", "quando": 1 });
        let erro = acrescentar(&vault, vec![marco("a", "ok"), torto]);

        assert!(erro.is_err());
        assert!(ler(&vault).unwrap().is_empty());
    }

    #[test]
    fn recusa_casca_errada_e_marco_vazio() {
        assert!(conferido(json!("texto solto")).is_err());
        assert!(conferido(json!({ "tipo": "cena", "id": "a", "quando": "ontem" })).is_err());
        assert!(conferido(json!({ "tipo": "", "id": "a", "quando": 1 })).is_err());
        assert!(conferido(marco("a", "   ")).is_err());
        assert!(conferido(marco("a", &"x".repeat(MAX_MARCO + 1))).is_err());
        assert!(conferido(json!({ "tipo": "cena", "id": "a", "quando": 1, "nome": "x".repeat(MAX_REGISTRO) })).is_err());
        assert!(conferido(marco("a", "O grupo chegou")).is_ok());
    }

    #[test]
    fn pula_a_linha_cortada_pela_queda() {
        let (_dir, vault) = vault();

        acrescentar(&vault, vec![marco("a", "inteiro")]).unwrap();
        let mut arquivo = std::fs::OpenOptions::new()
            .append(true)
            .open(caminho(&vault))
            .unwrap();
        // A cortada no meio de uma escrita antiga, ja seguida de outras.
        arquivo.write_all(b"{\"tipo\":\"marco\",\"id\":\"b\",\"quan\n").unwrap();
        acrescentar(&vault, vec![marco("c", "depois")]).unwrap();

        let lidos = ler(&vault).unwrap();
        let ids: Vec<&str> = lidos.iter().map(|lido| lido["id"].as_str().unwrap()).collect();
        assert_eq!(ids, ["a", "c"]);
    }

    #[test]
    fn le_so_o_que_entrou_depois_e_so_linhas_inteiras() {
        let (_dir, vault) = vault();

        acrescentar(&vault, vec![marco("a", "primeiro")]).unwrap();
        let (_, tamanho) = ler_desde(&vault, 0).unwrap();

        acrescentar(&vault, vec![marco("b", "segundo")]).unwrap();
        // A linha que esta sendo escrita, ainda sem o fim.
        let mut arquivo = std::fs::OpenOptions::new()
            .append(true)
            .open(caminho(&vault))
            .unwrap();
        arquivo.write_all(b"{\"tipo\":\"marco\",\"id\":\"c\"").unwrap();

        let (novos, ate) = ler_desde(&vault, tamanho).unwrap();
        assert_eq!(novos.len(), 1);
        assert_eq!(novos[0]["id"], "b");

        // A cortada fica para a proxima, que comeca nela.
        arquivo.write_all(b",\"quando\":3,\"texto\":\"terceiro\"}\n").unwrap();
        let (depois, _) = ler_desde(&vault, ate).unwrap();
        assert_eq!(depois.len(), 1);
        assert_eq!(depois[0]["id"], "c");

        // Alem do fim: o arquivo foi trocado, e a leitura recomeca.
        let (todos, _) = ler_desde(&vault, 1_000_000).unwrap();
        assert_eq!(todos.len(), 3);
    }

    #[test]
    fn a_leitura_traz_o_fio_junto() {
        let (_dir, vault) = vault();

        fio::acrescentar(
            &vault,
            &fio::Registro::Linha(fio::Linha {
                id: "f1".into(),
                quando: 5,
                autor: fio::Autor::Mestre,
                para: None,
                texto: Some("Rolem iniciativa".into()),
                rolagem: None,
            }),
        )
        .unwrap();
        acrescentar(&vault, vec![marco("a", "Emboscada na estrada")]).unwrap();

        let leitura = ler_para_a_janela(&vault, None).unwrap();
        assert_eq!(leitura.registros.len(), 1);
        let fio = leitura.fio.unwrap();
        assert_eq!(fio.len(), 1);
        assert_eq!(fio[0].texto.as_deref(), Some("Rolem iniciativa"));

        // Com `desde`, so o fim novo do historico, e sem o fio.
        let depois = ler_para_a_janela(&vault, Some(leitura.tamanho)).unwrap();
        assert!(depois.registros.is_empty());
        assert!(depois.fio.is_none());
    }
}
