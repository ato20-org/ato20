"use client";

import { createPortal } from "react-dom";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Info, Trash2 } from "lucide-react";

import { ListaDeSugestoes, MARCA_LISTA } from "@/components/mencoes/sugestoes";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  PostitTextoView,
  type Vinculos,
} from "@/components/mestre/postit-texto-view";
import {
  emPixelDeTela,
  useSceneScale,
} from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { useMencoesDoMestre } from "@/hooks/use-mencoes-do-mestre";
import { postitNaArea, postitNoTamanho } from "@/lib/geometry/postit";
import {
  aplicaSugestao,
  fantasmaDe,
  filtraSugestoes,
  type Sugestao,
} from "@/lib/mencoes/sugestao";
import {
  fragmentoDoPostit,
  TITULO_DO_POSTIT,
  type SinalDoPostit,
} from "@/lib/mestre/postit-mencoes";
import { normaliza } from "@/lib/search";
import { POSTIT_Z, usePostitStore } from "@/lib/store/use-postit-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { cn } from "@/lib/utils";
import {
  CORES_POSTIT,
  type CorPostit,
  type Postit,
  type Scene,
} from "@/types/scene";


/**
 * Tamanho do texto do postit, em unidades de cena.
 *
 * Unidades de cena, e não pixels de tela: o postit escala com o zoom, e é essa
 * decisão que o faz parecer papel colado no mapa em vez de janela flutuando
 * sobre ele. Afastar o mapa afasta o papel junto, com o texto dentro.
 *
 * Só que "escala com o zoom" não pode ser deixado ao `zoom` do plano. Ver
 * `medidaDoCorpo`, no `PostitPapel`.
 */
const FONTE = 15;

/** Margem interna do corpo do postit, em unidades de cena (era `p-1.5`). */
const MARGEM = 6;

/** Altura da faixa de arrasto, em unidades de cena. */
const FAIXA = 22;

/** Lado da alça de redimensionar, em unidades de cena. */
const ALCA = 16;

/**
 * Espessura do traço dos ícones da faixa, em unidades do SVG (24 por ícone).
 *
 * O ícone mede em unidades de cena e escala com o papel, como deve — mas o
 * TRAÇO não pode: a 708% um traço de 2 vira oito pixels, e a lixeira vira uma
 * mancha. Dividir pela escala mantém o traço em torno de um pixel e meio na
 * tela em qualquer zoom. É atributo do SVG, não comprimento CSS, então não
 * cai no piso de um pixel do `zoom` (ver `emPixelDeTela`). Teto em 2,5 para o
 * mapa afastado não engrossar o ícone além do desenho original.
 */
function tracoDoIcone(scale: number): number {
  return Math.min(2.5, 2.5 / scale);
}

/**
 * O papel de cada cor.
 *
 * Iguais nos dois temas, e não uma variante escura para cada: o postit não vive
 * sobre o fundo do aplicativo, vive sobre o MAPA — e um mapa de caverna é
 * escuro no tema claro também. O que garante contraste é o papel ser sempre
 * claro com texto escuro, mais o anel que o separa do que está embaixo.
 */
const PAPEL: Record<CorPostit, string> = {
  amarelo: "bg-amber-200 ring-amber-500/60",
  rosa: "bg-pink-200 ring-pink-500/60",
  azul: "bg-sky-200 ring-sky-500/60",
  verde: "bg-emerald-200 ring-emerald-500/60",
  // Anel cinza e não branco: sobre mapa claro, branco no branco some.
  branco: "bg-neutral-50 ring-neutral-400/70",
};

/** A bolinha de escolha de cor, na faixa. */
const TINTA: Record<CorPostit, string> = {
  amarelo: "bg-amber-400",
  rosa: "bg-pink-400",
  azul: "bg-sky-400",
  verde: "bg-emerald-400",
  branco: "bg-white",
};

/**
 * Os postits do mestre, colados na cena.
 *
 * Mora aqui, no Mestre, e NÃO no `SceneLayer` — mesma razão do `PinLayer`: o
 * `SceneLayer` é o mesmo componente no Espectador, no Jogador e na miniatura, e
 * um postit desenhado por ele apareceria na TV virada para a mesa. A outra
 * barreira é `sceneForTable`, que tira os postits do quadro publicado. Vazar a
 * preparação do mestre exigiria errar as duas.
 *
 * Este componente de fora não tem hook nenhum, e é por isso que ele existe
 * separado do de baixo: cena sem postit não deve ler personagens, sondar
 * jogadores nem listar o acervo. Com os hooks aqui, uma campanha que nunca usou
 * postit pagaria as três coisas em toda cena.
 */
export function PostitLayer({
  scene,
  panMode,
}: {
  scene: Scene;
  /** Espaço segurado: o arrasto pertence ao deslocamento da cena. */
  panMode: boolean;
}) {
  const postits = scene.postits;
  if (!postits || postits.length === 0) return null;

  return (
    <PostitCamada sceneId={scene.id} postits={postits} panMode={panMode} />
  );
}

function PostitCamada({
  sceneId,
  postits,
  panMode,
}: {
  sceneId: string;
  postits: Postit[];
  panMode: boolean;
}) {
  const { scale, planoDaMargem } = useSceneScale();

  const updatePostit = useSceneStore((state) => state.updatePostit);
  const removePostit = useSceneStore((state) => state.removePostit);
  const { vinculos, candidatos } = useMencoesDoMestre();

  // Na MARGEM, e não no plano de controles onde este layer é montado: o papel
  // pode estar fora do mapa, e filho fora da caixa do plano derruba o palco
  // (ver `planoDaMargem` no `SceneStage`). Sem o nó ainda, nada a desenhar.
  if (scale === 0 || !planoDaMargem) return null;

  return createPortal(
    <>
      {postits.map((postit) => (
        <PostitPapel
          key={postit.id}
          postit={postit}
          panMode={panMode}
          vinculos={vinculos}
          candidatos={candidatos}
          onChange={(patch) => updatePostit(sceneId, postit.id, patch)}
          onRemove={() => removePostit(sceneId, postit.id)}
        />
      ))}
    </>,
    planoDaMargem,
  );
}

/**
 * Um papel: faixa de arrasto em cima, texto no meio, alça no canto.
 *
 * ## Três alvos, três gestos
 *
 * O postit tem tamanho, e é isso que o separa do alfinete: lá os dois gestos
 * disputavam o mesmo alvo e precisaram de um limiar de pixels para se
 * distinguir. Aqui cada gesto tem o seu pedaço — a faixa move, a alça
 * redimensiona, o corpo abre para digitar. Sem limiar, sem gesto que "não
 * funcionou".
 *
 * O corpo abrir no clique é o que faz o papel parecer papel. A alternativa era
 * duplo clique, e ela cobra dois cliques em cima da coisa mais frequente que se
 * faz com um postit.
 */
function PostitPapel({
  postit,
  panMode,
  vinculos,
  candidatos,
  onChange,
  onRemove,
}: {
  postit: Postit;
  panMode: boolean;
  vinculos: Vinculos;
  candidatos: Record<SinalDoPostit, Sugestao[]>;
  onChange: (patch: Partial<Postit>) => void;
  onRemove: () => void;
}) {
  const { scale, ampliacaoNoLayout } = useSceneScale();

  /**
   * O corpo do papel medido em PIXEL DE TELA enquanto o plano amplia por `zoom`.
   *
   * O texto é 15 unidades de cena, e sob `zoom` isso viraria 15 × scale pixels
   * -- até o WebKit intervir: ele tem um piso de tamanho lógico de fonte (9px)
   * que vale só para tamanho que veio de `zoom`, e leva para o piso qualquer
   * texto que o `zoom` tenha deixado menor. Abaixo de 60% o texto do postit
   * parava de encolher enquanto o papel continuava, e o mestre via as letras
   * CRESCEREM dentro do papel ao afastar o mapa -- a 30%, quatro palavras
   * cobriam o postit inteiro. Durante o gesto, com o plano em `transform`, nada
   * disso acontece; e o texto trocava de tamanho no instante em que a roda
   * parava.
   *
   * Aqui o corpo desfaz o `zoom` do plano com `emPixelDeTela` e mede o texto
   * ele mesmo: `FONTE × scale` pixels, que é exatamente o que 15 unidades de
   * cena valem na tela. Como o zoom efetivo do corpo é 1, o piso não se aplica.
   * A margem entra na mesma conta pela mesma razão -- ela é papel, e tem de
   * encolher junto.
   *
   * Só no `zoom`: no `transform` o tamanho em unidades de cena já sai certo, e
   * é a alternância entre as duas formas que tem de dar a MESMA geometria.
   * Mesmo desenho do cartão do alfinete, em `PinWindow`.
   */
  const fator = ampliacaoNoLayout ? scale : 1;
  const medidaDoCorpo = ampliacaoNoLayout ? emPixelDeTela(scale) : undefined;
  const tipografia = {
    fontSize: FONTE * fator,
    lineHeight: 1.35,
    padding: MARGEM * fator,
  };

  /**
   * O arrasto em unidades de cena.
   *
   * O `delta` é acumulado desde o pointerdown, e o retrato do postit é tirado
   * ANTES do gesto: somar incremento a incremento acumularia erro de
   * arredondamento a cada frame, e um papel arrastado devagar chegaria alguns
   * pixels longe do cursor.
   */
  const startDrag = useSceneDrag();

  const editandoId = usePostitStore((state) => state.editandoId);
  const editar = usePostitStore((state) => state.editar);
  const fechar = usePostitStore((state) => state.fechar);

  const editando = editandoId === postit.id;

  const campo = useRef<HTMLTextAreaElement | null>(null);

  /**
   * O espelho do campo, e a marca de largura zero na posição do cursor.
   *
   * Existem porque `<textarea>` não conta onde o caret está na tela: ele dá o
   * índice no texto (`selectionStart`) e nada de geometria. O jeito de obter a
   * coordenada é desenhar o mesmo texto com a mesma tipografia e medir — é o
   * que o espelho faz, com uma marca vazia no lugar do cursor.
   *
   * Dois usos de uma medida só: a lista se pendura na marca, logo abaixo da
   * LINHA que está sendo escrita e não do rodapé do papel, e o texto fantasma
   * nasce ali do lado. Como o espelho vive dentro do palco, o
   * `getBoundingClientRect` da marca já vem com o zoom aplicado — nenhuma conta
   * de escala à mão.
   */
  const espelho = useRef<HTMLDivElement | null>(null);
  const marca = useRef<HTMLSpanElement | null>(null);

  /** O papel inteiro. Serve para saber o que é "fora dele". */
  const papel = useRef<HTMLDivElement | null>(null);

  /**
   * Onde o cursor está dentro do texto.
   *
   * Em estado, e não lido do DOM na hora de desenhar: é ele que decide se a
   * lista de sugestão aparece, e ler `selectionStart` durante o render não
   * dispararia render nenhum quando o mestre movesse o cursor com as setas — a
   * lista ficaria parada no marcador anterior.
   */
  const [cursor, setCursor] = useState(0);

  /** Qual sugestão está sob as setas. */
  const [indice, setIndice] = useState(0);

  /**
   * Onde começava o marcador cuja lista o mestre dispensou com Esc.
   *
   * Esc tem dois significados aqui, e o mais fraco vem primeiro: com a lista
   * aberta ele fecha a LISTA — o mestre quer escrever `@Thalor` mesmo havendo
   * um "Thalor Pé-de-Ferro" na campanha —, e sem lista ele sai da edição. Sem esta marca,
   * dispensar a lista sairia do postit junto.
   *
   * Guarda a POSIÇÃO e não um booleano: a dispensa vale para aquele marcador, e
   * seguir digitando dentro dele não deve ressuscitar a lista que acabou de ser
   * mandada embora. Escrever outro marcador na frase reabre, porque é outro
   * marcador.
   */
  const [dispensadoEm, setDispensadoEm] = useState<number | null>(null);

  /**
   * Onde o cursor tem de ficar depois de aplicar uma sugestão.
   *
   * Num ref e aplicado por efeito porque o texto novo só existe no DOM no
   * render seguinte: chamar `setSelectionRange` junto com o `onChange` mexeria
   * na versão antiga do campo, e o cursor voltaria para o meio do nome que
   * acabou de ser escrito.
   */
  const cursorPendente = useRef<number | null>(null);

  useEffect(() => {
    if (!editando) return;

    // Cursor no fim, não selecionando tudo: entrar num postit escrito é quase
    // sempre continuar a escrever, e uma seleção total transforma a primeira
    // tecla em apagar o postit inteiro.
    const elemento = campo.current;
    if (!elemento) return;

    elemento.focus();
    elemento.setSelectionRange(elemento.value.length, elemento.value.length);
    setCursor(elemento.value.length);
  }, [editando]);

  useEffect(() => {
    const alvo = cursorPendente.current;
    if (alvo === null) return;

    cursorPendente.current = null;

    const elemento = campo.current;
    if (!elemento) return;

    elemento.setSelectionRange(alvo, alvo);
    setCursor(alvo);
  }, [postit.texto]);

  /**
   * Deixa o espelho com a MESMA largura útil do campo.
   *
   * A barra de rolagem é o que obriga: num postit cheio ela come alguns pixels
   * da direita do campo e nenhum do espelho — e alguns pixels de largura mudam
   * onde cada linha quebra, o que faria a marca do cursor apontar para uma
   * linha diferente daquela onde o mestre está escrevendo. `clientWidth` já
   * exclui a barra, então a diferença entre as duas medidas É a barra.
   *
   * Sem lista de dependências: depende de quanto texto há, do tamanho do papel
   * e do zoom, e medir a cada render é mais barato que enumerar isso.
   */
  useLayoutEffect(() => {
    const campoEl = campo.current;
    const espelhoEl = espelho.current;
    if (!campoEl || !espelhoEl) return;

    const barra = campoEl.offsetWidth - campoEl.clientWidth;

    // 6px é o `p-1.5` das duas caixas; a barra entra em cima disso.
    espelhoEl.style.paddingRight = `${6 + barra}px`;
    espelhoEl.scrollTop = campoEl.scrollTop;
  });

  /**
   * Toque em qualquer lugar fora do papel sai da edição.
   *
   * O `onBlur` do campo não dá conta disso, e a razão é o `preventDefault` do
   * `useSceneDrag`: ele existe para o arrasto não arrastar seleção de texto, e
   * como efeito colateral o navegador não move o foco. Então marcar vários no
   * vazio, deslocar o mapa ou pegar um token deixava o campo focado e o postit
   * em edição — com o cursor piscando dentro de um papel que o mestre já tinha
   * deixado para trás.
   *
   * Na CAPTURA, e no documento: o gesto tem de ser lido antes de quem quer que
   * o receba, e "fora do papel" inclui a barra de ferramentas, os painéis
   * laterais e qualquer coisa que nem esteja no palco.
   *
   * A lista de sugestão é exceção: ela mora num portal no `body`, então não
   * está dentro do papel, mas escolher um nome nela é parte de escrever. Sem
   * essa ressalva, clicar numa sugestão fecharia a edição antes de aplicá-la.
   */
  useEffect(() => {
    if (!editando) return;

    function foraDaqui(event: PointerEvent) {
      const alvo = event.target;
      if (!(alvo instanceof Node)) return;

      if (papel.current?.contains(alvo)) return;
      if (alvo instanceof Element && alvo.closest(`[${MARCA_LISTA}]`)) return;

      fechar();
    }

    document.addEventListener("pointerdown", foraDaqui, true);

    return () => document.removeEventListener("pointerdown", foraDaqui, true);
  }, [editando, fechar]);

  /**
   * O marcador em construção sob o cursor, se houver.
   *
   * Recalculado a cada render em vez de guardado: ele é função do texto e da
   * posição do cursor, e as duas coisas já estão aqui. Estado paralelo teria de
   * ser invalidado em cada tecla, cada clique e cada seta.
   */
  const fragmento = editando ? fragmentoDoPostit(postit.texto, cursor) : null;

  const sugestoes =
    fragmento && fragmento.inicio !== dispensadoEm
      ? filtraSugestoes(
          candidatos[fragmento.sinal],
          fragmento.prefixo,
          normaliza,
        )
      : [];

  // O item sob as setas nunca aponta para fora da lista: o mestre desce até o
  // sexto item e digita uma letra a mais, e a lista encurta para dois.
  const escolhido = Math.min(indice, Math.max(sugestoes.length - 1, 0));

  /** O que falta do nome destacado, em cinza à frente do cursor. */
  const fantasma =
    fragmento && sugestoes.length > 0
      ? fantasmaDe(
          sugestoes[escolhido].nome,
          fragmento.prefixo,
          postit.texto[cursor],
          normaliza,
        )
      : "";

  function aplicar(nome: string) {
    if (!fragmento) return;

    const resultado = aplicaSugestao(postit.texto, fragmento, cursor, nome);

    cursorPendente.current = resultado.cursor;
    onChange({ texto: resultado.texto });
    setIndice(0);

    // O foco pode ter ficado no caminho quando a escolha veio do mouse.
    campo.current?.focus();
  }

  function arrastar(event: ReactPointerEvent) {
    if (panMode) return;

    const { x, y } = postit;

    startDrag(event, {
      // Preso à ÁREA DE TRABALHO, e não ao plano da cena: o papel pode ser
      // estacionado na margem, fora do mapa. Ver `postitNaArea`.
      onMove: (delta) =>
        onChange(
          postitNaArea(x + delta.x, y + delta.y, postit.largura, postit.altura),
        ),
    });
  }

  function redimensionar(event: ReactPointerEvent) {
    if (panMode) return;

    const { largura, altura } = postit;

    startDrag(event, {
      onMove: (delta) =>
        onChange(postitNoTamanho(largura + delta.x, altura + delta.y)),
    });
  }

  return (
    <div
      ref={papel}
      className={cn(
        // `pointer-events-auto` porque o plano dos controles desliga o ponteiro
        // para não cobrir o mapa, que agora mora num plano abaixo -- ver
        // `plano-de-controles` no `SceneStage`. O papel é pegável, então ele
        // liga de volta.
        "pointer-events-auto absolute flex flex-col overflow-hidden rounded-[3px] shadow-lg ring-1",
        PAPEL[postit.cor],
        editando && "ring-2 ring-offset-1",
      )}
      style={{
        left: postit.x,
        top: postit.y,
        width: postit.largura,
        height: postit.altura,
        // Papel colado sobre o mapa, sob o alfinete. Ver a escada em
        // `use-postit-store`.
        zIndex: POSTIT_Z,
        // Mesmo motivo do alfinete: sem isto o toque rolaria a tela em vez de
        // arrastar o papel.
        touchAction: "none",
      }}
    >
      {/*
        A faixa é a alça, e ela some quando o mouse sai: um postit com barra de
        título permanente gastaria um quinto da altura do papel com cromo, e o
        papel existe para mostrar texto.

        `group-hover` e não estado: nada aqui precisa de render.
      */}
      <div
        className="group flex shrink-0 cursor-move items-center gap-1 bg-black/5 px-1"
        style={{ height: FAIXA }}
        onPointerDown={arrastar}
      >
        <div className="flex flex-1 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {CORES_POSTIT.map((cor) => (
            <button
              key={cor}
              type="button"
              aria-label={`Papel ${cor}`}
              aria-pressed={cor === postit.cor}
              className={cn(
                "rounded-full ring-black/20",
                TINTA[cor],
                cor === postit.cor ? "ring-2" : "ring-1",
              )}
              style={{ width: FAIXA * 0.5, height: FAIXA * 0.5 }}
              // No pointerdown, não no clique: o pointerdown daqui chega antes
              // do arrasto da faixa, e sem o `stopPropagation` escolher a cor
              // arrastaria o papel alguns pixels no mesmo gesto.
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onChange({ cor })}
            />
          ))}
        </div>

        <AjudaDoPostit traco={tracoDoIcone(scale)} />

        <button
          type="button"
          aria-label="Tirar este postit do mapa"
          // À vista SEMPRE, ao contrário das bolinhas de cor ao lado.
          //
          // Era escondido até o ponteiro entrar na faixa, e isso partia do
          // princípio errado: a faixa tem 22 unidades de cena de altura, e com
          // o mapa afastado ela é uma tira de três pixels na tela. Procurar o
          // botão de tirar o papel virava esfregar o mouse no alto dele até
          // algo aparecer -- e quem quer tirar um postit quer tirá-lo AGORA,
          // porque ele está cobrindo o mapa.
          //
          // O cinza escuro é do papel, não do tema: o postit é sempre claro,
          // nas quatro cores, e é sobre ele que este ícone precisa se ler. Ver
          // `PAPEL`.
          className="shrink-0 text-neutral-900/50 transition-colors hover:text-red-700"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            // Fecha a edição antes: sem isto o store ficaria apontando para um
            // postit que não existe mais, e o próximo postit colado nasceria
            // sem o cursor dentro dele.
            if (editando) fechar();
            onRemove();
          }}
        >
          <Trash2
            style={{ width: FAIXA * 0.6, height: FAIXA * 0.6 }}
            strokeWidth={tracoDoIcone(scale)}
          />
        </button>
      </div>

      {editando ? (
        // `relative` para o espelho poder cobrir exatamente a mesma caixa do
        // campo. Sem o embrulho, o campo é filho direto da coluna do papel e o
        // espelho não teria a que se ancorar.
        <div className="relative min-h-0 flex-1">
          {/* O corpo em pixel de tela. Ver `medidaDoCorpo`. */}
          <div className="absolute inset-0" style={medidaDoCorpo}>
            {/*
              O espelho: o mesmo texto, a mesma tipografia, a mesma caixa.

              Ele desenha o texto INTEIRO, invisível, e não só o pedaço até o
              cursor. Duas razões: a marca do cursor só cai no lugar certo se o
              que vem antes dela ocupar o mesmo espaço que ocupa no campo, e o
              espelho precisa ter a mesma altura rolável do campo para a rolagem
              de um valer para o outro.

              `aria-hidden` porque é geometria, não conteúdo: o texto de verdade
              está no campo ao lado, e um leitor de tela que lesse os dois leria
              o postit duas vezes.
            */}
            <div
              ref={espelho}
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap wrap-break-word"
              style={tipografia}
            >
              <span className="invisible">{postit.texto.slice(0, cursor)}</span>

              {/* Largura zero: é só um lugar no texto, e qualquer largura aqui
                  empurraria o resto do espelho para a direita e desalinharia a
                  medida do que ela mesma existe para medir. */}
              <span ref={marca} className="inline-block w-0" />

              {fantasma ? (
                <span className="text-neutral-900/35">{fantasma}</span>
              ) : null}

              <span className="invisible">{postit.texto.slice(cursor)}</span>
            </div>

            <textarea
              ref={campo}
              // Cor do realce explícita: o padrão do WebKit sobre papel amarelo
              // e verde some, e a seleção parecia não existir.
              className="absolute inset-0 size-full resize-none bg-transparent text-neutral-900 outline-none selection:bg-sky-400/50"
              style={tipografia}
              aria-label="Texto do postit"
              placeholder="@personagem  /arquivo  >mapa  **negrito**"
              value={postit.texto}
              onChange={(event) => {
                onChange({ texto: event.target.value });
                setCursor(event.target.selectionStart);
              }}
              // Cobre seta, clique e arrasto de seleção de uma vez: `select`
              // dispara em qualquer mudança de posição do cursor, e é ela que a
              // lista precisa acompanhar.
              onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
              // O gesto de texto é do campo: sem isto, selecionar uma palavra com
              // o mouse arrastaria o papel por baixo da seleção.
              onPointerDown={(event) => event.stopPropagation()}
              // A rolagem do campo é a do espelho, escrita direto no DOM: um
              // postit cheio rola por dentro, e sem isto a marca do cursor e o
              // fantasma ficariam parados enquanto o texto corre por baixo.
              onScroll={(event) => {
                const alvo = espelho.current;
                if (alvo) alvo.scrollTop = event.currentTarget.scrollTop;
              }}
              // Perder o foco também sai da edição, e isto NÃO é redundante com o
              // ouvinte de `pointerdown` acima: aqui entra o que o mouse não
              // fez — Tab para o próximo controle, a janela indo para trás. O de
              // cima cobre o contrário, o gesto de mouse que não move o foco
              // porque alguém chamou `preventDefault`. Os dois chamam a mesma
              // função, e chamá-la duas vezes não custa nada.
              onBlur={fechar}
              onKeyDown={(event) => {
                const lista = sugestoes.length > 0;

                // Tab e seta-direita confirmam o fantasma, como no VS Code: com
                // o cursor no fim da linha a seta não tem para onde ir, e é o
                // gesto que a mão já faz para "aceitar isso".
                if (fantasma && event.key === "ArrowRight") {
                  event.preventDefault();
                  aplicar(sugestoes[escolhido].nome);

                  return;
                }

                // Com a lista aberta, as setas andam nela em vez de andar no
                // texto: é o contrato de qualquer completar, e o cursor não tem
                // para onde ir dentro de um nome que ainda está sendo escolhido.
                if (
                  lista &&
                  (event.key === "ArrowDown" || event.key === "ArrowUp")
                ) {
                  event.preventDefault();

                  const passo = event.key === "ArrowDown" ? 1 : -1;
                  // Circular: da última volta para a primeira. Numa lista de até
                  // seis itens, bater no fim e parar é mais irritante que útil.
                  setIndice((atual) => {
                    const proximo =
                      (Math.min(atual, sugestoes.length - 1) + passo) %
                      sugestoes.length;
                    return proximo < 0 ? sugestoes.length - 1 : proximo;
                  });

                  return;
                }

                // Enter e Tab confirmam a escolha. Enter só quando a lista está
                // aberta — fora dela ele é quebra de linha, e a anotação de três
                // linhas é o caso comum.
                if (lista && (event.key === "Enter" || event.key === "Tab")) {
                  event.preventDefault();
                  aplicar(sugestoes[escolhido].nome);

                  return;
                }

                if (event.key === "Escape") {
                  // O palco também escuta Escape; em qualquer um dos dois
                  // sentidos, a tecla é desta edição.
                  event.stopPropagation();

                  // Primeiro Esc fecha a lista, segundo sai do postit. Ver
                  // `dispensadoEm`.
                  if (lista && fragmento) setDispensadoEm(fragmento.inicio);
                  else fechar();
                }
              }}
            />

            {sugestoes.length > 0 && fragmento ? (
              <ListaDeSugestoes
                titulo={TITULO_DO_POSTIT[fragmento.sinal]}
                itens={sugestoes}
                indice={escolhido}
                // Na marca do cursor, e não no campo: a lista abre embaixo da
                // LINHA que está sendo escrita, como num editor de código. Presa
                // ao rodapé do papel, ela ficava a quatro linhas de distância do
                // que o mestre estava digitando.
                ancora={marca}
                onEscolher={aplicar}
              />
            ) : null}
          </div>
        </div>
      ) : (
        // `div` com papel de botão, e não um `<button>`: o texto renderizado
        // tem botões DENTRO dele — o `/arquivo` e o `>cena` —, e botão dentro
        // de botão é marcação inválida que o navegador desmancha, levando com
        // ela o clique dos dois. O foco e o Enter vêm à mão logo abaixo.
        <div className="relative min-h-0 flex-1">
          <div
            role="button"
            tabIndex={0}
            // Em pixel de tela, como o campo de edição. Ver `medidaDoCorpo`.
            // `select-text` contra o `select-none` da raiz: ler um postit
            // inclui copiar um nome dele. O clique abaixo respeita a seleção.
            className="absolute inset-0 cursor-text overflow-hidden text-left text-neutral-900 select-text selection:bg-sky-400/50"
            style={{ ...medidaDoCorpo, ...tipografia }}
            aria-label="Escrever neste postit"
            onPointerDown={(event) => {
              // Impede o palco de ler este pointerdown como clique no vazio —
              // que, com uma ferramenta de mira na mão, colaria outro postit por
              // cima deste.
              event.stopPropagation();
            }}
            onClick={(event) => {
              // Clique que veio de um marcador é do marcador: sem esta guarda,
              // abrir a cena vinculada ou a miniatura do arquivo também poria o
              // postit em edição, e o painel abriria já coberto pelo campo.
              //
              // `closest` e não comparar com o alvo: clicar no texto comum acerta
              // um `<span>` ou um `<strong>` filho, e esse clique É para editar.
              if ((event.target as HTMLElement).closest("button")) return;

              // Arrastar para selecionar termina num `click`, e abrir a edição
              // aqui trocaria o texto pintado pelo campo e perderia a seleção
              // que a pessoa acabou de fazer. Com texto selecionado dentro do
              // papel, o clique é da seleção; sem, é para editar.
              const selecao = window.getSelection();
              if (
                selecao &&
                !selecao.isCollapsed &&
                event.currentTarget.contains(selecao.anchorNode)
              )
                return;

              editar(postit.id);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;

              event.preventDefault();
              editar(postit.id);
            }}
          >
            {postit.texto ? (
              <PostitTextoView texto={postit.texto} vinculos={vinculos} />
            ) : (
              <span className="text-neutral-500 italic">Escrever…</span>
            )}
          </div>
        </div>
      )}

      {/* Canto inferior direito, e só ele: um postit não tem proporção a
          preservar nem gira, então quatro alças seriam três alvos a mais para o
          mesmo gesto. */}
      <button
        type="button"
        aria-label="Redimensionar este postit"
        className="absolute right-0 bottom-0 cursor-nwse-resize bg-black/10"
        style={{
          width: ALCA,
          height: ALCA,
          clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
        }}
        onPointerDown={redimensionar}
      />
    </div>
  );
}

/** Uma linha da ajuda: o gesto ou o sinal, e o que ele faz. */
const COMANDOS: Array<[string, string]> = [
  ["@nome", "Personagem. Clique abre a ficha; mouse em cima mostra o retrato."],
  ["/arquivo", "Imagem ou som do acervo. Imagem abre numa janela ao clicar."],
  [">mapa", "Mapa ou quadro. Clique leva para ele; mouse em cima mostra a prévia."],
  ["**texto**", "Negrito."],
  ["# Título, ## Sub", "No começo da linha: título e subtítulo."],
  ["- item", "No começo da linha: item de lista."],
  ["Tab, →", "Aceita a sugestão em cinza enquanto digita."],
  ["↑ ↓, Enter", "Anda na lista de sugestões e escolhe."],
  ["Esc", "Fecha a lista; de novo, sai da edição."],
  ["Faixa", "Arrasta o papel. As bolinhas trocam a cor."],
  ["Canto", "O triângulo de baixo à direita redimensiona."],
];

/**
 * O botão de ajuda da faixa: lista os sinais e os gestos do postit.
 *
 * Existe porque os sinais são invisíveis até alguém os conhecer: um papel em
 * branco não sugere que `@` complete um personagem, e o placeholder do campo
 * some na primeira letra. Sempre à vista, como o botão de tirar ao lado, e pela
 * mesma razão: com o mapa afastado a faixa é uma tira de três pixels, e um
 * botão que só aparece no hover ali é um botão que não existe.
 *
 * `Popover` e não `Tooltip`: é texto para ler, com nove linhas, e some ao
 * clicar fora. Sai do palco por portal, como a lista de sugestões: o conteúdo
 * do postit escala com o zoom, e a 40% a ajuda seria um selo ilegível.
 */
function AjudaDoPostit({ traco }: { traco: number }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Como escrever neste postit"
            className="shrink-0 text-neutral-900/50 transition-colors hover:text-neutral-900"
            // O pointerdown daqui chega antes do arrasto da faixa: sem isto,
            // abrir a ajuda arrastaria o papel alguns pixels no mesmo gesto.
            onPointerDown={(event) => event.stopPropagation()}
            // E o clique não pode virar clique no vazio do palco nem "editar".
            onClick={(event) => event.stopPropagation()}
          >
            <Info
              style={{ width: FAIXA * 0.6, height: FAIXA * 0.6 }}
              strokeWidth={traco}
            />
          </button>
        }
      />
      <PopoverContent align="start" className="w-72 p-3" side="top">
        <p className="mb-2 text-xs font-medium">O que dá para escrever aqui</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          {COMANDOS.map(([sinal, faz]) => (
            <Fragment key={sinal}>
              <dt className="font-mono font-medium whitespace-nowrap">{sinal}</dt>
              <dd className="text-muted-foreground">{faz}</dd>
            </Fragment>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
