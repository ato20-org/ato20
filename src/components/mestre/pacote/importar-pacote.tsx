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
import { Checkbox } from "@/components/ui/checkbox";
import { mesclarConfiguracoes } from "@/lib/configuracoes/registro";
import { comum } from "@/lib/i18n/comum";
import { t } from "@/lib/i18n/mestre";
import { useAssetsStore } from "@/lib/store/use-assets-store";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useCondicoesStore } from "@/lib/store/use-condicoes-store";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { usePacoteStore } from "@/lib/store/use-pacote-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { importarPacote, type IdDaSecao, type PacoteAberto, type Pulado } from "@/lib/vault/pacote";
import type { AncoraRetrato, LayoutDoRetrato } from "@/types/scene";

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
    () =>
      new Set([...resumo.cenas, ...resumo.personagens, ...resumo.configuracao].map((item) => item.id)),
  );
  // A da máquina vem desmarcada: ela troca os ajustes desta máquina.
  const [ato20, setAto20] = useState(false);
  const [importando, setImportando] = useState(false);

  const mapas = resumo.cenas.filter((cena) => cena.tipo !== "fundo");
  const fundos = resumo.cenas.filter((cena) => cena.tipo === "fundo");
  const personagens = resumo.personagens.map((personagem) => ({ ...personagem, pasta: null }));
  const configuracao = resumo.configuracao.map((secao) => ({
    id: secao.id,
    nome: t.pacote.secoes[secao.id],
    pasta: secao.id === "retratos" ? null : String(secao.itens),
  }));
  const secoes = resumo.configuracao
    .filter((secao) => marcadas.has(secao.id))
    .map((secao) => secao.id as IdDaSecao);
  const algo =
    resumo.cenas.some((cena) => marcadas.has(cena.id)) ||
    resumo.personagens.some((personagem) => marcadas.has(personagem.id)) ||
    secoes.length > 0 ||
    ato20;

  async function importar() {
    setImportando(true);
    try {
      const importado = await importarPacote(token, {
        cenas: resumo.cenas.filter((cena) => marcadas.has(cena.id)).map((cena) => cena.id),
        personagens: resumo.personagens
          .filter((personagem) => marcadas.has(personagem.id))
          .map((personagem) => personagem.id),
        secoes,
        ato20,
        removerPlugins: [],
      });

      const novas = useSceneStore.getState().importarCenas(importado);
      // O acervo, os efeitos, as fichas e as condições mudaram no disco: as
      // listas abertas releem.
      useAssetsStore.getState().recarregar();
      void useEfeitosDaCampanhaStore.getState().carregar();
      if (importado.personagens > 0) useCharactersStore.getState().recarregar();
      if (importado.condicoes > 0) useCondicoesStore.getState().recarregar();

      // O que é da tela: a campanha só ganha o que não tem; a máquina troca.
      const chaves = mesclarConfiguracoes("campanha", importado.configuracoes, false);
      const avisos = importado.pulados.map(frase);
      let retratos = false;
      if (importado.retratos) {
        retratos = usePortraitStore
          .getState()
          .aplicarLayoutDoPacote(
            importado.retratos.layout as LayoutDoRetrato | undefined,
            importado.retratos.ancoraPadrao as AncoraRetrato | undefined,
          );
        if (!retratos) avisos.push(t.pacote.retratosAjustados);
      }

      const partes = [
        novas.length > 0 ? t.pacote.partes.cenas(novas.length) : null,
        importado.personagens > 0 ? t.pacote.partes.personagens(importado.personagens) : null,
        importado.efeitos > 0 ? t.pacote.partes.efeitos(importado.efeitos) : null,
        importado.condicoes > 0 ? t.pacote.partes.condicoes(importado.condicoes) : null,
        importado.medidores > 0 ? t.pacote.partes.medidores(importado.medidores) : null,
        chaves > 0 || retratos ? t.pacote.partes.configuracao : null,
        importado.ato20 ? t.pacote.partes.ato20 : null,
      ].filter((parte): parte is string => parte !== null);

      toast.success(t.pacote.importado(partes), {
        description: avisos.length > 0 ? avisos.join("\n") : undefined,
      });

      // Por último: se o idioma mudar, o ATO20 recarrega, e o aviso acima
      // já saiu.
      if (importado.ato20) mesclarConfiguracoes("maquina", importado.ato20, true);
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

      {resumo.cenas.length + resumo.personagens.length + resumo.configuracao.length === 0 &&
      !resumo.ato20 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">{t.pacote.vazio}</p>
      ) : (
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
            {configuracao.length > 0 ? (
              <ListaDeCenas
                titulo={t.pacote.configuracaoDaCampanha}
                cenas={configuracao}
                marcadas={marcadas}
                onMarcar={alternar}
              />
            ) : null}
            {resumo.ato20 ? (
              <label className="flex items-start gap-2 text-sm font-medium">
                <Checkbox className="mt-0.5" checked={ato20} onCheckedChange={setAto20} />
                <span className="flex flex-col gap-0.5">
                  {t.pacote.configuracaoDoAto20}
                  <span className="text-muted-foreground text-xs font-normal">
                    {t.pacote.ato20ImportarNota}
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        </ScrollArea>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => onFechar(true)}>
          {comum.cancelar}
        </Button>
        <Button disabled={!algo || importando} onClick={() => void importar()}>
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
