"use client";

import { t } from "@/lib/i18n/mcp";
import { listAssets } from "@/lib/vault/assets";
import { recentCampaigns } from "@/lib/vault/campaign";
import { listCharacters } from "@/lib/vault/characters";
import { listItens } from "@/lib/vault/itens";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import { boardPronto, campanhaPronta, tipoDaCena } from "@/lib/mcp/contexto";
import { FalhaDaFerramenta, type Ferramenta } from "@/lib/mcp/protocolo";

/** A campanha: o que está aberto, e trocar de campanha. */

async function recentes() {
  const lista = await recentCampaigns();
  const aberta = useCampaignStore.getState().campaign?.path;

  return lista.map((entrada) => ({
    nome: entrada.nome,
    pasta: entrada.path,
    aberta: entrada.path === aberta,
    existe: entrada.existe,
    abertaEm: new Date(entrada.abertaEm).toISOString(),
  }));
}

async function resumoDaCampanha() {
  const { campanha, board } = await campanhaPronta();
  const [personagens, itens, imagens] = await Promise.all([
    listCharacters(),
    listItens(),
    listAssets("image"),
  ]);

  const conta = (tipo: string) => board.scenes.filter((cena) => tipoDaCena(cena) === tipo).length;
  const nomeDaCena = (id: string | null) => board.scenes.find((cena) => cena.id === id)?.name ?? null;

  return {
    aberta: true,
    nome: campanha.nome,
    codigoDaMesa: campanha.codigo,
    pasta: campanha.path,
    cenas: { mapas: conta("mapa"), quadros: conta("quadro"), fundos: conta("fundo") },
    cenaEmEdicao: nomeDaCena(board.editingSceneId),
    cenaNoAr: nomeDaCena(board.liveSceneId),
    notas: board.notas?.length ?? 0,
    personagens: personagens.filter((personagem) => !personagem.compendio).length,
    moldesDePersonagem: personagens.filter((personagem) => personagem.compendio).length,
    itens: itens.filter((item) => !item.compendio).length,
    moldesDeItem: itens.filter((item) => item.compendio).length,
    imagensNaBiblioteca: imagens.filter((asset) => !asset.escopo).length,
  };
}

/**
 * Troca a campanha pelo caminho da porta, e diz como ficou.
 *
 * O erro é pego no caminho, e não lido no fim: a porta o mostra num aviso e o
 * apaga do store assim que desenha, e isso acontece antes de a troca devolver
 * o controle aqui.
 */
async function trocarDeCampanha(trocar: () => Promise<void>): Promise<unknown> {
  if (useCampaignStore.getState().busy) throw new FalhaDaFerramenta(t.campanha.ocupado);

  let erro: string | null = null;
  const parar = useCampaignStore.subscribe((estado) => {
    if (estado.error) erro = estado.error;
  });
  try {
    await trocar();
  } finally {
    parar();
  }

  const { status, campaign } = useCampaignStore.getState();
  if (status !== "ready" || !campaign) throw new FalhaDaFerramenta(erro ?? t.campanha.naoAbriu);

  await boardPronto(campaign.path);

  return resumoDaCampanha();
}

export const ferramentasDeCampanha: Ferramenta[] = [
  {
    nome: "campanha",
    titulo: t.campanha.campanha.titulo,
    descricao: t.campanha.campanha.descricao,
    entrada: { type: "object", properties: {} },
    somenteLeitura: true,
    async executar() {
      const { status } = useCampaignStore.getState();
      if (status !== "ready") {
        return {
          aberta: false,
          mensagem: t.campanha.nenhumaAberta,
          recentes: (await recentes()).slice(0, 10),
        };
      }

      return resumoDaCampanha();
    },
  },
  {
    nome: "listar_campanhas",
    titulo: t.campanha.listar.titulo,
    descricao: t.campanha.listar.descricao,
    entrada: { type: "object", properties: {} },
    somenteLeitura: true,
    executar: () => recentes(),
  },
  {
    nome: "abrir_campanha",
    titulo: t.campanha.abrir.titulo,
    descricao: t.campanha.abrir.descricao,
    entrada: {
      type: "object",
      properties: {
        pasta: { type: "string", description: t.campanha.abrir.pasta },
      },
      required: ["pasta"],
    },
    async executar(args) {
      const pasta = args.texto("pasta");

      return trocarDeCampanha(() => useCampaignStore.getState().choose(pasta));
    },
  },
  {
    nome: "criar_campanha",
    titulo: t.campanha.criar.titulo,
    descricao: t.campanha.criar.descricao,
    entrada: {
      type: "object",
      properties: {
        nome: { type: "string", description: t.campanha.criar.nome },
        pasta_mae: { type: "string", description: t.campanha.criar.pastaMae },
      },
      required: ["nome", "pasta_mae"],
    },
    async executar(args) {
      const nome = args.texto("nome");
      const pastaMae = args.texto("pasta_mae");

      return trocarDeCampanha(() => useCampaignStore.getState().criarEm(pastaMae, nome));
    },
  },
];
