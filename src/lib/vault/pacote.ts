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
  /** Partes que moram em arquivo do Rust: efeitos, medidores, condicoes. */
  secoes: SecaoDoRust[];
  /** Chaves da configuração da campanha, já escolhidas por seção. */
  configuracoes?: Record<string, unknown>;
  /** O layout dos retratos, como o store o tem. */
  retratos?: { layout: unknown; ancoraPadrao: unknown };
  ato20?: Ato20DoPacote;
};

export type SecaoDoRust = "efeitos" | "medidores" | "condicoes";
export type SecaoDoRegistro = "espectador" | "ajustes" | "plugins";
export type IdDaSecao = SecaoDoRust | SecaoDoRegistro | "retratos";

/** A configuração da máquina que viaja: os ajustes e a lista de plugins. */
export type Ato20DoPacote = {
  configuracoes: Record<string, unknown>;
  plugins: Array<{
    id: string;
    nome: unknown;
    versao: string;
    repositorio: string | null;
    habilitada: boolean;
  }>;
};

/**
 * A seção de uma chave da configuração da campanha. A mesma regra do Rust
 * (`secao_da_chave`): chave de plugin começa com o id dele.
 */
export function secaoDaChave(chave: string): SecaoDoRegistro {
  const prefixo = chave.split(".")[0];
  if (prefixo === "espectador") return "espectador";
  if (["ato20", "quadro", "rede"].includes(prefixo)) return "ajustes";
  return "plugins";
}

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

export type SecaoDoPacote = { id: IdDaSecao; itens: number; plugins: string[] };

export type ResumoDoPacote = {
  campanha: string;
  cenas: CenaDoPacote[];
  personagens: PersonagemDoPacote[];
  configuracao: SecaoDoPacote[];
  ato20: { chaves: number; plugins: PluginDoPacote[] } | null;
  plugins: PluginDoPacote[];
};

export type PacoteAberto = { token: string; resumo: ResumoDoPacote };

export type EscolhaDeImportacao = {
  cenas: string[];
  personagens: string[];
  secoes: IdDaSecao[];
  ato20: boolean;
  removerPlugins: string[];
};

/** O que ficou de fora e por quê. A frase é montada na tela, nos dois idiomas. */
export type Pulado = {
  motivo:
    | "efeitoJaExiste"
    | "efeitosNoMaximo"
    | "arquivoFaltando"
    | "personagemIlegivel"
    | "condicaoJaExiste"
    | "condicoesNoMaximo"
    | "medidorJaExiste"
    | "medidoresNoMaximo";
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
  efeitos: number;
  condicoes: number;
  medidores: number;
  /** Chaves da campanha para preencher onde não há. */
  configuracoes: Record<string, unknown>;
  /** O layout dos retratos, para aplicar se a campanha está no de fábrica. */
  retratos: { layout?: unknown; ancoraPadrao?: unknown } | null;
  /** As chaves do ATO20, para aplicar. */
  ato20: Record<string, unknown> | null;
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
