"use client";

import { corDoEfeito, useCoresPelasCondicoes } from "@/components/mestre/compendio-efeitos";
import {
  TelaDoAmbiente,
  TelaDoDisparo,
  TelaDoEfeitoDePersonagem,
  TelaDoEfeitoEmArea,
} from "@/components/mestre/efeitos-da-campanha";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { ScrollArea } from "@/components/ui/scroll-area";
import { especieDoEfeito } from "@/lib/efeitos";
import { t } from "@/lib/i18n/mestre";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import type { DefinicaoDeEfeito } from "@/types/efeito";

/**
 * Um efeito da campanha, procurado nas duas listas: em jogo e no Compêndio. É
 * o mesmo `efeitos.json` -- ver `useEfeitosDaCampanhaStore` --, e o editor
 * grava num e noutro do mesmo jeito.
 */
export function useEfeitoDaCampanha(efeitoId: string): DefinicaoDeEfeito | undefined {
  return useEfeitosDaCampanhaStore(
    (state) =>
      state.efeitos?.find((efeito) => efeito.id === efeitoId) ??
      state.moldes?.find((efeito) => efeito.id === efeitoId),
  );
}

/**
 * A janela de um efeito: o editor inteiro, como a ficha é a janela do
 * personagem. O ambiente, o disparo, o de área ou o de personagem, em jogo ou
 * guardado no Compêndio.
 *
 * Janela, e não a tela que trocava a lista do Compêndio pelo editor: o editor
 * é comprido, tem prévia animada, e o mestre quer olhar a lista enquanto ajusta
 * o fogo -- ou ajustar dois efeitos lado a lado. Cada mudança grava como na
 * Configuração: na lista agora, no disco um instante depois.
 */
export function EfeitoBody({ efeitoId }: { efeitoId: string }) {
  const efeito = useEfeitoDaCampanha(efeitoId);
  const lendo = useEfeitosDaCampanhaStore((state) => state.efeitos === null);
  const cores = useCoresPelasCondicoes();

  if (!efeito) {
    return lendo ? (
      <p className="text-muted-foreground p-3 text-xs">{t.compendio.lendo}</p>
    ) : (
      <PainelVazio conteudo={{ tipo: "efeito", efeitoId }}>
        {t.janelas.efeitoNaoExisteMais}
      </PainelVazio>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-3">
        {especieDoEfeito(efeito) === "ambiente" ? (
          <TelaDoAmbiente efeito={efeito} />
        ) : especieDoEfeito(efeito) === "disparo" ? (
          <TelaDoDisparo efeito={efeito} />
        ) : efeito.area ? (
          <TelaDoEfeitoEmArea efeito={efeito} />
        ) : (
          <TelaDoEfeitoDePersonagem efeito={efeito} cor={corDoEfeito(efeito, cores.get(efeito.id))} />
        )}
      </div>
    </ScrollArea>
  );
}

/** O cabeçalho na cor do efeito, como o card dele no Compêndio. */
export function FundoDoEfeito({ efeitoId }: { efeitoId: string }) {
  const efeito = useEfeitoDaCampanha(efeitoId);
  const cores = useCoresPelasCondicoes();
  if (!efeito) return null;

  return <FundoDeCor cor={corDoEfeito(efeito, cores.get(efeito.id))} />;
}

/**
 * Um brilho da cor atrás do cabeçalho. Sem desfoque: o item e a ficha desfocam
 * uma imagem, e desfocar uma cor lisa daria a mesma cor.
 */
export function FundoDeCor({ cor }: { cor: string }) {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: `radial-gradient(120% 220% at 15% 0%, color-mix(in srgb, ${cor} 40%, transparent), transparent 70%)`,
      }}
    />
  );
}

/** O rótulo da janela: o nome do efeito, e de que espécie e de onde ele é. */
export function useRotuloDoEfeito(efeitoId: string | undefined): { titulo: string; subtitulo: string } {
  const efeito = useEfeitosDaCampanhaStore((state) =>
    efeitoId
      ? (state.efeitos?.find((atual) => atual.id === efeitoId) ??
        state.moldes?.find((atual) => atual.id === efeitoId))
      : undefined,
  );
  const guardado = useEfeitosDaCampanhaStore((state) =>
    Boolean(efeitoId && state.moldes?.some((atual) => atual.id === efeitoId)),
  );

  return {
    // "Efeito" enquanto a lista não chegou: título que aparece depois faz a
    // aba pular, como na ficha.
    titulo: efeito?.titulo ?? t.janelas.efeito,
    subtitulo:
      // O ambiente só existe no Compêndio: a cena aponta para o molde.
      efeito && especieDoEfeito(efeito) === "ambiente"
        ? t.janelas.ambienteNoCompendio
        : efeito && especieDoEfeito(efeito) === "disparo"
        ? guardado
          ? t.janelas.disparoNoCompendio
          : t.janelas.disparoEmJogo
        : efeito?.area
      ? guardado
        ? t.janelas.efeitoDeAreaNoCompendio
        : t.janelas.efeitoDeAreaEmJogo
      : guardado
        ? t.janelas.efeitoDePersonagemNoCompendio
        : t.janelas.efeitoDePersonagemEmJogo,
  };
}
