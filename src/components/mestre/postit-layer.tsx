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

import { ListaDeSugestoes, MARCA_LISTA } from "@/components/mencoes/sugestoes";
import {
  PostitTextoView,
  type Vinculos,
} from "@/components/mestre/postit-texto-view";
import {
  emPixelDeTela,
  useSceneScale,
} from "@/components/playground/scene-stage";
import { useMencoesDoMestre } from "@/hooks/use-mencoes-do-mestre";
import { postitNaArea, postitNoTamanho } from "@/lib/geometry/postit";
import { useHistoricoDeTexto } from "@/lib/mestre/historico-de-texto";
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
import { TransformHandles } from "@/components/playground/transform-handles";
import { CORNER_HANDLES } from "@/lib/geometry/transform";
import { POSTIT_Z, usePostitStore } from "@/lib/store/use-postit-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import {
  CORES_POSTIT,
  DOCUMENTO_FONTES,
  POSTIT_FONTE,
  type CorPostit,
  type Postit,
  type Scene,
} from "@/types/scene";


/** Margem interna do corpo do postit, em unidades de cena (era `p-1.5`). */
const MARGEM = 6;

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
  onPostitPointerDown,
}: {
  scene: Scene;
  /** Espaço segurado: o arrasto pertence ao deslocamento da cena. */
  panMode: boolean;
  /**
   * O clique na FAIXA, entregue ao palco.
   *
   * A faixa arrastava o papel aqui dentro, e gravava no board a cada quadro.
   * Quem arrasta agora é o palco, porque só ele sabe o que MAIS está na mão --
   * a área de seleção laça papel junto com frase e imagem, e pegar um tem de
   * levar todos. Mesmo desenho de `onTextoPointerDown`.
   */
  onPostitPointerDown: (event: ReactPointerEvent, postit: Postit) => void;
}) {
  const postits = scene.postits;
  if (!postits || postits.length === 0) return null;

  return (
    <PostitCamada
      sceneId={scene.id}
      postits={postits}
      panMode={panMode}
      onPostitPointerDown={onPostitPointerDown}
    />
  );
}

function PostitCamada({
  sceneId,
  postits,
  panMode,
  onPostitPointerDown,
}: {
  sceneId: string;
  postits: Postit[];
  panMode: boolean;
  onPostitPointerDown: (event: ReactPointerEvent, postit: Postit) => void;
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
          onPapelPointerDown={(event) => onPostitPointerDown(event, postit)}
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
  onPapelPointerDown,
}: {
  postit: Postit;
  panMode: boolean;
  vinculos: Vinculos;
  candidatos: Record<SinalDoPostit, Sugestao[]>;
  onChange: (patch: Partial<Postit>) => void;
  onRemove: () => void;
  onPapelPointerDown: (event: ReactPointerEvent) => void;
}) {
  const { scale, ampliacaoNoLayout } = useSceneScale();
  const tool = useToolStore((state) => state.tool);

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
  /**
   * O tamanho da letra DESTE papel, em unidades de cena.
   *
   * Unidades de cena, e não pixels de tela: o postit escala com o zoom, e é
   * essa decisão que o faz parecer papel colado no mapa em vez de janela
   * flutuando sobre ele. Afastar o mapa afasta o papel junto, com o texto
   * dentro. Só que "escala com o zoom" não pode ser deixado ao `zoom` do
   * plano -- ver `medidaDoCorpo` logo acima.
   */
  const fonte = postit.fonte ?? POSTIT_FONTE;
  const tipografia = {
    fontSize: fonte * fator,
    lineHeight: 1.35,
    padding: MARGEM * fator,
  };

  const selecionado = useSelectionStore((state) =>
    state.selectedPostitIds.includes(postit.id),
  );
  /**
   * Este papel é a ÚNICA coisa na mão?
   *
   * Mesma pergunta do texto solto e do cartão de nota, pela mesma razão:
   * sozinho ele traz as próprias alças e os próprios botões; acompanhado, quem
   * desenha é o gizmo do grupo, no palco.
   */
  const sozinho = useSelectionStore(
    (state) =>
      state.selectedPostitIds.length === 1 &&
      state.selectedIds.length === 0 &&
      state.selectedTextoIds.length === 0 &&
      state.selectedFormaIds.length === 0 &&
      state.selectedDocumentoIds.length === 0 &&
      state.selectedTracoIds.length === 0,
  );

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
  const historico = useHistoricoDeTexto(postit.texto, cursor);
  /** Cursor a repor depois que um desfazer trocar o texto. */
  const repor = useRef<number | null>(null);
  useLayoutEffect(() => {
    const alvo = campo.current;
    if (!alvo || repor.current === null) return;
    alvo.setSelectionRange(repor.current, repor.current);
    repor.current = null;
  }, [postit.texto]);

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

  /**
   * Duplo clique abre para escrever -- e o tratador mora no PAPEL, não no
   * corpo que desenha o texto.
   *
   * Não é gosto: o arrasto do papel chama `setPointerCapture` no papel (ver
   * `useSceneDrag`), e a partir daí o navegador entrega os eventos de mouse a
   * quem capturou. O `dblclick` era disparado no papel e nunca chegava ao
   * corpo, que é descendente -- clicar duas vezes não abria nada.
   *
   * Duplo e não simples, como era até a faixa sair: com o papel inteiro
   * arrastando, um clique só tem de ser "pegar este papel". Abrir o campo a
   * cada toque punha o cursor dentro de um postit que o mestre só queria
   * selecionar ou mover, e a primeira tecla depois disso virava texto no papel
   * errado. É o mesmo gesto do cartão de nota.
   */
  function abrirParaEscrever(event: ReactPointerEvent | React.MouseEvent) {
    if (panMode || tool === "ligacao" || editando) return;

    // O que está SOB o ponteiro, e não `event.target`: com a captura no papel,
    // o alvo do evento é o papel, e a marcação que estava embaixo do dedo se
    // perderia. Duplo clique num `@personagem` ou num `/arquivo` é do
    // marcador -- abrir a ficha e o campo de texto no mesmo gesto deixaria o
    // painel coberto pelo campo assim que ele aparecesse.
    const sob = document.elementFromPoint(event.clientX, event.clientY);
    if (sob?.closest("button")) return;

    editar(postit.id);
  }

  /**
   * Um degrau na escada de tamanhos -- a MESMA do cartão de nota.
   *
   * O papel colado antes disto existir está em 15, que não é degrau: o
   * primeiro toque leva para o degrau vizinho e de lá o gesto anda de um em
   * um. Mesma conta de `mudarFonte` no `CartaoDeDocumento`.
   */
  function mudarFonte(sentido: 1 | -1) {
    const indice = DOCUMENTO_FONTES.findIndex((f) => f >= fonte);
    const atual = indice === -1 ? DOCUMENTO_FONTES.length - 1 : indice;
    const proximo = Math.min(
      Math.max(atual + sentido, 0),
      DOCUMENTO_FONTES.length - 1,
    );

    onChange({ fonte: DOCUMENTO_FONTES[proximo] });
  }

  function arrastar(event: ReactPointerEvent) {
    if (panMode) return;

    // O gesto é do PALCO: ele seleciona o papel e arrasta o que está na mão,
    // no caminho leve do gesto -- antes, cada quadro do arrasto era um commit
    // no board. A cerca da área de trabalho continua valendo, agora sobre o
    // deslocamento do grupo. Ver `deslocamentoPreso`.
    onPapelPointerDown(event);
  }

  return (
    <>
    <div
      ref={papel}
      className={cn(
        // `pointer-events-auto` porque o plano dos controles desliga o ponteiro
        // para não cobrir o mapa, que agora mora num plano abaixo -- ver
        // `plano-de-controles` no `SceneStage`. O papel é pegável, então ele
        // liga de volta.
        "absolute flex flex-col overflow-hidden rounded-[3px] shadow-lg ring-1",
        // Com a seta na mão o ponteiro é DESLIGADO aqui, e não apenas
        // ignorado: o clique precisa ATRAVESSAR até o envelope do palco, que
        // vive no plano de baixo e é quem trata o gesto da seta. Um tratador
        // que só retornava deixava o pointerdown morrer neste `<div>` -- e a
        // seta não começava em cima de um postit, de um texto nem de um
        // cartão, que é justamente onde ela quer começar.
        tool === "ligacao"
          ? "pointer-events-none cursor-crosshair"
          : "pointer-events-auto",
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
      // O papel INTEIRO arrasta. Antes era a faixa de 22 unidades no topo, e
      // com o mapa afastado ela era uma tira de três pixels: pegar o papel
      // virava mirar. O que era da faixa -- cor, ajuda e tirar do mapa -- subiu
      // para a fileira de botões do gizmo, como no cartão de nota.
      //
      // Escrever é o duplo clique, e ele é daqui pela captura do ponteiro. Ver
      // `abrirParaEscrever`.
      onPointerDown={arrastar}
      onDoubleClick={abrirParaEscrever}
    >
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
                // Ctrl+Z / Ctrl+Y do TEXTO do papel. Ver `useHistoricoDeTexto`.
                const volta = historico.tratarTecla(event);
                if (volta !== false) {
                  if (volta) {
                    repor.current = volta.cursor;
                    setCursor(volta.cursor);
                    onChange({ texto: volta.texto });
                  }
                  return;
                }

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
            // inclui copiar um nome dele.
            //
            // O cursor é o de MOVER, e não mais o de texto: o clique simples
            // pega o papel, e uma barra piscando prometeria escrita onde o
            // gesto é de arrasto.
            className="absolute inset-0 overflow-hidden text-left text-neutral-900 select-text selection:bg-sky-400/50"
            style={{ ...medidaDoCorpo, ...tipografia }}
            aria-label="Escrever neste postit"
            title="Duplo clique para escrever"
            // Sem `stopPropagation` aqui: o pointerdown tem de CHEGAR ao papel,
            // que é quem arrasta agora. Quem impede o palco de ler o gesto como
            // clique no vazio -- e colar outro postit por cima deste com uma
            // ferramenta de mira na mão -- é o `startDrag` lá do palco.
            //
            // O duplo clique que abre para escrever também é do PAPEL, e não
            // deste corpo: ver `abrirParaEscrever`.
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;

              event.preventDefault();
              editar(postit.id);
            }}
          >
            {postit.texto ? (
              <PostitTextoView texto={postit.texto} vinculos={vinculos} />
            ) : (
              <span className="text-neutral-500 italic">
                Duplo clique para escrever
              </span>
            )}
          </div>
        </div>
      )}
    </div>

      {/* As alças e os botões só com o papel na mão SOZINHO, e fora da edição:
          acompanhado, quem manda é o gizmo do grupo; escrevendo, o que a mão
          está fazendo é texto, e uma fileira de botões por cima do campo
          disputaria o clique com a primeira linha.

          É aqui que mora o que a faixa guardava: cor do papel, ajuda e tirar
          do mapa. Mesmo desenho do cartão de nota. */}
      {selecionado && sozinho && !editando && !panMode && tool !== "ligacao" ? (
        <TransformHandles
          key={postit.id}
          box={{
            x: postit.x,
            y: postit.y,
            width: postit.largura,
            height: postit.altura,
            rotation: 0,
          }}
          // Sem giro: o papel não tem `rotation` no modelo.
          rotatable={false}
          handles={CORNER_HANDLES}
          onChange={({ x, y, width, height }) => {
            const tamanho =
              width !== undefined || height !== undefined
                ? postitNoTamanho(
                    width ?? postit.largura,
                    height ?? postit.altura,
                  )
                : undefined;

            onChange({
              // A cerca da área de trabalho vale para a alça como vale para o
              // arrasto: papel fora do alcance da câmera é papel perdido. Ver
              // `postitNaArea`.
              ...postitNaArea(
                x ?? postit.x,
                y ?? postit.y,
                tamanho?.largura ?? postit.largura,
                tamanho?.altura ?? postit.altura,
              ),
              ...tamanho,
            });
          }}
          papel={{
            escolhida: postit.cor,
            opcoes: CORES_POSTIT.map((cor) => ({
              valor: cor,
              rotulo: `Papel ${cor}`,
              classe: TINTA[cor],
            })),
            onEscolher: (cor) => onChange({ cor: cor as CorPostit }),
          }}
          fonte={{
            valor: fonte,
            menor:
              DOCUMENTO_FONTES.findIndex((f) => f >= fonte) > 0
                ? () => mudarFonte(-1)
                : undefined,
            maior:
              fonte < DOCUMENTO_FONTES[DOCUMENTO_FONTES.length - 1]!
                ? () => mudarFonte(1)
                : undefined,
          }}
          ajuda={<AjudaDoPostit />}
          onDelete={() => {
            // Fecha a edição antes: sem isto o store ficaria apontando para um
            // postit que não existe mais, e o próximo postit colado nasceria
            // sem o cursor dentro dele.
            if (editando) fechar();
            onRemove();
          }}
        />
      ) : null}
    </>
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
  ["Papel", "Arrastar em qualquer ponto move; duplo clique abre para escrever."],
  ["Bolinhas", "Com o papel na mão: tamanho da letra, cor, ajuda e tirar do mapa."],
  ["Cantos", "Com o papel na mão: as alças redimensionam."],
];

/**
 * A ajuda do postit: os sinais e os gestos que ele entende.
 *
 * Existe porque os sinais são invisíveis até alguém os conhecer: um papel em
 * branco não sugere que `@` complete um personagem, e o placeholder do campo
 * some na primeira letra.
 *
 * Só o CONTEÚDO: quem o abre é o botão redondo da fileira do gizmo, que também
 * é dono do popover. Antes o botão morava na faixa do papel, e a faixa saiu --
 * cor, ajuda e lixeira viraram bolinhas, como no cartão de nota.
 */
function AjudaDoPostit() {
  return (
    <>
      <p className="mb-2 text-xs font-medium">O que dá para escrever aqui</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        {COMANDOS.map(([sinal, faz]) => (
          <Fragment key={sinal}>
            <dt className="font-mono font-medium whitespace-nowrap">{sinal}</dt>
            <dd className="text-muted-foreground">{faz}</dd>
          </Fragment>
        ))}
      </dl>
    </>
  );
}
