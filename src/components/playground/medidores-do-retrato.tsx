"use client";

import { DesenhoDoMedidor } from "@/components/playground/desenho-do-medidor";
import { pecaNoRecorte, larguraDaColuna } from "@/lib/geometry/portrait";
import { cn } from "@/lib/utils";
import type { Medidor } from "@/types/character";
import type { LugarDaPeca } from "@/types/scene";

/**
 * Os medidores de um personagem, ao lado do retrato dele.
 *
 * À DIREITA e empilhados, e a escolha é o avesso da que a fileira de dados fez.
 * O dado desce porque ele é um evento — cai, é lido, some —, e ao lado
 * encostaria no retrato vizinho. O medidor fica, e a mesa o consulta a sessão
 * inteira: embaixo, ele dividiria o pé do retrato com os dados e as duas coisas
 * se atropelariam a cada rolagem.
 *
 * O lugar que ele ocupa é RESERVADO na fila: `larguraNaFila` conta o retrato
 * mais esta coluna, e é isso que impede o rosto seguinte de encostar por cima
 * das barras. Sem essa reserva, a coluna existiria e ficaria escondida atrás do
 * vizinho — que é o mesmo defeito dito de outro jeito.
 *
 * ## Vira para a esquerda quando não cabe
 *
 * Pela mesma razão que o feed de dados vira para cima, e com o mesmo teste: o
 * retrato encostado na borda direita da câmera não tem onde pôr a coluna, e
 * metade dela ficaria fora do recorte. Só vira quando a esquerda é MELHOR --
 * e, ao contrário do feed, ela nunca sai do recorte mesmo quando lado nenhum
 * serve: `pecaNoRecorte` a prende, porque transbordar um plano é o que
 * derruba o palco no WebKitGTK. Ver a skill `debug-do-palco`, §3.
 *
 * ## Tudo derivado da caixa
 *
 * Nenhum número fixo, como em `RolagensDoRetrato`. Qual unidade é esta depende
 * de onde o retrato está desenhado — unidade de cena no plano do Mestre, pixel
 * de tela no overlay da mesa — e este componente não precisa saber: ele recebe
 * a caixa e mede tudo a partir dela. Ver `espaco`, em `PortraitLayer`.
 */
export function MedidoresDoRetrato({
  medidores,
  largura,
  altura,
  folgaDireita,
  folgaEsquerda,
  lugar,
  escala,
}: {
  /** Na ordem da ficha. Já filtrados por quem montou o retrato. */
  medidores: Medidor[];
  /** A largura da caixa do retrato. Ver a nota sobre unidade, acima. */
  largura: number;
  /** A altura da caixa do retrato, na mesma unidade. */
  altura: number;
  /** Quanto do recorte sobra à direita da borda do retrato, na mesma unidade. */
  folgaDireita: number;
  /** Quanto sobra à esquerda, na mesma unidade. */
  folgaEsquerda: number;
  /**
   * Onde o mestre pôs esta coluna, em fração da caixa do retrato.
   *
   * Ausente é o AUTOMÁTICO, que é o caso comum: ao lado, centrada na altura do
   * rosto, virando de lado quando não cabe. Presente, ela vai para onde foi
   * posta -- ainda presa ao recorte, porque a trava não é preferência, é o que
   * impede o palco de cair. Ver `LugarDaPeca`.
   */
  lugar?: LugarDaPeca;
  /** Quanto a coluna cresce ou encolhe. Ver `LayoutDoRetrato.escalaMedidores`. */
  escala?: number;
}) {
  if (medidores.length === 0) return null;

  // A MESMA conta de `larguraNaFila`, e é o que faz a coluna caber exatamente
  // no lugar que a fila reservou para ela. Divergir aqui deixaria o vizinho
  // encostado por um fio, ou um vão sem explicação entre dois retratos.
  const coluna = larguraDaColuna(altura, escala);
  const folga = coluna * 0.08;
  // Um oitavo da coluna, e a razão anda junto com `LARGURA_DOS_MEDIDORES`: o
  // que decide se "Medidor 10/10" cabe é a razão entre os dois, não o tamanho
  // de nenhum deles. Alargar a coluna sem baixar isto aqui não ganha um
  // caractere sequer -- foi o que a primeira correção descobriu na tela.
  const corpo = coluna * 0.12;

  const esquerda = folgaDireita < coluna + folga && folgaEsquerda > folgaDireita;
  const desejado = lugar
    ? lugar.x * largura
    : esquerda
      ? -(coluna + folga)
      : largura + folga;

  return (
    <div
      className={cn(
        "pointer-events-none absolute flex flex-col",
        // No automático ela ocupa a altura do rosto e se centra nele: dois
        // medidores num retrato alto ficariam pendurados no topo, longe da cara
        // que descrevem. Com lugar escolhido, a altura é a do conteúdo -- o
        // mestre disse onde o topo fica, e esticar a caixa moveria o desenho
        // para longe do ponto que ele apontou.
        !lugar && "top-0 h-full justify-center",
      )}
      style={{
        left: pecaNoRecorte({
          desejado,
          coluna,
          largura,
          folgaDireita,
          folgaEsquerda,
        }),
        top: lugar ? lugar.y * altura : undefined,
        width: coluna,
        gap: corpo * 0.6,
      }}
    >
      {medidores.map((medidor) => (
        <div
          key={medidor.id}
          // Escondido só chega aqui no palco do Mestre — ver `incluirOcultos`
          // em `retratosDaCena`. Apagado e não ausente: o mestre precisa ver
          // que o relógio está correndo, e que a mesa não o vê.
          className={cn(medidor.escondido && "opacity-45")}
        >
          <DesenhoDoMedidor
            medidor={medidor}
            largura={coluna}
            corpo={corpo}
            sombra
          />
        </div>
      ))}
    </div>
  );
}

