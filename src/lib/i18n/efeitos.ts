import { escolher } from "@/lib/i18n/idioma";

/**
 * Os efeitos que vêm no ATO20, pelo id da pasta em `src/efeitos/`. O português
 * é o do `efeito.json`, que segue como reserva.
 *
 * Arquivo próprio, e não dentro do dicionário do Mestre: `lib/efeitos.ts` roda
 * também no celular e na janela do espectador, e importar o Mestre arrastaria o
 * texto inteiro dele para o celular por causa de cinco títulos.
 */
const pt = {
  chamas: {
    titulo: "Em chamas",
    dica: "Fogo em volta da figura, na cor da condição, com a luz tremulando.",
  },
  congelado: {
    titulo: "Congelado",
    dica: "A figura azula, trinca e treme, com cristais de gelo em volta.",
  },
  envenenado: {
    titulo: "Envenenado",
    dica: "A figura esverdeia, a névoa tóxica sobe dos pés e caveirinhas escapam dela.",
  },
  molhado: {
    titulo: "Molhado",
    dica: "A figura encharcada, com gotas na pele, pingando numa poça aos pés.",
  },
  sangrando: {
    titulo: "Sangrando",
    dica: "Talhos abertos na figura, o sangue pingando dela e a poça aos pés.",
  },
  // Os disparos: saem de um ponto e vão até outro.
  "bola-de-fogo": {
    titulo: "Bola de fogo",
    dica: "Voa em linha até o alvo e estoura em chamas em volta dele.",
  },
  "raio-de-gelo": {
    titulo: "Raio de gelo",
    dica: "Um estilhaço de gelo reto e rápido, sem estouro: chega e pronto.",
  },
  "jato-de-agua": {
    titulo: "Jato d'água",
    dica: "Uma gota em linha que se espalha num respingo onde cai.",
  },
  "sopro-de-fogo": {
    titulo: "Sopro de fogo",
    dica: "Um leque de chamas que se abre de quem sopra: o hálito do dragão.",
  },
  "nuvem-venenosa": {
    titulo: "Nuvem venenosa",
    dica: "Um cone de névoa tóxica que se espalha de quem a solta.",
  },
};

const en: typeof pt = {
  chamas: {
    titulo: "On fire",
    dica: "Fire around the figure, in the condition color, with flickering light.",
  },
  congelado: {
    titulo: "Frozen",
    dica: "The figure turns blue, cracks and shakes, with ice crystals around it.",
  },
  envenenado: {
    titulo: "Poisoned",
    dica: "The figure turns green, toxic mist rises from its feet and little skulls escape from it.",
  },
  molhado: {
    titulo: "Wet",
    dica: "The figure is soaked, with drops on its skin, dripping into a puddle at its feet.",
  },
  sangrando: {
    titulo: "Bleeding",
    dica: "Open gashes on the figure, blood dripping from it into a pool at its feet.",
  },
  "bola-de-fogo": {
    titulo: "Fireball",
    dica: "Flies in a line to the target and bursts into flames around it.",
  },
  "raio-de-gelo": {
    titulo: "Ray of frost",
    dica: "A straight, fast shard of ice with no burst: it hits and that's it.",
  },
  "jato-de-agua": {
    titulo: "Water jet",
    dica: "A drop in a line that spreads into a splash where it lands.",
  },
  "sopro-de-fogo": {
    titulo: "Fire breath",
    dica: "A fan of flames opening from whoever breathes it: the dragon's breath.",
  },
  "nuvem-venenosa": {
    titulo: "Poison cloud",
    dica: "A cone of toxic mist spreading from whoever releases it.",
  },
};

export const dicionarios = { "pt-BR": pt, en };

export const t = escolher(dicionarios);
