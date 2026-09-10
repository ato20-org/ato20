"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Loader2,
  PictureInPicture2,
  ScanSearch,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { BuscaLivro } from "@/components/operator/leitor/busca-livro";
import { MarcadoresLivro } from "@/components/operator/leitor/marcadores-livro";
import { PaginaFolha } from "@/components/operator/leitor/pagina-folha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useFecharJanela } from "@/hooks/use-fechar-janela";
import { useLivro } from "@/hooks/use-estante";
import { useLivroDoc } from "@/hooks/use-livro-doc";
import { useRolagemDoLivro } from "@/hooks/use-rolagem-do-livro";
import { useLeitorStore } from "@/lib/store/use-leitor-store";
import { chaveDe } from "@/lib/store/use-window-store";
import { createTrailingThrottle } from "@/lib/sync/throttle";
import { marcarPagina } from "@/lib/vault/estante";

/**
 * Os degraus do zoom.
 *
 * Uma escada e não um passo contínuo: o gesto é de teclado e botão, não de
 * pinça, e o que o mestre quer é um passo previsível — 100% é a página em
 * tamanho natural, e 200% é a tabela pequena que ele precisa ler em voz alta.
 */
const DEGRAUS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

/**
 * Quanto se espera antes de gravar a página no banco.
 *
 * Rolar meio capítulo é um gesto só, e gravar cada página que cruza o meio da
 * tela seriam dezenas de escritas para uma informação que só interessa na
 * última. O `throttle` de cauda nunca perde o último valor — ver
 * `createTrailingThrottle` —, então a página onde o mestre parou chega mesmo que
 * ele feche o leitor logo depois.
 */
const GRAVAR_MS = 1_200;

/**
 * O quanto a lupa amplia, e os limites da roda.
 *
 * Começa em 3×, que é o que torna legível a nota de rodapé e a linha de tabela
 * de manual sem tirar o contexto ao redor. O teto de 8× é onde o recorte deixa
 * de ter texto suficiente para se saber de que trecho ele é.
 */
const AMPLIACAO_PADRAO = 3;
const AMPLIACAO_MIN = 2;
const AMPLIACAO_MAX = 8;

/**
 * O leitor de Regras: um livro da estante, aberto.
 *
 * Rolagem contínua, e não uma página por vez: consulta de mesa é tanto "abre na
 * 214" quanto "desce lendo até achar" — a regra que interessa costuma
 * atravessar a virada. As folhas existem todas no DOM como caixas com altura
 * reservada, e só as que entram em vista são pedidas ao worker e desenhadas; as
 * que ficam por perto continuam desenhadas, que é o cache. Ver
 * `useRolagemDoLivro` e `PaginaFolha`.
 *
 * O mesmo corpo serve as duas molduras — a janela (flutuante ou atracada) e o
 * split que divide a linha com o palco. Ele não sabe em qual está; o que sabe é
 * se ESTE livro é o que está no split, e é isso que decide qual dos dois botões
 * de mover aparece.
 */
export function LeitorLivro({ livroId }: { livroId: string }) {
  const livro = useLivro(livroId);
  const documento = useLivroDoc(livroId);

  const noSplit = useLeitorStore((state) => state.livroId === livroId);
  const abrirNoSplit = useLeitorStore((state) => state.abrirNoSplit);
  const fecharSplit = useLeitorStore((state) => state.fecharSplit);

  const abrirJanela = useAbrirJanela();
  const fecharJanela = useFecharJanela();

  const [zoom, setZoom] = useState<number | "largura">("largura");
  const [lateral, setLateral] = useState<"marcadores" | "busca" | null>(null);

  /**
   * A ferramenta de lupa, armada ou não, e o quanto ela amplia.
   *
   * Ferramenta e não gesto sempre ativo: pressionar a página é o que o mestre
   * faz para nada acontecer — e uma lente saltando a cada toque no livro seria
   * um estorvo. A ampliação vive aqui, e não na folha, para a roda regular a
   * lupa uma vez e valer para todas as páginas do livro.
   */
  const [lupa, setLupa] = useState(false);
  const [ampliacao, setAmpliacao] = useState(AMPLIACAO_PADRAO);

  const aoAmpliar = useCallback((delta: number) => {
    setAmpliacao((anterior) =>
      Math.min(Math.max(anterior + delta, AMPLIACAO_MIN), AMPLIACAO_MAX),
    );
  }, []);

  /**
   * A primeira página em tamanho natural: largura em pontos e proporção.
   *
   * Serve a duas coisas — o zoom numérico, que multiplica a largura natural, e a
   * altura reservada das folhas que ainda não desenharam. Uma página basta
   * porque manual tem todas do mesmo tamanho; a folha corrige a sua quando
   * desenha. Ver `PaginaFolha`.
   */
  const [natural, setNatural] = useState<{
    largura: number;
    razao: number;
  } | null>(null);

  const paginas = documento.estado === "aberto" ? documento.paginas : 0;
  const { caixa, registrar, atual, mantidas, irPara } =
    useRolagemDoLivro(paginas);

  /** A largura útil da caixa que rola, medida — quem manda nela é o divisor. */
  const [disponivel, setDisponivel] = useState(0);

  useEffect(() => {
    if (documento.estado !== "aberto") return;

    let ativo = true;

    void documento.doc.getPage(1).then(
      (page) => {
        if (!ativo) return;

        const viewport = page.getViewport({ scale: 1 });
        setNatural({
          largura: viewport.width,
          razao: viewport.height / viewport.width,
        });
      },
      () => {
        // Sem a medida da primeira página não há altura para reservar. A folha
        // A4 em retrato é o palpite menos errado, e cada página conserta a sua
        // ao desenhar.
        if (ativo) setNatural({ largura: 595, razao: 297 / 210 });
      },
    );

    return () => {
      ativo = false;
    };
  }, [documento]);

  useEffect(() => {
    const alvo = caixa.current;
    if (!alvo) return;

    const observador = new ResizeObserver(([entrada]) => {
      // Arredondado: o navegador reporta fração de pixel em tela com escala, e
      // um redesenho por micrômetro de diferença seria um redesenho por quadro
      // de qualquer animação de layout.
      setDisponivel(Math.round(entrada?.contentRect.width ?? 0));
    });

    observador.observe(alvo);

    return () => observador.disconnect();
  }, [caixa]);

  const largura = natural
    ? zoom === "largura"
      ? disponivel
      : Math.round(natural.largura * zoom)
    : 0;

  /** A página lembrada só é aplicada UMA vez: depois disso quem manda é o mestre. */
  const retomou = useRef(false);

  useEffect(() => {
    // Espera as folhas existirem com altura reservada: saltar antes disso rola
    // uma caixa que ainda não tem para onde rolar.
    if (retomou.current || !livro || !natural || largura <= 0 || paginas <= 0)
      return;

    retomou.current = true;

    // Limitado ao documento: a página gravada pode ser maior que o total se o
    // arquivo foi trocado por uma edição menor com o mesmo nome.
    irPara(Math.min(Math.max(livro.pagina, 1), paginas));
  }, [livro, natural, largura, paginas, irPara]);

  /**
   * Se o total de páginas já foi enviado nesta abertura.
   *
   * O Rust usa `coalesce`, então mandar o total em cada virada só repetiria a
   * mesma escrita — ver `livro_pagina`. Quem conta as páginas é o leitor: o Rust
   * copia o arquivo sem abri-lo.
   */
  const mandouTotal = useRef(false);
  const gravador = useRef<ReturnType<
    typeof createTrailingThrottle<{ pagina: number; paginas?: number }>
  > | null>(null);

  useEffect(() => {
    const throttle = createTrailingThrottle<{
      pagina: number;
      paginas?: number;
    }>(GRAVAR_MS, ({ pagina, paginas: total }) => {
      // Falha aqui não vira aviso na tela: perder a página lembrada custa uma
      // rolagem na próxima abertura, e um toast no meio da leitura custa a
      // atenção do mestre numa sessão em andamento.
      void marcarPagina(livroId, pagina, total).catch(() => {});
    });

    gravador.current = throttle;

    return () => {
      // Descarrega o pendente ao sair: fechar o leitor logo depois de rolar é
      // exatamente quando o último valor importa.
      throttle.flush();
      throttle.cancel();
      gravador.current = null;
      mandouTotal.current = false;
      retomou.current = false;
    };
  }, [livroId]);

  useEffect(() => {
    // Só depois de retomar: sem isso a página 1 seria gravada por cima da
    // lembrada no instante em que o livro abre.
    if (!retomou.current || paginas <= 0) return;

    const total = mandouTotal.current ? undefined : paginas;
    mandouTotal.current = true;

    gravador.current?.run({ pagina: atual, paginas: total });
  }, [atual, paginas]);

  const ir = useCallback(
    (destino: number) => {
      if (paginas <= 0) return;

      irPara(Math.min(Math.max(Math.round(destino), 1), paginas));
    },
    [irPara, paginas],
  );

  /** O degrau seguinte, para cima ou para baixo. `"largura"` entra como 1. */
  function degrau(direcao: 1 | -1) {
    const atualZoom = zoom === "largura" ? 1 : zoom;
    const indice = DEGRAUS.findIndex((valor) => valor >= atualZoom);
    const proximo =
      DEGRAUS[Math.min(Math.max(indice + direcao, 0), DEGRAUS.length - 1)];

    setZoom(proximo ?? 1);
  }

  if (documento.estado === "falhou") {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-4">
        <p className="text-destructive max-w-sm text-center text-sm">
          {documento.motivo}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* A barra envolve em tela estreita, e não rola: o leitor no split de uma
          janela pequena mostraria metade dos controles com rolagem horizontal, e
          o alvo que falta é sempre o que se procura. */}
      <div className="flex flex-wrap items-center gap-1 border-b p-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Página anterior"
          disabled={atual <= 1}
          onClick={() => ir(atual - 1)}
        >
          <ChevronLeft />
        </Button>

        <form
          className="flex items-center gap-1"
          onSubmit={(evento) => {
            evento.preventDefault();
            const campo = new FormData(evento.currentTarget).get("pagina");
            const pedida = Number(campo);

            if (Number.isFinite(pedida)) ir(pedida);
          }}
        >
          {/* `key` na página: o campo é controlado pelo salto e reescrito por
              quem digita, e sem a chave a digitação seria sobrescrita a cada
              página que a rolagem cruza. */}
          <Input
            key={atual}
            name="pagina"
            defaultValue={atual}
            inputMode="numeric"
            aria-label="Ir para a página"
            className="h-7 w-14 text-center text-xs tabular-nums"
          />
          <span className="text-muted-foreground text-xs tabular-nums">
            de {paginas > 0 ? paginas : "…"}
          </span>
        </form>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Próxima página"
          disabled={paginas <= 0 || atual >= paginas}
          onClick={() => ir(atual + 1)}
        >
          <ChevronRight />
        </Button>

        <span className="bg-border mx-1 h-5 w-px" />

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Diminuir o zoom"
          onClick={() => degrau(-1)}
        >
          <ZoomOut />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Ajustar à largura"
          onClick={() => setZoom("largura")}
        >
          {zoom === "largura" ? "Largura" : `${Math.round(zoom * 100)}%`}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Aumentar o zoom"
          onClick={() => degrau(1)}
        >
          <ZoomIn />
        </Button>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={lupa ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label="Lupa"
                aria-pressed={lupa}
                onClick={() => setLupa((armada) => !armada)}
              >
                <ScanSearch />
              </Button>
            }
          />
          <TooltipContent>
            <p>Lupa: segure sobre a página, roda ajusta ({ampliacao}×)</p>
          </TooltipContent>
        </Tooltip>

        <span className="bg-border mx-1 h-5 w-px" />

        <Button
          variant={lateral === "marcadores" ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label="Marcadores"
          aria-pressed={lateral === "marcadores"}
          onClick={() =>
            setLateral(lateral === "marcadores" ? null : "marcadores")
          }
        >
          <Bookmark />
        </Button>
        <Button
          variant={lateral === "busca" ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label="Buscar no livro"
          aria-pressed={lateral === "busca"}
          onClick={() => setLateral(lateral === "busca" ? null : "busca")}
        >
          <Search />
        </Button>

        {/* Empurra os botões de mover para a ponta: eles não são controle de
            leitura, são de onde o livro fica na bancada. */}
        <span className="flex-1" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={
                  noSplit ? "Soltar como janela" : "Abrir ao lado do palco"
                }
                onClick={() => {
                  if (noSplit) {
                    fecharSplit();
                    abrirJanela({
                      tipo: "livro",
                      livroId,
                      titulo: livro?.titulo ?? "Livro",
                    });
                    return;
                  }

                  // A janela sai de cena ao ir para o split: o mesmo livro nas
                  // duas casas seriam dois leitores do mesmo PDF, cada um com
                  // sua página, gravando por cima do outro.
                  fecharJanela(chaveDe({ tipo: "livro", livroId, titulo: "" }));
                  abrirNoSplit(livroId);
                }}
              >
                {noSplit ? <PictureInPicture2 /> : <Columns2 />}
              </Button>
            }
          />
          <TooltipContent>
            <p>{noSplit ? "Soltar como janela" : "Abrir ao lado do palco"}</p>
          </TooltipContent>
        </Tooltip>

        {/* Só no split: a janela já tem o X da própria moldura, e um segundo
            fechar dentro do corpo dela seriam dois alvos para o mesmo gesto. */}
        {noSplit ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Fechar o leitor"
            onClick={() => fecharSplit()}
          >
            <X />
          </Button>
        ) : null}
      </div>

      {/* Envelope `relative` com o CORPO INTEIRO absoluto dentro — as páginas e
          a tira lateral juntas.
          
          Nenhum dos dois pode ditar a altura, e os dois já tentaram. As folhas
          reservadas do livro somam dezenas de milhares de pixels; a lista de
          ocorrências da busca soma algumas centenas por termo comum. Basta UM
          ancestral de altura automática para esse conteúdo empurrar em vez de
          recortar — e a janela flutuante é exatamente isso, porque ela "cresce
          com o conteúdo até o `max-h`" enquanto ninguém a redimensiona (ver
          `InnerWindow`).
          
          Filho absoluto não contribui para a altura do pai. Envolver a linha, e
          não só as páginas, é o que fecha as duas portas de uma vez.
          
          E o `min-h-64` é o outro lado dessa moeda: contribuindo zero, o leitor
          colapsaria para a altura da barra dentro de uma moldura de altura
          automática. O piso dá uma área de leitura utilizável ali; onde a altura
          é definida, o `flex-1` manda e o piso nunca aparece. */}
      <div className="relative min-h-64 min-w-0 flex-1">
        <div className="absolute inset-0 flex">
          <div
            ref={caixa}
            tabIndex={0}
            className="focus-visible:ring-ring/50 min-h-0 min-w-0 flex-1 space-y-3 overflow-auto p-3 outline-none focus-visible:ring-2"
            onKeyDown={(evento) => {
              const anterior =
                evento.key === "ArrowLeft" || evento.key === "PageUp";
              const proxima =
                evento.key === "ArrowRight" || evento.key === "PageDown";

              if (!anterior && !proxima) return;

              evento.preventDefault();
              evento.stopPropagation();
              ir(atual + (proxima ? 1 : -1));
            }}
          >
            {documento.estado === "aberto" && natural && largura > 0 ? (
              Array.from({ length: paginas }, (_, indice) => indice + 1).map(
                (numero) => (
                  <PaginaFolha
                    key={numero}
                    doc={documento.doc}
                    numero={numero}
                    largura={largura}
                    razaoPadrao={natural.razao}
                    desenhar={mantidas.has(numero)}
                    registrar={registrar(numero)}
                    lupa={lupa}
                    ampliacao={ampliacao}
                    aoAmpliar={aoAmpliar}
                  />
                ),
              )
            ) : (
              <div className="grid h-40 place-items-center">
                <Loader2
                  className="text-muted-foreground size-5 animate-spin"
                  aria-label="Abrindo o livro"
                />
              </div>
            )}
          </div>

          {lateral && documento.estado === "aberto" ? (
            <aside className="flex w-60 min-w-0 shrink-0 flex-col overflow-hidden border-l p-2">
              {lateral === "marcadores" ? (
                <MarcadoresLivro
                  livroId={livroId}
                  paginaAtual={atual}
                  aoEscolher={ir}
                />
              ) : (
                <BuscaLivro
                  doc={documento.doc}
                  paginaAtual={atual}
                  aoEscolher={ir}
                />
              )}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
