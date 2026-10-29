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
import { useConfiguracoesStore } from "@/lib/configuracoes/registro";
import { comum } from "@/lib/i18n/comum";
import { t } from "@/lib/i18n/mestre";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useCondicoesStore } from "@/lib/store/use-condicoes-store";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import { usePacoteStore } from "@/lib/store/use-pacote-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { flushBoard, useSceneStore } from "@/lib/store/use-scene-store";
import { listarModelos } from "@/lib/vault/characters";
import {
  exportarPacote,
  secaoDaChave,
  type IdDaSecao,
  type SecaoDoRegistro,
  type SecaoDoRust,
} from "@/lib/vault/pacote";
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
  const [ato20, setAto20] = useState(false);
  const [exportando, setExportando] = useState(false);
  const efeitos = useEfeitosDaCampanhaStore((state) => state.efeitos);
  const condicoes = useCondicoesStore((state) => state.modelos);
  const chavesDaCampanha = useConfiguracoesStore((state) => state.valores.campanha);
  const [medidores, setMedidores] = useState(0);

  useEffect(() => garantirElenco(), [garantirElenco]);
  useEffect(() => {
    if (useEfeitosDaCampanhaStore.getState().efeitos === null) {
      void useEfeitosDaCampanhaStore.getState().carregar();
    }
    useCondicoesStore.getState().garantir();
    listarModelos().then(
      (modelos) => setMedidores(modelos.length),
      () => setMedidores(0),
    );
  }, []);

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

  // A configuração da campanha, uma linha por seção que tem alguma coisa. Os
  // ids das seções vivem no mesmo conjunto das cenas: não colidem com um uuid.
  const porSecao = (secao: SecaoDoRegistro) =>
    Object.keys(chavesDaCampanha).filter((chave) => secaoDaChave(chave) === secao).length;
  const itensDaSecao: Record<IdDaSecao, number> = {
    efeitos: efeitos?.length ?? 0,
    medidores,
    condicoes: condicoes?.length ?? 0,
    espectador: porSecao("espectador"),
    ajustes: porSecao("ajustes"),
    plugins: porSecao("plugins"),
    retratos: 1,
  };
  const configuracao: LinhaDeCena[] = (Object.keys(itensDaSecao) as IdDaSecao[])
    .filter((secao) => itensDaSecao[secao] > 0)
    .map((secao) => ({
      id: secao,
      nome: t.pacote.secoes[secao],
      pasta: secao === "retratos" ? null : String(itensDaSecao[secao]),
    }));

  const escolhidas = [...mapas, ...fundos].filter((cena) => marcadas.has(cena.id));
  const fichas = personagens.filter((personagem) => marcadas.has(personagem.id));
  const secoes = configuracao.filter((secao) => marcadas.has(secao.id)).map((secao) => secao.id as IdDaSecao);
  const algo = escolhidas.length + fichas.length + secoes.length > 0 || ato20;

  async function exportar() {
    if (!algo) return;

    setExportando(true);
    try {
      // O pacote sai do disco: o que ainda está só na memória vai antes.
      await flushBoard();

      const destino = await exportarPacote(
        {
          cenas: escolhidas.map((cena) => cena.id),
          personagens: fichas.map((personagem) => personagem.id),
          levarPersonagens,
          secoes: secoes.filter((secao): secao is SecaoDoRust =>
            ["efeitos", "medidores", "condicoes"].includes(secao),
          ),
          // O registro e os retratos vão como a tela os tem: ela é a dona, e
          // grava com atraso.
          configuracoes: Object.fromEntries(
            Object.entries(chavesDaCampanha).filter(([chave]) =>
              secoes.includes(secaoDaChave(chave)),
            ),
          ),
          retratos: secoes.includes("retratos")
            ? {
                layout: usePortraitStore.getState().layout,
                ancoraPadrao: usePortraitStore.getState().ancoraPadrao,
              }
            : undefined,
          ato20: ato20
            ? {
                configuracoes: useConfiguracoesStore.getState().valores.maquina,
                plugins: useExtensoesStore.getState().extensoes.map((extensao) => ({
                  id: extensao.id,
                  nome: extensao.nome,
                  versao: extensao.versao,
                  repositorio: extensao.repositorio,
                  habilitada: extensao.habilitada,
                })),
              }
            : undefined,
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
          <ListaDeCenas
            titulo={t.pacote.configuracaoDaCampanha}
            cenas={configuracao}
            marcadas={marcadas}
            onMarcar={alternar}
          />
          <label className="flex items-start gap-2 text-sm font-medium">
            <Checkbox className="mt-0.5" checked={ato20} onCheckedChange={setAto20} />
            <span className="flex flex-col gap-0.5">
              {t.pacote.configuracaoDoAto20}
              <span className="text-muted-foreground text-xs font-normal">
                {t.pacote.ato20ExportarNota}
              </span>
            </span>
          </label>
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
        <Button disabled={!algo || exportando} onClick={() => void exportar()}>
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
  if (todas.length === 0) return t.pacote.sufixo.configuracao;
  if (todas.length === 1) return slug(todas[0].nome) || t.pacote.sufixo.pacote;

  if (cenas.length === 0) return t.pacote.sufixo.personagens;
  if (personagens.length > 0) return t.pacote.sufixo.pacote;

  const mapasMarcados = cenas.filter((cena) => mapas.some((mapa) => mapa.id === cena.id)).length;
  if (mapasMarcados === cenas.length) return t.pacote.sufixo.mapas;
  if (mapasMarcados === 0) return t.pacote.sufixo.fundos;
  return t.pacote.sufixo.pacote;
}
