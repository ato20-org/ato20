"use client";

import { FogList } from "@/components/operator/fog-list";
import { SceneList } from "@/components/operator/scene-list";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Scene } from "@/types/scene";

/**
 * Painel esquerdo: o que existe na sessão.
 *
 * Cenas e áreas escondidas moram juntas porque as duas são estrutura da
 * própria cena — o que o mestre organiza antes e revela durante. Arquivo é
 * outro assunto, e vive no painel direito.
 */
export function ScenesPanel({ scene, ready }: { scene: Scene | null; ready: boolean }) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r">
      <Tabs defaultValue="cenas" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="m-2">
          <TabsTrigger value="cenas">Cenas</TabsTrigger>
          <TabsTrigger value="areas">Áreas</TabsTrigger>
        </TabsList>
        <Separator />

        <TabsContent value="cenas" className="flex min-h-0 flex-1 flex-col">
          <SceneList ready={ready} />
        </TabsContent>

        <TabsContent value="areas" className="flex min-h-0 flex-1 flex-col">
          {scene ? (
            <FogList scene={scene} />
          ) : (
            <p className="text-muted-foreground p-3 text-xs">Crie uma cena primeiro.</p>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  );
}
