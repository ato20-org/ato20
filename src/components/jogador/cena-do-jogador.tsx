"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { SceneLayer } from "@/components/playground/scene-layer";
import { useSceneScale } from "@/components/playground/scene-stage";
import { useMeusPersonagens } from "@/hooks/use-meus-personagens";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import {
  criarEnvioDeMovimentos,
  type EnvioDeMovimentos,
} from "@/lib/player/movimentos";
import {
  limiteDoMovimento,
  podePegar,
  prenderNoLimite,
} from "@/lib/sync/movimento";
import type { RolagemDaMesa } from "@/types/dado";
import {
  ehQuadro,
  type CanvasItem,
  type Portrait,
  type Scene,
} from "@/types/scene";

/**
 * O menor alvo de toque, em pixels de tela.
 *
 * O celular desenha a cena de 1920 numa tela de uns 400: um token de cem
 * unidades vira um quadrado de vinte pixels, metade de um dedo. A área que
 * pega o token cresce até isto, e o desenho continua do tamanho dele.
 */
const ALVO_PX = 44;

/**
 * Quanto o celular espera a mesa confirmar o lugar onde o dedo soltou.
 *
 * Até lá o token fica onde o jogador o largou, e não onde a última amostra
 * publicada dizia -- sem isto ele voltaria um passo e depois saltaria para a
 * frente, porque o eco do Mestre chega um pouco atrasado. Se a confirmação não
 * vier nesse tempo, a mesa não aceitou (o mestre travou o token no meio, ou a
 * janela dele está fechada), e o token volta ao lugar de verdade.
 */
const ESPERA_MS = 2_000;

/** Folga para comparar a posição que voltou com a que foi mandada. */
const MESMO_LUGAR = 0.01;

type NaMao = {
  itemId: string;
  x: number;
  y: number;
  /** O dedo já saiu: agora é só esperar o eco. Ver `ESPERA_MS`. */
  solto: boolean;
};

/**
 * A cena no celular, com os tokens do jogador pegáveis.
 *
 * O arrasto é AO VIVO: a posição sobe dez vezes por segundo, o Mestre aplica
 * no board e republica, e a TV e os outros celulares veem o token andar
 * enquanto o dedo anda. Quem continua sendo a autoridade sobre o que as telas
 * mostram é o Mestre -- o celular pede, e a mesa confere duas vezes: o daemon,
 * se o personagem é deste jogador; a janela, se o item é daquele personagem, se
 * está no ar e se não está travado. Ver `destinoAceito`.
 *
 * No próprio celular o token acompanha o dedo sem esperar a volta: esperar
 * seria arrastar com um quinto de segundo de atraso.
 *
 * Mora DENTRO do `SceneStage` porque o arrasto precisa da escala, e as alças
 * vivem no plano de controles, por cima do conteúdo. Por cima também da névoa
 * e dos retratos: o jogador pega o próprio token de onde ele estiver.
 */
export function CenaDoJogador({
  codigo,
  cena,
  portraits,
  rolagens,
}: {
  codigo: string;
  cena: Scene;
  portraits: Portrait[];
  rolagens: RolagemDaMesa[];
}) {
  const quadro = ehQuadro(cena);

  // Os personagens que estão no mapa. Mudou -- o mestre soltou um token, ou a
  // cena é outra --, e o celular pergunta de novo quais deles são seus.
  const chave = useMemo(
    () =>
      [
        ...new Set(
          cena.items.flatMap((item) =>
            item.personagemId ? [item.personagemId] : [],
          ),
        ),
      ]
        .sort()
        .join(","),
    [cena.items],
  );

  const { meus, reler } = useMeusPersonagens(codigo, chave);

  const { scale } = useSceneScale();
  const startDrag = useSceneDrag();

  const [naMao, setNaMao] = useState<NaMao | null>(null);

  /**
   * O envio mora num `ref` criado no efeito, e não num `useMemo`.
   *
   * O envio cancelado não volta, e em desenvolvimento o React monta, desmonta
   * e remonta cada efeito: um `useMemo` cancelado na primeira desmontagem
   * deixaria o celular arrastando sem mandar nada.
   */
  const envioRef = useRef<EnvioDeMovimentos | null>(null);
  const esperaRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    const envio = criarEnvioDeMovimentos(codigo, () => {
      // O mestre tirou o personagem deste jogador, ou o jogador da mesa: o
      // token volta ao lugar, e a lista é relida.
      setNaMao(null);
      reler();
    });
    envioRef.current = envio;

    return () => {
      envio.cancelar();
      envioRef.current = null;
    };
  }, [codigo, reler]);

  useEffect(() => () => clearTimeout(esperaRef.current), []);

  /**
   * O fim da espera, conferido a cada quadro que chega.
   *
   * Três saídas: o eco trouxe o token ao lugar onde o dedo soltou; o token saiu
   * da cena; ou deixou de ser deste jogador no meio do gesto -- o mestre o
   * travou, ou tirou o personagem dele. Nas duas últimas a alça desmonta sob o
   * dedo e o `pointerup` nunca chega, então é aqui que o token é largado.
   *
   * Durante o render, e não num efeito: é o ajuste de estado a partir do que
   * mudou, e num efeito o token pintaria um quadro na posição velha antes de
   * ser corrigido. Condicional, então não repete: no render seguinte `naMao`
   * já é `null`.
   */
  const noAr = naMao
    ? cena.items.find((item) => item.id === naMao.itemId)
    : undefined;

  if (
    naMao &&
    (!noAr ||
      !podePegar(noAr, meus) ||
      (naMao.solto &&
        Math.abs(noAr.x - naMao.x) < MESMO_LUGAR &&
        Math.abs(noAr.y - naMao.y) < MESMO_LUGAR))
  ) {
    setNaMao(null);
  }

  // A cena com o token onde o dedo está. Só o item segurado muda de
  // identidade: o `CanvasItemView` é `memo`, e o resto do mapa não redesenha.
  const exibida = useMemo(() => {
    if (!naMao) return cena;

    return {
      ...cena,
      items: cena.items.map((item) =>
        item.id === naMao.itemId ? { ...item, x: naMao.x, y: naMao.y } : item,
      ),
    };
  }, [cena, naMao]);

  const pegaveis = useMemo(
    () => (quadro ? [] : exibida.items.filter((item) => podePegar(item, meus))),
    [quadro, exibida.items, meus],
  );

  function pegar(event: ReactPointerEvent, item: CanvasItem) {
    const personagemId = item.personagemId;
    if (!personagemId) return;

    clearTimeout(esperaRef.current);

    const limite = limiteDoMovimento(cena);
    const origem = { x: item.x, y: item.y };
    let destino = origem;
    let andou = false;

    setNaMao({ itemId: item.id, ...origem, solto: false });

    startDrag(event, {
      onMove: (delta) => {
        destino = prenderNoLimite(
          item,
          origem.x + delta.x,
          origem.y + delta.y,
          limite,
        );
        andou = true;

        setNaMao({ itemId: item.id, ...destino, solto: false });
        envioRef.current?.mover({ personagemId, itemId: item.id, ...destino });
      },
      onEnd: () => {
        // Um toque sem arrasto não é movimento: nada sobe, e o token fica.
        if (!andou) {
          setNaMao(null);
          return;
        }

        envioRef.current?.soltar({ personagemId, itemId: item.id, ...destino });
        setNaMao({ itemId: item.id, ...destino, solto: true });

        esperaRef.current = setTimeout(() => {
          setNaMao((atual) =>
            atual?.itemId === item.id && atual.solto ? null : atual,
          );
        }, ESPERA_MS);
      },
    });
  }

  return (
    <>
      {/* `tela`: o celular recebe a mesma cena que a TV, e desenha numa tela
          de 400px de largura. Sem a variante ele baixava os 8 MB do mapa para
          decodificar 51 MB de bitmap -- por celular, e são N na mesa. Ver
          `SceneLayer.variante`. */}
      <SceneLayer
        scene={exibida}
        portraits={portraits}
        rolagens={rolagens}
        smooth
        naMao={naMao?.itemId}
        variante="tela"
      />

      {pegaveis.map((item) => (
        <AlcaDoToken
          key={item.id}
          item={item}
          scale={scale}
          segurando={naMao?.itemId === item.id && !naMao.solto}
          onPointerDown={pegar}
        />
      ))}
    </>
  );
}

/**
 * Onde o dedo pega o token, e o anel que diz "este é o seu".
 *
 * O anel é de propósito: numa mesa com seis tokens, o jogador que abre o
 * celular precisa achar o dele sem perguntar, e precisa descobrir que pode
 * arrastá-lo. Só o celular dele desenha isto -- a TV não sabe quais tokens são
 * de jogador, pelo mesmo motivo de o contorno do mestre não ir para a mesa.
 *
 * Um círculo em volta do centro: não gira com o token, e a maioria dos tokens
 * já é redonda. A área de toque é o círculo maior, invisível; o anel tem o
 * tamanho do desenho.
 */
function AlcaDoToken({
  item,
  scale,
  segurando,
  onPointerDown,
}: {
  item: CanvasItem;
  scale: number;
  segurando: boolean;
  onPointerDown: (event: ReactPointerEvent, item: CanvasItem) => void;
}) {
  const lado = Math.max(item.width, item.height);
  // Em unidades de cena: o plano de controles amplia pelo `scale`, então um
  // pixel de tela aqui dentro são `1 / scale` unidades.
  const alcance = Math.max(lado, ALVO_PX / scale);
  const px = 1 / scale;

  const centroX = item.x + item.width / 2;
  const centroY = item.y + item.height / 2;

  return (
    <div
      aria-hidden
      className="pointer-events-auto absolute top-0 left-0 touch-none rounded-full"
      style={{
        width: alcance,
        height: alcance,
        transform: `translate(${centroX - alcance / 2}px, ${centroY - alcance / 2}px)`,
      }}
      onPointerDown={(event) => onPointerDown(event, item)}
    >
      <div
        className="absolute rounded-full transition-shadow duration-150"
        style={{
          inset: (alcance - lado) / 2,
          // Branco com halo escuro: aparece por cima de mapa claro e de mapa
          // escuro. Segurando, o anel engrossa -- é a confirmação de que o
          // dedo pegou.
          boxShadow: segurando
            ? `0 0 0 ${2.5 * px}px rgb(255 255 255 / 0.95), 0 0 ${10 * px}px ${2 * px}px rgb(0 0 0 / 0.55)`
            : `0 0 0 ${1.5 * px}px rgb(255 255 255 / 0.55), 0 0 ${6 * px}px rgb(0 0 0 / 0.5)`,
        }}
      />
    </div>
  );
}
