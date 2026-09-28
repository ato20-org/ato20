"use client";

import {
  Fragment,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Eye,
  EyeOff,
  LayoutGrid,
  Minus,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";

import { CorEForma } from "@/components/mestre/cor-e-forma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  fracaoDoMedidor,
  pontosDoMedidor,
  textoDoMedidor,
} from "@/lib/medidor";
import { cn } from "@/lib/utils";
import type { Medidor, PatchMedidor } from "@/types/character";

/**
 * Esconder e apagar só aparecem sob o cursor, ou no foco do teclado.
 *
 * São os gestos raros da linha, e visíveis o tempo todo eles disputavam a
 * largura com o nome. O olho riscado é a exceção: esconder é um ESTADO, e um
 * medidor escondido que parecesse igual aos outros mentiria sobre a mesa.
 */
const SO_SOB_O_CURSOR =
  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100";

/** O que a linha troca sozinha. Os números são de quem a usa, por `valores`. */
export type PatchDaLinha = Pick<
  PatchMedidor,
  "nome" | "cor" | "estilo" | "escondido"
>;

/** Um título e uma linha, para os tooltips que mudam de tela para tela. */
type Dica = { titulo: string; texto: string };

/**
 * Um medidor numa linha: a alça, o nome com o lápis e a estrela, os números à
 * direita, e a forma embaixo, na largura toda.
 *
 * Uma só para a ficha do personagem e para a configuração da campanha, pela
 * mesma razão do `CorEForma`: as duas telas mostram o mesmo medidor, e duas
 * cópias da linha divergiriam no primeiro ajuste. O que muda entre elas entra
 * por fora -- os números, porque o modelo só tem máximo e o personagem tem o
 * atual e os passos de um, e o texto do olho, porque esconder quer dizer uma
 * coisa em cada tela.
 *
 * O nome é TEXTO e vira campo no lápis. A lista se lê como os medidores que a
 * mesa terá, e não como um formulário de caixas abertas.
 */
export function LinhaDeMedidor({
  medidor,
  ocupado = false,
  dropTarget,
  onReorderStart,
  onEditar,
  onApagar,
  dicaDoOlho,
  valores,
  arrasto,
}: {
  /** O modelo da campanha entra cheio: `{ ...modelo, atual: modelo.maximo }`. */
  medidor: Medidor;
  ocupado?: boolean;
  dropTarget: boolean;
  onReorderStart: (event: ReactPointerEvent) => void;
  onEditar: (patch: PatchDaLinha) => void;
  onApagar: () => void;
  dicaDoOlho: Dica;
  valores: ReactNode;
  /** Presente, a forma vira controle do atual. Ver `useArrastoDoAtual`. */
  arrasto?: ArrastoDoAtual;
}) {
  return (
    <li
      className={cn(
        "group flex items-center gap-2 rounded-md p-1",
        dropTarget && "ring-primary ring-1",
      )}
    >
      {/* A alça, e não a linha toda: a linha tem quatro botões e um campo, e
          arrastar de qualquer ponto dela disputaria o gesto com cada um. */}
      <span
        className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none p-0.5"
        aria-hidden
        onPointerDown={onReorderStart}
      >
        <LayoutGrid className="size-4" />
      </span>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex h-6 items-center gap-0.5">
          <NomeDoMedidor
            nome={medidor.nome}
            ocupado={ocupado}
            onGravar={(nome) => onEditar({ nome })}
          />

          <CorEForma
            cor={medidor.cor}
            estilo={medidor.estilo}
            onCor={(cor) => onEditar({ cor })}
            onEstilo={(estilo) => onEditar({ estilo })}
            gatilho={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Cor e forma"
                disabled={ocupado}
              >
                <Star className="size-3.5" />
              </Button>
            }
          />

          <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={
                      medidor.escondido
                        ? "Mostrar para a mesa"
                        : "Esconder da mesa"
                    }
                    aria-pressed={medidor.escondido}
                    disabled={ocupado}
                    className={cn(!medidor.escondido && SO_SOB_O_CURSOR)}
                    onClick={() => onEditar({ escondido: !medidor.escondido })}
                  >
                    {medidor.escondido ? <EyeOff /> : <Eye />}
                  </Button>
                }
              />
              <TooltipContent>
                <p className="font-medium">{dicaDoOlho.titulo}</p>
                <p className="text-muted-foreground max-w-48">
                  {dicaDoOlho.texto}
                </p>
              </TooltipContent>
            </Tooltip>

            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Apagar medidor"
              disabled={ocupado}
              className={cn(
                "text-muted-foreground hover:text-destructive",
                SO_SOB_O_CURSOR,
              )}
              onClick={onApagar}
            >
              <Trash2 />
            </Button>

            {valores}
          </div>
        </div>

        <FormaDoMedidor medidor={medidor} arrasto={arrasto} />
      </div>
    </li>
  );
}

/**
 * Enter grava e Escape desiste, os dois saindo do campo.
 *
 * O Escape MARCA, e o `blur` que ele provoca lê a marca. Zerar o rascunho não
 * bastava: o `blur()` dispara o `onBlur` na hora, ainda com o rascunho desta
 * renderização, e o Escape gravava o que devia desfazer.
 */
function aoTeclar(
  evento: KeyboardEvent<HTMLInputElement>,
  descartar: RefObject<boolean>,
) {
  if (evento.key === "Escape") descartar.current = true;
  if (evento.key === "Enter" || evento.key === "Escape")
    evento.currentTarget.blur();
}

/** Lê o rascunho no `blur`, ou nada se o Escape pediu para desistir. */
function lerRascunho(
  rascunho: string | null,
  descartar: RefObject<boolean>,
): string | null {
  const lido = descartar.current ? null : rascunho;
  descartar.current = false;
  return lido;
}

/**
 * O nome, e o campo dele atrás do lápis.
 *
 * Rascunho local, e não `useCampoDeNome`: aquele grava no `blur` e é o certo
 * numa lista de escolhas. As duas telas desta linha releem a lista inteira a
 * cada gravação, e o remonte no meio da digitação devolveria o cursor ao fim da
 * palavra. `null` é fora de edição.
 */
export function NomeDoMedidor({
  nome,
  ocupado,
  onGravar,
  rotulos = { campo: "Nome do medidor", lapis: "Renomear medidor" },
}: {
  nome: string;
  ocupado: boolean;
  onGravar: (nome: string) => void;
  /** O que o leitor de tela ouve. A linha da condição usa o mesmo campo. */
  rotulos?: { campo: string; lapis: string };
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const descartar = useRef(false);

  function gravar() {
    const valor = lerRascunho(rascunho, descartar);
    setRascunho(null);
    if (valor === null) return;

    const limpo = valor.trim();
    if (!limpo || limpo === nome) return;

    onGravar(limpo);
  }

  if (rascunho !== null) {
    return (
      <Input
        autoFocus
        aria-label={rotulos.campo}
        value={rascunho}
        className="h-6 min-w-0 flex-1 px-1.5 text-sm"
        onFocus={(evento) => evento.currentTarget.select()}
        onChange={(evento) => setRascunho(evento.target.value)}
        onBlur={gravar}
        onKeyDown={(evento) => aoTeclar(evento, descartar)}
      />
    );
  }

  return (
    <>
      <span className="min-w-0 truncate text-sm font-medium">{nome}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={rotulos.lapis}
        disabled={ocupado}
        onClick={() => setRascunho(nome)}
      >
        <Pencil className="size-3.5" />
      </Button>
    </>
  );
}

/**
 * Os números à direita da linha: um selo que vira campo no clique.
 *
 * `campos` diz quantos números o clique abre -- o máximo, no modelo; o atual e
 * o máximo, no personagem. `passos` põe o menos-um e o mais-um dos dois lados
 * do selo, e eles SOMEM enquanto os campos estão abertos: apertar o mais com um
 * rascunho no atual gravaria o rascunho e somaria um ao número de antes dele.
 */
export function SeloDoMedidor({
  texto,
  dica,
  campos,
  passos,
  ocupado = false,
}: {
  texto: ReactNode;
  dica: Dica;
  campos: Array<{
    rotulo: string;
    valor: number;
    onGravar: (valor: number) => void;
  }>;
  passos?: {
    onMenos: () => void;
    onMais: () => void;
    podeMenos: boolean;
    podeMais: boolean;
  };
  ocupado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);

  if (aberto) {
    return (
      <div
        className="flex items-center gap-0.5"
        // Fecha quando o foco sai do SELO, e não de um campo: o Tab do atual
        // para o máximo é um gesto só, e fechar no meio dele perderia o segundo.
        onBlur={(evento) => {
          if (
            !evento.currentTarget.contains(evento.relatedTarget as Node | null)
          )
            setAberto(false);
        }}
      >
        {campos.map((campo, indice) => (
          <Fragment key={campo.rotulo}>
            {indice > 0 ? (
              <span className="text-muted-foreground text-xs">/</span>
            ) : null}
            <CampoDoSelo {...campo} autoFocus={indice === 0} />
          </Fragment>
        ))}
      </div>
    );
  }

  return (
    <>
      {passos ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Menos um"
          disabled={ocupado || !passos.podeMenos}
          onClick={passos.onMenos}
        >
          <Minus />
        </Button>
      ) : null}

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="secondary"
              size="xs"
              aria-label={dica.titulo}
              disabled={ocupado}
              className="min-w-6 px-1.5 text-sm tabular-nums"
              onClick={() => setAberto(true)}
            >
              {texto}
            </Button>
          }
        />
        <TooltipContent>
          <p className="font-medium">{dica.titulo}</p>
          <p className="text-muted-foreground max-w-48">{dica.texto}</p>
        </TooltipContent>
      </Tooltip>

      {passos ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Mais um"
          disabled={ocupado || !passos.podeMais}
          onClick={passos.onMais}
        >
          <Plus />
        </Button>
      ) : null}
    </>
  );
}

/**
 * Um número que grava ao sair do campo.
 *
 * Rascunho local porque o campo passa por estados que não são número: apagar
 * "20" para digitar "8" passa pelo vazio, e gravar a cada tecla mandaria um
 * zero ao disco no meio da digitação — com o clamp do Rust puxando o `atual`
 * junto, o que some com o valor que estava lá.
 *
 * O que não é número sai sem gravar, como o nome vazio: um campo limpo por
 * engano não é um pedido.
 */
function CampoDoSelo({
  rotulo,
  valor,
  onGravar,
  autoFocus,
}: {
  rotulo: string;
  valor: number;
  onGravar: (valor: number) => void;
  autoFocus: boolean;
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const descartar = useRef(false);

  function gravar() {
    const lido = lerRascunho(rascunho, descartar);
    setRascunho(null);
    if (lido === null) return;

    const numero = Number.parseInt(lido, 10);
    if (Number.isNaN(numero) || numero === valor) return;

    onGravar(numero);
  }

  return (
    <Input
      autoFocus={autoFocus}
      aria-label={rotulo}
      inputMode="numeric"
      value={rascunho ?? String(valor)}
      className="h-6 w-12 px-1 text-center text-sm tabular-nums"
      onFocus={(evento) => evento.currentTarget.select()}
      onChange={(evento) => setRascunho(evento.target.value)}
      onBlur={gravar}
      onKeyDown={(evento) => aoTeclar(evento, descartar)}
    />
  );
}

/** O que a forma chama quando o mestre a arrasta. Ver `useArrastoDoAtual`. */
export type ArrastoDoAtual = {
  /** O ponteiro andou: só desenha, sem gravar. */
  onMover: (atual: number) => void;
  /** O ponteiro soltou, ou uma tecla deu o passo: grava. */
  onSoltar: (atual: number) => void;
  /** O gesto foi interrompido pelo sistema: volta ao que estava. */
  onCancelar: () => void;
};

/**
 * O valor atual enquanto o mestre arrasta a forma, antes de o disco responder.
 *
 * Grava UMA vez, no soltar, e não a cada quadro: arrastar a vida de vinte para
 * três passaria por dezessete escritas no índice de personagens, cada uma
 * relendo a ficha e publicando a mesa. No meio do gesto, o `mostrado` é o que a
 * forma e o selo desenham.
 *
 * O rascunho é preso ao `medidor` de onde saiu. Quando a ficha relida chega,
 * o objeto é outro e o rascunho perde a validade sozinho, sem efeito para
 * limpar -- e sem o quadro em que a barra voltaria ao valor antigo entre o
 * soltar e a volta do IPC. `gravar` devolve se deu certo: se não deu, o
 * rascunho sai na hora, e a barra não fica mentindo sobre um valor que o disco
 * recusou.
 */
export function useArrastoDoAtual(
  medidor: Medidor,
  gravar: (atual: number) => Promise<boolean>,
): { mostrado: Medidor; arrasto: ArrastoDoAtual } {
  const [rascunho, setRascunho] = useState<{
    de: Medidor;
    atual: number;
    /** Já mandou um valor ao disco que a ficha relida ainda não trouxe. */
    pendente: boolean;
  } | null>(null);

  const valendo = rascunho?.de === medidor ? rascunho : null;
  const mostrado = valendo ? { ...medidor, atual: valendo.atual } : medidor;

  return {
    mostrado,
    arrasto: {
      onMover: (atual) =>
        setRascunho({ de: medidor, atual, pendente: !!valendo?.pendente }),
      onSoltar: (atual) => {
        // Soltou onde estava, sem nada a caminho: foi um toque, não um pedido.
        // Com algo a caminho grava mesmo assim -- um passo dado antes pode
        // estar indo para o disco, e é este que tem de chegar por último.
        if (!valendo?.pendente && atual === medidor.atual) {
          setRascunho(null);
          return;
        }

        setRascunho({ de: medidor, atual, pendente: true });
        void gravar(atual).then((gravou) => {
          if (!gravou) setRascunho(null);
        });
      },
      onCancelar: () => setRascunho(null),
    },
  };
}

/**
 * A forma do medidor, na largura da linha, cheia até o `atual`.
 *
 * Desenho próprio, e não `DesenhoDoMedidor`: aquele responde "como a mesa vê",
 * e as prévias que o usavam saíram destas telas. Aqui a forma é o corpo da
 * linha, e o número já está no selo à direita. Por isso a porcentagem vira
 * barra -- o `DesenhoDoMedidor` a desenha como o próprio número, e ele
 * apareceria duas vezes na mesma linha.
 *
 * O vazio é o mesmo buraco escuro da mesa, e não uma forma que encolhe: a
 * fileira de pontos que perdesse um a cada golpe tiraria do olho a referência
 * de quantos eram no começo. Ver `Pontos` em `DesenhoDoMedidor`.
 *
 * ## Arrastar
 *
 * Com `arrasto`, clicar põe o atual onde o ponteiro está, e arrastar o leva
 * junto -- é como se diz "ficou com uns três" sem contar os cliques no menos.
 * Um `slider` de verdade para o teclado: as setas dão o passo de um, Home zera
 * e End enche.
 */
function FormaDoMedidor({
  medidor,
  arrasto,
}: {
  medidor: Medidor;
  arrasto?: ArrastoDoAtual;
}) {
  const formaRef = useRef<HTMLDivElement>(null);
  /** Só para desligar a transição da barra: com ela, o preenchimento vinha
   *  trezentos milissegundos atrás do dedo. */
  const [segurando, setSegurando] = useState(false);

  const maximo = Math.max(1, Math.trunc(medidor.maximo));
  const pontos = medidor.estilo === "pontos" ? pontosDoMedidor(medidor) : null;

  /** O atual que o ponteiro pede, pela posição dele na forma. */
  function atualEm(clientX: number): number {
    const forma = formaRef.current;
    if (!forma) return medidor.atual;

    // Nos pontos, quantas bolinhas começam antes do ponteiro: tocar numa a
    // enche, e as de antes dela. Zerar é arrastar para a esquerda da primeira.
    if (pontos) {
      return [...forma.children].filter(
        (bolinha) => bolinha.getBoundingClientRect().left < clientX,
      ).length;
    }

    const caixa = forma.getBoundingClientRect();
    const fracao = caixa.width > 0 ? (clientX - caixa.left) / caixa.width : 0;

    return Math.round(Math.min(1, Math.max(0, fracao)) * maximo);
  }

  /**
   * A alça só aparece sob o cursor, no foco do teclado e durante o arrasto.
   *
   * Parada o tempo todo, ela seria um enfeite a mais em cada linha da ficha, e
   * a forma deixaria de se parecer com o que a mesa vê. É no hover que o mestre
   * pergunta "isto mexe?", e é ali que a resposta tem de estar.
   */
  const alca = cn(
    "opacity-0 group-hover/forma:opacity-100 group-focus-visible/forma:opacity-100",
    segurando && "opacity-100",
  );

  const desenho = pontos ? (
    // As bolinhas encolhem para caber numa linha só, como no desenho da
    // mesa, e param de crescer na altura da barra. O `p-0.5 -m-0.5` abre
    // espaço para o anel da alça sem o `overflow-hidden` cortá-lo, e sem
    // mudar onde a fileira fica.
    <div
      ref={formaRef}
      className="-m-0.5 flex items-center gap-1 overflow-hidden p-0.5"
    >
      {Array.from({ length: pontos.total }, (_, indice) => (
        <span
          key={indice}
          className={cn(
            "aspect-square max-w-4 min-w-0 flex-1 rounded-full",
            // Nos pontos a alça é a última bolinha cheia -- a que o dedo
            // puxa --, ou a primeira quando não há nenhuma.
            arrasto &&
              indice === Math.max(0, pontos.cheios - 1) &&
              cn(
                "ring-white group-hover/forma:ring-2 group-focus-visible/forma:ring-2",
                segurando && "ring-2",
              ),
          )}
          style={{
            backgroundColor:
              indice < pontos.cheios ? medidor.cor : "rgba(0,0,0,0.45)",
          }}
        />
      ))}
    </div>
  ) : (
    <div className="relative">
      <div
        ref={formaRef}
        className="h-4 overflow-hidden rounded-full bg-black/45"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none",
            segurando && "transition-none",
          )}
          style={{
            width: `${fracaoDoMedidor(medidor) * 100}%`,
            backgroundColor: medidor.cor,
          }}
        />
      </div>

      {/* Fora da trilha, e não dentro: ela é mais alta que a barra, e o
          `overflow-hidden` que arredonda o preenchimento a cortaria. Anda
          dentro da trilha, como a de um `input range`, para não sair da
          linha nas pontas. */}
      {arrasto ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 size-5 -translate-y-1/2 rounded-full border-2 bg-white shadow-md",
            "transition-[left,opacity] duration-300 ease-out motion-reduce:transition-none",
            segurando && "transition-opacity",
            alca,
          )}
          style={{
            left: `calc(${fracaoDoMedidor(medidor)} * (100% - 1.25rem))`,
            borderColor: medidor.cor,
          }}
        />
      ) : null}
    </div>
  );

  if (!arrasto) return <div aria-hidden>{desenho}</div>;

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={medidor.nome}
      aria-valuemin={0}
      aria-valuemax={maximo}
      aria-valuenow={medidor.atual}
      aria-valuetext={textoDoMedidor(medidor)}
      // A folga em cima e embaixo aumenta o alvo sem mexer no desenho: uma
      // barra de dezesseis pixels é fina para acertar no meio de uma cena.
      className="group/forma focus-visible:ring-ring -my-1 cursor-ew-resize touch-none rounded-full py-1 outline-none focus-visible:ring-2"
      onPointerDown={(evento) => {
        if (evento.button !== 0) return;
        evento.currentTarget.setPointerCapture(evento.pointerId);
        setSegurando(true);
        arrasto.onMover(atualEm(evento.clientX));
      }}
      onPointerMove={(evento) => {
        if (!evento.currentTarget.hasPointerCapture(evento.pointerId)) return;
        const atual = atualEm(evento.clientX);
        if (atual !== medidor.atual) arrasto.onMover(atual);
      }}
      onPointerUp={(evento) => {
        if (!evento.currentTarget.hasPointerCapture(evento.pointerId)) return;
        evento.currentTarget.releasePointerCapture(evento.pointerId);
        setSegurando(false);
        arrasto.onSoltar(atualEm(evento.clientX));
      }}
      onPointerCancel={() => {
        setSegurando(false);
        arrasto.onCancelar();
      }}
      onKeyDown={(evento) => {
        const alvo =
          evento.key === "ArrowRight" || evento.key === "ArrowUp"
            ? medidor.atual + 1
            : evento.key === "ArrowLeft" || evento.key === "ArrowDown"
              ? medidor.atual - 1
              : evento.key === "Home"
                ? 0
                : evento.key === "End"
                  ? maximo
                  : null;
        if (alvo === null) return;

        evento.preventDefault();
        arrasto.onSoltar(Math.min(maximo, Math.max(0, alvo)));
      }}
    >
      {desenho}
    </div>
  );
}
