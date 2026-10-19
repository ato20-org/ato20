"use client";

import { t } from "@/lib/i18n/mcp";
import { importarCaminhos } from "@/lib/vault/assets";
import type { CampaignInfo } from "@/lib/vault/campaign";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { FalhaDaFerramenta, chaveDeNome } from "@/lib/mcp/protocolo";
import type { AssetMeta, Board, EscopoAsset, ListaDePastas, Pasta, Scene } from "@/types/scene";

/**
 * O que toda ferramenta pergunta antes de mexer: há campanha, e o board dela
 * já chegou?
 */

/** Quanto se espera o board de uma campanha recém-aberta ser lido do disco. */
const ESPERA_DO_BOARD_MS = 30_000;

/**
 * A campanha aberta, com o board pronto.
 *
 * O `ready` da campanha chega ANTES do board: o `CampaignBoot` hidrata o store
 * de cenas depois de a campanha abrir, e uma nota criada nesse intervalo iria
 * para o board da campanha anterior -- ou para board nenhum.
 */
export async function campanhaPronta(): Promise<{ campanha: CampaignInfo; board: Board }> {
  const { status, campaign } = useCampaignStore.getState();
  if (status !== "ready" || !campaign) {
    throw new FalhaDaFerramenta(t.contexto.semCampanha);
  }

  const board = await boardPronto(campaign.path);

  return { campanha: campaign, board };
}

/** Espera o store de cenas terminar de ler a campanha `caminho`. */
export function boardPronto(caminho: string): Promise<Board> {
  const pronto = () => {
    const { status, campaignPath, board } = useSceneStore.getState();
    return status === "ready" && campaignPath === caminho && board ? board : null;
  };

  const agora = pronto();
  if (agora) return Promise.resolve(agora);

  return new Promise((resolve, reject) => {
    const desistir = setTimeout(() => {
      parar();
      reject(new FalhaDaFerramenta(t.contexto.boardNaoCarregou));
    }, ESPERA_DO_BOARD_MS);

    const parar = useSceneStore.subscribe(() => {
      const board = pronto();
      if (!board) return;

      clearTimeout(desistir);
      parar();
      resolve(board);
    });
  });
}

/** O board de agora, depois de uma mudança. */
export function boardAtual(): Board {
  const { board } = useSceneStore.getState();
  if (!board) throw new FalhaDaFerramenta(t.contexto.boardAusente);

  return board;
}

export type TipoDaCena = "mapa" | "quadro" | "fundo";

export function tipoDaCena(cena: Scene): TipoDaCena {
  return cena.tipo ?? "mapa";
}

/** Em que árvore de pastas mora cada tipo de cena. Quadro mora no Arquivos, sem lista. */
export function listaDaCena(tipo: TipoDaCena): ListaDePastas | undefined {
  if (tipo === "mapa") return "mapas";
  if (tipo === "fundo") return "fundos";

  return undefined;
}

/** As pastas de uma árvore. `undefined` é a do Arquivos. */
export function pastasDa(board: Board, lista: ListaDePastas | undefined): Pasta[] {
  return (board.pastas ?? []).filter((pasta) => pasta.lista === lista);
}

/** O nome da pasta, para as listas. */
export function nomeDaPasta(board: Board, pastaId: string | undefined): string | undefined {
  if (!pastaId) return undefined;

  return board.pastas?.find((pasta) => pasta.id === pastaId)?.nome;
}

/**
 * A pasta de nome `nome` numa árvore, criada na raiz se não existir.
 *
 * Pelo nome, e não pelo id: é como o mestre pede ("põe na pasta Sessão 3"), e
 * criar quando falta poupa ao modelo uma ferramenta só para isso. Pasta nunca
 * se apaga por aqui -- desfazer pasta é gesto do mestre.
 */
export function pastaPeloNome(nome: string, lista: ListaDePastas | undefined): string {
  const board = boardAtual();
  const chave = chaveDeNome(nome);
  const existente = pastasDa(board, lista).find((pasta) => chaveDeNome(pasta.nome) === chave);
  if (existente) return existente.id;

  return useSceneStore.getState().criarPasta(nome, undefined, lista);
}

/**
 * Traz um arquivo do disco para o acervo, pelo caminho.
 *
 * O mesmo `importarCaminhos` da tela, com o aviso de progresso: o mestre vê o
 * arquivo entrando, e a cópia de um mapa grande não parece um travamento.
 */
export async function importarUm(caminho: string, escopo?: EscopoAsset): Promise<AssetMeta> {
  if (!caminho.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(caminho)) {
    throw new FalhaDaFerramenta(t.contexto.caminhoAbsoluto(caminho));
  }

  const resultado = await importarCaminhos([caminho], escopo);
  const asset = resultado.aceitos[0];
  if (!asset) {
    throw new FalhaDaFerramenta(resultado.recusados[0] ?? t.contexto.naoEntrou(caminho));
  }

  return asset;
}

/** As medidas que interessam ao modelo, sem o resto do registro. */
export function descreverArquivo(asset: AssetMeta | undefined) {
  if (!asset) return null;

  return {
    id: asset.id,
    nome: asset.name,
    ...(asset.naturalWidth && asset.naturalHeight
      ? { largura: asset.naturalWidth, altura: asset.naturalHeight }
      : {}),
  };
}
