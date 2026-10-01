"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  API_VERSAO_ATUAL,
  resumoDaCena,
  type AcaoRecebida,
  type Ato20Api,
  type ContextoDeMenu,
  type Desfazer,
  type JanelaDeExtensao,
  type ModuloExtensao,
} from "@/lib/extensoes/api";
import {
  assinarConfiguracao,
  useConfiguracoesStore,
  valorDe,
} from "@/lib/configuracoes/registro";
import { COMPONENTES, EXPERIMENTAL } from "@/lib/extensoes/componentes";
import { assinarFioParaPlugin, postarParaPlugin } from "@/lib/extensoes/chat";
import { rolarParaPlugin } from "@/lib/extensoes/dados";
import {
  assinaturaDaMesa,
  dadosNaMesa,
  montarLinkDaPagina,
  publicarNoCanal,
} from "@/lib/extensoes/mesa";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import { daemonAddr } from "@/lib/vault/bridge";
import { listPlayers } from "@/lib/vault/players";
import { characterLinks } from "@/lib/vault/characters";
import {
  assinarRetratosNaMesa,
  retratoDoPersonagem,
  retratosNaMesa,
} from "@/lib/extensoes/retratos";
import {
  diferencasDeCondicoes,
  diferencasDeMedidores,
} from "@/lib/extensoes/diferencas";
import { ICONES } from "@/lib/extensoes/icones";
import { abrirJanela, fecharJanela } from "@/lib/extensoes/janelas";
import { ajustarMedidorEmLote } from "@/lib/extensoes/lote-de-medidores";
import {
  chaveContribuicao,
  urlDaExtensao,
  type Extensao,
} from "@/lib/extensoes/manifesto";
import { chaveDe, type ConteudoJanela } from "@/lib/store/use-window-store";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useContribuicoesStore } from "@/lib/store/use-contribuicoes-store";
import { useDadosStore } from "@/lib/store/use-dados-store";
import { useRolagensStore } from "@/lib/store/use-rolagens-store";
import {
  selectEditingScene,
  selectLiveScene,
  useSceneStore,
} from "@/lib/store/use-scene-store";
import {
  alternarCondicao,
  gravarDadosDeExtensao,
  lerDadosDeExtensao,
  listarCondicoesDaCampanha,
} from "@/lib/vault/characters";
import { valorDaRolagem } from "@/types/dado";

/**
 * Importa o módulo de uma extensão e deixa ela ativar o que trouxe.
 *
 * **Preguiçoso.** Só acontece quando alguém abre um painel ou dispara um
 * comando dela — é o que o `contribui` no manifesto compra. Dez extensões
 * instaladas não custam dez módulos na abertura da janela, que é onde o mestre
 * está esperando a mesa abrir.
 *
 * **Contido.** Um plugin que estoura no `ativar` não pode derrubar o Mestre:
 * o erro é preso aqui, a extensão é marcada como falha e o que ela chegou a
 * registrar é esquecido. Sem isso, um plugin ruim briga a janela do mestre — e
 * ele fica sem alcançar o botão que o desliga, que é o pior desfecho possível.
 */

/** Uma carga em curso, para dois pedidos simultâneos não importarem duas vezes. */
const emCurso = new Map<string, Promise<void>>();

/** O que cada extensão registrou, para desfazer tudo ao desligar. */
const desfazeres = new Map<string, Desfazer[]>();

export function garantirCarregada(extensao: Extensao): Promise<void> {
  const { estado } = useContribuicoesStore.getState().carga[extensao.id] ?? {
    estado: "ausente",
  };

  // `falhou` também não repete: o módulo que estourou vai estourar de novo, e
  // tentar a cada render viraria um laço de erro em cima do palco.
  if (estado === "pronta" || estado === "falhou") return Promise.resolve();

  const jaVai = emCurso.get(extensao.id);
  if (jaVai) return jaVai;

  const promessa = carregar(extensao).finally(() =>
    emCurso.delete(extensao.id),
  );
  emCurso.set(extensao.id, promessa);

  return promessa;
}

async function carregar(extensao: Extensao): Promise<void> {
  const { marcar, esquecer } = useContribuicoesStore.getState();

  if (!extensao.principal) {
    marcar(extensao.id, "falhou", "A extensão não declara `principal`.");
    return;
  }

  marcar(extensao.id, "carregando");

  try {
    // A versão entra na URL pelo mesmo motivo do tema: reinstalar com versão
    // nova traz o módulo novo, sem depender do cache da webview.
    const modulo: { default?: ModuloExtensao } = await import(
      /* webpackIgnore: true */
      /* @vite-ignore */
      urlDaExtensao(extensao.id, extensao.principal, extensao.versao)
    );

    const plugin = modulo.default;

    if (!plugin || typeof plugin !== "object") {
      throw new Error("o módulo não tem `export default` com um objeto.");
    }

    const registrados: Desfazer[] = [];
    const api = construirApi(extensao, registrados);

    // O que `ativar` devolver entra na lista de desfazeres junto com o que ele
    // registrou: é o caminho para o plugin desfazer o que criou POR FORA —
    // um `setInterval`, um ouvinte no `window`.
    const extra = await plugin.ativar?.(api);
    if (typeof extra === "function") registrados.push(extra);

    if (plugin.desativar) registrados.push(() => plugin.desativar?.());

    desfazeres.set(extensao.id, registrados);
    marcar(extensao.id, "pronta");
  } catch (causa) {
    const motivo = causa instanceof Error ? causa.message : String(causa);

    // Esquece antes de marcar: um `ativar` que estourou no meio pode ter
    // registrado metade das contribuições, e metade de um plugin na interface é
    // pior que nenhuma.
    esquecer(extensao.id);
    useContribuicoesStore.getState().marcar(extensao.id, "falhou", motivo);

    // Avisa UMA vez, e na tela: o `console` não é lugar de erro que o usuário
    // precisa ver, e a tela de Plugins guarda o motivo para ele reler depois.
    toast.error(`O plugin ${extensao.nome} falhou ao carregar.`, {
      description: motivo,
    });
  }
}

/**
 * Dispara um comando de extensão, importando o módulo se preciso.
 *
 * É o segundo gatilho da ativação preguiçosa — o primeiro é abrir um painel.
 * Aqui ele importa mais: a tecla é apertada no meio da mesa, e o módulo pode
 * nunca ter sido carregado nesta sessão.
 *
 * Silencioso quando a extensão está desligada: o atalho dela nem está na
 * tabela nesse caso, e chegar aqui seria uma corrida entre desligar e teclar.
 */
export async function executarComando(
  extensao: Extensao,
  comandoId: string,
): Promise<void> {
  if (!extensao.habilitada) return;

  await garantirCarregada(extensao);

  const executar =
    useContribuicoesStore.getState().comandos[
      chaveContribuicao(extensao.id, comandoId)
    ];

  if (!executar) {
    // Declarado e não registrado: o manifesto prometeu um comando que o módulo
    // não implementou. É erro de quem escreveu o plugin, e dizer isso poupa o
    // mestre de procurar defeito na tecla dele.
    const { estado } =
      useContribuicoesStore.getState().carga[extensao.id] ?? {};
    if (estado === "pronta") {
      toast.error(`${extensao.nome} não registrou o comando ${comandoId}.`);
    }

    return;
  }

  try {
    await executar();
  } catch (causa) {
    // O comando que estoura não derruba nada, e o aviso diz de quem é: sem o
    // nome da extensão, o erro parece do aplicativo.
    toast.error(`O comando de ${extensao.nome} falhou.`, {
      description: causa instanceof Error ? causa.message : String(causa),
    });
  }
}

/**
 * Dispara um item de menu de extensão, importando o módulo se preciso.
 *
 * O irmão de `executarComando`: o item aparece pelo manifesto, e o clique é o
 * que importa o módulo. Se o módulo não registrou o item, é erro de quem
 * escreveu o plugin, e o aviso diz isso.
 */
export async function executarItemDeMenu(
  extensao: Extensao,
  itemId: string,
  contexto: ContextoDeMenu,
): Promise<void> {
  if (!extensao.habilitada) return;

  await garantirCarregada(extensao);

  const item =
    useContribuicoesStore.getState().itensDeMenu[chaveContribuicao(extensao.id, itemId)];

  if (!item) {
    const { estado } = useContribuicoesStore.getState().carga[extensao.id] ?? {};
    if (estado === "pronta") {
      toast.error(`${extensao.nome} não registrou o item de menu ${itemId}.`);
    }

    return;
  }

  try {
    await item.executar(contexto);
  } catch (causa) {
    toast.error(`O item de menu de ${extensao.nome} falhou.`, {
      description: causa instanceof Error ? causa.message : String(causa),
    });
  }
}

/** O botão do celular, como o daemon o entrega. Ver `use-acoes-da-mesa.ts`. */
export type AcaoDoJogador = AcaoRecebida & { extensaoId: string };

/**
 * Executa o botão que um jogador apertou, importando o módulo se preciso.
 *
 * O irmão de `executarComando` para o outro lado da mesa. Ação que o plugin
 * não registrou é erro de quem escreveu o plugin, e o aviso diz isso -- na
 * janela do mestre, que é onde ele está.
 */
export async function executarAcao(extensao: Extensao, acao: AcaoDoJogador): Promise<void> {
  if (!extensao.habilitada) return;

  await garantirCarregada(extensao);

  const executar =
    useContribuicoesStore.getState().acoes[chaveContribuicao(extensao.id, acao.acao)];

  if (!executar) {
    const { estado } = useContribuicoesStore.getState().carga[extensao.id] ?? {};
    if (estado === "pronta") {
      toast.error(`${extensao.nome} não registrou a ação ${acao.acao}.`);
    }

    return;
  }

  try {
    await executar(acao);
  } catch (causa) {
    toast.error(`A ação de ${extensao.nome} falhou.`, {
      description: causa instanceof Error ? causa.message : String(causa),
    });
  }
}

/** Desliga uma extensão: desfaz o que ela registrou e esquece o resto. */
export function descarregar(extensaoId: string): void {
  for (const desfazer of desfazeres.get(extensaoId) ?? []) {
    try {
      desfazer();
    } catch {
      // Um desfazer que estoura não pode impedir os outros de rodar: o que
      // sobra na tela é lixo de um plugin que já saiu, e insistir nos demais é
      // o que limpa o máximo possível.
    }
  }

  desfazeres.delete(extensaoId);
  useContribuicoesStore.getState().esquecer(extensaoId);
}

/**
 * Traduz o pedido do plugin para o descritor de janela do aplicativo.
 *
 * O painel é sempre DESTE plugin: o id da extensão entra aqui, e não vem do
 * plugin, para um não conseguir abrir nem fechar a janela de outro.
 */
function conteudoDe(extensaoId: string, janela: JanelaDeExtensao): ConteudoJanela {
  if ("painel" in janela) {
    return {
      tipo: "extensao",
      extensaoId,
      painelId: janela.painel,
      parametro: janela.parametro,
      titulo: janela.titulo,
    };
  }

  if (janela.tela === "personagem") {
    return { tipo: "personagem", personagemId: janela.personagemId };
  }

  return { tipo: janela.tela };
}

/**
 * Monta o objeto que o plugin recebe.
 *
 * Cada `registrar.*` devolve a função que desfaz E a empilha na lista da
 * extensão — as duas coisas, porque o plugin pode querer desfazer sozinho e o
 * aplicativo precisa poder desfazer tudo quando ela é desligada.
 */
function construirApi(extensao: Extensao, registrados: Desfazer[]): Ato20Api {
  const { guardar, soltar } = useContribuicoesStore.getState();

  function registrar<
    T extends
      | "paineis"
      | "comandos"
      | "ferramentas"
      | "camadas"
      | "itensDeMenu"
      | "secoes"
      | "substitutos"
      | "acoes",
  >(tipo: T, id: string, valor: Parameters<typeof guardar<T>>[2]): Desfazer {
    const chave = chaveContribuicao(extensao.id, id);
    guardar(tipo, chave, valor);

    const desfazer = () => soltar(tipo, chave);
    registrados.push(desfazer);

    return desfazer;
  }

  /** A cena em edição, que é a que o mestre está montando. */
  const cenaAtual = () =>
    resumoDaCena(selectEditingScene(useSceneStore.getState()));

  /** O id da cena em edição, para as ações não pedirem ao plugin. */
  const idDaCena = () => useSceneStore.getState().board?.editingSceneId ?? null;

  return {
    versao: API_VERSAO_ATUAL,
    react: React,

    extensao: {
      id: extensao.id,
      versao: extensao.versao,
      url: (arquivo) => urlDaExtensao(extensao.id, arquivo, extensao.versao),
    },

    cena: {
      atual: cenaAtual,

      assinar(aviso) {
        let anterior = selectEditingScene(useSceneStore.getState());

        return useSceneStore.subscribe((estado) => {
          const cena = selectEditingScene(estado);
          // Só quando a CENA muda, e não a cada mudança do store: o store
          // guarda seleção, histórico e hidratação, e avisar em todas faria um
          // painel de plugin renderizar dezenas de vezes por arrasto.
          if (cena === anterior) return;

          anterior = cena;
          aviso(resumoDaCena(cena));
        });
      },

      moverItem(itemId, ponto) {
        const cena = idDaCena();
        if (cena)
          useSceneStore
            .getState()
            .updateItem(cena, itemId, { x: ponto.x, y: ponto.y });
      },

      ajustarItem(itemId, patch) {
        const cena = idDaCena();
        if (!cena) return;

        // Só os cinco campos do contrato. Repassar o patch cru deixaria um
        // `assetId` trocado por engano apagar a imagem de alguém.
        const { x, y, width, height, rotation } = patch;
        useSceneStore
          .getState()
          .updateItem(cena, itemId, { x, y, width, height, rotation });
      },

      dados<T>() {
        const cena = selectEditingScene(useSceneStore.getState());

        return cena?.extensoes?.[extensao.id] as T | undefined;
      },

      gravarDados(valor) {
        const cena = idDaCena();
        if (!cena) return;

        useSceneStore.getState().updateScene(cena, (atual) => ({
          ...atual,
          extensoes: { ...atual.extensoes, [extensao.id]: valor },
        }));
      },
    },

    personagens: {
      listar: () => useCharactersStore.getState().personagens ?? [],
      obter: (personagemId) =>
        useCharactersStore.getState().personagens?.find((p) => p.id === personagemId) ?? null,

      assinar(aviso) {
        const desfazer = useCharactersStore.subscribe((estado, anterior) => {
          if (estado.personagens !== anterior.personagens && estado.personagens)
            aviso(estado.personagens);
        });
        registrados.push(desfazer);

        return desfazer;
      },

      ajustarMedidor(personagemId, medidorId, patch) {
        // O estilo de plugin que um medidor pode pedir é o DESTE plugin: a
        // chave começa com o id dele. Vazio limpa; alheio é ignorado.
        const { estiloExtensao, ...resto } = patch;
        const proprio =
          estiloExtensao === undefined ||
          estiloExtensao === "" ||
          estiloExtensao.startsWith(`${extensao.id}/`);

        return ajustarMedidorEmLote(personagemId, medidorId, {
          ...resto,
          ...(proprio ? { estiloExtensao } : {}),
        });
      },

      cardapioDeCondicoes: () => listarCondicoesDaCampanha(),

      async alternarCondicao(personagemIds, modeloId, ligar) {
        const mudaram = await alternarCondicao([...personagemIds], modeloId, ligar);
        if (mudaram > 0) useCharactersStore.getState().recarregar();

        return mudaram;
      },

      // O id da extensão entra aqui, e não vem do plugin: é o que impede um
      // plugin de ler o guardado de outro.
      dados: (personagemId) => lerDadosDeExtensao(personagemId, extensao.id),
      async gravarDados(personagemId, metades) {
        const gravado = await gravarDadosDeExtensao(personagemId, extensao.id, metades);
        // A metade PÚBLICA é o que o celular desenha, e ele só relê quando o
        // `fichasVersao` do quadro muda -- que é o contador do elenco. Uma
        // releitura aqui sobe o contador, e a seção publicada aparece no
        // aparelho sem recarregar. A privada não: ninguém fora daqui a lê.
        if (metades.publico !== undefined) useCharactersStore.getState().recarregar();

        return gravado;
      },
    },

    dados: {
      rolar: (notacoes) => rolarParaPlugin(notacoes),

      naMesa: () =>
        dadosNaMesa(useDadosStore.getState().dados, useRolagensStore.getState().bandeja),

      assinarMesa(aviso) {
        let anterior = "";
        const talvez = () => {
          const dados = dadosNaMesa(
            useDadosStore.getState().dados,
            useRolagensStore.getState().bandeja,
          );
          const assinatura = assinaturaDaMesa(dados);
          if (assinatura === anterior) return;

          anterior = assinatura;
          aviso(dados);
        };
        const doMestre = useDadosStore.subscribe((estado, antes) => {
          if (estado.dados !== antes.dados) talvez();
        });
        const dosJogadores = useRolagensStore.subscribe((estado, antes) => {
          if (estado.bandeja !== antes.bandeja) talvez();
        });
        const desfazer = () => {
          doMestre();
          dosJogadores();
        };
        registrados.push(desfazer);
        // Já com a lista atual: o plugin não precisa ler e assinar em dois passos.
        talvez();

        return desfazer;
      },
    },

    mesa: {
      // O id da extensão entra aqui, e não vem do plugin: um plugin não
      // publica no canal de outro.
      publicar: (canal, valor) => publicarNoCanal(extensao.id, canal, valor),

      async enderecos() {
        const { url, lanUrl } = await daemonAddr();

        return {
          local: url,
          rede: lanUrl,
          codigo: useCampaignStore.getState().campaign?.codigo ?? null,
        };
      },

      async linkDaPagina(paginaId, opcoes) {
        const { url, lanUrl } = await daemonAddr();

        return montarLinkDaPagina({
          extensao,
          paginaId,
          codigo: useCampaignStore.getState().campaign?.codigo ?? null,
          base: opcoes?.rede ? lanUrl : url,
          busca: opcoes?.busca,
        });
      },
    },

    chat: {
      // O id e o nome entram aqui, e não vêm do plugin. Ver `postarParaPlugin`.
      postar: (linha) => postarParaPlugin({ id: extensao.id, nome: extensao.nome }, linha),

      assinar(aviso) {
        const desfazer = assinarFioParaPlugin(aviso);
        registrados.push(desfazer);

        return desfazer;
      },
    },

    jogadores: {
      async listar() {
        try {
          const [jogadores, vinculos] = await Promise.all([listPlayers(), characterLinks()]);

          return jogadores.map(({ id, nome }) => ({
            id,
            nome,
            personagens: vinculos
              .filter(([jogadorId]) => jogadorId === id)
              .map(([, personagemId]) => personagemId),
          }));
        } catch {
          // Sem campanha aberta não há jogador nenhum.
          return [];
        }
      },
    },

    retratos: {
      naMesa: () => retratosNaMesa(),
      dePersonagem: (personagemId) => retratoDoPersonagem(personagemId),

      assinarMesa(aviso) {
        const desfazer = assinarRetratosNaMesa(aviso);
        registrados.push(desfazer);

        return desfazer;
      },
    },

    eventos: {
      aoMudarMedidor(aviso) {
        const desfazer = useCharactersStore.subscribe((estado, anterior) => {
          if (estado.personagens === anterior.personagens || !estado.personagens) return;
          for (const mudanca of diferencasDeMedidores(anterior.personagens, estado.personagens))
            aviso(mudanca);
        });
        registrados.push(desfazer);

        return desfazer;
      },

      aoAlternarCondicao(aviso) {
        const desfazer = useCharactersStore.subscribe((estado, anterior) => {
          if (estado.personagens === anterior.personagens || !estado.personagens) return;
          for (const mudanca of diferencasDeCondicoes(anterior.personagens, estado.personagens))
            aviso(mudanca);
        });
        registrados.push(desfazer);

        return desfazer;
      },

      aoRolar(aviso) {
        // O histórico do mestre é por mesa; o novo entra na frente. O dos
        // jogadores idem. Comparar a cabeça é o bastante: `registrar` e
        // `lancar` põem UM por vez.
        const doMestre = useDadosStore.subscribe((estado, anterior) => {
          for (const mesa of ["mapa", "quadro"] as const) {
            const novo = estado.historico[mesa][0];
            if (novo && novo !== anterior.historico[mesa][0])
              aviso({ origem: "mestre", faces: novo.faces, valor: valorDaRolagem(novo.faces, novo.valor) });
          }
        });
        const dosJogadores = useRolagensStore.subscribe((estado, anterior) => {
          const novo = estado.historico[0];
          if (novo && novo !== anterior.historico[0])
            aviso({
              origem: "jogador",
              faces: novo.faces,
              valor: valorDaRolagem(novo.faces, novo.valor),
              jogador: novo.jogador,
              personagemId: novo.personagemId,
            });
        });
        const desfazer = () => {
          doMestre();
          dosJogadores();
        };
        registrados.push(desfazer);

        return desfazer;
      },

      aoTrocarCena(aviso) {
        let anterior = useSceneStore.getState().board?.editingSceneId ?? null;
        const desfazer = useSceneStore.subscribe((estado) => {
          const atual = estado.board?.editingSceneId ?? null;
          if (atual === anterior) return;

          anterior = atual;
          aviso(resumoDaCena(selectEditingScene(estado)));
        });
        registrados.push(desfazer);

        return desfazer;
      },

      aoPorNoAr(aviso) {
        let anterior = useSceneStore.getState().board?.liveSceneId ?? null;
        const desfazer = useSceneStore.subscribe((estado) => {
          const atual = estado.board?.liveSceneId ?? null;
          if (atual === anterior) return;

          anterior = atual;
          aviso(resumoDaCena(selectLiveScene(estado)));
        });
        registrados.push(desfazer);

        return desfazer;
      },
    },

    config: {
      ler: (chave) => valorDe(chave),

      gravar(chave, valor, escopo) {
        // A cerca: só o que começa com o id deste plugin. Não é `ui.erro`
        // porque é erro de quem escreveu o plugin, não do mestre -- e o
        // `false` chega a quem pode consertar.
        if (!chave.startsWith(`${extensao.id}.`)) return false;

        return useConfiguracoesStore.getState().gravar(chave, valor, escopo);
      },

      assinar(chave, aviso) {
        const desfazer = assinarConfiguracao(chave, aviso);
        registrados.push(desfazer);

        return desfazer;
      },
    },

    janelas: {
      abrir: (janela) => abrirJanela(conteudoDe(extensao.id, janela)),
      fechar: (janela) => fecharJanela(chaveDe(conteudoDe(extensao.id, janela))),
    },

    ui: {
      // Prefixado com o nome da extensão: um aviso sem dono, no meio da
      // sessão, manda o mestre procurar no aplicativo um problema que é de um
      // plugin que ele instalou.
      aviso: (texto) => toast(texto, { description: extensao.nome }),
      erro: (texto) => toast.error(texto, { description: extensao.nome }),
      componentes: COMPONENTES,
      experimental: EXPERIMENTAL,
      icones: ICONES,
    },

    registrar: {
      painel: ({ id, corpo }) => registrar("paineis", id, corpo),
      comando: ({ id, executar }) => registrar("comandos", id, executar),
      ferramenta: (ferramenta) =>
        registrar("ferramentas", ferramenta.id, ferramenta),
      camada: ({ id, corpo }) => registrar("camadas", id, corpo),
      itemDeMenu: (item) => registrar("itensDeMenu", item.id, item),
      secao: ({ id, corpo }) => registrar("secoes", id, corpo),
      // A chave e o ALVO, e nao um id: um plugin so tem um corpo por alvo.
      substituto: ({ alvo, corpo }) => registrar("substitutos", alvo, corpo),
      acao: ({ id, executar }) => registrar("acoes", id, executar),
    },
  };
}
