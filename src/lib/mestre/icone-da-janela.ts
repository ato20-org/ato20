import {
  BookOpen,
  Clapperboard,
  Dices,
  Files,
  Image,
  Layers,
  Library,
  LibraryBig,
  MonitorPlay,
  Music,
  Paperclip,
  PersonStanding,
  Puzzle,
  ScrollText,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { ConteudoJanela } from "@/lib/store/use-window-store";

/**
 * O ícone de cada tela.
 *
 * Existe porque a aba encolheu: no formato de aba de navegador o rótulo é o
 * que ocupa, e numa coluna de 288 pixels três abas já disputam espaço. O ícone
 * é o que deixa a aba ativa reconhecível antes de o olho ler a palavra, e o que
 * identifica as inativas quando a tira rola.
 *
 * Função pura, e separada de `useRotuloJanela`: o ícone não depende de dado
 * nenhum -- a ficha do Victor e a do Edgar têm o mesmo --, então cobrá-lo de um
 * hook obrigaria quem só quer desenhar um menu a montar o índice de personagens.
 *
 * Mora AQUI, e não junto do `window-content` que a usa para desenhar a aba: os
 * painéis também a chamam, para o ícone do estado vazio ser o mesmo da aba que
 * abre aquele painel. Como o `window-content` importa todos os painéis, tê-la
 * lá fazia cada painel importar de volta quem o importa -- um ciclo.
 *
 * Sem `default` no `switch`, de propósito: é ele que faz o TypeScript apontar a
 * tela nova que entrou em `ConteudoJanela` e não escolheu ícone.
 */
export function iconeDaJanela(conteudo: ConteudoJanela): LucideIcon {
  switch (conteudo.tipo) {
    case "rolagens":
      return Dices;
    case "cenas":
      return Clapperboard;
    case "quadros":
      // Arquivos, como no Obsidian: quadros e notas na mesma árvore.
      return Files;
    case "retratos":
      return PersonStanding;
    case "camadas":
      return Layers;
    case "imagens":
      return LibraryBig;
    case "sons":
      return Music;
    case "personagens":
      return Users;
    case "personagem":
      // Ficha, e não pessoa: `Users` já é a lista, e duas telas com o mesmo
      // ícone na mesma tira não distinguem nada.
      return ScrollText;
    case "configuracao":
      return SlidersHorizontal;
    case "estante":
      return Library;
    case "livro":
      return BookOpen;
    case "miniplayer":
      return MonitorPlay;
    case "anexo":
      return Paperclip;
    case "asset":
      return Image;
    case "extensao":
      // Um ícone só para todas: o manifesto não declara um, e inventar por
      // extensão seria escolher pelo autor dela.
      return Puzzle;
  }
}
