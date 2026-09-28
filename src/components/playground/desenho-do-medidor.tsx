"use client";

import {
  fracaoDoMedidor,
  pontosDoMedidor,
  textoDoMedidor,
} from "@/lib/medidor";
import type { Medidor } from "@/types/character";

/**
 * Um medidor desenhado, sem saber onde está.
 *
 * A mesma peça na ficha do mestre e na coluna ao lado do retrato, e isso não é
 * economia de linhas: "como é uma barra" é uma pergunta que precisa de UMA
 * resposta. Com dois desenhos, o mestre ajusta a vida num painel que não se
 * parece com o que a mesa vê, e a diferença só aparece na sessão.
 *
 * Nenhum número fixo: tudo sai de `largura` e `corpo`. É o que `RolagensDoRetrato`
 * já faz, e pela mesma razão — a coluna do retrato se mede em unidade de cena no
 * palco do Mestre e em pixel de tela no overlay da mesa, e uma espessura cravada
 * sumiria numa e cobriria o rosto na outra.
 *
 * Quem decide a unidade é quem chama. Aqui só se sabe que o desenho tem essa
 * largura e que o texto tem esse corpo.
 */
export function DesenhoDoMedidor({
  medidor,
  largura,
  corpo,
  sombra = false,
}: {
  medidor: Medidor;
  /** A largura do desenho, na unidade de quem chama. */
  largura: number;
  /** O tamanho do texto, na mesma unidade. A forma se mede por ele. */
  corpo: number;
  /**
   * Contorno escuro no texto e na forma.
   *
   * Ligado sobre o mapa, desligado num painel. Mapa é imagem: o claro e o
   * escuro existem os dois, e qualquer cor de fundo acerta uns e erra outros —
   * é a mesma escolha que a fileira de dados do retrato fez. Num painel a
   * sombra só sujaria um texto que já tem contraste.
   */
  sombra?: boolean;
}) {
  const risco = sombra
    ? `0 ${corpo * 0.06}px ${corpo * 0.25}px rgba(0,0,0,0.95)`
    : undefined;
  const relevo = sombra
    ? `drop-shadow(0 ${corpo * 0.06}px ${corpo * 0.2}px rgba(0,0,0,0.8))`
    : undefined;

  return (
    <div style={{ width: largura, filter: relevo }}>
      {/* O nome e o valor na MESMA linha, acima da forma. Empilhados, dois
          medidores ocupariam seis linhas ao lado de um rosto; lado a lado, o
          olho lê "Vida 14/20" de uma vez e desce para a barra só se quiser a
          proporção.

          A porcentagem não repete o valor aqui: nela a forma JÁ é o número, e
          escrever "70%" duas vezes na mesma peça é ruído. */}
      <div
        className="flex items-baseline justify-between gap-1 overflow-hidden"
        style={{ fontSize: corpo, lineHeight: 1.2 }}
      >
        <span
          className="truncate font-medium text-white/85"
          style={{ textShadow: risco }}
        >
          {medidor.nome}
        </span>

        {medidor.estilo === "porcentagem" ? null : (
          <span
            className="shrink-0 text-white/70 tabular-nums"
            style={{ textShadow: risco }}
          >
            {textoDoMedidor(medidor)}
          </span>
        )}
      </div>

      <Forma medidor={medidor} largura={largura} corpo={corpo} risco={risco} />
    </div>
  );
}

function Forma({
  medidor,
  largura,
  corpo,
  risco,
}: {
  medidor: Medidor;
  largura: number;
  corpo: number;
  risco?: string;
}) {
  if (medidor.estilo === "porcentagem") {
    // Sem forma nenhuma: o número É a leitura. É o estilo de quem quer moral e
    // progresso na tela sem a mesa contando quantos golpes faltam, e uma barra
    // atrás dele devolveria justamente a escala que ele existe para omitir.
    return (
      <span
        className="block font-semibold tabular-nums"
        style={{
          fontSize: corpo * 1.5,
          lineHeight: 1.1,
          color: medidor.cor,
          textShadow: risco,
        }}
      >
        {textoDoMedidor(medidor)}
      </span>
    );
  }

  if (medidor.estilo === "pontos") {
    return <Pontos medidor={medidor} largura={largura} corpo={corpo} />;
  }

  const fracao = fracaoDoMedidor(medidor);

  return (
    <div
      className="w-full overflow-hidden rounded-full bg-black/45"
      style={{ height: corpo * 0.85 }}
    >
      {/* Transição na LARGURA, e não na posição: a barra é a única coisa desta
          peça que muda no meio de uma cena, e o golpe lido como um salto
          instantâneo passa despercebido na TV do outro lado da sala. */}
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${fracao * 100}%`, background: medidor.cor }}
      />
    </div>
  );
}

/**
 * As bolinhas, sempre numa linha só.
 *
 * Elas ENCOLHEM para caber em vez de quebrarem em duas fileiras: a altura desta
 * peça entra na conta da coluna ao lado do retrato, e uma linha que às vezes
 * vale o dobro faria o medidor de baixo andar sozinho quando o de cima ganhasse
 * um ponto.
 *
 * Sem teto para o `maximo`. Vinte cargas viram vinte bolinhas minúsculas, e
 * isso é uma escolha de agora: o corte para barra acima de N só faz sentido
 * depois de ver a coluna montada na tela, e um número chutado aqui viraria um
 * limite que ninguém mediu. Ver `pontosDoMedidor`.
 */
function Pontos({
  medidor,
  largura,
  corpo,
}: {
  medidor: Medidor;
  largura: number;
  corpo: number;
}) {
  const { total, cheios } = pontosDoMedidor(medidor);

  const vao = corpo * 0.18;
  const cabe = (largura - vao * (total - 1)) / total;
  const lado = Math.max(0, Math.min(corpo * 0.85, cabe));

  return (
    <div className="flex items-center" style={{ gap: vao }}>
      {Array.from({ length: total }, (_, indice) => (
        <span
          key={indice}
          className="shrink-0 rounded-full"
          style={{
            width: lado,
            height: lado,
            // Cheio pinta; vazio fica o buraco escuro na mesma posição. Um
            // ponto vazio que sumisse faria a fileira encurtar a cada golpe, e
            // o olho perderia a referência de quantos eram no começo.
            background: indice < cheios ? medidor.cor : "rgba(0,0,0,0.45)",
          }}
        />
      ))}
    </div>
  );
}
