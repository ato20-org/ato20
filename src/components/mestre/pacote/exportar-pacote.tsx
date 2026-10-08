"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ListaDeCenas, marcar, type LinhaDeCena } from "@/components/mestre/pacote/lista-de-cenas";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { comum } from "@/lib/i18n/comum";
import { t } from "@/lib/i18n/mestre";
import { usePacoteStore } from "@/lib/store/use-pacote-store";
import { flushBoard, useSceneStore } from "@/lib/store/use-scene-store";
import { exportarPacote } from "@/lib/vault/pacote";
import { ehFundo, ehMapa, type Scene } from "@/types/scene";

/**
 * O diálogo de exportar partes da campanha.
 *
 * Aberto pelo menu da campanha (nada marcado) ou pelo menu da linha de um
 * mapa (ele já vem marcado). O pacote leva cada cena inteira e o que ela cita;
 * quem decide o que é citado é o Rust, por varredura. Ver `vault/pacote.rs`.
 */
export function ExportarPacote() {
  const exportando = usePacoteStore((state) => state.exportando);
  const fechar = usePacoteStore((state) => state.fecharExportar);

  return (
    <Dialog open={exportando !== null} onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent className="sm:max-w-lg">
        {exportando ? (
          // A chave refaz o estado a cada abertura: o que vem marcado é o do
          // pedido de agora, e não o que ficou da última vez.
          <Corpo key={exportando.cenas.join("|")} iniciais={exportando.cenas} onFechar={fechar} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Corpo({ iniciais, onFechar }: { iniciais: string[]; onFechar: () => void }) {
  const board = useSceneStore((state) => state.board);
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(iniciais));
  const [exportando, setExportando] = useState(false);

  const pastas = new Map((board?.pastas ?? []).map((pasta) => [pasta.id, pasta.nome]));
  const linha = (scene: Scene): LinhaDeCena => ({
    id: scene.id,
    nome: scene.name,
    pasta: scene.pastaId ? (pastas.get(scene.pastaId) ?? null) : null,
  });
  const cenas = board?.scenes ?? [];
  const mapas = cenas.filter(ehMapa).map(linha);
  const fundos = cenas.filter(ehFundo).map(linha);

  async function exportar() {
    const escolhidas = [...mapas, ...fundos].filter((cena) => marcadas.has(cena.id));
    if (escolhidas.length === 0) return;

    setExportando(true);
    try {
      // O pacote sai do disco: o que ainda está só na memória vai antes.
      await flushBoard();

      const destino = await exportarPacote(
        { cenas: escolhidas.map((cena) => cena.id) },
        sufixo(escolhidas, mapas, fundos),
      );
      if (!destino) return;

      toast.success(t.pacote.exportadoEm(destino));
      onFechar();
    } catch (causa) {
      toast.error(t.pacote.exportarFalhou, {
        description: causa instanceof Error ? causa.message : String(causa),
      });
    } finally {
      setExportando(false);
    }
  }

  const alternar = (ids: string[], ligar: boolean) => setMarcadas((atual) => marcar(atual, ids, ligar));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.pacote.exportarTitulo}</DialogTitle>
        <DialogDescription>{t.pacote.exportarExplicacao}</DialogDescription>
      </DialogHeader>

      <ScrollArea className="max-h-[50vh]">
        <div className="flex flex-col gap-4 pr-3">
          <ListaDeCenas titulo={t.pacote.mapas} cenas={mapas} marcadas={marcadas} onMarcar={alternar} />
          <ListaDeCenas titulo={t.pacote.fundos} cenas={fundos} marcadas={marcadas} onMarcar={alternar} />
        </div>
      </ScrollArea>

      <DialogFooter>
        <Button variant="outline" onClick={onFechar}>
          {comum.cancelar}
        </Button>
        <Button disabled={marcadas.size === 0 || exportando} onClick={() => void exportar()}>
          {exportando ? <Loader2 className="animate-spin" /> : null}
          {exportando ? t.pacote.exportando : t.pacote.exportar}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * O fim do nome do arquivo: o nome da cena quando é uma só, "mapas" ou
 * "fundos" quando é um tipo só, "pacote" no resto.
 */
function sufixo(escolhidas: LinhaDeCena[], mapas: LinhaDeCena[], fundos: LinhaDeCena[]): string {
  if (escolhidas.length === 1) {
    const nome = escolhidas[0].nome
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (nome) return nome;
  }

  const ids = new Set(escolhidas.map((cena) => cena.id));
  if (mapas.some((cena) => ids.has(cena.id)) && !fundos.some((cena) => ids.has(cena.id))) {
    return t.pacote.sufixo.mapas;
  }
  if (fundos.some((cena) => ids.has(cena.id)) && !mapas.some((cena) => ids.has(cena.id))) {
    return t.pacote.sufixo.fundos;
  }
  return t.pacote.sufixo.pacote;
}
