import { normaliza } from "@/lib/search";
import { doGrupo, type GrupoDeDetalhes } from "@/types/detalhe";

/**
 * A busca nos detalhes de uma ficha, igual no Mestre e no celular.
 *
 * O grupo cujo NOME bate vem inteiro -- quem digita "perícias" quer as
 * perícias --; dos outros, só os detalhes que batem. Grupo sem achado sai.
 * `busca` chega já normalizada (ver `normaliza`): quem chama normaliza uma vez
 * por tecla, e não uma vez por detalhe.
 */
export function achadosNosDetalhes<D extends DetalheBuscavel>(
  grupos: readonly GrupoDeDetalhes[],
  detalhes: readonly D[],
  busca: string,
): Array<{ grupo: GrupoDeDetalhes; detalhes: D[] }> {
  return grupos
    .map((grupo) => {
      const todos = doGrupo(detalhes, grupo);

      return {
        grupo,
        detalhes:
          busca && !normaliza(grupo.nome).includes(busca)
            ? todos.filter((detalhe) => detalheCasa(detalhe, busca))
            : todos,
      };
    })
    .filter((achado) => achado.detalhes.length > 0);
}

type DetalheBuscavel = {
  grupo: string;
  rotulo: string;
  valor?: string | number;
  descricao?: string;
};

/** O detalhe casa com a busca pelo rótulo, pelo valor ou pela descrição. */
export function detalheCasa(detalhe: DetalheBuscavel, busca: string): boolean {
  return [
    detalhe.rotulo,
    detalhe.valor === undefined ? "" : String(detalhe.valor),
    detalhe.descricao ?? "",
  ].some((texto) => normaliza(texto).includes(busca));
}
