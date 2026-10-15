"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { Search, X } from "lucide-react";

import { AparenciasPersonagem } from "@/components/mestre/aparencias-personagem";
import { AtributosPersonagem } from "@/components/mestre/atributos-personagem";
import { CondicoesPersonagem } from "@/components/mestre/condicoes-personagem";
import {
  AchadosNaFicha,
  GrupoAberto,
  useGruposDaFicha,
  type DetalhesDaFicha,
} from "@/components/mestre/detalhes-personagem";
import { MedidoresPersonagem } from "@/components/mestre/medidores-personagem";
import { SecoesDeExtensao } from "@/components/mestre/secoes-de-extensao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { grupoLembrado, lembrarGrupo } from "@/lib/grupo-da-ficha";
import { t } from "@/lib/i18n/personagens";
import { cn } from "@/lib/utils";
import { chaveDoNome } from "@/types/detalhe";
import type { Personagem } from "@/types/character";

/**
 * A aba Ficha: o que muda na mesa e se confere de relance -- atributos,
 * medidores, aparências, condições.
 *
 * Os grupos de detalhes moram na barra lateral (`BarraDosGrupos`), que é da
 * JANELA e não desta aba: ao lado, na altura toda, ela continua à vista no
 * Inventário e nos Arquivos; sem largura para isso, vem no fim da rolagem da
 * aba aberta, qualquer que seja.
 */
export function AbaFicha({
  personagem,
  onChanged,
}: {
  personagem: Personagem;
  onChanged: () => void;
}) {
  return (
    <div className="@container/pagina p-3">
      <Principal personagem={personagem} onChanged={onChanged} />
    </div>
  );
}

/** A largura de janela, em rem, a partir da qual a barra fica ao lado das abas. */
const BARRA_AO_LADO_REM = 44;

/**
 * A janela da ficha tem largura para a barra dos grupos ao lado das abas?
 *
 * Medida em JS, e não por `@container`: a barra muda de LUGAR na árvore (ao
 * lado de tudo, ou no fim da rolagem das abas), e esconder uma das duas por CSS
 * deixaria as duas montadas, com duas buscas e os cartões desenhados em
 * dobro. `useLayoutEffect` para a primeira pintura já sair no lugar certo.
 */
export function useBarraAoLado(ref: RefObject<HTMLElement | null>): boolean {
  const [aoLado, setAoLado] = useState(false);

  useLayoutEffect(() => {
    const corpo = ref.current;
    if (!corpo) return;

    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const medir = () => setAoLado(corpo.getBoundingClientRect().width >= BARRA_AO_LADO_REM * rem);

    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(corpo);

    return () => observador.disconnect();
  }, [ref]);

  return aoLado;
}

/**
 * A barra lateral dos grupos de detalhes: a busca, as pílulas dos grupos e os
 * cartões do aberto, como a ficha do celular.
 *
 * Os grupos saíram do meio da ficha porque a do Ordem tem seis, e só as vinte
 * e oito perícias empurravam o resto para fora da vista. Com texto na busca,
 * os achados de todos os grupos no lugar do aberto, e nenhuma pílula acesa;
 * clicar numa limpa a busca. O grupo aberto é lembrado por personagem -- ver
 * `grupo-da-ficha.ts`.
 *
 * `aoLado`: coluna própria na altura toda da janela, com fundo próprio para
 * separar do personagem, a busca e as pílulas paradas e só os cartões
 * rolando. Sem ele, um bloco no fim da rolagem da aba, com a busca e as
 * pílulas presas no alto ao passar por elas.
 */
export function BarraDosGrupos({
  personagem,
  detalhes,
  aoLado = false,
  onChanged,
}: {
  personagem: Personagem;
  detalhes: DetalhesDaFicha;
  aoLado?: boolean;
  onChanged: () => void;
}) {
  const grupos = useGruposDaFicha(detalhes);
  const [busca, setBusca] = useState("");
  // Por personagem no estado também: a janela que troca de ficha sem
  // desmontar não pode levar o grupo de uma para a outra.
  const [escolhidos, setEscolhidos] = useState<Record<string, string>>({});

  if (!grupos || grupos.length === 0) return null;

  const buscando = busca.trim() !== "";
  const chave = escolhidos[personagem.id] ?? grupoLembrado(personagem.id);
  const grupo = grupos.find((atual) => chaveDoNome(atual.nome) === chave) ?? grupos[0]!;

  function abrir(nome: string) {
    const escolhido = chaveDoNome(nome);
    setBusca("");
    setEscolhidos((antes) => ({ ...antes, [personagem.id]: escolhido }));
    lembrarGrupo(personagem.id, escolhido);
  }

  const propsDosDetalhes = {
    personagemId: personagem.id,
    personagemNome: personagem.nome,
    detalhes,
    aoGravar: onChanged,
  };

  return (
    <aside
      aria-label={t.ficha.barra.rotulo}
      className={aoLado ? "bg-muted/20 flex min-h-0 w-80 shrink-0 flex-col border-l" : "border-t"}
    >
      <div className={cn("space-y-2 border-b p-2.5", !aoLado && "bg-popover sticky top-0 z-[5]")}>
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            onKeyDown={(evento) => {
              // Esc limpa antes de fechar qualquer coisa: é o gesto de quem
              // desistiu da busca, não da janela.
              if (evento.key === "Escape" && busca) {
                evento.stopPropagation();
                setBusca("");
              }
            }}
            placeholder={t.ficha.barra.buscar}
            aria-label={t.ficha.barra.buscarRotulo}
            className="h-8 pr-8 pl-8 text-sm"
          />
          {busca ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t.ficha.barra.limparBusca}
              className="absolute top-1/2 right-1 -translate-y-1/2"
              onClick={() => setBusca("")}
            >
              <X />
            </Button>
          ) : null}
        </div>

        {/* Quebrando linha, e não rolando de lado: com o mouse, a pílula
            escondida à direita não se acha. */}
        <div role="tablist" aria-label={t.ficha.barra.rotulo} className="flex flex-wrap gap-1.5">
          {grupos.map((atual) => {
            const aberto = !buscando && atual.id === grupo.id;

            return (
              <button
                key={atual.id}
                type="button"
                role="tab"
                aria-selected={aberto}
                onClick={() => abrir(atual.nome)}
                className={cn(
                  "focus-visible:ring-ring shrink-0 rounded-full border px-3 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none",
                  aberto ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {atual.nome}
              </button>
            );
          })}
        </div>
      </div>

      <div
        key={buscando ? "busca" : grupo.id}
        className={cn("p-2.5", aoLado && "min-h-0 flex-1 overflow-y-auto")}
      >
        {buscando ? (
          <AchadosNaFicha busca={busca} {...propsDosDetalhes} />
        ) : (
          <GrupoAberto grupo={grupo} {...propsDosDetalhes} />
        )}
      </div>
    </aside>
  );
}

/**
 * O meio: duas colunas a partir de 38rem dele (e não da janela, que agora
 * divide a largura com a barra): à esquerda os atributos, à direita medidores,
 * aparência e condição. O piso é o da linha de condição, que guarda lugar
 * para o olho e a lixeira mesmo escondidos.
 *
 * Mais estreito, uma coluna, e em OUTRA ordem: atributos, aparência,
 * medidores, condições. As duas colunas viram `contents` e cada seção diz o
 * lugar dela por `order`; em duas colunas o `order` some e vale a ordem do
 * código. As seções dos plugins vêm no fim, na largura toda.
 */
function Principal({
  personagem,
  onChanged,
}: {
  personagem: Personagem;
  onChanged: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 @[38rem]/pagina:grid @[38rem]/pagina:grid-cols-2">
      <div className="contents @[38rem]/pagina:flex @[38rem]/pagina:min-w-0 @[38rem]/pagina:flex-col @[38rem]/pagina:gap-3">
        <div className="order-1 min-w-0 @[38rem]/pagina:order-0">
          <AtributosPersonagem personagem={personagem} onChanged={onChanged} />
        </div>
      </div>

      <div className="contents @[38rem]/pagina:flex @[38rem]/pagina:min-w-0 @[38rem]/pagina:flex-col @[38rem]/pagina:gap-3">
        <div className="order-3 min-w-0 @[38rem]/pagina:order-0">
          <MedidoresPersonagem personagem={personagem} onChanged={onChanged} />
        </div>

        <div className="order-2 min-w-0 @[38rem]/pagina:order-0">
          <AparenciasPersonagem personagem={personagem} onChanged={onChanged} />
        </div>

        <div className="order-4 min-w-0 @[38rem]/pagina:order-0">
          <CondicoesPersonagem personagem={personagem} onChanged={onChanged} />
        </div>
      </div>

      {/* Um plugin desenha o que quiser ali, e meia coluna seria pouco para
          uma aba de habilidades. `empty:hidden` porque sem plugin isto é um
          vazio, e o vão da grade continuaria somando embaixo. */}
      <div className="order-5 min-w-0 space-y-3 empty:hidden @[38rem]/pagina:order-0 @[38rem]/pagina:col-span-2">
        <SecoesDeExtensao personagemId={personagem.id} />
      </div>
    </div>
  );
}
