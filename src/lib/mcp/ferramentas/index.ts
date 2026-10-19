"use client";

import { ferramentasDoAcervo } from "@/lib/mcp/ferramentas/acervo";
import { ferramentasDeCampanha } from "@/lib/mcp/ferramentas/campanha";
import { ferramentasDeCenas } from "@/lib/mcp/ferramentas/cenas";
import { ferramentasDoFio } from "@/lib/mcp/ferramentas/fio";
import { ferramentasDeItens } from "@/lib/mcp/ferramentas/itens";
import { ferramentasDeNotas } from "@/lib/mcp/ferramentas/notas";
import { ferramentasDePersonagens } from "@/lib/mcp/ferramentas/personagens";
import type { Ferramenta } from "@/lib/mcp/protocolo";

/**
 * Todas as ferramentas, na ordem em que o cliente as lista.
 *
 * Nenhuma apaga: tirar uma cena, um personagem ou um item da campanha continua
 * sendo gesto do mestre, na tela. A IA prepara e organiza; o que some, quem
 * tira é ele.
 */
export const FERRAMENTAS: readonly Ferramenta[] = [
  ...ferramentasDeCampanha,
  ...ferramentasDeNotas,
  ...ferramentasDeCenas,
  ...ferramentasDePersonagens,
  ...ferramentasDeItens,
  ...ferramentasDoAcervo,
  ...ferramentasDoFio,
];
