"use client";

import { useState } from "react";
import { BookMarked, ListPlus } from "lucide-react";
import { toast } from "sonner";

import {
  editarNaBiblioteca,
  guardarNaBiblioteca,
  porNoMenu,
} from "@/components/mestre/compendio-condicoes";
import { TelaDaCondicao } from "@/components/mestre/efeitos-da-campanha";
import { FundoDeCor } from "@/components/mestre/efeito-window";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/lib/i18n/mestre";
import {
  useCondicoesDoCompendio,
  useCondicoesDoCompendioStore,
} from "@/lib/store/use-condicoes-do-compendio-store";
import { useCondicoesDaCampanha, useCondicoesStore } from "@/lib/store/use-condicoes-store";
import { editarCondicaoDaCampanha } from "@/lib/vault/characters";
import type { Condicao, MoldeDeCondicao, PatchCondicao } from "@/types/character";

/** De que lista é a condição da janela. Ver `ConteudoJanela`. */
type Lugar = "menu" | "compendio";

/**
 * A condição da janela, na lista dela -- e `null` enquanto essa lista não
 * chegou, para a janela dizer "lendo" e não "sumiu".
 */
function useCondicaoDaJanela(
  lugar: Lugar,
  condicaoId: string,
): { condicao: Condicao | MoldeDeCondicao | undefined; lendo: boolean } {
  // As duas lidas sempre: hook não se chama pela metade. A que não é desta
  // janela já está lida por quem a usa -- o menu, pelo token; a biblioteca,
  // pelo Compêndio.
  const menu = useCondicoesDaCampanha().modelos;
  const biblioteca = useCondicoesDoCompendio().lista;
  const lista = lugar === "menu" ? menu : biblioteca;

  return {
    condicao: lista?.find((condicao) => condicao.id === condicaoId),
    lendo: lista === null,
  };
}

/**
 * A janela de uma condição: o selo, o nome, se a mesa vê, e o EFEITO, com o
 * editor inteiro. A mesma tela que a engrenagem do cardápio abria dentro da
 * Configuração, agora em janela própria, como a do item.
 *
 * Serve às duas listas. A do menu edita o cardápio, e a mudança chega às
 * fichas como sempre chegou; a do Compêndio edita a biblioteca, e o efeito
 * novo que ela ganhar nasce guardado também. Ver `TelaDaCondicao`.
 */
export function CondicaoBody({ lugar, condicaoId }: { lugar: Lugar; condicaoId: string }) {
  const { condicao, lendo } = useCondicaoDaJanela(lugar, condicaoId);
  const recarregarMenu = useCondicoesDaCampanha().recarregar;
  const [ocupado, setOcupado] = useState(false);

  if (!condicao) {
    return lendo ? (
      <p className="text-muted-foreground p-3 text-xs">{t.compendio.lendo}</p>
    ) : (
      <PainelVazio conteudo={{ tipo: "condicao", lugar, condicaoId }}>
        {t.janelas.condicaoNaoExisteMais}
      </PainelVazio>
    );
  }

  function editar(patch: PatchCondicao) {
    if (lugar === "compendio") {
      editarNaBiblioteca(condicaoId, patch);
      return;
    }

    // O cardápio como a Configuração o edita: um gesto por vez, e o disco
    // relido no fim -- o nome novo passa também às fichas que estão com ela.
    setOcupado(true);
    void editarCondicaoDaCampanha(condicaoId, patch)
      .catch((cause: unknown) =>
        toast.error(cause instanceof Error ? cause.message : t.configuracao.falhaAoGravar),
      )
      .finally(() => {
        recarregarMenu();
        setOcupado(false);
      });
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-3">
        <TelaDaCondicao modelo={condicao} ocupado={ocupado} onEditar={editar} lugar={lugar} />
      </div>
    </ScrollArea>
  );
}

/** O cabeçalho na cor da condição. */
export function FundoDaCondicao({ lugar, condicaoId }: { lugar: Lugar; condicaoId: string }) {
  const { condicao } = useCondicaoDaJanela(lugar, condicaoId);
  if (!condicao) return null;

  return <FundoDeCor cor={condicao.cor} />;
}

/**
 * O rótulo: o nome da condição, e de que lista ela é.
 *
 * Pelos stores direto, e não por `useCondicaoDaJanela`: o rótulo é pedido para
 * TODA janela aberta, e ler a biblioteca do disco porque a lista de cenas está
 * aberta seria ida ao Rust sem razão. Quem lê é o corpo.
 */
export function useRotuloDaCondicao(
  lugar: Lugar | undefined,
  condicaoId: string | undefined,
): { titulo: string; subtitulo: string } {
  const doMenu = useCondicoesStore((state) =>
    lugar === "menu" ? state.modelos?.find((atual) => atual.id === condicaoId) : undefined,
  );
  const daBiblioteca = useCondicoesDoCompendioStore((state) =>
    lugar === "compendio" ? state.lista?.find((atual) => atual.id === condicaoId) : undefined,
  );
  const condicao = doMenu ?? daBiblioteca;

  return {
    titulo: condicao?.nome ?? t.janelas.condicao,
    subtitulo: lugar === "compendio" ? t.janelas.condicaoDoCompendio : t.janelas.condicaoDoMenu,
  };
}

/**
 * O botão do topo: o caminho para a outra lista. Da biblioteca, "Pôr no menu";
 * do menu, "Guardar no Compêndio". A janela segue a condição -- ver
 * `trocarJanela`.
 */
export function MudarDeListaNoTopo({ lugar, condicaoId }: { lugar: Lugar; condicaoId: string }) {
  const { condicao } = useCondicaoDaJanela(lugar, condicaoId);
  if (!condicao) return null;

  const rotulo = lugar === "compendio" ? t.compendio.porNoMenu : t.compendio.guardarNoCompendio;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={rotulo}
            onClick={() =>
              lugar === "compendio" ? porNoMenu(condicao) : void guardarNaBiblioteca(condicao)
            }
          >
            {lugar === "compendio" ? <ListPlus /> : <BookMarked />}
          </Button>
        }
      />
      <TooltipContent>{rotulo}</TooltipContent>
    </Tooltip>
  );
}
