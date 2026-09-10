"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Trash2 } from "lucide-react";

import { MARCA_LISTA, PostitSugestoes } from "@/components/operator/postit-sugestoes";
import { PostitTextoView, type Vinculos } from "@/components/operator/postit-texto-view";
import { useSceneScale } from "@/components/playground/scene-stage";
import { useAssetList } from "@/hooks/use-asset-list";
import { useCharacterOwners } from "@/hooks/use-character-owners";
import { useCharacters } from "@/hooks/use-characters";
import { usePlayers, presente } from "@/hooks/use-players";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { postitNaArea, postitNoTamanho } from "@/lib/geometry/postit";
import {
  aplicaSugestao,
  fantasmaDe,
  filtraSugestoes,
  fragmentoNoCursor,
  type Sinal,
  type Sugestao,
} from "@/lib/operator/postit-sugestao";
import { normaliza } from "@/lib/search";
import { POSTIT_Z, usePostitStore } from "@/lib/store/use-postit-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { cn } from "@/lib/utils";
import { CORES_POSTIT, type CorPostit, type Postit, type Scene } from "@/types/scene";

/**
 * De quanto em quanto tempo a lista de jogadores é relida, com postit na cena.
 *
 * A menção é de PERSONAGEM, e os personagens vêm do store compartilhado, que
 * não sonda nada. O que esta sondagem alimenta é só a bolinha: quem joga o
 * personagem está na mesa agora?
 *
 * Passo folgado de propósito: presença não muda no meio de uma frase. Os 5s da
 * lista de jogadores aberta serviriam a quem está olhando a lista; aqui é dado
 * de apoio numa camada que fica na tela a sessão inteira.
 */
const SONDAGEM_MS = 30_000;

/**
 * Tamanho do texto do postit, em unidades de cena.
 *
 * Unidades de cena, e não pixels de tela: o postit escala com o zoom, e é essa
 * decisão que o faz parecer papel colado no mapa em vez de janela flutuando
 * sobre ele. Afastar o mapa afasta o papel junto, com o texto dentro.
 */
const FONTE = 15;

/** Altura da faixa de arrasto, em unidades de cena. */
const FAIXA = 22;

/** Lado da alça de redimensionar, em unidades de cena. */
const ALCA = 16;

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
};

/** A bolinha de escolha de cor, na faixa. */
const TINTA: Record<CorPostit, string> = {
  amarelo: "bg-amber-400",
  rosa: "bg-pink-400",
  azul: "bg-sky-400",
  verde: "bg-emerald-400",
};

/**
 * Os postits do mestre, colados na cena.
 *
 * Mora aqui, no Operador, e NÃO no `SceneLayer` — mesma razão do `PinLayer`: o
 * `SceneLayer` é o mesmo componente no Assistir, na Plateia e na miniatura, e
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

  return <PostitCamada sceneId={scene.id} postits={postits} panMode={panMode} />;
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
  const { scale } = useSceneScale();

  const updatePostit = useSceneStore((state) => state.updatePostit);
  const removePostit = useSceneStore((state) => state.removePostit);
  const setEditingSceneId = useSceneStore((state) => state.setEditingSceneId);
  const scenes = useSceneStore((state) => state.board?.scenes);

  /**
   * Os personagens vêm do store compartilhado, e os jogadores da sondagem.
   *
   * Duas fontes porque são duas perguntas com pressa diferente. A lista de
   * personagens muda quando o mestre mexe nela, e o store já avisa todas as
   * telas — sondá-la seria IPC de graça. A presença de quem joga muda sozinha,
   * pelo celular de quem chega, e só um relógio percebe isso.
   */
  const { personagens } = useCharacters();
  const { players, agora } = usePlayers(SONDAGEM_MS);
  const donos = useCharacterOwners(players);

  const { assets: imagens } = useAssetList("image");
  const { assets: audios } = useAssetList("audio");

  /**
   * Os índices de busca, por nome sem acento e sem caixa.
   *
   * `normaliza` é o mesmo da busca de jogador e de personagem, e aqui ela
   * importa mais: o mestre escreve `@thalor` no meio da sessão, com a mão
   * pesada, e o vínculo não pode depender do acento.
   *
   * Um `Map` e não um `find` por token: um postit com seis menções faria seis
   * varreduras da lista a cada tecla digitada, porque o texto é reanalisado a
   * cada render.
   */
  const porPersonagem = useMemo(
    () => new Map((personagens ?? []).map((personagem) => [normaliza(personagem.nome), personagem])),
    [personagens],
  );

  /**
   * Se quem joga cada personagem está na mesa agora, por id de personagem.
   *
   * Separado de `donos` porque `donos` guarda NOME e a presença mora no
   * `Player`: cruzar os dois por nome falharia com dois jogadores de nome igual,
   * e é o tipo de erro que só aparece na mesa de alguém.
   */
  const presencaPorPersonagem = useMemo(() => {
    const porNome = new Map(players.map((player) => [player.nome, player]));
    const mapa = new Map<string, boolean>();

    for (const [personagemId, nomes] of donos) {
      // Vários donos é possível no dado: basta um deles na mesa para o
      // personagem contar como presente.
      mapa.set(
        personagemId,
        nomes.some((nome) => {
          const player = porNome.get(nome);
          return player ? presente(player, agora) : false;
        }),
      );
    }

    return mapa;
  }, [donos, players, agora]);

  const porArquivo = useMemo(() => {
    // Imagem primeiro e áudio depois, então um nome repetido entre os dois
    // acervos resolve na imagem. É o caso que tem o que fazer no clique.
    const mapa = new Map([...audios, ...imagens].map((asset) => [normaliza(asset.name), asset]));

    // Sem a extensão também: no acervo o arquivo é "porao.jpg", e ninguém
    // escreve a extensão numa anotação. A entrada com extensão continua
    // valendo, e não é sobrescrita por uma sem.
    for (const asset of [...audios, ...imagens]) {
      const semExtensao = normaliza(asset.name.replace(/\.[^.]+$/u, ""));
      if (!mapa.has(semExtensao)) mapa.set(semExtensao, asset);
    }

    return mapa;
  }, [imagens, audios]);

  const porCena = useMemo(
    () => new Map((scenes ?? []).map((scene) => [normaliza(scene.name), scene])),
    [scenes],
  );

  const vinculos = useMemo<Vinculos>(
    () => ({
      personagem(nome) {
        const personagem = porPersonagem.get(normaliza(nome));
        if (!personagem) return null;

        return {
          nome: personagem.nome,
          // O primeiro dono, quando há mais de um: o papel tem uma linha de
          // texto para isto, e a janela de personagens é onde se vê a lista
          // inteira.
          dono: donos.get(personagem.id)?.[0],
          presente: presencaPorPersonagem.get(personagem.id) ?? false,
        };
      },
      arquivo: (nome) => porArquivo.get(normaliza(nome)) ?? null,
      cena(nome) {
        const scene = porCena.get(normaliza(nome));
        if (!scene) return null;

        return { id: scene.id, name: scene.name };
      },
      irParaCena: setEditingSceneId,
    }),
    [porPersonagem, donos, presencaPorPersonagem, porArquivo, porCena, setEditingSceneId],
  );

  /**
   * O que cada sinal pode completar.
   *
   * Aqui e não dentro do papel, pela mesma razão dos índices acima: as listas
   * são as mesmas para todos os postits da cena, e montá-las por papel faria
   * cinco papéis abertos remontarem cinco cópias do acervo a cada tecla.
   *
   * A ordem É a ordem da lista quando o mestre ainda não digitou nada depois do
   * sinal. Personagem de quem está na mesa primeiro, porque a menção quase
   * sempre é de quem joga hoje; imagem antes de som, porque imagem é o que se
   * transmite.
   *
   * O detalhe de cada personagem é o nome de quem o joga, e é ele que resolve a
   * escolha real: numa campanha longa há dois personagens de nome parecido, e o
   * que distingue é de quem é cada um. Sem dono aparece "sem jogador" — PNJ, ou
   * ficha que ainda não foi entregue.
   */
  const candidatos = useMemo<Record<Sinal, Sugestao[]>>(
    () => ({
      "@": [...(personagens ?? [])]
        .sort(
          (a, b) =>
            Number(presencaPorPersonagem.get(b.id) ?? false) -
            Number(presencaPorPersonagem.get(a.id) ?? false),
        )
        .map((personagem) => ({
          nome: personagem.nome,
          detalhe: donos.get(personagem.id)?.[0] ?? "sem jogador",
        })),
      "/": [
        ...imagens.map((asset) => ({ nome: asset.name, detalhe: "imagem" })),
        ...audios.map((asset) => ({ nome: asset.name, detalhe: "som" })),
      ],
      ">": (scenes ?? []).map((scene) => ({ nome: scene.name, detalhe: "cena" })),
    }),
    [personagens, presencaPorPersonagem, donos, imagens, audios, scenes],
  );

  if (scale === 0) return null;

  return (
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
    </>
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
  candidatos: Record<Sinal, Sugestao[]>;
  onChange: (patch: Partial<Postit>) => void;
  onRemove: () => void;
}) {
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
  const fragmento = editando ? fragmentoNoCursor(postit.texto, cursor) : null;

  const sugestoes =
    fragmento && fragmento.inicio !== dispensadoEm
      ? filtraSugestoes(candidatos[fragmento.sinal], fragmento.prefixo, normaliza)
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
        onChange(postitNaArea(x + delta.x, y + delta.y, postit.largura, postit.altura)),
    });
  }

  function redimensionar(event: ReactPointerEvent) {
    if (panMode) return;

    const { largura, altura } = postit;

    startDrag(event, {
      onMove: (delta) => onChange(postitNoTamanho(largura + delta.x, altura + delta.y)),
    });
  }

  return (
    <div
      ref={papel}
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-[3px] shadow-lg ring-1",
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

        <button
          type="button"
          aria-label="Tirar este postit do mapa"
          className="shrink-0 opacity-0 transition-opacity hover:text-red-700 group-hover:opacity-100"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            // Fecha a edição antes: sem isto o store ficaria apontando para um
            // postit que não existe mais, e o próximo postit colado nasceria
            // sem o cursor dentro dele.
            if (editando) fechar();
            onRemove();
          }}
        >
          <Trash2 style={{ width: FAIXA * 0.6, height: FAIXA * 0.6 }} />
        </button>
      </div>

      {editando ? (
        // `relative` para o espelho poder cobrir exatamente a mesma caixa do
        // campo. Sem o embrulho, o campo é filho direto da coluna do papel e o
        // espelho não teria a que se ancorar.
        <div className="relative flex-1">
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
            className="pointer-events-none absolute inset-0 overflow-hidden p-1.5 whitespace-pre-wrap wrap-break-word"
            style={{ fontSize: FONTE, lineHeight: 1.35 }}
          >
            <span className="invisible">{postit.texto.slice(0, cursor)}</span>

            {/* Largura zero: é só um lugar no texto, e qualquer largura aqui
                empurraria o resto do espelho para a direita e desalinharia a
                medida do que ela mesma existe para medir. */}
            <span ref={marca} className="inline-block w-0" />

            {fantasma ? <span className="text-neutral-900/35">{fantasma}</span> : null}

            <span className="invisible">{postit.texto.slice(cursor)}</span>
          </div>

          <textarea
            ref={campo}
            className="absolute inset-0 size-full resize-none bg-transparent p-1.5 text-neutral-900 outline-none"
            style={{ fontSize: FONTE, lineHeight: 1.35 }}
            aria-label="Texto do postit"
            placeholder="@personagem  /arquivo  >cena  **negrito**"
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
              if (lista && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                event.preventDefault();

                const passo = event.key === "ArrowDown" ? 1 : -1;
                // Circular: da última volta para a primeira. Numa lista de até
                // seis itens, bater no fim e parar é mais irritante que útil.
                setIndice((atual) => {
                  const proximo = (Math.min(atual, sugestoes.length - 1) + passo) % sugestoes.length;
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
            <PostitSugestoes
              sinal={fragmento.sinal}
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
      ) : (
        // `div` com papel de botão, e não um `<button>`: o texto renderizado
        // tem botões DENTRO dele — o `/arquivo` e o `>cena` —, e botão dentro
        // de botão é marcação inválida que o navegador desmancha, levando com
        // ela o clique dos dois. O foco e o Enter vêm à mão logo abaixo.
        <div
          role="button"
          tabIndex={0}
          className="flex-1 cursor-text overflow-hidden p-1.5 text-left text-neutral-900"
          style={{ fontSize: FONTE, lineHeight: 1.35 }}
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
