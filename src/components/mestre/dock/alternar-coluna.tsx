"use client";

import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { t } from "@/lib/i18n/mestre";
import { useLayoutStore, type Lado } from "@/lib/store/use-layout-store";
import { usePanelsStore } from "@/lib/store/use-panels-store";

/**
 * Recolhe e traz de volta uma coluna do dock, do cabeçalho do Mestre.
 *
 * Os dois gestos num botão só, e um botão em cada ponta do cabeçalho, em cima
 * da coluna que ele mexe: o da esquerda antes do que está no ar, o da direita
 * depois de quem alcança a mesa. Antes eram duas peças em dois
 * lugares: o recolher morava dentro da coluna, na tira de abas, e o caminho de
 * volta era uma onda que crescia da borda da janela quando a mão chegava perto.
 * A onda só existia para quem sabia procurá-la, e a coluna recolhida não
 * deixava rastro nenhum na tela. Aqui o botão fica no mesmo lugar com a coluna
 * aberta ou fechada, e o ícone diz qual das duas.
 *
 * Coluna sem região nenhuma não tem o que mostrar -- acontece quando o mestre
 * tira a última aba de um lado --, e o botão fica apagado em vez de sumir: um
 * vão no cabeçalho empurraria os vizinhos. Ela se recupera pela beirada da
 * linha, no arrasto. Ver `alvoEm`.
 */
export function AlternarColuna({ lado }: { lado: Lado }) {
  const esquerda = lado === "esquerda";

  const recolhida = usePanelsStore((state) =>
    esquerda ? !state.left : !state.right,
  );
  const alternar = usePanelsStore((state) =>
    esquerda ? state.toggleLeft : state.toggleRight,
  );
  const vazia = useLayoutStore(
    (state) => state.layout[lado].grupos.length === 0,
  );

  // Vazia conta como fechada: não há coluna à vista para o ícone de fechar
  // apontar.
  const aberta = !recolhida && !vazia;

  const Icone = esquerda
    ? aberta
      ? PanelLeftClose
      : PanelLeftOpen
    : aberta
      ? PanelRightClose
      : PanelRightOpen;

  const rotulo = esquerda
    ? aberta
      ? t.dock.esconderPainelEsquerdo
      : t.dock.mostrarPainelEsquerdo
    : aberta
      ? t.dock.esconderPainelDireito
      : t.dock.mostrarPainelDireito;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={rotulo}
            disabled={vazia}
            onClick={alternar}
          >
            <Icone />
          </Button>
        }
      />
      <TooltipContent>
        <p>{rotulo}</p>
      </TooltipContent>
    </Tooltip>
  );
}
