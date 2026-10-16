"use client";

import { memo, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { ListPlus, Maximize2, Tags, Trash2, Upload } from "lucide-react";

import { ItensDeMover } from "@/components/mestre/arvore-de-pastas";
import {
  AcaoDaLinha,
  ArvoreDoCompendio,
  Cartao,
  daMaoNoCartao,
  falhou,
  filtrando,
  Lendo,
  NadaCom,
  useEmCimaDoCartao,
  type EdicaoDeTags,
} from "@/components/mestre/compendio-cartao";
import { BonecoComEfeito } from "@/components/mestre/compendio-efeitos";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { SeloDaCondicao } from "@/components/playground/selos-da-condicao";
import type { Kit } from "@/components/ui/menu-kit";
import { useTokenDrag } from "@/hooks/use-token-drag";
import { definicaoDoEfeito, especieDoEfeito, type EfeitosDeFora } from "@/lib/efeitos";
import { abrirJanela, trocarJanela } from "@/lib/extensoes/janelas";
import { t } from "@/lib/i18n/mestre";
import { filtrarNoCompendio, type FiltroDoCompendio } from "@/lib/mestre/compendio";
import { useCondicoesStore } from "@/lib/store/use-condicoes-store";
import {
  useCondicoesDoCompendio,
  useCondicoesDoCompendioStore,
} from "@/lib/store/use-condicoes-do-compendio-store";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import { cn } from "@/lib/utils";
import {
  condicaoNoMenu,
  editarCondicaoDoCompendio,
  guardarCondicaoNoCompendio,
  levarAoCompendio,
} from "@/lib/vault/compendio";
import { pastaDoMembro } from "@/lib/mestre/arvore-de-pastas";
import { useSceneStore } from "@/lib/store/use-scene-store";
import type { Condicao, MoldeDeCondicao, PatchCondicao } from "@/types/character";
import type { DefinicaoDeEfeito } from "@/types/efeito";
import type { Pasta } from "@/types/scene";

const texto = t.compendio;

/** Um efeito como a escolha da condição o mostra. */
type EfeitoNaEscolha = Pick<DefinicaoDeEfeito, "id" | "titulo" | "dica">;

/**
 * Os efeitos de PERSONAGEM da campanha, os em jogo e os guardados no
 * Compêndio: o que a condição da biblioteca pode escolher, e o que o card dela
 * anima. Os de área ficam de fora -- são do chão, e não da figura.
 */
export function useEfeitosDePersonagemDaCampanha(): DefinicaoDeEfeito[] {
  const efeitos = useEfeitosDaCampanhaStore((state) => state.efeitos);
  const moldes = useEfeitosDaCampanhaStore((state) => state.moldes);

  return useMemo(
    () => [...(efeitos ?? []), ...(moldes ?? [])].filter((efeito) => especieDoEfeito(efeito) === "personagem"),
    [efeitos, moldes],
  );
}

/**
 * O nome do efeito de uma condição: o de fábrica, o de um plugin ligado, o da
 * campanha -- em jogo ou guardado. `undefined` = só o selo.
 */
export function tituloDoEfeito(
  id: string | undefined,
  deFora: EfeitosDeFora,
  daCampanha: ReadonlyArray<EfeitoNaEscolha>,
): string | undefined {
  if (!id) return undefined;

  return (
    definicaoDoEfeito(id, deFora)?.titulo ??
    daCampanha.find((efeito) => efeito.id === id)?.titulo ??
    texto.efeitoQueFalta
  );
}

/**
 * O desenho do card de uma condição: o selo, e com a mão em cima o EFEITO
 * dela, animando num boneco como num token do mapa -- é ali que o mestre vê o
 * que "Em chamas" faz, e não numa lista de efeitos à parte. Ver
 * `BonecoComEfeito`.
 *
 * O selo some devagar, como a varinha do efeito de área: o primeiro quadro do
 * efeito leva um instante para assar. Sem efeito, a condição é só o selo, e ele
 * fica.
 *
 * `definicao` é o efeito da campanha que ela usa, quando não está em jogo: o
 * guardado no Compêndio, ou o do Compêndio do ATO20.
 */
export function DesenhoDaCondicao({
  condicao,
  definicao,
}: {
  condicao: Pick<Condicao, "nome" | "cor" | "icone" | "efeito">;
  definicao?: DefinicaoDeEfeito;
}) {
  const emCima = useEmCimaDoCartao();
  const animar = emCima && Boolean(condicao.efeito);

  return (
    <>
      {animar ? (
        <BonecoComEfeito efeitoId={condicao.efeito!} definicao={definicao} cor={condicao.cor} />
      ) : null}
      <span className={cn("relative transition-opacity duration-500", animar && "opacity-0")}>
        <SeloDaCondicao condicao={condicao} tamanho={44} />
      </span>
    </>
  );
}

/**
 * A biblioteca de condições da campanha, em cards: o que NÃO está no menu do
 * token. O menu tem dezesseis lugares; aqui cabe o sistema inteiro, e o mestre
 * escolhe o que esta sessão precisa à mão.
 *
 * Clicar abre a janela da condição, como o card do item abre a do item: o
 * selo, o nome, a mesa vê ou não, e o efeito com o editor inteiro. "Pôr no
 * menu" a MUDA de lugar -- uma condição é definição, e duas cópias dela
 * confundiriam o menu, que reconhece as fichas pelo nome. Ver
 * `compendio::condicao_no_menu`.
 */
export function CondicoesNoCompendio({
  filtro,
  pastas,
  onCriarEm,
  onGuardado,
  onApagar,
  onEditarTags,
}: {
  filtro: FiltroDoCompendio;
  /** As pastas da aba, as do mestre. Ver `ListaDoCompendio`. */
  pastas: Pasta[];
  onCriarEm: (pastaId: string) => void;
  onGuardado: () => void;
  onApagar: (condicao: MoldeDeCondicao) => void;
  onEditarTags: (edicao: EdicaoDeTags) => void;
}) {
  const { lista } = useCondicoesDoCompendio();
  const efeitos = useEfeitosDePersonagemDaCampanha();
  const buscando = filtrando(filtro);

  const achados = useMemo(
    () =>
      lista
        ? filtrarNoCompendio(lista, filtro, (condicao) => condicao.nome, (condicao) => condicao.tags ?? [])
        : null,
    [lista, filtro],
  );

  const guardarNoAto20 = useCallback(
    (condicao: MoldeDeCondicao) => {
      void levarAoCompendio({ condicoes: [condicao.id] }).then(() => {
        onGuardado();
        toast.success(texto.guardadoNoAto20(condicao.nome));
      }, falhou);
    },
    [onGuardado],
  );

  if (achados === null) return <Lendo />;
  if (lista?.length === 0 && pastas.length === 0)
    return <PainelVazio conteudo={{ tipo: "compendio" }}>{texto.vazioCondicoes}</PainelVazio>;
  if (buscando && achados.length === 0) return <NadaCom filtro={filtro} />;

  return (
    <ArvoreDoCompendio
      achados={achados}
      pastas={pastas}
      buscando={buscando}
      rotuloCriarAqui={texto.criarCondicaoAqui}
      onCriarEm={onCriarEm}
      linha={(condicao, _depth, caminho) => (
        <CartaoDaCondicao
          key={condicao.id}
          condicao={condicao}
          caminho={caminho}
          pastas={pastas}
          efeitos={efeitos}
          onPorNoMenu={porNoMenu}
          onGuardarNoAto20={guardarNoAto20}
          onApagar={onApagar}
          onEditarTags={onEditarTags}
        />
      )}
    />
  );
}

/**
 * Uma mudança na condição da biblioteca: na tela já, e corrigida pela resposta
 * -- a cor que anda com o seletor não pode esperar o disco a cada passo. A do
 * card e a da janela da condição, que é a mesma condição.
 */
export function editarNaBiblioteca(id: string, patch: PatchCondicao): void {
  const { lista: atual } = useCondicoesDoCompendioStore.getState();
  useCondicoesDoCompendioStore.setState({
    lista: atual?.map((condicao) => (condicao.id === id ? aplicar(condicao, patch) : condicao)),
  });

  void editarCondicaoDoCompendio(id, patch).then(
    (editada) =>
      useCondicoesDoCompendioStore.setState({
        lista: useCondicoesDoCompendioStore
          .getState()
          .lista?.map((condicao) => (condicao.id === id ? editada : condicao)),
      }),
    (cause: unknown) => {
      useCondicoesDoCompendioStore.getState().recarregar();
      falhou(cause);
    },
  );
}

/**
 * A condição sai da biblioteca e vai ao menu do token -- com outro id, porque
 * é outro arquivo. A janela dela, se estava aberta, vai junto.
 */
export function porNoMenu(condicao: MoldeDeCondicao): void {
  void condicaoNoMenu(condicao.id).then((noMenu) => {
    useCondicoesDoCompendioStore.getState().recarregar();
    useCondicoesStore.getState().recarregar();
    // O efeito dela pode ter entrado em jogo junto.
    void useEfeitosDaCampanhaStore.getState().carregar();
    trocarJanela(
      { tipo: "condicao", lugar: "compendio", condicaoId: condicao.id },
      { tipo: "condicao", lugar: "menu", condicaoId: noMenu.id },
    );
    toast.success(texto.noMenu(condicao.nome));
  }, falhou);
}

/**
 * O avesso: a condição sai do menu e volta à biblioteca, com outro id. As
 * fichas que já estão com ela continuam, e o efeito dela vai junto quando
 * ninguém mais o usa -- ver `compendio::guardar_condicao`. A janela segue.
 */
export function guardarNaBiblioteca(modelo: Condicao): Promise<boolean> {
  return guardarCondicaoNoCompendio(modelo.id).then(
    (guardada) => {
      useCondicoesDoCompendioStore.getState().recarregar();
      useCondicoesStore.getState().recarregar();
      void useEfeitosDaCampanhaStore.getState().carregar();
      trocarJanela(
        { tipo: "condicao", lugar: "menu", condicaoId: modelo.id },
        { tipo: "condicao", lugar: "compendio", condicaoId: guardada.id },
      );
      toast.success(texto.guardadoNoCompendio(modelo.nome));
      return true;
    },
    (cause: unknown) => {
      falhou(cause);
      return false;
    },
  );
}

/** O patch aplicado aqui, como o Rust aplica: `efeito: null` tira. */
function aplicar(condicao: MoldeDeCondicao, patch: PatchCondicao): MoldeDeCondicao {
  const nova = { ...condicao };
  if (patch.nome !== undefined) nova.nome = patch.nome;
  if (patch.cor !== undefined) nova.cor = patch.cor;
  if (patch.icone !== undefined) nova.icone = patch.icone;
  if (patch.escondido !== undefined) nova.escondido = patch.escondido;
  if (patch.efeito === null) delete nova.efeito;
  else if (patch.efeito !== undefined) nova.efeito = patch.efeito;
  return nova;
}

/**
 * Uma condição, como card: o selo grande, o nome e o efeito embaixo.
 *
 * Clicar abre a janela da condição, onde tudo dela se edita -- e é por isso
 * que o card não edita mais nada: o selo que abria a aparência e o lápis do
 * nome eram botões dentro do botão do card, e o clique de abrir teria de
 * adivinhar qual dos três o mestre quis.
 */
const CartaoDaCondicao = memo(function CartaoDaCondicao({
  condicao,
  caminho,
  pastas,
  efeitos,
  onPorNoMenu,
  onGuardarNoAto20,
  onApagar,
  onEditarTags,
}: {
  condicao: MoldeDeCondicao;
  /** A pasta dela, na busca: a lista plana não mostra onde cada uma mora. */
  caminho?: string;
  pastas: Pasta[];
  efeitos: DefinicaoDeEfeito[];
  onPorNoMenu: (condicao: MoldeDeCondicao) => void;
  onGuardarNoAto20: (condicao: MoldeDeCondicao) => void;
  onApagar: (condicao: MoldeDeCondicao) => void;
  onEditarTags: (edicao: EdicaoDeTags) => void;
}) {
  const deFora = useDeclarativoStore((state) => state.efeitos);
  const efeito = tituloDoEfeito(condicao.efeito, deFora, efeitos);
  const arrastar = useTokenDrag();
  const naMao = useTokenDragStore(
    (state) =>
      state.arrasto?.fonte.tipo === "condicao" && state.arrasto.fonte.condicaoId === condicao.id,
  );

  function abrir() {
    abrirJanela({ tipo: "condicao", lugar: "compendio", condicaoId: condicao.id });
  }

  const itens = (kit: Kit) => {
    const { Item, Separator } = kit;

    return (
    <>
      <Item onClick={abrir}>
        <Maximize2 />
        {texto.abrir}
      </Item>
      <Item onClick={() => onPorNoMenu(condicao)}>
        <ListPlus />
        {texto.porNoMenu}
      </Item>
      <Item onClick={() => onGuardarNoAto20(condicao)}>
        <Upload />
        {texto.guardarNoAto20}
      </Item>
      <Item
        onClick={() =>
          onEditarTags({
            onde: "campanha",
            tipo: "condicao",
            id: condicao.id,
            nome: condicao.nome,
            tags: condicao.tags ?? [],
          })
        }
      >
        <Tags />
        {texto.tagsNoMenu}
      </Item>
      <ItensDeMover
        kit={kit}
        atual={pastaDoMembro(pastas, condicao.id)}
        destinos={pastas}
        onMover={(destino) =>
          useSceneStore.getState().moverNoCompendio(condicao.id, "compendio-condicoes", destino)
        }
      />
      <Separator />
      <Item variant="destructive" onClick={() => onApagar(condicao)}>
        <Trash2 />
        {texto.apagar}
      </Item>
    </>
    );
  };

  return (
    <Cartao
      nome={condicao.nome}
      detalhe={caminho || (efeito ?? texto.soOSelo)}
      tags={condicao.tags}
      faixa
      tinta={condicao.cor}
      naMao={naMao}
      onPointerDown={(event) => {
        if (!daMaoNoCartao(event)) return;
        arrastar(event, {
          fonte: {
            tipo: "condicao",
            condicaoId: condicao.id,
            condicao: {
              nome: condicao.nome,
              cor: condicao.cor,
              icone: condicao.icone,
              efeito: condicao.efeito,
            },
          },
          largura: 0,
          altura: 0,
        });
      }}
      titulo={texto.dicaDaCondicao(condicao.nome)}
      imagem={
        <DesenhoDaCondicao
          condicao={condicao}
          definicao={efeitos.find((atual) => atual.id === condicao.efeito)}
        />
      }
      onAbrir={abrir}
      acao={
        <AcaoDaLinha rotulo={texto.porNoMenu} onClick={() => onPorNoMenu(condicao)}>
          <ListPlus />
        </AcaoDaLinha>
      }
      itens={itens}
    />
  );
});
