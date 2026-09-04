"use client";

import { AssetLibrary } from "@/components/operator/asset-library";
import { AudioLibrary } from "@/components/operator/audio-library";
import { LayerList } from "@/components/operator/layer-list";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Scene } from "@/types/scene";

/**
 * Painel direito, em duas metades.
 *
 * Acima, os arquivos da mesa — o acervo, que vale para todas as cenas. Abaixo,
 * o que está nesta cena, na ordem em que se sobrepõe. São coisas diferentes: a
 * mesma imagem do acervo pode estar em cena nenhuma, uma ou cinco vezes, e
 * misturar as duas listas tornaria impossível saber qual cópia está sendo
 * mexida.
 */
export function LibraryPanel({ scene }: { scene: Scene | null }) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l">
      <Tabs defaultValue="imagens" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="m-2">
          <TabsTrigger value="imagens">Imagens</TabsTrigger>
          <TabsTrigger value="sons">Sons</TabsTrigger>
        </TabsList>
        <Separator />

        <TabsContent value="imagens" className="flex min-h-0 flex-1 flex-col">
          {scene ? (
            <AssetLibrary scene={scene} />
          ) : (
            <p className="text-muted-foreground p-3 text-xs">Crie uma cena primeiro.</p>
          )}
        </TabsContent>

        {/* Sons não dependem de cena: a trilha é da sessão. */}
        <TabsContent value="sons" className="flex min-h-0 flex-1 flex-col">
          <AudioLibrary />
        </TabsContent>

      </Tabs>

      {/* Fora das abas: as camadas da cena continuam à vista tanto ao mexer em
          imagem quanto em som. */}
      {scene ? (
        <div className="flex h-2/5 min-h-44 shrink-0 flex-col border-t">
          <LayerList scene={scene} />
        </div>
      ) : null}
    </aside>
  );
}
