"use client";

import { useEffect, useState } from "react";

import { duracaoDaQueda } from "@/lib/geometry/dado";
import { textoDoModificador } from "@/lib/mestre/expressao-de-rolagem";
import { cn } from "@/lib/utils";
import {
  entraNaSoma,
  textoDoResultado,
  tipoDado,
  valorDaRolagem,
  type Dado,
  type Lance,
  type Rolagem,
} from "@/types/dado";

/**
 * As últimas rolagens do saquinho: o dado solto numa linha, os dados de um
 * lance juntos com o nome, o modificador e o total.
 *
 * Em `playground` porque os dois saquinhos a desenham -- o do Mestre e o do
 * celular --, cada um com o histórico da própria tela no `useDadosStore`. O
 * celular grava o dele ali como o Mestre, só não mostrava: o jogador rolava um
 * d20 solto e não achava o número em lugar nenhum depois que recolhia.
 */
export function HistoricoDeDados({
  historico,
  noAr,
  titulo,
}: {
  historico: readonly Rolagem[];
  /** Os dados ainda caindo: a linha deles mostra reticências. Ver `useDadosNoAr`. */
  noAr: ReadonlySet<string>;
  titulo: string;
}) {
  if (historico.length === 0) return null;

  return (
    <div className="space-y-1.5 border-t pt-2.5">
      <p className="text-muted-foreground text-xs font-medium">
        {titulo}
      </p>

      <ul className="space-y-0.5">
        {linhasDoHistorico(historico).map((linha) => {
          if (linha.tipo === "lance") {
            return <LinhaDeLance key={linha.rolagens[0]!.id} linha={linha} noAr={noAr} />;
          }

          const { rolagem } = linha;
          const tipo = tipoDado(rolagem.faces);

          /**
           * Rolagem que ainda está caindo entra como reticências.
           *
           * A rolagem nasce no arremesso, junto do dado e com o MESMO id, e
           * o valor já está nela enquanto o dado tomba — então a lista
           * entregava o resultado antes da queda, que é justo a parte que a
           * mesa está olhando. Sumir com a linha seria pior: ela apareceria
           * do nada empurrando as outras para baixo.
           *
           * Casa pelo id porque é ele que liga os dois. Rolagem sem dado
           * correspondente já foi recolhida, e recolhida é pousada.
           */
          const caindo = noAr.has(rolagem.id);

          return (
            <li
              key={rolagem.id}
              className="flex items-center gap-2 text-xs"
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full border border-white/20"
                style={{ background: tipo.hex }}
              />
              <span className="text-muted-foreground flex-1 truncate">
                {tipo.nome}
              </span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  caindo && "text-muted-foreground/50",
                )}
              >
                {caindo
                  ? "…"
                  : textoDoResultado(rolagem.faces, rolagem.valor)}
              </span>
              <span className="text-muted-foreground/70 tabular-nums">
                {new Date(rolagem.quando).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type LinhaDoHistorico =
  | { tipo: "dado"; rolagem: Rolagem }
  | { tipo: "lance"; lance: Lance; rolagens: Rolagem[] };

/**
 * O histórico em linhas: o dado solto numa linha só dele, e os dados de um
 * mesmo lance juntos -- os dois d20 da Luta são uma rolagem, e listá-los
 * soltos esconderia o `+10` que faz a conta. Juntos pelo id do lance, e só
 * os VIZINHOS: o lance entra todo de uma vez, então os dados dele estão lado
 * a lado na lista.
 */
function linhasDoHistorico(historico: readonly Rolagem[]): LinhaDoHistorico[] {
  const linhas: LinhaDoHistorico[] = [];

  for (const rolagem of historico) {
    const anterior = linhas[linhas.length - 1];
    if (rolagem.lance && anterior?.tipo === "lance" && anterior.lance.id === rolagem.lance.id) {
      anterior.rolagens.push(rolagem);
    } else if (rolagem.lance) {
      linhas.push({ tipo: "lance", lance: rolagem.lance, rolagens: [rolagem] });
    } else {
      linhas.push({ tipo: "dado", rolagem });
    }
  }

  return linhas;
}

/** Quantas bolinhas de cor a linha do lance mostra. O resto está na conta. */
const BOLINHAS_DO_LANCE = 4;

/**
 * Um lance no histórico: as cores dos dados, o nome ("Dante · Luta", ou a
 * notação quando não tem), o modificador e o total. A conta inteira fica no
 * `title`, para quem quer conferir dado por dado.
 */
function LinhaDeLance({
  linha,
  noAr,
}: {
  linha: Extract<LinhaDoHistorico, { tipo: "lance" }>;
  noAr: ReadonlySet<string>;
}) {
  const { lance, rolagens } = linha;
  // O histórico é do mais novo para o mais velho; a conta lê na ordem da jogada.
  const naOrdem = [...rolagens].reverse();
  const caindo = naOrdem.some((rolagem) => noAr.has(rolagem.id));

  const valores = naOrdem
    .filter((rolagem) => entraNaSoma(rolagem.faces))
    .map((rolagem) => valorDaRolagem(rolagem.faces, rolagem.valor));
  const total = valores.reduce((soma, valor) => soma + valor, 0) + lance.modificador;

  const faces: number[] = [];
  const porFaces = new Map<number, number>();
  for (const rolagem of naOrdem) {
    if (!porFaces.has(rolagem.faces)) faces.push(rolagem.faces);
    porFaces.set(rolagem.faces, (porFaces.get(rolagem.faces) ?? 0) + 1);
  }
  const notacao =
    faces.map((lados) => `${porFaces.get(lados)}d${lados}`).join("+") + textoDoModificador(lance.modificador);
  const conta = `${valores.join(" + ")} ${textoDoModificador(lance.modificador)} = ${total}`.replace("  ", " ");

  return (
    <li className="flex items-center gap-2 text-xs" title={caindo ? notacao : `${notacao}: ${conta}`}>
      <span aria-hidden className="flex shrink-0 -space-x-1">
        {naOrdem.slice(0, BOLINHAS_DO_LANCE).map((rolagem) => (
          <span
            key={rolagem.id}
            className="size-2.5 rounded-full border border-white/20"
            style={{ background: tipoDado(rolagem.faces).hex }}
          />
        ))}
      </span>
      <span className="text-muted-foreground min-w-0 flex-1 truncate">{lance.rotulo ?? notacao}</span>
      {lance.modificador !== 0 ? (
        <span className="text-muted-foreground/70 tabular-nums">{textoDoModificador(lance.modificador)}</span>
      ) : null}
      <span className={cn("font-semibold tabular-nums", caindo && "text-muted-foreground/50")}>
        {caindo ? "…" : total}
      </span>
      <span className="text-muted-foreground/70 tabular-nums">
        {new Date(naOrdem[0]!.quando).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </li>
  );
}

/**
 * Os dados que ainda estão no ar, por id.
 *
 * Existe porque nada no saquinho pode revelar um dado antes de ele pousar. O
 * valor é sorteado no ARREMESSO — é o que torna a jogada conferível, ver
 * `Dado` —, então ele já está no store enquanto o dado ainda tomba. Somar ou
 * listar esse valor entrega o resultado antes da queda, e a queda é a parte que
 * a mesa está olhando.
 *
 * Por `setTimeout` até o instante exato em que cada um assenta, e não por
 * `requestAnimationFrame`: não há nada para animar aqui, só um momento em que a
 * conta muda. Um laço de sessenta quadros por segundo para redesenhar uma linha
 * de texto uma vez seria desperdício, e a `DadoLayer` já tem o laço que precisa
 * existir.
 */
export function useDadosNoAr(dados: Dado[]): ReadonlySet<string> {
  const [noAr, setNoAr] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const recalcular = () => {
      const agora = Date.now();
      const restante = dados.map(
        (dado) => dado.lancadoEm + duracaoDaQueda(dado) * 1000 - agora,
      );

      setNoAr(
        new Set(dados.filter((_, i) => restante[i] > 0).map((dado) => dado.id)),
      );

      const proximo = restante.filter((ms) => ms > 0);
      // Mais um quadro de folga, para o instante do acordar já estar depois do
      // assentamento e não empatado com ele.
      if (proximo.length > 0)
        timer = setTimeout(recalcular, Math.min(...proximo) + 16);
    };

    recalcular();
    return () => clearTimeout(timer);
  }, [dados]);

  return noAr;
}
