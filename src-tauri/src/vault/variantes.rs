//! As versoes REDUZIDAS de um arquivo do acervo.
//!
//! Tres, e cada uma existe por uma razao propria:
//!
//!   `Mini`  (160px)   as listas -- acervo, camadas, retratos, previa de cena.
//!   `Tela`  (1920px)  o celular do jogador.
//!   `Palco` (4096px)  o palco do mestre e a TV, com o plano cheio.
//!
//! O acervo guarda o ORIGINAL, e essa decisao nao muda: e ele que vai para o
//! zip que viaja, e e ele que o palco volta a pedir quando o mestre amplia. O
//! problema e quem NAO precisa dele.
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
//! O PALCO do mestre e o terceiro, e o mais caro dos tres. Ele desenhava o
//! original, e o argumento era que "e onde se amplia para conferir detalhe" --
//! so que o gesto que doi e o contrario. Medido no motor do aplicativo
//! (WebKitGTK 4.1, tela cheia de 1920x1080, grade ligada, quarenta itens, um
//! mapa real de 8192x6144), cinco segundos por linha:
//!
//!   ampliando 1x<->2x, original 8192   19,4 fps   p95 274 ms   pior 772 ms
//!   ampliando 4x<->8x, original 8192   57,8 fps   p95  23 ms   pior  33 ms
//!   ampliando 1x<->2x, reduzido 4096   54,7 fps   p95  25 ms   pior  30 ms
//!   ampliando 4x<->8x, reduzido 4096   58,5 fps   p95  23 ms   pior  26 ms
//!
//! O que custa nao e o tamanho do arquivo: e o FATOR DE REDUCAO na hora de
//! rasterizar. Com o plano cheio, cinquenta megapixels sao espremidos em 1700px
//! de tela a cada quadro, e e isso que da o quadro de 772 ms -- a mesa ve o
//! palco travar quando o mestre afasta. Ampliado o custo some sozinho, porque
//! ai so o recorte visivel e amostrado, e por isso o original continua sendo
//! quem desenha o zoom fundo. Arrastar um token com o mesmo mapa nunca saiu de
//! 60 fps: o problema e a CAMERA, nao a cena.
//!
//! O degrau esta entre 6144 (59,8 fps) e 7168 (47,6 fps), e nao e limite de
//! textura -- o `MAX_TEXTURE_SIZE` da maquina medida e 16384.
//!
//! Medido em `scripts/perf/medir.mjs`, cenario `biblioteca`, acervo de 200:
//! sem `loading="lazy"` a tela buscava 200 arquivos e 1,9 GB; com ele, 47
//! arquivos e 464 MB. O `lazy` cortou o que esta fora da vista; a miniatura
//! corta o que sobrou -- os 47 visiveis passam a ser 47 PNGs de alguns KB.
//!
//! ## A miniatura sai em PALETA
//!
//! 256 cores escolhidas por arquivo, e nao RGBA de 8 bits por canal. Medido
//! pelo pipeline deste modulo sobre os arquivos de uma campanha real, a 160px:
//!
//!   retrato 900x900 (recorte)    43,2 KB -> 14,5 KB
//!   token   765x1567 (recorte)   16,3 KB ->  6,5 KB
//!   mapa    3537x3750            24,3 KB ->  9,7 KB
//!   mapa    3537x3750            34,6 KB -> 13,2 KB
//!
//! De duas e meia a tres vezes, em todo arquivo. Numa lista de sessenta a conta
//! sai de 2,5 MB para menos de 900 KB.
//!
//! COR, e nao compressao, e isso foi medido antes de ser escolhido: o nivel
//! maximo de zlib deixou os mesmos arquivos 2% MAIORES, e desligar os filtros de
//! linha, 7%. O padrao do `png` -- `Balanced`, filtro adaptativo -- ja e o
//! melhor dos tres. O que ocupava a miniatura eram os milhoes de cores que um
//! quadrado de 160px nao mostra.
//!
//! PNG, e nao JPEG, e isso nao e conservadorismo: JPEG seria cerca de duas vezes
//! menor ainda, e nao guarda alfa. Quatro dos seis arquivos medidos sao
//! RECORTE, e cada um viraria um retangulo de fundo preto no mapa. A paleta
//! mantem o alfa porque o `tRNS` guarda um por cor.
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
//!
//! So a MINIATURA e aquecida na importacao. As de tela e de palco nao, pelo
//! mesmo motivo uma da outra: reduzir e Lanczos sobre a imagem inteira, e
//! importar uma pasta de trinta mapas cobraria essa conta trinta vezes por uma
//! variante que talvez nem seja pedida nesta sessao. O preco e a PRIMEIRA
//! abertura de cada mapa grande, que espera a reducao sair -- uma vez por
//! arquivo, e depois dela e um `stat`.

use std::path::{Path, PathBuf};

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
    /// O palco do mestre e a TV, com o plano cheio. 4096px, JPEG.
    Palco,
}

impl Variante {
    /// O nome na rota e na pasta de cache. E o que o cliente escreve na URL.
    pub fn nome(self) -> &'static str {
        match self {
            Self::Mini => "mini",
            Self::Tela => "tela",
            Self::Palco => "palco",
        }
    }

    pub fn de_nome(nome: &str) -> Option<Self> {
        match nome {
            "mini" => Some(Self::Mini),
            "tela" => Some(Self::Tela),
            "palco" => Some(Self::Palco),
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
    ///
    /// 4096 para o palco. Nao e um numero de gosto: numa moldura de 1920px, um
    /// arquivo de 4096 ainda e maior que a tela ate 2,1 vezes de ampliacao, e e
    /// exatamente ai que o palco troca de volta pelo ORIGINAL -- a troca
    /// acontece no ponto em que a reducao deixaria de ser 1:1, entao nao ha
    /// zoom nenhum em que se veja menos detalhe do que se via antes dela. Ver
    /// `useVarianteDoFundo` no cliente.
    fn lado(self) -> u32 {
        match self {
            Self::Mini => 160,
            Self::Tela => 1920,
            Self::Palco => 4096,
        }
    }

    /// `true` = PNG (preserva alfa). `false` = JPEG.
    ///
    /// A miniatura e sempre PNG: ela desenha token e retrato, que sao recortes
    /// com transparencia, e 160px de PNG sao alguns KB de qualquer forma.
    ///
    /// As de tela e de palco sao sempre JPEG, e por isso SO existem para
    /// imagem opaca -- ver `ensure`. Um mapa com alfa nao existe na pratica, e
    /// um recorte de 1920px em PNG nao economizaria nada. Quem tiver alfa cai
    /// no original, que e o comportamento de antes destas rotas: no palco isso
    /// significa que o mapa transparente continua custando o que custava.
    fn preserva_alfa(self) -> bool {
        matches!(self, Self::Mini)
    }

    /// Qualidade do JPEG. 82 e onde a curva de tamanho vira: medido no mapa
    /// real, 0,44 MB contra 0,80 MB em 2560px, sem diferenca que se veja num
    /// celular.
    fn qualidade(self) -> u8 {
        82
    }

    /// Quantas cores a paleta guarda, quando a variante e indexada.
    ///
    /// So a miniatura e. As de TELA e de PALCO sao o arquivo que alguem olha
    /// de perto -- um mapa em 256 cores mostraria banda em todo ceu e toda
    /// sombra. A miniatura e um quadrado de 160px numa lista, e ali a conta e
    /// outra: quatro vezes menos bytes por um erro que nao se ve.
    ///
    /// 256 e o teto do PNG indexado de 8 bits. Descer para 128 tirou mais 15%
    /// nos arquivos medidos, e nao vale: o ganho seria de 1,5 KB por miniatura,
    /// e quem paga sao os rostos -- e retrato de personagem que mais aparece
    /// nessas listas.
    fn cores(self) -> Option<usize> {
        match self {
            Self::Mini => Some(256),
            Self::Tela | Self::Palco => None,
        }
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
 * 3 = miniatura em paleta de 256 cores. As de antes sao RGBA, de tres a quatro
 *     vezes maiores, e nao ha como distinguir uma da outra pelo nome.
 */
const VERSAO: u32 = 3;

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
    for variante in [Variante::Mini, Variante::Tela, Variante::Palco] {
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
    let Some((largura, altura)) = alvo(origem.width(), origem.height(), lado) else {
        return origem.clone();
    };

    let mut pre = origem.clone();
    for pixel in pre.pixels_mut() {
        let alfa = u32::from(pixel[3]);
        for canal in 0..3 {
            pixel[canal] = ((u32::from(pixel[canal]) * alfa + 127) / 255) as u8;
        }
    }

    let mut reduzida = image::imageops::resize(
        &pre,
        largura,
        altura,
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

/// O tamanho de saida para caber em LADO x LADO, ou `None` se ja cabe.
///
/// `None` e "nao reduz", e nao "reduz para o mesmo tamanho": arquivo menor que
/// o alvo ja e a propria reducao, e esticar inventaria pixel que nao existe
/// nele.
fn alvo(largura: u32, altura: u32, lado: u32) -> Option<(u32, u32)> {
    if largura.max(altura) <= lado {
        return None;
    }

    let fator = f64::from(lado) / f64::from(largura.max(altura));
    let lado_de = |valor: u32| ((f64::from(valor) * fator).round() as u32).max(1);

    Some((lado_de(largura), lado_de(altura)))
}

/// Divide por dois, com media de 2x2, enquanto a metade seguinte ainda couber.
///
/// E a metade barata do `reduzir_opaco`, e a razao de ela existir e medida: o
/// `imageops::resize` com Lanczos3 levando um mapa de 8192x6144 para 4096 custa
/// 2,5 s em release, e as mesmas metades custam 0,15 s. Dezesseis vezes, porque
/// uma media de 2x2 e aritmetica de inteiro sobre cada pixel uma vez, e o
/// Lanczos e treze amostras por eixo em ponto flutuante.
///
/// Reduzir por metades antes do filtro e o que uma pirâmide de mipmap faz, e
/// pela mesma razao: na proporcao exata de 2:1 a media de 2x2 E a reamostragem
/// correta -- cada pixel de saida e a area exata de quatro de entrada, sem peso
/// nenhum para escolher.
///
/// Medido entre a saida deste caminho e a do Lanczos direto, no mapa real
/// reduzido para 4096: RMSE de 0,47% e 2% menos detalhe fino pelo desvio do
/// laplaciano (1466 contra 1498). Para comparar, o `DynamicImage::thumbnail`
/// que este modulo ja recusou perdia trinta por cento.
///
/// Lado impar repete a ultima coluna ou linha em vez de descarta-la: jogar fora
/// encolheria a imagem meio pixel por metade, e com quatro metades isso vira
/// borda faltando.
fn metades(origem: &image::RgbImage, lado: u32) -> Option<image::RgbImage> {
    let mut atual: Option<image::RgbImage> = None;

    while {
        let fonte = atual.as_ref().unwrap_or(origem);
        fonte.width().max(fonte.height()) / 2 >= lado
    } {
        let fonte = atual.as_ref().unwrap_or(origem);
        let (largura, altura) = (fonte.width().div_ceil(2), fonte.height().div_ceil(2));
        let (fim_x, fim_y) = (fonte.width() - 1, fonte.height() - 1);

        let mut proxima = image::RgbImage::new(largura, altura);

        for y in 0..altura {
            let (y0, y1) = ((y * 2).min(fim_y), (y * 2 + 1).min(fim_y));

            for x in 0..largura {
                let (x0, x1) = ((x * 2).min(fim_x), (x * 2 + 1).min(fim_x));

                let quatro = [
                    fonte.get_pixel(x0, y0),
                    fonte.get_pixel(x1, y0),
                    fonte.get_pixel(x0, y1),
                    fonte.get_pixel(x1, y1),
                ];

                let mut media = [0u8; 3];
                for canal in 0..3 {
                    let soma: u32 = quatro.iter().map(|pixel| u32::from(pixel[canal])).sum();
                    // +2 antes de dividir por 4 arredonda em vez de truncar:
                    // truncar escurece a imagem um pouco a cada metade, e com
                    // quatro metades o mapa sai visivelmente mais escuro.
                    media[canal] = ((soma + 2) / 4) as u8;
                }

                proxima.put_pixel(x, y, image::Rgb(media));
            }
        }

        atual = Some(proxima);
    }

    atual
}

/// A mesma reducao, para imagem sem alfa.
///
/// Tres canais e nenhuma pre-multiplicacao: sem alfa nao ha borda para o
/// Lanczos sujar, entao o cuidado que o `reduzir` toma aqui seria so custo. E
/// custo grande, porque quem passa por aqui e o mapa inteiro -- ver o comentario
/// do `ensure_arquivo` que separa os dois caminhos.
///
/// Metades inteiras primeiro, Lanczos3 no resto. O filtro continua sendo o
/// Lanczos de proposito: a variante de palco e desenhada em tela cheia, e
/// trocar o redutor por um mais barato apareceria no mapa. O que as metades
/// fazem e entregar a ele uma imagem que ja esta a menos de duas vezes do alvo.
///
/// O alvo sai da imagem ORIGINAL, e nao do que as metades devolveram: e ele que
/// guarda a proporcao de quem entrou, e um lado impar no meio do caminho a
/// moveria por um pixel.
fn reduzir_opaco(origem: &image::RgbImage, lado: u32) -> image::RgbImage {
    let Some((largura, altura)) = alvo(origem.width(), origem.height(), lado) else {
        return origem.clone();
    };

    let filtro = image::imageops::FilterType::Lanczos3;

    match metades(origem, largura.max(altura)) {
        // As metades cairam exatamente no alvo, que e o caso de todo mapa de
        // lado potencia de dois. Nao ha resto para o Lanczos limpar.
        Some(base) if base.width() == largura && base.height() == altura => base,
        Some(base) => image::imageops::resize(&base, largura, altura, filtro),
        None => image::imageops::resize(origem, largura, altura, filtro),
    }
}

/// Quantas passadas o quantizador da sobre os pixels.
///
/// 1 le todos, e e o mais lento -- o autor sugere 10 como meio-termo. Aqui
/// sempre 1: o que entra nesta funcao ja passou pela reducao, entao sao no
/// maximo 160x160 pixels. O "lento" e um laco de vinte e cinco mil elementos
/// numa operacao que acontece uma vez por arquivo, num `spawn_blocking`.
const AMOSTRAGEM: i32 = 1;

/// A reducao em PNG INDEXADO, de `cores` cores.
///
/// Escrito com o `png` direto, e nao com o `PngEncoder` do `image`: este aceita
/// L8, La8, Rgb8 e Rgba8, e nenhum deles e paleta. O que a paleta pede sao dois
/// blocos que o formato ja tem -- `PLTE` com as cores e `tRNS` com o alfa de
/// cada uma --, e escreve-los e o que faz a miniatura caber em um quarto do
/// tamanho sem deixar de ser PNG para quem a le.
///
/// O alfa entra na ESCOLHA das cores, e nao depois dela: o quantizador trata
/// RGBA como quatro dimensoes. Quantizar so o RGB e pendurar o alfa depois
/// daria a mesma cor para o pixel opaco e para o transparente ao lado dele, e a
/// borda de todo recorte e feita justamente desses pares.
fn indexado(rgba: &image::RgbaImage, cores: usize) -> Result<Vec<u8>, String> {
    let quantizador = color_quant::NeuQuant::new(AMOSTRAGEM, cores, rgba.as_raw());
    let mapa = quantizador.color_map_rgba();

    let indices: Vec<u8> = rgba
        .pixels()
        .map(|pixel| quantizador.index_of(&pixel.0) as u8)
        .collect();

    let mut paleta = Vec::with_capacity(mapa.len() / 4 * 3);
    let mut alfas = Vec::with_capacity(mapa.len() / 4);

    for cor in mapa.chunks_exact(4) {
        paleta.extend_from_slice(&cor[..3]);
        alfas.push(cor[3]);
    }

    let mut bytes = Vec::new();
    let mut encoder = png::Encoder::new(&mut bytes, rgba.width(), rgba.height());

    encoder.set_color(png::ColorType::Indexed);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_palette(paleta);

    // `tRNS` so quando ha o que dizer: um mapa e opaco, e escrever o bloco
    // cheio de 255 gastaria 256 bytes para afirmar o padrao.
    if alfas.iter().any(|alfa| *alfa != 255) {
        encoder.set_trns(alfas);
    }

    let mut escritor = encoder.write_header().map_err(|cause| cause.to_string())?;
    escritor
        .write_image_data(&indices)
        .map_err(|cause| cause.to_string())?;
    escritor.finish().map_err(|cause| cause.to_string())?;

    Ok(bytes)
}

/// Devolve a miniatura, gerando se ainda nao existe.
///
/// Recusa audio: `AssetMeta::peaks` e a "miniatura" de som, e ela e outra
/// coisa -- quem a calcula e a webview, que ja tem decodificador de audio.
pub fn ensure(vault: &Vault, variante: Variante, meta: &AssetMeta) -> AppResult<PathBuf> {
    if meta.kind != "image" {
        return Err(AppError::UnsupportedKind(meta.mime_type.clone()));
    }

    ensure_arquivo(
        vault,
        variante,
        &asset_path(vault, meta),
        &meta.id,
        &meta.name,
    )
}

/// A reducao ja pronta, se ela existe e nao ficou para tras da origem.
///
/// Separada do `ensure` para quem serve poder responder o caminho quente sem
/// tomar o semaforo nem entrar num `spawn_blocking`: depois da primeira vez
/// isto e um `stat` e um `ServeFile` de alguns KB.
pub fn pronta(vault: &Vault, variante: Variante, chave: &str, origem: &Path) -> Option<PathBuf> {
    let destino = path(vault, variante, chave);

    atual(&origem_ou_nada(origem), &destino).then_some(destino)
}

/// `true` quando a reducao existe e e mais nova que a origem.
///
/// O acervo nao precisaria disto -- o original nunca muda depois de importado,
/// porque o nome do arquivo vem do id --, mas o ANEXO de personagem muda: o
/// mestre troca a ficha por outra com o mesmo nome, e uma reducao que so
/// conferisse existencia devolveria a ficha velha para sempre.
///
/// Origem ilegivel e `false` de proposito: o arquivo saiu do disco, e servir a
/// reducao dele seria mostrar o que nao existe mais. Quem chamar o `ensure`
/// depois disso recebe o erro de leitura, que e a resposta honesta.
fn atual(origem: &Option<std::fs::Metadata>, destino: &Path) -> bool {
    let (Some(fonte), Ok(pronta)) = (origem.as_ref(), std::fs::metadata(destino)) else {
        return false;
    };

    match (fonte.modified(), pronta.modified()) {
        (Ok(fonte), Ok(pronta)) => pronta >= fonte,
        // Sistema de arquivos sem mtime: a reducao que existe serve. E o
        // comportamento de antes desta checagem, e ele valia para o acervo,
        // que e a maioria do que passa por aqui.
        _ => true,
    }
}

fn origem_ou_nada(origem: &Path) -> Option<std::fs::Metadata> {
    std::fs::metadata(origem).ok()
}

/// A mesma reducao, para um arquivo que nao esta no acervo.
///
/// O acervo entra por `ensure`, que sabe montar caminho e chave a partir do
/// metadado. Quem nao tem metadado -- o anexo de personagem -- entra por aqui,
/// trazendo o caminho e uma chave de cache que ele mesmo monta; ver
/// `characters::anexo_chave`.
///
/// `nome` so aparece em mensagem de erro: e o que deixa "mapa.png nao decodifica"
/// legivel em vez de um hash.
pub fn ensure_arquivo(
    vault: &Vault,
    variante: Variante,
    origem: &Path,
    chave: &str,
    nome: &str,
) -> AppResult<PathBuf> {
    let destino = path(vault, variante, chave);

    if atual(&origem_ou_nada(origem), &destino) {
        return Ok(destino);
    }

    limpar_versoes_antigas(vault, variante);
    std::fs::create_dir_all(dir(vault, variante))?;

    let ilegivel = |cause: String| AppError::Malformed {
        file: nome.to_string(),
        cause,
    };

    // `with_guessed_format` e nao confiar na extensao: o mime aqui foi deduzido
    // do NOME na importacao, e um `.png` que na verdade e JPEG entrou assim.
    let leitor = ImageReader::open(origem)?
        .with_guessed_format()
        .map_err(|cause| ilegivel(cause.to_string()))?;

    let imagem = leitor
        .decode()
        .map_err(|cause| ilegivel(cause.to_string()))?;

    // Os dois caminhos se separam aqui, e nao dentro de um `match` no fim.
    //
    // O de ALFA -- a miniatura -- precisa de RGBA em todas as etapas, e paga
    // por isso a pre-multiplicacao. O de JPEG nao tem alfa NENHUM para
    // preservar: ele recusa a imagem que tiver, logo o que sobra e opaco por
    // construcao, e carregar um quarto canal de 255 por tres passadas sobre a
    // imagem inteira e trabalho que nao compra nada.
    //
    // Nao era assim, e ate a variante de tela isso nao importava: 1920px de
    // lado, e o custo se perdia. O `palco` e que trouxe a conta para a mesa --
    // 4096px a partir de um mapa de cinquenta megapixels. Medido no daemon,
    // gerando a variante do mapa real de 8192x6144 com o Rust em DEBUG, que e o
    // que `tauri dev` compila:
    //
    //   RGBA, Lanczos3 direto     92,8 s
    //   RGB,  Lanczos3 direto     78,6 s   <- este comentario
    //   RGB,  metades + Lanczos   30,5 s   <- mais o `reduzir_opaco`
    //
    // O caminho de RGB sozinho tira tres passadas de cinquenta milhoes de
    // pixels e uns 380 MB de alocacao; as metades tiram o resto. Em RELEASE, que
    // e o que a mesa roda, o mesmo arquivo sai em 1,08 s ponta a ponta --
    // decodificar, reduzir e escrever o JPEG.
    let bytes = match variante.cores() {
        Some(cores) => {
            // RGBA8 na reducao: e nela que o alfa tem de sobreviver, e achatar
            // antes poria um retangulo preto em volta de cada figura.
            let rgba = reduzir(&imagem.to_rgba8(), variante.lado());

            indexado(&rgba, cores).map_err(ilegivel)?
        }
        None => {
            // JPEG nao tem alfa. Um recorte com transparencia reduzido para ele
            // ganharia fundo preto, entao a variante nao existe para esse
            // arquivo: quem pedir recebe o ORIGINAL, que e o comportamento de
            // antes destas rotas. Na pratica isso nunca acontece com mapa.
            //
            // A varredura so acontece quando o formato admite alfa: um JPEG de
            // origem nao tem o que esconder, e perguntar pixel a pixel custaria
            // uma passada inteira para chegar sempre a mesma resposta.
            if imagem.color().has_alpha()
                && imagem.to_rgba8().pixels().any(|pixel| pixel[3] != 255)
            {
                return Err(AppError::UnsupportedKind(format!(
                    "{nome} tem transparencia e a variante {} e JPEG",
                    variante.nome()
                )));
            }

            let rgb = reduzir_opaco(&imagem.to_rgb8(), variante.lado());
            let mut bytes = Vec::new();

            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, variante.qualidade())
                .write_image(
                    rgb.as_raw(),
                    rgb.width(),
                    rgb.height(),
                    image::ExtendedColorType::Rgb8,
                )
                .map_err(|cause| ilegivel(cause.to_string()))?;

            bytes
        }
    };

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

    /// Uma imagem de ruido: cada pixel independente do vizinho.
    ///
    /// Gradiente nao serviria para medir a paleta -- ele ja comprime bem em
    /// RGBA, e o ganho apareceria menor do que e num retrato de verdade.
    fn com_ruido(vault: &Vault, lado: u32) -> AssetMeta {
        let meta = AssetMeta {
            id: "ruido".into(),
            kind: "image".into(),
            name: "retrato.png".into(),
            mime_type: "image/png".into(),
            size: 0,
            created_at: 1,
            natural_width: Some(lado),
            natural_height: Some(lado),
            folder_id: None,
            escopo: None,
            peaks: None,
        };

        std::fs::create_dir_all(vault.assets_dir()).expect("assets dir");

        // LCG, para o teste medir sempre a mesma imagem.
        let mut semente: u32 = 0x1234_5678;
        let mut proximo = || {
            semente = semente.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            (semente >> 16) as u8
        };

        let mut imagem = RgbaImage::new(lado, lado);
        for pixel in imagem.pixels_mut() {
            *pixel = image::Rgba([proximo(), proximo(), proximo(), 255]);
        }
        imagem
            .save_with_format(asset_path(vault, &meta), ImageFormat::Png)
            .expect("gravar original");

        meta
    }

    #[test]
    fn miniatura_sai_em_paleta_e_encolhe() {
        let (_dir, vault) = campanha();
        let meta = com_ruido(&vault, 900);

        let caminho = ensure(&vault, Variante::Mini, &meta).expect("miniatura");
        let bytes = std::fs::read(&caminho).expect("ler");

        // Tipo de cor no IHDR: 8 da assinatura, 8 do cabecalho do bloco, e o
        // tipo e o decimo primeiro byte dos dados. 3 = indexado.
        assert_eq!(bytes[25], 3, "a miniatura deixou de ser indexada");

        // O mesmo quadro em RGBA, que e o que ela era ate a versao 3. A conta
        // que importa nao e o byte exato -- e a ordem de grandeza que o celular
        // do jogador e a lista do acervo pagam por arquivo.
        let cheia = ImageReader::open(asset_path(&vault, &meta))
            .expect("abrir")
            .decode()
            .expect("decodificar")
            .to_rgba8();
        let reduzida = reduzir(&cheia, LADO);

        let mut rgba = Vec::new();
        image::codecs::png::PngEncoder::new(&mut rgba)
            .write_image(
                reduzida.as_raw(),
                reduzida.width(),
                reduzida.height(),
                image::ExtendedColorType::Rgba8,
            )
            .expect("rgba");

        assert!(
            bytes.len() * 2 < rgba.len(),
            "paleta em {} bytes contra {} em RGBA",
            bytes.len(),
            rgba.len()
        );

        // E ela continua sendo uma imagem, do tamanho certo: um PNG indexado
        // que ninguem consegue decodificar seria a pior forma de economizar.
        let lida = ImageReader::open(&caminho)
            .expect("abrir")
            .decode()
            .expect("decodificar");
        assert_eq!(lida.width(), LADO);
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

    #[test]
    fn palco_tem_nome_e_pasta_proprios() {
        let (_dir, vault) = campanha();

        // O nome e o que o cliente escreve na URL: se ele deixar de ser aceito,
        // o palco recebe 404 e volta a desenhar o original -- sem erro nenhum na
        // tela, so o travamento de volta.
        assert_eq!(Variante::de_nome("palco"), Some(Variante::Palco));

        let palco = path(&vault, Variante::Palco, "a1");
        assert_ne!(palco, path(&vault, Variante::Tela, "a1"));
        assert!(palco.starts_with(vault.state_dir()));
        assert_eq!(palco.extension().and_then(|e| e.to_str()), Some("jpg"));
    }

    #[test]
    fn reduz_por_metades_ate_o_alvo_sem_escurecer() {
        // 800 -> 400 -> 200: duas metades exatas, e o Lanczos nao precisa
        // entrar. Cinza chapado porque a media de quatro cinzas iguais e o
        // mesmo cinza -- qualquer truncamento em vez de arredondamento
        // apareceria aqui como imagem mais escura a cada metade.
        let origem = image::RgbImage::from_pixel(800, 600, image::Rgb([128, 128, 128]));
        let saida = reduzir_opaco(&origem, 200);

        assert_eq!((saida.width(), saida.height()), (200, 150));

        for pixel in saida.pixels() {
            assert_eq!(pixel.0, [128, 128, 128], "a metade mexeu no valor");
        }
    }

    #[test]
    fn metade_de_lado_impar_nao_perde_a_borda() {
        // 401 de largura: a ultima coluna nao tem par, e descarta-la encolheria
        // a imagem meio pixel por metade. Ela e marcada de branco sobre preto,
        // entao some sem deixar rastro se for jogada fora.
        let mut origem = image::RgbImage::from_pixel(401, 400, image::Rgb([0, 0, 0]));
        for y in 0..400 {
            origem.put_pixel(400, y, image::Rgb([255, 255, 255]));
        }

        let saida = reduzir_opaco(&origem, 200);
        let ultima = saida.width() - 1;
        let claro = (0..saida.height()).any(|y| saida.get_pixel(ultima, y)[0] > 60);

        assert!(claro, "a coluna da borda sumiu na reducao");
    }

    #[test]
    fn nao_amplia_imagem_menor_que_o_palco() {
        // Mesma regra da miniatura, e o caminho opaco tem a sua propria copia
        // dela: um token de 64x80 pedido como palco nao pode virar 4096.
        let origem = image::RgbImage::from_pixel(64, 80, image::Rgb([10, 20, 30]));
        let saida = reduzir_opaco(&origem, 4096);

        assert_eq!((saida.width(), saida.height()), (64, 80));
    }
}
