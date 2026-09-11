"use client";

import { ChevronDown, PanelsTopLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMemo } from "react";

import { useTelas } from "@/components/operator/dock/window-content";
import { executarComando } from "@/lib/extensoes/carregar";
import type { ComandoDeclarado, Extensao } from "@/lib/extensoes/manifesto";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
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

  const telas = useTelas();
  const comandos = useComandosDeExtensoes();
  const quantas = telas.filter(({ conteudo }) =>
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
            aria-label={`Abas (${quantas} de ${telas.length} abertas)`}
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

          {telas.map(({ conteudo, titulo }) => {
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

        {/* Os comandos dos plugins.
            Existem aqui porque comando sem tecla não teria nenhum outro caminho
            -- a tabela de atalhos só alcança o que declarou combinação, e um
            comando inalcançável é pior que um comando que não existe.
            O grupo some quando não há nenhum: um cabeçalho vazio anuncia um
            recurso que o mestre não tem. */}
        {comandos.length > 0 ? (
          <DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Comandos</DropdownMenuLabel>
            <DropdownMenuSeparator />

            {comandos.map(({ extensao, comando }) => (
              <DropdownMenuItem
                key={`${extensao.id}/${comando.id}`}
                onClick={() => void executarComando(extensao, comando.id)}
              >
                <span className="min-w-0 flex-1 truncate">{comando.titulo}</span>
                {comando.atalho ? (
                  <span className="text-muted-foreground ml-2 font-mono text-[10px]">
                    {comando.atalho}
                  </span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Os comandos que as extensões habilitadas declaram.
 *
 * Do MANIFESTO e não do registro: o comando precisa aparecer no menu antes de o
 * módulo ser importado — é o clique nele que causa a importação.
 */
function useComandosDeExtensoes(): Array<{
  extensao: Extensao;
  comando: ComandoDeclarado;
}> {
  const extensoes = useExtensoesStore((state) => state.extensoes);

  return useMemo(
    () =>
      extensoes
        .filter((extensao) => extensao.habilitada)
        .flatMap((extensao) =>
          (extensao.contribui?.comandos ?? []).map((comando) => ({ extensao, comando })),
        ),
    [extensoes],
  );
}
