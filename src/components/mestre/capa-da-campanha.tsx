"use client";

import { useMemo } from "react";
import { BookImage, ImagePlus } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { importarCapaDaCampanha } from "@/lib/mestre/scene-background";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { ehFundo } from "@/types/scene";

/**
 * Escolher a capa, dentro do menu da campanha.
 *
 * A capa é da CAMPANHA e não de uma cena -- é o que a mesa vê entre uma cena e
 * outra, e uma só existe por campanha. Por isso mora no menu do nome da
 * campanha, ao lado de exportar e trocar de pasta, e não numa tela de cena.
 *
 * Fora das Configurações de propósito: o que mora lá é preferência da MÁQUINA
 * -- zoom, tema --, e a capa viaja no zip junto com o resto da campanha.
 *
 * Só FUNDO pode ser capa. Um mapa ali mostraria à mesa a grade e o chão da
 * próxima luta antes de ela começar. Ver `Scene.capa`.
 *
 * Componente separado, e montado só com o menu ABERTO, porque ele assina a
 * lista de cenas: assinada o tempo todo, a barra de título redesenharia a cada
 * mutação do board -- e durante um arrasto isso é sessenta vezes por segundo.
 */
export function CapaDaCampanha() {
  const scenes = useSceneStore((state) => state.board?.scenes);
  const definirCapa = useSceneStore((state) => state.definirCapa);

  const fundos = useMemo(() => (scenes ?? []).filter(ehFundo), [scenes]);
  const capa = fundos.find((fundo) => fundo.capa);

  function importar() {
    void importarCapaDaCampanha().catch((cause: unknown) =>
      toast.error(cause instanceof Error ? cause.message : "Falha ao importar."),
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <BookImage />
        Capa da campanha
      </DropdownMenuSubTrigger>

      <DropdownMenuSubContent className="w-56">
        {/* Primeiro, e sempre: escolher um fundo que já existe só serve a quem
            já tem um. Quem está abrindo este menu na maioria das vezes tem a
            imagem no disco e nenhum fundo na campanha -- e a capa é a primeira
            coisa que se põe, não a última. Ver `importarCapaDaCampanha`. */}
        <DropdownMenuItem onClick={importar}>
          <ImagePlus />
          Importar imagem…
        </DropdownMenuItem>

        {fundos.length === 0 ? null : (
          <>
            {/* O separador FORA do grupo: dentro dele seria um filho que não é
                opção no meio de um `radiogroup`, e quem lê a tela por leitor
                anuncia o grupo pelos filhos que tem. */}
            <DropdownMenuSeparator />

            <DropdownMenuRadioGroup
              value={capa?.id ?? ""}
              // String vazia é "sem capa": o grupo precisa de um valor para a
              // marca cair em alguma linha, e `null` não é um.
              onValueChange={(id) => definirCapa((id as string) || null)}
            >
              <DropdownMenuRadioItem value="">Sem capa</DropdownMenuRadioItem>

              {fundos.map((fundo) => (
                <DropdownMenuRadioItem key={fundo.id} value={fundo.id}>
                  <span className="truncate">{fundo.name}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
