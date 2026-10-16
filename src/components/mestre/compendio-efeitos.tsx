"use client";

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { Crosshair, Maximize2, Tags, Trash2, Upload, WandSparkles } from "lucide-react";

import { ItensDeMover } from "@/components/mestre/arvore-de-pastas";
import {
  AcaoDaLinha,
  ArvoreDoCompendio,
  Cartao,
  daMaoNoCartao,
  falhou,
  filtrando,
  Lendo,
  NadaCom,
  useEmCimaDoCartao,
  type EdicaoDeTags,
} from "@/components/mestre/compendio-cartao";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { TiroEmLaco } from "@/components/playground/tiro-em-laco";
import { Button } from "@/components/ui/button";
import { AreaDeEfeitoLayer } from "@/components/playground/area-de-efeito-layer";
import { DeclarativoProvider, useDeclarativo } from "@/components/playground/declarativo";
import { FiguraComEfeitos } from "@/components/playground/figura-com-efeitos";
import type { Kit } from "@/components/ui/menu-kit";
import { useTokenDrag, type TokenParaArrastar } from "@/hooks/use-token-drag";
import { COR_DA_AREA, ladoDaCasa } from "@/lib/area-de-efeito";
import { SUGESTOES } from "@/lib/condicao";
import { EFEITOS_DE_DISPARO } from "@/lib/disparo-de-efeito";
import { copiaParaACampanha, EFEITOS_DE_FABRICA, especieDoEfeito } from "@/lib/efeitos";
import { t } from "@/lib/i18n/mestre";
import { filtrarNoCompendio, type FiltroDoCompendio } from "@/lib/mestre/compendio";
import { useCondicoesStore } from "@/lib/store/use-condicoes-store";
import { useCondicoesDoCompendioStore } from "@/lib/store/use-condicoes-do-compendio-store";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { pastaDoMembro } from "@/lib/mestre/arvore-de-pastas";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { CORES_LAPIS, useToolStore } from "@/lib/store/use-tool-store";
import {
  useTokenDragStore,
  type CondicaoNaMao,
  type FonteDoArrasto,
} from "@/lib/store/use-token-drag-store";
import { DECLARATIVO_VAZIO, type Declarativo } from "@/lib/sync/declarativo";
import { cn } from "@/lib/utils";
import { levarAoCompendio } from "@/lib/vault/compendio";
import type { DefinicaoDeEfeito } from "@/types/efeito";
import type { AreaDeEfeito, ListaDoCompendio, Pasta } from "@/types/scene";

import boneco from "./boneco-do-efeito.svg";

const texto = t.compendio;

export { especieDoEfeito, type EspecieDeEfeito } from "@/lib/efeitos";

/**
 * A cor em que o efeito aparece no card e na prévia: a do chão, no de área; no
 * de personagem, a da condição que o usa -- é nela que a mesa o vê --, e a da
 * luz quando ninguém o usa ainda.
 *
 * O de personagem que é cópia de um de fábrica pinta "na cor da condição", e
 * não tem cor própria: leva a da condição que o ATO20 sugere com ele, achada
 * pelo título ("Em chamas", laranja). O resto, uma da paleta escolhida pelo
 * id -- sempre a mesma para o mesmo efeito, e uma grade de várias cores, e
 * não oito cards iguais.
 */
export function corDoEfeito(efeito: DefinicaoDeEfeito, corDeQuemUsa?: string): string {
  return (
    efeito.area?.cor ??
    corDeQuemUsa ??
    efeito.luz?.cor ??
    COR_DA_SUGESTAO.get(efeito.titulo) ??
    CORES_LAPIS[somaDoId(efeito.id) % CORES_LAPIS.length] ??
    COR_DA_AREA
  );
}

/** Título do efeito de fábrica -> a cor da condição sugerida que o usa. */
const COR_DA_SUGESTAO: ReadonlyMap<string, string> = new Map(
  SUGESTOES.flatMap((sugestao) => {
    const pronto = EFEITOS_DE_FABRICA.find((efeito) => efeito.id === sugestao.efeito);
    return pronto ? [[pronto.titulo, sugestao.cor] as const] : [];
  }),
);

function somaDoId(id: string): number {
  let soma = 0;
  for (const letra of id) soma = (soma * 31 + letra.charCodeAt(0)) >>> 0;
  return soma;
}

/**
 * A cor de cada efeito pela condição que o usa: o menu primeiro, que é o que
 * a mesa vê, e a biblioteca depois.
 */
export function useCoresPelasCondicoes(): ReadonlyMap<string, string> {
  const menu = useCondicoesStore((state) => state.modelos);
  const biblioteca = useCondicoesDoCompendioStore((state) => state.lista);

  return useMemo(() => {
    const cores = new Map<string, string>();
    for (const condicao of [...(menu ?? []), ...(biblioteca ?? [])]) {
      if (condicao.efeito && !cores.has(condicao.efeito)) cores.set(condicao.efeito, condicao.cor);
    }
    return cores;
  }, [menu, biblioteca]);
}

/**
 * A condição que um efeito vira solto num token: efeito só aparece na figura
 * por uma condição. A que já o usa -- o menu primeiro, a biblioteca depois, a
 * ordem de `useCoresPelasCondicoes` --, ou uma com o nome e a cor dele.
 *
 * Lida na hora do gesto, e não assinada: o card não redesenha quando uma
 * condição muda de efeito. O do ATO20 passa as condições de LÁ: os ids dos
 * efeitos dele não são os da campanha.
 */
export function condicaoDoEfeito(
  efeito: DefinicaoDeEfeito,
  cor: string,
  condicoes: ReadonlyArray<CondicaoNaMao> = [
    ...(useCondicoesStore.getState().modelos ?? []),
    ...(useCondicoesDoCompendioStore.getState().lista ?? []),
  ],
): CondicaoNaMao {
  const dona = condicoes.find((condicao) => condicao.efeito === efeito.id);

  return dona
    ? { nome: dona.nome, cor: dona.cor, icone: dona.icone, efeito: efeito.id }
    : { nome: efeito.titulo, cor, icone: "brilho", efeito: efeito.id };
}

/** O diâmetro da área nova, em casas da grade. A roda muda no ar. */
const CASAS_DA_AREA_NOVA = 3;

/**
 * O que o card de um efeito leva na mão, do Compêndio da campanha ou do ATO20:
 * o de personagem, a condição que ele vira num token (ver `condicaoDoEfeito`);
 * o de área, um CÍRCULO no chão, de três casas da grade da cena aberta.
 *
 * Lido na hora do gesto: a grade é a da cena aberta AGORA.
 */
export function arrastoDoEfeito(
  efeito: DefinicaoDeEfeito,
  cor: string,
  de: { doAto20?: boolean; condicoes?: ReadonlyArray<CondicaoNaMao> } = {},
): TokenParaArrastar {
  const doAto20 = de.doAto20 ? { doAto20: true } : {};

  if (especieDoEfeito(efeito) === "area") {
    const grade = selectEditingScene(useSceneStore.getState())?.grid;
    const lado = CASAS_DA_AREA_NOVA * ladoDaCasa(grade);
    return { fonte: { tipo: "area", efeitoId: efeito.id, cor, ...doAto20 }, largura: lado, altura: lado };
  }

  return {
    fonte: {
      tipo: "efeito",
      efeitoId: efeito.id,
      condicao: condicaoDoEfeito(efeito, cor, de.condicoes),
      ...doAto20,
    },
    largura: 0,
    altura: 0,
  };
}

/** O efeito na mão, quando ele é do Compêndio pedido: o card dele esmaece. */
export function efeitoNaMao(fonte: FonteDoArrasto | undefined, doAto20: boolean): string | null {
  // O disparo só se arrasta da campanha: é para uma pasta dela.
  if (fonte?.tipo === "disparo") return doAto20 ? null : fonte.efeitoId;
  return (fonte?.tipo === "efeito" || fonte?.tipo === "area") && Boolean(fonte.doAto20) === doAto20
    ? fonte.efeitoId
    : null;
}

/**
 * O desenho do card de um efeito: o de área, a varinha, que com a mão sobre o
 * card dá lugar ao chão pegando fogo; o disparo, a mira, que dá lugar ao tiro
 * voando. O de personagem anima no card da condição dele -- ver
 * `DesenhoDaCondicao`.
 */
export function DesenhoDoEfeito({ efeito, cor }: { efeito: DefinicaoDeEfeito; cor: string }) {
  return especieDoEfeito(efeito) === "disparo" ? (
    <TiroDoEfeito efeito={efeito} cor={cor} />
  ) : (
    <ChaoDoEfeito efeito={efeito} cor={cor} />
  );
}

/**
 * O tiro de um disparo, no card. Parado, a mira; com a mão sobre o card, o
 * tiro voa (ou o leque abre) em laço, e a mira some. Só o card sob a mão monta
 * o tiro, pela razão do chão: cada um é um forno.
 */
function TiroDoEfeito({ efeito, cor }: { efeito: DefinicaoDeEfeito; cor: string }) {
  const emCima = useEmCimaDoCartao();

  return (
    <>
      {emCima ? <TiroNoCartao efeito={efeito} /> : null}
      <span
        className={cn(
          "relative grid size-11 place-items-center rounded-full transition-opacity duration-500",
          emCima && "opacity-0",
        )}
        style={{ backgroundColor: "rgba(0, 0, 0, 0.45)", boxShadow: `inset 0 0 0 3px ${cor}` }}
      >
        <Crosshair className="size-5" style={{ color: cor }} aria-hidden />
      </span>
    </>
  );
}

/** Os pontos do tiro no pedaço de mapa do card: a linha de ponta a ponta, o cone da esquerda. */
// O alvo longe da borda direita: o estouro da bola de fogo tem três casas.
const LINHA_DO_CARTAO = { de: { x: 40, y: 170 }, para: { x: 380, y: 170 } };
const CONE_DO_CARTAO = { de: { x: 40, y: 150 }, para: { x: 420, y: 150 } };

function TiroNoCartao({ efeito }: { efeito: DefinicaoDeEfeito }) {
  const [caixa, largura] = useLarguraDoCartao();

  return (
    <span ref={caixa} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {largura > 0 ? (
        <span
          className="absolute top-0 left-0"
          style={{
            width: MUNDO_DO_CARTAO.largura,
            height: MUNDO_DO_CARTAO.altura,
            transform: `scale(${largura / MUNDO_DO_CARTAO.largura})`,
            transformOrigin: "0 0",
          }}
        >
          <TiroEmLaco efeito={efeito} linha={LINHA_DO_CARTAO} cone={CONE_DO_CARTAO} />
        </span>
      ) : null}
    </span>
  );
}

/** A largura do card, que muda com a janela: duas colunas na de 320, três na de 480. */
function useLarguraDoCartao(): [RefObject<HTMLSpanElement | null>, number] {
  const ref = useRef<HTMLSpanElement>(null);
  const [px, setPx] = useState(0);

  useLayoutEffect(() => {
    const aqui = ref.current;
    if (!aqui) return;

    setPx(aqui.clientWidth);
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setPx(entrada.contentRect.width);
    });
    observador.observe(aqui);
    return () => observador.disconnect();
  }, []);

  return [ref, px];
}

/**
 * O chão de um efeito de área, no card. Parado, a varinha; com a mão sobre o
 * card, a área anima por baixo dela e a varinha some.
 *
 * Só o card sob a mão monta a área, pela razão do boneco: cada área é um forno
 * e uma folha animada, e a grade inteira tocando seria a mesa inteira em
 * chamas. A varinha some devagar, e não de uma vez: o forno leva um instante
 * para assar, e o card não pode piscar vazio nesse meio.
 */
function ChaoDoEfeito({ efeito, cor }: { efeito: DefinicaoDeEfeito; cor: string }) {
  const emCima = useEmCimaDoCartao();

  return (
    <>
      {emCima ? <ChaoComEfeito efeito={efeito} cor={cor} /> : null}
      <span
        className={cn(
          "relative grid size-11 place-items-center rounded-full transition-opacity duration-500",
          emCima && "opacity-0",
        )}
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.45)",
          boxShadow: `inset 0 0 0 3px ${cor}`,
        }}
      >
        <WandSparkles className="size-5" style={{ color: cor }} aria-hidden />
      </span>
    </>
  );
}

/**
 * O pedaço de mapa da prévia, em unidades de cena: seis casas por três, a
 * faixa do card. A área deita na metade de baixo e ocupa a largura toda; a de
 * cima é para o fogo e a névoa subirem.
 *
 * Seis casas, e não quatro: com quatro, a chama de casa e meia enchia a faixa
 * e saía cortada pelo topo -- uma parede de fogo, e não um chão pegando fogo.
 */
const MUNDO_DO_CARTAO = { largura: 576, altura: 288 };
const AREA_DO_CARTAO = { x: 0, y: 144, width: 576, height: 144 };

function ChaoComEfeito({ efeito, cor }: { efeito: DefinicaoDeEfeito; cor: string }) {
  const caixa = useRef<HTMLSpanElement>(null);
  const [largura, setLargura] = useState(0);

  // A escala pela largura do card, que muda com a janela: duas colunas na de
  // 320, três na de 480.
  useLayoutEffect(() => {
    const aqui = caixa.current;
    if (!aqui) return;

    setLargura(aqui.clientWidth);
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setLargura(entrada.contentRect.width);
    });
    observador.observe(aqui);
    return () => observador.disconnect();
  }, []);

  // Um declarativo só com este efeito, como no boneco e na prévia do editor.
  const declarativo = useMemo<Declarativo>(
    () => ({
      ...DECLARATIVO_VAZIO,
      efeitos: { [efeito.id]: { ...efeito, origem: { acervo: true } } },
    }),
    [efeito],
  );
  const areas = useMemo<AreaDeEfeito[]>(
    () => [{ id: "chao-do-cartao", ...AREA_DO_CARTAO, efeito: efeito.id, cor, naMesa: true }],
    [efeito.id, cor],
  );

  return (
    <span ref={caixa} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {largura > 0 ? (
        <span
          className="absolute top-0 left-0"
          style={{
            width: MUNDO_DO_CARTAO.largura,
            height: MUNDO_DO_CARTAO.altura,
            transform: `scale(${largura / MUNDO_DO_CARTAO.largura})`,
            transformOrigin: "0 0",
          }}
        >
          <DeclarativoProvider valor={declarativo}>
            <AreaDeEfeitoLayer areas={areas} grid={undefined} variant="mesa" />
          </DeclarativoProvider>
        </span>
      ) : null}
    </span>
  );
}

/** O lado do boneco, em pixels: o do selo da condição. */
const LADO_DO_BONECO = 44;

/**
 * Um boneco de pé no chão do card, com um efeito de personagem animando nele
 * como num token do mapa -- o mesmo `FiguraComEfeitos` do palco, como a prévia
 * do editor. É o que o card da condição mostra com a mão em cima.
 *
 * Embaixo, e não no meio: o fogo e a névoa crescem para cima até uma vez e
 * meia a figura, e com ela no meio da faixa sairiam pelo topo.
 *
 * O efeito se acha no declarativo do Mestre -- o de fábrica, o de plugin, o da
 * campanha em jogo. `definicao` é para o que não está lá: o guardado no
 * Compêndio, que não vai à mesa, e o do ATO20, que nem é desta campanha.
 *
 * Quem chama monta só no card sob a mão: a grade inteira animando seriam
 * quarenta e oito fogos assando e tocando ao mesmo tempo.
 */
export function BonecoComEfeito({
  efeitoId,
  definicao,
  cor,
}: {
  efeitoId: string;
  definicao?: DefinicaoDeEfeito;
  cor: string;
}) {
  const ambiente = useDeclarativo();
  const pedidos = useMemo(() => [{ efeito: efeitoId, cor }], [efeitoId, cor]);
  const declarativo = useMemo<Declarativo>(
    () =>
      definicao
        ? {
            ...ambiente,
            efeitos: { ...ambiente.efeitos, [efeitoId]: { ...definicao, origem: { acervo: true } } },
          }
        : ambiente,
    [ambiente, definicao, efeitoId],
  );

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2"
      style={{ width: LADO_DO_BONECO, height: LADO_DO_BONECO }}
    >
      <span className="absolute -bottom-1 left-1/2 h-2 w-4/5 -translate-x-1/2 rounded-full bg-black/40 blur-[2px]" />
      <DeclarativoProvider valor={declarativo}>
        <FiguraComEfeitos
          efeitos={pedidos}
          url={boneco.src}
          semente={efeitoId}
          alcance={{ livre: true, largura: LADO_DO_BONECO }}
        >
          {(fonte) => <ImagemDoBoneco fonte={fonte} />}
        </FiguraComEfeitos>
      </DeclarativoProvider>
    </span>
  );
}

function ImagemDoBoneco({ fonte }: { fonte: string | null }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fonte ?? boneco.src}
      alt=""
      draggable={false}
      className="absolute inset-0 size-full select-none"
    />
  );
}

/**
 * Os efeitos de ÁREA guardados no Compêndio da campanha, em cards. Os de
 * personagem não têm lista própria: moram na condição que os usa.
 *
 * Fora do jogo: não aparecem no gizmo da área nem no seletor da condição, e
 * não contam nos trinta e dois. Clicar abre o editor no lugar da lista -- o
 * mesmo da Configuração. Ao jogo, o efeito vai pelo arrasto: solto no mapa ou
 * num token, que é onde ele aparece. Um botão que só o tirava daqui, sem pôr
 * em lugar nenhum que se visse, fazia parecer que ele tinha sumido.
 */
export function EfeitosNoCompendio({
  especie = "area",
  filtro,
  pastas,
  onCriarEm,
  onAbrir,
  onGuardado,
  onApagar,
  onEditarTags,
}: {
  /** A aba de dentro: os de área ou os disparos. */
  especie?: "area" | "disparo";
  filtro: FiltroDoCompendio;
  /** As pastas da aba aberta: a dos efeitos de área, ou a dos disparos. */
  pastas: Pasta[];
  onCriarEm: (pastaId: string) => void;
  onAbrir: (id: string) => void;
  onGuardado: () => void;
  onApagar: (efeito: DefinicaoDeEfeito) => void;
  onEditarTags: (edicao: EdicaoDeTags) => void;
}) {
  const moldes = useEfeitosDaCampanhaStore((state) => state.moldes);
  const cores = useCoresPelasCondicoes();
  const buscando = filtrando(filtro);
  const [trazendo, setTrazendo] = useState(false);

  const lista = useMemo(
    () => moldes?.filter((efeito) => especieDoEfeito(efeito) === especie) ?? null,
    [moldes, especie],
  );

  /**
   * Os disparos de fábrica, guardados no Compêndio como moldes da campanha: o
   * ponto de partida de quem nunca fez um. Só com a lista vazia, como as
   * sugestões de condição -- no meio de uma lista montada, duplicaria o fogo.
   */
  async function trazerOsProntos() {
    setTrazendo(true);
    const { criarMolde, salvar } = useEfeitosDaCampanhaStore.getState();
    for (const pronto of EFEITOS_DE_DISPARO) {
      const novo = await criarMolde();
      if (novo) salvar({ ...copiaParaACampanha(pronto, novo.id, pronto.titulo), compendio: true });
    }
    setTrazendo(false);
  }
  const achados = useMemo(
    () =>
      lista
        ? filtrarNoCompendio(lista, filtro, (efeito) => efeito.titulo, (efeito) => efeito.tags ?? [])
        : null,
    [lista, filtro],
  );

  const guardarNoAto20 = useCallback(
    (efeito: DefinicaoDeEfeito) => {
      void levarAoCompendio({ efeitos: [efeito.id] }).then(() => {
        onGuardado();
        toast.success(texto.guardadoNoAto20(efeito.titulo));
      }, falhou);
    },
    [onGuardado],
  );

  if (achados === null) return <Lendo />;
  if (lista?.length === 0 && pastas.length === 0)
    return especie === "disparo" ? (
      <div className="space-y-2 p-2">
        <PainelVazio conteudo={{ tipo: "compendio" }}>{texto.vazioDisparos}</PainelVazio>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={trazendo}
          onClick={() => void trazerOsProntos()}
        >
          {texto.trazerDisparosProntos}
        </Button>
      </div>
    ) : (
      <PainelVazio conteudo={{ tipo: "compendio" }}>
        {texto.vazioEfeitosDeArea}
      </PainelVazio>
    );
  if (buscando && achados.length === 0) return <NadaCom filtro={filtro} />;

  return (
    <ArvoreDoCompendio
      achados={achados}
      pastas={pastas}
      buscando={buscando}
      rotuloCriarAqui={especie === "disparo" ? texto.criarDisparoAqui : texto.criarEfeitoAqui}
      onCriarEm={onCriarEm}
      linha={(efeito, _depth, caminho) => (
        <CartaoDoEfeito
          key={efeito.id}
          efeito={efeito}
          caminho={caminho}
          pastas={pastas}
          lista={especie === "disparo" ? "compendio-disparos" : "compendio-efeitos"}
          cor={corDoEfeito(efeito, cores.get(efeito.id))}
          onAbrir={onAbrir}
          onGuardarNoAto20={guardarNoAto20}
          onApagar={onApagar}
          onEditarTags={onEditarTags}
        />
      )}
    />
  );
}

const CartaoDoEfeito = memo(function CartaoDoEfeito({
  efeito,
  caminho,
  pastas,
  lista,
  cor,
  onAbrir,
  onGuardarNoAto20,
  onApagar,
  onEditarTags,
}: {
  efeito: DefinicaoDeEfeito;
  /** A pasta dele, na busca: a lista plana não mostra onde cada um mora. */
  caminho?: string;
  pastas: Pasta[];
  /** De que árvore são as pastas: a dos efeitos de área ou a dos disparos. */
  lista: ListaDoCompendio;
  cor: string;
  onAbrir: (id: string) => void;
  onGuardarNoAto20: (efeito: DefinicaoDeEfeito) => void;
  onApagar: (efeito: DefinicaoDeEfeito) => void;
  onEditarTags: (edicao: EdicaoDeTags) => void;
}) {
  const arrastar = useTokenDrag();
  const naMao = useTokenDragStore(
    (state) => efeitoNaMao(state.arrasto?.fonte, false) === efeito.id,
  );

  // O tiro sai do Compêndio como o arrasto: o molde vai ao jogo como cópia,
  // na hora em que o tiro sai, e não agora -- largar a mira não deixa cópia
  // nenhuma para trás. Ver `disparar`. Só o disparo atira; o de área, que se
  // solta no chão, se arrasta.
  const ehDisparo = especieDoEfeito(efeito) === "disparo";
  const disparar = () => useToolStore.getState().armarDisparo({ id: efeito.id });

  const itens = (kit: Kit) => {
    const { Item, Separator } = kit;

    return (
    <>
      <Item onClick={() => onAbrir(efeito.id)}>
        <Maximize2 />
        {texto.editar}
      </Item>
      {ehDisparo ? (
        <Item onClick={disparar}>
          <Crosshair />
          {texto.disparar}
        </Item>
      ) : null}
      <Item onClick={() => onGuardarNoAto20(efeito)}>
        <Upload />
        {texto.guardarNoAto20}
      </Item>
      <Item
        onClick={() =>
          onEditarTags({
            onde: "campanha",
            tipo: "efeito",
            id: efeito.id,
            nome: efeito.titulo,
            tags: efeito.tags ?? [],
          })
        }
      >
        <Tags />
        {texto.tagsNoMenu}
      </Item>
      <ItensDeMover
        kit={kit}
        atual={pastaDoMembro(pastas, efeito.id)}
        destinos={pastas}
        onMover={(destino) => useSceneStore.getState().moverNoCompendio(efeito.id, lista, destino)}
      />
      <Separator />
      <Item variant="destructive" onClick={() => onApagar(efeito)}>
        <Trash2 />
        {texto.apagar}
      </Item>
    </>
    );
  };

  return (
    <Cartao
      nome={efeito.titulo}
      detalhe={caminho || efeito.dica}
      tags={efeito.tags}
      faixa
      tinta={cor}
      titulo={texto.dicaDoEfeito(efeito.titulo)}
      imagem={<DesenhoDoEfeito efeito={efeito} cor={cor} />}
      onAbrir={() => onAbrir(efeito.id)}
      naMao={naMao}
      onPointerDown={(event) => {
        if (!daMaoNoCartao(event)) return;
        // O disparo não tem o que fazer no mapa -- ele sai pela mira --, e o
        // arrasto dele só leva a uma pasta. Ver `aceita`.
        arrastar(
          event,
          ehDisparo
            ? { fonte: { tipo: "disparo", efeitoId: efeito.id }, largura: 0, altura: 0 }
            : arrastoDoEfeito(efeito, cor),
        );
      }}
      acao={
        ehDisparo ? (
          <AcaoDaLinha rotulo={texto.dispararDica} onClick={disparar}>
            <Crosshair />
          </AcaoDaLinha>
        ) : null
      }
      itens={itens}
    />
  );
});
