"use client";

import { DadoParado } from "@/components/playground/dado-parado";
import { valorDaRolagem, type RolagemDaMesa } from "@/types/dado";

/** Quantos dados a coluna mostra. O resto está no histórico do mestre. */
const TETO = 4;

/**
 * Os dados que este jogador jogou, ao lado do retrato dele.
 *
 * O retrato é a resposta para "de quem é este dado" que a TV já tem na tela.
 * Uma legenda com o nome do jogador funcionaria, mas a mesa olha para o rosto
 * do personagem a sessão inteira — pendurar o dado ali economiza da mesa o
 * trabalho de ligar um nome a uma cara no meio de uma cena tensa.
 *
 * Fora da moldura, e não sobre ela: o retrato É o rosto, e um dado por cima
 * dele cobriria justamente o que a imagem existe para mostrar.
 *
 * Medido em unidades de CENA, derivadas da largura do retrato — não em pixel.
 * Dado de tamanho fixo em pixel encolheria até sumir na TV ampliada e cobriria
 * o retrato no celular; derivado da caixa, ele guarda a mesma proporção com o
 * rosto em qualquer tela e em qualquer zoom.
 */
export function RolagensDoRetrato({
  rolagens,
  largura,
}: {
  rolagens: RolagemDaMesa[];
  /** A largura da caixa do retrato, em unidades de cena. */
  largura: number;
}) {
  if (rolagens.length === 0) return null;

  const lado = largura * 0.3;
  const recentes = rolagens.slice(0, TETO);

  return (
    <div
      className="pointer-events-none absolute top-0 flex flex-col items-start"
      style={{
        // Encostado na borda direita do retrato, com uma folga do tamanho de um
        // décimo dele.
        left: largura * 1.1,
        gap: lado * 0.12,
      }}
    >
      {recentes.map((rolagem) => (
        <div
          key={rolagem.id}
          className="flex items-center rounded-md bg-black/55 backdrop-blur"
          style={{ gap: lado * 0.1, padding: lado * 0.08 }}
        >
          <DadoParado faces={rolagem.faces} valor={rolagem.valor} tamanho={lado} />

          {/* O número outra vez, em corpo grande. O dado já o mostra, e mostrar
              de novo não é redundância: na TV do outro lado da sala o sólido é
              reconhecível bem antes de o algarismo gravado nele ser legível. */}
          <span
            className="font-semibold text-white tabular-nums"
            style={{
              fontSize: lado * 0.62,
              lineHeight: 1,
              // Contorno escuro: o dado claro e o mapa claro existem os dois, e
              // número branco sobre os dois some.
              textShadow: `0 ${lado * 0.03}px ${lado * 0.06}px rgba(0,0,0,0.9)`,
            }}
          >
            {valorDaRolagem(rolagem.faces, rolagem.valor)}
          </span>
        </div>
      ))}
    </div>
  );
}
