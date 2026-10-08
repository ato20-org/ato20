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
  Droplet,
  Droplets,
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
import { t } from "@/lib/i18n/palco";
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
  { chave: "caveira", rotulo: t.iconesDaCondicao.caveira, Icone: Skull },
  { chave: "chama", rotulo: t.iconesDaCondicao.chama, Icone: Flame },
  { chave: "frasco", rotulo: t.iconesDaCondicao.frasco, Icone: FlaskConical },
  { chave: "veneno", rotulo: t.iconesDaCondicao.veneno, Icone: Biohazard },
  { chave: "floco", rotulo: t.iconesDaCondicao.floco, Icone: Snowflake },
  { chave: "gota", rotulo: t.iconesDaCondicao.gota, Icone: Droplet },
  { chave: "sangue", rotulo: t.iconesDaCondicao.sangue, Icone: Droplets },
  { chave: "raio", rotulo: t.iconesDaCondicao.raio, Icone: Zap },
  { chave: "fantasma", rotulo: t.iconesDaCondicao.fantasma, Icone: Ghost },
  { chave: "coracao-partido", rotulo: t.iconesDaCondicao.coracaoPartido, Icone: HeartCrack },
  { chave: "coracao", rotulo: t.iconesDaCondicao.coracao, Icone: Heart },
  { chave: "cama", rotulo: t.iconesDaCondicao.cama, Icone: Bed },
  { chave: "lua", rotulo: t.iconesDaCondicao.lua, Icone: Moon },
  { chave: "medo", rotulo: t.iconesDaCondicao.medo, Icone: Frown },
  { chave: "cerebro", rotulo: t.iconesDaCondicao.cerebro, Icone: Brain },
  { chave: "olho-fechado", rotulo: t.iconesDaCondicao.olhoFechado, Icone: EyeOff },
  { chave: "surdo", rotulo: t.iconesDaCondicao.surdo, Icone: EarOff },
  { chave: "mudo", rotulo: t.iconesDaCondicao.mudo, Icone: MicOff },
  { chave: "corrente", rotulo: t.iconesDaCondicao.corrente, Icone: Link },
  { chave: "ancora", rotulo: t.iconesDaCondicao.ancora, Icone: Anchor },
  { chave: "cadeado", rotulo: t.iconesDaCondicao.cadeado, Icone: Lock },
  { chave: "pegadas", rotulo: t.iconesDaCondicao.pegadas, Icone: Footprints },
  { chave: "montanha", rotulo: t.iconesDaCondicao.montanha, Icone: Mountain },
  { chave: "pena", rotulo: t.iconesDaCondicao.pena, Icone: Feather },
  { chave: "vento", rotulo: t.iconesDaCondicao.vento, Icone: Wind },
  { chave: "brilho", rotulo: t.iconesDaCondicao.brilho, Icone: Sparkles },
  { chave: "sol", rotulo: t.iconesDaCondicao.sol, Icone: Sun },
  { chave: "escudo", rotulo: t.iconesDaCondicao.escudo, Icone: Shield },
  { chave: "espadas", rotulo: t.iconesDaCondicao.espadas, Icone: Swords },
  { chave: "alvo", rotulo: t.iconesDaCondicao.alvo, Icone: Target },
  { chave: "ampulheta", rotulo: t.iconesDaCondicao.ampulheta, Icone: Hourglass },
  { chave: "coroa", rotulo: t.iconesDaCondicao.coroa, Icone: Crown },
  { chave: "estrela", rotulo: t.iconesDaCondicao.estrela, Icone: Star },
  { chave: "circulo", rotulo: t.iconesDaCondicao.circulo, Icone: Circle },
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
          uma consulta a um mapa fixo de um componente criado no render.

          O traço vai nos FILHOS do SVG, e não no `strokeWidth` da raiz. O
          WebKitGTK multiplica o `stroke-width` da raiz `<svg>` pelo `zoom` do
          plano, e os filhos herdam o valor já multiplicado -- que o desenho
          ainda amplia de novo. Sobre o token, em unidade de cena, a 300% a
          caveira virava mancha e a 1122% um quadrado cheio. Declarado no
          filho, o valor não passa pelo `zoom` e fica certo em qualquer
          ampliação, sem conta e sem ler a escala. Medido na webview com a
          mesma caveira, raiz contra filho, de 50% a 1122%. */}
      {createElement(iconeDaCondicao(condicao.icone), {
        "aria-hidden": true,
        className: "[&>*]:[stroke-width:2.4px]",
        style: { width: tamanho * 0.6, height: tamanho * 0.6, color: condicao.cor },
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
