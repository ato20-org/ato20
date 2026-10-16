"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ClimaNoCartao } from "@/components/mestre/compendio-efeitos";
import { AparenciaDaCondicao } from "@/components/mestre/linha-de-condicao";
import { CorLivre } from "@/components/mestre/seletor-de-cor";
import { NomeDoMedidor } from "@/components/mestre/linha-de-medidor";
import { AreaDeEfeitoLayer } from "@/components/playground/area-de-efeito-layer";
import { DeclarativoProvider } from "@/components/playground/declarativo";
import { TiroEmLaco } from "@/components/playground/tiro-em-laco";
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAssetUrl } from "@/hooks/use-asset-url";
import {
  ambientesProntos,
  COR_DO_AMBIENTE,
  COR_DO_RELAMPAGO,
  direcaoDoSentido,
  LIMITES_DO_AMBIENTE,
  sentidoDaDirecao,
  type SentidoDaCamada,
} from "@/lib/ambiente";
import { COR_DA_AREA, efeitosDeAreaProntos } from "@/lib/area-de-efeito";
import { disparoDoEfeito, disparosProntos, LIMITES_DO_DISPARO } from "@/lib/disparo-de-efeito";
import {
  copiaParaACampanha,
  definicaoDoEfeito,
  EFEITOS_PARA_A_FIGURA,
  urlDaImagemDaCampanha,
} from "@/lib/efeitos";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useCondicoesStore } from "@/lib/store/use-condicoes-store";
import { useCondicoesDoCompendioStore } from "@/lib/store/use-condicoes-do-compendio-store";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import { DECLARATIVO_VAZIO, type Declarativo } from "@/lib/sync/declarativo";
import { comum } from "@/lib/i18n/comum";
import { t } from "@/lib/i18n/mestre";
import { cn } from "@/lib/utils";
import { importAssets } from "@/lib/vault/assets";
import { vincularEfeitoDaCondicao } from "@/lib/vault/characters";
import { editarCondicaoDoCompendio } from "@/lib/vault/compendio";
import type { Condicao, PatchCondicao } from "@/types/character";
import type {
  AmbienteDoEfeito,
  AnimacaoDoEfeito,
  AreaDoEfeito,
  BaseDoEfeito,
  CamadaDoAmbiente,
  DefinicaoDeEfeito,
  DisparoDoEfeito,
  ExternoDoEfeito,
  FiguraDoEfeito,
  LuzDoEfeito,
  ParticulasDoEfeito,
  ProjetilDoDisparo,
  QuadrosDoEfeito,
} from "@/types/efeito";

// O boneco do card de condição no Compêndio, e não uma foto de token: a
// prévia mostra o EFEITO, e uma figura neutra, lisa e clara é onde a cor, o
// cinza e a transparência dele se leem sem a imagem de ninguém competindo.
import boneco from "./boneco-do-efeito.svg";

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
  lugar = "menu",
}: {
  modelo: Condicao;
  ocupado: boolean;
  onEditar: (patch: PatchCondicao) => void;
  /** Ausente = sem o "voltar": a tela é a janela da condição inteira. */
  onVoltar?: () => void;
  /**
   * De que lista é a condição. A do Compêndio ganha o efeito próprio também no
   * Compêndio, como molde, e não em jogo. Ver `useEfeitoDaCondicao`.
   */
  lugar?: "menu" | "compendio";
}) {
  const { efeito, mudar, renomear, temProprio } = useEfeitoDaCondicao(modelo, lugar);
  const [trocarPor, setTrocarPor] = useState<DefinicaoDeEfeito | null>(null);

  /** O efeito pronto como ponto de partida: a cópia dele, no lugar do atual. */
  function partirDe(pronto: DefinicaoDeEfeito) {
    mudar(daFigura(copiaParaACampanha(pronto, efeito.id, modelo.nome)));
  }

  return (
    <div className="space-y-3">
      {onVoltar ? (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onVoltar}>
          <ArrowLeft />
          {t.efeito.condicoes}
        </Button>
      ) : null}

      <FaixaDaPrevia>
        <Previa efeito={efeito} cor={modelo.cor} />
      </FaixaDaPrevia>

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
        {EFEITOS_PARA_A_FIGURA.map((pronto) => (
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

      <EditorDeEfeito efeito={efeito} onMudar={mudar} />

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
  rotuloDeVolta = t.efeito.efeitosEmArea,
}: {
  efeito: DefinicaoDeEfeito;
  /** Ausente = sem o "voltar": a tela é a janela do efeito inteira. */
  onVoltar?: () => void;
  /** Para onde o "voltar" leva. */
  rotuloDeVolta?: string;
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
    salvar(com({ ...copia, area: { ...copia.area, cor } }, "tags", efeito.tags));
  }

  return (
    <div className="space-y-3">
      {onVoltar ? (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onVoltar}>
          <ArrowLeft />
          {rotuloDeVolta}
        </Button>
      ) : null}

      <FaixaDaPrevia>
        <PreviaDaArea efeito={efeito} />
      </FaixaDaPrevia>

      <div className="space-y-1.5 rounded-md border p-2.5">
        <div className="flex items-center gap-2">
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
        <DescricaoDoEfeito dica={efeito.dica} onGravar={(dica) => salvar(com(efeito, "dica", dica))} />
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

      <AbasDasCamadas
        abas={[
          {
            id: "chao",
            titulo: t.efeito.chao,
            ligada: efeito.base !== undefined,
            conteudo: <SecaoDoChao base={efeito.base} onMudar={(base) => salvar(com(efeito, "base", base))} />,
          },
          {
            id: "elementos",
            titulo: t.efeito.elementos,
            ligada: efeito.area?.foco !== undefined,
            conteudo: (
              <SecaoDosElementos
                area={efeito.area ?? {}}
                onMudar={(area) => salvar({ ...efeito, area })}
              />
            ),
          },
          {
            id: "particulas",
            titulo: t.efeito.particulas,
            ligada: efeito.particulas !== undefined,
            conteudo: (
              <SecaoDasParticulas
                particulas={efeito.particulas}
                onMudar={(particulas) => salvar(com(efeito, "particulas", particulas))}
                descricao={t.efeito.particulasDaArea}
              />
            ),
          },
          {
            id: "luz",
            titulo: t.efeito.luz,
            ligada: efeito.luz !== undefined,
            conteudo: (
              <SecaoDaLuz
                luz={efeito.luz}
                onMudar={(luz) => salvar(com(efeito, "luz", luz))}
                descricao={t.efeito.luzDaArea}
              />
            ),
          },
        ]}
      />

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

/**
 * A tela de um EFEITO DE PERSONAGEM solto: o que acontece com a figura, sem
 * condição em volta. Abre no Compêndio, onde o efeito é molde.
 *
 * O avesso da `TelaDaCondicao`: lá o efeito é da condição e leva o nome dela;
 * aqui ele tem nome próprio, e é a condição que o escolhe depois. A prévia
 * pinta na cor de quem o usa -- `cor` --, porque é nela que ele vai aparecer.
 */
export function TelaDoEfeitoDePersonagem({
  efeito,
  cor,
  onVoltar,
  rotuloDeVolta,
}: {
  efeito: DefinicaoDeEfeito;
  cor: string;
  /** Ausente = sem o "voltar": a tela é a janela do efeito inteira. */
  onVoltar?: () => void;
  rotuloDeVolta?: string;
}) {
  const salvar = useEfeitosDaCampanhaStore((state) => state.salvar);
  const [trocarPor, setTrocarPor] = useState<DefinicaoDeEfeito | null>(null);
  const temCamadas = Boolean(
    efeito.figura || efeito.externo || efeito.interno || efeito.particulas || efeito.luz,
  );

  function partirDe(pronto: DefinicaoDeEfeito) {
    salvar(daFigura(com(copiaParaACampanha(pronto, efeito.id, efeito.titulo), "tags", efeito.tags)));
  }

  return (
    <div className="space-y-3">
      {onVoltar ? (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onVoltar}>
          <ArrowLeft />
          {rotuloDeVolta}
        </Button>
      ) : null}

      <FaixaDaPrevia>
        <Previa efeito={efeito} cor={cor} />
      </FaixaDaPrevia>

      <div className="flex items-center gap-2 rounded-md border p-2.5">
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
        {EFEITOS_PARA_A_FIGURA.map((pronto) => (
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

      <EditorDeEfeito efeito={efeito} onMudar={salvar} />

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
              {t.efeito.trocarNoEfeito(efeito.titulo)}
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
/**
 * A tela de um DISPARO da campanha: o tiro que sai de um ponto e vai até outro.
 * Abre pela engrenagem da lista (Efeitos, Disparo) e pelo card no Compêndio.
 *
 * A terceira tela, ao lado da da condição e da do efeito em área, e com abas
 * que são do tiro: o trajeto primeiro, que é o que separa um disparo do outro,
 * e depois só as camadas que a forma escolhida desenha -- a linha tem
 * projétil e rastro, e estouro se estourar; o cone tem chão, elementos e
 * partículas. A cor mora em `area.cor`, como na área: o cone e o estouro são
 * áreas que o tiro abre. Ver `DisparoDoEfeito`.
 */
export function TelaDoDisparo({
  efeito,
  onVoltar,
  rotuloDeVolta = t.efeito.disparos,
}: {
  efeito: DefinicaoDeEfeito;
  /** Ausente = sem o "voltar": a tela é a janela do efeito inteira. */
  onVoltar?: () => void;
  rotuloDeVolta?: string;
}) {
  const salvar = useEfeitosDaCampanhaStore((state) => state.salvar);
  const deFora = useDeclarativoStore((state) => state.efeitos);
  const [trocarPor, setTrocarPor] = useState<DefinicaoDeEfeito | null>(null);
  const cor = efeito.area?.cor ?? COR_DA_AREA;
  const disparo: DisparoDoEfeito = efeito.disparo ?? { forma: "linha" };
  const { forma, impacto } = disparoDoEfeito(efeito);
  const temCamadas = Boolean(
    efeito.base || efeito.area?.foco || efeito.particulas || efeito.disparo?.projetil,
  );

  /**
   * O pronto inteiro, COM a cor dele: partir da "Bola de fogo" é querer o fogo
   * laranja, e a cor sorteada do disparo novo o pintaria de roxo. O nome e as
   * tags ficam os deste.
   */
  function partirDe(pronto: DefinicaoDeEfeito) {
    salvar(com(copiaParaACampanha(pronto, efeito.id, efeito.titulo), "tags", efeito.tags));
  }

  const mudarDisparo = (novo: DisparoDoEfeito) => salvar({ ...efeito, disparo: novo });
  const abaDoTrajeto = {
    id: "trajeto",
    titulo: t.efeito.trajeto,
    ligada: true,
    conteudo: <SecaoDoTrajeto disparo={disparo} onMudar={mudarDisparo} />,
  };
  const chao = {
    id: "chao",
    titulo: t.efeito.chao,
    ligada: efeito.base !== undefined,
    conteudo: (
      <SecaoDoChao
        base={efeito.base}
        onMudar={(base) => salvar(com(efeito, "base", base))}
        descricao={t.efeito.chaoDoDisparo}
      />
    ),
  };
  const elementos = {
    id: "elementos",
    titulo: t.efeito.elementos,
    ligada: efeito.area?.foco !== undefined,
    conteudo: (
      <SecaoDosElementos
        area={efeito.area ?? {}}
        onMudar={(area) => salvar({ ...efeito, area })}
        descricao={t.efeito.elementosDoDisparo}
      />
    ),
  };
  const particulas = (descricao: string, titulo: string, id: string) => ({
    id,
    titulo,
    ligada: efeito.particulas !== undefined,
    conteudo: (
      <SecaoDasParticulas
        particulas={efeito.particulas}
        onMudar={(novas) => salvar(com(efeito, "particulas", novas))}
        descricao={descricao}
      />
    ),
  });

  const abas =
    forma === "cone"
      ? [abaDoTrajeto, chao, elementos, particulas(t.efeito.particulasDoCone, t.efeito.particulas, "particulas")]
      : [
          abaDoTrajeto,
          {
            id: "projetil",
            titulo: t.efeito.projetil,
            ligada: true,
            conteudo: <SecaoDoProjetil disparo={disparo} onMudar={mudarDisparo} />,
          },
          {
            id: "rastro",
            titulo: t.efeito.rastro,
            ligada: disparoDoEfeito(efeito).rastro || efeito.particulas !== undefined,
            conteudo: (
              <div className="space-y-2">
                <div className="rounded-md border p-2.5">
                  <Interruptor
                    rotulo={t.efeito.faixaDoRastro}
                    dica={t.efeito.faixaDoRastroDica}
                    valor={disparoDoEfeito(efeito).rastro}
                    onMudar={(v) => mudarDisparo(com(disparo, "rastro", v ? undefined : false))}
                  />
                </div>
                <SecaoDasParticulas
                  particulas={efeito.particulas}
                  onMudar={(novas) => salvar(com(efeito, "particulas", novas))}
                  descricao={t.efeito.particulasDoRastro}
                />
              </div>
            ),
          },
          // O chão e os elementos são os do estouro: a descrição de cada um diz.
          ...(impacto > 0 ? [chao, elementos] : []),
        ];

  return (
    <div className="space-y-3">
      {onVoltar ? (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onVoltar}>
          <ArrowLeft />
          {rotuloDeVolta}
        </Button>
      ) : null}

      <FaixaDaPrevia>
        <PreviaDoDisparo efeito={efeito} />
      </FaixaDaPrevia>

      <div className="space-y-1.5 rounded-md border p-2.5">
        <div className="flex items-center gap-2">
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
        <DescricaoDoEfeito dica={efeito.dica} onGravar={(dica) => salvar(com(efeito, "dica", dica))} />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground mr-1 text-[11px]">{t.efeito.partirDeDisparoPronto}</span>
        {disparosProntos(deFora).map((pronto) => (
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

      {/* Uma chave por forma: trocar de linha para cone troca as abas, e a
          aberta numa que sumiu voltaria a ela sozinha se sobrevivesse. */}
      <AbasDasCamadas key={forma === "cone" ? "cone" : "linha"} abas={abas} />

      <AlertDialog
        open={trocarPor !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setTrocarPor(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.efeito.trocarPelo(trocarPor?.titulo ?? "")}</AlertDialogTitle>
            <AlertDialogDescription>{t.efeito.trocarNoEfeito(efeito.titulo)}</AlertDialogDescription>
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
 * A tela de um AMBIENTE: o clima que cobre a cena inteira -- a chuva, a neve,
 * a neblina. Abre pelo card dele no Compêndio, que é onde ele mora: a cena
 * aponta para o molde, sem cópia em jogo, e mexer aqui muda a chuva da mesa
 * enquanto o controle anda. Ver `AmbienteDoEfeito`.
 *
 * As abas são as camadas, uma por textura que desliza, e depois o véu e o
 * relâmpago. A cor do ambiente pinta as camadas que pedem e o véu sem cor
 * própria.
 */
export function TelaDoAmbiente({ efeito }: { efeito: DefinicaoDeEfeito }) {
  const salvar = useEfeitosDaCampanhaStore((state) => state.salvar);
  const deFora = useDeclarativoStore((state) => state.efeitos);
  const [trocarPor, setTrocarPor] = useState<DefinicaoDeEfeito | null>(null);
  const ambiente: AmbienteDoEfeito = efeito.ambiente ?? { camadas: [] };
  const camadas = ambiente.camadas ?? [];
  const cor = ambiente.cor ?? COR_DO_AMBIENTE;
  const temCamadas = camadas.length > 0 || Boolean(ambiente.veu || ambiente.relampago);

  // O pronto inteiro, com a cor dele, como no disparo: o nome e as tags ficam.
  function partirDe(pronto: DefinicaoDeEfeito) {
    salvar(com(copiaParaACampanha(pronto, efeito.id, efeito.titulo), "tags", efeito.tags));
  }

  const mudar = (novo: AmbienteDoEfeito) => salvar({ ...efeito, ambiente: novo });
  const mudarCamada = (indice: number, camada: CamadaDoAmbiente | undefined) =>
    mudar({
      ...ambiente,
      camadas: camada
        ? camadas.map((atual, i) => (i === indice ? camada : atual))
        : camadas.filter((_, i) => i !== indice),
    });
  // A nova vai na frente, e começa como a de trás, que é o que se costuma
  // querer: a mesma textura, maior e mais rápida.
  const acrescentar = () => {
    const ultima = camadas[camadas.length - 1];
    mudar({
      ...ambiente,
      camadas: [
        ...camadas,
        ultima
          ? {
              ...ultima,
              escala: Math.min(LIMITES_DO_AMBIENTE.escala.max, (ultima.escala ?? 0.5) * 1.6),
              velocidade: Math.min(LIMITES_DO_AMBIENTE.velocidade.max, (ultima.velocidade ?? 1) * 1.4),
            }
          : { imagem: "", cores: "condicao" },
      ],
    });
  };

  const abas = [
    ...camadas.map((camada, indice) => ({
      id: `camada-${indice}`,
      titulo: t.efeito.camada(indice + 1),
      ligada: Boolean(camada.imagem),
      conteudo: (
        <SecaoDaCamada camada={camada} onMudar={(nova) => mudarCamada(indice, nova)} />
      ),
    })),
    {
      id: "veu",
      titulo: t.efeito.veu,
      ligada: ambiente.veu !== undefined,
      conteudo: (
        <SecaoDoVeu veu={ambiente.veu} cor={cor} onMudar={(veu) => mudar(com(ambiente, "veu", veu))} />
      ),
    },
    {
      id: "relampago",
      titulo: t.efeito.relampago,
      ligada: ambiente.relampago !== undefined,
      conteudo: (
        <SecaoDoRelampago
          relampago={ambiente.relampago}
          onMudar={(relampago) => mudar(com(ambiente, "relampago", relampago))}
        />
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <FaixaDaPrevia>
        <div
          className="relative w-full overflow-hidden rounded-md bg-gradient-to-b from-slate-600 to-neutral-900"
          style={{ height: ALTURA_DA_PREVIA }}
        >
          <ClimaNoCartao efeito={efeito} />
        </div>
      </FaixaDaPrevia>

      <div className="space-y-1.5 rounded-md border p-2.5">
        <div className="flex items-center gap-2">
          <CorDoEfeito cor={cor} onMudar={(nova) => mudar({ ...ambiente, cor: nova })} />
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
        <DescricaoDoEfeito dica={efeito.dica} onGravar={(dica) => salvar(com(efeito, "dica", dica))} />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground mr-1 text-[11px]">{t.efeito.partirDeAmbientePronto}</span>
        {ambientesProntos(deFora).map((pronto) => (
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

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px]"
          title={t.efeito.acrescentarCamadaDica}
          disabled={camadas.length >= LIMITES_DO_AMBIENTE.camadas}
          onClick={acrescentar}
        >
          <Plus />
          {t.efeito.acrescentarCamada}
        </Button>
      </div>

      {/* Uma chave pelo número de camadas: a aba aberta numa camada que saiu
          voltaria a ela sozinha se sobrevivesse. */}
      <AbasDasCamadas key={camadas.length} abas={abas} />

      <AlertDialog
        open={trocarPor !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setTrocarPor(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.efeito.trocarPelo(trocarPor?.titulo ?? "")}</AlertDialogTitle>
            <AlertDialogDescription>{t.efeito.trocarNoEfeito(efeito.titulo)}</AlertDialogDescription>
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
 * Uma CAMADA do ambiente: a textura, para onde ela vai e com que pressa. A
 * direção aparece como o mestre a pensa -- "cai, inclinada para a direita" --,
 * e não em graus. Ver `CamadaDoAmbiente`.
 */
function SecaoDaCamada({
  camada,
  onMudar,
}: {
  camada: CamadaDoAmbiente;
  onMudar: (camada: CamadaDoAmbiente | undefined) => void;
}) {
  const mudar = <K extends keyof CamadaDoAmbiente>(chave: K, valor: CamadaDoAmbiente[K] | undefined) =>
    onMudar(com(camada, chave, valor));
  const { sentido, inclinacao } = sentidoDaDirecao(camada.direcao ?? 90);
  const mudarDirecao = (novoSentido: SentidoDaCamada, novaInclinacao: number) => {
    const direcao = direcaoDoSentido(novoSentido, novaInclinacao);
    mudar("direcao", direcao === 90 ? undefined : direcao);
  };
  const { escala, velocidade, balanco } = LIMITES_DO_AMBIENTE;

  return (
    <Secao titulo={t.efeito.textura} descricao={t.efeito.camadaDescricao}>
      <ImagemDoAcervo
        rotulo={t.efeito.textura}
        dica={t.efeito.texturaDaCamadaDica}
        assetId={camada.imagem || undefined}
        onMudar={(id) => onMudar(com(com(camada, "mipmaps", undefined), "imagem", id ?? ""))}
      />
      <Faixa
        rotulo={t.efeito.tamanhoNaTela}
        valor={camada.escala ?? escala.padrao}
        min={escala.min}
        max={escala.max}
        passo={0.05}
        porcento
        onMudar={(v) => mudar("escala", v === escala.padrao ? undefined : v)}
      />
      <Escolha<SentidoDaCamada>
        rotulo={t.efeito.vaiPara}
        valor={sentido}
        opcoes={[
          { valor: "baixo", rotulo: t.efeito.paraBaixo },
          { valor: "cima", rotulo: t.efeito.paraCima },
          { valor: "direita", rotulo: t.efeito.paraDireita },
          { valor: "esquerda", rotulo: t.efeito.paraEsquerda },
        ]}
        onMudar={(novo) => mudarDirecao(novo, inclinacao)}
      />
      <Faixa
        rotulo={t.efeito.inclinacao}
        valor={inclinacao}
        min={-45}
        max={45}
        passo={1}
        sufixo="°"
        onMudar={(v) => mudarDirecao(sentido, v)}
      />
      <Faixa
        rotulo={t.efeito.velocidade}
        valor={camada.velocidade ?? velocidade.padrao}
        min={velocidade.min}
        max={velocidade.max}
        passo={0.01}
        sufixo={t.efeito.sufixoTelasPorSegundo}
        onMudar={(v) => mudar("velocidade", v === velocidade.padrao ? undefined : v)}
      />
      <Faixa
        rotulo={t.efeito.balanco}
        valor={camada.balanco ?? 0}
        min={balanco.min}
        max={balanco.max}
        passo={0.01}
        porcento
        onMudar={(v) => mudar("balanco", v > 0 ? v : undefined)}
      />
      <Faixa
        rotulo={t.efeito.opacidade}
        valor={camada.opacidade ?? 1}
        min={0.05}
        max={1}
        passo={0.05}
        porcento
        onMudar={(v) => mudar("opacidade", v >= 1 ? undefined : v)}
      />
      <Interruptor
        rotulo={t.efeito.pintarNaCorDoAmbiente}
        dica={t.efeito.pintarCamadaDica}
        valor={camada.cores === "condicao"}
        onMudar={(v) => mudar("cores", v ? "condicao" : undefined)}
      />
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive h-6 px-2 text-[11px]"
          onClick={() => onMudar(undefined)}
        >
          <Trash2 />
          {t.efeito.tirarCamada}
        </Button>
      </div>
    </Secao>
  );
}

/** O VÉU do ambiente: uma cor parada sobre a tela inteira. */
function SecaoDoVeu({
  veu,
  cor,
  onMudar,
}: {
  veu: AmbienteDoEfeito["veu"];
  /** A cor do ambiente, que é a do véu sem cor própria. */
  cor: string;
  onMudar: (veu: AmbienteDoEfeito["veu"]) => void;
}) {
  const v = veu ?? { opacidade: 0.15 };

  return (
    <Secao
      titulo={t.efeito.veu}
      descricao={t.efeito.veuDescricao}
      ligado={veu !== undefined}
      onLigar={(ligado) => onMudar(ligado ? { opacidade: 0.15 } : undefined)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">{t.efeito.cor}</span>
        <CorDoEfeito cor={v.cor ?? cor} onMudar={(nova) => onMudar({ ...v, cor: nova })} />
      </div>
      <Faixa
        rotulo={t.efeito.opacidade}
        valor={v.opacidade}
        min={LIMITES_DO_AMBIENTE.veu.min}
        max={LIMITES_DO_AMBIENTE.veu.max}
        passo={0.01}
        porcento
        onMudar={(opacidade) => onMudar({ ...v, opacidade })}
      />
    </Secao>
  );
}

/** O RELÂMPAGO do ambiente: o clarão de tempos em tempos. */
function SecaoDoRelampago({
  relampago,
  onMudar,
}: {
  relampago: AmbienteDoEfeito["relampago"];
  onMudar: (relampago: AmbienteDoEfeito["relampago"]) => void;
}) {
  const r = relampago ?? {};
  const { intervalo, forca } = LIMITES_DO_AMBIENTE;

  return (
    <Secao
      titulo={t.efeito.relampago}
      descricao={t.efeito.relampagoDescricao}
      ligado={relampago !== undefined}
      onLigar={(ligado) => onMudar(ligado ? {} : undefined)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">{t.efeito.cor}</span>
        <CorDoEfeito cor={r.cor ?? COR_DO_RELAMPAGO} onMudar={(nova) => onMudar({ ...r, cor: nova })} />
      </div>
      <Faixa
        rotulo={t.efeito.intervalo}
        valor={r.intervalo ?? intervalo.padrao}
        min={intervalo.min}
        max={intervalo.max}
        passo={1}
        sufixo={t.efeito.sufixoSegundos}
        onMudar={(v) => onMudar(com(r, "intervalo", v === intervalo.padrao ? undefined : v))}
      />
      <Faixa
        rotulo={t.efeito.forca}
        valor={r.forca ?? forca.padrao}
        min={0.05}
        max={1}
        passo={0.05}
        porcento
        onMudar={(v) => onMudar(com(r, "forca", v === forca.padrao ? undefined : v))}
      />
    </Secao>
  );
}

/** O teto da descrição: uma linha embaixo do seletor. Espelho de `MAX_DICA`, no Rust. */
const MAX_DICA = 120;

/**
 * A DESCRIÇÃO do efeito, embaixo do nome: o que ele é, em uma linha -- a que o
 * card do Compêndio mostra embaixo do nome, e a dica do menu do Disparo e do
 * gizmo da área. Editada no lugar, como o nome: o texto vira campo no clique,
 * o Enter ou sair do campo grava, o Esc desiste. Vazia, o efeito fica sem
 * descrição -- o Rust apaga a dica em branco.
 */
function DescricaoDoEfeito({
  dica,
  onGravar,
}: {
  dica: string | undefined;
  onGravar: (dica: string | undefined) => void;
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  // O Esc MARCA, e o `blur` que ele provoca lê a marca -- a razão do nome.
  const descartar = useRef(false);

  function gravar() {
    const lido = descartar.current ? null : rascunho;
    descartar.current = false;
    setRascunho(null);
    if (lido === null) return;

    // Uma linha: a quebra que o colar trouxe vira espaço.
    const limpo = lido.replace(/\s+/g, " ").trim();
    if (limpo === (dica ?? "")) return;
    onGravar(limpo || undefined);
  }

  if (rascunho !== null) {
    return (
      <div className="space-y-0.5">
        <Textarea
          autoFocus
          aria-label={t.efeito.descricao}
          value={rascunho}
          maxLength={MAX_DICA}
          rows={2}
          placeholder={t.efeito.descricaoPlaceholder}
          className="min-h-0 resize-none rounded-md px-1.5 py-1 text-xs md:text-xs"
          onFocus={(evento) => evento.currentTarget.select()}
          onChange={(evento) => setRascunho(evento.target.value)}
          onBlur={gravar}
          onKeyDown={(evento) => {
            if (evento.key === "Escape") descartar.current = true;
            if ((evento.key === "Enter" && !evento.shiftKey) || evento.key === "Escape") {
              evento.preventDefault();
              evento.currentTarget.blur();
            }
          }}
        />
        <p className="text-muted-foreground text-right text-[10px] tabular-nums">
          {rascunho.length}/{MAX_DICA}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={t.efeito.editarDescricao}
      title={t.efeito.editarDescricao}
      className="group text-muted-foreground hover:text-foreground flex w-full items-start gap-1 rounded-sm text-left text-[11px] leading-snug"
      onClick={() => setRascunho(dica ?? "")}
    >
      <span className={cn("min-w-0 flex-1", !dica && "italic opacity-70")}>
        {dica || t.efeito.semDescricao}
      </span>
      <Pencil className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  );
}

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
 * A prévia de um efeito em área: um pedaço de chão de seis casas por três,
 * com a área deitada na metade de baixo -- o mesmo enquadramento do card no
 * Compêndio, em que a chama sobe inteira em vez de sair cortada pelo topo.
 * Desenhada como a mesa a vê. A definição é a DA TELA, por um declarativo só
 * dela, como na prévia da condição.
 */
const MUNDO_DA_PREVIA = { largura: 576, altura: 288 };
const AREA_DA_PREVIA = { x: 0, y: 144, width: 576, height: 144 };
function PreviaDaArea({ efeito }: { efeito: DefinicaoDeEfeito }) {
  const declarativo = useMemo<Declarativo>(
    () => ({
      ...DECLARATIVO_VAZIO,
      efeitos: { [efeito.id]: { ...efeito, origem: { acervo: true } } },
    }),
    [efeito],
  );
  const area = useMemo(
    () => [{ id: "previa-da-area", ...AREA_DA_PREVIA, efeito: efeito.id, naMesa: true }],
    [efeito.id],
  );

  return (
    <div
      className="relative w-full overflow-hidden rounded-md bg-neutral-900"
      style={{ height: ALTURA_DA_PREVIA }}
    >
      {/* No meio da faixa, e na escala que põe o chão inteiro na altura dela.
          A faixa mais larga que isso só mostra mais do escuro dos lados. */}
      <div
        className="absolute top-0 left-1/2"
        style={{
          width: MUNDO_DA_PREVIA.largura,
          height: MUNDO_DA_PREVIA.altura,
          transform: `translateX(-50%) scale(${ALTURA_DA_PREVIA / MUNDO_DA_PREVIA.altura})`,
          transformOrigin: "top center",
        }}
      >
        <DeclarativoProvider valor={declarativo}>
          <AreaDeEfeitoLayer areas={area} grid={undefined} variant="mesa" />
        </DeclarativoProvider>
      </div>
    </div>
  );
}

/**
 * A prévia do TIRO, no mesmo pedaço de chão da prévia da área: a linha voando
 * da esquerda e estourando, ou o leque se abrindo, em laço. Ver `TiroEmLaco`.
 */
// O alvo longe da borda direita, para o estouro grande caber inteiro.
const LINHA_DA_PREVIA = { de: { x: 48, y: 190 }, para: { x: 400, y: 190 } };
const CONE_DA_PREVIA = { de: { x: 64, y: 150 }, para: { x: 448, y: 150 } };
function PreviaDoDisparo({ efeito }: { efeito: DefinicaoDeEfeito }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-md bg-neutral-900"
      style={{ height: ALTURA_DA_PREVIA }}
    >
      <div
        className="absolute top-0 left-1/2"
        style={{
          width: MUNDO_DA_PREVIA.largura,
          height: MUNDO_DA_PREVIA.altura,
          transform: `translateX(-50%) scale(${ALTURA_DA_PREVIA / MUNDO_DA_PREVIA.altura})`,
          transformOrigin: "top center",
        }}
      >
        <TiroEmLaco efeito={efeito} linha={LINHA_DA_PREVIA} cone={CONE_DA_PREVIA} />
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
 *
 * A condição do COMPÊNDIO faz o mesmo do lado de lá: o efeito novo nasce
 * molde, fora dos trinta e dois, e a ligação é só na biblioteca -- nenhuma
 * ficha está com uma condição que não está no menu. Ele entra em jogo junto
 * com ela. Ver `compendio::condicao_no_menu`.
 */
function useEfeitoDaCondicao(modelo: Condicao, lugar: "menu" | "compendio") {
  const efeitos = useEfeitosDaCampanhaStore((state) => state.efeitos);
  const moldes = useEfeitosDaCampanhaStore((state) => state.moldes);
  const criar = useEfeitosDaCampanhaStore((state) => state.criar);
  const criarMolde = useEfeitosDaCampanhaStore((state) => state.criarMolde);
  const salvar = useEfeitosDaCampanhaStore((state) => state.salvar);
  const deFora = useDeclarativoStore((state) => state.efeitos);
  const recarregarCondicoes = useCondicoesStore((state) => state.recarregar);
  const recarregarPersonagens = useCharactersStore((state) => state.recarregar);
  const [rascunho, setRascunho] = useState<DefinicaoDeEfeito | null>(null);
  const criando = useRef<Promise<string | null> | null>(null);
  const ultimo = useRef<DefinicaoDeEfeito | null>(null);

  // Nas duas listas: a condição do Compêndio pode apontar para um efeito em
  // jogo, e a do menu, por um instante, para um que ainda não entrou.
  const proprio = modelo.efeito?.startsWith("campanha/")
    ? (efeitos?.find((efeito) => efeito.id === modelo.efeito) ??
      moldes?.find((efeito) => efeito.id === modelo.efeito))
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
      const criado = lugar === "compendio" ? await criarMolde() : await criar();
      if (!criado) return null;

      try {
        if (lugar === "compendio") {
          await editarCondicaoDoCompendio(modelo.id, { efeito: criado.id });
        } else {
          await vincularEfeitoDaCondicao(modelo.id, criado.id);
        }
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : t.efeito.falhaAoLigar);
      }
      if (lugar === "compendio") {
        useCondicoesDoCompendioStore.getState().recarregar();
      } else {
        recarregarCondicoes();
        recarregarPersonagens();
      }
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
export function daFigura(efeito: DefinicaoDeEfeito): DefinicaoDeEfeito {
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

/**
 * As camadas de um efeito de figura, uma embaixo da outra. Sem a prévia: ela
 * fica no alto da tela, presa enquanto as camadas rolam -- ver `FaixaDaPrevia`.
 */
function EditorDeEfeito({
  efeito,
  onMudar,
}: {
  efeito: DefinicaoDeEfeito;
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
    <AbasDasCamadas
      abas={[
        {
          id: "figura",
          titulo: t.efeito.naFigura,
          ligada: Object.keys(figura).length > 0,
          conteudo: (
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
          ),
        },
        {
          id: "externo",
          titulo: t.efeito.imagemEmVolta,
          ligada: efeito.externo !== undefined,
          conteudo: <SecaoDoExterno externo={efeito.externo} onMudar={(externo) => mudar("externo", externo)} />,
        },
        {
          id: "particulas",
          titulo: t.efeito.particulas,
          ligada: efeito.particulas !== undefined,
          conteudo: <SecaoDasParticulas particulas={efeito.particulas} onMudar={(p) => mudar("particulas", p)} />,
        },
        {
          id: "luz",
          titulo: t.efeito.luz,
          ligada: efeito.luz !== undefined,
          conteudo: <SecaoDaLuz luz={efeito.luz} onMudar={(luz) => mudar("luz", luz)} />,
        },
      ]}
    />
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
  descricao = t.efeito.chaoDescricao,
}: {
  base: BaseDoEfeito | undefined;
  onMudar: (base: BaseDoEfeito | undefined) => void;
  /** O texto da seção: o chão da área, ou o do cone e do estouro de um disparo. */
  descricao?: string;
}) {
  const b = base ?? { imagem: "" };
  const mudar = <K extends keyof BaseDoEfeito>(chave: K, valor: BaseDoEfeito[K] | undefined) =>
    onMudar(com(b, chave, valor));

  return (
    <Secao
      titulo={t.efeito.chao}
      descricao={descricao}
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
  descricao = t.efeito.elementosDescricao,
}: {
  area: AreaDoEfeito;
  onMudar: (area: AreaDoEfeito) => void;
  /** O texto da seção: os elementos da área, ou os do cone e do estouro. */
  descricao?: string;
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
      descricao={descricao}
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

/** As três formas de um disparo como o mestre as lê: a forma, e se a linha estoura. */
type FormaNoEditor = "reto" | "estouro" | "cone";

/**
 * O TRAJETO de um disparo: a forma e os números dela, em casas. Três formas, e
 * não duas: a linha que só chega e a que estoura no alvo são tiros diferentes
 * para quem joga -- a flecha e a bola de fogo --, embora sejam a mesma linha
 * com e sem `impacto`. Ver `DisparoDoEfeito`.
 */
function SecaoDoTrajeto({
  disparo,
  onMudar,
}: {
  disparo: DisparoDoEfeito;
  onMudar: (disparo: DisparoDoEfeito) => void;
}) {
  const resolvido = disparoDoEfeito({ id: "", titulo: "", disparo });
  const mudar = (patch: Partial<DisparoDoEfeito>) => onMudar({ ...disparo, ...patch });
  const forma: FormaNoEditor =
    resolvido.forma === "cone" ? "cone" : resolvido.impacto > 0 ? "estouro" : "reto";
  const { abertura, velocidade, alcance, impacto } = LIMITES_DO_DISPARO;

  return (
    <Secao titulo={t.efeito.trajeto} descricao={t.efeito.trajetoDescricao}>
      <Escolha
        rotulo={t.efeito.formaDoDisparo}
        valor={forma}
        opcoes={[
          { valor: "reto", rotulo: t.efeito.reto },
          { valor: "estouro", rotulo: t.efeito.comEstouro },
          { valor: "cone", rotulo: t.efeito.emCone },
        ]}
        onMudar={(nova) =>
          mudar(
            nova === "cone"
              ? { forma: "cone" }
              : nova === "reto"
                ? { forma: "linha", impacto: 0 }
                : { forma: "linha", impacto: resolvido.impacto > 0 ? resolvido.impacto : 1 },
          )
        }
      />
      {forma === "cone" ? (
        <Faixa rotulo={t.efeito.abertura} valor={resolvido.abertura} min={abertura[0]} max={abertura[1]} passo={5} sufixo="°" onMudar={(v) => mudar({ abertura: v })} />
      ) : null}
      {forma === "estouro" ? (
        <Faixa rotulo={t.efeito.estouro} valor={resolvido.impacto} min={0.25} max={impacto[1]} passo={0.25} sufixo={t.efeito.sufixoCasas} onMudar={(v) => mudar({ impacto: v })} />
      ) : null}
      <Faixa rotulo={t.efeito.velocidade} valor={resolvido.velocidade} min={velocidade[0]} max={velocidade[1]} passo={1} sufixo={t.efeito.sufixoCasasPorSegundo} onMudar={(v) => mudar({ velocidade: v })} />
      <Faixa rotulo={t.efeito.alcancePeloOlhar} valor={resolvido.alcance} min={alcance[0]} max={alcance[1]} passo={1} sufixo={t.efeito.sufixoCasas} onMudar={(v) => mudar({ alcance: v })} />
      <p className="text-muted-foreground text-[10px] leading-snug">{t.efeito.alcancePeloOlharDica}</p>
    </Secao>
  );
}

/**
 * O PROJÉTIL de um disparo em linha: a imagem que voa, o tamanho, como ela se
 * deita no voo e o brilho em volta. Sem imagem própria, voa o elemento do
 * estouro, de topo para trás -- a chama vira cauda. Ver `ProjetilDoDisparo`.
 */
function SecaoDoProjetil({
  disparo,
  onMudar,
}: {
  disparo: DisparoDoEfeito;
  onMudar: (disparo: DisparoDoEfeito) => void;
}) {
  const resolvido = disparoDoEfeito({ id: "", titulo: "", disparo });
  const projetil = disparo.projetil ?? { imagem: "" };
  const mudarProjetil = <K extends keyof ProjetilDoDisparo>(chave: K, valor: ProjetilDoDisparo[K] | undefined) =>
    onMudar({ ...disparo, projetil: com(projetil, chave, valor) });
  const { tamanho } = LIMITES_DO_DISPARO;

  return (
    <Secao titulo={t.efeito.projetil} descricao={t.efeito.projetilDescricao}>
      <ImagemDoAcervo
        rotulo={t.efeito.imagem}
        dica={t.efeito.projetilDica}
        assetId={projetil.imagem || undefined}
        onMudar={(id) =>
          onMudar(
            id
              ? { ...disparo, projetil: com(com(projetil, "mipmaps", undefined), "imagem", id) }
              : com(disparo, "projetil", undefined),
          )
        }
      />
      {disparo.projetil ? (
        <>
          <Quadros
            quadros={projetil.quadros}
            onMudar={(q) => mudarProjetil("quadros", q as QuadrosDoEfeito | undefined)}
            comFps
          />
          <Interruptor
            rotulo={t.efeito.pintarNaCorDoEfeito}
            valor={projetil.cores === "condicao"}
            onMudar={(v) => mudarProjetil("cores", v ? "condicao" : undefined)}
          />
          <Escolha
            rotulo={t.efeito.comoVoa}
            valor={String(projetil.giro ?? 0)}
            opcoes={[
              { valor: "0", rotulo: t.efeito.comoEsta },
              { valor: "90", rotulo: t.efeito.topoNaFrente },
              { valor: "-90", rotulo: t.efeito.topoAtras },
            ]}
            onMudar={(v) => mudarProjetil("giro", v === "0" ? undefined : Number(v))}
          />
        </>
      ) : null}
      <Faixa rotulo={t.efeito.tamanhoDoProjetil} valor={resolvido.tamanho} min={tamanho[0]} max={tamanho[1]} passo={0.1} sufixo={t.efeito.sufixoCasas} onMudar={(v) => onMudar({ ...disparo, tamanho: v })} />
      <Interruptor
        rotulo={t.efeito.brilhoEmVolta}
        valor={resolvido.brilho}
        onMudar={(v) => onMudar(com(disparo, "brilho", v ? undefined : false))}
      />
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
 * A altura das duas prévias, a da figura e a da área: uma faixa, e não um
 * quadrado. Era um quadrado numa coluna de lado, e embaixo dele sobrava um
 * vazio do tamanho das camadas da outra coluna.
 */
const ALTURA_DA_PREVIA = 192;

/**
 * A prévia presa no alto da tela enquanto as camadas rolam: mexer na luz, lá
 * embaixo, tem de mostrar a luz mudando. Opaca por conta própria -- a janela
 * flutuante e a atracada têm fundos diferentes, e o que passa por baixo não
 * pode aparecer.
 */
function FaixaDaPrevia({ children }: { children: ReactNode }) {
  return <div className="sticky top-0 z-10 shadow-[0_6px_12px_-6px_rgb(0_0_0/0.6)]">{children}</div>;
}

/**
 * O efeito no boneco de amostra, sobre o escuro do mapa à noite. O mesmo
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
    <div
      className="relative w-full overflow-hidden rounded-md bg-neutral-950"
      style={{ height: ALTURA_DA_PREVIA }}
    >
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
        {/* A sombra no chão, como no card: é ela que põe o boneco de pé. */}
        <span
          aria-hidden
          className="absolute -bottom-1.5 left-1/2 h-3 w-4/5 -translate-x-1/2 rounded-full bg-black/45 blur-[3px]"
        />
        {/* Um declarativo só com este efeito: é por ele que o
            `FiguraComEfeitos` acha a definição, como no palco. */}
        <DeclarativoProvider valor={declarativo}>
          <FiguraComEfeitos
            efeitos={pedidos}
            url={boneco.src}
            semente="previa-do-efeito"
            alcance={{ livre: true, largura: lado }}
          >
            {(fonte) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fonte ?? boneco.src}
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

/**
 * As camadas do efeito em ABAS, deitadas: uma camada à vista por vez. Em pé,
 * abertas, eram uma parede de deslizadores; em pé e fechadas, uma lista de
 * gavetas que o mestre abria e fechava para achar a próxima. A aba diz se a
 * camada está ligada -- o ponto ao lado do nome --, e é isso que responde, de
 * relance, "que camadas este efeito tem?".
 */
function AbasDasCamadas({
  abas,
}: {
  abas: Array<{ id: string; titulo: string; ligada: boolean; conteudo: ReactNode }>;
}) {
  const [ativa, setAtiva] = useState(abas[0]?.id ?? "");
  const aberta = abas.find((aba) => aba.id === ativa) ?? abas[0];

  return (
    <div className="space-y-2">
      <Tabs
        value={aberta?.id}
        onValueChange={(valor) => setAtiva(String(valor))}
      >
        <TabsList variant="line" className="w-full">
          {abas.map((aba) => (
            <TabsTrigger key={aba.id} value={aba.id} className="min-w-0 flex-1 gap-1.5 px-1 text-xs">
              <span className="truncate">{aba.titulo}</span>
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  aba.ligada ? "bg-emerald-500" : "bg-muted-foreground/30",
                )}
              />
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {aberta?.conteudo}
    </div>
  );
}

/**
 * O painel de uma camada, dentro da aba dela: o que ela faz, o interruptor,
 * e os controles quando ligada. O nome está na aba; aqui ele é só o rótulo do
 * interruptor para o leitor de tela.
 */
function Secao({
  titulo,
  descricao,
  ligado,
  onLigar,
  children,
}: {
  titulo: string;
  descricao: string;
  /** Ausente = a camada sempre ligada, sem interruptor. */
  ligado?: boolean;
  onLigar?: (ligado: boolean) => void;
  children: ReactNode;
}) {
  const ligada = ligado ?? true;

  return (
    <section className="space-y-2 rounded-md border p-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-[11px] leading-snug">{descricao}</p>
        {onLigar ? (
          <Switch size="sm" aria-label={titulo} checked={ligada} onCheckedChange={onLigar} />
        ) : null}
      </div>
      {ligada ? <div className="space-y-2">{children}</div> : null}
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
