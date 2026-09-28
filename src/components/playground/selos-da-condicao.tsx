"use client";

import { createElement, type CSSProperties } from "react";
import {
  Anchor,
  Bed,
  Biohazard,
  Brain,
  Circle,
  Crown,
  EarOff,
  EyeOff,
  Feather,
  Flame,
  FlaskConical,
  Footprints,
  Frown,
  Ghost,
  Heart,
  HeartCrack,
  Hourglass,
  Link,
  Lock,
  MicOff,
  Moon,
  Mountain,
  Shield,
  Skull,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  Swords,
  Target,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { VAO_DO_SELO } from "@/lib/geometry/portrait";
import { cn } from "@/lib/utils";
import type { Condicao } from "@/types/character";

/**
 * Os desenhos que um selo pode ter, pelo nome que a condição guarda.
 *
 * Uma lista FECHADA de ícones da interface, e não emoji: emoji muda de desenho
 * entre o Linux do mestre, o navegador da TV e o celular do jogador, e o selo
 * que a mesa lê precisa ser o mesmo nas três telas. Os ícones vêm no pacote da
 * interface, que as três carregam.
 *
 * O nome guardado é o daqui, em português, e não o do lucide: renomear um
 * ícone na biblioteca não pode deixar a campanha sem selo.
 *
 * A ordem é a do seletor: primeiro o que mais se usa numa mesa -- morte, fogo,
 * veneno, gelo --, e depois o resto. Trinta e dois, que são quatro linhas
 * cheias no seletor de oito colunas: um ícone a mais sobrava sozinho numa
 * quinta.
 */
export const ICONES_DA_CONDICAO: ReadonlyArray<{
  chave: string;
  rotulo: string;
  Icone: LucideIcon;
}> = [
  { chave: "caveira", rotulo: "Caveira", Icone: Skull },
  { chave: "chama", rotulo: "Chama", Icone: Flame },
  { chave: "frasco", rotulo: "Frasco", Icone: FlaskConical },
  { chave: "veneno", rotulo: "Veneno", Icone: Biohazard },
  { chave: "floco", rotulo: "Gelo", Icone: Snowflake },
  { chave: "raio", rotulo: "Raio", Icone: Zap },
  { chave: "fantasma", rotulo: "Fantasma", Icone: Ghost },
  { chave: "coracao-partido", rotulo: "Coração partido", Icone: HeartCrack },
  { chave: "coracao", rotulo: "Coração", Icone: Heart },
  { chave: "cama", rotulo: "Caído", Icone: Bed },
  { chave: "lua", rotulo: "Sono", Icone: Moon },
  { chave: "medo", rotulo: "Medo", Icone: Frown },
  { chave: "cerebro", rotulo: "Mente", Icone: Brain },
  { chave: "olho-fechado", rotulo: "Cego", Icone: EyeOff },
  { chave: "surdo", rotulo: "Surdo", Icone: EarOff },
  { chave: "mudo", rotulo: "Silenciado", Icone: MicOff },
  { chave: "corrente", rotulo: "Agarrado", Icone: Link },
  { chave: "ancora", rotulo: "Preso", Icone: Anchor },
  { chave: "cadeado", rotulo: "Trancado", Icone: Lock },
  { chave: "pegadas", rotulo: "Lento", Icone: Footprints },
  { chave: "montanha", rotulo: "Pedra", Icone: Mountain },
  { chave: "pena", rotulo: "Pena", Icone: Feather },
  { chave: "vento", rotulo: "Vento", Icone: Wind },
  { chave: "brilho", rotulo: "Brilho", Icone: Sparkles },
  { chave: "sol", rotulo: "Sol", Icone: Sun },
  { chave: "escudo", rotulo: "Escudo", Icone: Shield },
  { chave: "espadas", rotulo: "Espadas", Icone: Swords },
  { chave: "alvo", rotulo: "Marcado", Icone: Target },
  { chave: "ampulheta", rotulo: "Ampulheta", Icone: Hourglass },
  { chave: "coroa", rotulo: "Coroa", Icone: Crown },
  { chave: "estrela", rotulo: "Estrela", Icone: Star },
  { chave: "circulo", rotulo: "Círculo", Icone: Circle },
];

const POR_CHAVE = new Map(
  ICONES_DA_CONDICAO.map((opcao) => [opcao.chave, opcao.Icone]),
);

/**
 * O desenho de um nome de ícone. Nome que esta versão não conhece desenha o
 * círculo, que é o mesmo que o Rust grava para quem chegou sem nenhum -- os
 * dois casos se leem igual.
 */
export function iconeDaCondicao(chave: string): LucideIcon {
  return POR_CHAVE.get(chave) ?? Circle;
}

/**
 * Um selo: o ícone na cor da condição, sobre um disco escuro.
 *
 * O disco é a exceção à regra "sem fundo, com sombra" do nome e dos medidores
 * sobre o mapa, e é de propósito: um ícone vazado em verde sobre uma floresta
 * some, e o nome resiste porque é texto branco. O disco é escuro e
 * translúcido, e a borda na cor da condição faz o selo se ler de longe mesmo
 * quando o ícone é pequeno demais para se distinguir.
 */
export function SeloDaCondicao({
  condicao,
  tamanho,
  className,
}: {
  condicao: Pick<Condicao, "cor" | "icone" | "nome">;
  /** O diâmetro, na unidade de quem chama -- cena no mapa, pixel na ficha. */
  tamanho: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full",
        className,
      )}
      style={{
        width: tamanho,
        height: tamanho,
        backgroundColor: "rgba(0, 0, 0, 0.62)",
        boxShadow: `inset 0 0 0 ${Math.max(1, tamanho * 0.07)}px ${condicao.cor}`,
      }}
    >
      {/* Por `createElement`, e não `<Icone />` com uma variável: o componente
          sai de uma consulta, e a regra de componentes estáticos não distingue
          uma consulta a um mapa fixo de um componente criado no render. */}
      {createElement(iconeDaCondicao(condicao.icone), {
        "aria-hidden": true,
        style: { width: tamanho * 0.6, height: tamanho * 0.6, color: condicao.cor },
        strokeWidth: 2.4,
      })}
    </span>
  );
}

/**
 * A fileira de selos de um personagem: sobre o token, no retrato, no celular.
 *
 * Os escondidos só chegam aqui no palco do Mestre -- a lista é filtrada por
 * quem a monta, como a dos medidores --, e desenham APAGADOS: ele precisa ver
 * que a maldição está lá, e que a mesa não a vê.
 *
 * Quebra em linhas em vez de sair pela lateral: o limite de oito já é o que
 * cabe numa fileira sobre o nome, mas o retrato estreito pode pedir duas.
 */
export function SelosDaCondicao({
  condicoes,
  tamanho,
  className,
  style,
}: {
  condicoes: ReadonlyArray<Condicao>;
  tamanho: number;
  className?: string;
  style?: CSSProperties;
}) {
  if (condicoes.length === 0) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center justify-center", className)}
      style={{ gap: tamanho * VAO_DO_SELO, ...style }}
    >
      {condicoes.map((condicao) => (
        <SeloDaCondicao
          key={condicao.id}
          condicao={condicao}
          tamanho={tamanho}
          className={cn(condicao.escondido && "opacity-45")}
        />
      ))}
    </div>
  );
}
