"use client";

import { useDeclarativo } from "@/components/playground/declarativo";
import {
  alturaDaForma,
  alturaDoRotulo,
  DesenhoDoMedidor,
} from "@/components/playground/desenho-do-medidor";
import { SelosDaCondicao } from "@/components/playground/selos-da-condicao";
import { VAO_DO_SELO } from "@/lib/geometry/portrait";
import { fichaDoObjeto, LARGURA_DA_INFO, lugarDaInfo } from "@/lib/mestre/fichas-da-cena";
import { cn } from "@/lib/utils";
import type { CanvasItem, FichaNaCena } from "@/types/scene";

/**
 * Acima dos tokens e abaixo da névoa.
 *
 * Abaixo da névoa de propósito, ao contrário do retrato: o que a névoa esconde
 * é a peça, e um nome flutuando sobre o bloco preto entregaria que há alguém
 * ali — que é exatamente o que a área escondida existe para não dizer.
 */
const INFO_Z = 400;

/** Quantos medidores cabem na caixa antes de ela ficar mais alta que o token. */
const TETO = 3;

/** O diâmetro de um selo, em fração do corpo do nome. Pouco menor que a letra. */
const SELO = 0.95;

/**
 * Nome, selos e medidores sobre a cabeça de cada token.
 *
 * Ligado por cena, em Configurações do mapa. É o mapa de combate: a mesa quer a
 * vida de todo mundo à vista sem ter de ligar cada rosto a uma barra no canto
 * da tela. Fora dele, o mapa da taverna não tem nada por cima das peças.
 *
 * ## Por que não pendura no retrato
 *
 * Porque os elencos são diferentes. Retrato existe para quem tem IMAGEM e foi
 * armado; token existe para todo mundo, inclusive a horda de goblins sem rosto
 * — e é justamente ela que mais precisa de um número por cima. Ver
 * `FichaNaCena`.
 *
 * ## Tudo derivado da peça
 *
 * Nenhum número fixo, como no retrato: a mesma cena é vista num palco de mil
 * pixels e numa TV de 1920, e a câmera aproxima dez vezes. Texto de tamanho
 * cravado some numa e cobre o mapa na outra.
 *
 * Sem os DADOS. Eles já caem no retrato do personagem, e repeti-los aqui seria
 * a mesma informação em dois lugares num palco que já é cheio — com o agravante
 * de que o dado é grande e a peça é pequena. Se a mesa pedir, o lugar é este.
 */
export function InfoDoToken({
  itens,
  fichas,
  objetos = false,
}: {
  itens: ReadonlyArray<CanvasItem>;
  /**
   * Já filtrada por quem montou a cena. Vazia = interruptor desligado.
   *
   * Sem um sinalizador de "sou o Mestre": medidor escondido só CHEGA aqui no
   * palco dele -- ver `fichasDaCena` --, então a marca de apagado pode sair do
   * próprio registro. Um segundo parâmetro dizendo a mesma coisa seria uma
   * chance de os dois discordarem.
   */
  fichas: ReadonlyArray<FichaNaCena>;
  /**
   * Desenha também os selos dos OBJETOS -- o barril em chamas. É o mesmo
   * interruptor da informação dos tokens, que chega aqui à parte porque a
   * lista de fichas vazia não diz se ele está ligado: a cena pode não ter
   * personagem nenhum. Ver `fichaDoObjeto`.
   */
  objetos?: boolean;
}) {
  if (fichas.length === 0 && !objetos) return null;

  const porId = new Map(fichas.map((ficha) => [ficha.id, ficha]));

  return (
    <>
      {itens.map((item) => {
        const ficha = item.personagemId
          ? porId.get(item.personagemId)
          : objetos
            ? fichaDoObjeto(item)
            : null;
        if (!ficha) return null;

        return (
          <BlocoDoToken key={item.id} item={item} ficha={ficha} />
        );
      })}
    </>
  );
}

function BlocoDoToken({
  item,
  ficha,
}: {
  item: CanvasItem;
  ficha: FichaNaCena;
}) {
  const { estilos } = useDeclarativo();
  const medida = medirBloco(item, ficha, estilos);
  const { x, y } = lugarDaInfo(item, medida.altura);

  return <CorpoDoBloco ficha={ficha} medida={medida} left={x} top={y} />;
}

/** O tamanho do bloco e das partes dele, em unidades de cena. */
export type MedidaDoBloco = ReturnType<typeof medirBloco>;

/**
 * Quanto o bloco ocupa, e o tamanho de cada parte, em unidades de CENA: tudo
 * sai da largura do token, para o bloco crescer com ele. À parte do desenho
 * para o 2.5D, que o põe de prumo sobre a cabeça da figura em pé, medir igual.
 * Ver `InfoDeEsguelha`.
 */
export function medirBloco(
  item: Pick<CanvasItem, "width">,
  ficha: FichaNaCena,
  estilos: ReturnType<typeof useDeclarativo>["estilos"],
) {
  const medidores = ficha.medidores.slice(0, TETO);
  const condicoes = ficha.condicoes ?? [];

  // Tudo em unidade de CENA, derivado da largura da peça. O corpo do texto sai
  // primeiro porque a altura da caixa é feita dele.
  const corpo = item.width * 0.26;
  const vao = corpo * 0.25;
  // O objeto não tem nome: só os selos, encostados na peça.
  const alturaDoNome = ficha.nome ? corpo * 1.2 : 0;
  // Cada medidor é o rótulo mais a forma, que é o que `DesenhoDoMedidor`
  // empilha -- a conta segue a peça de lá, e não um palpite daqui. A forma
  // tem a altura DELA: um estilo de plugin declara a própria, e medir a caixa
  // pela barra faria o SVG transbordar o plano. Ver `alturaDaForma`.
  const larguraDaInfo = item.width * LARGURA_DA_INFO;
  const alturaDosMedidores = medidores.reduce(
    (soma, medidor) =>
      soma +
      alturaDoRotulo(medidor, corpo, estilos) +
      alturaDaForma(medidor, larguraDaInfo, corpo, estilos) +
      vao,
    0,
  );
  // Os selos numa fileira que quebra: oito cabem em duas linhas sobre o nome
  // de um token estreito, e a caixa tem de crescer as duas para não empurrar
  // o nome para dentro do token. Quantos cabem por linha sai da mesma largura
  // que `lugarDaInfo` vai dar à caixa.
  const selo = corpo * SELO;
  const porLinha = Math.max(
    1,
    Math.floor(
      (item.width * LARGURA_DA_INFO + selo * VAO_DO_SELO) /
        (selo * (1 + VAO_DO_SELO)),
    ),
  );
  const linhasDeSelos = Math.ceil(condicoes.length / porLinha);
  const alturaDosSelos =
    linhasDeSelos > 0
      ? linhasDeSelos * selo + (linhasDeSelos - 1) * selo * VAO_DO_SELO + vao
      : 0;
  const altura =
    alturaDoNome +
    alturaDosSelos +
    (medidores.length > 0 ? alturaDosMedidores + vao : 0);

  return {
    medidores,
    condicoes,
    corpo,
    vao,
    selo,
    largura: larguraDaInfo,
    altura,
  };
}

/**
 * O bloco desenhado: nome, selos e medidores, em coluna, no canto dado. As
 * medidas são de `medirBloco`.
 */
export function CorpoDoBloco({
  ficha,
  medida,
  left,
  top,
}: {
  ficha: FichaNaCena;
  medida: MedidaDoBloco;
  left: number;
  top: number;
}) {
  const { medidores, condicoes, corpo, vao, selo, largura, altura } = medida;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute flex flex-col items-center"
      style={{
        left,
        top,
        width: largura,
        height: altura,
        gap: vao,
        zIndex: INFO_Z,
      }}
    >
      {/* Sem fundo, com sombra: mapa é imagem, e qualquer cor de fundo acerta
          uns mapas e erra outros. É a mesma escolha da fileira de dados e da
          coluna de medidores. */}
      {ficha.nome ? (
        <span
          className="max-w-full truncate font-semibold text-white"
          style={{
            fontSize: corpo,
            lineHeight: 1.2,
            textShadow: `0 ${corpo * 0.06}px ${corpo * 0.25}px rgba(0,0,0,0.95)`,
          }}
        >
          {ficha.nome}
        </span>
      ) : null}

      {/* Entre o nome e as barras: o selo diz o que aconteceu com quem, e é
          lido junto com o nome -- "o Edgar está caído". As barras são número,
          e ficam por último, onde o olho vai quando quer contar. */}
      <SelosDaCondicao
        condicoes={condicoes}
        tamanho={selo}
        style={{ width: largura }}
      />

      {medidores.map((medidor) => (
        <div
          key={medidor.id}
          // Escondido só chega aqui no palco do Mestre. Apagado e não ausente:
          // ele precisa ver que o relógio corre, e que a mesa não o vê.
          className={cn(medidor.escondido && "opacity-45")}
        >
          <DesenhoDoMedidor
            medidor={medidor}
            largura={largura * 0.8}
            corpo={corpo * 0.72}
            sombra
          />
        </div>
      ))}
    </div>
  );
}
