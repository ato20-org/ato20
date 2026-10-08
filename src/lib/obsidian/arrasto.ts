import { t } from "@/lib/i18n/arquivos";
import type { IdentidadeDeFora } from "@/lib/vault/importar";

/**
 * A linha que o painel Arquivos mostra enquanto o arquivo do sistema está no
 * ar sobre ele: o que vem, antes de soltar.
 *
 * Um item diz o nome e o que ele é -- "Vault do Obsidian · Lendas" --, porque
 * é aí que o mestre confere se pegou a pasta certa. Vários dizem só quantos de
 * cada: os nomes de seis pastas não cabem numa linha de painel.
 */
export function rotuloDoQueVem(identidades: readonly IdentidadeDeFora[]): string {
  if (identidades.length === 0) return t.importarDeFora.soltarParaImportar;

  if (identidades.length === 1) {
    const [item] = identidades;
    if (item!.tipo === "vault") return t.importarDeFora.vemVault(item!.nome);
    if (item!.tipo === "pasta") return t.importarDeFora.vemPasta(item!.nome);
    return t.importarDeFora.vemArquivo(item!.nome);
  }

  const pastas = identidades.filter((item) => item.tipo !== "arquivo").length;
  const arquivos = identidades.length - pastas;

  return [
    ...(pastas ? [t.importarDeFora.vemPastas(pastas)] : []),
    ...(arquivos ? [t.importarDeFora.vemArquivos(arquivos)] : []),
  ].join(" e ");
}
