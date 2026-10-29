/**
 * Os caminhos de um vault do Obsidian: relativos à raiz, sempre com `/`, como
 * o `obsidian_ler` do Rust os entrega.
 */

/** O nome do arquivo, sem as pastas. */
export function nomeDoArquivo(caminho: string): string {
  return caminho.slice(caminho.lastIndexOf("/") + 1);
}

/** A pasta do arquivo, sem a barra do fim. Vazio = a raiz do vault. */
export function pastaDoArquivo(caminho: string): string {
  const barra = caminho.lastIndexOf("/");
  return barra < 0 ? "" : caminho.slice(0, barra);
}

/** O nome sem a extensão: `Cenários/Poço.md` vira `Poço`. */
export function semExtensao(caminho: string): string {
  const nome = nomeDoArquivo(caminho);
  const ponto = nome.lastIndexOf(".");
  return ponto > 0 ? nome.slice(0, ponto) : nome;
}

/**
 * Todas as pastas por onde os arquivos passam, as de cima antes das de baixo.
 *
 * É a ordem de criar: a pasta-mãe tem de existir para a filha nascer dentro
 * dela. Sem a raiz, que é a pasta com o nome do vault e quem chama já criou.
 */
export function pastasDe(caminhos: readonly string[]): string[] {
  const pastas = new Set<string>();

  for (const caminho of caminhos) {
    const partes = pastaDoArquivo(caminho).split("/").filter(Boolean);
    for (let fim = 1; fim <= partes.length; fim += 1) {
      pastas.add(partes.slice(0, fim).join("/"));
    }
  }

  return [...pastas].sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );
}

/**
 * Acha o arquivo para onde um link do Obsidian aponta.
 *
 * O Obsidian aceita três jeitos de escrever o alvo, e este é o mesmo, em
 * ordem: o caminho inteiro a partir da raiz (`Imagens/Npc/Padre.png`), o
 * caminho a partir da pasta da nota que linka, e só o nome do arquivo
 * (`Padre.png`) -- o mais comum, e o que o próprio Obsidian escreve quando o
 * nome não se repete no vault. Com o nome repetido, ganha o de caminho mais
 * curto, que é a escolha dele também.
 *
 * Sem caixa: `poço.JPG` acha `Poço.jpg`, como no Obsidian. A nota pode ser
 * linkada sem o `.md`.
 */
export function criarResolvedor(
  caminhos: readonly string[],
): (alvo: string, deOnde: string) => string | null {
  const exato = new Map<string, string>();
  const porNome = new Map<string, string>();

  const porTamanho = [...caminhos].sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );

  for (const caminho of porTamanho) {
    const chave = caminho.toLowerCase();
    exato.set(chave, caminho);
    if (chave.endsWith(".md")) exato.set(chave.slice(0, -3), caminho);

    const nome = nomeDoArquivo(chave);
    if (!porNome.has(nome)) porNome.set(nome, caminho);
    if (nome.endsWith(".md") && !porNome.has(nome.slice(0, -3)))
      porNome.set(nome.slice(0, -3), caminho);
  }

  return (alvo, deOnde) => {
    const limpo = alvo.trim().replace(/^\.?\//, "").toLowerCase();
    if (!limpo) return null;

    const pasta = pastaDoArquivo(deOnde).toLowerCase();

    return (
      exato.get(limpo) ??
      (pasta ? exato.get(`${pasta}/${limpo}`) : undefined) ??
      porNome.get(nomeDoArquivo(limpo)) ??
      null
    );
  };
}
