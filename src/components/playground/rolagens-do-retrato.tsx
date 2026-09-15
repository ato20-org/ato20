"use client";

import { DadoRolando } from "@/components/playground/dado-rolando";
import {
  DURACAO_DA_CHEGADA,
  instanteDaQueda,
  useQuedaDasRolagens,
} from "@/hooks/use-queda-das-rolagens";
import { valorDaRolagem, type RolagemDaMesa } from "@/types/dado";

/** Quantas rolagens antigas a coluna mostra. O resto está no histórico do mestre. */
const TETO = 4;

/**
 * Os dados que este jogador jogou, embaixo do retrato dele.
 *
 * O retrato é a resposta para "de quem é este dado" que a TV já tem na tela.
 * Uma legenda com o nome do jogador funcionaria, mas a mesa olha para o rosto
 * do personagem a sessão inteira — pendurar o dado ali economiza da mesa o
 * trabalho de ligar um nome a uma cara no meio de uma cena tensa.
 *
 * Fora da moldura, e não sobre ela: o retrato É o rosto, e um dado por cima
 * dele cobriria justamente o que a imagem existe para mostrar. Embaixo e não ao
 * lado porque os retratos ficam lado a lado na fileira da mesa — a coluna à
 * direita de um encostava no vizinho, e dois jogadores rolando junto davam duas
 * pilhas de dados no mesmo pedaço de tela.
 *
 * A ÚLTIMA rolagem em corpo grande, à direita, e as anteriores miúdas à
 * esquerda. É a única hierarquia que a mesa pede: o número que acabou de sair é
 * o que está sendo discutido, e os de antes servem para conferir a conta — "o
 * oito foi o dano". Um dado do mesmo tamanho para os dois papéis obrigava o
 * olho a procurar qual era o novo.
 *
 * Sem fundo nenhum. A legibilidade vem da SOMBRA, como na fileira do mestre:
 * mapa é imagem, e qualquer cor de fundo acerta uns mapas e erra outros. A
 * pílula escura que havia aqui também competia com o retrato, que é a coisa que
 * esta camada existe para acompanhar. Ver `RolagensBody`.
 *
 * Os dados CAEM aqui, e não chegam prontos. O número de uma rolagem alheia
 * aparecia no instante do arremesso — um a dois segundos antes de o dado pousar
 * no aparelho de quem rolou —, então a mesa lia o resultado antes de o dado
 * existir. Com a queda, as telas resolvem o borrão no mesmo beat. Ver
 * `DadoRolando` e `DURACAO_DA_CHEGADA`.
 *
 * Medido em unidades de CENA, derivadas da largura do retrato — não em pixel.
 * Dado de tamanho fixo em pixel encolheria até sumir na TV ampliada e cobriria
 * o retrato no celular; derivado da caixa, ele guarda a mesma proporção com o
 * rosto em qualquer tela e em qualquer zoom.
 */
export function RolagensDoRetrato({
  rolagens,
  largura,
  altura,
  folgaAbaixo,
  folgaAcima,
}: {
  /** A mais nova na frente, como vem da bandeja. Ver `useRolagensStore`. */
  rolagens: RolagemDaMesa[];
  /** A largura da caixa do retrato, em unidades de cena. */
  largura: number;
  /** A altura da caixa do retrato, em unidades de cena. */
  altura: number;
  /** Quanto do recorte sobra abaixo da base do retrato, em unidades de cena. */
  folgaAbaixo: number;
  /** Quanto do recorte sobra acima do topo do retrato, em unidades de cena. */
  folgaAcima: number;
}) {
  const { chegada, agora } = useQuedaDasRolagens(rolagens);

  // Depois dos ganchos, e não antes: este componente fica montado mesmo sem
  // rolagem nenhuma -- é o que dá ao mapa de chegadas uma primeira volta VAZIA,
  // e é ela que faz o primeiro dado da sessão cair em vez de nascer assentado.
  if (rolagens.length === 0) return null;

  const [atual, ...anteriores] = rolagens;

  const lado = largura * 0.34;
  const mini = largura * 0.08;
  const corpo = mini * 0.95;
  // Contorno escuro: o dado claro e o mapa claro existem os dois, e texto
  // branco sobre os dois some.
  const sombra = `0 ${corpo * 0.05}px ${corpo * 0.22}px rgba(0,0,0,0.95)`;

  /** Há quantos segundos a rolagem de agora está caindo. */
  const emQueda = instanteDaQueda(chegada.get(atual.id), agora);

  const folga = largura * 0.05;

  /**
   * Quanto o feed ocupa, para caber ou não caber no que sobra da câmera.
   *
   * O maior dos dois ramos: a coluna do histórico e o dado de agora ficam lado
   * a lado, centrados um no outro, então quem manda na altura é o mais alto. A
   * palavra "Rolando" está fora do fluxo, e por isso entra na conta à mão.
   */
  const alturaDoFeed = Math.max(
    anteriores.length > 0
      ? Math.min(anteriores.length, TETO) * mini * 1.3 - mini * 0.3
      : 0,
    lado * 1.1 + corpo,
  );

  /**
   * Vira para CIMA quando não cabe embaixo.
   *
   * Não é caso raro: é o caso PADRÃO. O retrato nasce encostado na base da
   * câmera — ver `createPortrait` —, e a base dele fica a 21 unidades do fim do
   * plano, contra as 138 que o feed pede. Medido: 84% do feed ficava do lado de
   * fora do `overflow-hidden` do palco, o que some com o dado grande inteiro e
   * com três das quatro linhas do histórico. O dado existia, caía, assentava, e
   * ninguém via nada disso.
   *
   * Só vira quando cima é MELHOR que baixo: num retrato que não cabe em lugar
   * nenhum — ampliado até ocupar a câmera toda —, trocar de lado só trocaria
   * qual metade some.
   */
  const acima = folgaAbaixo < alturaDoFeed + folga && folgaAcima > folgaAbaixo;

  return (
    <div
      className="pointer-events-none absolute left-0 flex items-center"
      style={{
        // Encostado no retrato, com uma folga do tamanho de um vigésimo dele.
        // Para baixo quando há espaço, para cima quando não há.
        top: acima ? -(alturaDoFeed + folga) : altura + folga,
        gap: folga,
      }}
    >
      {anteriores.length > 0 ? (
        <div className="flex flex-col" style={{ gap: mini * 0.3 }}>
          {anteriores.slice(0, TETO).map((rolagem) => {
            const t = instanteDaQueda(chegada.get(rolagem.id), agora);

            return (
              <div key={rolagem.id} className="flex items-center" style={{ gap: mini * 0.45 }}>
                <DadoRolando
                  id={rolagem.id}
                  faces={rolagem.faces}
                  valor={rolagem.valor}
                  tamanho={mini}
                  t={t}
                />

                {/* Sem o nome de quem rolou. Esta coluna já está pendurada no
                    retrato do personagem, e a camada só pendura nele o que tem
                    `personagemId` — repetir o nome em cada linha era dizer quatro
                    vezes o que o rosto acima já diz. Quem rola sem personagem
                    vinculado aparece pelo nome na fileira do mestre, que é onde o
                    nome ainda faz trabalho. Ver `PortraitLayer` e `RolagensBody`. */}

                {/* O número em texto. O dado miúdo mostra a face, e
                    nesse tamanho o algarismo gravado nela não se lê do outro lado
                    da sala — a silhueta e a cor dizem QUAL dado, o texto diz
                    QUANTO deu.

                    Só DEPOIS do pouso, como o algarismo gravado na face: ele é a
                    leitura do dado, e mostrá-lo enquanto o sólido ainda tomba
                    entregaria o resultado que a queda existe para adiar. */}
                <span
                  className="font-semibold text-white tabular-nums transition-opacity duration-200"
                  style={{
                    fontSize: corpo,
                    lineHeight: 1,
                    textShadow: sombra,
                    opacity: t < DURACAO_DA_CHEGADA ? 0 : 1,
                  }}
                >
                  {valorDaRolagem(rolagem.faces, rolagem.valor)}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* A rolagem de agora, grande e sem número ao lado. Aqui o algarismo
          gravado na face tem corpo de sobra para ser lido da TV, e repeti-lo
          fora do sólido só tiraria espaço do rosto.

          Os dois estados são o DADO: tombando, ele é "Rolando"; pousado, a face
          dele é o resultado. A palavra embaixo diz o primeiro em voz alta, para
          a mesa não precisar decidir, de longe, se aquilo é uma jogada em curso
          ou um dado que ficou preso. */}
      <div
        className="relative"
        style={{ filter: `drop-shadow(0 ${lado * 0.02}px ${lado * 0.06}px rgba(0,0,0,0.8))` }}
      >
        <DadoRolando
          id={atual.id}
          faces={atual.faces}
          valor={atual.valor}
          tamanho={lado}
          t={emQueda}
        />

        {/* Absoluta, e por isso fora do fluxo: a palavra some quando o dado
            pousa, e se ocupasse lugar o retrato inteiro se reorganizaria no
            instante do resultado.

            Um décimo do dado abaixo da caixa dele, e não encostada: o dado
            CRESCE no ar — 26% na altura da mão, ver `DadoRolando` —, e uma
            palavra colada na borda ficaria por baixo dele justo no primeiro
            quadro da queda, que é quando ela precisa ser lida. */}
        <span
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 font-medium whitespace-nowrap text-white/70 transition-opacity duration-200"
          style={{
            top: lado * 1.1,
            fontSize: corpo,
            lineHeight: 1,
            textShadow: sombra,
            opacity: emQueda < DURACAO_DA_CHEGADA ? 1 : 0,
          }}
        >
          Rolando…
        </span>
      </div>
    </div>
  );
}
