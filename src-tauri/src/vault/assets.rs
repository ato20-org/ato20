use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::atomic::{read_json, write_json};
use super::{now_ms, Vault};
use crate::error::{AppError, AppResult};

/// Metadado de um arquivo do acervo. O binario fica em `assets/`.
///
/// `remoteAt` e `remoteRoomId` sairam junto com o Supabase: eles respondiam
/// "este arquivo ja subiu, e para qual sala", pergunta que nao existe mais
/// quando o arquivo mora no disco de quem opera.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetMeta {
    pub id: String,
    /// `image`, `audio` ou `file`.
    pub kind: String,
    pub name: String,
    pub mime_type: String,
    pub size: u64,
    pub created_at: i64,
    /// Medidas naturais. So existem para imagem.
    ///
    /// Lidas do CABECALHO do arquivo na importacao, sem decodificar (ver
    /// `import`). Ausencia e estado valido -- arquivo com cabecalho ilegivel
    /// entra sem medida, e a cena perde so a proporcao sugerida ao arrastar.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub natural_width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub natural_height: Option<u32>,
    /// Pasta em que o mestre guardou. Ausente = raiz.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    /// A que este arquivo PERTENCE: `cena` ou `personagem`.
    ///
    /// Ausente e o caso comum -- imagem do acervo, que serve a cena qualquer:
    /// mobilia, handout, um mapa dentro do mapa. Presente quando o arquivo tem
    /// dono: fundo de cena, retrato ou miniatura de personagem.
    ///
    /// Existe para a BIBLIOTECA nao lista-lo. Antes toda imagem aparecia ali,
    /// inclusive o fundo e os dois arquivos de cada personagem, e a lista
    /// misturava o que se escolhe com o que ja foi escolhido -- numa campanha
    /// com dez personagens, vinte linhas que ninguem vai arrastar para o mapa.
    ///
    /// Marcado na importacao e nao derivado do uso: derivar exigiria varrer as
    /// cenas e os personagens a cada listagem. O preco e que a marca pode
    /// mentir se o campo for limpo depois -- o arquivo fica escondido sem ser
    /// de ninguem. Ver `asset_set_escopo`, que e como o cliente conserta.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub escopo: Option<String>,
    /// A forma da onda, para a barra da trilha desenhar. So para `audio`.
    ///
    /// Um valor por balde, de 0 a 100. Calculado UMA vez, pela webview, na
    /// primeira vez que a faixa aparece na barra -- e gravado aqui para nunca
    /// mais precisar decodificar o arquivo.
    ///
    /// Nao e calculado aqui no Rust de proposito: decodificar mp3, ogg, flac e
    /// m4a exigiria um decodificador de audio inteiro no binario, e o browser
    /// ja tem um. Ausente e estado valido -- a barra desenha uma linha lisa
    /// enquanto nao houver picos, e o arquivo continua tocando.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peaks: Option<Vec<u8>>,
    /// Como este som deve tocar: `trilha`, `ambiente` ou `disparo`. So `audio`.
    ///
    /// Escolhido na importacao e trocavel depois. Serve a duas perguntas que a
    /// mesa faz em momentos diferentes: o que ACONTECE ao acionar o arquivo, e
    /// onde ele aparece na lista -- que e agrupada por isto.
    ///
    /// Ausente e estado valido, e nao ha migracao: o som importado antes deste
    /// campo, e o largado na janela sem passar pelo botao, ficam sem tipo ate
    /// alguem escolher um. A lista os junta num grupo proprio em vez de chutar
    /// -- chutar `disparo` numa musica de dez minutos seria pior que perguntar.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tipo_de_som: Option<String>,
    /// A imagem se mexe: GIF, WebP ou APNG com mais de um quadro.
    ///
    /// Existe por duas perguntas. A de quem SERVE: a reducao de tela e de
    /// palco guardaria um quadro so, e o arquivo animado vai inteiro -- ver
    /// `serve_variante`. E a da BIBLIOTECA, que marca o arquivo que se mexe e o
    /// anima quando o mouse passa, porque a miniatura e sempre o primeiro
    /// quadro.
    ///
    /// Gravado tambem quando e `false`, e so para os tres formatos que admitem
    /// animacao (`animacao::pode_animar`): ausente quer dizer "ninguem olhou
    /// ainda", e e o que a primeira listagem depois desta versao preenche nos
    /// arquivos que ja existiam. Ver `preencher_animadas`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub animada: Option<bool>,
    /// O som nao tem arquivo: toca do YouTube. So `audio`.
    ///
    /// Presente, o asset e um LINK -- `size` e zero, `asset_path` aponta para
    /// um arquivo que nunca existiu, e quem toca e um player do YouTube em cada
    /// aparelho. Mora no acervo, e nao numa lista a parte, porque tudo o que o
    /// som faz e pelo `id`: trilha, ambiente, pad, macro, pasta, busca. Uma
    /// lista propria seria a segunda copia de cada uma dessas portas.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub youtube: Option<SomDoYoutube>,
}

/// Um video do YouTube tocado como som, e o trecho dele que vale.
///
/// O trecho e o recorte que um arquivo faria cortando, e aqui sai de graca:
/// o player so busca o pedaco que toca, entao um ambiente de dez horas custa o
/// mesmo que um de dez minutos.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SomDoYoutube {
    /// Os onze caracteres depois de `watch?v=`. Nunca a URL: quem monta o
    /// endereco e a ponte, e um link livre gravado aqui seria um endereco
    /// qualquer carregado em todo aparelho da mesa.
    pub video: String,
    /// Onde o trecho comeca, em segundos. Ausente = do comeco do video.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inicio: Option<f64>,
    /// Onde o trecho acaba, em segundos. Ausente = ate o fim do video.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fim: Option<f64>,
}

/// O que a tela manda para por um video no acervo.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NovoDoYoutube {
    /// O titulo do video, que vira o nome do som.
    pub nome: String,
    #[serde(flatten)]
    pub som: SomDoYoutube,
}

/// O `mime_type` de um som do YouTube.
///
/// Nao e de arquivo nenhum, e e por isso que existe: `kind_for` e o
/// `extension_for` caem no generico com ele, e quem le o indice a mao ve o que
/// a linha e sem procurar o campo `youtube`.
pub const MIME_DO_YOUTUBE: &str = "audio/x-youtube";

/// Pasta do acervo. Pasta dentro de pasta pelo `parent_id`; ausente = raiz.
///
/// Um campo e nao uma arvore: a lista continua plana em `pastas.json`, e a
/// pasta antiga sem o campo le como raiz. Migracao zero.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetFolder {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}

/// `image`, `audio` ou `file`: a biblioteca aceita qualquer arquivo. Imagem e
/// som tem tratamento proprio -- medida, variante, trilha --; o resto e um
/// arquivo que a campanha guarda e o mestre abre por fora.
fn kind_for(mime: &str) -> AppResult<&'static str> {
    if mime.starts_with("image/") {
        Ok("image")
    } else if mime.starts_with("audio/") {
        Ok("audio")
    } else {
        Ok("file")
    }
}

/// Caminho do binario. Derivado do id e do tipo, nunca do nome que o usuario
/// deu -- nome de arquivo vindo de fora nao toca caminho.
pub fn asset_path(vault: &Vault, meta: &AssetMeta) -> PathBuf {
    vault
        .assets_dir()
        .join(format!("{}.{}", meta.id, super::mime::extension_for(&meta.mime_type)))
}

pub fn index(vault: &Vault) -> AppResult<Vec<AssetMeta>> {
    Ok(read_json(&vault.assets_index_path())?.unwrap_or_default())
}

fn write_index(vault: &Vault, assets: &[AssetMeta]) -> AppResult<()> {
    write_json(&vault.assets_index_path(), &assets)
}

/// O acervo, do mais novo para o mais velho.
///
/// A primeira listagem de uma campanha que ja existia antes de
/// `AssetMeta::animada` tambem responde essa pergunta para cada GIF, WebP e
/// PNG dela, e grava. Ver `preencher_animadas`.
pub fn list(vault: &Vault, kind: Option<&str>) -> AppResult<Vec<AssetMeta>> {
    let mut assets = index(vault)?;

    if preencher_animadas(vault, &mut assets) {
        // Falhar aqui nao pode esconder o acervo: a resposta vale para esta
        // listagem, e a proxima tenta gravar de novo.
        if let Err(cause) = write_index(vault, &assets) {
            log::warn!("acervo: nao gravou quais imagens se mexem: {cause}");
        }
    }

    if let Some(kind) = kind {
        assets.retain(|asset| asset.kind == kind);
    }

    assets.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(assets)
}

/// Responde `animada` em quem ainda nao tem. `true` se mudou alguma linha.
///
/// Uma vez por arquivo e por campanha: depois disto o campo existe, `false`
/// inclusive, e a listagem seguinte nao abre arquivo nenhum. O custo da
/// primeira e ler o cabecalho de cada PNG e WebP do acervo, e decodificar os
/// dois primeiros quadros de cada GIF.
///
/// Arquivo ilegivel fica sem resposta, e nao com `false`: a pergunta volta na
/// proxima listagem, e quem serve continua reduzindo como antes.
pub fn preencher_animadas(vault: &Vault, assets: &mut [AssetMeta]) -> bool {
    let mut mudou = false;

    for asset in assets.iter_mut() {
        if asset.animada.is_some()
            || asset.kind != "image"
            || !super::animacao::pode_animar(&asset.mime_type)
        {
            continue;
        }

        match super::animacao::animada(&asset_path(vault, asset)) {
            Ok(animada) => {
                asset.animada = Some(animada);
                mudou = true;
            }
            Err(cause) => log::warn!("acervo: {} sem resposta de animacao: {cause}", asset.name),
        }
    }

    mudou
}

/// Grava se o arquivo se mexe. Quem chama e o daemon, quando serve antes de a
/// listagem ter passado -- ver `serve_variante`. Silencioso como `set_peaks`.
pub fn set_animada(vault: &Vault, id: &str, animada: bool) -> AppResult<()> {
    let mut assets = index(vault)?;

    let Some(asset) = assets.iter_mut().find(|asset| asset.id == id) else {
        return Ok(());
    };

    asset.animada = Some(animada);

    write_index(vault, &assets)
}

pub fn find(vault: &Vault, id: &str) -> AppResult<Option<AssetMeta>> {
    Ok(index(vault)?.into_iter().find(|asset| asset.id == id))
}

/// Traz arquivos de fora para o acervo, copiando.
///
/// E o caminho do mestre importando imagem e som, e ele COPIA em vez de mover:
/// o arquivo escolhido e do usuario, esta na pasta dele, e provavelmente e
/// usado por outra coisa. Mover seria arrancar.
///
/// Substituiu o envio por HTTP, e a diferenca nao e so de gosto. Antes o
/// navegador lia o arquivo inteiro, mandava por multipart pelo loopback e o
/// daemon gravava -- tres travessias para o que o sistema de arquivos faz numa.
/// Um mapa de 80MB pagava isso todo, e o limite de corpo do axum cortava o
/// stream no meio.
///
/// As medidas saem do CABECALHO da imagem, sem decodificar. Elas eram medidas na
/// webview, o que fazia sentido enquanto o arquivo passava por la; agora ele
/// nunca chega ao navegador.
///
/// Devolve o que entrou e o motivo do que ficou de fora, em vez de falhar no
/// primeiro erro: quem escolheu doze arquivos e teve um recusado quer os onze e
/// quer saber qual.
pub fn import(
    vault: &Vault,
    origens: &[PathBuf],
    escopo: Option<&str>,
) -> AppResult<(Vec<AssetMeta>, Vec<String>)> {
    let feito = import_acompanhado(vault, origens, escopo, &mut Silencio)?;

    Ok((feito.aceitos, feito.recusados))
}

/// Traz bytes que a webview tem na mao para o acervo.
///
/// E a colagem: um print de tela ou uma imagem copiada do navegador nunca
/// existiu como arquivo, entao nao ha caminho para mandar -- diferente de toda
/// outra importacao, onde o arquivo ja esta no disco e o que atravessa a ponte e
/// o endereco dele.
///
/// Os bytes viram um arquivo TEMPORARIO e passam pela `import` de sempre, em vez
/// de uma importacao propria. Custa escrever os bytes duas vezes; compra que
/// classificacao, medidas, indice, limite e motivo de recusa continuem escritos
/// num lugar so. Uma importacao propria seria a terceira copia dessas regras, e
/// a que um dia esquece uma delas.
///
/// O temporario vai numa PASTA e nao com nome sorteado, porque `import` tira o
/// nome do asset do `file_name()` do que recebe: um arquivo chamado
/// `.colado-3f9a.png` viraria um asset com esse nome na biblioteca. Dentro da
/// pasta ele tem o nome bom, e a pasta e que e sorteada.
pub fn import_bytes(
    vault: &Vault,
    nome: &str,
    bytes: &[u8],
    escopo: Option<&str>,
) -> AppResult<(Vec<AssetMeta>, Vec<String>)> {
    let nome = nome_colado(nome);

    let pasta = vault
        .assets_dir()
        .join(format!(".colando-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&pasta)?;

    let caminho = pasta.join(&nome);
    let saida = std::fs::write(&caminho, bytes)
        .map_err(AppError::from)
        .and_then(|()| import(vault, &[caminho], escopo));

    // Sai mesmo se a importacao falhou: a pasta nao pode ficar para tras dentro
    // de `assets/`, e o erro que importa e o da importacao, nao o da limpeza.
    if let Err(cause) = std::fs::remove_dir_all(&pasta) {
        log::warn!("acervo: {} ficou para tras: {cause}", pasta.display());
    }

    saida
}

/// O nome que o colado leva para a biblioteca.
///
/// So o BASENAME, sem separador de caminho e sem os caracteres que nao viram
/// arquivo. NAO passa pelo `safe_attachment_name` dos anexos, de proposito:
/// aquele faz slug, e "Colado 2026-09-23 14h32.png" chegaria na lista como
/// "colado-2026-09-23-14h32.png". O asset que entra por arrasto guarda o nome do
/// arquivo como ele e, com espacos e maiusculas -- colar seria a unica entrada
/// torta na mesma lista.
fn nome_colado(nome: &str) -> String {
    let base = nome.rsplit(['/', '\\']).next().unwrap_or(nome).trim();

    let limpo: String = base
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .take(120)
        .collect();

    // So pontos, so espacos, ou vazio: nomes que o sistema de arquivos recusa
    // ou que apontam para a propria pasta.
    if limpo.trim().trim_matches('.').is_empty() {
        return "Colado.png".to_string();
    }

    limpo
}

/// Quem assiste a copia, bloco a bloco.
///
/// A copia de um mapa de 80 MB leva segundos, e ate aqui a unica noticia dela
/// era a resposta no fim. `avancou` recebe o quanto ja foi de CADA arquivo, e
/// `cancelado` e consultado entre blocos e entre arquivos -- e o que permite
/// desistir no meio sem esperar o lote inteiro.
pub trait Acompanhante {
    /// Bytes copiados ate agora deste arquivo, do total dele.
    fn avancou(&mut self, nome: &str, copiado: u64, total: u64);

    /// A copia acabou e a MINIATURA esta sendo gerada. Etapa a parte porque
    /// e ela quem demora num arquivo local: copiar 17 MB do mesmo disco leva
    /// milissegundos, decodificar e reduzir o JPEG leva segundos -- e sem este
    /// aviso a barra parava em 100% com o toast ainda dizendo "importando".
    fn miniatura(&mut self, _nome: &str) {}

    /// Pediram para parar. O arquivo em andamento e descartado e os
    /// seguintes nem comecam.
    fn cancelado(&self) -> bool {
        false
    }
}

/// Acompanhante de quem nao quer saber: a importacao de um arquivo so, feita
/// por dentro de outro comando, e os testes.
pub struct Silencio;

impl Acompanhante for Silencio {
    fn avancou(&mut self, _nome: &str, _copiado: u64, _total: u64) {}
}

/// O que `import_acompanhado` devolve.
pub struct Importado {
    pub aceitos: Vec<AssetMeta>,
    pub recusados: Vec<String>,
    /// Parou porque pediram, e nao porque acabou. O que ja entrou fica.
    pub cancelado: bool,
}

/// Tamanho do bloco da copia. Um mebibyte: grande o bastante para o disco nao
/// ver diferenca de um `fs::copy`, pequeno o bastante para o progresso mexer
/// varias vezes por segundo num mapa de 80 MB.
const BLOCO: usize = 1024 * 1024;

/// Copia em blocos, avisando a cada um e parando se pedirem.
///
/// `Ok(false)` e cancelamento: o destino parcial ja foi apagado. Um `fs::copy`
/// teria sido uma linha, mas e opaco -- nao ha como saber quanto foi nem como
/// interromper.
fn copiar_acompanhando(
    origem: &Path,
    destino: &Path,
    nome: &str,
    total: u64,
    quem: &mut dyn Acompanhante,
) -> std::io::Result<bool> {
    use std::io::{Read, Write};

    let mut de = std::fs::File::open(origem)?;
    let mut para = std::fs::File::create(destino)?;
    let mut buffer = vec![0u8; BLOCO];
    let mut copiado: u64 = 0;

    quem.avancou(nome, 0, total);

    loop {
        if quem.cancelado() {
            drop(para);
            let _ = std::fs::remove_file(destino);
            return Ok(false);
        }

        let lidos = de.read(&mut buffer)?;
        if lidos == 0 {
            break;
        }

        para.write_all(&buffer[..lidos])?;
        copiado += lidos as u64;
        quem.avancou(nome, copiado, total);
    }

    para.flush()?;

    Ok(true)
}

/// `import`, com alguem assistindo. Ver `Acompanhante`.
pub fn import_acompanhado(
    vault: &Vault,
    origens: &[PathBuf],
    escopo: Option<&str>,
    quem: &mut dyn Acompanhante,
) -> AppResult<Importado> {
    std::fs::create_dir_all(vault.assets_dir())?;

    let mut aceitos = Vec::new();
    let mut recusados = Vec::new();
    let mut cancelado = false;
    let mut indice = index(vault)?;

    for origem in origens {
        if quem.cancelado() {
            cancelado = true;
            break;
        }

        let nome = origem
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "arquivo".to_string());

        let mime_type = super::mime::from_name(&nome).to_string();

        let kind = match kind_for(&mime_type) {
            Ok(kind) => kind,
            Err(_) => {
                recusados.push(format!("{nome}: o acervo aceita imagem e som"));
                continue;
            }
        };

        let tamanho = match std::fs::metadata(origem) {
            Ok(meta) => meta.len(),
            Err(cause) => {
                recusados.push(format!("{nome}: {cause}"));
                continue;
            }
        };

        // So imagem tem medida, e ausencia nao impede a entrada: sem ela a cena
        // perde a proporcao sugerida ao arrastar, e o arquivo continua valendo.
        let (largura, altura) = if kind == "image" {
            match imagesize::size(origem) {
                Ok(medida) => (Some(medida.width as u32), Some(medida.height as u32)),
                Err(cause) => {
                    log::warn!("acervo: {nome} sem medidas legiveis: {cause}");
                    (None, None)
                }
            }
        } else {
            (None, None)
        };

        let mut meta = AssetMeta {
            id: uuid::Uuid::new_v4().to_string(),
            kind: kind.to_string(),
            name: nome.clone(),
            mime_type,
            size: tamanho,
            created_at: now_ms(),
            natural_width: largura,
            natural_height: altura,
            folder_id: None,
            escopo: escopo.map(str::to_string),
            peaks: None,
            // Sem tipo na entrada, de proposito: quem importa e a TELA, e ela
            // marca os aceitos logo depois com o que o mestre escolheu no
            // botao. Um parametro a mais aqui atravessaria a importacao inteira
            // -- que tambem serve o arrasto de pasta misturando imagem e som --
            // para um campo que so o audio tem.
            tipo_de_som: None,
            // Respondido depois da copia, do arquivo que ja esta no acervo.
            animada: None,
            youtube: None,
        };

        // Binario primeiro, indice depois -- mesma ordem de `adopt`, e pelo
        // mesmo motivo: o pior caso e um binario orfao, que nao aparece em
        // lista nenhuma, e nao uma linha apontando para o vazio.
        match copiar_acompanhando(origem, &asset_path(vault, &meta), &nome, tamanho, quem) {
            Ok(true) => {}
            Ok(false) => {
                cancelado = true;
                break;
            }
            Err(cause) => {
                let _ = std::fs::remove_file(asset_path(vault, &meta));
                recusados.push(format!("{nome}: {cause}"));
                continue;
            }
        }

        // Se ela se mexe, do arquivo que acabou de entrar -- e no mesmo disco
        // quente da miniatura. Ilegivel fica sem resposta, e a listagem tenta
        // de novo. Ver `AssetMeta::animada`.
        if meta.kind == "image" && super::animacao::pode_animar(&meta.mime_type) {
            meta.animada = super::animacao::animada(&asset_path(vault, &meta)).ok();
        }

        // Aquece a MINIATURA aqui, e nao so sob demanda: o arquivo acabou de
        // ser lido, o disco esta quente, e o mestre normalmente importa antes
        // de abrir a lista. Falhar nao recusa o arquivo -- o daemon gera de
        // novo no primeiro pedido, e se nem la der, serve o original.
        //
        // A variante de TELA nao entra aqui: ela e do celular do jogador, que
        // pode nem existir nesta sessao, e gerar um JPEG de 1920px por arquivo
        // importado cobraria segundos de uma importacao de trinta mapas.
        if meta.kind == "image" {
            // Cancelar aqui ainda vale: a copia acabou, mas o arquivo nao esta
            // no indice, e apaga-lo deixa tudo como antes.
            if quem.cancelado() {
                let _ = std::fs::remove_file(asset_path(vault, &meta));
                cancelado = true;
                break;
            }

            quem.miniatura(&nome);

            if let Err(cause) = super::variantes::ensure(vault, super::variantes::Variante::Mini, &meta) {
                log::warn!("acervo: {} entrou sem miniatura: {cause}", meta.name);
            }
        }

        indice.push(meta.clone());
        aceitos.push(meta);
    }

    // Uma gravacao do indice para o lote inteiro, e nao uma por arquivo:
    // importar uma pasta de trinta mapas reescreveria o indice trinta vezes.
    if !aceitos.is_empty() {
        write_index(vault, &indice)?;
    }

    Ok(Importado {
        aceitos,
        recusados,
        cancelado,
    })
}

pub fn delete(vault: &Vault, id: &str) -> AppResult<()> {
    let mut assets = index(vault)?;

    let Some(position) = assets.iter().position(|asset| asset.id == id) else {
        return Ok(());
    };

    let meta = assets.remove(position);

    // Indice primeiro: se o `remove_file` falhar, o arquivo ja saiu da lista e
    // o mestre nao ve mais nada quebrado. O contrario deixaria uma linha
    // apontando para um binario que nao existe.
    write_index(vault, &assets)?;

    if let Err(cause) = std::fs::remove_file(asset_path(vault, &meta)) {
        if cause.kind() != std::io::ErrorKind::NotFound {
            log::warn!("acervo: {} saiu do indice mas o binario ficou: {cause}", meta.id);
        }
    }

    super::variantes::discard(vault, &meta.id);

    Ok(())
}

/// Guarda a forma da onda de um arquivo de som.
///
/// Escrito uma vez por arquivo. Chamado pela tela na primeira vez que a faixa
/// aparece na barra, depois de decodificar o audio -- ver o comentario em
/// `AssetMeta::peaks`.
///
/// Recusa em silencio um id que nao existe ou que nao e som: e uma otimizacao
/// de desenho, e falhar aqui nao pode custar a sessao.
pub fn set_peaks(vault: &Vault, id: &str, peaks: Vec<u8>) -> AppResult<()> {
    let mut assets = index(vault)?;

    let Some(asset) = assets.iter_mut().find(|asset| asset.id == id) else {
        return Ok(());
    };

    // O som do YouTube nao tem arquivo para medir. A tela nem tenta, e isto e
    // so a porta fechada do lado de ca.
    if asset.kind != "audio" || asset.youtube.is_some() {
        return Ok(());
    }

    // Teto no numero de baldes: o valor vem da tela, e um array de um milhao de
    // posicoes gravado no `assets.json` engordaria a leitura de todo o acervo
    // para sempre.
    asset.peaks = Some(peaks.into_iter().take(MAX_PEAKS).collect());

    write_index(vault, &assets)
}

/// Quantos baldes a forma da onda pode ter.
///
/// A barra desenha ~120. O teto e folgado para caber uma tela larga, e existe
/// so para o `assets.json` nao virar despejo do que a webview mandar.
pub const MAX_PEAKS: usize = 512;

/// Move para uma pasta. `None` devolve a raiz. So metadado: o binario nao anda.
/// Marca ou desmarca o dono do arquivo. Ver `AssetMeta::escopo`.
pub fn set_escopo(vault: &Vault, id: &str, escopo: Option<String>) -> AppResult<()> {
    let mut assets = index(vault)?;

    let Some(asset) = assets.iter_mut().find(|asset| asset.id == id) else {
        return Ok(());
    };

    asset.escopo = escopo;

    write_index(vault, &assets)
}

/// Como o som toca: `trilha`, `ambiente` ou `disparo`. `None` limpa.
///
/// Recusa em silencio um valor que nao e um dos tres, um id que nao existe e um
/// arquivo que nao e som -- e otimizacao de organizacao, e derrubar a tela por
/// causa dela custaria mais do que ela vale.
pub fn set_tipo_de_som(vault: &Vault, id: &str, tipo: Option<String>) -> AppResult<()> {
    if let Some(tipo) = tipo.as_deref() {
        if !matches!(tipo, "trilha" | "ambiente" | "disparo") {
            return Ok(());
        }
    }

    let mut assets = index(vault)?;

    let Some(asset) = assets.iter_mut().find(|asset| asset.id == id) else {
        return Ok(());
    };

    if asset.kind != "audio" {
        return Ok(());
    }

    // Efeito do YouTube nao existe: o player leva um ou dois segundos para
    // comecar, e um tiro que soa dois segundos depois da tecla deixou de ser
    // tiro. A tela nem oferece; isto e o indice nao aceitar por outra porta.
    if asset.youtube.is_some() && tipo.as_deref() == Some("disparo") {
        return Ok(());
    }

    asset.tipo_de_som = tipo;

    write_index(vault, &assets)
}

/// Poe no acervo sons que tocam do YouTube, todos do mesmo tipo.
///
/// Uma lista, e nao um por chamada, porque a playlist entra inteira: cada
/// chamada reescreve o `assets.json` inteiro, e cinquenta videos seriam
/// cinquenta gravacoes do indice em vez de uma.
///
/// Confere tudo antes de gravar qualquer coisa. Um video ruim no meio recusa a
/// leva, e nao entra metade: a tela ja validou, e chegar aqui com lixo e
/// defeito dela -- melhor um erro na cara do que um acervo pela metade.
///
/// So `trilha` e `ambiente`. Ver o comentario em `set_tipo_de_som`.
pub fn add_youtube(
    vault: &Vault,
    sons: Vec<NovoDoYoutube>,
    tipo: &str,
) -> AppResult<Vec<AssetMeta>> {
    if !matches!(tipo, "trilha" | "ambiente") {
        return Err(AppError::SomInvalido(crate::texto!(
            "Som do YouTube toca como trilha ou ambiente, nao como {}.",
            "A YouTube sound plays as music or ambience, not as {}.",
            curto(tipo),
        )));
    }

    let mut novos = Vec::with_capacity(sons.len());

    for novo in sons {
        let som = validar_youtube(novo.som)?;
        let nome: String = novo.nome.trim().chars().take(200).collect();

        novos.push(AssetMeta {
            id: uuid::Uuid::new_v4().to_string(),
            kind: "audio".to_string(),
            // Video sem titulo e raro -- o oEmbed sempre traz um --, mas a linha
            // da lista E o nome, e uma linha em branco seria um som que ninguem
            // acha.
            name: if nome.is_empty() { format!("YouTube {}", som.video) } else { nome },
            mime_type: MIME_DO_YOUTUBE.to_string(),
            size: 0,
            created_at: now_ms(),
            natural_width: None,
            natural_height: None,
            folder_id: None,
            escopo: None,
            peaks: None,
            tipo_de_som: Some(tipo.to_string()),
            animada: None,
            youtube: Some(som),
        });
    }

    if novos.is_empty() {
        return Ok(novos);
    }

    let mut assets = index(vault)?;
    assets.extend(novos.iter().cloned());
    write_index(vault, &assets)?;

    Ok(novos)
}

/// Troca o trecho de um som do YouTube. `None` nas duas pontas = o video todo.
///
/// Id que nao existe, ou que nao e do YouTube, sai em silencio, como nas
/// outras trocas de metadado. Trecho torto e erro: esse veio de um campo que o
/// mestre preencheu, e ele precisa saber que nao entrou.
pub fn set_trecho_youtube(
    vault: &Vault,
    id: &str,
    inicio: Option<f64>,
    fim: Option<f64>,
) -> AppResult<()> {
    let mut assets = index(vault)?;

    let Some(asset) = assets.iter_mut().find(|asset| asset.id == id) else {
        return Ok(());
    };

    let Some(atual) = asset.youtube.clone() else {
        return Ok(());
    };

    asset.youtube = Some(validar_youtube(SomDoYoutube { video: atual.video, inicio, fim })?);

    write_index(vault, &assets)
}

/// Confere o id e acerta o trecho.
///
/// O id tem onze caracteres de base64 de URL -- letra, numero, `-` e `_`. E o
/// que impede um endereco arbitrario de entrar no indice e ser carregado na
/// ponte de cada aparelho.
///
/// Ponta zero, negativa ou que nao e numero vira ausente em vez de erro: "do
/// comeco" e "comeca no 0" sao a mesma coisa, e o campo vazio da tela chega
/// como um dos dois.
fn validar_youtube(som: SomDoYoutube) -> AppResult<SomDoYoutube> {
    let id_valido = som.video.len() == 11
        && som
            .video
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');

    if !id_valido {
        return Err(AppError::SomInvalido(crate::texto!(
            "{} nao e um video do YouTube.",
            "{} is not a YouTube video.",
            curto(&som.video),
        )));
    }

    let ponta = |valor: Option<f64>| valor.filter(|s| s.is_finite() && *s > 0.0);
    let inicio = ponta(som.inicio);
    let fim = ponta(som.fim);

    if let (Some(inicio), Some(fim)) = (inicio, fim) {
        if fim <= inicio {
            return Err(AppError::SomInvalido(crate::texto!(
                "O trecho acaba antes de comecar.",
                "The clip ends before it starts.",
            )));
        }
    }

    Ok(SomDoYoutube { video: som.video, inicio, fim })
}

/// O comeco de um texto que veio de fora, para caber numa mensagem de erro.
fn curto(texto: &str) -> String {
    texto.chars().take(40).collect()
}

/// Troca o nome de exibicao do arquivo.
///
/// So metadado. O binario no disco e nomeado pelo `id` mais a extensao do
/// mime -- ver `asset_path` --, entao o nome novo nao precisa manter extensao
/// nenhuma: tirar o `.mp3` do fim nao faz o som deixar de tocar.
///
/// Nome vazio e recusado em silencio, como um id que nao existe: a linha da
/// lista E o nome, e uma sem nome seria um arquivo que o mestre nao acha mais.
pub fn rename(vault: &Vault, id: &str, name: &str) -> AppResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Ok(());
    }

    let mut assets = index(vault)?;

    let Some(asset) = assets.iter_mut().find(|asset| asset.id == id) else {
        return Ok(());
    };

    asset.name = name.to_string();

    write_index(vault, &assets)
}

pub fn set_folder(vault: &Vault, id: &str, folder_id: Option<String>) -> AppResult<()> {
    let mut assets = index(vault)?;

    let Some(asset) = assets.iter_mut().find(|asset| asset.id == id) else {
        return Ok(());
    };

    asset.folder_id = folder_id;

    write_index(vault, &assets)
}

// --- pastas -----------------------------------------------------------------

/// Em ordem alfabetica: a lista e navegada com o olho, nao por recencia.
pub fn folders(vault: &Vault) -> AppResult<Vec<AssetFolder>> {
    let mut folders: Vec<AssetFolder> =
        read_json(&vault.folders_path())?.unwrap_or_default();

    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(folders)
}

pub fn create_folder(
    vault: &Vault,
    name: &str,
    parent_id: Option<String>,
) -> AppResult<AssetFolder> {
    let folder = AssetFolder {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.trim().to_string(),
        created_at: now_ms(),
        parent_id,
    };

    let mut all = folders(vault)?;
    all.push(folder.clone());
    write_json(&vault.folders_path(), &all)?;

    Ok(folder)
}

pub fn rename_folder(vault: &Vault, id: &str, name: &str) -> AppResult<()> {
    let mut all = folders(vault)?;

    let Some(folder) = all.iter_mut().find(|folder| folder.id == id) else {
        return Ok(());
    };

    folder.name = name.trim().to_string();

    write_json(&vault.folders_path(), &all)
}

/// A pasta e todas as descendentes dela, por id.
fn descendentes(all: &[AssetFolder], id: &str) -> Vec<String> {
    let mut ids = vec![id.to_string()];
    let mut cresceu = true;

    // Fecha o conjunto: a lista e plana com `parent_id`, entao nao ha arvore
    // para percorrer, so filhos a somar ate nao sobrar nenhum.
    while cresceu {
        cresceu = false;
        for folder in all {
            let dentro = folder
                .parent_id
                .as_deref()
                .is_some_and(|parent| ids.iter().any(|conhecido| conhecido == parent));
            if dentro && !ids.contains(&folder.id) {
                ids.push(folder.id.clone());
                cresceu = true;
            }
        }
    }

    ids
}

/// Poe a pasta dentro de outra, ou na raiz.
///
/// Recusa ciclo em silencio: uma pasta nao entra em si mesma nem numa
/// descendente sua. Devolver erro aqui faria a tela explicar um estado que
/// ela mesma nao deveria oferecer.
pub fn move_folder(vault: &Vault, id: &str, parent_id: Option<String>) -> AppResult<()> {
    let mut all = folders(vault)?;

    if let Some(destino) = parent_id.as_deref() {
        if descendentes(&all, id).iter().any(|d| d == destino) {
            return Ok(());
        }
    }

    let Some(folder) = all.iter_mut().find(|folder| folder.id == id) else {
        return Ok(());
    };

    folder.parent_id = parent_id;

    write_json(&vault.folders_path(), &all)
}

/// Apaga a pasta, as de dentro dela, e devolve o conteudo de todas a raiz.
///
/// Nunca apaga arquivo: perder um mapa por um clique em "apagar pasta" seria
/// dano desproporcional ao gesto, e o arquivo e o que custou trabalho.
pub fn delete_folder(vault: &Vault, id: &str) -> AppResult<()> {
    let mut all = folders(vault)?;
    let apagadas = descendentes(&all, id);
    all.retain(|folder| !apagadas.contains(&folder.id));
    write_json(&vault.folders_path(), &all)?;

    let mut assets = index(vault)?;
    let mut touched = false;

    for asset in assets.iter_mut() {
        if asset.folder_id.as_ref().is_some_and(|f| apagadas.contains(f)) {
            asset.folder_id = None;
            touched = true;
        }
    }

    if touched {
        write_index(vault, &assets)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    fn campanha() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");

        (dir, vault)
    }

    /// Um PNG minimo de verdade, para o leitor de cabecalho ter o que ler.
    ///
    /// Bytes a mao em vez de um crate de imagem: o que se testa e que as
    /// medidas chegam ao indice, e para isso basta um cabecalho valido.
    fn png(largura: u32, altura: u32) -> Vec<u8> {
        let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        bytes.extend_from_slice(&13u32.to_be_bytes());
        bytes.extend_from_slice(b"IHDR");
        bytes.extend_from_slice(&largura.to_be_bytes());
        bytes.extend_from_slice(&altura.to_be_bytes());
        bytes.extend_from_slice(&[8, 6, 0, 0, 0]);
        bytes.extend_from_slice(&[0, 0, 0, 0]);

        bytes
    }

    /// Escreve um arquivo FORA da campanha, como o do usuario.
    fn de_fora(dir: &Path, nome: &str, conteudo: &[u8]) -> PathBuf {
        let origem = dir.join("de-fora");
        std::fs::create_dir_all(&origem).expect("origem");

        let caminho = origem.join(nome);
        std::fs::write(&caminho, conteudo).expect("arquivo");

        caminho
    }

    /// Um PNG inteiro, com os quadros e o fim: o de `png` e so o cabecalho, e
    /// para dizer se ele se mexe o leitor precisa chegar ao primeiro `IDAT`.
    fn png_inteiro() -> Vec<u8> {
        use image::ImageEncoder;

        let mut bytes = Vec::new();
        image::codecs::png::PngEncoder::new(&mut bytes)
            .write_image(&[255; 64], 4, 4, image::ExtendedColorType::Rgba8)
            .expect("png");

        bytes
    }

    #[test]
    fn gif_que_se_mexe_entra_marcado_e_o_png_parado_tambem() {
        let (dir, vault) = campanha();
        let fogo = de_fora(dir.path(), "fogo.gif", &crate::vault::animacao::testes::gif(3));
        let tocha = de_fora(dir.path(), "tocha.png", &crate::vault::animacao::testes::apng());
        let mapa = de_fora(dir.path(), "mapa.png", &png_inteiro());

        let (aceitos, recusados) = import(&vault, &[fogo, tocha, mapa], None).expect("import");

        assert!(recusados.is_empty(), "{recusados:?}");
        assert_eq!(
            aceitos.iter().map(|asset| asset.animada).collect::<Vec<_>>(),
            [Some(true), Some(true), Some(false)]
        );
    }

    #[test]
    fn jpeg_e_som_nem_chegam_a_pergunta() {
        let (dir, vault) = campanha();
        let foto = de_fora(dir.path(), "foto.jpg", b"jpeg");
        let som = de_fora(dir.path(), "chuva.ogg", b"ogg");

        let (aceitos, _) = import(&vault, &[foto, som], None).expect("import");

        assert!(aceitos.iter().all(|asset| asset.animada.is_none()));
    }

    #[test]
    fn a_primeira_listagem_responde_quem_se_mexe_nos_arquivos_antigos() {
        // O acervo de antes desta versao: o GIF entrou sem a resposta.
        let (dir, vault) = campanha();
        let fogo = de_fora(dir.path(), "fogo.gif", &crate::vault::animacao::testes::gif(3));
        import(&vault, &[fogo], None).expect("import");

        let mut antigo = index(&vault).expect("indice");
        antigo[0].animada = None;
        write_index(&vault, &antigo).expect("gravar");

        assert_eq!(list(&vault, None).expect("lista")[0].animada, Some(true));
        // E gravou: a proxima listagem nao abre o arquivo de novo.
        assert_eq!(index(&vault).expect("indice")[0].animada, Some(true));
    }

    /// Bytes colados entram no acervo como um arquivo entra, com nome e medidas.
    ///
    /// E a afirmacao do caminho de colagem: o temporario nao pode sobrar, e o
    /// nome do asset tem de ser o nome bom e nao o do arquivo sorteado. Se este
    /// teste quebrar, colar passou a encher a biblioteca de linhas chamadas
    /// `.colando-3f9a`.
    #[test]
    fn colado_entra_com_nome_e_medidas() {
        let (_tmp, vault) = campanha();

        let (aceitos, recusados) =
            import_bytes(&vault, "Colado 2026-09-23 14h32.png", &png(640, 480), None)
                .expect("import_bytes");

        assert!(recusados.is_empty());
        assert_eq!(aceitos.len(), 1);
        assert_eq!(aceitos[0].name, "Colado 2026-09-23 14h32.png");
        assert_eq!(aceitos[0].kind, "image");
        assert_eq!(aceitos[0].natural_width, Some(640));
        assert_eq!(aceitos[0].natural_height, Some(480));

        // O binario ficou onde o acervo o procura.
        assert!(asset_path(&vault, &aceitos[0]).exists());

        // E nenhuma pasta de trabalho sobrou dentro de `assets/`.
        let sobras: Vec<_> = std::fs::read_dir(vault.assets_dir())
            .expect("assets dir")
            .filter_map(|entrada| entrada.ok())
            .filter(|entrada| {
                entrada.file_name().to_string_lossy().starts_with(".colando-")
            })
            .collect();
        assert!(sobras.is_empty(), "sobrou pasta de colagem em assets/");
    }

    /// Sem extensao no nome, o colado entra como ARQUIVO e nao como imagem.
    ///
    /// E o motivo de a ponta de TypeScript sempre carimbar uma extensao: o Rust
    /// classifica pelo NOME, nunca pelos bytes. Sem ela a imagem entra no
    /// acervo, some da biblioteca de imagens e nao vai para o mapa -- um
    /// desaparecimento silencioso, pior do que uma recusa com motivo.
    #[test]
    fn colado_sem_extensao_vira_arquivo_e_nao_imagem() {
        let (_tmp, vault) = campanha();

        let (aceitos, _) =
            import_bytes(&vault, "sem-extensao", &png(10, 10), None).expect("import_bytes");

        assert_eq!(aceitos.len(), 1);
        assert_eq!(aceitos[0].kind, "file");
        assert!(aceitos[0].natural_width.is_none());
    }

    /// O nome chega inteiro: com espaco, acento e maiuscula.
    #[test]
    fn colado_guarda_o_nome_como_veio() {
        let (_tmp, vault) = campanha();

        let (aceitos, _) =
            import_bytes(&vault, "../../Mapa da Taverna.png", &png(8, 8), None)
                .expect("import_bytes");

        // A travessia foi cortada, o nome legivel ficou.
        assert_eq!(aceitos[0].name, "Mapa da Taverna.png");
        assert_eq!(aceitos[0].kind, "image");
    }

    #[test]
    fn importar_copia_e_nao_move() {
        let (dir, vault) = campanha();
        let origem = de_fora(dir.path(), "mapa.png", &png(1920, 1080));

        let (aceitos, recusados) = import(&vault, &[origem.clone()], None).expect("import");

        assert!(recusados.is_empty(), "{recusados:?}");
        assert_eq!(aceitos.len(), 1);

        // O arquivo e do usuario e provavelmente usado por outra coisa: mover
        // seria arrancar.
        assert!(origem.is_file(), "o original foi movido");
        assert!(asset_path(&vault, &aceitos[0]).is_file());
    }

    #[test]
    fn medidas_saem_do_cabecalho() {
        let (dir, vault) = campanha();
        let origem = de_fora(dir.path(), "mapa.png", &png(1920, 1080));

        let (aceitos, _) = import(&vault, &[origem], None).expect("import");

        assert_eq!(aceitos[0].natural_width, Some(1920));
        assert_eq!(aceitos[0].natural_height, Some(1080));
        assert_eq!(aceitos[0].mime_type, "image/png");
        assert_eq!(aceitos[0].kind, "image");
    }

    #[test]
    fn audio_entra_sem_medida() {
        let (dir, vault) = campanha();
        let origem = de_fora(dir.path(), "trilha.ogg", b"nao e ogg de verdade");

        let (aceitos, recusados) = import(&vault, &[origem], None).expect("import");

        assert!(recusados.is_empty(), "{recusados:?}");
        assert_eq!(aceitos[0].kind, "audio");
        assert_eq!(aceitos[0].natural_width, None);
    }

    #[test]
    fn imagem_com_cabecalho_ilegivel_entra_sem_medida() {
        let (dir, vault) = campanha();
        let origem = de_fora(dir.path(), "quebrada.png", b"isto nao e png");

        let (aceitos, recusados) = import(&vault, &[origem], None).expect("import");

        // Ausencia de medida nao impede a entrada: a cena perde so a proporcao
        // sugerida ao arrastar, e o arquivo continua valendo.
        assert!(recusados.is_empty(), "{recusados:?}");
        assert_eq!(aceitos.len(), 1);
        assert_eq!(aceitos[0].natural_width, None);
    }

    #[test]
    fn caminho_vem_do_id_e_nao_do_nome_do_arquivo() {
        let (dir, vault) = campanha();
        // Nome hostil de um arquivo escolhido no dialogo.
        let origem = de_fora(dir.path(), "..-mapa.png", &png(10, 10));

        let (aceitos, _) = import(&vault, &[origem], None).expect("import");
        let caminho = asset_path(&vault, &aceitos[0]);

        assert_eq!(caminho.parent(), Some(vault.assets_dir().as_path()));
        assert!(caminho
            .file_name()
            .expect("nome")
            .to_string_lossy()
            .starts_with(&aceitos[0].id));
    }

    #[test]
    fn lote_com_um_recusado_traz_o_resto_e_o_motivo() {
        let (dir, vault) = campanha();

        let bom = de_fora(dir.path(), "mapa.png", &png(100, 100));
        // Caminho que nao existe: a unica recusa que sobrou, agora que qualquer
        // tipo de arquivo entra.
        let ruim = dir.path().join("sumiu.pdf");
        let som = de_fora(dir.path(), "trilha.mp3", b"som");

        let (aceitos, recusados) = import(&vault, &[bom, ruim, som], None).expect("import");

        // Quem escolheu tres e teve um recusado quer os dois e quer saber qual.
        assert_eq!(aceitos.len(), 2);
        assert_eq!(recusados.len(), 1);
        assert!(recusados[0].contains("sumiu.pdf"), "{recusados:?}");
        assert_eq!(list(&vault, None).expect("list").len(), 2);
    }

    #[test]
    fn qualquer_arquivo_entra_como_file() {
        let (dir, vault) = campanha();

        let pdf = de_fora(dir.path(), "livro.pdf", b"%PDF");
        let (aceitos, recusados) = import(&vault, &[pdf], None).expect("import");

        assert!(recusados.is_empty(), "{recusados:?}");
        assert_eq!(aceitos[0].kind, "file");
        assert_eq!(aceitos[0].mime_type, "application/pdf");
        assert!(asset_path(&vault, &aceitos[0]).to_string_lossy().ends_with(".pdf"));
        assert_eq!(list(&vault, Some("file")).expect("list").len(), 1);
        assert_eq!(list(&vault, Some("image")).expect("list").len(), 0);
    }

    #[test]
    fn arquivo_que_nao_existe_nao_derruba_o_lote() {
        let (dir, vault) = campanha();
        let bom = de_fora(dir.path(), "mapa.png", &png(10, 10));

        let (aceitos, recusados) =
            import(&vault, &[bom, dir.path().join("sumiu.png")], None).expect("import");

        assert_eq!(aceitos.len(), 1);
        assert_eq!(recusados.len(), 1);
    }

    #[test]
    fn lista_filtra_por_tipo_e_ordena_do_mais_novo() {
        let (dir, vault) = campanha();

        let a = de_fora(dir.path(), "a.png", &png(10, 10));
        import(&vault, &[a], None).expect("a");
        std::thread::sleep(std::time::Duration::from_millis(5));

        let b = de_fora(dir.path(), "b.png", &png(10, 10));
        let t = de_fora(dir.path(), "t.ogg", b"som");
        import(&vault, &[b, t], None).expect("b");

        let imagens = list(&vault, Some("image")).expect("list");
        assert_eq!(imagens.len(), 2);
        assert_eq!(imagens[0].name, "b.png", "o mais novo vem primeiro");
        assert_eq!(list(&vault, Some("audio")).expect("list").len(), 1);
    }

    #[test]
    fn picos_gravam_so_em_som_e_com_teto() {
        let (dir, vault) = campanha();

        let som = de_fora(dir.path(), "trilha.ogg", b"som");
        let imagem = de_fora(dir.path(), "mapa.png", &png(10, 10));
        let (aceitos, _) = import(&vault, &[som, imagem], None).expect("import");

        let id_som = aceitos.iter().find(|a| a.kind == "audio").expect("som").id.clone();
        let id_img = aceitos.iter().find(|a| a.kind == "image").expect("img").id.clone();

        set_peaks(&vault, &id_som, vec![10, 90, 40]).expect("peaks");
        assert_eq!(
            find(&vault, &id_som).expect("find").expect("meta").peaks,
            Some(vec![10, 90, 40])
        );

        // Imagem nao tem forma de onda, e gravar ali seria lixo no indice.
        set_peaks(&vault, &id_img, vec![1, 2, 3]).expect("peaks");
        assert_eq!(find(&vault, &id_img).expect("find").expect("meta").peaks, None);

        // O valor vem da tela: um array gigante engordaria a leitura de todo o
        // acervo para sempre.
        set_peaks(&vault, &id_som, vec![7; MAX_PEAKS * 3]).expect("peaks");
        assert_eq!(
            find(&vault, &id_som).expect("find").expect("meta").peaks.expect("peaks").len(),
            MAX_PEAKS
        );

        // Id que nao existe nao e erro: e otimizacao de desenho.
        assert!(set_peaks(&vault, "fantasma", vec![1]).is_ok());
    }

    #[test]
    fn apagar_tira_do_indice_e_do_disco() {
        let (dir, vault) = campanha();
        let origem = de_fora(dir.path(), "mapa.png", &png(10, 10));

        let (aceitos, _) = import(&vault, &[origem], None).expect("import");
        delete(&vault, &aceitos[0].id).expect("delete");

        assert!(list(&vault, None).expect("list").is_empty());
        assert!(!asset_path(&vault, &aceitos[0]).exists());
    }

    #[test]
    fn apagar_pasta_devolve_o_conteudo_a_raiz() {
        let (dir, vault) = campanha();

        let pasta = create_folder(&vault, "Mapas", None).expect("folder");
        let origem = de_fora(dir.path(), "mapa.png", &png(10, 10));
        let (aceitos, _) = import(&vault, &[origem], None).expect("import");
        let id = aceitos[0].id.clone();

        set_folder(&vault, &id, Some(pasta.id.clone())).expect("move");
        assert_eq!(
            find(&vault, &id).expect("find").expect("meta").folder_id,
            Some(pasta.id.clone())
        );

        delete_folder(&vault, &pasta.id).expect("delete folder");

        // Nunca apaga arquivo: perder um mapa por um clique em "apagar pasta"
        // seria dano desproporcional ao gesto.
        let ainda = find(&vault, &id).expect("find").expect("meta");
        assert_eq!(ainda.folder_id, None);
        assert!(asset_path(&vault, &ainda).exists());
        assert!(folders(&vault).expect("folders").is_empty());
    }

    #[test]
    fn apagar_pasta_leva_as_de_dentro_e_devolve_tudo_a_raiz() {
        let (dir, vault) = campanha();

        let mae = create_folder(&vault, "Mapas", None).expect("folder");
        let filha = create_folder(&vault, "Cidades", Some(mae.id.clone())).expect("folder");
        let origem = de_fora(dir.path(), "cidade.png", &png(10, 10));
        let (aceitos, _) = import(&vault, &[origem], None).expect("import");
        let id = aceitos[0].id.clone();
        set_folder(&vault, &id, Some(filha.id.clone())).expect("move");

        delete_folder(&vault, &mae.id).expect("delete folder");

        // A filha vai junto: uma pasta sem mae apontaria para um id que nao
        // existe mais. O arquivo de dentro dela sobe para a raiz, e continua.
        assert!(folders(&vault).expect("folders").is_empty());
        let ainda = find(&vault, &id).expect("find").expect("meta");
        assert_eq!(ainda.folder_id, None);
        assert!(asset_path(&vault, &ainda).exists());
    }

    #[test]
    fn mover_pasta_para_dentro_de_descendente_e_recusado() {
        let (_dir, vault) = campanha();

        let mae = create_folder(&vault, "Mapas", None).expect("folder");
        let filha = create_folder(&vault, "Cidades", Some(mae.id.clone())).expect("folder");

        // Mae dentro da filha seria um ciclo: nenhuma das duas alcancaria a raiz.
        move_folder(&vault, &mae.id, Some(filha.id.clone())).expect("move");
        let depois = folders(&vault).expect("folders");
        let mae_depois = depois.iter().find(|f| f.id == mae.id).expect("mae");
        assert_eq!(mae_depois.parent_id, None);

        // Para a raiz, e para outra pasta que nao e descendente, pode.
        let outra = create_folder(&vault, "Outra", None).expect("folder");
        move_folder(&vault, &filha.id, Some(outra.id.clone())).expect("move");
        move_folder(&vault, &mae.id, None).expect("move");
        let depois = folders(&vault).expect("folders");
        let filha_depois = depois.iter().find(|f| f.id == filha.id).expect("filha");
        assert_eq!(filha_depois.parent_id, Some(outra.id));
    }

    #[test]
    fn pastas_saem_em_ordem_alfabetica() {
        let (_dir, vault) = campanha();

        create_folder(&vault, "Retratos", None).expect("f");
        create_folder(&vault, "mapas", None).expect("f");
        create_folder(&vault, "Fichas", None).expect("f");

        let nomes: Vec<String> =
            folders(&vault).expect("folders").into_iter().map(|f| f.name).collect();
        assert_eq!(nomes, vec!["Fichas", "mapas", "Retratos"]);
    }

    fn do_youtube(video: &str, inicio: Option<f64>, fim: Option<f64>) -> NovoDoYoutube {
        NovoDoYoutube {
            nome: format!("  Chuva {video}  "),
            som: SomDoYoutube { video: video.to_string(), inicio, fim },
        }
    }

    #[test]
    fn youtube_entra_como_audio_sem_arquivo() {
        let (_dir, vault) = campanha();

        let novos = add_youtube(
            &vault,
            vec![do_youtube("dQw4w9WgXcQ", Some(12.5), None), do_youtube("a_b-C1d2E3f", None, None)],
            "ambiente",
        )
        .expect("add");

        assert_eq!(novos.len(), 2);

        let lidos = list(&vault, Some("audio")).expect("list");
        let chuva = lidos.iter().find(|a| a.id == novos[0].id).expect("no indice");

        assert_eq!(chuva.name, "Chuva dQw4w9WgXcQ");
        assert_eq!(chuva.mime_type, MIME_DO_YOUTUBE);
        assert_eq!(chuva.tipo_de_som.as_deref(), Some("ambiente"));
        assert_eq!(
            chuva.youtube,
            Some(SomDoYoutube { video: "dQw4w9WgXcQ".into(), inicio: Some(12.5), fim: None })
        );
        assert!(!asset_path(&vault, chuva).exists());

        // Apagar um som sem arquivo nao pode falhar por falta do arquivo.
        delete(&vault, &chuva.id).expect("delete");
        assert_eq!(list(&vault, Some("audio")).expect("list").len(), 1);
    }

    #[test]
    fn youtube_recusa_id_que_nao_e_de_video() {
        let (_dir, vault) = campanha();

        for ruim in ["", "curto", "https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXc!", "dQw4w9WgXcQQ"] {
            let saida = add_youtube(&vault, vec![do_youtube(ruim, None, None)], "trilha");
            assert!(matches!(saida, Err(AppError::SomInvalido(_))), "{ruim:?} passou");
        }

        // Um ruim na leva recusa a leva inteira: nada entra pela metade.
        let saida = add_youtube(
            &vault,
            vec![do_youtube("dQw4w9WgXcQ", None, None), do_youtube("nao serve", None, None)],
            "trilha",
        );
        assert!(saida.is_err());
        assert!(list(&vault, Some("audio")).expect("list").is_empty());
    }

    #[test]
    fn youtube_nao_e_efeito() {
        let (_dir, vault) = campanha();

        let saida = add_youtube(&vault, vec![do_youtube("dQw4w9WgXcQ", None, None)], "disparo");
        assert!(matches!(saida, Err(AppError::SomInvalido(_))));

        let novos =
            add_youtube(&vault, vec![do_youtube("dQw4w9WgXcQ", None, None)], "trilha").expect("add");

        // Trocar para efeito depois tambem nao pega; para ambiente pega.
        set_tipo_de_som(&vault, &novos[0].id, Some("disparo".into())).expect("tipo");
        assert_eq!(find(&vault, &novos[0].id).expect("find").expect("som").tipo_de_som.as_deref(), Some("trilha"));

        set_tipo_de_som(&vault, &novos[0].id, Some("ambiente".into())).expect("tipo");
        assert_eq!(find(&vault, &novos[0].id).expect("find").expect("som").tipo_de_som.as_deref(), Some("ambiente"));
    }

    #[test]
    fn trecho_do_youtube() {
        let (_dir, vault) = campanha();

        let novos =
            add_youtube(&vault, vec![do_youtube("dQw4w9WgXcQ", None, None)], "trilha").expect("add");
        let id = &novos[0].id;
        let trecho = |vault: &Vault| find(vault, id).expect("find").expect("som").youtube.expect("youtube");

        set_trecho_youtube(&vault, id, Some(30.0), Some(90.0)).expect("trecho");
        assert_eq!((trecho(&vault).inicio, trecho(&vault).fim), (Some(30.0), Some(90.0)));

        // Zero e negativo sao "do comeco", e nao erro.
        set_trecho_youtube(&vault, id, Some(0.0), Some(-3.0)).expect("trecho");
        assert_eq!((trecho(&vault).inicio, trecho(&vault).fim), (None, None));

        // Acabar antes de comecar e erro, e o trecho de antes fica.
        set_trecho_youtube(&vault, id, Some(60.0), Some(90.0)).expect("trecho");
        assert!(set_trecho_youtube(&vault, id, Some(90.0), Some(60.0)).is_err());
        assert_eq!((trecho(&vault).inicio, trecho(&vault).fim), (Some(60.0), Some(90.0)));

        // Onda nao se grava em som sem arquivo.
        set_peaks(&vault, id, vec![1, 2, 3]).expect("peaks");
        assert!(find(&vault, id).expect("find").expect("som").peaks.is_none());
    }

    #[test]
    fn novo_do_youtube_le_o_que_a_tela_manda() {
        let novo: NovoDoYoutube = serde_json::from_str(
            r#"{"nome":"Taverna","video":"dQw4w9WgXcQ","inicio":30,"fim":null}"#,
        )
        .expect("json");

        assert_eq!(novo.nome, "Taverna");
        assert_eq!(novo.som.inicio, Some(30.0));
        assert_eq!(novo.som.fim, None);
    }
}
