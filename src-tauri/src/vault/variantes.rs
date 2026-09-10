//! As versoes REDUZIDAS de um arquivo do acervo.
//!
//! Duas, e cada uma existe por uma razao propria:
//!
//!   `Mini` (160px)   as listas -- acervo, camadas, retratos, previa de cena.
//!   `Tela` (1920px)  o celular do jogador.
//!
//! O acervo guarda o ORIGINAL, e essa decisao nao muda: e ele que vai para o
//! palco do mestre, para a TV e para o zip que viaja. O problema e quem NAO
//! precisa dele.
//!
//! As LISTAS desenham um quadrado de 40px, e apontavam para o original para
//! isso. Um mapa de 3537x3750 sao treze milhoes de pixels que a webview
//! decodifica para 51 MB de bitmap, e a lista de cenas fazia isso uma vez por
//! linha: medido no `scripts/perf/medir.mjs`, cenario `lista`, trinta cenas
//! custavam 45,6 fps e um pior quadro de 383 ms contra 60 fps e 16,8 ms com
//! miniatura.
//!
//! O CELULAR do jogador e o outro caso. Ele recebe a mesma cena que a TV, numa
//! tela de 400px de largura, e baixava os 8 MB do arquivo para decodificar 51
//! MB. Medido no mapa real: a 1920px de lado maior, JPEG de qualidade 82, o
//! mesmo mapa sai em 0,44 MB e 13 MB decodificado -- dezoito vezes menos no
//! fio, com N celulares na mesa.
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

/// Qual reducao se pede.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Variante {
    /// As listas. 160px, PNG -- alfa preservado, porque token e recorte.
    Mini,
    /// O celular do jogador. 1920px, JPEG.
    Tela,
}

impl Variante {
    /// O nome na rota e na pasta de cache. E o que o cliente escreve na URL.
    pub fn nome(self) -> &'static str {
        match self {
            Self::Mini => "mini",
            Self::Tela => "tela",
        }
    }

    pub fn de_nome(nome: &str) -> Option<Self> {
        match nome {
            "mini" => Some(Self::Mini),
            "tela" => Some(Self::Tela),
            _ => None,
        }
    }

    /// Lado maior, em pixels.
    ///
    /// 160 para lista: as listas mostram 40px, e quatro vezes isso cobre tela
    /// de 2x sem borrar e ainda serve a caixa de 80px do dialogo do jogador.
    ///
    /// 1920 para o celular: e generoso de proposito. A tela dele tem 400px de
    /// largura, mas o retrato pode chegar a 3x de densidade, e o mestre pode
    /// enquadrar um pedaco do mapa -- e nesse caso a variante e ampliada. 1920
    /// aguenta os dois sem virar mais uma decisao a tomar por cena.
    fn lado(self) -> u32 {
        match self {
            Self::Mini => 160,
            Self::Tela => 1920,
        }
    }

    /// `true` = PNG (preserva alfa). `false` = JPEG.
    ///
    /// A miniatura e sempre PNG: ela desenha token e retrato, que sao recortes
    /// com transparencia, e 160px de PNG sao alguns KB de qualquer forma.
    ///
    /// A variante de tela e sempre JPEG, e por isso ela SO existe para imagem
    /// opaca -- ver `ensure`. Um mapa com alfa nao existe na pratica, e um
    /// recorte de 1920px em PNG nao economizaria nada.
    fn preserva_alfa(self) -> bool {
        matches!(self, Self::Mini)
    }

    /// Qualidade do JPEG. 82 e onde a curva de tamanho vira: medido no mapa
    /// real, 0,44 MB contra 0,80 MB em 2560px, sem diferenca que se veja num
    /// celular.
    fn qualidade(self) -> u8 {
        82
    }

    fn extensao(self) -> &'static str {
        if self.preserva_alfa() {
            "png"
        } else {
            "jpg"
        }
    }
}

/**
 * Versao do jeito de reduzir.
 *
 * Entra no CAMINHO, e nao num arquivo de controle ao lado: a miniatura e cache,
 * e cache que sobreviveu a uma mudanca de algoritmo e pior que cache nenhum --
 * `ensure` sai cedo quando o arquivo existe, entao uma campanha que ja abriu
 * uma vez ficaria com a versao velha para sempre.
 *
 * 2 = Lanczos com alfa pre-multiplicado. 1 era `DynamicImage::thumbnail`, o
 * redutor rapido -- ver `reduzir`.
 */
const VERSAO: u32 = 2;

pub fn dir(vault: &Vault, variante: Variante) -> PathBuf {
    vault
        .state_dir()
        .join(variante.nome())
        .join(VERSAO.to_string())
}

/// Apaga as miniaturas de versoes anteriores desta.
///
/// Uma vez por geracao, e barato: sao poucos arquivos pequenos, e o `read_dir`
/// falha silencioso quando a pasta nem existe -- que e o caso de toda campanha
/// nova.
fn limpar_versoes_antigas(vault: &Vault, variante: Variante) {
    let raiz = vault.state_dir().join(variante.nome());
    let atual = VERSAO.to_string();

    let Ok(entradas) = std::fs::read_dir(&raiz) else {
        return;
    };

    for entrada in entradas.flatten() {
        if entrada.file_name() == std::ffi::OsString::from(&atual) {
            continue;
        }

        let caminho = entrada.path();
        let apagou = if caminho.is_dir() {
            std::fs::remove_dir_all(&caminho)
        } else {
            // A versao 1 gravava solto em `mini/{id}.png`, sem pasta.
            std::fs::remove_file(&caminho)
        };

        if let Err(cause) = apagou {
            log::warn!("reducao velha ficou em {}: {cause}", caminho.display());
        }
    }
}

pub fn path(vault: &Vault, variante: Variante, id: &str) -> PathBuf {
    dir(vault, variante).join(format!("{id}.{}", variante.extensao()))
}

/// Apaga as reducoes. Chamado quando o arquivo sai do acervo.
///
/// Silencioso: sao cache, e cache que ficou para tras nao quebra nada -- o id
/// nunca se repete, entao ninguem vai receber a reducao do arquivo errado.
pub fn discard(vault: &Vault, id: &str) {
    for variante in [Variante::Mini, Variante::Tela] {
        let caminho = path(vault, variante, id);

        if let Err(cause) = std::fs::remove_file(&caminho) {
            if cause.kind() != std::io::ErrorKind::NotFound {
                log::warn!("{} de {id} ficou em {}: {cause}", variante.nome(), caminho.display());
            }
        }
    }
}

/// Reduz para caber em LADO x LADO, preservando proporcao.
///
/// ## Lanczos, e nao `thumbnail`
///
/// `DynamicImage::thumbnail` e o redutor RAPIDO da crate, e a primeira versao
/// disto o usava com o argumento de que "a diferenca visual num quadrado de
/// 40px e nenhuma". Medido depois, com o retrato de personagem de uma campanha
/// real reduzido de 765x1567 para 78x160: laplaciano 2688 contra 3783 do
/// Lanczos, uns trinta por cento do detalhe fino a menos. Lado a lado, o que a
/// versao rapida apagava era justamente o que se olha numa miniatura de
/// personagem -- o rosto, a lapela, o contorno do sapato.
///
/// O custo e tempo de CPU numa operacao que acontece uma vez por arquivo, num
/// `spawn_blocking` com fila de dois. Trocar nitidez permanente por
/// milissegundos que ninguem espera era o negocio errado.
///
/// ## Alfa pre-multiplicado
///
/// Reduzir RGBA direto mistura a COR dos pixels transparentes na borda do que e
/// opaco. Num recorte de personagem exportado com transparencia preta, isso
/// desenha uma auréola escura em volta da figura -- e ela aparece justamente na
/// miniatura, onde a borda ocupa proporcao muito maior da imagem.
///
/// Pre-multiplicar antes e desfazer depois faz a media acontecer no espaco em
/// que ela e valida: cor ponderada pela opacidade.
fn reduzir(origem: &image::RgbaImage, lado: u32) -> image::RgbaImage {
    let (largura, altura) = (origem.width(), origem.height());
    let maior = largura.max(altura);

    // Nunca AMPLIA: arquivo menor que o alvo ja e a propria reducao, e esticar
    // inventaria pixel que nao existe nele.
    if maior <= lado {
        return origem.clone();
    }

    let fator = f64::from(lado) / f64::from(maior);
    let alvo = |lado: u32| ((f64::from(lado) * fator).round() as u32).max(1);

    let mut pre = origem.clone();
    for pixel in pre.pixels_mut() {
        let alfa = u32::from(pixel[3]);
        for canal in 0..3 {
            pixel[canal] = ((u32::from(pixel[canal]) * alfa + 127) / 255) as u8;
        }
    }

    let mut reduzida = image::imageops::resize(
        &pre,
        alvo(largura),
        alvo(altura),
        image::imageops::FilterType::Lanczos3,
    );

    for pixel in reduzida.pixels_mut() {
        let alfa = u32::from(pixel[3]);
        if alfa == 0 {
            continue;
        }

        for canal in 0..3 {
            pixel[canal] = (((u32::from(pixel[canal]) * 255) + alfa / 2) / alfa).min(255) as u8;
        }
    }

    reduzida
}

/// Devolve a miniatura, gerando se ainda nao existe.
///
/// Recusa audio: `AssetMeta::peaks` e a "miniatura" de som, e ela e outra
/// coisa -- quem a calcula e a webview, que ja tem decodificador de audio.
pub fn ensure(vault: &Vault, variante: Variante, meta: &AssetMeta) -> AppResult<PathBuf> {
    if meta.kind != "image" {
        return Err(AppError::UnsupportedKind(meta.mime_type.clone()));
    }

    let destino = path(vault, variante, &meta.id);
    let origem = asset_path(vault, meta);

    // O original nunca muda depois de importado -- o nome do arquivo vem do id
    // --, entao existir basta: nao ha versao nova para conferir por mtime.
    if destino.exists() {
        return Ok(destino);
    }

    limpar_versoes_antigas(vault, variante);
    std::fs::create_dir_all(dir(vault, variante))?;

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
        .map_err(|cause| ilegivel(cause.to_string()))?;

    let cheia = imagem.to_rgba8();

    // A variante de tela e JPEG, e JPEG nao tem alfa. Um recorte com
    // transparencia reduzido para ela ganharia fundo preto, entao ela nao
    // existe para esse arquivo: quem pedir recebe o ORIGINAL, que e o
    // comportamento de antes desta rota. Na pratica isso nunca acontece com
    // mapa, e todo recorte deste projeto e menor que 1920 de qualquer forma.
    if !variante.preserva_alfa() && cheia.pixels().any(|pixel| pixel[3] != 255) {
        return Err(AppError::UnsupportedKind(format!(
            "{} tem transparencia e a variante {} e JPEG",
            meta.name,
            variante.nome()
        )));
    }

    // RGBA8 sempre na reducao: e nela que o alfa tem de sobreviver, e achatar
    // antes poria um retangulo preto em volta de cada figura.
    let rgba = reduzir(&cheia, variante.lado());

    let mut bytes = Vec::new();

    if variante.preserva_alfa() {
        PngEncoder::new(&mut bytes)
            .write_image(
                rgba.as_raw(),
                rgba.width(),
                rgba.height(),
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|cause| ilegivel(cause.to_string()))?;
    } else {
        let rgb = image::DynamicImage::ImageRgba8(rgba).to_rgb8();

        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, variante.qualidade())
            .write_image(
                rgb.as_raw(),
                rgb.width(),
                rgb.height(),
                image::ExtendedColorType::Rgb8,
            )
            .map_err(|cause| ilegivel(cause.to_string()))?;
    }

    // Atomico: duas telas pedem a mesma reducao ao mesmo tempo na primeira
    // abertura, e meio arquivo servido e uma imagem quebrada na tela.
    write_atomic(&destino, &bytes)?;

    Ok(destino)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// O lado da miniatura, para os testes falarem em numero.
    const LADO: u32 = 160;
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

        let caminho = ensure(&vault, Variante::Mini, &meta).expect("miniatura");
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

        ensure(&vault, Variante::Mini, &meta).expect("miniatura");

        // Em `.ato20/`, que e o que nao viaja no zip nem aparece num `ls
        // assets/`. Ver a nota do modulo.
        assert!(path(&vault, Variante::Mini, "a1").starts_with(vault.state_dir()));
        assert!(path(&vault, Variante::Mini, "a1").exists());
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

        let caminho = ensure(&vault, Variante::Mini, &meta).expect("primeira");
        let antes = std::fs::metadata(&caminho).expect("meta").modified().expect("mtime");

        std::thread::sleep(std::time::Duration::from_millis(20));
        ensure(&vault, Variante::Mini, &meta).expect("segunda");

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

        let mini = ImageReader::open(ensure(&vault, Variante::Mini, &meta).expect("miniatura"))
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
            ensure(&vault, Variante::Mini, &meta),
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
            ensure(&vault, Variante::Mini, &meta),
            Err(AppError::Malformed { .. })
        ));
    }

    #[test]
    fn recorte_transparente_nao_ganha_aureola() {
        // Recorte de personagem exportado com transparencia PRETA, que e o caso
        // comum. Reduzir RGBA direto mistura esse preto na borda do que e
        // opaco, e a auréola aparece justamente na miniatura.
        let mut origem = RgbaImage::new(400, 400);
        for (x, y, pixel) in origem.enumerate_pixels_mut() {
            let dentro = x >= 100 && x < 300 && y >= 100 && y < 300;
            *pixel = if dentro {
                image::Rgba([230, 40, 40, 255])
            } else {
                image::Rgba([0, 0, 0, 0])
            };
        }

        let mini = reduzir(&origem, LADO);
        let escala = mini.width() as f32 / 400.0;
        // Um pixel logo dentro da borda: e ali que a mistura apareceria.
        let x = (105.0 * escala) as u32;
        let y = (200.0 * escala) as u32;
        let borda = mini.get_pixel(x, y);

        assert!(
            borda[0] > 200,
            "a borda escureceu para {:?}: o alfa nao foi pre-multiplicado",
            borda
        );
    }

    #[test]
    fn reduzir_faz_media_em_vez_de_pular_pixel() {
        // Linhas de um pixel, alternando preto e branco. Um redutor correto
        // devolve cinza uniforme; vizinho-mais-proximo devolveria listras ou
        // uma cor chapada, e as duas denunciam filtro trocado.
        let mut origem = RgbaImage::new(640, 640);
        for (_x, y, pixel) in origem.enumerate_pixels_mut() {
            let tom = if y % 2 == 0 { 0 } else { 255 };
            *pixel = image::Rgba([tom, tom, tom, 255]);
        }

        let mini = reduzir(&origem, LADO);
        let tons: Vec<i32> = mini.pixels().map(|p| i32::from(p[0])).collect();
        let media = tons.iter().sum::<i32>() / tons.len() as i32;
        let desvio = tons.iter().map(|t| (t - media).abs()).max().unwrap_or(0);

        assert!((media - 128).abs() <= 12, "media {media}, esperado perto de 128");
        assert!(desvio <= 40, "variacao de {desvio}: parece listra, nao media");
    }

    #[test]
    fn miniatura_de_versao_antiga_e_apagada() {
        let (_dir, vault) = campanha();
        let meta = com_imagem(&vault, 300, 300);

        // A versao 1 gravava solto em `mini/{id}.png`. Ela nao pode sobreviver
        // a esta versao: `ensure` sai cedo quando ja existe arquivo, e a
        // campanha ficaria com a miniatura do algoritmo velho para sempre.
        let velha = vault.state_dir().join("mini").join("a1.png");
        std::fs::create_dir_all(velha.parent().expect("pai")).expect("pasta");
        std::fs::write(&velha, b"miniatura velha").expect("gravar");

        ensure(&vault, Variante::Mini, &meta).expect("miniatura");

        assert!(!velha.exists(), "a miniatura da versao antiga ficou");
        assert!(path(&vault, Variante::Mini, "a1").exists());
    }

    #[test]
    fn nao_amplia_arquivo_menor_que_a_miniatura() {
        let mut origem = RgbaImage::new(64, 80);
        for pixel in origem.pixels_mut() {
            *pixel = image::Rgba([10, 20, 30, 255]);
        }

        // Esticar inventaria pixel que nao existe no arquivo, e o PNG resultante
        // seria maior que o original para mostrar a mesma coisa.
        let mini = reduzir(&origem, LADO);
        assert_eq!((mini.width(), mini.height()), (64, 80));
    }

    #[test]
    fn variante_de_tela_sai_em_jpeg_e_menor() {
        let (_dir, vault) = campanha();
        // Maior que 1920, como um mapa de mesa.
        let meta = com_imagem(&vault, 3000, 2400);

        let caminho = ensure(&vault, Variante::Tela, &meta).expect("tela");
        assert_eq!(caminho.extension().and_then(|e| e.to_str()), Some("jpg"));

        let tela = ImageReader::open(&caminho)
            .expect("abrir")
            .with_guessed_format()
            .expect("formato")
            .decode()
            .expect("decodificar");

        assert_eq!(tela.width().max(tela.height()), 1920);

        /*
         * O ganho garantido e de MEMORIA, e e ele que se afirma aqui: menos
         * pixel decodificado no celular. 3000x2400 sao 7,2 Mpx (29 MB de
         * bitmap); 1920 de lado maior sao 2,9 Mpx (12 MB).
         *
         * Bytes no fio NAO se afirmam de proposito. O ganho real e enorme --
         * medido no mapa da campanha, 8,0 MB contra 0,44 MB --, mas ele depende
         * de como a origem comprime: a imagem sintetica deste teste e um
         * gradiente, que em PNG comprime melhor do que qualquer JPEG dela. Um
         * teste que afirmasse bytes estaria medindo o gerador de imagem do
         * teste, e nao a variante.
         */
        let antes = u64::from(meta.natural_width.unwrap()) * u64::from(meta.natural_height.unwrap());
        let depois = u64::from(tela.width()) * u64::from(tela.height());
        assert!(
            depois * 2 < antes,
            "a variante nao reduziu pixel: {antes} -> {depois}"
        );
    }

    #[test]
    fn tela_e_mini_nao_se_pisam() {
        let (_dir, vault) = campanha();
        let meta = com_imagem(&vault, 2400, 2400);

        let mini = ensure(&vault, Variante::Mini, &meta).expect("mini");
        let tela = ensure(&vault, Variante::Tela, &meta).expect("tela");

        // Pastas e extensoes diferentes: uma nao pode servir pela outra, senao
        // o celular receberia 160px e a lista receberia 1920.
        assert_ne!(mini, tela);
        assert!(mini.exists() && tela.exists());
    }

    #[test]
    fn recorte_transparente_nao_ganha_variante_de_tela() {
        let (_dir, vault) = campanha();

        let meta = AssetMeta {
            id: "recorte".into(),
            kind: "image".into(),
            name: "token.png".into(),
            mime_type: "image/png".into(),
            size: 0,
            created_at: 1,
            natural_width: Some(2400),
            natural_height: Some(2400),
            folder_id: None,
            escopo: None,
            peaks: None,
        };

        std::fs::create_dir_all(vault.assets_dir()).expect("assets dir");
        let mut imagem = RgbaImage::new(2400, 2400);
        for (x, _y, pixel) in imagem.enumerate_pixels_mut() {
            *pixel = image::Rgba([200, 30, 30, if x < 1200 { 0 } else { 255 }]);
        }
        imagem
            .save_with_format(asset_path(&vault, &meta), ImageFormat::Png)
            .expect("gravar");

        // JPEG nao tem alfa: a variante de tela poria fundo preto em volta da
        // figura. Recusar faz o daemon servir o original, que e o certo.
        assert!(matches!(
            ensure(&vault, Variante::Tela, &meta),
            Err(AppError::UnsupportedKind(_))
        ));

        // E a miniatura, que e PNG, continua funcionando para o mesmo arquivo.
        assert!(ensure(&vault, Variante::Mini, &meta).is_ok());
    }

    #[test]
    fn descartar_e_silencioso_quando_nao_existe() {
        let (_dir, vault) = campanha();

        // Chamado no `delete` de todo asset, inclusive som, que nunca teve uma.
        discard(&vault, "nunca-existiu");
    }
}
