"use client";

import { ChevronDown, PanelsTopLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TELAS } from "@/components/operator/dock/window-content";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useFecharJanela } from "@/hooks/use-fechar-janela";
import { useLayoutStore } from "@/lib/store/use-layout-store";
import { chaveDe, useWindowStore } from "@/lib/store/use-window-store";

/**
 * Quais telas estão à vista, na barra da janela.
 *
 * Nasceu de um buraco que a bancada abriu: desde que os painéis viraram janelas
 * atracáveis, não havia UM lugar que respondesse "o que existe, e onde está".
 * O `+` da tira de abas só oferece o que está fora, e só sabe atracar naquela
 * região; a pílula do canto do palco só alcança Personagens. Fechar Cenas e
 * esquecer que ela existia era possível.
 *
 * Fica ao lado da campanha, e não no cabeçalho do Operador, pela mesma razão
 * que a campanha fica ali: é o que a JANELA tem, não o que a sessão está
 * fazendo. Some junto com a campanha quando nenhuma está aberta -- é `inicio`
 * de `WindowChrome` que decide isso.
 *
 * Marcado é "está em algum lugar", incluindo coluna recolhida. A palavra é
 * "aberto", não "visível": desmarcar por causa de uma coluna escondida faria
 * clicar no item reabrir uma tela que já estava lá, e o mestre veria a coluna
 * aparecer com a aba dele piscando -- ver `useAbrirJanela`, que é justamente
 * quem resolve esse caso.
 */
export function PanelsMenu() {
  const layout = useLayoutStore((state) => state.layout);
  const flutuantes = useWindowStore((state) => state.janelas);

  const abrir = useAbrirJanela();
  const fechar = useFecharJanela();

  const abertas = new Set([
    ...layout.esquerda.grupos.flatMap((grupo) => grupo.abas.map(chaveDe)),
    ...layout.direita.grupos.flatMap((grupo) => grupo.abas.map(chaveDe)),
    ...flutuantes.map((janela) => janela.chave),
  ]);

  const quantas = TELAS.filter(({ conteudo }) =>
    abertas.has(chaveDe(conteudo)),
  ).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            // 24px de altura como o botão da campanha: a barra tem 32.
            className="text-muted-foreground h-6 gap-1 px-1.5 text-xs"
            aria-label={`Abas (${quantas} de ${TELAS.length} abertas)`}
          >
            <PanelsTopLeft className="size-3.5" />
            Abas
            <ChevronDown className="size-3" />
          </Button>
        }
      />

      <DropdownMenuContent align="start" className="w-52">
        {/* Tudo dentro de um `Group`: o rótulo é `Menu.GroupLabel` no Base UI, e
            fora de um grupo ele não acha o contexto e derruba a tela. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Abas abertas</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {TELAS.map(({ conteudo, titulo }) => {
            const chave = chaveDe(conteudo);
            const aberta = abertas.has(chave);

            return (
              <DropdownMenuCheckboxItem
                key={chave}
                checked={aberta}
                // O menu não fecha ao marcar: abrir três telas seguidas é um
                // gesto só, e reabrir o menu entre cada uma seria trabalho a
                // mais para a mesma intenção.
                closeOnClick={false}
                onClick={() => (aberta ? fechar(chave) : abrir(conteudo))}
              >
                {titulo}
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
