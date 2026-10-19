"use client";

import { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { SquareArrowDownLeft } from "lucide-react";
import { toast } from "sonner";

import { ImagemAusente } from "@/components/imagem-ausente";
import { ConfirmacaoDeApagar } from "@/components/mestre/confirmar-apagar";
import { ProvedorDaJanelaSolta } from "@/components/mestre/contexto-da-janela-solta";
import { DeclarativoDoMestre } from "@/components/mestre/declarativo-do-mestre";
import {
  AcoesDaJanela,
  alturaPadrao,
  FundoDaJanela,
  JanelaCorpo,
  larguraPadrao,
  useRotuloJanela,
} from "@/components/mestre/dock/window-content";
import { Button } from "@/components/ui/button";
import { ProvedorDoContainerDosPortais } from "@/components/ui/container-dos-portais";
import { TooltipProvider } from "@/components/ui/tooltip";
import { abrirJanela, janelaAberta, tirarDoMestre } from "@/lib/extensoes/janelas";
import { t } from "@/lib/i18n/mestre";
import {
  encerrarSolta,
  fecharTodasAsSoltas,
  focarSolta,
  idDoRotulo,
  janelaDaSolta,
  registrarSolta,
  rotuloDaSolta,
  useJanelasSoltasStore,
} from "@/lib/janelas-soltas";
import { usePreferenciasStore } from "@/lib/store/use-preferencias-store";
import { chaveDe, useWindowStore, type ConteudoJanela } from "@/lib/store/use-window-store";
import { call, isDesktop } from "@/lib/vault/bridge";

/**
 * Uma janela do Mestre SOLTA: fora do aplicativo, numa janela do sistema, que
 * vai para o segundo monitor.
 *
 * Quem desenha nela é o próprio Mestre. O `window.open` cria a janela do
 * sistema ligada a esta (ver `janelas.rs`), e o documento dela é um
 * `about:blank` da mesma origem: aqui se monta uma raiz React nele, no MESMO
 * JavaScript, com os mesmos stores. A ficha solta e a ficha do Mestre são a
 * mesma ficha, e nada há que sincronizar -- nem gravação que duas janelas
 * façam por cima uma da outra.
 *
 * O preço é o documento: o que o código pede ao `document` e ao `window`
 * globais é o do Mestre. Os portais vão ao `body` da solta pelo
 * `ProvedorDoContainerDosPortais`, e quem precisa do documento de verdade o
 * acha no contexto (`useJanelaSolta`) ou no `ownerDocument` do nó.
 */

/** A altura da que cresce com o conteúdo no Mestre, e não tem tamanho lembrado. */
const ALTURA = 560;

/** O passo entre uma solta e a que nasce dela: a escada das janelas internas. */
const PASSO = 28;

/** O tamanho e o lugar da última solta de cada tipo, entre sessões. */
const CHAVE_DO_LUGAR = "ato20:soltas-lugar";

type Lugar = { largura: number; altura: number; x: number; y: number };

function lerLugares(): Record<string, Lugar> {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_DO_LUGAR) ?? "{}") as unknown;
    return salvo && typeof salvo === "object" ? (salvo as Record<string, Lugar>) : {};
  } catch {
    return {};
  }
}

function lembrarLugar(tipo: string, lugar: Lugar): void {
  try {
    localStorage.setItem(CHAVE_DO_LUGAR, JSON.stringify({ ...lerLugares(), [tipo]: lugar }));
  } catch {
    // Sem espaço ou sem armazenamento: a próxima nasce no tamanho padrão.
  }
}

function novoId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

/**
 * Solta a janela: abre a janela do sistema e tira a janela do Mestre -- da
 * pilha ou da coluna. A que já está solta só vem para a frente.
 *
 * `onde` é o canto da janela na TELA, em pixels lógicos: onde a mão largou o
 * arrasto. Ausente = onde a última deste tipo estava, ou onde o sistema quiser.
 */
export async function soltarJanela(
  conteudo: ConteudoJanela,
  onde?: { x: number; y: number },
): Promise<boolean> {
  if (!isDesktop()) return false;

  const chave = chaveDe(conteudo);
  if (focarSolta(chave)) return true;

  // O tamanho em que ela estava no Mestre, se o mestre o ajustou; senão o da
  // última solta deste tipo; senão o padrão da janela.
  const zoom = usePreferenciasStore.getState().zoom;
  const flutuante = useWindowStore.getState().janelas.find((janela) => janela.chave === chave);
  const lembrado = lerLugares()[conteudo.tipo];
  const largura = flutuante?.largura ?? lembrado?.largura ?? larguraPadrao(conteudo);
  const altura = flutuante?.altura ?? lembrado?.altura ?? alturaPadrao(conteudo) ?? ALTURA;
  const lugar = onde ?? (lembrado ? { x: lembrado.x, y: lembrado.y } : undefined);

  const id = novoId();
  try {
    await call("janela_solta_pedir", {
      pedido: {
        rotulo: rotuloDaSolta(id),
        // O nome de verdade vem do documento, um instante depois.
        titulo: "ATO20",
        largura: Math.round(largura * zoom),
        altura: Math.round(altura * zoom),
        ...(lugar ? { x: Math.round(lugar.x), y: Math.round(lugar.y) } : {}),
        zoom,
      },
    });
  } catch {
    toast.error(t.janela.naoSoltou);
    return false;
  }

  const filha = window.open("about:blank", rotuloDaSolta(id));
  if (!filha) {
    toast.error(t.janela.naoSoltou);
    return false;
  }

  // Sai do Mestre só depois de a janela existir: falhando, ela fica onde
  // estava, e não some.
  tirarDoMestre(chave);
  montar(filha, id, conteudo);
  return true;
}

/**
 * Abre uma janela de DENTRO de uma solta. A que já está aberta em algum lugar
 * aparece onde está; a nova nasce solta, um degrau abaixo da que a pediu.
 */
function abrirDaSolta(conteudo: ConteudoJanela, id: string): void {
  if (janelaAberta(chaveDe(conteudo))) {
    abrirJanela(conteudo);
    return;
  }

  const filha = janelaDaSolta(id);
  void soltarJanela(
    conteudo,
    filha ? { x: filha.screenX + PASSO, y: filha.screenY + PASSO } : undefined,
  );
}

/** Volta ao Mestre: fecha a solta e abre a janela lá, flutuando. */
function voltarAoMestre(id: string): void {
  const solta = useJanelasSoltasStore.getState().soltas.find((atual) => atual.id === id);
  if (!solta) return;

  encerrarSolta(id);
  abrirJanela(solta.conteudo);
}

/** Põe o título no documento da solta. Fora do componente: o documento não é dele. */
function nomear(documento: Document, titulo: string): void {
  documento.title = titulo;
}

function montar(filha: Window, id: string, conteudo: ConteudoJanela): void {
  const documento = filha.document;
  const espelho = espelharEstilos(documento);
  documento.body.className = document.body.className;

  const caixa = documento.createElement("div");
  caixa.style.cssText = "position:fixed;inset:0;display:flex;flex-direction:column";
  documento.body.appendChild(caixa);

  const raiz = createRoot(caixa);
  registrarSolta(id, conteudo, filha, () => {
    // O tamanho e o lugar ficam para a próxima deste tipo, em pixels CSS, como
    // o das janelas internas: o zoom entra no pedido. Com a janela ainda de pé
    // -- fechada pelo X do sistema, quem diz o lugar é o Rust.
    if (!filha.closed && filha.innerWidth > 0) {
      lembrarLugar(conteudo.tipo, {
        largura: filha.innerWidth,
        altura: filha.innerHeight,
        x: filha.screenX,
        y: filha.screenY,
      });
    }
    espelho.disconnect();
    // Fora do evento que pediu: desmontar no meio dele é pedir ao React que
    // mexa num documento que pode estar indo embora.
    queueMicrotask(() => raiz.unmount());
  });
  raiz.render(<RaizDaSolta id={id} documento={documento} />);

  filha.addEventListener("pagehide", () => encerrarSolta(id, false));
}

/**
 * Os estilos do Mestre na solta, e acompanhando: o que o Tailwind gerou, as
 * fontes, e o que entra depois -- a folha de um componente carregado tarde, e
 * no `next dev` cada recarga de estilo. E os atributos do `<html>`, que levam o
 * tema, o idioma e a fonte.
 */
function espelharEstilos(documento: Document): { disconnect: () => void } {
  const copias = new Map<Node, Node>();
  const copiar = (no: Node) => {
    if (copias.has(no) || !(no.nodeName === "STYLE" || ehFolha(no))) return;
    const copia = documento.importNode(no, true);
    copias.set(no, copia);
    documento.head.appendChild(copia);
  };
  const atributos = () => {
    for (const atributo of Array.from(document.documentElement.attributes)) {
      documento.documentElement.setAttribute(atributo.name, atributo.value);
    }
  };

  atributos();
  for (const no of Array.from(document.head.childNodes)) copiar(no);

  const cabeca = new MutationObserver((mudancas) => {
    for (const mudanca of mudancas) {
      if (mudanca.type === "characterData" || mudanca.type === "childList") {
        // O texto de um `<style>` trocado pela recarga do `next dev`.
        const estilo = mudanca.target.nodeName === "STYLE" ? mudanca.target : mudanca.target.parentNode;
        const copia = estilo ? copias.get(estilo) : undefined;
        if (estilo && copia) copia.textContent = estilo.textContent;
      }
      for (const no of Array.from(mudanca.addedNodes)) copiar(no);
      for (const no of Array.from(mudanca.removedNodes)) {
        const copia = copias.get(no);
        if (copia) {
          copia.parentNode?.removeChild(copia);
          copias.delete(no);
        }
      }
    }
  });
  cabeca.observe(document.head, { childList: true, subtree: true, characterData: true });

  const raiz = new MutationObserver(atributos);
  raiz.observe(document.documentElement, { attributes: true });

  return {
    disconnect() {
      cabeca.disconnect();
      raiz.disconnect();
    },
  };
}

function ehFolha(no: Node): boolean {
  return no.nodeName === "LINK" && (no as HTMLLinkElement).rel === "stylesheet";
}

function RaizDaSolta({ id, documento }: { id: string; documento: Document }) {
  const conteudo = useJanelasSoltasStore(
    (estado) => estado.soltas.find((solta) => solta.id === id)?.conteudo,
  );
  const aqui = useMemo(
    () => ({ id, documento, abrir: (novo: ConteudoJanela) => abrirDaSolta(novo, id) }),
    [id, documento],
  );

  if (!conteudo) return null;

  return (
    <ProvedorDaJanelaSolta value={aqui}>
      <ProvedorDoContainerDosPortais value={documento.body}>
        <TooltipProvider>
          <DeclarativoDoMestre>
            <CorpoDaSolta id={id} conteudo={conteudo} documento={documento} />
            <ConfirmacaoDeApagar onde={id} />
            <ImagemAusente documento={documento} />
          </DeclarativoDoMestre>
        </TooltipProvider>
      </ProvedorDoContainerDosPortais>
    </ProvedorDaJanelaSolta>
  );
}

/**
 * A moldura da solta: o cabeçalho da janela interna sem o que é de janela
 * interna -- arrastar, recolher e fechar são do sistema agora --, com o
 * caminho de volta no lugar.
 */
function CorpoDaSolta({
  id,
  conteudo,
  documento,
}: {
  id: string;
  conteudo: ConteudoJanela;
  documento: Document;
}) {
  const { titulo, subtitulo } = useRotuloJanela(conteudo);

  // O título da barra do sistema acompanha o nome da janela. Ver `janelas.rs`.
  useEffect(() => nomear(documento, subtitulo ? `${titulo} · ${subtitulo}` : titulo), [
    documento,
    titulo,
    subtitulo,
  ]);

  return (
    <div className="bg-popover text-popover-foreground flex min-h-0 flex-1 flex-col">
      <header className="relative isolate flex shrink-0 items-center gap-2 overflow-hidden border-b px-2 py-1.5">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <FundoDaJanela conteudo={conteudo} />
        </div>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{titulo}</span>
          {subtitulo ? (
            <span className="text-muted-foreground block truncate text-[10px]">{subtitulo}</span>
          ) : null}
        </span>
        <AcoesDaJanela conteudo={conteudo} />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t.janela.voltar(titulo)}
          title={t.janela.voltar(titulo)}
          onClick={() => voltarAoMestre(id)}
        >
          <SquareArrowDownLeft />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <JanelaCorpo conteudo={conteudo} />
      </div>
    </div>
  );
}

// O Mestre que recarrega -- o F5 do `next dev`, a troca de idioma -- leva as
// soltas junto: quem as desenhava era ele.
//
// E o X do sistema numa solta: o Rust avisa ao pedir para fechar, com o lugar
// dela, e de novo quando ela some (`janelas.rs`). A página da solta nem sempre
// avisa sozinha.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", fecharTodasAsSoltas);

  if (isDesktop()) {
    void listen<{ rotulo: string; largura: number; altura: number; x: number; y: number }>(
      "janela-solta-fechando",
      ({ payload }) => {
        const id = idDoRotulo(payload.rotulo);
        const solta = useJanelasSoltasStore.getState().soltas.find((atual) => atual.id === id);
        if (!solta) return;

        const zoom = usePreferenciasStore.getState().zoom || 1;
        lembrarLugar(solta.conteudo.tipo, {
          largura: payload.largura / zoom,
          altura: payload.altura / zoom,
          x: payload.x,
          y: payload.y,
        });
      },
    );
    void listen<string>("janela-solta-fechada", ({ payload }) => {
      const id = idDoRotulo(payload);
      if (id) encerrarSolta(id, false);
    });
  }
}
