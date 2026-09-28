//! Se uma imagem se mexe.
//!
//! Tres formatos que o acervo aceita sabem guardar animacao -- GIF, WebP e PNG
//! (o APNG e um PNG com quadros a mais) -- e o navegador anima os tres sozinho
//! num `<img>`. Quem nao anima e o que passa por `variantes`: a reducao
//! decodifica UM quadro e grava um JPEG, e o GIF da fogueira chegava parado na
//! TV com o mapa afastado e no celular sempre.
//!
//! Por isso a pergunta mora aqui, fora das reducoes: quem serve precisa dela
//! antes de decidir se reduz, e a importacao a grava no metadado para a
//! biblioteca mostrar que o arquivo se mexe. Ver `AssetMeta::animada`.
//!
//! So o CABECALHO, nos dois formatos que dizem ali: o WebP marca a animacao no
//! bloco `VP8X`, e o APNG no `acTL`, antes do primeiro `IDAT`. O GIF nao tem
//! marca -- ele e animado quando tem um segundo quadro --, entao ali se
//! decodificam os dois primeiros, e so eles.

use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use image::codecs::gif::GifDecoder;
use image::codecs::png::PngDecoder;
use image::codecs::webp::WebPDecoder;
use image::{AnimationDecoder, ImageFormat, ImageReader};

use crate::error::{AppError, AppResult};

/// O tipo declarado admite animacao? E a pergunta barata, pelo nome: um JPEG
/// nunca se mexe, e abri-lo para confirmar seria uma leitura por nada.
pub fn pode_animar(mime: &str) -> bool {
    let mime = mime.split(';').next().unwrap_or(mime).trim();

    matches!(mime, "image/gif" | "image/webp" | "image/png" | "image/apng")
}

/// O arquivo tem mais de um quadro?
///
/// Pelo formato de VERDADE, e nao pela extensao, pela razao de `variantes`: um
/// `.png` que na verdade e GIF existe, e o que importa e o que o navegador vai
/// fazer com ele.
///
/// Erro so quando o arquivo nao se deixa ler. Um formato que nao anima -- JPEG,
/// BMP -- e `false`, e nao erro.
pub fn animada(origem: &Path) -> AppResult<bool> {
    let formato = ImageReader::open(origem)?.with_guessed_format()?.format();
    let ilegivel = |cause: image::ImageError| AppError::Malformed {
        file: origem.display().to_string(),
        cause: cause.to_string(),
    };
    let leitor = || -> AppResult<BufReader<File>> { Ok(BufReader::new(File::open(origem)?)) };

    Ok(match formato {
        Some(ImageFormat::Gif) => {
            // Um quadro que nao decodifica encerra a contagem: o GIF truncado
            // no segundo quadro e, para quem olha, uma imagem parada.
            GifDecoder::new(leitor()?)
                .map_err(ilegivel)?
                .into_frames()
                .take(2)
                .take_while(Result::is_ok)
                .count()
                > 1
        }
        Some(ImageFormat::WebP) => WebPDecoder::new(leitor()?)
            .map_err(ilegivel)?
            .has_animation(),
        Some(ImageFormat::Png) => PngDecoder::new(leitor()?)
            .map_err(ilegivel)?
            .is_apng()
            .map_err(ilegivel)?,
        _ => false,
    })
}

#[cfg(test)]
pub(crate) mod testes {
    use std::io::Cursor;

    use image::codecs::gif::GifEncoder;
    use image::{Delay, Frame, ImageEncoder, Rgba, RgbaImage};

    use super::*;

    /// Um GIF de `quadros` quadros, cada um de uma cor.
    pub(crate) fn gif(quadros: usize) -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut encoder = GifEncoder::new(&mut bytes);
            let lista = (0..quadros).map(|i| {
                let cor = Rgba([(i * 80) as u8, 40, 200, 255]);
                Frame::from_parts(
                    RgbaImage::from_pixel(8, 8, cor),
                    0,
                    0,
                    Delay::from_numer_denom_ms(100, 1),
                )
            });
            encoder.encode_frames(lista).expect("gif");
        }
        bytes
    }

    /// Um APNG de dois quadros, escrito a mao pelo `png`: o `image` le APNG e
    /// nao escreve.
    pub(crate) fn apng() -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut bytes, 4, 4);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            encoder.set_animated(2, 0).expect("acTL");
            let mut escritor = encoder.write_header().expect("cabecalho");
            escritor.write_image_data(&[255; 64]).expect("quadro 1");
            escritor.write_image_data(&[0; 64]).expect("quadro 2");
            escritor.finish().expect("fim");
        }
        bytes
    }

    fn png_parado() -> Vec<u8> {
        let mut bytes = Vec::new();
        image::codecs::png::PngEncoder::new(Cursor::new(&mut bytes))
            .write_image(&[255; 64], 4, 4, image::ExtendedColorType::Rgba8)
            .expect("png");
        bytes
    }

    fn no_disco(dir: &Path, nome: &str, bytes: &[u8]) -> std::path::PathBuf {
        let caminho = dir.join(nome);
        std::fs::write(&caminho, bytes).expect("gravar");
        caminho
    }

    #[test]
    fn gif_de_varios_quadros_se_mexe_e_o_de_um_nao() {
        let dir = tempfile::tempdir().expect("tmp");

        assert!(animada(&no_disco(dir.path(), "fogo.gif", &gif(3))).expect("le"));
        assert!(!animada(&no_disco(dir.path(), "placa.gif", &gif(1))).expect("le"));
    }

    #[test]
    fn apng_se_mexe_e_png_comum_nao() {
        let dir = tempfile::tempdir().expect("tmp");

        assert!(animada(&no_disco(dir.path(), "tocha.png", &apng())).expect("le"));
        assert!(!animada(&no_disco(dir.path(), "mapa.png", &png_parado())).expect("le"));
    }

    #[test]
    fn o_formato_de_verdade_manda_e_nao_a_extensao() {
        // O GIF animado salvo como `.png` continua sendo o que o navegador anima.
        let dir = tempfile::tempdir().expect("tmp");

        assert!(animada(&no_disco(dir.path(), "enganado.png", &gif(2))).expect("le"));
    }

    #[test]
    fn jpeg_nao_se_mexe_e_nao_e_erro() {
        let dir = tempfile::tempdir().expect("tmp");
        let mut bytes = Vec::new();
        image::codecs::jpeg::JpegEncoder::new(&mut bytes)
            .write_image(&[128; 48], 4, 4, image::ExtendedColorType::Rgb8)
            .expect("jpeg");

        assert!(!animada(&no_disco(dir.path(), "foto.jpg", &bytes)).expect("le"));
    }

    #[test]
    fn so_os_tres_formatos_admitem_animacao() {
        assert!(pode_animar("image/gif"));
        assert!(pode_animar("image/webp"));
        assert!(pode_animar("image/png"));
        assert!(pode_animar("image/apng"));
        assert!(!pode_animar("image/jpeg"));
        assert!(!pode_animar("audio/ogg"));
    }
}
