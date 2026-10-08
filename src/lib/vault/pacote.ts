import { open, save } from "@tauri-apps/plugin-dialog";

import { t } from "@/lib/i18n/mestre";
import { call } from "@/lib/vault/bridge";
import type { Ambiente, Pasta, Scene } from "@/types/scene";

/**
 * Pacote: um pedaço da campanha num zip, para levar a outra. O desenho é o da
 * pasta de campanha, só com o que foi escolhido. Ver `vault/pacote.rs`.
 */

export type EscolhaDeExportacao = {
  cenas: string[];
  personagens: string[];
  /** Leva também os personagens dos tokens das cenas escolhidas. */
  levarPersonagens: boolean;
};

export type CenaDoPacote = {
  id: string;
  nome: string;
  /** `null` = mapa. Quadro não entra no pacote. */
  tipo: string | null;
  /** Nome da pasta no painel de origem. */
  pasta: string | null;
  /** Plugins que a cena cita, contando os efeitos da campanha que ela usa. */
  plugins: string[];
  /** Personagens do pacote que os tokens desta cena são. */
  personagens: string[];
};

export type PersonagemDoPacote = { id: string; nome: string; plugins: string[] };

export type PluginDoPacote = {
  id: string;
  nome?: string;
  versao?: string;
  repositorio?: string;
  instalado: boolean;
};

export type ResumoDoPacote = {
  campanha: string;
  cenas: CenaDoPacote[];
  personagens: PersonagemDoPacote[];
  plugins: PluginDoPacote[];
};

export type PacoteAberto = { token: string; resumo: ResumoDoPacote };

export type EscolhaDeImportacao = {
  cenas: string[];
  personagens: string[];
  removerPlugins: string[];
};

/** O que ficou de fora e por quê. A frase é montada na tela, nos dois idiomas. */
export type Pulado = {
  motivo: "efeitoJaExiste" | "efeitosNoMaximo" | "arquivoFaltando" | "personagemIlegivel";
  nome: string;
};

export type ImportadoDoPacote = {
  /** Com assets e efeitos remapeados, e ainda com o id de origem. */
  cenas: Scene[];
  pastas: Pasta[];
  /** Os ambientes de cada cena, pelo id de ORIGEM dela. */
  ambientes: Record<string, Ambiente[]>;
  /** Quantos personagens entraram. Já estão no disco; a tela só relê. */
  personagens: number;
  pulados: Pulado[];
};

/**
 * Pergunta onde salvar e grava o pacote. `null` = diálogo fechado.
 *
 * Quem chama grava o board antes (`flushBoard`): o pacote sai do disco.
 */
export async function exportarPacote(
  escolha: EscolhaDeExportacao,
  sufixo: string,
): Promise<string | null> {
  const nome = await call<string>("campaign_export_name");

  const destino = await save({
    title: t.pacote.salvar,
    defaultPath: nome.replace(/\.ato20\.zip$/, `-${sufixo}.ato20.zip`),
    filters: [{ name: t.dialogos.filtroZip, extensions: ["zip"] }],
  });

  if (!destino) return null;

  await call("pacote_exportar", { destino, escolha });

  return destino;
}

/** Escolhe um pacote (ou uma campanha exportada) e o abre. `null` = desistiu. */
export async function abrirPacote(): Promise<PacoteAberto | null> {
  const caminho = await open({
    multiple: false,
    title: t.pacote.escolher,
    filters: [{ name: t.dialogos.filtroZip, extensions: ["zip"] }],
  });

  if (typeof caminho !== "string") return null;

  return call<PacoteAberto>("pacote_abrir", { caminho });
}

/** Traz o escolhido para a campanha aberta. A pasta extraída sai do disco. */
export function importarPacote(
  token: string,
  escolha: EscolhaDeImportacao,
): Promise<ImportadoDoPacote> {
  return call<ImportadoDoPacote>("pacote_importar", { token, escolha });
}

/** Desiste do pacote aberto. */
export function fecharPacote(token: string): Promise<void> {
  return call("pacote_fechar", { token });
}
