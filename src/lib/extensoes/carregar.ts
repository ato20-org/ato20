"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  API_VERSAO_ATUAL,
  resumoDaCena,
  type Ato20Api,
  type Desfazer,
  type ModuloExtensao,
} from "@/lib/extensoes/api";
import { chaveContribuicao, urlDaExtensao, type Extensao } from "@/lib/extensoes/manifesto";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useContribuicoesStore } from "@/lib/store/use-contribuicoes-store";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";

/**
 * Importa o módulo de uma extensão e deixa ela ativar o que trouxe.
 *
 * **Preguiçoso.** Só acontece quando alguém abre um painel ou dispara um
 * comando dela — é o que o `contribui` no manifesto compra. Dez extensões
 * instaladas não custam dez módulos na abertura da janela, que é onde o mestre
 * está esperando a mesa abrir.
 *
 * **Contido.** Um plugin que estoura no `ativar` não pode derrubar o Operador:
 * o erro é preso aqui, a extensão é marcada como falha e o que ela chegou a
 * registrar é esquecido. Sem isso, um plugin ruim briga a janela do mestre — e
 * ele fica sem alcançar o botão que o desliga, que é o pior desfecho possível.
 */

/** Uma carga em curso, para dois pedidos simultâneos não importarem duas vezes. */
const emCurso = new Map<string, Promise<void>>();

/** O que cada extensão registrou, para desfazer tudo ao desligar. */
const desfazeres = new Map<string, Desfazer[]>();

export function garantirCarregada(extensao: Extensao): Promise<void> {
  const { estado } = useContribuicoesStore.getState().carga[extensao.id] ?? { estado: "ausente" };

  // `falhou` também não repete: o módulo que estourou vai estourar de novo, e
  // tentar a cada render viraria um laço de erro em cima do palco.
  if (estado === "pronta" || estado === "falhou") return Promise.resolve();

  const jaVai = emCurso.get(extensao.id);
  if (jaVai) return jaVai;

  const promessa = carregar(extensao).finally(() => emCurso.delete(extensao.id));
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
    toast.error(`O plugin ${extensao.nome} falhou ao carregar.`, { description: motivo });
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
export async function executarComando(extensao: Extensao, comandoId: string): Promise<void> {
  if (!extensao.habilitada) return;

  await garantirCarregada(extensao);

  const executar =
    useContribuicoesStore.getState().comandos[chaveContribuicao(extensao.id, comandoId)];

  if (!executar) {
    // Declarado e não registrado: o manifesto prometeu um comando que o módulo
    // não implementou. É erro de quem escreveu o plugin, e dizer isso poupa o
    // mestre de procurar defeito na tecla dele.
    const { estado } = useContribuicoesStore.getState().carga[extensao.id] ?? {};
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
 * Monta o objeto que o plugin recebe.
 *
 * Cada `registrar.*` devolve a função que desfaz E a empilha na lista da
 * extensão — as duas coisas, porque o plugin pode querer desfazer sozinho e o
 * aplicativo precisa poder desfazer tudo quando ela é desligada.
 */
function construirApi(extensao: Extensao, registrados: Desfazer[]): Ato20Api {
  const { guardar, soltar } = useContribuicoesStore.getState();

  function registrar<T extends "paineis" | "comandos" | "ferramentas" | "camadas">(
    tipo: T,
    id: string,
    valor: Parameters<typeof guardar<T>>[2],
  ): Desfazer {
    const chave = chaveContribuicao(extensao.id, id);
    guardar(tipo, chave, valor);

    const desfazer = () => soltar(tipo, chave);
    registrados.push(desfazer);

    return desfazer;
  }

  /** A cena em edição, que é a que o mestre está montando. */
  const cenaAtual = () => resumoDaCena(selectEditingScene(useSceneStore.getState()));

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
        if (cena) useSceneStore.getState().updateItem(cena, itemId, { x: ponto.x, y: ponto.y });
      },

      ajustarItem(itemId, patch) {
        const cena = idDaCena();
        if (!cena) return;

        // Só os cinco campos do contrato. Repassar o patch cru deixaria um
        // `assetId` trocado por engano apagar a imagem de alguém.
        const { x, y, width, height, rotation } = patch;
        useSceneStore.getState().updateItem(cena, itemId, { x, y, width, height, rotation });
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
      listar: () =>
        (useCharactersStore.getState().personagens ?? []).map(({ id, nome }) => ({ id, nome })),
    },

    ui: {
      // Prefixado com o nome da extensão: um aviso sem dono, no meio da
      // sessão, manda o mestre procurar no aplicativo um problema que é de um
      // plugin que ele instalou.
      aviso: (texto) => toast(texto, { description: extensao.nome }),
      erro: (texto) => toast.error(texto, { description: extensao.nome }),
    },

    registrar: {
      painel: ({ id, corpo }) => registrar("paineis", id, corpo),
      comando: ({ id, executar }) => registrar("comandos", id, executar),
      ferramenta: (ferramenta) => registrar("ferramentas", ferramenta.id, ferramenta),
      camada: ({ id, corpo }) => registrar("camadas", id, corpo),
    },
  };
}
