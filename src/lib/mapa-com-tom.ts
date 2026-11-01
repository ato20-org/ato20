import type { PedidoDeTom, RespostaDoTom } from "@/lib/forno-do-tom.worker";
import {
  filtroDaImagem,
  type AjusteDeImagem,
} from "@/lib/imagem-do-espectador";
import { pintarComTom, tamanhoAssado } from "@/lib/tom-do-mapa";

/**
 * O mapa do Mestre com o tom da cena, assado num arquivo. Ver `tom-do-mapa.ts`
 * para o porquê, e `FundoDaCena` para quem usa.
 *
 * Devolve o endereço de um `blob:`, ou `null` quando não deu -- e aí quem pede
 * fica com o mapa sem tom, que é o que o Mestre via antes do tom existir.
 */
export function assarMapaComTom(
  url: string,
  ajuste: Required<AjusteDeImagem>,
): Promise<string | null> {
  const chave = `${url}|${filtroDaImagem(ajuste) ?? ""}`;
  const pronto = guardados.get(chave);
  if (pronto) {
    // De volta ao fim da fila: é o mais recente agora.
    guardados.delete(chave);
    guardados.set(chave, pronto);
    return pronto;
  }

  const assando = assar(url, ajuste).catch(() => null);
  guardados.set(chave, assando);
  soltarOsVelhos();
  // Falha não fica guardada: o daemon que não respondeu agora pode responder
  // no próximo pedido, e o mapa não deve ficar sem tom até a régua mexer.
  void assando.then((endereco) => {
    if (!endereco && guardados.get(chave) === assando) guardados.delete(chave);
  });

  return assando;
}

/**
 * Os últimos mapas assados, do mais velho ao mais novo.
 *
 * Poucos: cada um é o mapa inteiro em PNG, e o que importa é não assar de
 * novo o que acabou de sair da tela -- voltar o slider, trocar de variante no
 * zoom e voltar. O mais velho sai e solta o arquivo.
 */
const guardados = new Map<string, Promise<string | null>>();
const QUANTOS = 4;

function soltarOsVelhos() {
  while (guardados.size > QUANTOS) {
    const [chave, velho] = guardados.entries().next().value!;
    guardados.delete(chave);
    void velho.then((endereco) => {
      if (endereco) URL.revokeObjectURL(endereco);
    });
  }
}

async function assar(
  url: string,
  ajuste: Required<AjusteDeImagem>,
): Promise<string | null> {
  const resposta = await fetch(url);
  if (!resposta.ok) return null;

  // Pelo blob, e não pelo endereço: o mapa vem do daemon, e um canvas
  // desenhado de outra origem sem CORS não deixa ler os pixels de volta.
  const imagem = await createImageBitmap(await resposta.blob());

  const arquivo = temForno()
    ? await noForno(imagem, ajuste)
    : await naJanela(imagem, ajuste);

  return arquivo ? URL.createObjectURL(arquivo) : null;
}

// --- no worker ---------------------------------------------------------------

let forno: Worker | null = null;
/** O worker não subiu. Daí em diante, na janela. Ver `externo-assado.ts`. */
let fornoQuebrado = false;
let proximo = 0;
const esperando = new Map<number, (resposta: RespostaDoTom) => void>();

function temForno(): boolean {
  return (
    !fornoQuebrado &&
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined"
  );
}

function oForno(): Worker {
  if (forno) return forno;

  // Sem `{ type: "module" }`, pela razão do forno dos efeitos: é a forma que o
  // Turbopack reconhece como worker e empacota.
  forno = new Worker(new URL("./forno-do-tom.worker.ts", import.meta.url));
  forno.onmessage = (evento: MessageEvent<RespostaDoTom>) => {
    const responder = esperando.get(evento.data.id);
    esperando.delete(evento.data.id);
    responder?.(evento.data);
  };
  forno.onerror = () => {
    fornoQuebrado = true;
    for (const [id, responder] of esperando) responder({ id, erro: "o forno não subiu" });
    esperando.clear();
  };

  return forno;
}

async function noForno(
  imagem: ImageBitmap,
  ajuste: Required<AjusteDeImagem>,
): Promise<Blob | null> {
  const id = ++proximo;
  const resposta = await new Promise<RespostaDoTom>((responder) => {
    esperando.set(id, responder);
    oForno().postMessage({ id, imagem, ajuste } satisfies PedidoDeTom, [imagem]);
  });

  return "arquivo" in resposta ? resposta.arquivo : null;
}

// --- na janela ---------------------------------------------------------------

function naJanela(
  imagem: ImageBitmap,
  ajuste: Required<AjusteDeImagem>,
): Promise<Blob | null> {
  const { largura, altura } = tamanhoAssado(imagem.width, imagem.height);
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;

  const ctx = tela.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  pintarComTom(ctx, imagem, largura, altura, ajuste);
  imagem.close();

  return new Promise((resolver) => tela.toBlob(resolver, "image/png"));
}
