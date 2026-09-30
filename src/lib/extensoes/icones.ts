"use client";

import {
  BookOpen,
  Clapperboard,
  Copy,
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

import { ICONES_DA_CONDICAO } from "@/components/playground/selos-da-condicao";

/**
 * Os ícones que um plugin pode pedir pelo nome.
 *
 * Uma lista escolhida, e não o `lucide-react` inteiro. O pacote tem mais de
 * mil ícones, e expô-lo por `import * as` poria todos no bundle do Mestre --
 * que é carregado enquanto o mestre espera a mesa abrir -- para servir a
 * plugins que talvez nem estejam instalados. Tudo que está aqui o aplicativo
 * JÁ importa em outro lugar (os selos de condição, os ícones de janela), então
 * a lista custa zero bytes a mais.
 *
 * Nomes em português, como as chaves dos selos: são os mesmos nomes que o
 * mestre já vê no seletor de ícone da condição, e um plugin que escreve
 * `"caveira"` no manifesto e no código vê o mesmo desenho nos dois lugares.
 *
 * Um plugin que precise de outro desenho traz o SVG na própria pasta e o
 * carrega por `api.extensao.url()` -- e ele pesa só quando instalado.
 */
export const ICONES: Readonly<Record<string, LucideIcon>> = Object.freeze({
  ...Object.fromEntries(ICONES_DA_CONDICAO.map(({ chave, Icone }) => [chave, Icone])),
  livro: BookOpen,
  cena: Clapperboard,
  copiar: Copy,
  dados: Dices,
  arquivos: Files,
  imagem: Image,
  camadas: Layers,
  estante: Library,
  biblioteca: LibraryBig,
  mesa: MonitorPlay,
  musica: Music,
  anexo: Paperclip,
  retrato: PersonStanding,
  plugin: Puzzle,
  ficha: ScrollText,
  configuracao: SlidersHorizontal,
  personagens: Users,
});

/** Um ícone pelo nome, ou a peça de quebra-cabeça para o que não existe. */
export function iconeDeExtensao(nome: string | null | undefined): LucideIcon {
  return (nome && ICONES[nome]) || Puzzle;
}
