"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

import { AparenciaDaCondicao } from "@/components/mestre/linha-de-condicao";
import { CorLivre } from "@/components/mestre/seletor-de-cor";
import { NomeDoMedidor } from "@/components/mestre/linha-de-medidor";
import { AreaDeEfeitoLayer } from "@/components/playground/area-de-efeito-layer";
import { DeclarativoProvider } from "@/components/playground/declarativo";
import { FiguraComEfeitos } from "@/components/playground/figura-com-efeitos";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { COR_DA_AREA, efeitosDeAreaProntos } from "@/lib/area-de-efeito";
import {
  copiaParaACampanha,
  definicaoDoEfeito,
  EFEITOS_DE_FABRICA,
  urlDaImagemDaCampanha,
} from "@/lib/efeitos";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useCondicoesStore } from "@/lib/store/use-condicoes-store";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import { DECLARATIVO_VAZIO, type Declarativo } from "@/lib/sync/declarativo";
import { comum } from "@/lib/i18n/comum";
import { t } from "@/lib/i18n/mestre";
import { cn } from "@/lib/utils";
import { importAssets } from "@/lib/vault/assets";
import { vincularEfeitoDaCondicao } from "@/lib/vault/characters";
import type { Condicao, PatchCondicao } from "@/types/character";
import type {
  AnimacaoDoEfeito,
  AreaDoEfeito,
  BaseDoEfeito,
  DefinicaoDeEfeito,
  ExternoDoEfeito,
  FiguraDoEfeito,
  LuzDoEfeito,
  ParticulasDoEfeito,
  QuadrosDoEfeito,
} from "@/types/efeito";

import amostra from "./amostra-da-figura.png";

/**
 * A tela de uma condição da campanha: o selo dela e o EFEITO dela, numa tela
 * só. Abre pela engrenagem da linha no cardápio.
 *
 * Cada condição tem o seu efeito (escolha do mestre): a condição que ainda usa
 * o fogo de fábrica abre com o fogo preenchido, e a PRIMEIRA mudança faz dele
 * uma cópia desta campanha, ligada à condição e às cópias dela nas fichas --
 * editar o fogo de "Em chamas" muda quem já está em chamas. Abrir e olhar não
 * cria nada. Ver `useEfeitoDaCondicao`.
 *
 * Só formulário, como o mestre pediu: cada camada do efeito -- a figura, a
 * imagem em volta, as partículas, a luz -- é uma seção que liga e desliga, e
 * a prévia mostra o resultado na cor da condição enquanto o controle anda.
 */
export function TelaDaCondicao({
  modelo,
  ocupado,
  onEditar,
  onVoltar,
}: {
  modelo: Condicao;
  ocupado: boolean;
  onEditar: (patch: PatchCondicao) => void;
  onVoltar: () => void;
}) {
  const { efeito, mudar, renomear, temProprio } = useEfeitoDaCondicao(modelo);
  const [trocarPor, setTrocarPor] = useState<DefinicaoDeEfeito | null>(null);

  /** O efeito pronto como ponto de partida: a cópia dele, no lugar do atual. */
  function partirDe(pronto: DefinicaoDeEfeito) {
    mudar(daFigura(copiaParaACampanha(pronto, efeito.id, modelo.nome)));
  }

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onVoltar}>
        <ArrowLeft />
        {t.efeito.condicoes}
      </Button>

      <div className="flex items-center gap-2 rounded-md border p-2.5">
        <AparenciaDaCondicao condicao={modelo} ocupado={ocupado} onEditar={onEditar} comEfeito={false} />
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <NomeDoMedidor
            nome={modelo.nome}
            ocupado={ocupado}
            onGravar={(nome) => {
              onEditar({ nome });
              renomear(nome);
            }}
            rotulos={{
              campo: t.efeito.nomeDaCondicao,
              lapis: t.efeito.renomearCondicao,
            }}
          />
        </div>
        <label className="flex shrink-0 items-center gap-1.5">
          <span className="text-muted-foreground text-[11px]">
            {t.efeito.aMesaVe}
          </span>
          <Switch
            size="sm"
            checked={!modelo.escondido}
            disabled={ocupado}
            onCheckedChange={(vê) => onEditar({ escondido: !vê })}
          />
        </label>
      </div>

      {/* Os efeitos que o ATO20 traz, como ponto de partida: é por aqui que a
          condição criada à mão chega ao fogo ou ao gelo prontos -- o
          cardápio não tem mais seletor de efeito. */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground mr-1 text-[11px]">
          {t.efeito.partirDePronto}
        </span>
        {EFEITOS_DE_FABRICA.map((pronto) => (
          <Button
            key={pronto.id}
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            title={pronto.dica}
            onClick={() => (temProprio ? setTrocarPor(pronto) : partirDe(pronto))}
          >
            {pronto.titulo}
          </Button>
        ))}
      </div>

      <EditorDeEfeito efeito={efeito} cor={modelo.cor} onMudar={mudar} />

      <AlertDialog
        open={trocarPor !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setTrocarPor(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.efeito.trocarPelo(trocarPor?.titulo ?? "")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.efeito.trocarNaCondicao(modelo.nome)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{comum.cancelar}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (trocarPor) partirDe(trocarPor);
                setTrocarPor(null);
              }}
            >
              {t.efeito.trocar}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * A tela de um EFEITO EM ÁREA da campanha: o nome, a cor e as camadas dele.
 * Abre pela engrenagem da linha na lista (Efeitos, Efeito em área).
 *
 * O efeito já é da campanha -- a lista só tem os dela --, e cada mudança
 * grava nele: todas as áreas que o usam mudam junto, na mesa também, porque a
 * área guarda o id e o catálogo resolve. A cor mora no efeito (`area.cor`), e
 * é a das áreas que não escolheram a sua no gizmo.
 */
export function TelaDoEfeitoEmArea({
  efeito,
  onVoltar,
}: {
  efeito: DefinicaoDeEfeito;
  onVoltar: () => void;
}) {
  const salvar = useEfeitosDaCampanhaStore((state) => state.salvar);
  const deFora = useDeclarativoStore((state) => state.efeitos);
  const [trocarPor, setTrocarPor] = useState<DefinicaoDeEfeito | null>(null);
  const cor = efeito.area?.cor ?? COR_DA_AREA;
  // Alguma camada ajustada: trocar pelo pronto pede confirmação, como na condição.
  const temCamadas = Boolean(
    efeito.base || efeito.area?.foco || efeito.externo || efeito.particulas || efeito.luz,
  );

  function partirDe(pronto: DefinicaoDeEfeito) {
    const copia = copiaParaACampanha(pronto, efeito.id, efeito.titulo);
    salvar({ ...copia, area: { ...copia.area, cor } });
  }

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onVoltar}>
        <ArrowLeft />
        {t.efeito.efeitosEmArea}
      </Button>

      <div className="flex items-center gap-2 rounded-md border p-2.5">
        <CorDoEfeito cor={cor} onMudar={(nova) => salvar({ ...efeito, area: { ...efeito.area, cor: nova } })} />
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <NomeDoMedidor
            nome={efeito.titulo}
            ocupado={false}
            onGravar={(titulo) => salvar({ ...efeito, titulo })}
            rotulos={{
              campo: t.efeito.nomeDoEfeito,
              lapis: t.efeito.renomearEfeito,
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground mr-1 text-[11px]">
          {t.efeito.partirDePronto}
        </span>
        {efeitosDeAreaProntos(deFora).map((pronto) => (
          <Button
            key={pronto.id}
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            title={pronto.dica}
            onClick={() => (temCamadas ? setTrocarPor(pronto) : partirDe(pronto))}
          >
            {pronto.titulo}
          </Button>
        ))}
      </div>

      <div className="@container">
        <div className="grid gap-3 @lg:grid-cols-[14rem_1fr]">
          <div className="@lg:sticky @lg:top-0 @lg:self-start">
            <PreviaDaArea efeito={efeito} />
          </div>
          <div className="space-y-3">
            <SecaoDoChao base={efeito.base} onMudar={(base) => salvar(com(efeito, "base", base))} />
            <SecaoDosElementos
              area={efeito.area ?? {}}
              onMudar={(area) => salvar({ ...efeito, area })}
            />
            <SecaoDasParticulas
              particulas={efeito.particulas}
              onMudar={(particulas) => salvar(com(efeito, "particulas", particulas))}
              descricao={t.efeito.particulasDaArea}
            />
            <SecaoDaLuz
              luz={efeito.luz}
              onMudar={(luz) => salvar(com(efeito, "luz", luz))}
              descricao={t.efeito.luzDaArea}
            />
          </div>
        </div>
      </div>

      <AlertDialog
        open={trocarPor !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setTrocarPor(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.efeito.trocarPelo(trocarPor?.titulo ?? "")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.efeito.trocarNaArea(efeito.titulo)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{comum.cancelar}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (trocarPor) partirDe(trocarPor);
                setTrocarPor(null);
              }}
            >
              {t.efeito.trocar}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** As cores de partida de um efeito em área: as do lápis, que é a paleta da casa. */
function CorDoEfeito({ cor, onMudar }: { cor: string; onMudar: (cor: string) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {CORES_LAPIS.map((opcao) => (
        <button
          key={opcao}
          type="button"
          aria-label={t.efeito.corDe(opcao)}
          aria-pressed={opcao === cor}
          className={cn(
            "size-4 rounded-full ring-offset-1 ring-offset-background",
            opcao === cor && "ring-foreground ring-2",
          )}
          style={{ backgroundColor: opcao }}
          onClick={() => onMudar(opcao)}
        />
      ))}
      <CorLivre
        cor={cor}
        paleta={CORES_LAPIS}
        className={(livre) =>
          cn("size-4 rounded-full ring-offset-1 ring-offset-background", livre && "ring-foreground ring-2")
        }
        onCor={onMudar}
      />
    </div>
  );
}

/**
 * A prévia de um efeito em área: um pedaço de chão com uma área de três casas
 * por duas, desenhada como a mesa a vê. A definição é a DA TELA, por um
 * declarativo só dela, como na prévia da condição.
 */
function PreviaDaArea({ efeito }: { efeito: DefinicaoDeEfeito }) {
  const declarativo = useMemo<Declarativo>(
    () => ({
      ...DECLARATIVO_VAZIO,
      efeitos: { [efeito.id]: { ...efeito, origem: { acervo: true } } },
    }),
    [efeito],
  );
  const area = useMemo(
    () => [{ id: "previa-da-area", x: 48, y: 72, width: 288, height: 192, efeito: efeito.id, naMesa: true }],
    [efeito.id],
  );
  // O chão de 384 por 288 unidades, na caixa da prévia.
  const escala = 224 / 384;

  return (
    <div className="relative h-[168px] w-full overflow-hidden rounded-md bg-neutral-900">
      <div
        className="absolute top-0 left-0"
        style={{ width: 384, height: 288, transform: `scale(${escala})`, transformOrigin: "0 0" }}
      >
        <DeclarativoProvider valor={declarativo}>
          <AreaDeEfeitoLayer areas={area} grid={undefined} variant="mesa" />
        </DeclarativoProvider>
      </div>
    </div>
  );
}

/** O id do efeito que a condição ainda não tem: a prévia antes da primeira mudança. */
const PENDENTE = "campanha/pendente";

/**
 * O efeito de uma condição do cardápio, e o gesto de mudá-lo.
 *
 * - Já tem efeito da campanha: é ele, e mudar grava nele.
 * - Ainda não tem (nenhum, o de fábrica, o de um plugin): a tela mostra o
 *   atual, copiado; a primeira mudança cria o efeito da campanha, liga à
 *   condição e às cópias nas fichas, e grava a mudança nele. As mudanças que
 *   chegam enquanto isso não termina ficam na última, que é a que vale.
 */
function useEfeitoDaCondicao(modelo: Condicao) {
  const efeitos = useEfeitosDaCampanhaStore((state) => state.efeitos);
  const criar = useEfeitosDaCampanhaStore((state) => state.criar);
  const salvar = useEfeitosDaCampanhaStore((state) => state.salvar);
  const deFora = useDeclarativoStore((state) => state.efeitos);
  const recarregarCondicoes = useCondicoesStore((state) => state.recarregar);
  const recarregarPersonagens = useCharactersStore((state) => state.recarregar);
  const [rascunho, setRascunho] = useState<DefinicaoDeEfeito | null>(null);
  const criando = useRef<Promise<string | null> | null>(null);
  const ultimo = useRef<DefinicaoDeEfeito | null>(null);

  const proprio = modelo.efeito?.startsWith("campanha/")
    ? efeitos?.find((efeito) => efeito.id === modelo.efeito)
    : undefined;

  const atual = useMemo<DefinicaoDeEfeito>(() => {
    const deAgora = definicaoDoEfeito(modelo.efeito, deFora);
    return deAgora
      ? daFigura(copiaParaACampanha(deAgora, PENDENTE, modelo.nome))
      : { id: PENDENTE, titulo: modelo.nome };
  }, [modelo.efeito, modelo.nome, deFora]);

  const efeito = proprio ?? rascunho ?? atual;

  function mudar(novo: DefinicaoDeEfeito) {
    if (proprio) {
      salvar(novo);
      return;
    }

    ultimo.current = novo;
    setRascunho(novo);
    criando.current ??= (async () => {
      const criado = await criar();
      if (!criado) return null;

      try {
        await vincularEfeitoDaCondicao(modelo.id, criado.id);
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : t.efeito.falhaAoLigar);
      }
      recarregarCondicoes();
      recarregarPersonagens();
      return criado.id;
    })();

    void criando.current.then((id) => {
      if (id && ultimo.current) salvar({ ...ultimo.current, id, titulo: modelo.nome });
      setRascunho(null);
    });
  }

  /** O efeito leva o nome da condição: é como ele aparece no seletor da ficha. */
  function renomear(nome: string) {
    if (proprio) salvar({ ...proprio, titulo: nome });
  }

  return { efeito, mudar, renomear, temProprio: Boolean(proprio) };
}

/**
 * O efeito só com o que serve a uma FIGURA: sem a área e sem a base. A condição
 * que copia o fogo de fábrica não leva o chão em chamas -- senão o efeito dela
 * apareceria também na lista de efeitos em área da campanha, que são os que
 * declaram `area`. Ver `efeitosEmAreaDaCampanha`.
 */
function daFigura(efeito: DefinicaoDeEfeito): DefinicaoDeEfeito {
  const copia = { ...efeito };
  delete copia.area;
  delete copia.base;
  return copia;
}

/** Um campo fora do objeto: `undefined` some, e o arquivo não ganha campo vazio. */
function com<T extends object, K extends keyof T>(objeto: T, chave: K, valor: T[K] | undefined): T {
  const novo = { ...objeto };
  if (valor === undefined) delete novo[chave];
  else novo[chave] = valor;
  return novo;
}

function EditorDeEfeito({
  efeito,
  cor,
  onMudar,
}: {
  efeito: DefinicaoDeEfeito;
  /** A cor da condição: é nela que a prévia pinta. */
  cor: string;
  onMudar: (efeito: DefinicaoDeEfeito) => void;
}) {
  const mudar = <K extends keyof DefinicaoDeEfeito>(chave: K, valor: DefinicaoDeEfeito[K] | undefined) =>
    onMudar(com(efeito, chave, valor));

  const figura = efeito.figura ?? {};
  const mudarFigura = <K extends keyof FiguraDoEfeito>(chave: K, valor: FiguraDoEfeito[K] | undefined) => {
    const nova = com(figura, chave, valor);
    mudar("figura", Object.keys(nova).length > 0 ? nova : undefined);
  };

  return (
    <div className="@container">
      <div className="grid gap-3 @lg:grid-cols-[14rem_1fr]">
        <div className="@lg:sticky @lg:top-0 @lg:self-start">
          <Previa efeito={efeito} cor={cor} />
        </div>

        <div className="space-y-3">
          <Secao titulo={t.efeito.naFigura} descricao={t.efeito.naFiguraDescricao}>
            <Interruptor rotulo={t.efeito.haloAtras} valor={Boolean(figura.halo)} onMudar={(v) => mudarFigura("halo", v || undefined)} />
            <Interruptor
              rotulo={t.efeito.corPorCima}
              valor={typeof figura.tinta === "number"}
              onMudar={(v) => mudarFigura("tinta", v ? 0.5 : undefined)}
            />
            {typeof figura.tinta === "number" ? (
              <Faixa rotulo={t.efeito.forcaDaCor} valor={figura.tinta} min={0.05} max={1} passo={0.05} porcento onMudar={(v) => mudarFigura("tinta", v)} />
            ) : null}
            <Interruptor rotulo={t.efeito.cinzaEEscura} valor={Boolean(figura.cinza)} onMudar={(v) => mudarFigura("cinza", v || undefined)} />
            <Interruptor rotulo={t.efeito.meioTransparente} valor={Boolean(figura.translucido)} onMudar={(v) => mudarFigura("translucido", v || undefined)} />
            <Interruptor rotulo={t.efeito.tremendo} valor={Boolean(figura.tremor)} onMudar={(v) => mudarFigura("tremor", v || undefined)} />
          </Secao>

          <SecaoDoExterno externo={efeito.externo} onMudar={(externo) => mudar("externo", externo)} />
          <SecaoDasParticulas particulas={efeito.particulas} onMudar={(p) => mudar("particulas", p)} />
          <SecaoDaLuz luz={efeito.luz} onMudar={(luz) => mudar("luz", luz)} />
        </div>
      </div>
    </div>
  );
}

// --- as camadas ----------------------------------------------------------------

function SecaoDoExterno({
  externo,
  onMudar,
}: {
  externo: ExternoDoEfeito | undefined;
  onMudar: (externo: ExternoDoEfeito | undefined) => void;
}) {
  const ligado = externo !== undefined;
  const e = externo ?? { imagem: "" };
  const mudar = <K extends keyof ExternoDoEfeito>(chave: K, valor: ExternoDoEfeito[K] | undefined) =>
    onMudar(com(e, chave, valor));
  const animacao = e.animacao;
  const mudarAnimacao = <K extends keyof AnimacaoDoEfeito>(chave: K, valor: AnimacaoDoEfeito[K]) =>
    animacao && mudar("animacao", { ...animacao, [chave]: valor });

  return (
    <Secao
      titulo={t.efeito.imagemEmVolta}
      descricao={t.efeito.imagemEmVoltaDescricao}
      ligado={ligado}
      onLigar={(v) => onMudar(v ? { imagem: "" } : undefined)}
    >
      <ImagemDoAcervo
        rotulo={t.efeito.imagem}
        assetId={e.imagem || undefined}
        // Os mipmaps são da imagem ANTIGA -- a cópia do fogo de fábrica os
        // traz --, e o nível escolhido pelo zoom desenharia o fogo velho.
        onMudar={(id) => onMudar(com(com(e, "mipmaps", undefined), "imagem", id ?? ""))}
      />
      {/* `comFps`: o externo toca sempre em laço, e a grade sai com a velocidade. */}
      <Quadros
        quadros={e.quadros}
        onMudar={(q) => mudar("quadros", q as QuadrosDoEfeito | undefined)}
        comFps
      />
      <Faixa rotulo={t.efeito.tamanho} valor={e.tamanho ?? 1.5} min={0.25} max={2} passo={0.05} sufixo="×" onMudar={(v) => mudar("tamanho", v)} />
      <Escolha
        rotulo={t.efeito.lado}
        valor={e.lado ?? "atras"}
        opcoes={[
          { valor: "atras", rotulo: t.efeito.atras },
          { valor: "frente", rotulo: t.efeito.naFrente },
        ]}
        onMudar={(v) => mudar("lado", v === "atras" ? undefined : v)}
      />
      <Escolha
        rotulo={t.efeito.cresceDe}
        valor={e.ancora ?? "centro"}
        opcoes={[
          { valor: "centro", rotulo: t.efeito.centro },
          { valor: "base", rotulo: t.efeito.pes },
          { valor: "topo", rotulo: t.efeito.cabeca },
        ]}
        onMudar={(v) => mudar("ancora", v === "centro" ? undefined : v)}
      />
      <Faixa rotulo={t.efeito.opacidade} valor={e.opacidade ?? 1} min={0.05} max={1} passo={0.05} porcento onMudar={(v) => mudar("opacidade", v >= 1 ? undefined : v)} />
      <Interruptor
        rotulo={t.efeito.pintarNaCorDaCondicao}
        dica={t.efeito.pintarImagemDica}
        valor={e.cores === "condicao"}
        onMudar={(v) => mudar("cores", v ? "condicao" : undefined)}
      />
      <ImagemDoAcervo
        rotulo={t.efeito.mascara}
        dica={t.efeito.mascaraDica}
        assetId={e.mascara}
        onMudar={(id) => mudar("mascara", id)}
      />
      <ImagemDoAcervo
        rotulo={t.efeito.profundidade}
        dica={t.efeito.profundidadeDica}
        assetId={e.profundidade}
        onMudar={(id) => mudar("profundidade", id)}
      />
      <Escolha
        rotulo={t.efeito.movimento}
        valor={animacao?.tipo ?? "nenhum"}
        opcoes={[
          { valor: "nenhum", rotulo: t.efeito.parada },
          { valor: "pulsar", rotulo: t.efeito.pulsar },
          { valor: "girar", rotulo: t.efeito.girar },
          { valor: "flutuar", rotulo: t.efeito.flutuar },
          { valor: "piscar", rotulo: t.efeito.piscar },
        ]}
        onMudar={(v) =>
          mudar("animacao", v === "nenhum" ? undefined : { ...(animacao ?? {}), tipo: v as AnimacaoDoEfeito["tipo"] })
        }
      />
      {animacao ? (
        <>
          <Faixa rotulo={t.efeito.ciclo} valor={animacao.periodo ?? 2} min={0.2} max={10} passo={0.1} sufixo=" s" onMudar={(v) => mudarAnimacao("periodo", v)} />
          <Faixa rotulo={t.efeito.intensidade} valor={animacao.intensidade ?? 0.5} min={0} max={1} passo={0.05} porcento onMudar={(v) => mudarAnimacao("intensidade", v)} />
        </>
      ) : null}
    </Secao>
  );
}

/**
 * O CHÃO de um efeito em área: a textura deitada, recortada na forma exata da
 * área -- é a camada que diz ao jogador onde a área termina. Ver
 * `BaseDoEfeito`.
 */
function SecaoDoChao({
  base,
  onMudar,
}: {
  base: BaseDoEfeito | undefined;
  onMudar: (base: BaseDoEfeito | undefined) => void;
}) {
  const b = base ?? { imagem: "" };
  const mudar = <K extends keyof BaseDoEfeito>(chave: K, valor: BaseDoEfeito[K] | undefined) =>
    onMudar(com(b, chave, valor));

  return (
    <Secao
      titulo={t.efeito.chao}
      descricao={t.efeito.chaoDescricao}
      ligado={base !== undefined}
      onLigar={(v) => onMudar(v ? { imagem: "" } : undefined)}
    >
      <ImagemDoAcervo
        rotulo={t.efeito.textura}
        dica={t.efeito.texturaDica}
        assetId={b.imagem || undefined}
        onMudar={(id) => onMudar(com(com(b, "mipmaps", undefined), "imagem", id ?? ""))}
      />
      <Quadros
        quadros={b.quadros}
        onMudar={(q) => mudar("quadros", q as QuadrosDoEfeito | undefined)}
        comFps
      />
      <Faixa
        rotulo={t.efeito.tamanhoDoLadrilho}
        valor={b.escala ?? 1}
        min={0.5}
        max={4}
        passo={0.25}
        sufixo="×"
        onMudar={(v) => mudar("escala", v === 1 ? undefined : v)}
      />
      <Faixa
        rotulo={t.efeito.escurecerChao}
        valor={b.escurece ?? 0}
        min={0}
        max={1}
        passo={0.05}
        porcento
        onMudar={(v) => mudar("escurece", v > 0 ? v : undefined)}
      />
      <Faixa
        rotulo={t.efeito.opacidade}
        valor={b.opacidade ?? 1}
        min={0.05}
        max={1}
        passo={0.05}
        porcento
        onMudar={(v) => mudar("opacidade", v >= 1 ? undefined : v)}
      />
      <Interruptor
        rotulo={t.efeito.pintarNaCorDoEfeito}
        dica={t.efeito.pintarTexturaDica}
        valor={b.cores === "condicao"}
        onMudar={(v) => mudar("cores", v ? "condicao" : undefined)}
      />
    </Secao>
  );
}

/**
 * Os ELEMENTOS de um efeito em área: o foco que a área repete, segmento a
 * segmento -- a chama do fogo, a bolha do veneno, o cristal do gelo --, e como
 * ela divide o chão. "Elementos", e não "Chama": a seção é de todo efeito em
 * área, e o fogo é só o primeiro. Ver `AreaDoEfeito`.
 */
function SecaoDosElementos({
  area,
  onMudar,
}: {
  area: AreaDoEfeito;
  onMudar: (area: AreaDoEfeito) => void;
}) {
  const foco = area.foco ?? { imagem: "" };
  const mudarFoco = <K extends keyof NonNullable<AreaDoEfeito["foco"]>>(
    chave: K,
    valor: NonNullable<AreaDoEfeito["foco"]>[K] | undefined,
  ) => onMudar({ ...area, foco: com(foco, chave, valor) });
  const mudar = <K extends keyof AreaDoEfeito>(chave: K, valor: AreaDoEfeito[K] | undefined) =>
    onMudar(com(area, chave, valor));

  return (
    <Secao
      titulo={t.efeito.elementos}
      descricao={t.efeito.elementosDescricao}
      ligado={area.foco !== undefined}
      onLigar={(v) => onMudar(v ? { ...area, foco: { imagem: "" } } : com(area, "foco", undefined))}
    >
      <ImagemDoAcervo
        rotulo={t.efeito.imagem}
        dica={t.efeito.elementoDica}
        assetId={foco.imagem || undefined}
        onMudar={(id) =>
          onMudar({ ...area, foco: com(com(foco, "mipmaps", undefined), "imagem", id ?? "") })
        }
      />
      <Quadros
        quadros={foco.quadros}
        onMudar={(q) => mudarFoco("quadros", q as QuadrosDoEfeito | undefined)}
        comFps
      />
      <Interruptor
        rotulo={t.efeito.pintarNaCorDoEfeito}
        valor={foco.cores === "condicao"}
        onMudar={(v) => mudarFoco("cores", v ? "condicao" : undefined)}
      />
      <Faixa
        rotulo={t.efeito.tamanho}
        valor={area.escala ?? 1.5}
        min={1}
        max={2.5}
        passo={0.1}
        sufixo="×"
        onMudar={(v) => mudar("escala", v)}
      />
      <Faixa
        rotulo={t.efeito.divisoesPorCasa}
        valor={area.divisoes ?? 1}
        min={1}
        max={4}
        passo={1}
        onMudar={(v) => mudar("divisoes", v === 1 ? undefined : v)}
      />
      <Faixa
        rotulo={t.efeito.minimoNoMenorLado}
        valor={area.densidade ?? 0}
        min={0}
        max={8}
        passo={1}
        onMudar={(v) => mudar("densidade", v > 0 ? v : undefined)}
      />
    </Secao>
  );
}

function SecaoDasParticulas({
  particulas,
  onMudar,
  descricao = t.efeito.particulasDaFigura,
}: {
  particulas: ParticulasDoEfeito | undefined;
  onMudar: (particulas: ParticulasDoEfeito | undefined) => void;
  /** O texto da seção: a figura solta, ou a área solta. */
  descricao?: string;
}) {
  const p = particulas ?? { quantidade: 8 };
  const mudar = <K extends keyof ParticulasDoEfeito>(chave: K, valor: ParticulasDoEfeito[K] | undefined) =>
    onMudar(com(p, chave, valor));
  const emissor = p.emissor ?? {};
  const mudarEmissor = <K extends keyof NonNullable<ParticulasDoEfeito["emissor"]>>(
    chave: K,
    valor: NonNullable<ParticulasDoEfeito["emissor"]>[K],
  ) => mudar("emissor", { ...emissor, [chave]: valor });

  return (
    <Secao
      titulo={t.efeito.particulas}
      descricao={descricao}
      ligado={particulas !== undefined}
      onLigar={(v) => onMudar(v ? { quantidade: 8 } : undefined)}
    >
      <Faixa rotulo={t.efeito.quantidade} valor={p.quantidade} min={1} max={24} passo={1} onMudar={(v) => mudar("quantidade", v)} />
      <Faixa rotulo={t.efeito.tamanho} valor={p.tamanho ?? 0.06} min={0.01} max={0.5} passo={0.01} porcento onMudar={(v) => mudar("tamanho", v)} />
      <Faixa rotulo={t.efeito.variacaoDoTamanho} valor={p.variacao ?? 0.5} min={0} max={1} passo={0.05} porcento onMudar={(v) => mudar("variacao", v)} />
      <Faixa rotulo={t.efeito.direcao} valor={p.direcao ?? 270} min={0} max={359} passo={1} sufixo="°" onMudar={(v) => mudar("direcao", v)} />
      <Faixa rotulo={t.efeito.abertura} valor={p.abertura ?? 40} min={0} max={360} passo={1} sufixo="°" onMudar={(v) => mudar("abertura", v)} />
      <Faixa rotulo={t.efeito.velocidade} valor={p.velocidade ?? 1} min={0} max={5} passo={0.05} sufixo=" fig/s" onMudar={(v) => mudar("velocidade", v)} />
      <Faixa rotulo={t.efeito.vida} valor={p.vida ?? 1.5} min={0.3} max={6} passo={0.1} sufixo=" s" onMudar={(v) => mudar("vida", v)} />
      <Faixa rotulo={t.efeito.larguraDeOndeNascem} valor={emissor.largura ?? 0.8} min={0} max={2} passo={0.05} porcento onMudar={(v) => mudarEmissor("largura", v)} />
      <Faixa rotulo={t.efeito.alturaDeOndeNascem} valor={emissor.altura ?? 0.3} min={0} max={2} passo={0.05} porcento onMudar={(v) => mudarEmissor("altura", v)} />
      <Escolha
        rotulo={t.efeito.nascemEm}
        valor={emissor.ancora ?? "base"}
        opcoes={[
          { valor: "base", rotulo: t.efeito.pes },
          { valor: "centro", rotulo: t.efeito.centro },
          { valor: "topo", rotulo: t.efeito.cabeca },
        ]}
        onMudar={(v) => mudarEmissor("ancora", v as "base" | "centro" | "topo")}
      />
      <ImagemDoAcervo
        rotulo={t.efeito.imagemDaParticula}
        dica={t.efeito.imagemDaParticulaDica}
        assetId={p.imagem}
        onMudar={(id) => mudar("imagem", id)}
      />
      {p.imagem ? (
        <>
          <Interruptor
            rotulo={t.efeito.pintarNaCorDaCondicao}
            dica={t.efeito.pintarParticulaDica}
            valor={Boolean(p.pintar)}
            onMudar={(v) => mudar("pintar", v || undefined)}
          />
          <Faixa rotulo={t.efeito.giroNaVida} valor={p.giro ?? 0} min={-720} max={720} passo={10} sufixo="°" onMudar={(v) => mudar("giro", v || undefined)} />
          <Quadros quadros={p.quadros} onMudar={(q) => mudar("quadros", q)} />
        </>
      ) : null}
    </Secao>
  );
}

function SecaoDaLuz({
  luz,
  onMudar,
  descricao = t.efeito.luzDaFigura,
}: {
  luz: LuzDoEfeito | undefined;
  onMudar: (luz: LuzDoEfeito | undefined) => void;
  /** O texto da seção: a figura clareia, ou a área clareia. */
  descricao?: string;
}) {
  const l = luz ?? { raio: 2.5 };
  const mudar = <K extends keyof LuzDoEfeito>(chave: K, valor: LuzDoEfeito[K] | undefined) =>
    onMudar(com(l, chave, valor));

  return (
    <Secao
      titulo={t.efeito.luz}
      descricao={descricao}
      ligado={luz !== undefined}
      onLigar={(v) => onMudar(v ? { raio: 2.5 } : undefined)}
    >
      <Faixa rotulo={t.efeito.alcance} valor={l.raio} min={0.5} max={10} passo={0.1} sufixo={t.efeito.vezesAFigura} onMudar={(v) => mudar("raio", v)} />
      <Faixa rotulo={t.efeito.intensidade} valor={l.intensidade ?? 1} min={0.05} max={1} passo={0.05} porcento onMudar={(v) => mudar("intensidade", v >= 1 ? undefined : v)} />
      <Escolha
        rotulo={t.efeito.movimento}
        valor={l.efeito ?? "fixa"}
        opcoes={[
          { valor: "fixa", rotulo: t.efeito.fixa },
          { valor: "fogo", rotulo: t.efeito.fogo },
          { valor: "pulsando", rotulo: t.efeito.pulsando },
          { valor: "piscando", rotulo: t.efeito.piscando },
        ]}
        onMudar={(v) => mudar("efeito", v === "fixa" ? undefined : (v as LuzDoEfeito["efeito"]))}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">{t.efeito.cor}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={!l.cor}
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[11px]",
              !l.cor ? "bg-muted border-foreground/30" : "border-transparent",
            )}
            onClick={() => mudar("cor", undefined)}
          >
            {t.efeito.daCondicao}
          </button>
          {CORES_LAPIS.map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-label={t.efeito.luzNaCor(opcao)}
              aria-pressed={l.cor === opcao}
              className={cn(
                "size-5 rounded-full border-2",
                l.cor === opcao ? "border-foreground" : "border-transparent",
              )}
              style={{ backgroundColor: opcao }}
              onClick={() => mudar("cor", opcao)}
            />
          ))}
          <CorLivre
            cor={l.cor}
            paleta={CORES_LAPIS}
            rotulo={t.efeito.luzEmOutraCor}
            onCor={(cor) => mudar("cor", cor)}
          />
        </div>
      </div>
    </Secao>
  );
}

// --- a prévia ------------------------------------------------------------------

/**
 * O efeito numa figura de amostra, sobre o escuro do mapa à noite. O mesmo
 * `FiguraComEfeitos` do palco -- a prévia não mente sobre a mesa. A luz, que
 * lá é a camada da cena, aqui é um brilho na cor dela, do tamanho do alcance.
 */
function Previa({ efeito, cor }: { efeito: DefinicaoDeEfeito; cor: string }) {
  const pedidos = useMemo(() => [{ efeito: efeito.id, cor }], [efeito.id, cor]);
  // A definição DA TELA, e não a do catálogo: antes da primeira mudança o
  // efeito ainda não existe, e enquanto o controle anda a do catálogo está um
  // passo atrás.
  const declarativo = useMemo<Declarativo>(
    () => ({
      ...DECLARATIVO_VAZIO,
      efeitos: { [efeito.id]: { ...efeito, origem: { acervo: true } } },
    }),
    [efeito],
  );
  const lado = 88;
  const luz = efeito.luz;
  const raioDaLuz = luz ? Math.min(Math.max(luz.raio, 0.5), 10) * lado : 0;

  return (
    <div className="relative h-60 w-full overflow-hidden rounded-md bg-neutral-950">
      {luz ? (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 rounded-full"
          style={{
            bottom: 24 + lado / 2 - raioDaLuz,
            width: raioDaLuz * 2,
            height: raioDaLuz * 2,
            transform: "translateX(-50%)",
            background: `radial-gradient(circle, ${luz.cor ?? cor}55 0%, transparent 70%)`,
            opacity: luz.intensidade ?? 1,
          }}
        />
      ) : null}
      <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 24, width: lado, height: lado }}>
        {/* Um declarativo só com este efeito: é por ele que o
            `FiguraComEfeitos` acha a definição, como no palco. */}
        <DeclarativoProvider valor={declarativo}>
          <FiguraComEfeitos
            efeitos={pedidos}
            url={amostra.src}
            semente="previa-do-efeito"
            alcance={{ livre: true, largura: lado }}
          >
            {(fonte) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fonte ?? amostra.src}
                alt=""
                draggable={false}
                className="absolute inset-0 size-full select-none"
              />
            )}
          </FiguraComEfeitos>
        </DeclarativoProvider>
      </div>
    </div>
  );
}

// --- os controles --------------------------------------------------------------

function Secao({
  titulo,
  descricao,
  ligado,
  onLigar,
  children,
}: {
  titulo: string;
  descricao: string;
  /** Ausente = a seção sempre aberta, sem interruptor. */
  ligado?: boolean;
  onLigar?: (ligado: boolean) => void;
  children: ReactNode;
}) {
  const aberta = ligado ?? true;

  return (
    <section className="space-y-2 rounded-md border p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium">{titulo}</p>
          <p className="text-muted-foreground text-[11px] leading-snug">{descricao}</p>
        </div>
        {onLigar ? (
          <Switch size="sm" aria-label={titulo} checked={aberta} onCheckedChange={onLigar} />
        ) : null}
      </div>
      {aberta ? <div className="space-y-2">{children}</div> : null}
    </section>
  );
}

function Interruptor({
  rotulo,
  dica,
  valor,
  onMudar,
}: {
  rotulo: string;
  dica?: string;
  valor: boolean;
  onMudar: (valor: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs" title={dica}>
        {rotulo}
      </span>
      <Switch size="sm" checked={valor} onCheckedChange={onMudar} />
    </label>
  );
}

function Faixa({
  rotulo,
  valor,
  min,
  max,
  passo,
  sufixo = "",
  porcento = false,
  onMudar,
}: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  passo: number;
  sufixo?: string;
  /** Mostra a fração como porcentagem. */
  porcento?: boolean;
  onMudar: (valor: number) => void;
}) {
  const texto = porcento ? `${Math.round(valor * 100)}%` : `${Number(valor.toFixed(2))}${sufixo}`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">{rotulo}</span>
        <span className="text-muted-foreground text-[10px] tabular-nums">{texto}</span>
      </div>
      <Slider
        aria-label={rotulo}
        value={[valor]}
        min={min}
        max={max}
        step={passo}
        onValueChange={(novo) => {
          const numero = Array.isArray(novo) ? novo[0] : novo;
          if (typeof numero === "number") onMudar(numero);
        }}
      />
    </div>
  );
}

function Escolha<T extends string>({
  rotulo,
  valor,
  opcoes,
  onMudar,
}: {
  rotulo: string;
  valor: T;
  opcoes: ReadonlyArray<{ valor: T; rotulo: string }>;
  onMudar: (valor: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-1">
      <span className="text-xs">{rotulo}</span>
      <div className="flex flex-wrap gap-0.5">
        {opcoes.map((opcao) => (
          <Button
            key={opcao.valor}
            variant={valor === opcao.valor ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={valor === opcao.valor}
            className="h-6 px-1.5 text-[11px]"
            onClick={() => onMudar(opcao.valor)}
          >
            {opcao.rotulo}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * A grade de quadros de uma imagem: ligada, ela vira animação quadro a quadro.
 * `comFps` é o externo, que toca sempre em laço. Sem ele é a partícula, que
 * pode tocar em laço ou uma vez ao longo da vida -- a fagulha que acende e
 * apaga --, e é a velocidade ausente que diz "uma vez".
 */
function Quadros({
  quadros,
  onMudar,
  comFps = false,
}: {
  quadros: { colunas: number; total: number; fps?: number } | undefined;
  onMudar: (quadros: QuadrosDoEfeito | { colunas: number; total: number } | undefined) => void;
  comFps?: boolean;
}) {
  const colunas = quadros?.colunas ?? 4;
  const total = quadros?.total ?? 8;
  const fps = quadros?.fps;
  const emLaco = comFps || fps !== undefined;
  const linhasCheias = total % colunas === 0;
  const grade = (patch: { colunas?: number; total?: number; fps?: number | undefined }) => {
    const nova = { colunas, total, ...(emLaco ? { fps: fps ?? 12 } : {}), ...patch };
    if (nova.fps === undefined) delete nova.fps;
    onMudar(nova as QuadrosDoEfeito);
  };

  return (
    <div className="space-y-2">
      <Interruptor
        rotulo={t.efeito.animada}
        dica={t.efeito.animadaDica}
        valor={quadros !== undefined}
        onMudar={(v) =>
          onMudar(v ? { colunas, total, ...(comFps ? { fps: 12 } : {}) } : undefined)
        }
      />
      {quadros ? (
        <div className="flex flex-wrap items-end gap-2">
          <Numero rotulo={t.efeito.colunas} valor={colunas} min={1} max={16} onMudar={(v) => grade({ colunas: v })} />
          <Numero rotulo={t.efeito.quadros} valor={total} min={1} max={64} onMudar={(v) => grade({ total: v })} />
          {emLaco ? (
            <Numero rotulo={t.efeito.porSegundo} valor={fps ?? 12} min={1} max={60} onMudar={(v) => grade({ fps: v })} />
          ) : null}
          {!comFps ? (
            <div className="w-full">
              <Interruptor
                rotulo={t.efeito.emLaco}
                dica={t.efeito.emLacoDica}
                valor={emLaco}
                onMudar={(v) => grade({ fps: v ? 12 : undefined })}
              />
            </div>
          ) : null}
          {!linhasCheias ? (
            <p className="text-destructive w-full text-[10px]">
              {t.efeito.multiploDe(colunas)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  min,
  max,
  onMudar,
}: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  onMudar: (valor: number) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-muted-foreground text-[10px]">{rotulo}</span>
      <NumberField
        className="h-7"
        value={valor}
        min={min}
        max={max}
        onValueChange={(novo) => {
          if (novo !== null) onMudar(Math.round(novo));
        }}
      />
    </label>
  );
}

/**
 * Uma imagem do acervo: a miniatura, o botão de escolher e o de tirar. O
 * arquivo entra marcado como do EFEITO, e a biblioteca de imagens do mapa não
 * o lista -- a mesma regra do fundo de cena.
 */
function ImagemDoAcervo({
  rotulo,
  dica,
  assetId,
  onMudar,
}: {
  rotulo: string;
  dica?: string;
  assetId: string | undefined;
  onMudar: (assetId: string | undefined) => void;
}) {
  // A arte que veio de um pack (a cópia do fogo de fábrica) não é arquivo do
  // acervo: o endereço sai da própria referência.
  const deUmPack = assetId?.startsWith("fabrica:") || assetId?.startsWith("plugin:");
  const doAcervo = useAssetUrl(deUmPack ? undefined : assetId, "mini");
  const url = deUmPack && assetId ? urlDaImagemDaCampanha(assetId) : doAcervo;

  async function escolher() {
    const resultado = await importAssets("image", "efeito");
    const primeiro = resultado?.aceitos[0];
    if (primeiro) onMudar(primeiro.id);
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs" title={dica}>
        {rotulo}
      </span>
      <div className="flex items-center gap-1">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-7 rounded border bg-neutral-900 object-cover" />
        ) : null}
        <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => void escolher()}>
          <ImagePlus />
          {assetId ? t.efeito.trocar : t.efeito.escolher}
        </Button>
        {assetId ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t.efeito.tirar(rotulo)}
            onClick={() => onMudar(undefined)}
          >
            <X />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
