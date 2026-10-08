import { escolher } from "@/lib/i18n/idioma";

/**
 * O texto que não é de tela nenhuma: botões que todo diálogo tem, tempo
 * relativo, erros genéricos. Importado pelo Mestre, pelo celular e pela TV, então
 * só entra aqui o que as três usam -- o resto mora na área de quem usa.
 */
const pt = {
  cancelar: "Cancelar",
  fechar: "Fechar",
  diminuir: "Diminuir",
  aumentar: "Aumentar",

  tempo: {
    agoraHaPouco: "agora há pouco",
    menosDeUmMinuto: "menos de 1 min",
  },

  erros: {
    semAplicativo: "Falha ao falar com o aplicativo.",
    precisaDoAplicativo: "Esta tela precisa do aplicativo ATO20, não de uma aba do navegador.",
  },
};

const en: typeof pt = {
  cancelar: "Cancel",
  fechar: "Close",
  diminuir: "Decrease",
  aumentar: "Increase",

  tempo: {
    agoraHaPouco: "just now",
    menosDeUmMinuto: "under 1 min",
  },

  erros: {
    semAplicativo: "Could not reach the app.",
    precisaDoAplicativo: "This screen needs the ATO20 app, not a browser tab.",
  },
};

export const dicionarios = { "pt-BR": pt, en };

export const comum = escolher(dicionarios);
