import { normaliza } from "@/lib/search";
import type { AnexoNaGaleria, ArquivoDaGaleria } from "@/lib/vault/galeria";
import { imagensDoPersonagem, type Personagem } from "@/types/character";
import type { Item } from "@/types/inventory";
import type { AssetMeta, Scene } from "@/types/scene";

/**
 * Uma imagem da Galeria: do acervo, ou anexo de personagem.
 *
 * Uma forma só para as duas, com o que a grade e a busca perguntam -- a chave,
 * o nome e a data -- por fora, e o dado de origem por dentro. As duas moram em
 * lugares diferentes no disco e chegam por caminhos diferentes, mas na grade
 * são a mesma coisa: uma imagem da campanha com um nome.
 */
export type ImagemDaGaleria =
  | { origem: "acervo"; chave: string; nome: string; data: number; asset: AssetMeta }
  | { origem: "anexo"; chave: string; nome: string; data: number; anexo: AnexoNaGaleria };

/**
 * O acervo e os anexos numa lista só, da mais nova para a mais antiga.
 *
 * Só imagem: a lista do acervo que chega já é a de imagens, e o filtro aqui é o
 * cinto -- um som na Galeria seria um quadrado vazio.
 *
 * A data do asset é a da importação, e a do anexo a do arquivo. Não são a
 * mesma pergunta, mas as duas respondem "quando isto entrou", e misturá-las é
 * o que põe a foto que o jogador mandou agora no topo, ao lado do mapa que o
 * mestre importou agora.
 */
export function imagensDaGaleria(
  assets: AssetMeta[],
  anexos: AnexoNaGaleria[],
): ImagemDaGaleria[] {
  const doAcervo: ImagemDaGaleria[] = assets
    .filter((asset) => asset.kind === "image")
    .map((asset) => ({
      origem: "acervo",
      chave: `asset:${asset.id}`,
      nome: asset.name,
      data: asset.createdAt,
      asset,
    }));

  const deAnexo: ImagemDaGaleria[] = anexos.map((anexo) => ({
    origem: "anexo",
    chave: `anexo:${anexo.personagemId}/${anexo.autor}/${anexo.arquivo}`,
    nome: anexo.arquivo,
    data: anexo.modificadoEm ?? 0,
    anexo,
  }));

  return [...doAcervo, ...deAnexo].sort((a, b) => b.data - a.data);
}

/**
 * As imagens que batem com a busca, na ordem em que vieram.
 *
 * Pelo NOME do arquivo, e só por ele: é a única coisa que toda imagem tem -- o
 * fundo de uma cena, o retrato de um personagem, o mapa solto em Arquivos e a
 * foto que o jogador mandou. Sem acento e sem caixa, como as outras buscas do
 * Mestre. Ver `normaliza`.
 *
 * Cada palavra procurada à parte, e todas precisam estar no nome: "taverna
 * noite" acha "Taverna do Porto - noite.jpg", que a frase inteira não acharia
 * por causa do que há entre as duas.
 */
export function filtrarGaleria(imagens: ImagemDaGaleria[], busca: string): ImagemDaGaleria[] {
  const termos = normaliza(busca).split(/\s+/).filter(Boolean);

  if (termos.length === 0) return imagens;

  return imagens.filter((imagem) => {
    const nome = normaliza(imagem.nome);

    return termos.every((termo) => nome.includes(termo));
  });
}

/** O descritor que o Rust entende, para os gestos do sistema. */
export function alvoDaImagem(imagem: ImagemDaGaleria): ArquivoDaGaleria {
  return imagem.origem === "acervo"
    ? { tipo: "asset", id: imagem.asset.id }
    : {
        tipo: "anexo",
        personagemId: imagem.anexo.personagemId,
        autor: imagem.anexo.autor,
        arquivo: imagem.anexo.arquivo,
      };
}

/** A medida natural, quando se sabe. */
export function medidaDaImagem(
  imagem: ImagemDaGaleria,
): { largura: number; altura: number } | undefined {
  const [largura, altura] =
    imagem.origem === "acervo"
      ? [imagem.asset.naturalWidth, imagem.asset.naturalHeight]
      : [imagem.anexo.largura, imagem.anexo.altura];

  return largura && altura ? { largura, altura } : undefined;
}

/** Onde a campanha usa a imagem, pelo NOME de cada lugar. */
export type UsosDaImagem = { cenas: string[]; personagens: string[]; itens: string[] };

/**
 * Onde a imagem aparece: em que cenas, de que personagens é a cara, de que
 * itens é a foto.
 *
 * É a pergunta que a janela de Propriedades responde e que a grade não
 * responde: o cartão diz "Cena", mas não QUAL. Nomes, e não contagem, porque
 * "em 2 cenas" obrigaria a abrir as cenas uma a uma para saber quais.
 *
 * O anexo não está em cena nenhuma -- o mapa só desenha o acervo --, e só pode
 * ser a foto de um item.
 */
export function usosDaImagem(
  imagem: ImagemDaGaleria,
  campanha: { cenas: Scene[]; personagens: Personagem[]; itens: Item[] },
): UsosDaImagem {
  if (imagem.origem === "anexo") {
    const { personagemId, autor, arquivo } = imagem.anexo;

    return {
      cenas: [],
      personagens: [],
      itens: campanha.itens
        .filter(
          (item) =>
            item.imagem?.tipo === "anexo" &&
            item.imagem.personagem === personagemId &&
            item.imagem.autor === autor &&
            item.imagem.arquivo === arquivo,
        )
        .map((item) => item.nome),
    };
  }

  const id = imagem.asset.id;

  return {
    cenas: campanha.cenas
      .filter(
        (cena) =>
          cena.backgroundAssetId === id ||
          cena.ceuAssetId === id ||
          cena.items.some((peca) => peca.assetId === id),
      )
      .map((cena) => cena.name),
    personagens: campanha.personagens
      .filter((personagem) => imagensDoPersonagem(personagem).includes(id))
      .map((personagem) => personagem.nome),
    itens: campanha.itens
      .filter((item) => item.imagem?.tipo === "asset" && item.imagem.id === id)
      .map((item) => item.nome),
  };
}
