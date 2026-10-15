import { useConfiguracoesStore } from "@/lib/configuracoes/registro";
import type { Definicao } from "@/lib/configuracoes/valor";
import { t } from "@/lib/i18n/desktop";

/**
 * O cartão do Discord, por MÁQUINA: é o perfil de quem está sentado nela, e
 * não a cara da campanha -- exportar a campanha não leva o Discord do mestre.
 *
 * Ligado por padrão porque o que sai sem pedir é genérico: "Editando mapa",
 * "Mestrando campanha". O nome da campanha é o único dado da mesa que pode
 * sair, e só com a segunda chave ligada. Ver `presencaDe`.
 */
export const CHAVE_DO_DISCORD = {
  ligado: "ato20.discord",
  campanha: "ato20.discord.campanha",
} as const;

const DEFINICOES_DO_DISCORD: Definicao[] = [
  {
    chave: CHAVE_DO_DISCORD.ligado,
    titulo: t.definicoes.discord,
    descricao: t.definicoes.discordDescricao,
    tipo: "booleano",
    padrao: true,
    escopo: "maquina",
    dono: "ato20",
  },
  {
    chave: CHAVE_DO_DISCORD.campanha,
    titulo: t.definicoes.discordCampanha,
    descricao: t.definicoes.discordCampanhaDescricao,
    tipo: "booleano",
    padrao: false,
    escopo: "maquina",
    dono: "ato20",
  },
];

useConfiguracoesStore.getState().definir(DEFINICOES_DO_DISCORD);
