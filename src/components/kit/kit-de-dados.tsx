"use client";

import { memo, useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { DadoFacetas } from "@/components/mestre/dado-facetas";
import { desenharDado, duracaoDaQueda, quadroDaQueda } from "@/lib/geometry/dado";
import {
  impulsoNoKit,
  lancamentoNoKit,
  lerPedido,
  type DadoParaLancar,
  type LugarNoLote,
} from "@/lib/kit-de-dados";
import { RAIO_DADO } from "@/lib/store/use-dados-store";
import { tipoDado } from "@/types/dado";

/**
 * A largura do espaço, na unidade em que os dados vivem aqui.
 *
 * A mesma do celular, e pela mesma razão: o dado tem sempre 92 unidades de
 * ponta a ponta (`RAIO_DADO`), então esta largura é quantos dados cabem na
 * tela -- uns dez --, e o gesto que atravessa meio celular atravessa meia tela
 * aqui. O `?escala=` divide este número, para a caixa pequena.
 */
const LARGURA = 900;

/** Quanto dura o apagar, em segundos. */
const APAGAR = 0.5;

/**
 * Um dado no kit.
 *
 * `chegada` é o relógio DESTA página, e não o de quem jogou: a página do
 * plugin pode estar noutra máquina, e cronometrar pelo relógio alheio faria o
 * dado nascer já assentado ou tombar para sempre.
 *
 * `saida` é quando ele começa a apagar: o `tirar` da página, ou o fim do
 * prazo. `null` = fica até alguém pedir.
 */
type Vivo = {
  dado: DadoParaLancar;
  chegada: number;
  lugar: LugarNoLote;
  saida: number | null;
};

/** Quando o dado para, em `performance.now()`. */
function pouso(vivo: Vivo): number {
  return vivo.chegada + duracaoDaQueda({ impulso: impulsoNoKit(vivo.dado) }) * 1000;
}

/** Quando ele começa a apagar. `Infinity` = nunca, até pedirem. */
function inicioDaSaida(vivo: Vivo): number {
  if (vivo.saida !== null) return vivo.saida;
  if (vivo.dado.prazo !== null) return pouso(vivo) + vivo.dado.prazo * 1000;

  return Infinity;
}

/**
 * O kit de dados: dados caindo sobre fundo transparente, pedidos pela página
 * que o embute. Ver `lib/kit-de-dados.ts` para o protocolo.
 *
 * Só desenha. Não sabe de quem é o dado, não filtra, não decide quanto tempo
 * ele fica -- isso é do plugin. O que ele garante é que o dado caia com a
 * física, os sólidos e a tombada do tabuleiro.
 */
export function KitDeDados({ escala }: { escala: number }) {
  const [vivos, setVivos] = useState<Vivo[]>([]);

  useEffect(() => {
    const ouvir = (evento: MessageEvent) => {
      // Só de quem embute. Outra janela que mande algo não mexe na mesa.
      if (evento.source !== window.parent) return;
      const pedido = lerPedido(evento.data);
      if (!pedido) return;

      const agora = performance.now();

      if (pedido.tipo === "limpar") {
        setVivos((atuais) => atuais.map((vivo) => ({ ...vivo, saida: vivo.saida ?? agora })));
        return;
      }
      if (pedido.tipo === "tirar") {
        const ids = new Set(pedido.ids);
        setVivos((atuais) =>
          atuais.map((vivo) =>
            ids.has(vivo.dado.id) && vivo.saida === null ? { ...vivo, saida: agora } : vivo,
          ),
        );
        return;
      }

      setVivos((atuais) => {
        const presentes = new Set(atuais.map((vivo) => vivo.dado.id));
        // O mesmo id duas vezes é o mesmo dado: uma reentrega da página não
        // faz cair um segundo.
        const novos = pedido.dados.filter((dado) => !presentes.has(dado.id));

        return [
          ...atuais,
          ...novos.map((dado, indice) => ({
            dado,
            chegada: agora,
            lugar: { indice, total: novos.length },
            saida: null,
          })),
        ];
      });
    };

    window.addEventListener("message", ouvir);
    // Só agora a página pode mandar: antes disto o pedido se perderia.
    window.parent.postMessage({ ato20: "dados", pronto: true }, "*");

    return () => window.removeEventListener("message", ouvir);
  }, []);

  // Algo ainda cai, ou ainda apaga? Parado e sem prazo, o dado fica na tela
  // sem custar quadro nenhum até a página pedir `tirar`.
  const mexendo = useCallback(
    (agora: number) =>
      vivos.some(
        (vivo) =>
          pouso(vivo) > agora ||
          (Number.isFinite(inicioDaSaida(vivo)) && agora <= inicioDaSaida(vivo) + APAGAR * 1000),
      ),
    [vivos],
  );
  const agora = useRelogio(mexendo);

  // Quem já apagou sai da lista, e é isso que para o relógio quando a mesa
  // esvazia.
  useEffect(() => {
    const apagados = vivos.filter((vivo) => agora > inicioDaSaida(vivo) + APAGAR * 1000);
    if (apagados.length === 0) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- a varredura depende do relógio, que é estado.
    setVivos((atuais) => atuais.filter((vivo) => !apagados.includes(vivo)));
  }, [agora, vivos]);

  const tela = useTamanhoDaJanela();
  const largura = LARGURA / escala;
  const altura = tela.largura > 0 ? (largura * tela.altura) / tela.largura : 0;
  if (altura === 0) return null;

  const limites = { largura, altura };

  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 size-full"
      viewBox={`0 0 ${largura} ${altura}`}
    >
      <defs>
        <radialGradient id="dado-sombra">
          <stop offset="0%" stopColor="#000" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#000" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {vivos.map((vivo) => {
        const t = Math.max(0, (agora - vivo.chegada) / 1000);
        const duracao = (pouso(vivo) - vivo.chegada) / 1000;
        const opacidade = Math.min(
          1,
          Math.max(0, 1 - (agora - inicioDaSaida(vivo)) / (APAGAR * 1000)),
        );

        return (
          <DadoNoKit
            key={vivo.dado.id}
            dado={vivo.dado}
            // Congelado no pouso, como no tabuleiro: com a propriedade parada,
            // o `memo` pula o dado assentado enquanto outro ainda rola.
            t={Math.min(t, duracao)}
            opacidade={opacidade}
            limites={limites}
            lugar={vivo.lugar}
          />
        );
      })}
    </svg>
  );
}

/** Um dado caindo. O desenho é o do tabuleiro, sem sucção nem mão. */
const DadoNoKit = memo(function DadoNoKit({
  dado,
  t,
  opacidade,
  limites,
  lugar,
}: {
  dado: DadoParaLancar;
  t: number;
  opacidade: number;
  limites: { largura: number; altura: number };
  lugar: LugarNoLote;
}) {
  const tipo = tipoDado(dado.faces);
  const raio = RAIO_DADO * tipo.escala;
  const lancamento = lancamentoNoKit(dado, limites, lugar);
  // Do raio de REFERÊNCIA, e não do dado: o rótulo é de quem jogou, e o d6
  // menor não escreve o nome menor que o d20.
  const letra = RAIO_DADO * 0.4;

  const quadro = quadroDaQueda(
    {
      faces: dado.faces,
      x: lancamento.x,
      y: lancamento.y,
      raio,
      valor: dado.face,
      semente: dado.semente,
      impulso: lancamento.impulso,
    },
    t,
    limites,
  );

  const desenho = desenharDado({
    faces: dado.faces,
    orientacao: quadro.orientacao,
    cx: quadro.x,
    cy: quadro.y,
    raio,
    nitidez: quadro.nitidez,
  });

  // Embaixo do dado, e em cima quando não cabe: na caixa pequena de uma pessoa
  // só, o dado que pousa perto da borda de baixo levava o nome para fora.
  const abaixo = quadro.y + raio * 1.2 + letra;
  const yDoRotulo = abaixo + letra * 0.3 > limites.altura ? quadro.y - raio * 1.2 : abaixo;

  return (
    <g opacity={opacidade < 1 ? opacidade : undefined}>
      <ellipse
        cx={quadro.x + quadro.sombra.dx}
        cy={quadro.y + quadro.sombra.dy}
        rx={quadro.sombra.raio * 1.25}
        ry={quadro.sombra.raio * 1.1}
        fill="url(#dado-sombra)"
        opacity={quadro.sombra.opacidade / 0.42}
      />

      <g
        transform={
          `translate(${quadro.x} ${quadro.y}) ` +
          `scale(${quadro.escala * quadro.esmagaX} ${quadro.escala * quadro.esmagaY}) ` +
          `translate(${-quadro.x} ${-quadro.y})`
        }
      >
        <DadoFacetas tipo={tipo} desenho={desenho} raio={raio} nitidez={quadro.nitidez} />
      </g>

      {/* O rótulo nasce com o número, e não antes: escrito durante a tombada,
          ele diria de quem é o dado antes de o dado dizer quanto tirou. O
          contorno é do texto, e não do SVG: o kit fica sobre qualquer imagem. */}
      {dado.rotulo ? (
        <text
          x={quadro.x}
          y={yDoRotulo}
          textAnchor="middle"
          fontSize={letra}
          fontWeight={600}
          fill="#fff"
          stroke="rgba(0,0,0,0.75)"
          strokeWidth={letra * 0.2}
          paintOrder="stroke"
          opacity={quadro.nitidez}
          style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
        >
          {dado.rotulo}
        </text>
      ) : null}
    </g>
  );
});

/** O tamanho da janela, como estado. A caixa do OBS muda quando se ajusta a fonte. */
function useTamanhoDaJanela(): { largura: number; altura: number } {
  const texto = useSyncExternalStore(
    (avisar) => {
      window.addEventListener("resize", avisar);
      return () => window.removeEventListener("resize", avisar);
    },
    () => `${window.innerWidth}x${window.innerHeight}`,
    () => "0x0",
  );
  const [largura, altura] = texto.split("x").map(Number);

  return { largura, altura };
}

/**
 * O instante atual, avançando a cada quadro enquanto `mexendo` disser que sim.
 *
 * Parado quando nada se mexe: uma fonte do OBS fica aberta a live inteira, e
 * um `requestAnimationFrame` rodando à toa é CPU da máquina que está
 * codificando o vídeo. Recomeça quando `mexendo` muda -- dado novo, `tirar`.
 */
function useRelogio(mexendo: (agora: number) => boolean): number {
  const [agora, setAgora] = useState(() => performance.now());

  useEffect(() => {
    let quadro = 0;

    const passo = () => {
      const instante = performance.now();
      setAgora(instante);
      if (mexendo(instante)) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);

    return () => cancelAnimationFrame(quadro);
  }, [mexendo]);

  return agora;
}
