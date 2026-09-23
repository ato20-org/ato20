/**
 * Corre a matriz de medidas de `/perf` e imprime a tabela.
 *
 * Serve o `out/`, abre o Chrome, dirige a página pelo protocolo de depuração e
 * lê `window.__resultado`. Sem dependência nova: o servidor é `node:http`, o
 * bitmap é PNG escrito com o `zlib` que já vem no Node, e a conversa com o
 * browser é o `WebSocket` nativo. Uma ferramenta de medida que exige instalar
 * duzentos pacotes é uma ferramenta que ninguém roda na segunda vez.
 *
 * ## Por que um servidor próprio, e não `next start`
 *
 * O projeto é `output: "export"`: não há servidor Next para iniciar. E as
 * imagens da cena de medida precisam existir — `useAssetUrl` pede
 * `/asset/{id}`, e sem resposta os itens desenhariam divs vazias. Bitmap
 * chapado também não serviria: compor N texturas distintas é parte do custo.
 * Então este servidor responde qualquer `/asset/*` com um PNG de ruído,
 * derivado do id, e a medida passa pelo caminho real de imagem.
 *
 * ## O que ela NÃO mede
 *
 * O Chrome, e não a webview do WebKitGTK em que o aplicativo roda — para essa
 * pergunta existe `public/perf.html`, e a resposta está no commit que o criou.
 * Aqui o motor é o mesmo entre corridas de propósito: o que se quer isolar é o
 * custo do React e do store, e para isso o motor tem de sair da variação.
 * Headless também não tem compositor de tela de verdade, então o número
 * absoluto vale menos que a comparação entre duas corridas.
 *
 * Uso:
 *   node scripts/perf/medir.mjs                     # matriz padrão
 *   node scripts/perf/medir.mjs --n 40,100,300
 *   node scripts/perf/medir.mjs --cenario arrasto --segundos 6
 *   node scripts/perf/medir.mjs --url http://127.0.0.1:3000  # já servido
 *   node scripts/perf/medir.mjs --pular-build       # reaproveita o out/
 *   node scripts/perf/medir.mjs --cenario leitor --pdf ~/manual.pdf --pagina 21
 *
 * ## O cenario `leitor`
 *
 * Mede outra coisa: nao quadro por segundo, e sim quanto tempo a pagina sob os
 * olhos leva para ficar pronta a cada degrau de zoom, quanto tempo TODAS as
 * mantidas levam, e quantos megapixels foram pintados. O PDF vem de `--pdf`;
 * sem ele, o maior da estante desta maquina. Nenhum manual vai para o repo --
 * e material de terceiro. Capturas de tela no MEIO e no FIM de cada degrau vao
 * para `--capturas` (padrao: uma pasta temporaria, impressa no fim).
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { mkdtemp, rm, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { homedir } from "node:os";
import { tmpdir } from "node:os";

const RAIZ = resolve(import.meta.dirname, "..", "..");
const SAIDA = join(RAIZ, "out");

const argv = process.argv.slice(2);

function opcao(nome, padrao) {
  const i = argv.indexOf(`--${nome}`);

  return i >= 0 && argv[i + 1] ? argv[i + 1] : padrao;
}

const temFlag = (nome) => argv.includes(`--${nome}`);

const CENARIOS = opcao("cenario", "arrasto,amostras,amostras-id,dados").split(",");
const NS = opcao("n", "40,100,300").split(",").map(Number);
const SEGUNDOS = Number(opcao("segundos", 8));
/**
 * Quantas vezes cada celula corre, e a tabela mostra a MEDIANA.
 *
 * Nao e preciosismo estatistico. Medido: a mesma corrida de sessenta dados, sem
 * mudar uma linha de codigo, deu 8,9%, 12,2% e 16,9% de quadro perdido em tres
 * tentativas seguidas numa tela com desktop em cima. Com uma corrida por celula
 * qualquer otimizacao "prova" o que quiser, e a primeira vez que isso acontece
 * a ferramenta deixa de servir para decidir nada.
 */
const REPETICOES = Number(opcao("repetir", 1));
/** Itens que mudam por amostra nos cenarios de espectador. Ver a pagina. */
const MOVIDOS = opcao("movidos", "1");
/** `dados`: ampliacao do palco. E ela que estoura o backing de um canvas grande. */
const ZOOM = opcao("zoom", "1");
/**
 * `mestre-camera`: quantas cameras salvas a cena tem, como eixo da matriz.
 *
 * Lista e nao numero porque a pergunta e a CURVA: uma camera custa X, cinco
 * custam quanto? Uma celula por (n, cameras), e a tabela ganha a coluna.
 */
const CAMERAS = opcao("cameras", "1").split(",").map(Number);
/** `camera-gesto`: qual gesto sobre a moldura o robo repete. Lista. */
const GESTOS = opcao("gesto", "mover").split(",");
/** `bancada`: quantas cenas o board tem, e portanto quantas previas a lista tem. */
const MAPAS = opcao("mapas", "7");
/** `bancada`: que colunas laterais ficam a vista. Lista: e um eixo da matriz. */
const PAINEIS = opcao("painel", "ambos").split(",");
/**
 * A SOMBRA da cena de medida: `--sol`, `--luzes N`, `--paredes N`.
 *
 * Desligada por padrao, e isso importa: com os tres em zero a cena montada e
 * byte a byte a de antes de a sombra existir, e a corrida continua comparavel
 * com tudo o que ja foi medido. Ligada, a mesma cena ganha uma copia preta por
 * token (`--sol`), o recorte de cada tocha (`--luzes`) e os quadrilateros que
 * as paredes jogam (`--paredes`).
 *
 * A pergunta que estes tres respondem e uma so: quanto custa a sombra por
 * quadro, no cenario em que o mestre esta arrastando um token.
 */
const SOL = temFlag("sol") ? "1" : "0";
const LUZES = opcao("luzes", "0");
const PAREDES = opcao("paredes", "0");
/**
 * A pasta com as imagens DE VERDADE que `/asset/*` deve responder.
 *
 * O bitmap de ruido sintetico mede a composicao e nao mente sobre ela -- N
 * texturas distintas compoem como N texturas distintas. O que ele nao tem e o
 * que um arquivo de verdade traz junto: decodificar JPEG e WebP custa, e custa
 * de novo a cada variante pedida; um PNG de ruido nao comprime e chega inteiro
 * na memoria de uma vez. Com `--imagens` a medida passa pelo caminho que a
 * sessao do mestre passa.
 *
 * Por caminho e nao no repositorio: as imagens sao material de quem esta
 * medindo, como o PDF do cenario `leitor`.
 *
 * Convencao dos nomes, para a pasta poder ser de qualquer um:
 *   `bg.*`    o mapa de fundo da cena
 *   `bg2.*`   o fundo das OUTRAS cenas da lista, para cada previa decodificar
 *             um arquivo proprio -- que e o caso da campanha real
 *   `char.*`  o token e o retrato
 */
const IMAGENS = opcao("imagens", null);
/** `jogador`: `--sem-variante` mede o celular baixando o arquivo inteiro. */
const VARIANTE = temFlag("sem-variante") ? "0" : "1";
/** `biblioteca`: `--sem-lazy` mede a lista sem os atributos de `MINIATURA`. */
const LAZY = temFlag("sem-lazy") ? "0" : "1";
/** `biblioteca`: percorre a lista durante a medida. */
const ROLAR = temFlag("rolar") ? "1" : "0";
const CHROME = opcao("chrome", process.env.CHROME ?? "google-chrome-stable");
/** `leitor`: o PDF servido em `/livro/perf`, a pagina de partida e os degraus. */
const PDF = opcao("pdf", null);
const PAGINA = opcao("pagina", "20");
const DEGRAUS = opcao("degraus", "0.5,1,2,3,1");
const CAPTURAS = opcao("capturas", null);
/**
 * `leitor`: escala de tela do Chrome, e troca de degrau SEM esperar o anterior.
 *
 * As duas existem para reproduzir a webview: com o zoom da interface a 125%
 * ela reporta `devicePixelRatio` acima de 1, e o mestre troca o zoom do livro
 * no meio de um render -- o roteiro padrao espera tudo pronto antes do
 * proximo degrau, entao nunca cancela nada no meio.
 */
const DPR = Number(opcao("dpr", "1"));
const RAJADA = temFlag("rajada");
/**
 * Janela de verdade, e nao `--headless`.
 *
 * Sem tela o Chrome nao tem vsync: ele entrega quadro quando quer, e a medida
 * sai travada em ~30 fps por um motivo que nao existe na mesa. `fps`, `p95` e
 * `perdidos` so significam algo com `--janela`; sem ela, o que vale sao as
 * colunas de script, estilo e layout, que medem TRABALHO e nao cadencia.
 */
const JANELA = temFlag("janela");
/**
 * Liga o amostrador de perfil e imprime onde o tempo de JavaScript foi.
 *
 * Serve a uma pergunta que a coluna `script` nao responde: dela sai QUANTO, e
 * nao ONDE. Sem isso, "otimizar o script" e escolher entre a matematica, o
 * desenho e a reconciliacao do React por palpite.
 */
const PERFIL = temFlag("perfil");
/** Imprime o console da pagina de cada medida. */
const CONSOLE = temFlag("console");

// ---------------------------------------------------------------------------
// PNG de ruído, sem dependência.
//
// Um PNG é assinatura + IHDR + IDAT + IEND, e IDAT é só `deflate` das linhas
// com um byte de filtro na frente. Cabe em trinta linhas, e evita arrastar um
// gerador de imagem para dentro de um script de medida.
// ---------------------------------------------------------------------------
function crc32(buf) {
  let c = ~0;

  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }

  return ~c >>> 0;
}

function chunk(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);

  const corpo = Buffer.concat([Buffer.from(tipo, "latin1"), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));

  return Buffer.concat([tamanho, corpo, crc]);
}

function png(largura, altura, semente) {
  const linhas = Buffer.alloc(altura * (1 + largura * 3));
  let estado = semente || 1;

  const proximo = () => {
    // Gerador barato e determinístico: a mesma semente dá o mesmo bitmap, e a
    // comparação entre corridas não pode depender de sorteio.
    estado = (estado * 1664525 + 1013904223) >>> 0;

    return estado >>> 24;
  };

  for (let y = 0; y < altura; y++) {
    const inicio = y * (1 + largura * 3);
    linhas[inicio] = 0;

    for (let x = 0; x < largura; x++) {
      const p = inicio + 1 + x * 3;
      const ruido = proximo() >> 3;
      linhas[p] = ((x * 255) / largura + ruido) & 0xff;
      linhas[p + 1] = ((y * 255) / altura + ruido) & 0xff;
      linhas[p + 2] = (semente * 37 + ruido) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(linhas, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  // Os formatos que as imagens de `--imagens` costumam ter. Sem o tipo certo a
  // webview recusa a imagem, e a medida desenharia divs vazias.
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  // O runtime do pdf.js: o worker e um modulo, e sem o tipo certo o browser
  // recusa carrega-lo; o wasm e o dos decodificadores de imagem.
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
};

/**
 * O PDF que o cenario `leitor` abre.
 *
 * `--pdf`, ou o maior arquivo da estante desta maquina -- que e o manual que
 * motivou a medida. Resolvido uma vez, na subida do servidor.
 */
async function pdfDoLeitor() {
  if (PDF) return resolve(PDF);

  const estante = join(homedir(), ".local", "share", "show.rpg.ato20", "estante");
  const nomes = await readdir(estante).catch(() => []);
  const pdfs = [];
  for (const nome of nomes) {
    if (!nome.endsWith(".pdf")) continue;
    const caminho = join(estante, nome);
    pdfs.push({ caminho, tamanho: (await stat(caminho)).size });
  }
  pdfs.sort((a, b) => b.tamanho - a.tamanho);

  return pdfs[0]?.caminho ?? null;
}

/**
 * As imagens de verdade da pasta `--imagens`, por papel, lidas uma vez.
 *
 * `null` quando a pasta nao foi passada ou nao tem nada com esses nomes: a
 * medida cai no bitmap sintetico de sempre, e a tabela continua valendo contra
 * as corridas antigas.
 */
async function lerImagens(pasta) {
  if (!pasta) return null;

  const raiz = resolve(pasta);
  const achar = async (base) => {
    for (const arquivo of await readdir(raiz).catch(() => [])) {
      if (arquivo.replace(extname(arquivo), "") !== base) continue;

      return {
        bytes: await readFile(join(raiz, arquivo)),
        tipo: TIPOS[extname(arquivo)] ?? "application/octet-stream",
        nome: arquivo,
      };
    }

    return null;
  };

  const papeis = {
    fundo: await achar("bg"),
    fundo2: await achar("bg2"),
    token: await achar("char"),
  };

  if (!papeis.fundo && !papeis.token) {
    console.error(`--imagens ${raiz}: nenhum bg.* nem char.* ali. Usando o bitmap sintetico.`);

    return null;
  }

  const visto = Object.entries(papeis)
    .filter(([, v]) => v)
    .map(([papel, v]) => `${papel}=${v.nome}`)
    .join(" ");
  console.log(`imagens de verdade: ${visto}`);

  return papeis;
}

function servir(porta, pdf, imagens) {
  const cache = new Map();

  const servidor = createServer(async (req, res) => {
    const caminho = decodeURIComponent(new URL(req.url, "http://x").pathname);

    if (caminho === "/livro/perf") {
      // Como o daemon serve `/livro/{id}`: com `Range`, porque o pdf.js pede
      // faixas do arquivo e desenha a pagina 20 sem baixar as outras 35.
      if (!pdf) {
        res.writeHead(404).end("sem PDF: passe --pdf");
        return;
      }
      const { size } = await stat(pdf);
      const faixa = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
      const inicio = faixa && faixa[1] ? Number(faixa[1]) : 0;
      const fim = faixa && faixa[2] ? Math.min(Number(faixa[2]), size - 1) : size - 1;
      res.writeHead(faixa ? 206 : 200, {
        "content-type": "application/pdf",
        "accept-ranges": "bytes",
        "content-length": fim - inicio + 1,
        ...(faixa ? { "content-range": `bytes ${inicio}-${fim}/${size}` } : {}),
        "cache-control": "no-store",
      });
      createReadStream(pdf, { start: inicio, end: fim }).pipe(res);

      return;
    }

    if (caminho.startsWith("/asset/")) {
      // `/asset/{id}/{variante}` responde reduzido, como o daemon: e a rota
      // que o `vault/variantes.rs` serve, e sem imita-la aqui as medidas de
      // lista e de Jogador nao mediriam nada -- a tela pediria a reducao e
      // receberia o arquivo.
      const partes = caminho.slice("/asset/".length).split("/");
      const variante = partes.length > 1 ? partes[1] : null;
      // Mesmos lados do Rust. Ver `Variante::lado`.
      const ladoDaVariante = variante === "mini" ? 160 : variante === "tela" ? 1920 : null;
      const id = partes[0] + (variante ? `#${variante}` : "");

      // Com `--imagens`, o arquivo de verdade, no papel que o id pede. Sem
      // reduzir por variante: reduzir aqui exigiria um decodificador, e o que
      // se quer medir e justamente o custo de a tela receber e decodificar o
      // que o acervo guarda.
      if (imagens) {
        const papel = partes[0].startsWith("perf-fundo-")
          ? imagens.fundo2 ?? imagens.fundo
          : partes[0].startsWith("perf-fundo")
            ? imagens.fundo
            : imagens.token ?? imagens.fundo;

        if (papel) {
          res.writeHead(200, {
            "content-type": papel.tipo,
            "cache-control": "no-store",
          });
          res.end(papel.bytes);

          return;
        }
      }

      if (!cache.has(id)) {
        const fundo = id === "perf-fundo";
        // `mapa-*` responde grande de proposito: e o cenario `biblioteca`, e o
        // que ele mede e justamente o custo de o acervo guardar o original.
        const mapa = id.startsWith("mapa-");
        // `mapaG-*`: a ordem de grandeza de um mapa de verdade (3537x3750, o
        // do acervo que motivou esta medida). E o que faz a conta de memoria
        // ser 53 MB de bitmap por arquivo distinto.
        const mapaGrande = id.startsWith("mapaG-");
        // Semente derivada do id: cada token tem textura própria, e a mesma
        // corrida repetida tem as mesmas texturas.
        const semente = [...id].reduce((soma, c) => (soma * 31 + c.charCodeAt(0)) >>> 0, 7);
        const cheia = {
          largura: mapaGrande ? 3537 : mapa ? 2048 : fundo ? 1920 : 256,
          altura: mapaGrande ? 3750 : mapa ? 2048 : fundo ? 1080 : 256,
        };
        // Mesma regra do Rust: o lado maior no alvo, sem ampliar.
        const escala = ladoDaVariante
          ? Math.min(1, ladoDaVariante / Math.max(cheia.largura, cheia.altura))
          : 1;
        cache.set(
          id,
          png(
            Math.max(1, Math.round(cheia.largura * escala)),
            Math.max(1, Math.round(cheia.altura * escala)),
            semente || 1,
          ),
        );
      }

      res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
      res.end(cache.get(id));

      return;
    }

    // `output: export` grava `rota.html`; o browser pede `/rota`.
    const candidatos = caminho.endsWith("/")
      ? [join(caminho, "index.html")]
      : [caminho, `${caminho}.html`];

    for (const candidato of candidatos) {
      const arquivo = join(SAIDA, candidato);
      // `isFile`, e nao `existsSync`: o export grava `perf.html` E uma pasta
      // `perf/` com os dados de rota ao lado, e ler a pasta explode com EISDIR.
      if (!arquivo.startsWith(SAIDA) || !statSync(arquivo, { throwIfNoEntry: false })?.isFile()) {
        continue;
      }

      res.writeHead(200, {
        "content-type": TIPOS[extname(arquivo)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(await readFile(arquivo));

      return;
    }

    res.writeHead(404).end("nao encontrado");
  });

  return new Promise((pronto) => servidor.listen(porta, "127.0.0.1", () => pronto(servidor)));
}

// ---------------------------------------------------------------------------
// Chrome pelo protocolo de depuração.
// ---------------------------------------------------------------------------
async function abrirChrome() {
  const perfil = await mkdtemp(join(tmpdir(), "ato20-perf-"));

  const processo = spawn(
    CHROME,
    [
      ...(JANELA ? [] : ["--headless=new"]),
      "--remote-debugging-port=0",
      `--user-data-dir=${perfil}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--window-size=1920,1080",
      ...(DPR !== 1 ? [`--force-device-scale-factor=${DPR}`] : []),
      ...(JANELA ? ["--window-position=0,0", "--new-window"] : []),
      // Sem isto o Chrome economiza quadro em aba que ele julga invisível, e a
      // medida sairia sempre ótima por não ter acontecido.
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-background-timer-throttling",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  const endereco = await new Promise((pronto, falhou) => {
    let saida = "";
    const prazo = setTimeout(() => falhou(new Error("Chrome nao anunciou a porta")), 20_000);

    processo.stderr.on("data", (pedaco) => {
      saida += pedaco;
      const achou = saida.match(/ws:\/\/[^\s]+/);
      if (!achou) return;

      clearTimeout(prazo);
      pronto(achou[0]);
    });

    processo.on("exit", (codigo) => {
      clearTimeout(prazo);
      falhou(new Error(`Chrome saiu com ${codigo}. Falta ${CHROME}?`));
    });
  });

  return { processo, endereco, perfil };
}

/** Conversa com o browser: um id por pedido, resposta casada pelo id. */
function conectar(endereco) {
  const ws = new WebSocket(endereco);
  const pendentes = new Map();
  const ouvintes = new Set();
  let proximoId = 1;

  ws.addEventListener("message", (evento) => {
    const msg = JSON.parse(evento.data);

    // Sem `id` e evento, nao resposta: e por ai que os bytes de rede chegam.
    if (msg.id === undefined) {
      for (const ouvinte of ouvintes) ouvinte(msg);
      return;
    }

    const espera = pendentes.get(msg.id);
    if (!espera) return;

    pendentes.delete(msg.id);
    if (msg.error) espera.falhou(new Error(msg.error.message));
    else espera.pronto(msg.result);
  });

  const aberto = new Promise((pronto, falhou) => {
    ws.addEventListener("open", pronto);
    ws.addEventListener("error", () => falhou(new Error("nao conectou ao Chrome")));
  });

  return {
    aberto,
    fechar: () => ws.close(),
    ouvir(ouvinte) {
      ouvintes.add(ouvinte);

      return () => ouvintes.delete(ouvinte);
    },
    enviar(method, params = {}, sessionId) {
      const id = proximoId++;

      return new Promise((pronto, falhou) => {
        pendentes.set(id, { pronto, falhou });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });
    },
  };
}

async function medir(cdp, url) {
  const { targetId } = await cdp.enviar("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.enviar("Target.attachToTarget", { targetId, flatten: true });

  await cdp.enviar("Page.enable", {}, sessionId);
  await cdp.enviar("Runtime.enable", {}, sessionId);
  await cdp.enviar("Performance.enable", {}, sessionId);
  await cdp.enviar("Network.enable", {}, sessionId);

  if (PERFIL) {
    await cdp.enviar("Profiler.enable", {}, sessionId);
    // 100 microssegundos: fino o bastante para separar funcoes que rodam
    // dezenas de vezes por quadro.
    await cdp.enviar("Profiler.setSamplingInterval", { interval: 100 }, sessionId);
  }

  /**
   * Bytes que a tela realmente buscou.
   *
   * A coluna que importa no cenario `biblioteca`: `loading="lazy"` nao muda
   * quadro nenhum se a lista couber na tela -- ele muda o que NAO e baixado
   * nem decodificado. Contado por `encodedDataLength`, que e o que passou no
   * fio, e nao o tamanho declarado.
   */
  let bytes = 0;
  /**
   * Quantos ARQUIVOS do acervo a tela pediu.
   *
   * Mais honesto que os bytes para julgar `loading="lazy"`: o PNG de ruido que
   * este servidor gera nao comprime como um mapa de verdade comprime, entao a
   * coluna de bytes exagera o fio. O que nao exagera e a CONTAGEM: cada pedido
   * e um arquivo decodificado inteiro na memoria da webview, do tamanho que ele
   * tem no disco.
   */
  let imagens = 0;
  const pedidos = new Set();
  const pararDeOuvir = cdp.ouvir((msg) => {
    if (msg.sessionId !== sessionId) return;

    if (msg.method === "Network.requestWillBeSent" && msg.params.request.url.includes("/asset/")) {
      pedidos.add(msg.params.requestId);
    }

    if (msg.method === "Network.loadingFinished") {
      bytes += msg.params.encodedDataLength ?? 0;
      if (pedidos.has(msg.params.requestId)) imagens += 1;
    }
  });

  await cdp.enviar("Page.navigate", { url }, sessionId);

  /**
   * As capturas do `leitor`: a pagina anuncia a fase em `window.__leitorFase`
   * ("0.5:meio", "0.5:fim", ...), e cada fase nova vira um PNG. O "meio" e
   * lido logo depois do degrau mudar, e e o que responde se o bloco pixelado
   * do print e pintura parcial ou resultado final.
   */
  const capturas = [];
  let faseVista = null;
  // O console e as excecoes da pagina, para o estouro de prazo dizer POR QUE.
  const console_ = [];
  await cdp.enviar("Runtime.enable", {}, sessionId);
  const pararConsole = cdp.ouvir((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.consoleAPICalled") {
      console_.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      console_.push(`EXCECAO: ${d.exception?.description ?? d.text}`);
    }
  });
  const capturar = async () => {
    const { result } = await cdp.enviar(
      "Runtime.evaluate",
      { expression: "window.__leitorFase ?? null", returnByValue: true },
      sessionId,
    );
    const fase = result.value;
    if (!fase || fase === faseVista || !pastaDeCapturas) return;
    faseVista = fase;

    const { data } = await cdp.enviar("Page.captureScreenshot", { format: "png" }, sessionId);
    const arquivo = join(pastaDeCapturas, `leitor-${fase.replace(/[^\w.-]/g, "_")}.png`);
    await writeFile(arquivo, Buffer.from(data, "base64"));
    capturas.push(arquivo);
  };

  const metricas = async () => {
    const { metrics } = await cdp.enviar("Performance.getMetrics", {}, sessionId);

    return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  };

  let antes = null;
  let perfilLigado = false;
  const limite = Date.now() + (SEGUNDOS + 40) * 1000;

  const leitor = url.includes("cenario=leitor");

  while (Date.now() < limite) {
    // O leitor e sondado depressa: a fase "meio" dura o que um render dura.
    await new Promise((r) => setTimeout(r, leitor ? 40 : 500));
    if (leitor) await capturar();

    // A primeira leitura vai depois de a página existir, senão o delta de
    // script incluiria o parse do bundle em vez do custo do cenário.
    antes ??= await metricas();

    if (PERFIL && !perfilLigado) {
      // Depois do aquecimento, senao o perfil e dominado pelo parse do bundle.
      await new Promise((r) => setTimeout(r, 3000));
      await cdp.enviar("Profiler.start", {}, sessionId);
      perfilLigado = true;
    }

    const { result } = await cdp.enviar(
      "Runtime.evaluate",
      { expression: "JSON.stringify(window.__resultado ?? null)", returnByValue: true },
      sessionId,
    );

    const bruto = result.value && result.value !== "null" ? JSON.parse(result.value) : null;
    if (!bruto) continue;

    const depois = await metricas();
    const perfil = PERFIL ? await cdp.enviar("Profiler.stop", {}, sessionId) : null;
    pararDeOuvir();
    pararConsole();
    await cdp.enviar("Target.closeTarget", { targetId });

    return {
      ...bruto,
      bytes,
      imagens,
      capturas,
      perfil: perfil ? ondeFoiOTempo(perfil.profile) : null,
      // Tempo que o renderizador passou em JavaScript, em estilo e em layout
      // durante a corrida. É aqui que React e zustand aparecem: `perf.html`
      // move `style.transform` e não paga nada disto.
      scriptMs: Math.round((depois.ScriptDuration - antes.ScriptDuration) * 1000),
      heapMb: Math.round(depois.JSHeapUsedSize / 1024 / 1024),
      estiloMs: Math.round((depois.RecalcStyleDuration - antes.RecalcStyleDuration) * 1000),
      layoutMs: Math.round((depois.LayoutDuration - antes.LayoutDuration) * 1000),
      nodes: depois.Nodes,
      // `--console`: o que a pagina disse durante a corrida, para saber se a
      // arvore que se queria medir montou de fato (uma excecao engolida pelo
      // React mede um palco vazio e a tabela nao conta).
      console: CONSOLE ? console_.slice(-20) : null,
    };
  }

  pararDeOuvir();
  pararConsole();
  const { result: estado } = await cdp.enviar(
    "Runtime.evaluate",
    { expression: "JSON.stringify({ fase: window.__leitorFase ?? null, estado: window.__leitorEstado?.() ?? null })", returnByValue: true },
    sessionId,
  );
  await cdp.enviar("Target.closeTarget", { targetId });

  throw new Error(
    `sem resultado em ${url}\n  pagina: ${estado.value}\n  console:\n    ${console_.slice(-15).join("\n    ") || "(vazio)"}`,
  );
}

/**
 * Onde o tempo de JavaScript foi, por funcao.
 *
 * Tempo PROPRIO, e nao acumulado: o que se quer saber e quem gastou, nao quem
 * chamou. Um no do perfil traz a contagem de amostras dele mesmo, e o
 * intervalo de amostragem converte isso em milissegundos.
 */
function ondeFoiOTempo(profile) {
  const porFuncao = new Map();
  const total = profile.nodes.reduce((soma, no) => soma + (no.hitCount ?? 0), 0);
  if (total === 0) return [];

  const janela = (profile.endTime - profile.startTime) / 1000;

  for (const no of profile.nodes) {
    if (!no.hitCount) continue;

    const quadro = no.callFrame;
    const arquivo = (quadro.url ?? "").split("/").pop() ?? "";
    const nome = quadro.functionName || "(anonimo)";
    const chave = arquivo ? `${nome}  ${arquivo}` : nome;

    porFuncao.set(chave, (porFuncao.get(chave) ?? 0) + no.hitCount);
  }

  return [...porFuncao.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([nome, amostras]) => ({
      nome,
      ms: Math.round((amostras / total) * janela),
      pct: Number(((amostras / total) * 100).toFixed(1)),
    }));
}

/**
 * A corrida do meio, campo por campo.
 *
 * Mediana e nao media: o que suja uma medida e um quadro de 1383 ms porque
 * outra janela pediu a GPU, e a media leva esse acidente para dentro do
 * resultado enquanto a mediana o descarta.
 */
function mediana(corridas) {
  if (corridas.length === 1) return corridas[0];

  const meio = (campo) => {
    const valores = corridas.map((c) => c[campo]).sort((a, b) => a - b);
    const i = Math.floor(valores.length / 2);

    return valores.length % 2 ? valores[i] : Number(((valores[i - 1] + valores[i]) / 2).toFixed(2));
  };

  // `leitor`: mediana degrau a degrau, campo a campo.
  const passos = corridas[0].passos
    ? corridas[0].passos.map((_, i) => {
        const meioDe = (campo) => {
          const valores = corridas.map((c) => c.passos[i][campo]).sort((a, b) => a - b);
          const k = Math.floor(valores.length / 2);

          return valores.length % 2 ? valores[k] : Number(((valores[k - 1] + valores[k]) / 2).toFixed(2));
        };

        return {
          zoom: corridas[0].passos[i].zoom,
          atualMs: meioDe("atualMs"),
          todasMs: meioDe("todasMs"),
          mp: meioDe("mp"),
          mantidas: meioDe("mantidas"),
        };
      })
    : undefined;

  return {
    ...corridas[0],
    passos,
    corridas: corridas.length,
    fps: meio("fps"),
    p50: meio("p50"),
    p95: meio("p95"),
    pior: meio("pior"),
    perdidosPct: meio("perdidosPct"),
    scriptMs: meio("scriptMs"),
    heapMb: meio("heapMb"),
    nodes: meio("nodes"),
    estiloMs: meio("estiloMs"),
    layoutMs: meio("layoutMs"),
    bytes: meio("bytes"),
    imagens: meio("imagens"),
  };
}

// ---------------------------------------------------------------------------
async function principal() {
  const externo = opcao("url", null);

  if (!externo && !temFlag("pular-build")) {
    console.log("compilando (next build)...");
    const build = spawnSync("./node_modules/.bin/next", ["build"], { cwd: RAIZ, stdio: "inherit" });
    if (build.status !== 0) process.exit(build.status ?? 1);
  }

  if (!externo && !statSync(join(SAIDA, "perf.html"), { throwIfNoEntry: false })?.isFile()) {
    console.error("out/perf.html nao existe. Rode sem --pular-build.");
    process.exit(1);
  }

  const comLeitor = CENARIOS.includes("leitor");
  const pdf = comLeitor ? await pdfDoLeitor() : null;
  if (comLeitor && !pdf) {
    console.error("cenario leitor sem PDF: passe --pdf caminho.pdf");
    process.exit(1);
  }
  pastaDeCapturas = comLeitor ? (CAPTURAS ? resolve(CAPTURAS) : await mkdtemp(join(tmpdir(), "ato20-leitor-"))) : null;
  if (pastaDeCapturas) await mkdir(pastaDeCapturas, { recursive: true });

  const servidor = externo ? null : await servir(0, pdf, await lerImagens(IMAGENS));

  /**
   * `--servir`: sobe so o servidor e fica de pe, sem dirigir browser nenhum.
   *
   * Existe para a medida NA WEBVIEW: `scripts/perf/webview.py` abre um
   * WebKitGTK de verdade -- o mesmo motor do aplicativo -- e precisa do mesmo
   * `out/` servido com o mesmo `/asset/*` sintetico. Reimplementar o servidor
   * em Python seria manter duas verdades sobre o que a medida serve, e a
   * primeira vez que uma delas mudasse as duas bancadas mediriam cenas
   * diferentes com o mesmo nome.
   */
  if (temFlag("servir")) {
    const { port } = servidor.address();
    console.log(`http://127.0.0.1:${port}`);
    await new Promise(() => {});
  }
  const base = externo ?? `http://127.0.0.1:${servidor.address().port}`;

  const { processo, endereco, perfil } = await abrirChrome();
  const cdp = conectar(endereco);
  await cdp.aberto;

  const linhas = [];

  try {
    for (const cenario of CENARIOS) {
      // `leitor` nao tem N: o que varia e a pagina de partida.
      for (const n of cenario === "leitor" ? [Number(PAGINA)] : NS) {
        // So o palco do mestre desenha camera; nos outros o eixo nao existe e
        // varre-lo multiplicaria a matriz por celulas identicas.
        const comCamera = ["mestre-camera", "camera-gesto", "bancada"].includes(cenario);
        const eixo = comCamera ? CAMERAS : [CAMERAS[0]];

        const gestos = ["camera-gesto", "bancada"].includes(cenario) ? GESTOS : [GESTOS[0]];
        const paineis = cenario === "bancada" ? PAINEIS : [PAINEIS[0]];

        for (const cameras of eixo) {
          for (const gesto of gestos) {
            for (const painel of paineis) {
              const url = `${base}/perf?cenario=${cenario}&n=${n}&segundos=${SEGUNDOS}&movidos=${MOVIDOS}&lazy=${LAZY}&rolar=${ROLAR}&variante=${VARIANTE}&zoom=${ZOOM}&cameras=${cameras}&gesto=${gesto}&mapas=${MAPAS}&painel=${painel}&pagina=${PAGINA}&degraus=${DEGRAUS}&rajada=${RAJADA ? "1" : "0"}&sol=${SOL}&luzes=${LUZES}&paredes=${PAREDES}&rotulo=chrome`;
              const corridas = [];

              for (let i = 1; i <= REPETICOES; i++) {
                process.stderr.write(`medindo ${cenario} n=${n} cam=${cameras} ${gesto} ${painel} (${i}/${REPETICOES})...\r`);
                corridas.push(await medir(cdp, url));
              }

              linhas.push({ ...mediana(corridas), cameras, gesto, painel });
            }
          }
        }
      }
    }
  } finally {
    cdp.fechar();
    processo.kill();
    servidor?.close();
    // Espera o Chrome MORRER antes de apagar o perfil: ele grava na saida, e
    // apagar por baixo devolvia ENOTEMPTY -- no `finally`, o que engolia a
    // tabela inteira que a corrida acabou de produzir.
    await new Promise((pronto) => (processo.exitCode === null ? processo.on("exit", pronto) : pronto()));
    await rm(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  }

  const cab = ["cenario", "n", "cam", "gesto", "painel", "fps", "p50", "p95", "perdidos", "script", "estilo", "layout", "heap", "nos"];
  const largura = [13, 4, 4, 14, 9, 6, 7, 7, 9, 8, 8, 8, 8, 7];
  const fmt = (celulas) => celulas.map((c, i) => String(c).padStart(largura[i])).join("");

  // O leitor tem tabela propria: degrau a degrau, o que ele mede nao e quadro.
  for (const l of linhas.filter((l) => l.passos)) {
    const cabL = ["zoom", "atual", "todas", "pintado", "mantidas"];
    const largL = [8, 10, 10, 10, 10];
    const fmtL = (c) => c.map((v, i) => String(v).padStart(largL[i])).join("");
    console.log(`\nleitor -- pagina ${l.n}, ${l.paginas} paginas, dpr ${l.dpr}${l.corridas > 1 ? `, mediana de ${l.corridas}` : ""}`);
    console.log(fmtL(cabL));
    for (const passo of l.passos) {
      console.log(fmtL([`${Math.round(passo.zoom * 100)}%`, `${passo.atualMs}ms`, `${passo.todasMs}ms`, `${passo.mp}MP`, passo.mantidas ?? ""]));
    }
    console.log(`script ${l.scriptMs}ms, heap ${l.heapMb}MB, rede ${(l.bytes / 1024 / 1024).toFixed(1)}MB`);
    if (l.capturas?.length) console.log(`capturas: ${dirname(l.capturas[0])}`);
  }

  console.log(`\n${fmt(cab)}`);

  for (const l of linhas.filter((l) => !l.passos)) {
    console.log(
      fmt([
        l.cenario,
        l.n,
        l.cameras ?? "",
        l.gesto ?? "",
        l.painel ?? "",
        l.fps,
        `${l.p50}ms`,
        `${l.p95}ms`,
        `${l.perdidosPct}%`,
        `${l.scriptMs}ms`,
        `${l.estiloMs}ms`,
        `${l.layoutMs}ms`,
        `${l.heapMb}MB`,
        l.nodes,
      ]),
    );
  }

  console.log(
    `\n${SEGUNDOS}s por medida${REPETICOES > 1 ? `, mediana de ${REPETICOES} corridas` : ""}, ${AQUECIMENTO_NOTA}.`,
  );
  for (const l of linhas) {
    if (!l.console) continue;
    console.log(`\nconsole ${l.cenario} n=${l.n}:\n    ${l.console.join("\n    ") || "(vazio)"}`);
  }

  for (const l of linhas) {
    if (!l.perfil || l.perfil.length === 0) continue;

    console.log(`\nonde o JavaScript foi -- ${l.cenario} n=${l.n}:`);
    for (const { nome, ms, pct } of l.perfil) {
      console.log(`  ${String(pct).padStart(5)}%  ${String(ms).padStart(5)}ms  ${nome}`);
    }
  }

  console.log(
    JANELA
      ? "Com janela: fps e p95 valem. Chrome, nao a webview -- para o motor, ver public/perf.html."
      : "Sem tela nao ha vsync: leia script/estilo/layout, nao fps. Com --janela as tres primeiras colunas passam a valer.",
  );
}

const AQUECIMENTO_NOTA = "2,5s de aquecimento descartados";
/** Onde as capturas do `leitor` caem. Definida em `principal`. */
let pastaDeCapturas = null;

await principal();
