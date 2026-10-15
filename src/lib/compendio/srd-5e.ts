/**
 * Este compêndio utiliza material do System Reference Document 5.1 ("SRD 5.1")
 * publicado pela Wizards of the Coast LLC sob a licença
 * Creative Commons Attribution 4.0 International (CC-BY-4.0).
 * https://creativecommons.org/licenses/by/4.0/legalcode
 */

import { novoId } from "@/lib/id";
import type { Atributo, Medidor, Personagem } from "@/types/character";

export interface SrdCreature {
  slug: string;
  name: string;
  type: string;
  cr: string;
  size: string;
  hp: number;
  maxHp: number;
  ac: number;
  speed: string;
  abilities: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  actions: {
    name: string;
    desc: string;
    attackBonus?: number;
    damage?: string;
  }[];
}

export const MONSTROS_SRD_5E: readonly SrdCreature[] = [
  {
    slug: "goblin",
    name: "Goblin",
    type: "Humanoide (Goblinóide)",
    cr: "1/4",
    size: "Pequeno",
    hp: 7,
    maxHp: 7,
    ac: 15,
    speed: "9m (30ft)",
    abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    actions: [
      {
        name: "Cimitarra",
        desc: "+4 para acertar, alcance 1.5m. Dano: 1d6+2 cortante.",
        attackBonus: 4,
        damage: "1d6+2",
      },
      {
        name: "Arco Curto",
        desc: "+4 para acertar, distância 24/96m. Dano: 1d6+2 perfurante.",
        attackBonus: 4,
        damage: "1d6+2",
      },
    ],
  },
  {
    slug: "esqueleto",
    name: "Esqueleto",
    type: "Morto-vivo",
    cr: "1/4",
    size: "Médio",
    hp: 13,
    maxHp: 13,
    ac: 13,
    speed: "9m (30ft)",
    abilities: { str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5 },
    actions: [
      {
        name: "Espada Curta",
        desc: "+4 para acertar, alcance 1.5m. Dano: 1d6+2 perfurante.",
        attackBonus: 4,
        damage: "1d6+2",
      },
      {
        name: "Arco Curto",
        desc: "+4 para acertar, distância 24/96m. Dano: 1d6+2 perfurante.",
        attackBonus: 4,
        damage: "1d6+2",
      },
    ],
  },
  {
    slug: "zumbi",
    name: "Zumbi",
    type: "Morto-vivo",
    cr: "1/4",
    size: "Médio",
    hp: 22,
    maxHp: 22,
    ac: 8,
    speed: "6m (20ft)",
    abilities: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 },
    actions: [
      {
        name: "Pancada",
        desc: "+3 para acertar, alcance 1.5m. Dano: 1d6+1 contundente.",
        attackBonus: 3,
        damage: "1d6+1",
      },
    ],
  },
  {
    slug: "lobo",
    name: "Lobo",
    type: "Besta",
    cr: "1/4",
    size: "Médio",
    hp: 11,
    maxHp: 11,
    ac: 13,
    speed: "12m (40ft)",
    abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
    actions: [
      {
        name: "Mordida",
        desc: "+4 para acertar, alcance 1.5m. Dano: 2d4+2 perfurante. Teste de Força CD 11 ou é derrubado.",
        attackBonus: 4,
        damage: "2d4+2",
      },
    ],
  },
  {
    slug: "orc",
    name: "Orc",
    type: "Humanoide (Orc)",
    cr: "1/2",
    size: "Médio",
    hp: 15,
    maxHp: 15,
    ac: 13,
    speed: "9m (30ft)",
    abilities: { str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10 },
    actions: [
      {
        name: "Machado Grande",
        desc: "+5 para acertar, alcance 1.5m. Dano: 1d12+3 cortante.",
        attackBonus: 5,
        damage: "1d12+3",
      },
      {
        name: "Azagaia",
        desc: "+5 para acertar, distância 9/36m. Dano: 1d6+3 perfurante.",
        attackBonus: 5,
        damage: "1d6+3",
      },
    ],
  },
  {
    slug: "ogro",
    name: "Ogro",
    type: "Gigante",
    cr: "2",
    size: "Grande",
    hp: 59,
    maxHp: 59,
    ac: 11,
    speed: "12m (40ft)",
    abilities: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 },
    actions: [
      {
        name: "Clava Grande",
        desc: "+6 para acertar, alcance 1.5m. Dano: 2d8+4 contundente.",
        attackBonus: 6,
        damage: "2d8+4",
      },
      {
        name: "Azagaia",
        desc: "+6 para acertar, distância 9/36m. Dano: 2d6+4 perfurante.",
        attackBonus: 6,
        damage: "2d6+4",
      },
    ],
  },
  {
    slug: "urso-coruja",
    name: "Urso-Coruja",
    type: "Monstruosidade",
    cr: "3",
    size: "Grande",
    hp: 59,
    maxHp: 59,
    ac: 13,
    speed: "12m (40ft)",
    abilities: { str: 20, dex: 12, con: 17, int: 3, wis: 12, cha: 7 },
    actions: [
      {
        name: "Bico",
        desc: "+7 para acertar, alcance 1.5m. Dano: 1d10+5 perfurante.",
        attackBonus: 7,
        damage: "1d10+5",
      },
      {
        name: "Garras",
        desc: "+7 para acertar, alcance 1.5m. Dano: 2d8+5 cortante.",
        attackBonus: 7,
        damage: "2d8+5",
      },
    ],
  },
  {
    slug: "dragao-vermelho-jovem",
    name: "Dragão Vermelho Jovem",
    type: "Dragão",
    cr: "10",
    size: "Grande",
    hp: 178,
    maxHp: 178,
    ac: 18,
    speed: "12m (40ft), voo 24m (80ft)",
    abilities: { str: 23, dex: 10, con: 21, int: 14, wis: 11, cha: 19 },
    actions: [
      {
        name: "Mordida",
        desc: "+10 para acertar, alcance 3m. Dano: 2d10+6 perfurante mais 1d6 de fogo.",
        attackBonus: 10,
        damage: "2d10+6+1d6",
      },
      {
        name: "Garras",
        desc: "+10 para acertar, alcance 1.5m. Dano: 2d6+6 cortante.",
        attackBonus: 10,
        damage: "2d6+6",
      },
      {
        name: "Sopro de Fogo (Recarga 5-6)",
        desc: "Cone de 9m (30ft). Cada criatura faz teste de Destreza CD 17, sofrendo 16d6 de dano de fogo na falha, ou metade no sucesso.",
      },
    ],
  },
];

/**
 * Converte um monstro do compêndio SRD 5.1 para uma ficha de Personagem nativa do ATO20.
 */
export function monstroParaPersonagem(
  monstro: SrdCreature,
  idCustomizado?: string,
): Personagem {
  const medidores: Medidor[] = [
    {
      id: novoId(),
      nome: "PV",
      cor: "#ef4444", // Vermelho vida
      estilo: "barra",
      atual: monstro.hp,
      maximo: monstro.maxHp,
      escondido: false,
    },
  ];

  const atributos: Atributo[] = [
    { id: novoId(), sigla: "CA", valor: monstro.ac, descricao: "Classe de Armadura" },
    { id: novoId(), sigla: "FOR", valor: monstro.abilities.str, descricao: "Força" },
    { id: novoId(), sigla: "DES", valor: monstro.abilities.dex, descricao: "Destreza" },
    { id: novoId(), sigla: "CON", valor: monstro.abilities.con, descricao: "Constituição" },
    { id: novoId(), sigla: "INT", valor: monstro.abilities.int, descricao: "Inteligência" },
    { id: novoId(), sigla: "SAB", valor: monstro.abilities.wis, descricao: "Sabedoria" },
    { id: novoId(), sigla: "CAR", valor: monstro.abilities.cha, descricao: "Carisma" },
  ];

  return {
    id: idCustomizado ?? novoId(),
    nome: monstro.name,
    medidores,
    atributos,
    criadoEm: Date.now(),
  };
}

/**
 * Busca uma criatura no compêndio SRD 5.1 pelo seu slug único.
 */
export function obterMonstroPorSlug(slug: string): SrdCreature | undefined {
  return MONSTROS_SRD_5E.find((m) => m.slug === slug);
}
