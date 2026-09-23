"use client";

import { toast } from "sonner";

import { imageMimeByName } from "@/lib/attachments/kind";
import { boxAround, fitInitialSize } from "@/lib/geometry/transform";
import { importarBytesNoAcervo } from "@/lib/mestre/importar-arquivos";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import type { AssetMeta } from "@/types/scene";

/** A marca do painel do acervo, a mesma que o arrasto de arquivo já usa. */
const ZONA_DO_ACERVO = "[data-acervo-solto]";

/** Quando a imagem entrou sem medidas legíveis. Igual ao `ArquivoFantasma`. */
const TAMANHO_DE_RESERVA = { x: 480, y: 270 };

/**
 * Espelho de `MAX_COLADO` no Rust. Aqui para poupar a travessia, lá para valer.
 */
const MAX_COLADO = 64 * 1024 * 1024;

/**
 * Cola imagem de fora para dentro: no quadro, no mapa ou no acervo.
 *
 * Devolve `true` quando assumiu o gesto, e é o que faz quem chama segurar o
 * evento. Roda ANTES do ramo de texto em `useMestreShortcuts`: um endereço de
 * imagem colado viraria uma nota no quadro se o texto olhasse primeiro.
 *
 * A decisão de assumir é SÍNCRONA e o trabalho não — importar vai ao disco, e
 * baixar vai à rede. Não dá para decidir depois: `preventDefault` não vale mais
 * nada quando o `await` volta.
 *
 * BITMAP PRIMEIRO, endereço como reserva. Copiar imagem no navegador costuma pôr
 * os dois na área de transferência, e os bytes entram na hora: não dependem de a
 * rede estar de pé nem de o endereço continuar valendo amanhã.
 */
export function colarImagemDoSistema(event: ClipboardEvent): boolean {
  const dados = event.clipboardData;
  if (!dados) return false;

  const noAcervo = dentroDoAcervo(event.target);

  const arquivo = imagemDosArquivos(dados);
  if (arquivo) {
    void receberArquivo(arquivo, noAcervo);

    return true;
  }

  // O trecho de página, que é como o navegador entrega "copiar imagem".
  const doHtml = enderecoDoHtml(dados.getData("text/html"));
  if (doHtml) {
    void receberDaPagina(doHtml, noAcervo, Array.from(dados.types));

    return true;
  }

  const endereco = enderecoDeImagem(dados.getData("text/plain"));
  if (endereco) {
    void baixarEReceber(endereco, noAcervo, false, Array.from(dados.types));

    return true;
  }

  return false;
}

/**
 * A primeira imagem do que foi colado, se houver alguma.
 *
 * Olha `files` E `items`, porque os motores não concordam sobre qual preencher:
 * o print de tela do sistema costuma chegar pelos dois, e a imagem copiada de
 * uma página, dependendo do motor, só pelo segundo. Ler um só fazia a colagem
 * falhar calada justamente no caso mais comum.
 */
function imagemDosArquivos(dados: DataTransfer): File | null {
  for (const arquivo of Array.from(dados.files)) {
    if (arquivo.type.startsWith("image/")) return arquivo;
  }

  for (const item of Array.from(dados.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;

    const arquivo = item.getAsFile();
    if (arquivo) return arquivo;
  }

  return null;
}

/**
 * O endereço do `<img>` dentro do trecho de página copiado.
 *
 * É o caminho do gesto real: "copiar imagem" no navegador põe na área de
 * transferência um pedaço de HTML com a figura, e nem sempre o bitmap junto.
 * Era por aqui que a imagem do Google entrava em toda outra tela e não entrava
 * aqui.
 *
 * NÃO exige extensão no caminho, ao contrário do ramo de texto, e a diferença é
 * o que torna isto seguro: um `<img src>` é imagem por declaração de quem
 * copiou, e não um palpite sobre um endereço solto. Endereço de miniatura do
 * Google é `/images?q=tbn:...`, sem extensão nenhuma — exigir uma recusaria
 * justamente o caso que motivou o pedido.
 *
 * `data:` entra também: imagem pequena numa página vem embutida assim, e ela
 * dispensa a ida à rede.
 */
export function enderecoDoHtml(html: string): URL | null {
  if (!html) return null;

  const achado = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i.exec(html);
  const bruto = achado?.[1]?.trim();
  if (!bruto) return null;

  let endereco: URL;
  try {
    endereco = new URL(bruto);
  } catch {
    // `src` relativo: sem a página de origem não há como completá-lo.
    return null;
  }

  const aceitos = ["http:", "https:", "data:"];
  if (!aceitos.includes(endereco.protocol)) return null;

  // `data:` que não é de imagem não interessa -- e o `href` guarda o tipo.
  if (endereco.protocol === "data:" && !endereco.href.startsWith("data:image/")) {
    return null;
  }

  return endereco;
}

/**
 * A imagem de um trecho de página copiado, pelo caminho mais curto que existir.
 *
 * TRÊS tentativas, e a ordem é a lição desta tela:
 *
 * 1. A ÁREA DE TRANSFERÊNCIA ASSÍNCRONA. `clipboardData` do evento não é a
 *    única porta: o WebKit não expõe o bitmap por ela em todo caso, e
 *    `navigator.clipboard.read()` alcança o mesmo conteúdo com os bytes junto.
 *    É de longe o melhor caminho — sem rede, sem CORS, sem depender de o
 *    endereço continuar de pé.
 * 2. `data:`, que já traz os bytes no endereço.
 * 3. Baixar. É o último recurso, e falha em boa parte dos sites: a resposta
 *    precisa liberar a origem do aplicativo, e serviço de imagem quase nunca
 *    libera. O erro do WebKit para isso é um lacônico "Load failed".
 *
 * Os `tipos` viajam só para o erro: quando as três falham, saber o que a área de
 * transferência realmente oferecia é a diferença entre consertar e adivinhar.
 */
async function receberDaPagina(
  endereco: URL,
  noAcervo: boolean,
  tipos: string[],
): Promise<void> {
  const daArea = await bytesDaAreaDeTransferencia();
  if (daArea) {
    await receber(daArea.nome, daArea.bytes, noAcervo);

    return;
  }

  if (endereco.protocol === "data:") {
    await receberDataUrl(endereco, noAcervo);

    return;
  }

  await baixarEReceber(endereco, noAcervo, true, tipos);
}

/**
 * Os bytes da imagem pela área de transferência assíncrona.
 *
 * Existe porque `event.clipboardData` e `navigator.clipboard` não enxergam a
 * mesma coisa: copiar imagem de uma página põe o bitmap na área do sistema, e o
 * evento de colagem do WebKit entrega só o trecho de HTML. Esta é a porta que vê
 * os bytes.
 *
 * `null` em vez de erro quando não dá — sem permissão, sem suporte, ou sem
 * imagem nenhuma lá dentro. Quem chama tem por onde seguir.
 */
async function bytesDaAreaDeTransferencia(): Promise<{
  nome: string;
  bytes: Uint8Array;
} | null> {
  try {
    for (const item of await navigator.clipboard.read()) {
      const tipo = item.types.find((tipo) => tipo.startsWith("image/"));
      if (!tipo) continue;

      const blob = await item.getType(tipo);

      return {
        nome: nomeDeColagem(tipo),
        bytes: new Uint8Array(await blob.arrayBuffer()),
      };
    }
  } catch {
    // Permissão negada, porta ausente, ou a área mudou entre o evento e a
    // leitura. Nenhum deles merece erro na tela: há mais dois caminhos abaixo.
  }

  return null;
}

/** Uma imagem que veio embutida no próprio endereço. */
async function receberDataUrl(endereco: URL, noAcervo: boolean): Promise<void> {
  try {
    const resposta = await fetch(endereco);
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    const mime = endereco.href.slice(5).split(/[;,]/)[0] ?? "image/png";

    await receber(nomeDeColagem(mime), bytes, noAcervo);
  } catch {
    toast.error("Não deu para ler a imagem embutida.");
  }
}

/**
 * O endereço colado, quando ele é de uma imagem.
 *
 * Exige EXTENSÃO de imagem no caminho, e a exigência é conservadora de
 * propósito: sem ela, colar o link de uma página no quadro deixaria de virar
 * nota e viraria uma ida à rede que não leva a lugar nenhum. O caso comum do
 * gesto — "copiar endereço da imagem" no navegador — traz a extensão.
 *
 * Só `http` e `https`: `file:` e os outros esquemas não são coisa que se cola de
 * fora, e buscar neles seria o aplicativo lendo disco por um Ctrl+V.
 */
export function enderecoDeImagem(texto: string): URL | null {
  const bruto = texto.trim();
  if (!bruto) return null;

  let endereco: URL;
  try {
    endereco = new URL(bruto);
  } catch {
    return null;
  }

  if (endereco.protocol !== "http:" && endereco.protocol !== "https:") {
    return null;
  }

  return imageMimeByName(endereco.pathname) ? endereco : null;
}

async function receberArquivo(arquivo: File, noAcervo: boolean): Promise<void> {
  const nome = arquivo.name || nomeDeColagem(arquivo.type);

  await receber(nome, new Uint8Array(await arquivo.arrayBuffer()), noAcervo);
}

/**
 * Busca a imagem do endereço e a traz para dentro.
 *
 * Com aviso enquanto baixa e erro NOMEADO quando não dá: o aplicativo não toca a
 * rede num Ctrl+V em nenhum outro caso, e uma ida silenciosa que não produz nada
 * deixaria o mestre sem saber se colou errado, se a rede caiu ou se o endereço
 * morreu.
 *
 * O `fetch` roda aqui e não no Rust porque não há cliente HTTP em `src-tauri`, e
 * trazer um para isto seria peso novo — os bytes terminam no mesmo lugar em que
 * o ramo do bitmap já os põe.
 */
async function baixarEReceber(
  endereco: URL,
  noAcervo: boolean,
  /**
   * Veio de um `<img>`, e não de um endereço solto.
   *
   * Muda de onde sai o NOME: o endereço solto foi aceito por terminar em
   * extensão de imagem, então o próprio caminho serve. O do `<img>` não passou
   * por essa peneira e muitas vezes nem tem caminho útil — miniatura do Google é
   * `/images?q=tbn:...` —, e aí quem diz o formato é o `Content-Type` da
   * resposta. Sem isso o arquivo entraria sem extensão e sumiria da biblioteca
   * de imagens, que é o desaparecimento silencioso descrito em `nomeDeColagem`.
   */
  deHtml: boolean,
  /** O que a área de transferência oferecia, só para o texto do erro. */
  tipos: string[],
): Promise<void> {
  const aviso = toast.loading("Baixando imagem…");

  try {
    const resposta = await fetch(endereco);
    if (!resposta.ok) {
      throw new Error(`o endereço respondeu ${resposta.status}`);
    }

    const tipo = resposta.headers.get("content-type")?.split(";")[0]?.trim();
    if (deHtml && tipo && !tipo.startsWith("image/")) {
      throw new Error(`o endereço devolveu ${tipo}, que não é imagem`);
    }

    const bytes = new Uint8Array(await resposta.arrayBuffer());
    toast.dismiss(aviso);

    await receber(nomeDoEndereco(endereco, tipo, deHtml), bytes, noAcervo);
  } catch (cause) {
    toast.dismiss(aviso);

    const motivo = cause instanceof Error ? cause.message : "falha na rede";

    // "Load failed" é o que o WebKit diz quando a resposta não libera a origem
    // do aplicativo, e sozinho ele não ensina nada a ninguém. A lista do que a
    // área de transferência tinha é o que permite entender por que se chegou a
    // depender da rede — o caminho curto é o bitmap, e ele deveria ter vindo.
    toast.error(`Não deu para baixar a imagem: ${motivo}`, {
      description: `A área de transferência oferecia: ${tipos.join(", ") || "nada"}.`,
    });
  }
}

/**
 * Como o arquivo baixado se chama na biblioteca.
 *
 * O caminho do endereço quando ele já termina em extensão de imagem — é o nome
 * que o mestre reconhece. Senão, um nome carimbado com a extensão saída do
 * `Content-Type`, porque o que não pode faltar é a extensão.
 */
function nomeDoEndereco(
  endereco: URL,
  tipo: string | undefined,
  deHtml: boolean,
): string {
  const doCaminho = decodeURIComponent(endereco.pathname.split("/").pop() ?? "");

  if (!deHtml && doCaminho) return doCaminho;
  if (imageMimeByName(doCaminho)) return doCaminho;

  return nomeDeColagem(tipo ?? "image/png");
}

async function receber(
  nome: string,
  bytes: Uint8Array,
  noAcervo: boolean,
): Promise<void> {
  if (bytes.byteLength > MAX_COLADO) {
    toast.error(
      `${nome}: passou de ${MAX_COLADO / (1024 * 1024)} MB, o teto do que entra colado. Arraste o arquivo.`,
    );

    return;
  }

  const aceitos = await importarBytesNoAcervo(nome, bytes);

  // Colado com o acervo em foco, para aí. É o gesto de quem está montando o
  // acervo antes da sessão, e não de quem quer a imagem no mapa agora.
  if (noAcervo) return;

  porNaCena(aceitos);
}

/**
 * Põe o que entrou na cena aberta, no centro do que se está vendo.
 *
 * No centro e não sob o ponteiro: o arrasto tem um lugar porque a mão apontou
 * para ele, e o Ctrl+V não tem. É a mesma escolha de `colarTextoDoSistema`.
 *
 * Quadro e mapa igualmente: os dois são `Scene` e desenham item do mesmo jeito.
 */
function porNaCena(assets: AssetMeta[]): void {
  const imagens = assets.filter((asset) => asset.kind === "image");
  if (imagens.length === 0) return;

  const scene = selectEditingScene(useSceneStore.getState());
  if (!scene) return;

  const { viewport } = useViewportStore.getState();
  const centro = {
    x: Math.round(viewport.x + viewport.width / 2),
    y: Math.round(viewport.y + viewport.height / 2),
  };

  useSelectionStore.getState().select(
    imagens.map((asset) => {
      const tamanho =
        asset.naturalWidth && asset.naturalHeight
          ? fitInitialSize(asset.naturalWidth, asset.naturalHeight)
          : TAMANHO_DE_RESERVA;

      return useSceneStore
        .getState()
        .addItem(scene.id, {
          assetId: asset.id,
          ...boxAround(centro, tamanho.x, tamanho.y),
        });
    }),
  );
}

function dentroDoAcervo(alvo: EventTarget | null): boolean {
  return alvo instanceof Element && alvo.closest(ZONA_DO_ACERVO) !== null;
}

/**
 * O nome de uma imagem que nunca teve nome.
 *
 * Print de tela e recorte de editor chegam sem nome de arquivo. Sem um aqui, a
 * biblioteca encheria de linhas iguais, e o carimbo de quando foi colado é o que
 * o mestre tem para distinguir uma da outra.
 *
 * A EXTENSÃO importa mais do que parece: o Rust classifica pelo NOME e nunca
 * pelos bytes, e nada é recusado por não ter extensão — vira `kind: "file"`. Uma
 * imagem sem extensão no nome entraria no acervo, sumiria da biblioteca de
 * imagens e não iria para o mapa. Um desaparecimento silencioso, que é pior que
 * um erro na tela.
 */
export function nomeDeColagem(mime: string): string {
  const agora = new Date();
  const dois = (valor: number) => String(valor).padStart(2, "0");
  const carimbo =
    `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}` +
    ` ${dois(agora.getHours())}h${dois(agora.getMinutes())}`;

  return `Colado ${carimbo}.${extensaoDoMime(mime)}`;
}

/**
 * A extensão de um tipo MIME de imagem.
 *
 * Confere a ida e a volta em vez de manter uma segunda tabela: o subtipo quase
 * sempre É a extensão (`image/png`, `image/webp`), e `imageMimeByName` já sabe
 * dizer se aquela extensão vale. O `+` cobre `image/svg+xml`, cujo subtipo
 * inteiro não é extensão de nada.
 *
 * Cai em `png` quando não reconhece: é o formato em que o sistema entrega print
 * de tela, e um palpite errado aqui só erra o rótulo, nunca os bytes.
 */
function extensaoDoMime(mime: string): string {
  const subtipo = mime.split("/")[1]?.split("+")[0]?.toLowerCase() ?? "";

  return imageMimeByName(`x.${subtipo}`) ? subtipo : "png";
}
