"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ListaDeCenas, marcar, type LinhaDeCena } from "@/components/mestre/pacote/lista-de-cenas";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { usePacoteStore } from "@/lib/store/use-pacote-store";
import { flushBoard, useSceneStore } from "@/lib/store/use-scene-store";
import { exportarPacote } from "@/lib/vault/pacote";
import { ehFundo, ehMapa, type Scene } from "@/types/scene";

/**
 * O diálogo de exportar partes da campanha.
 *
 * Aberto pelo menu da campanha (nada marcado) ou pelo menu da linha de um
 * mapa ou de um personagem (ele já vem marcado). O pacote leva cada coisa
 * inteira e o que ela cita; quem decide o que é citado é o Rust, por
 * varredura. Ver `vault/pacote.rs`.
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
          <Corpo
            key={[...exportando.cenas, ...exportando.personagens].join("|")}
            iniciais={[...exportando.cenas, ...exportando.personagens]}
            onFechar={fechar}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Corpo({ iniciais, onFechar }: { iniciais: string[]; onFechar: () => void }) {
  const board = useSceneStore((state) => state.board);
  const elenco = useCharactersStore((state) => state.personagens);
  const garantirElenco = useCharactersStore((state) => state.garantir);
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(iniciais));
  const [levarPersonagens, setLevarPersonagens] = useState(true);
  const [exportando, setExportando] = useState(false);

  useEffect(() => garantirElenco(), [garantirElenco]);

  const pastas = new Map((board?.pastas ?? []).map((pasta) => [pasta.id, pasta.nome]));
  const linha = (scene: Scene): LinhaDeCena => ({
    id: scene.id,
    nome: scene.name,
    pasta: scene.pastaId ? (pastas.get(scene.pastaId) ?? null) : null,
  });
  const cenas = board?.scenes ?? [];
  const mapas = cenas.filter(ehMapa).map(linha);
  const fundos = cenas.filter(ehFundo).map(linha);
  const personagens: LinhaDeCena[] = (elenco ?? []).map((personagem) => ({
    id: personagem.id,
    nome: personagem.nome,
    pasta: null,
  }));

  const escolhidas = [...mapas, ...fundos].filter((cena) => marcadas.has(cena.id));
  const fichas = personagens.filter((personagem) => marcadas.has(personagem.id));

  async function exportar() {
    if (escolhidas.length + fichas.length === 0) return;

    setExportando(true);
    try {
      // O pacote sai do disco: o que ainda está só na memória vai antes.
      await flushBoard();

      const destino = await exportarPacote(
        {
          cenas: escolhidas.map((cena) => cena.id),
          personagens: fichas.map((personagem) => personagem.id),
          levarPersonagens,
        },
        sufixo(escolhidas, fichas, mapas),
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
          <ListaDeCenas
            titulo={t.pacote.personagens}
            cenas={personagens}
            marcadas={marcadas}
            onMarcar={alternar}
          />
        </div>
      </ScrollArea>

      {/* Só faz sentido com cena marcada: é dos tokens dela que se fala. */}
      {escolhidas.length > 0 ? (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={levarPersonagens}
            onCheckedChange={setLevarPersonagens}
          />
          <span className="flex flex-col gap-0.5">
            {t.pacote.levarPersonagens}
            <span className="text-muted-foreground text-xs">{t.pacote.levarPersonagensNota}</span>
          </span>
        </label>
      ) : null}

      <DialogFooter>
        <Button variant="outline" onClick={onFechar}>
          {comum.cancelar}
        </Button>
        <Button
          disabled={escolhidas.length + fichas.length === 0 || exportando}
          onClick={() => void exportar()}
        >
          {exportando ? <Loader2 className="animate-spin" /> : null}
          {exportando ? t.pacote.exportando : t.pacote.exportar}
        </Button>
      </DialogFooter>
    </>
  );
}

function slug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * O fim do nome do arquivo: o nome da coisa quando é uma só, o tipo quando é
 * um tipo só, "pacote" no resto.
 */
function sufixo(cenas: LinhaDeCena[], personagens: LinhaDeCena[], mapas: LinhaDeCena[]): string {
  const todas = [...cenas, ...personagens];
  if (todas.length === 1) return slug(todas[0].nome) || t.pacote.sufixo.pacote;

  if (cenas.length === 0) return t.pacote.sufixo.personagens;
  if (personagens.length > 0) return t.pacote.sufixo.pacote;

  const mapasMarcados = cenas.filter((cena) => mapas.some((mapa) => mapa.id === cena.id)).length;
  if (mapasMarcados === cenas.length) return t.pacote.sufixo.mapas;
  if (mapasMarcados === 0) return t.pacote.sufixo.fundos;
  return t.pacote.sufixo.pacote;
}
