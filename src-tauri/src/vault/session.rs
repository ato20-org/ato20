use super::atomic::{read_json, write_json};
use super::Vault;
use crate::error::AppResult;

/// Retratos e trilha, opacos como a cena.
///
/// O Rust nao decide nada sobre eles -- so grava e le. Espelhar `Portrait` e
/// `SessionTrack` aqui cobraria migracao nos dois lados a cada campo novo, e o
/// unico ganho seria validacao que a tela ja faz.
pub type Json = serde_json::Value;

/// Os retratos da sessao.
///
/// Arquivo proprio, fora do board, pelo mesmo motivo que ja valia no
/// IndexedDB: dois escritores no mesmo registro se sobrescrevem, e a trilha
/// grava a cada ajuste de volume enquanto o retrato grava a cada frame de
/// arrasto.
pub fn load_portraits(vault: &Vault) -> AppResult<Vec<Json>> {
    Ok(read_json(&vault.portraits_path())?.unwrap_or_default())
}

pub fn save_portraits(vault: &Vault, portraits: &[Json]) -> AppResult<()> {
    write_json(&vault.portraits_path(), &portraits)
}

/// A trilha da sessao. `None` = nenhuma escolhida.
pub fn load_track(vault: &Vault) -> AppResult<Option<Json>> {
    // Dois niveis de `Option`: o de fora e "o arquivo existe", o de dentro e
    // "ha trilha escolhida". Achatar os dois faria uma campanha sem arquivo
    // parecer igual a uma que teve a trilha tirada de proposito -- e nao e o
    // mesmo estado quando se depura por que o som nao voltou.
    Ok(read_json::<Option<Json>>(&vault.track_path())?.flatten())
}

pub fn save_track(vault: &Vault, track: Option<&Json>) -> AppResult<()> {
    write_json(&vault.track_path(), &track)
}
