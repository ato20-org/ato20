"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ListaDeCenas, marcar } from "@/components/mestre/pacote/lista-de-cenas";
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
import { useAssetsStore } from "@/lib/store/use-assets-store";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { usePacoteStore } from "@/lib/store/use-pacote-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { importarPacote, type PacoteAberto, type Pulado } from "@/lib/vault/pacote";

/**
 * O diálogo de importar: o que o pacote tem, para o mestre escolher o que
 * entra. Tudo vem marcado; nada é sobrescrito. Ver `vault/pacote.rs`.
 */
export function ImportarPacote() {
  const aberto = usePacoteStore((state) => state.aberto);
  const fechar = usePacoteStore((state) => state.fecharImportar);

  return (
    <Dialog open={aberto !== null} onOpenChange={(abrir) => !abrir && fechar(true)}>
      <DialogContent className="sm:max-w-lg">
        {aberto ? <Corpo key={aberto.token} aberto={aberto} onFechar={fechar} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Corpo({
  aberto,
  onFechar,
}: {
  aberto: PacoteAberto;
  onFechar: (descartar: boolean) => void;
}) {
  const { resumo, token } = aberto;
  const [marcadas, setMarcadas] = useState<Set<string>>(
    () => new Set(resumo.cenas.map((cena) => cena.id)),
  );
  const [importando, setImportando] = useState(false);

  const mapas = resumo.cenas.filter((cena) => cena.tipo !== "fundo");
  const fundos = resumo.cenas.filter((cena) => cena.tipo === "fundo");

  async function importar() {
    setImportando(true);
    try {
      const importado = await importarPacote(token, {
        cenas: resumo.cenas.filter((cena) => marcadas.has(cena.id)).map((cena) => cena.id),
        removerPlugins: [],
      });

      const novas = useSceneStore.getState().importarCenas(importado);
      // O acervo e os efeitos mudaram no disco: as listas abertas releem.
      useAssetsStore.getState().recarregar();
      void useEfeitosDaCampanhaStore.getState().carregar();

      toast.success(t.pacote.importado(novas.length), {
        description: importado.pulados.length > 0 ? importado.pulados.map(frase).join("\n") : undefined,
      });
      // A pasta extraída o Rust já apagou.
      onFechar(false);
    } catch (causa) {
      toast.error(t.pacote.importarFalhou, {
        description: causa instanceof Error ? causa.message : String(causa),
      });
    } finally {
      setImportando(false);
    }
  }

  const alternar = (ids: string[], ligar: boolean) => setMarcadas((atual) => marcar(atual, ids, ligar));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.pacote.importarTitulo(resumo.campanha)}</DialogTitle>
        <DialogDescription>{t.pacote.importarExplicacao}</DialogDescription>
      </DialogHeader>

      {resumo.cenas.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">{t.pacote.vazio}</p>
      ) : (
        <ScrollArea className="max-h-[50vh]">
          <div className="flex flex-col gap-4 pr-3">
            <ListaDeCenas titulo={t.pacote.mapas} cenas={mapas} marcadas={marcadas} onMarcar={alternar} />
            <ListaDeCenas titulo={t.pacote.fundos} cenas={fundos} marcadas={marcadas} onMarcar={alternar} />
          </div>
        </ScrollArea>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => onFechar(true)}>
          {comum.cancelar}
        </Button>
        <Button disabled={marcadas.size === 0 || importando} onClick={() => void importar()}>
          {importando ? <Loader2 className="animate-spin" /> : null}
          {importando ? t.pacote.importando : t.pacote.importar}
        </Button>
      </DialogFooter>
    </>
  );
}

function frase(pulado: Pulado): string {
  return t.pacote.pulado[pulado.motivo](pulado.nome);
}
