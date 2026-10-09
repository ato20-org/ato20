import type { Extensao, SistemaDeclarado } from "@/lib/extensoes/manifesto";

/** Um sistema declarado, com o plugin que o trouxe. */
export type SistemaDePlugin = {
  extensaoId: string;
  extensaoNome: string;
  sistema: SistemaDeclarado;
};

/**
 * Os sistemas que os plugins LIGADOS trazem, na ordem da lista de plugins.
 *
 * Desligado fica de fora: aplicar um sistema de um plugin que o mestre
 * desligou seria ele ligar pela porta dos fundos.
 */
export function sistemasDosPlugins(extensoes: readonly Extensao[]): SistemaDePlugin[] {
  return extensoes
    .filter((extensao) => extensao.habilitada)
    .flatMap((extensao) =>
      (extensao.contribui?.sistemas ?? []).map((sistema) => ({
        extensaoId: extensao.id,
        extensaoNome: extensao.nome,
        sistema,
      })),
    );
}

/** A chave de um sistema na tela: dois plugins podem ter um `ordem`. */
export function chaveDoSistema({ extensaoId, sistema }: SistemaDePlugin): string {
  return `${extensaoId}/${sistema.id}`;
}
