"use client";

import type { Idioma } from "@/lib/i18n/idioma";
import type { ComponentType } from "react";
import type { DadoNaMesaLido } from "@/lib/extensoes/mesa";
import type { RetratoParaKit as RetratoLido } from "@/lib/kit-de-retratos";
import type { LucideIcon } from "lucide-react";

import type { Componentes, Experimental } from "@/lib/extensoes/componentes";
import type { LinhaDePlugin, LinhaLida } from "@/lib/extensoes/chat";
import type { ResultadoDaRolagem } from "@/lib/extensoes/dados";
import type {
  MudancaDeCondicaoLida,
  MudancaDeMedidorLida,
} from "@/lib/extensoes/diferencas";
import type { PatchDePlugin } from "@/lib/extensoes/lote-de-medidores";
import type { Condicao, Personagem } from "@/types/character";
import type { FacesDado } from "@/types/dado";
import type { CanvasItem, Scene } from "@/types/scene";

/**
 * O contrato que uma extensão de código recebe.
 *
 * Este arquivo é a promessa do projeto para quem escreve plugin. Tudo que está
 * aqui vira compromisso de compatibilidade; tudo que NÃO está pode mudar sem
 * aviso — e é por isso que ele é pequeno de propósito.
 *
 * **Ações nomeadas, e nunca os stores.** O plugin não alcança `useSceneStore`.
 * Se alcançasse, todo plugin passaria a depender do formato interno de `Scene`
 * e dos nomes dos métodos do zustand, e mexer neles quebraria o ecossistema —
 * que é exatamente o que matou a compatibilidade de plugins do Atom. Uma ação
 * nomeada é um contrato que dá para manter enquanto o interior muda.
 *
 * **O React vem por aqui, não pelo `import` do plugin.** A interface tem uma
 * instância só, e uma segunda quebraria os hooks dela. É a razão de `react`
 * estar no objeto em vez de ser uma dependência do autor.
 */

/**
 * A versão do contrato. O manifesto declara qual ele fala.
 *
 * A 2 acrescentou `janelas`, `config`, `personagens` inteiro, `dados`,
 * `eventos`, `ui.componentes`, `ui.experimental` e `ui.icones`, e o
 * `parametro` do painel. `personagens.listar` passou a devolver o personagem
 * inteiro -- um superconjunto do `{id, nome}` da 1. Nada da 1 saiu: um plugin que pede 1
 * recebe o mesmo objeto, com o novo ao lado.
 *
 * A 3 acrescentou `mesa` (o canal para as páginas do plugin, os endereços e o
 * link pronto), `jogadores`, `retratos`, e `dados.naMesa`/`dados.assinarMesa`; no
 * manifesto, as `paginas`, a `ativacao` na abertura e o tipo `lista`.
 *
 * A 4 acrescentou `chat`: o fio da campanha, para o plugin escrever a linha
 * dele ("Ataque: 1d20+3 = 17") e ouvir as dos outros.
 *
 * A 5 não mexeu neste objeto: acrescentou ao manifesto o medidor em `camadas`
 * de imagem e o `rotulo`. Ver `extensoes::API_VERSAO`. A 6 também não.
 *
 * A 7 acrescentou `idioma`, o da tela em que o plugin roda, para o código do
 * plugin escolher o próprio texto; no manifesto, todo texto pode vir como mapa
 * por idioma -- ver `TextoDePlugin`.
 */
export const API_VERSAO_ATUAL = 7;

/** O que o plugin sabe da cena sem poder mexer no formato dela. */
export type CenaResumo = {
  id: string;
  nome: string;
  /** Os itens, em cópia rasa. Mexer nesta lista não mexe na cena. */
  itens: ReadonlyArray<Readonly<CanvasItem>>;
};

/**
 * O que `registrar.painel` recebe. O corpo é um componente React comum.
 *
 * `parametro` chega quando a janela foi aberta por `janelas.abrir` com um: é
 * o que faz o mesmo painel servir para "a ficha do Edgar" e "a ficha da
 * Mira", em duas janelas. Aberto pelo menu, sem parâmetro, ele vem `undefined`.
 */
export type PainelRegistrado = {
  id: string;
  corpo: ComponentType<{ parametro?: string }>;
};

/**
 * Uma janela que o plugin pede para abrir ou fechar.
 *
 * Duas famílias. A do PRÓPRIO plugin é um painel declarado no manifesto, com
 * `parametro` opcional para abrir mais de uma instância dele, e `titulo` para
 * a instância ter nome próprio na aba ("Edgar", e não "Ficha"). A de FÁBRICA
 * são as telas do aplicativo que fazem sentido abrir de fora -- a ficha de um
 * personagem, a lista de personagens, a configuração da campanha. Anexo, asset
 * e livro ficam de fora: pedem identidades que a API não entrega ainda.
 */
export type JanelaDeExtensao =
  | { painel: string; parametro?: string; titulo?: string }
  | { tela: "personagem"; personagemId: string }
  | {
      tela:
        | "personagens"
        | "configuracao"
        | "rolagens"
        | "chat"
        | "cenas"
        | "quadros"
        | "retratos"
        | "imagens"
        | "sons"
        | "camadas"
        | "estante"
        | "miniplayer";
    };

export type ComandoRegistrado = {
  id: string;
  executar: () => void | Promise<void>;
};

/** As teclas segurada durante o gesto. */
export type Modificadores = { shift: boolean; ctrl: boolean; alt: boolean };

export type FerramentaRegistrada = {
  id: string;
  /** Clique no palco, em coordenadas de CENA — o plano fixo de 1920x1080. */
  aoClicar?: (ponto: { x: number; y: number }, teclas: Modificadores) => void;
  /** Arrasto terminado, também em coordenadas de cena. */
  aoArrastar?: (
    area: { x: number; y: number; largura: number; altura: number },
    teclas: Modificadores,
  ) => void;
  /**
   * O ponteiro andando durante o arrasto, em coordenadas de cena. Só com
   * `aoArrastar`: é o que deixa a ferramenta desenhar a prévia do que vai
   * criar. Chega a cada quadro do gesto -- faça pouco aqui.
   */
  aoMover?: (ponto: { x: number; y: number }, teclas: Modificadores) => void;
  /**
   * As opções da ferramenta -- a cor, a espessura, o que ela pede antes do
   * gesto. Um componente que aparece ao lado do botão dela enquanto ela está
   * na mão, como a pílula do lápis. Sem props: leia o que precisar de
   * `config` ou do próprio módulo.
   */
  opcoes?: ComponentType;
};

/**
 * O que o item de menu recebe: em que menu foi clicado, e o que estava na
 * mão. Só ids e cópias -- o plugin lê o resto por `cena.atual()` e
 * `personagens.obter()`.
 */
export type ContextoDeMenu =
  | { alvo: "palco.token"; itens: ReadonlyArray<Readonly<CanvasItem>>; personagemIds: string[] }
  | { alvo: "palco.luz"; luzId: string }
  | { alvo: "palco.area"; areaId: string }
  | {
      alvo: "palco.quadro";
      textoIds: string[];
      formaIds: string[];
      postitIds: string[];
      documentoIds: string[];
      tracoIds: string[];
    }
  | { alvo: "palco.parede"; paredeId: string }
  | { alvo: "palco.retrato"; retratoIds: string[] }
  | { alvo: "palco.vazio" }
  | { alvo: "linha.cena"; cenaId: string }
  | { alvo: "linha.personagem"; personagemId: string }
  | { alvo: "linha.retrato"; personagemId: string; retratoId: string | null }
  | { alvo: "linha.imagem"; assetId: string }
  | { alvo: "linha.quadro"; cenaId: string }
  | { alvo: "linha.nota"; notaId: string };

/**
 * O que `registrar.itemDeMenu` recebe. O título e o alvo vêm do manifesto,
 * para o item aparecer antes do módulo ser importado; aqui entra o que ele
 * FAZ. `quando` esconde o item para um contexto em que ele não se aplica --
 * um token sem personagem, por exemplo. Ausente = sempre aparece.
 */
export type ItemDeMenuRegistrado = {
  id: string;
  executar: (contexto: ContextoDeMenu) => void | Promise<void>;
  quando?: (contexto: ContextoDeMenu) => boolean;
};

/**
 * Um botão que o jogador apertou no celular, como chega ao plugin.
 *
 * Quem apertou vem do TOKEN do jogador, resolvido pelo daemon -- não do que o
 * celular disse. `dados` é o que o plugin tiver posto no botão, opaco.
 */
export type AcaoRecebida = {
  acao: string;
  personagemId: string;
  jogadorId: string;
  jogador: string;
  dados?: unknown;
};

/**
 * O que `registrar.acao` recebe: o que fazer quando o jogador aperta o botão
 * `acao` da seção pública deste plugin. Ver `personagens.gravarDados` -- a
 * metade `publico` com `{ secao: { titulo, blocos } }` é o que desenha o botão
 * no celular; isto é o que ele faz.
 */
export type AcaoRegistrada = {
  id: string;
  executar: (acao: AcaoRecebida) => void | Promise<void>;
};

/** Uma seção nova na ficha. O corpo recebe o personagem aberto. */
export type SecaoRegistrada = {
  id: string;
  corpo: ComponentType<{ personagemId: string }>;
};

/**
 * Um corpo de fábrica trocado pelo do plugin.
 *
 * `alvo` é o mesmo do manifesto: `secao:medidores`, `janela:personagem`. O
 * corpo recebe `personagemId` nos alvos da ficha. Desligar o plugin, ou o
 * corpo estourar, devolve o de fábrica.
 */
export type SubstitutoRegistrado = {
  alvo: string;
  corpo: ComponentType<{ personagemId?: string }>;
};

/** Uma camada é um componente desenhado sobre o mapa, no palco do mestre. */
export type CamadaRegistrada = {
  id: string;
  corpo: ComponentType;
};

/** O que todo `registrar.*` devolve: a função que desfaz. */
export type Desfazer = () => void;

/** Um dado que caiu, de quem quer que seja. */
export type RolagemLida = {
  origem: "mestre" | "jogador";
  faces: FacesDado;
  /** O que a mesa soma: no d10 o zero vale dez. */
  valor: number;
  /** Só nas do jogador. */
  jogador?: string;
  personagemId?: string;
};

export type { DadoNaMesaLido, LinhaDePlugin, LinhaLida, RetratoLido };

export type Ato20Api = {
  /** A versão do contrato que este aplicativo implementa. */
  versao: number;

  /** O MESMO React da interface. Não empacote outro. */
  react: typeof import("react");

  /**
   * O idioma da tela: `"pt-BR"` ou `"en"`. Constante enquanto o plugin vive --
   * trocar de idioma recarrega a janela, e o plugin com ela. API 7.
   */
  idioma: Idioma;

  extensao: {
    id: string;
    versao: string;
    /** A URL de um arquivo de dentro da pasta da extensão. */
    url: (arquivo: string) => string;
  };

  cena: {
    /** A cena em EDIÇÃO — a que o mestre está montando, não a que está no ar. */
    atual: () => CenaResumo | null;
    /**
     * Avisa a cada mudança na cena em edição. Devolve a função que cancela.
     *
     * É o caminho para um painel se manter em dia sem pesquisar o estado a cada
     * render — e é o único caminho, porque o store não é alcançável daqui.
     */
    assinar: (aviso: (cena: CenaResumo | null) => void) => Desfazer;

    moverItem: (itemId: string, ponto: { x: number; y: number }) => void;
    /**
     * Muda posição, tamanho ou giro de um item. Campos fora desses são
     * ignorados — o plugin não reescreve o item inteiro, e é o que impede um
     * `assetId` trocado por engano de apagar a imagem de alguém.
     */
    ajustarItem: (
      itemId: string,
      patch: Partial<Pick<CanvasItem, "x" | "y" | "width" | "height" | "rotation">>,
    ) => void;

    /**
     * O guardado DESTA extensão, dentro da cena.
     *
     * Vive em `scene.extensoes[id]`, viaja no zip da campanha e some do payload
     * publicado pelo mesmo caminho que apaga alfinete e postit — então o que o
     * plugin escrever aqui não chega à mesa. Ver `sceneForTable`.
     */
    dados: <T = unknown>() => T | undefined;
    gravarDados: (valor: unknown) => void;
  };

  /**
   * O elenco: ler, assinar, mexer nos medidores e nas condições, e guardar o
   * que é do plugin em cada personagem.
   *
   * A leitura é a do MESTRE: medidor e condição escondidos vêm junto. O
   * plugin roda na janela do mestre, e é ele quem decide o que a mesa vê.
   */
  personagens: {
    /** Cópias rasas, com medidores e condições. Mexer nelas não mexe em nada. */
    listar: () => ReadonlyArray<Readonly<Personagem>>;
    obter: (personagemId: string) => Readonly<Personagem> | null;
    /** A cada releitura do elenco. Devolve a função que cancela. */
    assinar: (aviso: (personagens: ReadonlyArray<Readonly<Personagem>>) => void) => Desfazer;

    /**
     * Muda um medidor. Nome, cor, valor, teto, escondido -- nunca o estilo,
     * que é assunto do PR dos estilos.
     *
     * EM LOTE: dez chamadas no mesmo laço viram uma gravação e uma releitura.
     * Resolve quando o lote foi gravado e o elenco relido; o valor gravado
     * pode diferir do pedido (o teto puxa o valor), e é na releitura que ele
     * aparece. Ver `lote-de-medidores.ts`.
     */
    ajustarMedidor: (personagemId: string, medidorId: string, patch: PatchDePlugin) => Promise<void>;

    /** O cardápio de condições da campanha. */
    cardapioDeCondicoes: () => Promise<ReadonlyArray<Readonly<Condicao>>>;
    /**
     * Liga ou desliga uma condição do cardápio em vários personagens de uma
     * vez, gravando uma vez. Devolve quantos mudaram.
     */
    alternarCondicao: (personagemIds: readonly string[], modeloId: string, ligar: boolean) => Promise<number>;

    /**
     * O guardado DESTE plugin num personagem, em duas metades.
     *
     * `privado` nunca sai do Mestre. `publico` é o que o celular do dono do
     * personagem pode receber. Mora em `personagens/{id}/_extensoes.json`,
     * viaja no zip, e cabe em 64 KB por plugin. `gravarDados` com uma metade
     * ausente a deixa como está; `null` apaga.
     */
    dados: (personagemId: string) => Promise<{ privado: unknown; publico: unknown }>;
    gravarDados: (
      personagemId: string,
      metades: { privado?: unknown; publico?: unknown },
    ) => Promise<{ privado: unknown; publico: unknown }>;
  };

  /**
   * Joga dados de verdade no palco do Mestre, e resolve quando eles caem.
   *
   * `["1d20", "1d4"]` -- a notação da paleta, sem modificador: `+3` é conta
   * do plugin. `total` soma o que entra na soma (a moeda não). Só o Mestre vê
   * os dados. Rejeita com notação inválida ou mesa cheia.
   */
  dados: {
    rolar: (notacoes: readonly string[]) => Promise<ResultadoDaRolagem>;
    /**
     * O que está na mesa AGORA: os dados do mestre (mapa e quadro) e a
     * bandeja dos jogadores. Um dado sai quando é recolhido, ou quando a
     * bandeja do jogador vence (30 s).
     */
    naMesa: () => ReadonlyArray<Readonly<DadoNaMesaLido>>;
    /**
     * Avisa quando entra ou sai dado da mesa -- e só então: arrastar um dado
     * não acorda ninguém. Chama já com a lista atual.
     */
    assinarMesa: (aviso: (dados: ReadonlyArray<Readonly<DadoNaMesaLido>>) => void) => Desfazer;
  };

  /**
   * A mesa para FORA do Mestre: as páginas do plugin (`paginas` no manifesto)
   * rodam num navegador de outra máquina -- o OBS, a TV -- e só sabem o que o
   * plugin publica aqui.
   *
   * `publicar` guarda o valor no canal `{canal}` deste plugin, e toda página
   * aberta que assina `/sala/plugin/{id}/{canal}?codigo=` recebe. Quem tem o
   * código da mesa consegue assinar: publique só o que pode sair. O mais novo
   * vence, e valor igual ao último não sai. `false` = nome de canal inválido
   * (minúsculas, dígitos e hífen).
   */
  mesa: {
    publicar: (canal: string, valor: unknown) => boolean;
    /** Os endereços do daemon e o código da mesa. `rede`/`codigo` `null` quando não há. */
    enderecos: () => Promise<{ local: string; rede: string | null; codigo: string | null }>;
    /**
     * O link de uma página deste plugin, com o código da mesa. `rede` usa o
     * endereço do Wi-Fi (para outro computador); `busca` entra na URL.
     * `null` sem campanha aberta, sem rede, ou página que o manifesto não tem.
     */
    linkDaPagina: (
      paginaId: string,
      opcoes?: { rede?: boolean; busca?: Record<string, string> },
    ) => Promise<string | null>;
  };

  /**
   * O fio da campanha: o chat da mesa, gravado no `chat.jsonl` (API 4).
   *
   * `postar` escreve uma linha assinada pelo plugin: texto, rolagem, ou os
   * dois. A rolagem é o que `dados.rolar` devolveu, passado adiante, com o
   * `modificador` e o `rotulo` que o plugin calculou -- o fio soma e escreve
   * "Ataque: 1d20+3 = 17", e não interpreta regra nenhuma. `privado` manda só
   * ao Mestre: a rolagem escondida. Poste DEPOIS de `dados.rolar` resolver, que
   * é quando o dado caiu: antes, o chat contaria o resultado enquanto ele gira.
   * Rejeita com o motivo quando a linha não serve ou a mesa está fechada.
   *
   * `assinar` avisa a cada linha nova -- de qualquer um, a deste plugin
   * inclusive (`autor` diz de quem é). Só o que acontece agora: a conversa que
   * já estava no fio não chega.
   */
  chat: {
    postar: (linha: LinhaDePlugin) => Promise<LinhaLida>;
    assinar: (aviso: (linha: LinhaLida) => void) => Desfazer;
  };

  /**
   * Quem a campanha conhece como jogador. Nome é o que o próprio jogador
   * escolheu; `personagens` são os ids que o mestre vinculou a ele.
   */
  jogadores: {
    listar: () => Promise<ReadonlyArray<{ id: string; nome: string; personagens: string[] }>>;
  };

  /**
   * Os retratos como a MESA os vê: sem medidor nem condição escondidos, e o
   * nome só com a peça "nome" ligada -- o mesmo corte da janela do espectador.
   *
   * O formato é o do kit de retratos (`/kit/retratos`): passe adiante sem
   * mexer. `personagemId` e `nome` são os campos que valem para o plugin ler.
   */
  retratos: {
    /** Os retratos no ar agora, onde a mesa os pôs. */
    naMesa: () => ReadonlyArray<Readonly<RetratoLido>>;
    /** Avisa quando os retratos no ar mudam -- e só então. Chama já com a lista atual. */
    assinarMesa: (aviso: (retratos: ReadonlyArray<Readonly<RetratoLido>>) => void) => Desfazer;
    /** O retrato de um personagem, no ar ou não. `null` sem Retrato na ficha. */
    dePersonagem: (personagemId: string) => Readonly<RetratoLido> | null;
  };

  /**
   * O que acontece na mesa, para quem automatiza.
   *
   * Saem da RELEITURA do elenco e dos stores, e não de um gancho em cada
   * escrita: quem escreve é o Rust por dezenas de caminhos, e comparar a
   * leitura nova com a anterior é o único lugar por onde toda mudança passa.
   * A primeira leitura da campanha não conta como mudança.
   */
  eventos: {
    aoMudarMedidor: (aviso: (mudanca: MudancaDeMedidorLida) => void) => Desfazer;
    aoAlternarCondicao: (aviso: (mudanca: MudancaDeCondicaoLida) => void) => Desfazer;
    /** Todo dado que cai: os do mestre e os que os jogadores rolam no celular. */
    aoRolar: (aviso: (rolagem: RolagemLida) => void) => Desfazer;
    /** A cena em edição mudou. `null` quando nenhuma. */
    aoTrocarCena: (aviso: (cena: CenaResumo | null) => void) => Desfazer;
    /** A cena no ar mudou -- o que a mesa vê. `null` quando nada no ar. */
    aoPorNoAr: (aviso: (cena: CenaResumo | null) => void) => Desfazer;
  };

  /**
   * As configurações, do plugin e do aplicativo.
   *
   * `ler` alcança qualquer chave declarada -- a do próprio plugin ou a do
   * aplicativo (`ato20.zoom`). `gravar` só as do próprio plugin: o prefixo
   * `{id}.` é a cerca, e um plugin não redefine o zoom de ninguém. O valor
   * gravado tem de ser do tipo declarado no manifesto; fora disso, `false`.
   * `assinar` avisa quando o valor que VALE muda, seja pela tela, pelo editor
   * JSON ou por outra gravação do plugin.
   */
  config: {
    ler: <T = unknown>(chave: string) => T | undefined;
    gravar: (chave: string, valor: unknown, escopo?: "maquina" | "campanha") => boolean;
    assinar: (chave: string, aviso: (valor: unknown) => void) => Desfazer;
  };

  /**
   * Abre e fecha janelas, as do plugin e as de fábrica.
   *
   * Onde a janela já estiver -- atracada numa coluna ou flutuando --, `abrir`
   * a traz à vista em vez de duplicar. Ver `abrirJanela`.
   */
  janelas: {
    abrir: (janela: JanelaDeExtensao) => void;
    fechar: (janela: JanelaDeExtensao) => void;
  };

  ui: {
    /** Aviso na tela, no mesmo canto em que o aplicativo já avisa. */
    aviso: (texto: string) => void;
    erro: (texto: string) => void;
    /**
     * Os componentes do aplicativo, para o plugin parecer parte dele.
     *
     * `componentes` é compromisso: as props que estão lá ficam. `experimental`
     * funciona e pode mudar sem aviso. Ver `lib/extensoes/componentes.ts`.
     */
    componentes: Componentes;
    experimental: Experimental;
    /**
     * Ícones pelo nome -- `icones.caveira`, `icones.ficha`. Só os que o
     * aplicativo já carrega; ver `lib/extensoes/icones.ts` para a lista e para
     * o motivo de não ser o `lucide-react` inteiro.
     */
    icones: Readonly<Record<string, LucideIcon>>;
  };

  registrar: {
    painel: (painel: PainelRegistrado) => Desfazer;
    comando: (comando: ComandoRegistrado) => Desfazer;
    ferramenta: (ferramenta: FerramentaRegistrada) => Desfazer;
    camada: (camada: CamadaRegistrada) => Desfazer;
    /** Os três do manifesto: `itensDeMenu`, `secoes`, `substitutos`. */
    itemDeMenu: (item: ItemDeMenuRegistrado) => Desfazer;
    secao: (secao: SecaoRegistrada) => Desfazer;
    substituto: (substituto: SubstitutoRegistrado) => Desfazer;
    /** O que um botão da seção pública do celular faz. Sem manifesto. */
    acao: (acao: AcaoRegistrada) => Desfazer;
  };
};

/**
 * O que o módulo de uma extensão exporta por padrão.
 *
 * `desativar` é opcional: o que `ativar` devolveu já é desfeito pelo
 * aplicativo. Existe para o que o plugin criou por fora — um `setInterval`, um
 * ouvinte no `window`, um arquivo aberto.
 */
export type ModuloExtensao = {
  ativar?: (api: Ato20Api) => void | Desfazer | Promise<void | Desfazer>;
  desativar?: () => void;
};

/** A cena, reduzida ao que o contrato promete. */
export function resumoDaCena(scene: Scene | null): CenaResumo | null {
  if (!scene) return null;

  return { id: scene.id, nome: scene.name, itens: scene.items };
}
