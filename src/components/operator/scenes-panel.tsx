"use client";

import { FogList } from "@/components/operator/fog-list";
import { PortraitList } from "@/components/operator/portrait-list";
import { SceneList } from "@/components/operator/scene-list";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePanelsStore, type LeftTab } from "@/lib/store/use-panels-store";
import type { Scene } from "@/types/scene";

/**
 * Painel esquerdo: o que existe na sessão.
 *
 * Cenas e áreas escondidas moram juntas porque as duas são estrutura da
 * própria cena — o que o mestre organiza antes e revela durante. Arquivo é
 * outro assunto, e vive no painel direito.
 *
 * Retratos entram aqui pelo mesmo critério: são o que está no ar, não arquivo
 * de acervo. E é esta lista que diz que eles existem, já que o palco só
 * desenha o que está selecionado.
 */
export function ScenesPanel({ scene, ready }: { scene: Scene | null; ready: boolean }) {
  // Aba controlada pelo store: o palco lê esta escolha para saber se desenha
  // os retratos. Estado local aqui deixaria o palco sem acesso a ela.
  const tab = usePanelsStore((state) => state.leftTab);
  const setTab = usePanelsStore((state) => state.setLeftTab);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as LeftTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsList className="m-2">
          <TabsTrigger value="cenas">Cenas</TabsTrigger>
          <TabsTrigger value="areas">Áreas</TabsTrigger>
          <TabsTrigger value="retratos">Retratos</TabsTrigger>
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

        {/* Retrato não depende de cena: ele é da sessão e atravessa a troca. */}
        <TabsContent value="retratos" className="flex min-h-0 flex-1 flex-col">
          <PortraitList />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
