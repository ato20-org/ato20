"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AppWindow,
  FolderOpen,
  Info,
  Maximize2,
  Plus,
  Radio,
  RadioTower,
} from "lucide-react";

import { CampoDeBusca } from "@/components/mestre/campo-de-busca";
import { ItensDeExtensao } from "@/components/mestre/itens-de-extensao";
import { MiniaturaDoAcervo } from "@/components/mestre/miniatura-do-acervo";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { PropriedadesDaImagem } from "@/components/mestre/propriedades-da-imagem";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { KIT_CONTEXTO, type Kit } from "@/components/ui/menu-kit";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useAssetList } from "@/hooks/use-asset-list";
import { useCharacters } from "@/hooks/use-characters";
import { useTokenDrag } from "@/hooks/use-token-drag";
import { centeredBox } from "@/lib/geometry/transform";
import { t } from "@/lib/i18n/mestre";
import {
  alvoDaImagem,
  filtrarGaleria,
  imagensDaGaleria,
  medidaDaImagem,
  type ImagemDaGaleria,
} from "@/lib/mestre/galeria";
import { tamanhoNaCena } from "@/lib/mestre/tamanho-na-cena";
import { MINIATURA } from "@/lib/miniatura";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import { cn } from "@/lib/utils";
import { shareCharacterAttachment } from "@/lib/vault/evidence";
import {
  abrirCom,
  escolherPrograma,
  listarAnexosDaGaleria,
  miniaturaDoAnexo,
  mostrarNaPasta,
  programasDoArquivo,
  type AnexoNaGaleria,
  type ProgramasDoArquivo,
} from "@/lib/vault/galeria";

/**
 * Toda imagem da campanha, numa grade, com busca pelo nome do arquivo.
 *
 * Existe porque nenhuma outra tela mostra todas. A árvore de Arquivos esconde
 * o que tem dono -- o fundo de cada cena, o retrato e a miniatura de cada
 * personagem, a imagem de um efeito --, e a escolha lá é deliberada: a lista é
 * do que se ESCOLHE, e misturar o que já foi escolhido a enchia de repetidos.
 * Ver `AssetMeta.escopo`. E os anexos de personagem nem são acervo: moram na
 * pasta de cada um, e só a ficha dele os mostra. O mapa importado direto como
 * fundo de cena e a foto que o jogador mandou não apareciam em lugar nenhum
 * onde se pudesse PROCURAR.
 *
 * Aqui não há pasta nem dono escondido: é o acervo de imagens inteiro mais todo
 * anexo que é imagem, do mais novo ao mais antigo. O dono aparece na linha de
 * baixo de cada cartão, para o mestre saber de onde a imagem vem.
 *
 * Clicar abre a imagem numa janela, arrastar põe no mapa -- só o acervo: o mapa
 * desenha asset, e um anexo teria de ser importado antes. O botão direito tem o
 * resto, e é onde o sistema entra: abrir com outro programa, mostrar na pasta,
 * as propriedades do arquivo. Sem renomear, mover nem apagar -- isso é de
 * Arquivos e da ficha, onde cada imagem mora. Duas portas para apagar o fundo
 * de uma cena seriam duas portas para deixá-la sem chão.
 */
export function GaleriaBody() {
  const { assets } = useAssetList("image");
  const anexos = useAnexosDaGaleria();
  const [busca, setBusca] = useState("");
  // A imagem e o aberto separados: fechar o diálogo anima a saída, e o
  // conteúdo tem de continuar lá enquanto ela anima.
  const [propriedades, setPropriedades] = useState<{
    imagem: ImagemDaGaleria | null;
    aberto: boolean;
  }>({ imagem: null, aberto: false });

  // O acervo não espera os anexos: ele é o grosso da Galeria e já está lido
  // na maioria das vezes. Os anexos entram quando chegarem.
  const imagens = useMemo(
    () => (assets ? imagensDaGaleria(assets, anexos ?? []) : null),
    [assets, anexos],
  );
  const achadas = useMemo(
    () => (imagens ? filtrarGaleria(imagens, busca) : null),
    [imagens, busca],
  );

  const abrirPropriedades = useCallback(
    (imagem: ImagemDaGaleria) => setPropriedades({ imagem, aberto: true }),
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 p-2">
        <CampoDeBusca
          valor={busca}
          onMudar={setBusca}
          placeholder={t.galeria.buscarPlaceholder(imagens?.length ?? 0)}
          rotulo={t.galeria.buscar}
          dica={t.galeria.buscarDica}
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {imagens === null || achadas === null ? (
          <p className="text-muted-foreground p-3 text-xs">{t.galeria.lendo}</p>
        ) : imagens.length === 0 ? (
          <PainelVazio conteudo={{ tipo: "galeria" }}>{t.galeria.vazio}</PainelVazio>
        ) : achadas.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            {t.galeria.nadaCom(busca.trim())}
          </p>
        ) : (
          // `auto-fill` e não um número de colunas: a mesma grade serve à
          // janela solta de 480 e à coluna atracada de 288, e o cartão nunca
          // fica pequeno demais para o nome caber.
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1 p-2 pt-0">
            {achadas.map((imagem) => (
              <CartaoDaImagem
                key={imagem.chave}
                imagem={imagem}
                onPropriedades={abrirPropriedades}
              />
            ))}
          </ul>
        )}
      </ScrollArea>

      <PropriedadesDaImagem
        imagem={propriedades.imagem}
        aberto={propriedades.aberto}
        onAberto={(aberto) => setPropriedades((atual) => ({ ...atual, aberto }))}
      />
    </div>
  );
}

/**
 * Os anexos de personagem que são imagem. `null` enquanto lê.
 *
 * Relidos quando o índice de personagens muda, e é de propósito: é o sinal que
 * o Mestre já tem de que algo mudou na pasta deles -- um personagem novo, um
 * apagado, um jogador mandando arquivo. Uma ida ao Rust por mudança, e não por
 * cartão.
 */
function useAnexosDaGaleria(): AnexoNaGaleria[] | null {
  const { personagens } = useCharacters();
  const [anexos, setAnexos] = useState<AnexoNaGaleria[] | null>(null);

  useEffect(() => {
    let ativo = true;

    void listarAnexosDaGaleria().then(
      (lista) => {
        if (ativo) setAnexos(lista);
      },
      () => {
        // Sem campanha a lista é vazia, e não um erro: a Galeria continua
        // mostrando o acervo. Mesmo critério do `useAssetsStore`.
        if (ativo) setAnexos([]);
      },
    );

    return () => {
      ativo = false;
    };
  }, [personagens]);

  return anexos;
}

/**
 * Um cartão: a miniatura, o nome e, embaixo, o dono e a medida.
 *
 * `memo` porque a grade inteira redesenha a cada letra da busca, e um acervo de
 * campanha longa tem centenas de imagens. A `imagem` só muda quando o acervo ou
 * os anexos são relidos.
 *
 * O `<li>` é quem arrasta, e o botão de dentro é quem abre: o mesmo par da
 * linha de Arquivos e da de Itens. `useTokenDrag` só come o clique quando houve
 * arrasto, então soltar sem mexer continua abrindo a imagem.
 *
 * O menu só monta o miolo quando abre: é ele quem pergunta ao sistema quais
 * programas abrem o arquivo, e perguntar por cartão ao montar a grade seriam
 * centenas de idas ao Rust para um menu que talvez nunca abra.
 */
const CartaoDaImagem = memo(function CartaoDaImagem({
  imagem,
  onPropriedades,
}: {
  imagem: ImagemDaGaleria;
  onPropriedades: (imagem: ImagemDaGaleria) => void;
}) {
  const abrir = useAbrirJanela();
  const arrastar = useTokenDrag();
  const assetId = imagem.origem === "acervo" ? imagem.asset.id : undefined;
  // Boolean, e não o arrasto inteiro: só o cartão que sai e o que volta
  // redesenham.
  const naMao = useTokenDragStore(
    (state) =>
      assetId !== undefined &&
      state.arrasto?.fonte.tipo === "acervo" &&
      state.arrasto.fonte.assetId === assetId,
  );

  const medida = medidaDaImagem(imagem);
  const dono =
    imagem.origem === "anexo"
      ? t.galeria.anexoDe(imagem.anexo.personagem)
      : imagem.asset.escopo
        ? t.galeria.escopo[imagem.asset.escopo]
        : undefined;
  const detalhe = [dono, medida ? `${medida.largura}×${medida.altura}` : undefined]
    .filter(Boolean)
    .join(" · ");

  function abrirNaJanela() {
    if (imagem.origem === "acervo") {
      abrir({ tipo: "asset", assetId: imagem.asset.id, nome: imagem.asset.name });
      return;
    }

    const { personagemId, arquivo, tamanho, mimeType, autor } = imagem.anexo;
    abrir({ tipo: "anexo", personagemId, anexo: { arquivo, tamanho, mimeType, autor } });
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <li
            className={cn(
              "flex min-w-0 rounded-md p-1 select-none hover:bg-accent/50",
              imagem.origem === "acervo" && "cursor-grab touch-none active:cursor-grabbing",
              naMao && "opacity-40",
            )}
            // A sombra no mapa nasce do tamanho com que a imagem entra nele,
            // como na linha de Arquivos. Ver `tamanhoNaCena`.
            onPointerDown={
              imagem.origem === "acervo"
                ? (event) => {
                    const tamanho = tamanhoNaCena(imagem.asset);

                    arrastar(event, {
                      fonte: { tipo: "acervo", assetId: imagem.asset.id },
                      largura: tamanho.x,
                      altura: tamanho.y,
                    });
                  }
                : undefined
            }
          />
        }
      >
        <button
          type="button"
          className="focus-visible:ring-ring flex min-w-0 flex-1 flex-col gap-1 rounded text-left outline-none focus-visible:ring-2"
          title={
            imagem.origem === "acervo"
              ? t.galeria.dica(imagem.nome)
              : t.galeria.dicaDoAnexo(imagem.nome)
          }
          onClick={abrirNaJanela}
        >
          <span className="bg-muted relative block aspect-square w-full overflow-hidden rounded">
            {imagem.origem === "acervo" ? (
              <MiniaturaDoAcervo
                assetId={imagem.asset.id}
                animada={imagem.asset.animada}
                alt={imagem.nome}
              />
            ) : (
              <MiniaturaDoAnexo anexo={imagem.anexo} alt={imagem.nome} />
            )}
          </span>

          <span className="block w-full truncate px-0.5 text-xs">{imagem.nome}</span>

          {detalhe ? (
            <span className="text-muted-foreground block w-full truncate px-0.5 text-[10px] tabular-nums">
              {detalhe}
            </span>
          ) : null}
        </button>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56">
        <MenuDaImagem
          imagem={imagem}
          kit={KIT_CONTEXTO}
          onAbrir={abrirNaJanela}
          onPropriedades={() => onPropriedades(imagem)}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
});

/**
 * O anexo transmitido por último daqui, e o endereço sorteado dele.
 *
 * Fora do componente porque o menu desmonta ao fechar, e com ele qualquer
 * estado: reabrir o menu do mesmo anexo precisa saber que é ELE que está na
 * mesa para oferecer "Tirar". O store da evidência só sabe o endereço, e o
 * endereço é sorteado a cada transmissão -- ver `shareCharacterAttachment`.
 */
let anexoNaMesa: { chave: string; sharedId: string } | null = null;

/**
 * O miolo do botão direito.
 *
 * Pelo `Kit`, como as linhas de Arquivos: é o que deixa os itens de plugin de
 * `linha.imagem` entrarem aqui pelo mesmo componente que os põe lá.
 */
function MenuDaImagem({
  imagem,
  kit,
  onAbrir,
  onPropriedades,
}: {
  imagem: ImagemDaGaleria;
  kit: Kit;
  onAbrir: () => void;
  onPropriedades: () => void;
}) {
  const { Item, Separator, Sub, SubTrigger, SubContent } = kit;
  const alvo = useMemo(() => alvoDaImagem(imagem), [imagem]);
  const programas = useProgramas(alvo);

  const temCena = useSceneStore((state) => Boolean(state.board?.editingSceneId));
  const noAr = useSpotlightStore((state) =>
    imagem.origem === "acervo"
      ? state.spotlight?.assetId === imagem.asset.id
      : Boolean(state.spotlight?.sharedId) &&
        anexoNaMesa?.chave === imagem.chave &&
        state.spotlight?.sharedId === anexoNaMesa.sharedId,
  );

  function adicionarACena() {
    if (imagem.origem !== "acervo") return;

    const cena = selectEditingScene(useSceneStore.getState());
    if (!cena) return;

    const tamanho = tamanhoNaCena(imagem.asset);
    const pecaId = useSceneStore.getState().addItem(cena.id, {
      assetId: imagem.asset.id,
      ...centeredBox(tamanho.x, tamanho.y),
    });

    useSelectionStore.getState().select([pecaId]);
  }

  async function alternarNaMesa() {
    const evidencia = useSpotlightStore.getState();

    if (noAr) {
      evidencia.clear();
      return;
    }

    if (imagem.origem === "acervo") {
      evidencia.transmit(imagem.asset.id);
      return;
    }

    try {
      // O endereço sai do daemon ANTES de a evidência subir, como na ficha:
      // pedir pode falhar, e falhar tem de virar aviso aqui, não evidência
      // vazia na TV.
      const { personagemId, autor, arquivo } = imagem.anexo;
      const sharedId = await shareCharacterAttachment(personagemId, autor, arquivo);

      anexoNaMesa = { chave: imagem.chave, sharedId };
      evidencia.transmitShared(sharedId, arquivo);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.galeria.menu.naoTransmitiu);
    }
  }

  function tentar(acao: () => Promise<void>) {
    void acao().catch((cause: unknown) =>
      toast.error(cause instanceof Error ? cause.message : t.galeria.menu.naoAbriu),
    );
  }

  return (
    <>
      <Item onClick={onAbrir}>
        <Maximize2 />
        {t.galeria.menu.abrir}
      </Item>

      {imagem.origem === "acervo" ? (
        <Item disabled={!temCena} onClick={adicionarACena}>
          <Plus />
          {t.galeria.menu.adicionarACena}
        </Item>
      ) : null}

      <Item onClick={() => void alternarNaMesa()}>
        {noAr ? <RadioTower /> : <Radio />}
        {noAr ? t.galeria.menu.tirarDaMesa : t.galeria.menu.mostrarNaMesa}
      </Item>

      <Separator />

      <Sub>
        <SubTrigger>
          <AppWindow />
          {t.galeria.menu.abrirCom}
        </SubTrigger>
        <SubContent className="max-h-80 w-56">
          {programas === null ? (
            <Item disabled>{t.galeria.menu.procurandoProgramas}</Item>
          ) : (
            <>
              {/* Sem lista -- no Windows, que tem o seletor dele, ou numa
                  máquina sem programa registrado para o tipo --, o padrão do
                  sistema continua sendo uma escolha. */}
              {programas.programas.length === 0 ? (
                <Item onClick={() => tentar(() => abrirCom(alvo))}>
                  {t.galeria.menu.programaPadrao}
                </Item>
              ) : (
                programas.programas.map((programa) => (
                  <Item key={programa.id} onClick={() => tentar(() => abrirCom(alvo, programa.id))}>
                    <span className="min-w-0 flex-1 truncate">{programa.nome}</span>
                    {programa.padrao ? (
                      <span className="text-muted-foreground text-xs">
                        {t.galeria.menu.padrao}
                      </span>
                    ) : null}
                  </Item>
                ))
              )}

              {programas.seletor ? (
                <>
                  <Separator />
                  <Item onClick={() => tentar(() => escolherPrograma(alvo))}>
                    {t.galeria.menu.outroPrograma}
                  </Item>
                </>
              ) : null}
            </>
          )}
        </SubContent>
      </Sub>

      <Item onClick={() => tentar(() => mostrarNaPasta(alvo))}>
        <FolderOpen />
        {t.galeria.menu.mostrarNaPasta}
      </Item>

      <Separator />

      <Item onClick={onPropriedades}>
        <Info />
        {t.galeria.menu.propriedades}
      </Item>

      {imagem.origem === "acervo" ? (
        <ItensDeExtensao
          alvo="linha.imagem"
          contexto={{ alvo: "linha.imagem", assetId: imagem.asset.id }}
          kit={kit}
        />
      ) : null}
    </>
  );
}

/**
 * Os programas que abrem o arquivo, perguntados quando o menu abre.
 *
 * Falhar aqui deixa o menu com o padrão do sistema, e não com um erro: o
 * submenu é conveniência, e "Programa padrão" ainda abre o arquivo.
 */
function useProgramas(alvo: ReturnType<typeof alvoDaImagem>): ProgramasDoArquivo | null {
  const [programas, setProgramas] = useState<ProgramasDoArquivo | null>(null);

  useEffect(() => {
    let ativo = true;

    void programasDoArquivo(alvo).then(
      (resposta) => {
        if (ativo) setProgramas(resposta);
      },
      () => {
        if (ativo) setProgramas({ programas: [], seletor: false });
      },
    );

    return () => {
      ativo = false;
    };
  }, [alvo]);

  return programas;
}

/**
 * A miniatura de um anexo, pedida só quando o cartão chega perto da vista.
 *
 * O acervo resolve isto com `loading="lazy"` numa URL do daemon. O anexo não
 * tem URL: os bytes vêm por IPC, e a ida ao Rust acontece no JavaScript,
 * antes do `<img>` existir -- o `lazy` do navegador não a alcança. Sem a
 * espera, abrir a Galeria pediria a miniatura de todos os anexos da campanha
 * de uma vez, inclusive os que estão vinte telas abaixo.
 *
 * A blob é revogada quando o cartão sai, pela razão do `AnexoThumb` da ficha.
 */
function MiniaturaDoAnexo({ anexo, alt }: { anexo: AnexoNaGaleria; alt: string }) {
  const ancora = useRef<HTMLSpanElement>(null);
  const [perto, setPerto] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const { personagemId, autor, arquivo, modificadoEm } = anexo;

  useEffect(() => {
    const aqui = ancora.current;
    if (perto || !aqui) return;

    // Uma tela de folga: a miniatura já está pronta quando a rolagem a traz.
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) setPerto(true);
      },
      { rootMargin: "100% 0px" },
    );

    observador.observe(aqui);

    return () => observador.disconnect();
  }, [perto]);

  useEffect(() => {
    if (!perto) return;

    let ativo = true;
    let criada: string | null = null;

    void miniaturaDoAnexo(anexo).then(
      (endereco) => {
        if (!ativo) {
          URL.revokeObjectURL(endereco);
          return;
        }

        criada = endereco;
        setUrl(endereco);
      },
      () => {
        // O quadrado fica cinza: o arquivo pode ter saído do disco entre a
        // lista e o pedido, e a próxima releitura o tira da grade.
      },
    );

    return () => {
      ativo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
    // `modificadoEm` entra para a troca do arquivo pelo mesmo nome pedir a
    // miniatura nova; o resto do `anexo` não muda o que se pede.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perto, personagemId, autor, arquivo, modificadoEm]);

  return (
    // Caixa de verdade, e não `contents`: o observador precisa de uma caixa
    // para saber se ela está à vista.
    <span ref={ancora} className="absolute inset-0">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          className="size-full object-cover"
          draggable={false}
          {...MINIATURA}
        />
      ) : null}
    </span>
  );
}
