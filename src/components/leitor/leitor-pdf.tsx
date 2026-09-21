"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ScanSearch,
  Search,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { BuscaNoPdf } from "@/components/leitor/busca-no-pdf";
import { PaginaFolha } from "@/components/leitor/pagina-folha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PdfDoc } from "@/hooks/use-pdf-doc";
import { useRolagemDoLivro } from "@/hooks/use-rolagem-do-livro";

/**
 * Os degraus do zoom.
 *
 * Uma escada e não um passo contínuo: o gesto é de teclado e botão, não de
 * pinça, e o que se quer é um passo previsível — 100% é a página em tamanho
 * natural, e 200% é a tabela pequena que o mestre precisa ler em voz alta.
 */
const DEGRAUS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

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
 * O leitor de PDF do aplicativo: um documento aberto, com o que se lê nele.
 *
 * Rolagem contínua, e não uma página por vez: consulta de mesa é tanto "abre na
 * 214" quanto "desce lendo até achar" — a regra que interessa costuma
 * atravessar a virada. As folhas existem todas no DOM como caixas com altura
 * reservada, e só as que entram em vista são pedidas ao worker e desenhadas; as
 * que ficam por perto continuam desenhadas, que é o cache. Ver
 * `useRolagemDoLivro` e `PaginaFolha`.
 *
 * Ele não sabe QUE documento está mostrando, e é o que lhe permite ser o leitor
 * do aplicativo em vez de o leitor da estante: um livro tem página lembrada,
 * marcadores da campanha e um lugar na bancada; a ficha em PDF de um personagem
 * não tem nada disso e precisa exatamente do resto — zoom, lupa e busca. O que
 * é do livro entra por `paginaInicial`, `aoMudarPagina`, `marcadores` e
 * `acoes`; sem eles, o leitor abre na primeira página e a barra fica com os
 * controles de leitura. Ver `LeitorLivro` e `PdfBody`.
 *
 * Quem abre o documento é quem chama, porque a fonte dos bytes é a diferença
 * entre os dois casos — ver `usePdfDoc`.
 */
export function LeitorPdf({
  documento,
  paginaInicial,
  aoMudarPagina,
  marcadores,
  acoes,
}: {
  documento: PdfDoc;
  /**
   * Onde abrir.
   *
   * Três valores, e a distinção importa: um número salta para lá, `undefined` é
   * "este documento não lembra página" e abre na primeira, e `null` é "a página
   * lembrada ainda está vindo do banco" — aí o leitor espera, porque saltar
   * depois de o mestre já ter rolado seria tirar a página de baixo dele.
   */
  paginaInicial?: number | null;
  /**
   * A página que está sob os olhos mudou.
   *
   * Estável, por favor: entra na dependência de um efeito, e uma seta nova a
   * cada render chamaria isto em toda passada de render.
   */
  aoMudarPagina?: (pagina: number, paginas: number) => void;
  /** A tira de marcadores. Sem ela, o botão de marcadores não existe. */
  marcadores?: (props: {
    paginaAtual: number;
    aoEscolher: (pagina: number) => void;
  }) => React.ReactNode;
  /** Botões de moldura — onde o documento fica na bancada — na ponta da barra. */
  acoes?: React.ReactNode;
}) {
  const [zoom, setZoom] = useState<number | "largura">("largura");
  const [lateral, setLateral] = useState<"marcadores" | "busca" | null>(null);

  /**
   * A ferramenta de lupa, armada ou não, e o quanto ela amplia.
   *
   * Ferramenta e não gesto sempre ativo: pressionar a página é o que se faz
   * para nada acontecer — e uma lente saltando a cada toque no documento seria
   * um estorvo. A ampliação vive aqui, e não na folha, para a roda regular a
   * lupa uma vez e valer para todas as páginas.
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

  /** A página lembrada só é aplicada UMA vez: depois disso quem manda é quem lê. */
  const retomou = useRef(false);

  useEffect(() => {
    // Espera as folhas existirem com altura reservada: saltar antes disso rola
    // uma caixa que ainda não tem para onde rolar.
    if (retomou.current || !natural || largura <= 0 || paginas <= 0) return;
    // A página lembrada ainda está vindo. Ver a prop.
    if (paginaInicial === null) return;

    retomou.current = true;

    // Limitada ao documento: a página gravada pode ser maior que o total se o
    // arquivo foi trocado por uma edição menor com o mesmo nome.
    if (paginaInicial !== undefined) {
      irPara(Math.min(Math.max(paginaInicial, 1), paginas));
    }
  }, [paginaInicial, natural, largura, paginas, irPara]);

  useEffect(() => {
    // Só depois de retomar: sem isso a página 1 seria anunciada — e gravada por
    // cima da lembrada — no instante em que o documento abre.
    if (!retomou.current || paginas <= 0) return;

    aoMudarPagina?.(atual, paginas);
  }, [atual, paginas, aoMudarPagina]);

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

        {/* Só quem tem onde guardar marcador ganha o botão: numa ficha em PDF
            ele abriria uma tira que não teria como gravar nada. */}
        {marcadores ? (
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
        ) : null}

        <Button
          variant={lateral === "busca" ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label="Buscar no texto"
          aria-pressed={lateral === "busca"}
          onClick={() => setLateral(lateral === "busca" ? null : "busca")}
        >
          <Search />
        </Button>

        {/* Empurra as ações da moldura para a ponta: elas não são controle de
            leitura, são de onde o documento fica na bancada. */}
        {acoes ? (
          <>
            <span className="flex-1" />
            {acoes}
          </>
        ) : null}
      </div>

      {/* Envelope `relative` com o CORPO INTEIRO absoluto dentro — as páginas e
          a tira lateral juntas.
          
          Nenhum dos dois pode ditar a altura, e os dois já tentaram. As folhas
          reservadas de um manual somam dezenas de milhares de pixels; a lista de
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
                    prioridade={Math.abs(numero - atual)}
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
                  aria-label="Abrindo o documento"
                />
              </div>
            )}
          </div>

          {lateral && documento.estado === "aberto" ? (
            <aside className="flex w-60 min-w-0 shrink-0 flex-col overflow-hidden border-l p-2">
              {lateral === "marcadores" && marcadores ? (
                marcadores({ paginaAtual: atual, aoEscolher: ir })
              ) : (
                <BuscaNoPdf
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
