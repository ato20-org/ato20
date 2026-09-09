//! A miniatura de um arquivo do acervo.
//!
//! O acervo guarda o ORIGINAL, e essa decisao nao muda: e ele que vai para a
//! cena, para a TV e para o zip que viaja. O problema e outro -- as LISTAS
//! desenham um quadrado de 40px, e apontavam para o original para isso. Um mapa
//! de 4000x3000 sao doze milhoes de pixels que a webview decodifica para uns
//! 48 MB de bitmap, e um acervo de duzentos deles nao cabe em memoria nenhuma.
//!
//! Medido em `scripts/perf/medir.mjs`, cenario `biblioteca`, acervo de 200:
//! sem `loading="lazy"` a tela buscava 200 arquivos e 1,9 GB; com ele, 47
//! arquivos e 464 MB. O `lazy` cortou o que esta fora da vista; a miniatura
//! corta o que sobrou -- os 47 visiveis passam a ser 47 PNGs de alguns KB.
//!
//! ## Onde ela mora, e por que nao em `assets/`
//!
//! Em `.ato20/mini/`, junto do resto que e DERIVADO: perder esta pasta nao
//! perde nada, porque ela se refaz a partir do original. `assets/` e o que a
//! campanha E -- um `ls` ali tem de mostrar o que o mestre importou, e nao o
//! dobro de arquivos com metade deles sendo cache. Fora do zip pelo mesmo
//! motivo: o export ficaria maior para carregar o que a outra maquina gera
//! sozinha.
//!
//! ## Preguicosa, e nao so na importacao
//!
//! Gerada na importacao (o arquivo acabou de ser lido, o disco esta quente) E
//! sob demanda quando falta. Sem a segunda metade, toda campanha que existe
//! hoje ficaria sem miniatura para sempre -- e a migracao seria um passo que
//! alguem tem de rodar.

use std::path::PathBuf;

use image::codecs::png::PngEncoder;
use image::{ImageEncoder, ImageReader};

use super::assets::{asset_path, AssetMeta};
use super::atomic::write_atomic;
use super::Vault;
use crate::error::{AppError, AppResult};

/// Lado maior da miniatura, em pixels.
///
/// As listas mostram 40px. Quatro vezes isso cobre a tela de 2x sem ficar
/// borrada e ainda deixa a miniatura servir a caixa de 80px do dialogo do
/// jogador, que e a maior que a usa. Acima disso o arquivo cresce sem ninguem
/// ver diferenca.
pub const LADO: u32 = 160;

pub fn dir(vault: &Vault) -> PathBuf {
    vault.state_dir().join("mini")
}

pub fn path(vault: &Vault, id: &str) -> PathBuf {
    dir(vault).join(format!("{id}.png"))
}

/// Apaga a miniatura. Chamado quando o arquivo sai do acervo.
///
/// Silencioso: ela e cache, e cache que ficou para tras nao quebra nada -- o
/// id nunca se repete, entao ninguem vai receber a miniatura do arquivo errado.
pub fn discard(vault: &Vault, id: &str) {
    let caminho = path(vault, id);

    if let Err(cause) = std::fs::remove_file(&caminho) {
        if cause.kind() != std::io::ErrorKind::NotFound {
            log::warn!("miniatura de {id} ficou em {}: {cause}", caminho.display());
        }
    }
}

/// Devolve a miniatura, gerando se ainda nao existe.
///
/// Recusa audio: `AssetMeta::peaks` e a "miniatura" de som, e ela e outra
/// coisa -- quem a calcula e a webview, que ja tem decodificador de audio.
pub fn ensure(vault: &Vault, meta: &AssetMeta) -> AppResult<PathBuf> {
    if meta.kind != "image" {
        return Err(AppError::UnsupportedKind(meta.mime_type.clone()));
    }

    let destino = path(vault, &meta.id);
    let origem = asset_path(vault, meta);

    // O original nunca muda depois de importado -- o nome do arquivo vem do id
    // --, entao existir basta: nao ha versao nova para conferir por mtime.
    if destino.exists() {
        return Ok(destino);
    }

    std::fs::create_dir_all(dir(vault))?;

    let ilegivel = |cause: String| AppError::Malformed {
        file: meta.name.clone(),
        cause,
    };

    // `with_guessed_format` e nao confiar na extensao: o mime aqui foi deduzido
    // do NOME na importacao, e um `.png` que na verdade e JPEG entrou assim.
    let leitor = ImageReader::open(&origem)?
        .with_guessed_format()
        .map_err(|cause| ilegivel(cause.to_string()))?;

    let imagem = leitor
        .decode()
        .map_err(|cause| ilegivel(cause.to_string()))?
        // `thumbnail` e nao `resize`: e o redutor rapido da crate, e a
        // diferenca visual num quadrado de 40px na tela e nenhuma. Preserva
        // proporcao, entao o lado menor sai abaixo de LADO.
        .thumbnail(LADO, LADO);

    // RGBA8 sempre: token de personagem e PNG com fundo transparente, e achatar
    // para RGB poria um retangulo preto em volta de cada figura.
    let rgba = imagem.to_rgba8();

    let mut bytes = Vec::new();
    PngEncoder::new(&mut bytes)
        .write_image(
            rgba.as_raw(),
            rgba.width(),
            rgba.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|cause| ilegivel(cause.to_string()))?;

    // Atomico: duas telas pedem a mesma miniatura ao mesmo tempo na primeira
    // abertura do acervo, e meio PNG servido e uma imagem quebrada na lista.
    write_atomic(&destino, &bytes)?;

    Ok(destino)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageFormat, RgbaImage};

    fn campanha() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = Vault::create(dir.path().join("c"), "A Marca do Javali").expect("create");

        (dir, vault)
    }

    /// Grava uma imagem de verdade no acervo e devolve o metadado dela.
    fn com_imagem(vault: &Vault, largura: u32, altura: u32) -> AssetMeta {
        let meta = AssetMeta {
            id: "a1".into(),
            kind: "image".into(),
            name: "mapa.png".into(),
            mime_type: "image/png".into(),
            size: 0,
            created_at: 1,
            natural_width: Some(largura),
            natural_height: Some(altura),
            folder_id: None,
            escopo: None,
            peaks: None,
        };

        std::fs::create_dir_all(vault.assets_dir()).expect("assets dir");

        let mut imagem = RgbaImage::new(largura, altura);
        for (x, y, pixel) in imagem.enumerate_pixels_mut() {
            *pixel = image::Rgba([(x % 256) as u8, (y % 256) as u8, 40, 255]);
        }
        imagem
            .save_with_format(asset_path(vault, &meta), ImageFormat::Png)
            .expect("gravar original");

        meta
    }

    #[test]
    fn reduz_pelo_lado_maior_e_preserva_proporcao() {
        let (_dir, vault) = campanha();
        let meta = com_imagem(&vault, 800, 400);

        let caminho = ensure(&vault, &meta).expect("miniatura");
        let mini = ImageReader::open(&caminho)
            .expect("abrir")
            .decode()
            .expect("decodificar");

        // O lado maior vira LADO, e o menor acompanha: uma miniatura esticada
        // mostra um mapa que nao existe.
        assert_eq!(mini.width(), LADO);
        assert_eq!(mini.height(), LADO / 2);
    }

    #[test]
    fn mora_fora_do_acervo() {
        let (_dir, vault) = campanha();
        let meta = com_imagem(&vault, 200, 200);

        ensure(&vault, &meta).expect("miniatura");

        // Em `.ato20/`, que e o que nao viaja no zip nem aparece num `ls
        // assets/`. Ver a nota do modulo.
        assert!(path(&vault, "a1").starts_with(vault.state_dir()));
        assert!(path(&vault, "a1").exists());
        assert_eq!(
            std::fs::read_dir(vault.assets_dir())
                .expect("ler assets")
                .count(),
            1,
            "a miniatura sujou o acervo"
        );
    }

    #[test]
    fn nao_gera_duas_vezes() {
        let (_dir, vault) = campanha();
        let meta = com_imagem(&vault, 300, 300);

        let caminho = ensure(&vault, &meta).expect("primeira");
        let antes = std::fs::metadata(&caminho).expect("meta").modified().expect("mtime");

        std::thread::sleep(std::time::Duration::from_millis(20));
        ensure(&vault, &meta).expect("segunda");

        // Decodificar um mapa de doze megapixels custa centenas de
        // milissegundos: a segunda chamada nao pode pagar isso de novo.
        let depois = std::fs::metadata(&caminho).expect("meta").modified().expect("mtime");
        assert_eq!(antes, depois, "a miniatura foi regravada");
    }

    #[test]
    fn transparencia_sobrevive() {
        let (_dir, vault) = campanha();

        let meta = AssetMeta {
            id: "token".into(),
            kind: "image".into(),
            name: "token.png".into(),
            mime_type: "image/png".into(),
            size: 0,
            created_at: 1,
            natural_width: Some(64),
            natural_height: Some(64),
            folder_id: None,
            escopo: None,
            peaks: None,
        };

        std::fs::create_dir_all(vault.assets_dir()).expect("assets dir");

        // Metade transparente, como um token recortado.
        let mut imagem = RgbaImage::new(64, 64);
        for (x, _y, pixel) in imagem.enumerate_pixels_mut() {
            *pixel = image::Rgba([200, 30, 30, if x < 32 { 0 } else { 255 }]);
        }
        imagem
            .save_with_format(asset_path(&vault, &meta), ImageFormat::Png)
            .expect("gravar original");

        let mini = ImageReader::open(ensure(&vault, &meta).expect("miniatura"))
            .expect("abrir")
            .decode()
            .expect("decodificar")
            .to_rgba8();

        // Achatar para RGB poria um retangulo preto em volta de cada figura na
        // lista de personagens.
        assert_eq!(mini.get_pixel(0, 0)[3], 0, "a transparencia virou fundo");
    }

    #[test]
    fn audio_e_recusado_em_vez_de_gerar_lixo() {
        let (_dir, vault) = campanha();

        let meta = AssetMeta {
            id: "s1".into(),
            kind: "audio".into(),
            name: "trilha.ogg".into(),
            mime_type: "audio/ogg".into(),
            size: 0,
            created_at: 1,
            natural_width: None,
            natural_height: None,
            folder_id: None,
            escopo: None,
            peaks: None,
        };

        // A "miniatura" de som e `AssetMeta::peaks`, e quem a calcula e a
        // webview. Aqui o certo e recusar, para o daemon cair no original.
        assert!(matches!(
            ensure(&vault, &meta),
            Err(AppError::UnsupportedKind(_))
        ));
    }

    #[test]
    fn arquivo_ilegivel_nao_derruba_nada() {
        let (_dir, vault) = campanha();

        let meta = AssetMeta {
            id: "quebrado".into(),
            kind: "image".into(),
            name: "mapa.png".into(),
            mime_type: "image/png".into(),
            size: 3,
            created_at: 1,
            natural_width: None,
            natural_height: None,
            folder_id: None,
            escopo: None,
            peaks: None,
        };

        std::fs::create_dir_all(vault.assets_dir()).expect("assets dir");
        std::fs::write(asset_path(&vault, &meta), b"nao e imagem").expect("gravar");

        // Um `.png` que nao e PNG existe -- renomear arquivo e comum. O daemon
        // trata isto servindo o original, que e o comportamento de antes.
        assert!(matches!(
            ensure(&vault, &meta),
            Err(AppError::Malformed { .. })
        ));
    }

    #[test]
    fn descartar_e_silencioso_quando_nao_existe() {
        let (_dir, vault) = campanha();

        // Chamado no `delete` de todo asset, inclusive som, que nunca teve uma.
        discard(&vault, "nunca-existiu");
    }
}
