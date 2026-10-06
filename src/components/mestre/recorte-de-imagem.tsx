"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Circle, Loader2, Square, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  aproximar,
  arrastar,
  enquadreInicial,
  regiaoDoEnquadre,
  tamanhoDaSaida,
  ZOOM_MAXIMO,
  ZOOM_MINIMO,
  type Enquadre,
  type Regiao,
  type Tamanho,
} from "@/lib/geometry/recorte";
import { comum } from "@/lib/i18n/comum";
import { t } from "@/lib/i18n/personagens";
import { cn } from "@/lib/utils";
import { assetUrl } from "@/lib/vault/assets";
import type { Recortar, RespostaDoRecorte } from "@/lib/vault/characters";
import type { AssetMeta } from "@/types/scene";

/**
 * Como a moldura corta: quadrado ou círculo.
 *
 * O círculo não é um campo da ficha, é o PNG: os cantos saem transparentes, e
 * todo lugar que desenha retrato ou token -- palco, espectador, celular, kit --
 * desenha o círculo sem saber que ele existe. A aura e o tingido da condição, o
 * contorno e a sombra do token leem o alfa do arquivo, e ficam redondos junto.
 */
export type FormatoDoRecorte = "quadrado" | "circulo";

/**
 * Largura sobre altura da moldura. Os dois formatos são 1:1; um retângulo
 * 3:4 seria só outro número aqui, porque a geometria já recebe a proporção.
 */
const PROPORCAO = 1;

/** A moldura no diálogo, em pixels de tela. */
const MOLDURA = 256;
const ALTURA_DA_MOLDURA = MOLDURA / PROPORCAO;

/**
 * A faixa em volta da moldura, onde a imagem continua aparecendo no escuro. É
 * ela que mostra para onde dá para arrastar.
 */
const MARGEM = 32;

const PASSO_DA_RODA = 1.15;
const PASSO_DO_BOTAO = 1.5;
const PASSO_DA_SETA = 10;

const CENTRO = { x: 0.5, y: 0.5 };

type Pedido = {
  original: AssetMeta;
  responder: (resposta: RespostaDoRecorte) => void;
};

/**
 * O editor de recorte como função que espera a resposta.
 *
 * `recortar` é o que `preencherCampoComArquivo` chama no meio do fluxo, e
 * `dialogo` é o que a tela pendura na árvore. A promessa é o que deixa a
 * decisão de quando recortar -- depois de importar, antes de gravar o campo --
 * no fluxo, e não espalhada em estado da tela.
 */
export function useRecorte({
  titulo,
  formatoInicial,
}: {
  titulo: string;
  formatoInicial: FormatoDoRecorte;
}): { recortar: Recortar; dialogo: ReactNode } {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const pendente = useRef<Pedido | null>(null);

  const recortar = useCallback<Recortar>(
    (original) =>
      new Promise((responder) => {
        const novo = { original, responder };
        pendente.current = novo;
        setPedido(novo);
      }),
    [],
  );

  // A tela fechou com o diálogo aberto -- a ficha saiu da janela, a campanha
  // trocou. Sem responder, o fluxo ficaria esperando para sempre, e o original
  // importado ficaria no acervo sem dono.
  useEffect(
    () => () => {
      pendente.current?.responder(null);
      pendente.current = null;
    },
    [],
  );

  const dialogo = pedido ? (
    <RecorteDeImagem
      key={pedido.original.id}
      original={pedido.original}
      titulo={titulo}
      formatoInicial={formatoInicial}
      onResponder={(resposta) => {
        pendente.current = null;
        setPedido(null);
        pedido.responder(resposta);
      }}
    />
  ) : null;

  return { recortar, dialogo };
}

function RecorteDeImagem({
  original,
  titulo,
  formatoInicial,
  onResponder,
}: {
  original: AssetMeta;
  titulo: string;
  formatoInicial: FormatoDoRecorte;
  onResponder: (resposta: RespostaDoRecorte) => void;
}) {
  const [fonte, setFonte] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [natural, setNatural] = useState<Tamanho | null>(null);
  const [enquadre, setEnquadre] = useState<Enquadre | null>(null);
  const [formato, setFormato] = useState<FormatoDoRecorte>(formatoInicial);
  const [gravando, setGravando] = useState(false);

  const imagem = useRef<HTMLImageElement | null>(null);
  const palco = useRef<HTMLDivElement | null>(null);
  const arrasto = useRef<{ id: number; x: number; y: number } | null>(null);

  // Os bytes vêm do daemon e viram blob, em vez de o `<img>` apontar para o
  // daemon direto: o daemon é outra origem, e um canvas que desenha imagem de
  // outra origem fica "sujo" e se recusa a exportar. A blob é desta página.
  useEffect(() => {
    let ativo = true;
    let criada: string | null = null;

    void (async () => {
      try {
        const resposta = await fetch(await assetUrl(original.id));
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

        const blob = await resposta.blob();
        if (!ativo) return;

        criada = URL.createObjectURL(blob);
        setFonte(criada);
      } catch {
        if (ativo) setFalhou(true);
      }
    })();

    return () => {
      ativo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [original.id]);

  // Ouvinte nativo, e não `onWheel`: o do React é passivo, e sem
  // `preventDefault` a roda rolaria o diálogo junto com o zoom.
  useEffect(() => {
    const alvo = palco.current;
    if (!alvo || !natural) return;

    const aoRodar = (evento: WheelEvent) => {
      evento.preventDefault();

      const giro = evento.deltaY || evento.deltaX;
      if (giro === 0) return;

      const caixa = alvo.getBoundingClientRect();
      const ponto = {
        x: (evento.clientX - caixa.left - MARGEM) / MOLDURA,
        y: (evento.clientY - caixa.top - MARGEM) / ALTURA_DA_MOLDURA,
      };
      const fator = giro < 0 ? PASSO_DA_RODA : 1 / PASSO_DA_RODA;

      setEnquadre(
        (atual) =>
          atual &&
          aproximar(natural, PROPORCAO, atual, atual.zoom * fator, ponto),
      );
    };

    alvo.addEventListener("wheel", aoRodar, { passive: false });

    return () => alvo.removeEventListener("wheel", aoRodar);
  }, [natural]);

  function medir(no: HTMLImageElement) {
    if (natural || !no.naturalWidth || !no.naturalHeight) return;

    const medida = { largura: no.naturalWidth, altura: no.naturalHeight };
    setNatural(medida);
    setEnquadre(enquadreInicial(medida));
  }

  function mudarZoom(zoom: number, ponto = CENTRO) {
    if (!natural) return;

    setEnquadre(
      (atual) => atual && aproximar(natural, PROPORCAO, atual, zoom, ponto),
    );
  }

  function mover(dx: number, dy: number) {
    if (!natural) return;

    setEnquadre(
      (atual) =>
        atual && arrastar(natural, PROPORCAO, atual, dx, dy, MOLDURA),
    );
  }

  function aoTecla(evento: ReactKeyboardEvent) {
    const passo = evento.shiftKey ? PASSO_DA_SETA * 5 : PASSO_DA_SETA;
    const zoom = enquadre?.zoom ?? ZOOM_MINIMO;

    const acao: Record<string, () => void> = {
      ArrowLeft: () => mover(-passo, 0),
      ArrowRight: () => mover(passo, 0),
      ArrowUp: () => mover(0, -passo),
      ArrowDown: () => mover(0, passo),
      "+": () => mudarZoom(zoom * PASSO_DA_RODA),
      "=": () => mudarZoom(zoom * PASSO_DA_RODA),
      "-": () => mudarZoom(zoom / PASSO_DA_RODA),
    };

    const fazer = acao[evento.key];
    if (!fazer) return;

    evento.preventDefault();
    fazer();
  }

  const regiao =
    natural && enquadre ? regiaoDoEnquadre(natural, PROPORCAO, enquadre) : null;
  const escala = regiao ? MOLDURA / regiao.largura : 0;

  async function aplicar() {
    const no = imagem.current;
    if (!no || !regiao) return;

    setGravando(true);

    try {
      onResponder(await pintar(no, regiao, formato));
    } catch (causa) {
      toast.error(
        causa instanceof Error ? causa.message : t.recorte.naoDeuParaRecortar,
      );
      setGravando(false);
    }
  }

  const nome = titulo.toLowerCase();

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !gravando) onResponder(null);
      }}
    >
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t.recorte.titulo(nome)}</DialogTitle>
          <DialogDescription>{t.recorte.explicacao}</DialogDescription>
        </DialogHeader>

        <div
          ref={palco}
          tabIndex={0}
          aria-label={t.recorte.enquadramento(nome)}
          className={cn(
            "focus-visible:ring-ring relative mx-auto touch-none overflow-hidden rounded-md bg-neutral-900 select-none focus-visible:ring-2 focus-visible:outline-none",
            regiao && "cursor-grab active:cursor-grabbing",
          )}
          style={{
            width: MOLDURA + MARGEM * 2,
            height: ALTURA_DA_MOLDURA + MARGEM * 2,
          }}
          onKeyDown={aoTecla}
          onPointerDown={(evento) => {
            if (evento.button !== 0 || !regiao) return;

            evento.currentTarget.setPointerCapture(evento.pointerId);
            arrasto.current = {
              id: evento.pointerId,
              x: evento.clientX,
              y: evento.clientY,
            };
          }}
          onPointerMove={(evento) => {
            const antes = arrasto.current;
            if (!antes || antes.id !== evento.pointerId) return;

            arrasto.current = { ...antes, x: evento.clientX, y: evento.clientY };
            mover(evento.clientX - antes.x, evento.clientY - antes.y);
          }}
          onPointerUp={() => {
            arrasto.current = null;
          }}
          onPointerCancel={() => {
            arrasto.current = null;
          }}
        >
          {fonte ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={(no) => {
                imagem.current = no;
                if (no?.complete) medir(no);
              }}
              src={fonte}
              alt=""
              draggable={false}
              onLoad={(evento) => medir(evento.currentTarget)}
              onError={() => setFalhou(true)}
              // `max-w-none`: o reset do Tailwind prende `img` à largura do
              // pai, e a imagem aqui é de propósito maior que o palco.
              className={cn(
                "pointer-events-none absolute max-w-none select-none",
                !regiao && "invisible",
              )}
              style={
                regiao && natural
                  ? {
                      left: MARGEM - regiao.x * escala,
                      top: MARGEM - regiao.y * escala,
                      width: natural.largura * escala,
                      height: natural.altura * escala,
                    }
                  : undefined
              }
            />
          ) : null}

          {/* O furo no escuro. A sombra gigante escurece tudo fora da moldura e
              segue o `border-radius` -- é o que faz o círculo virar furo
              redondo sem máscara nem SVG. */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute ring-1 ring-white/80",
              formato === "circulo" && "rounded-full",
            )}
            style={{
              left: MARGEM,
              top: MARGEM,
              width: MOLDURA,
              height: ALTURA_DA_MOLDURA,
              boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.6)",
            }}
          />

          {falhou ? (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-white/80">
              {t.recorte.naoAbriu}
            </p>
          ) : !regiao ? (
            <Loader2
              aria-hidden
              className="absolute inset-0 m-auto size-5 animate-spin text-white/70"
            />
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.recorte.afastar}
            disabled={!regiao}
            onClick={() => mudarZoom((enquadre?.zoom ?? 1) / PASSO_DO_BOTAO)}
          >
            <ZoomOut />
          </Button>
          <Slider
            aria-label={t.recorte.zoom}
            value={[enquadre?.zoom ?? ZOOM_MINIMO]}
            min={ZOOM_MINIMO}
            max={ZOOM_MAXIMO}
            step={0.01}
            disabled={!regiao}
            onValueChange={(valor) => {
              const zoom = Array.isArray(valor) ? valor[0] : valor;
              if (zoom !== undefined) mudarZoom(zoom);
            }}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.recorte.aproximar}
            disabled={!regiao}
            onClick={() => mudarZoom((enquadre?.zoom ?? 1) * PASSO_DO_BOTAO)}
          >
            <ZoomIn />
          </Button>
        </div>

        <div role="group" aria-label={t.recorte.formato} className="flex gap-1">
          <Button
            variant={formato === "quadrado" ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={formato === "quadrado"}
            onClick={() => setFormato("quadrado")}
          >
            <Square /> {t.recorte.quadrado}
          </Button>
          <Button
            variant={formato === "circulo" ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={formato === "circulo"}
            onClick={() => setFormato("circulo")}
          >
            <Circle /> {t.recorte.circulo}
          </Button>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={gravando}
            onClick={() => onResponder(null)}
          >
            {comum.cancelar}
          </Button>
          {/* A saída para a figura de corpo inteiro e para o recorte que já
              veio pronto: o arquivo entra como era antes deste editor. */}
          <Button
            variant="outline"
            disabled={gravando}
            onClick={() => onResponder("inteira")}
          >
            {t.recorte.usarInteira}
          </Button>
          <Button disabled={!regiao || gravando} onClick={() => void aplicar()}>
            {gravando ? <Loader2 className="animate-spin" /> : null}
            {t.recorte.aplicar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Desenha a região num canvas e devolve o PNG.
 *
 * PNG sempre, e não JPEG nem WebP: o círculo precisa dos cantos transparentes,
 * a figura recortada que já veio com fundo transparente precisa manter o dela,
 * e o WebKitGTK não codifica WebP no `toBlob` -- pedir WebP devolveria PNG de
 * qualquer jeito.
 */
async function pintar(
  imagem: HTMLImageElement,
  regiao: Regiao,
  formato: FormatoDoRecorte,
): Promise<Uint8Array> {
  const saida = tamanhoDaSaida(regiao);
  const canvas = document.createElement("canvas");
  canvas.width = saida.largura;
  canvas.height = saida.altura;

  const contexto = canvas.getContext("2d");
  if (!contexto) throw new Error(t.recorte.naoDeuDesenhar);

  contexto.imageSmoothingQuality = "high";

  if (formato === "circulo") {
    const raioX = saida.largura / 2;
    const raioY = saida.altura / 2;
    contexto.beginPath();
    contexto.ellipse(raioX, raioY, raioX, raioY, 0, 0, Math.PI * 2);
    contexto.clip();
  }

  contexto.drawImage(
    imagem,
    regiao.x,
    regiao.y,
    regiao.largura,
    regiao.altura,
    0,
    0,
    saida.largura,
    saida.altura,
  );

  const blob = await new Promise<Blob | null>((resolver) =>
    canvas.toBlob(resolver, "image/png"),
  );
  if (!blob) throw new Error(t.recorte.naoDeuGerar);

  return new Uint8Array(await blob.arrayBuffer());
}
