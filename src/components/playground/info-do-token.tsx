"use client";

import { DesenhoDoMedidor } from "@/components/playground/desenho-do-medidor";
import { lugarDaInfo } from "@/lib/mestre/fichas-da-cena";
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

/**
 * Nome e medidores sobre a cabeça de cada token.
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
}) {
  if (fichas.length === 0) return null;

  const porId = new Map(fichas.map((ficha) => [ficha.id, ficha]));

  return (
    <>
      {itens.map((item) => {
        const ficha = item.personagemId ? porId.get(item.personagemId) : null;
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
  const medidores = ficha.medidores.slice(0, TETO);

  // Tudo em unidade de CENA, derivado da largura da peça. O corpo do texto sai
  // primeiro porque a altura da caixa é feita dele.
  const corpo = item.width * 0.26;
  const vao = corpo * 0.25;
  const alturaDoNome = corpo * 1.2;
  // Cada medidor é o rótulo mais a forma, que é o que `DesenhoDoMedidor`
  // empilha -- a conta segue a peça de lá, e não um palpite daqui.
  const alturaDeUm = corpo * 1.2 + corpo * 0.85;
  const altura =
    alturaDoNome +
    (medidores.length > 0
      ? medidores.length * (alturaDeUm + vao) + vao
      : 0);

  const { x, y, largura } = lugarDaInfo(item, altura);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute flex flex-col items-center"
      style={{
        left: x,
        top: y,
        width: largura,
        height: altura,
        gap: vao,
        zIndex: INFO_Z,
      }}
    >
      {/* Sem fundo, com sombra: mapa é imagem, e qualquer cor de fundo acerta
          uns mapas e erra outros. É a mesma escolha da fileira de dados e da
          coluna de medidores. */}
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
