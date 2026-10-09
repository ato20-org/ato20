"use client";

import { open } from "@tauri-apps/plugin-dialog";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { criarPersonagemDaFicha } from "@/lib/fichas-pdf/aplicar";
import { lerCamposDaFicha } from "@/lib/fichas-pdf/campos";
import {
  type CamposDoPdf,
  type FichaCandidata,
  type FichaImportada,
  fichasQueReconhecem,
  traduzirFicha,
} from "@/lib/fichas-pdf/traduzir";
import { comum } from "@/lib/i18n/comum";
import { t } from "@/lib/i18n/personagens";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";

/** Uma ficha lida, à espera do "Criar personagem". */
type Pendente = {
  caminho: string;
  arquivo: string;
  campos: CamposDoPdf;
  /** As fichas de plugin que reconhecem o PDF, a mais específica primeiro. */
  candidatas: FichaCandidata[];
  escolhida: number;
  importada: FichaImportada;
  nome: string;
};

/** As fichas que os plugins LIGADOS ensinam. */
function fichasDosPlugins(): FichaCandidata[] {
  return useExtensoesStore
    .getState()
    .extensoes.filter((extensao) => extensao.habilitada)
    .flatMap((extensao) =>
      (extensao.contribui?.fichasPdf ?? []).map((ficha) => ({
        extensaoId: extensao.id,
        extensaoNome: extensao.nome,
        ficha,
      })),
    );
}

/** O nome do arquivo, sem a pasta: é o que o mestre reconhece na prévia. */
function nomeDoArquivo(caminho: string): string {
  return caminho.split(/[\\/]/).pop() ?? caminho;
}

/**
 * O "Importar ficha em PDF": escolher o PDF, ver o que ele vira, criar.
 *
 * Um hook com o diálogo junto, como o `useImportarDeFora`: o botão da lista e
 * o menu do fundo dela chegam aqui, e o diálogo é um só.
 *
 * A prévia vem ANTES de qualquer escrita. O PDF que o plugin errou de ler, ou
 * a ficha em branco escolhida por engano, aparecem ali, e cancelar não deixa
 * nada para apagar.
 */
export function useImportarFichaPdf(aoCriar: (personagemId: string) => void): {
  iniciar: () => void;
  dialogo: ReactNode;
} {
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [criando, setCriando] = useState(false);

  async function iniciar() {
    const caminho = await open({
      multiple: false,
      title: t.importarFicha.escolha,
      filters: [{ name: t.importarFicha.filtro, extensions: ["pdf", "PDF"] }],
    });
    if (typeof caminho !== "string") return;

    // A lista do disco, e não a da memória: o plugin instalado agora por fora
    // do aplicativo tem de valer sem reabrir a janela.
    const aviso = toast.loading(t.importarFicha.lendo);
    try {
      const [campos] = await Promise.all([
        lerCamposDaFicha(caminho),
        useExtensoesStore.getState().carregar(),
      ]);

      if (campos.size === 0) {
        toast.info(t.importarFicha.semFormulario, {
          id: aviso,
          description: t.importarFicha.semFormularioDica,
        });
        return;
      }

      const candidatas = fichasQueReconhecem(campos, fichasDosPlugins());
      const primeira = candidatas[0];
      if (!primeira) {
        toast.info(t.importarFicha.desconhecida, {
          id: aviso,
          description: t.importarFicha.desconhecidaDica,
        });
        return;
      }

      toast.dismiss(aviso);
      const importada = traduzirFicha(primeira.ficha, campos);
      setPendente({
        caminho,
        arquivo: nomeDoArquivo(caminho),
        campos,
        candidatas,
        escolhida: 0,
        importada,
        nome: importada.nome,
      });
    } catch (causa) {
      toast.error(t.importarFicha.falhou, {
        id: aviso,
        description: causa instanceof Error ? causa.message : undefined,
      });
    }
  }

  /** Outra ficha para o mesmo PDF. O nome digitado fica, se o mestre mexeu nele. */
  function escolher(indice: number) {
    if (!pendente) return;
    const candidata = pendente.candidatas[indice];
    if (!candidata) return;

    const importada = traduzirFicha(candidata.ficha, pendente.campos);
    const mexeu = pendente.nome !== pendente.importada.nome;
    setPendente({ ...pendente, escolhida: indice, importada, nome: mexeu ? pendente.nome : importada.nome });
  }

  async function criar() {
    if (!pendente || criando) return;
    const nome = pendente.nome.trim();
    if (!nome) return;

    setCriando(true);
    try {
      const { id, naoCouberam } = await criarPersonagemDaFicha(pendente.importada, nome, pendente.caminho);
      setPendente(null);
      aoCriar(id);
      if (naoCouberam.length > 0) toast.warning(t.importarFicha.naoCouberam(naoCouberam.join(", ")));
    } catch (causa) {
      toast.error(causa instanceof Error ? causa.message : t.importarFicha.falhouCriar);
    } finally {
      setCriando(false);
    }
  }

  const candidata = pendente?.candidatas[pendente.escolhida];

  const dialogo = (
    <Dialog
      open={pendente !== null}
      onOpenChange={(aberto) => {
        if (!aberto && !criando) setPendente(null);
      }}
    >
      {pendente && candidata && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.importarFicha.titulo}</DialogTitle>
            <DialogDescription className="break-all">
              {pendente.arquivo}
            </DialogDescription>
          </DialogHeader>

          {pendente.candidatas.length > 1 ? (
            <Select<string>
              items={Object.fromEntries(
                pendente.candidatas.map((item, indice) => [
                  String(indice),
                  t.importarFicha.lidaPor(item.ficha.titulo, item.extensaoNome),
                ]),
              )}
              value={String(pendente.escolhida)}
              onValueChange={(novo) => escolher(Number(novo))}
            >
              <SelectTrigger className="h-8 w-full text-sm" aria-label={t.importarFicha.modelo}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pendente.candidatas.map((item, indice) => (
                  <SelectItem key={`${item.extensaoId}/${item.ficha.id}`} value={String(indice)} className="text-sm">
                    {t.importarFicha.lidaPor(item.ficha.titulo, item.extensaoNome)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-muted-foreground text-xs">
              {t.importarFicha.lidaPor(candidata.ficha.titulo, candidata.extensaoNome)}
            </p>
          )}

          <div className="space-y-1">
            <Input
              autoFocus
              value={pendente.nome}
              onChange={(event) => setPendente({ ...pendente, nome: event.target.value })}
              placeholder={t.ficha.nomeDoPersonagem}
              aria-label={t.ficha.nomeDoPersonagem}
              onKeyDown={(event) => {
                if (event.key === "Enter") void criar();
              }}
            />
            {!pendente.importada.nome && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{t.importarFicha.emBranco}</p>
            )}
          </div>

          <ScrollArea className="max-h-72">
            <Resumo importada={pendente.importada} />
          </ScrollArea>

          <p className="text-muted-foreground text-xs">{t.importarFicha.pdfJunto}</p>

          <DialogFooter>
            <Button variant="ghost" disabled={criando} onClick={() => setPendente(null)}>
              {comum.cancelar}
            </Button>
            <Button disabled={!pendente.nome.trim() || criando} onClick={() => void criar()}>
              {t.importarFicha.criar}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );

  return { iniciar: () => void iniciar(), dialogo };
}

/** O que a ficha vira, em três blocos, e o que veio em branco. */
function Resumo({ importada }: { importada: FichaImportada }) {
  const { atributos, medidores, detalhes, vazios } = importada;
  const nada = atributos.length + medidores.length + detalhes.length === 0;

  return (
    <div className="space-y-3 pr-3 text-sm">
      {nada && <p className="text-muted-foreground text-xs">{t.importarFicha.nadaPreenchido}</p>}

      {atributos.length > 0 && (
        <Bloco titulo={t.importarFicha.atributos}>
          <div className="flex flex-wrap gap-1.5">
            {atributos.map(({ sigla, valor }) => (
              <span key={sigla} className="bg-muted rounded px-1.5 py-0.5 text-xs tabular-nums">
                <span className="font-medium">{sigla}</span> {valor}
              </span>
            ))}
          </div>
        </Bloco>
      )}

      {medidores.length > 0 && (
        <Bloco titulo={t.importarFicha.medidores}>
          <div className="flex flex-wrap gap-1.5">
            {medidores.map(({ nome, atual, maximo }) => (
              <span key={nome} className="bg-muted rounded px-1.5 py-0.5 text-xs tabular-nums">
                <span className="font-medium">{nome}</span> {atual}/{maximo}
              </span>
            ))}
          </div>
        </Bloco>
      )}

      {detalhes.length > 0 && (
        <Bloco titulo={t.importarFicha.detalhes}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            {detalhes.map(({ grupo, rotulo, valor, descricao }) => (
              <div key={`${grupo}/${rotulo}`} className="contents">
                <dt className="text-muted-foreground">{rotulo}</dt>
                <dd className="truncate">{valor ?? descricao}</dd>
              </div>
            ))}
          </dl>
        </Bloco>
      )}

      {vazios.length > 0 && (
        <p className="text-muted-foreground text-xs">{t.importarFicha.vazios(vazios.join(", "))}</p>
      )}
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-muted-foreground text-xs font-medium">{titulo}</h3>
      {children}
    </section>
  );
}
