//! O Universal VTT (`.dd2vtt`, `.df2vtt`, `.uvtt`) lido do disco: a imagem
//! separada do resto.
//!
//! A imagem do mapa viaja DENTRO do JSON, em base64, e num mapa do Dungeondraft
//! passa facil de dez megabytes. Lida aqui, ela vai do arquivo para o acervo
//! sem atravessar a ponte -- o desenho de `asset_import` --, e para a webview
//! sobe so o resto: paredes, portas e luzes, que sao kilobytes. A conversao para
//! a cena fica no TypeScript (`lib/importacao/uvtt.ts`), que e onde mora a
//! geometria da cena e o teste dela.

use base64::alphabet::STANDARD;
use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};
use base64::engine::DecodePaddingMode;
use base64::Engine;
use serde_json::Value;

/// Base64 com ou sem o `=` do fim: exportador de mapa nao e rigoroso nisso, e
/// recusar a imagem por falta de enchimento seria perder o mapa por um detalhe.
const BASE64: GeneralPurpose = GeneralPurpose::new(
    &STANDARD,
    GeneralPurposeConfig::new().with_decode_padding_mode(DecodePaddingMode::Indifferent),
);

/// O que sai do arquivo: o JSON sem a imagem, e a imagem, quando ela se le.
pub struct Separado {
    pub resto: String,
    pub imagem: Option<Imagem>,
}

pub struct Imagem {
    pub bytes: Vec<u8>,
    /// Sem o ponto. Ver `extensao_da_imagem`.
    pub extensao: &'static str,
}

/// Separa a imagem do resto, e recusa o que nao e mapa.
///
/// Recusa AQUI, antes de a imagem entrar no acervo: um arquivo sem o tamanho do
/// mapa nao vira cena nenhuma, e a imagem dele ficaria orfa na campanha.
///
/// Imagem ilegivel -- base64 quebrado, bytes que nao sao imagem -- NAO derruba a
/// importacao: as paredes, as portas e as luzes continuam valendo, e o fundo se
/// troca depois pelo menu do mapa.
pub fn separar(texto: &str) -> Result<Separado, String> {
    let mut doc: Value = serde_json::from_str(texto).map_err(|cause| cause.to_string())?;
    let objeto = doc
        .as_object_mut()
        .ok_or_else(|| "o conteudo nao e um objeto".to_string())?;

    let tamanho = objeto.get("resolution").and_then(|resolucao| resolucao.get("map_size"));
    let positivo = |eixo: &str| {
        tamanho
            .and_then(|tamanho| tamanho.get(eixo))
            .and_then(Value::as_f64)
            .is_some_and(|valor| valor.is_finite() && valor > 0.0)
    };
    if !positivo("x") || !positivo("y") {
        return Err("sem o tamanho do mapa em resolution.map_size".to_string());
    }

    let imagem = match objeto.remove("image") {
        Some(Value::String(codificada)) => decodificar(&codificada),
        _ => None,
    };

    let resto = serde_json::to_string(&doc).map_err(|cause| cause.to_string())?;
    Ok(Separado { resto, imagem })
}

fn decodificar(codificada: &str) -> Option<Imagem> {
    // Um `data:image/png;base64,` na frente e tolerado: ha exportador que o poe.
    let corpo = match codificada.split_once(',') {
        Some((cabeca, corpo)) if cabeca.starts_with("data:") => corpo,
        _ => codificada,
    };
    let limpo: String = corpo.chars().filter(|letra| !letra.is_whitespace()).collect();
    let bytes = BASE64.decode(limpo.as_bytes()).ok()?;
    let extensao = extensao_da_imagem(&bytes)?;

    Some(Imagem { bytes, extensao })
}

/// A extensao pelos BYTES, e nao pelo formato do arquivo.
///
/// O Dungeondraft exporta PNG ou WebP conforme a opcao de quem exporta, e o JSON
/// nao diz qual. O acervo classifica pelo nome, e um WebP chamado `.png` entraria
/// com o tipo errado. Bytes que nao sao nenhum dos tres nao entram.
fn extensao_da_imagem(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("png");
    }
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("jpg");
    }
    None
}

#[cfg(test)]
mod testes {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";
    const WEBP: &[u8] = b"RIFF\0\0\0\0WEBPVP8 ";

    fn mapa(imagem: &str) -> String {
        format!(
            r#"{{"format":0.3,"resolution":{{"map_origin":{{"x":0,"y":0}},"map_size":{{"x":8,"y":6}},"pixels_per_grid":70}},"line_of_sight":[[{{"x":0,"y":0}},{{"x":8,"y":0}}]],"image":{imagem}}}"#
        )
    }

    #[test]
    fn separa_a_imagem_e_tira_ela_do_json() {
        let texto = mapa(&format!("\"{}\"", BASE64.encode(PNG)));
        let separado = separar(&texto).expect("mapa valido");

        let imagem = separado.imagem.expect("imagem lida");
        assert_eq!(imagem.extensao, "png");
        assert_eq!(imagem.bytes, PNG);
        assert!(!separado.resto.contains("\"image\""));
        assert!(separado.resto.contains("line_of_sight"));
    }

    #[test]
    fn a_extensao_sai_dos_bytes() {
        let texto = mapa(&format!("\"{}\"", BASE64.encode(WEBP)));
        assert_eq!(separar(&texto).unwrap().imagem.unwrap().extensao, "webp");
    }

    #[test]
    fn tolera_data_uri_quebra_de_linha_e_falta_de_enchimento() {
        let codificada = BASE64.encode(PNG);
        let sem_enchimento = codificada.trim_end_matches('=');
        let partida = format!(
            "\"data:image/png;base64,{}\\n{}\"",
            &sem_enchimento[..4],
            &sem_enchimento[4..]
        );
        assert!(separar(&mapa(&partida)).unwrap().imagem.is_some());
    }

    #[test]
    fn imagem_ilegivel_nao_derruba_o_mapa() {
        let separado = separar(&mapa("\"isto nao e base64!\"")).expect("o resto vale");
        assert!(separado.imagem.is_none());

        let nao_e_imagem = separar(&mapa(&format!("\"{}\"", BASE64.encode(b"texto")))).unwrap();
        assert!(nao_e_imagem.imagem.is_none());
    }

    #[test]
    fn sem_imagem_e_mapa_sem_fundo() {
        assert!(separar(&mapa("null")).unwrap().imagem.is_none());
    }

    #[test]
    fn recusa_o_que_nao_e_mapa() {
        assert!(separar("isto nao e json").is_err());
        assert!(separar("[1, 2]").is_err());
        assert!(separar(r#"{"resolution":{"pixels_per_grid":70}}"#).is_err());
        assert!(separar(r#"{"resolution":{"map_size":{"x":0,"y":6}}}"#).is_err());
    }
}
