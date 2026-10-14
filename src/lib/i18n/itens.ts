import { escolher } from "@/lib/i18n/idioma";

/**
 * O texto dos itens da campanha: a janela de Itens, a janela do item, os itens
 * presos a pontos e ao handout, a peça de item no mapa e o cartão na mesa.
 *
 * O inventário DENTRO da ficha continua em `personagens.ts`, que é a área da
 * ficha; o que mora aqui é o item como coisa da campanha.
 */
const pt = {
  semNome: "Item sem nome",
  contar: (quantos: number) => (quantos === 1 ? "1 item" : `${quantos} itens`),

  janela: {
    buscar: "Buscar item",
    buscarDica: "Pelo nome, pela descrição ou pela pasta.",
    criar: "Criar item",
    criarAqui: "Novo item aqui",
    novaPasta: "Nova pasta",
    nomeDaPasta: (numero: number) => `Pasta ${numero}`,
    lendo: "Lendo…",
    primeiro:
      "Nenhum item ainda. Crie o primeiro aqui, ou pelo + do inventário de um personagem.",
    nenhumAchado: "Nenhum item com esse nome.",
    opcoesDe: (nome: string) => `Opções de ${nome}`,
    abrir: "Abrir",
    darA: "Dar a",
    apagar: "Apagar item",
    arraste: (nome: string) =>
      `${nome} — arraste para um personagem, para o mapa, para um ponto ou para o handout`,
    noAr: "No ar",
  },


  /** O editor: o formulário de criar e de mudar o item. */

  /** A janela de ler o item. */
  /** A janela do item, onde ele se lê e se escreve. */
  ver: {
    naoExisteMais: "Este item não existe mais na campanha.",
    saiuDaMochila: (nome: string) =>
      `Não está mais na mochila de ${nome}. Este é o item como a campanha o define.`,
    apagar: "Apagar item",
    nome: "Nome do item",
    renomear: "Renomear",
    adicionarDescricao: "Adicionar descrição",
    editarDescricao: "Editar descrição",
    mostrarMais: "Mostrar mais",
    sobreOModal: "O nome e a descrição inteira do item.",
    semDescricao: "Sem descrição ainda.",
    descricao: "Descrição",
    descricaoExemplo: "O que é, o que faz, de onde veio.",
    markdown: "Aceita **negrito**, *itálico* e listas. Ctrl+Enter salva.",
    cancelar: "Cancelar",
    salvar: "Salvar",
    confirmar: "Confirmar",
    naMochilaDe: "Na mochila de",
    menosUm: (nome: string) => `Menos um ${nome}`,
    maisUm: (nome: string) => `Mais um ${nome}`,
    mostrarAoJogador: "Mostrar ao jogador",
    esconderDoJogador: "Esconder do jogador",
    jogadorNaoVe: "O jogador não vê este item na mochila. Clique para revelar.",
    jogadorVe: "O jogador vê. Clique para esconder.",
    tirarDe: (nome: string) => `Tirar da mochila de ${nome}`,
    escondido: "Escondido do jogador",
    atributos: "Atributos",
    adicionarAtributo: "Adicionar atributo",
    limiteDeAtributos: (maximo: number) => `${maximo} é o limite de atributos de um item.`,
    rolar: (expressao: string) => `Rolar ${expressao} na mesa`,
    rolarDica: "Rolar",
    editarAtributo: (nome: string) => `Editar ${nome}`,
    tirarAtributo: (nome: string) => `Tirar ${nome}`,
    nomeDoAtributo: "Nome",
    valorDoAtributo: "Valor",
    valorExemplo: "1d8+2 cortante, 2 kg… vazio vira tag",
    atributoEscondido: "O jogador não vê, nem na mochila nem na TV.",
    atributoAVista: "O jogador vê. Esconda a maldição do anel, o veneno na lâmina.",
    apagarAtributo: "Apagar atributo",
    novoAtributoExemplo: "Fogo, ou Dano: 1d8",
    medidores: "Medidores",
    adicionarMedidor: "Adicionar medidor",
    limiteDeMedidores: (maximo: number) => `${maximo} é o limite de medidores de um item.`,
    semMedidores: "Nenhum. Cargas, durabilidade, munição: o que se gasta.",
    cargas: "Cargas",
    medidor: "Medidor",
    apagarMedidorTitulo: (nome: string) => `Apagar ${nome}?`,
    apagarMedidorItens: (nome: string) => [
      `o medidor ${nome} do item`,
      `o valor de ${nome} em toda mochila que tem o item`,
    ],
    medidorEscondido: "O jogador não vê",
    medidorAVista: "O jogador vê",
    olhoDoMedidor: "Escondido, ele some do celular e do cartão da TV.",
    valorAtual: "Valor atual",
    valorMaximo: "Valor máximo",
    deMaximo: (atual: number, maximo: number) => `${atual} de ${maximo}`,
    numeroDica: "Clique para escrever o atual e o máximo. O atual é desta mochila; o máximo, do item.",
    maximo: (maximo: number) => `Máximo ${maximo}`,
    maximoDica: "O atual é de cada mochila: abra o item pela ficha de quem o tem.",
  },

  imagem: {
    escolhaAImagem: "Escolha a imagem do item",
    filtro: "Imagens",
    trocarDoItem: "Trocar a imagem do item",
    escolherDoItem: "Escolher a imagem do item",
    trocar: "Trocar a imagem",
    trocarCurto: "Trocar",
    escolherDoDisco: "Escolher uma imagem do disco",
    por: "Pôr imagem",
  },

  apagar: {
    titulo: (nome: string) => `Apagar ${nome}?`,
    itens: (nome: string) => [
      `o item ${nome} da campanha`,
      `${nome} de toda mochila que o tiver`,
      `${nome} dos pontos e handouts em que estiver`,
    ],
    ressalva: "As peças dele no mapa ficam, como imagem.",
  },

  dar: {
    chegou: (item: string, personagem: string) => `${item} foi para ${personagem}.`,
    ninguem: "Nenhum personagem na campanha",
  },

  transmitir: {
    mostrar: "Mostrar na mesa",
    tirar: "Tirar da mesa",
    noAr: "No ar",
    noArAgora: "Está no ar agora. Clique para tirar.",
    dica: "Põe o cartão deste item na frente de tudo, na TV e nos celulares.",
  },

  anexado: {
    apagado: "Item apagado",
    abrir: (nome: string) => `Abrir ${nome}`,
    tirarDoPonto: (nome: string) => `Tirar ${nome} do ponto`,
    tirarDoHandout: (nome: string) => `Tirar ${nome} do handout`,
    noAr: (nome: string) => `${nome} está no ar. Clique para tirar.`,
    transmitir: (nome: string) => `Mostrar ${nome} na mesa`,
  },

  peca: {
    abrirItem: "Abrir o item",
    transmitir: "Mostrar o item na mesa",
    tirar: "Tirar o item da mesa",
  },

  falhas: {
    criar: "Falha ao criar o item.",
    salvar: "Falha ao salvar o item.",
    apagar: "Falha ao apagar o item.",
    tirar: "Falha ao tirar o item do inventário.",
    dar: "Falha ao dar o item.",
    imagem: "Falha ao importar a imagem.",
    transmitir: "Falha ao mostrar o item na mesa.",
    mapa: "Falha ao pôr o item no mapa.",
  },
};

const en: typeof pt = {
  semNome: "Unnamed item",
  contar: (quantos) => (quantos === 1 ? "1 item" : `${quantos} items`),

  janela: {
    buscar: "Search items",
    buscarDica: "By name, description or folder.",
    criar: "Create item",
    criarAqui: "New item here",
    novaPasta: "New folder",
    nomeDaPasta: (numero) => `Folder ${numero}`,
    lendo: "Loading…",
    primeiro:
      "No items yet. Create the first one here, or with the + in a character's inventory.",
    nenhumAchado: "No item with that name.",
    opcoesDe: (nome) => `Options for ${nome}`,
    abrir: "Open",
    darA: "Give to",
    apagar: "Delete item",
    arraste: (nome) =>
      `${nome}: drag it to a character, the map, a pin or the handout`,
    noAr: "On air",
  },



  ver: {
    naoExisteMais: "This item no longer exists in the campaign.",
    saiuDaMochila: (nome) =>
      `It is no longer in ${nome}'s backpack. This is the item as the campaign defines it.`,
    apagar: "Delete item",
    nome: "Item name",
    renomear: "Rename",
    adicionarDescricao: "Add a description",
    editarDescricao: "Edit description",
    mostrarMais: "Show more",
    sobreOModal: "The item's name and full description.",
    semDescricao: "No description yet.",
    descricao: "Description",
    descricaoExemplo: "What it is, what it does, where it came from.",
    markdown: "Takes **bold**, *italics* and lists. Ctrl+Enter saves.",
    cancelar: "Cancel",
    salvar: "Save",
    confirmar: "Confirm",
    naMochilaDe: "In the backpack of",
    menosUm: (nome) => `One less ${nome}`,
    maisUm: (nome) => `One more ${nome}`,
    mostrarAoJogador: "Show to the player",
    esconderDoJogador: "Hide from the player",
    jogadorNaoVe: "The player can't see this item in the backpack. Click to reveal.",
    jogadorVe: "The player sees it. Click to hide.",
    tirarDe: (nome) => `Take out of ${nome}'s backpack`,
    escondido: "Hidden from the player",
    atributos: "Attributes",
    adicionarAtributo: "Add attribute",
    limiteDeAtributos: (maximo) => `${maximo} is the attribute limit for an item.`,
    rolar: (expressao) => `Roll ${expressao} at the table`,
    rolarDica: "Roll",
    editarAtributo: (nome) => `Edit ${nome}`,
    tirarAtributo: (nome) => `Remove ${nome}`,
    nomeDoAtributo: "Name",
    valorDoAtributo: "Value",
    valorExemplo: "1d8+2 slashing, 2 kg… empty makes a tag",
    atributoEscondido: "The player can't see it, in the backpack or on the TV.",
    atributoAVista: "The player sees it. Hide the ring's curse, the poison on the blade.",
    apagarAtributo: "Delete attribute",
    novoAtributoExemplo: "Fire, or Damage: 1d8",
    medidores: "Meters",
    adicionarMedidor: "Add meter",
    limiteDeMedidores: (maximo) => `${maximo} is the meter limit for an item.`,
    semMedidores: "None yet. Charges, durability, ammo: whatever gets spent.",
    cargas: "Charges",
    medidor: "Meter",
    apagarMedidorTitulo: (nome) => `Delete ${nome}?`,
    apagarMedidorItens: (nome) => [
      `the ${nome} meter from the item`,
      `the value of ${nome} in every backpack that has the item`,
    ],
    medidorEscondido: "The player can't see it",
    medidorAVista: "The player sees it",
    olhoDoMedidor: "Hidden, it leaves the phone and the TV card.",
    valorAtual: "Current value",
    valorMaximo: "Maximum value",
    deMaximo: (atual, maximo) => `${atual} of ${maximo}`,
    numeroDica: "Click to type the current and the maximum. The current is this backpack's; the maximum, the item's.",
    maximo: (maximo) => `Maximum ${maximo}`,
    maximoDica: "The current value belongs to each backpack: open the item from the sheet of whoever has it.",
  },

  imagem: {
    escolhaAImagem: "Choose the item's image",
    filtro: "Images",
    trocarDoItem: "Change the item's image",
    escolherDoItem: "Choose the item's image",
    trocar: "Change the image",
    trocarCurto: "Change",
    escolherDoDisco: "Choose an image from disk",
    por: "Add image",
  },

  apagar: {
    titulo: (nome) => `Delete ${nome}?`,
    itens: (nome) => [
      `the item ${nome} from the campaign`,
      `${nome} from every backpack that has it`,
      `${nome} from the pins and handouts it is in`,
    ],
    ressalva: "Its pieces on the map stay, as plain images.",
  },

  dar: {
    chegou: (item, personagem) => `${item} went to ${personagem}.`,
    ninguem: "No characters in the campaign",
  },

  transmitir: {
    mostrar: "Show at the table",
    tirar: "Take off the table",
    noAr: "On air",
    noArAgora: "It is on air now. Click to take it off.",
    dica: "Puts this item's card in front of everything, on the TV and the phones.",
  },

  anexado: {
    apagado: "Deleted item",
    abrir: (nome) => `Open ${nome}`,
    tirarDoPonto: (nome) => `Remove ${nome} from the pin`,
    tirarDoHandout: (nome) => `Remove ${nome} from the handout`,
    noAr: (nome) => `${nome} is on air. Click to take it off.`,
    transmitir: (nome) => `Show ${nome} at the table`,
  },

  peca: {
    abrirItem: "Open the item",
    transmitir: "Show the item at the table",
    tirar: "Take the item off the table",
  },

  falhas: {
    criar: "Could not create the item.",
    salvar: "Could not save the item.",
    apagar: "Could not delete the item.",
    tirar: "Could not remove the item from the inventory.",
    dar: "Could not give the item.",
    imagem: "Could not import the image.",
    transmitir: "Could not show the item at the table.",
    mapa: "Could not put the item on the map.",
  },
};

export const dicionarios = { "pt-BR": pt, en };

export const t = escolher(dicionarios);
