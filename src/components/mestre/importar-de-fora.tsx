"use client";

import { open } from "@tauri-apps/plugin-dialog";
import { FileStack, Folder, Import } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { comum } from "@/lib/i18n/comum";
import { t } from "@/lib/i18n/arquivos";
import { importarDeFora } from "@/lib/obsidian/importar";
import { rotuloDoQueVem } from "@/lib/obsidian/arrasto";
import { identificar, lerArquivos, lerPasta, type LeituraDeFora } from "@/lib/vault/importar";

/** De onde vem o que se importa. Os três caem no mesmo import. */
export type Origem = "pasta" | "arquivos" | "obsidian";

/** O ícone de cada origem, igual no botão e no menu do fundo da lista. */
export const ICONE_DA_ORIGEM: Readonly<Record<Origem, typeof Folder>> = {
  pasta: Folder,
  arquivos: FileStack,
  // O Obsidian não tem ícone no lucide, e marca de terceiro não entra: o
  // nome no item basta.
  obsidian: Import,
};

export const ORIGENS: readonly Origem[] = ["pasta", "arquivos", "obsidian"];

/** Quantos caminhos o aviso de falha mostra; o resto vira o número. */
const FALHAS_NO_AVISO = 3;

function mensagemDe(cause: unknown, padrao: string): string {
  return cause instanceof Error ? cause.message : padrao;
}

/** O seletor nativo certo para cada origem. `null` = o mestre desistiu. */
async function escolher(origem: Origem): Promise<string | string[] | null> {
  if (origem === "arquivos") {
    const arquivos = await open({ multiple: true, title: t.importarDeFora.escolhaArquivos });
    return Array.isArray(arquivos) && arquivos.length > 0 ? arquivos : null;
  }

  const pasta = await open({
    directory: true,
    title: origem === "obsidian" ? t.importarDeFora.escolhaVault : t.importarDeFora.escolhaPasta,
  });
  return typeof pasta === "string" ? pasta : null;
}

/** Uma leitura à espera do "Importar", com a origem de onde ela veio. */
type Pendente = { origem: Origem; leitura: LeituraDeFora };

function temConteudo(leitura: LeituraDeFora): boolean {
  return leitura.notas.length + leitura.boards.length + leitura.anexos.length > 0;
}

function somar(pendentes: readonly Pendente[], contar: (leitura: LeituraDeFora) => number): number {
  return pendentes.reduce((total, { leitura }) => total + contar(leitura), 0);
}

/**
 * O "Importar": escolher de onde, ver o que vem, confirmar.
 *
 * Um hook com o diálogo junto, e não um botão pronto: o botão do cabeçalho de
 * Arquivos, o menu do fundo da lista e o arquivo solto no painel chegam todos
 * aqui, e o diálogo é um só.
 *
 * O resumo vem ANTES de qualquer escrita: quem escolheu a pasta errada vê "0
 * notas, 3000 imagens" e cancela sem ter nada para desfazer.
 *
 * Várias leituras de uma vez são o que o arrasto traz: duas pastas e três
 * arquivos soltos no mesmo gesto. Cada pasta é um import com a pasta dela, os
 * soltos são um só, e o resumo soma tudo.
 */
export function useImportarDeFora(): {
  iniciar: (origem: Origem) => void;
  soltar: (caminhos: string[]) => void;
  dialogo: ReactNode;
} {
  const [pendentes, setPendentes] = useState<Pendente[]>([]);

  /** Lê o que se escolheu e, havendo conteúdo, abre o resumo. */
  async function preparar(leituras: () => Promise<Pendente[]>) {
    const aviso = toast.loading(t.importarDeFora.lendo);
    try {
      const lidas = (await leituras()).filter(({ leitura }) => temConteudo(leitura));
      toast.dismiss(aviso);

      if (lidas.length === 0) {
        toast.info(t.importarDeFora.vazio);
        return;
      }
      setPendentes(lidas);
    } catch (cause) {
      toast.error(mensagemDe(cause, t.importarDeFora.falhou), { id: aviso });
    }
  }

  async function iniciar(origem: Origem) {
    const escolha = await escolher(origem);
    if (!escolha) return;

    // O aviso só depois do seletor fechar: com ele aberto, "Lendo…" mentiria.
    await preparar(async () => [
      {
        origem,
        leitura: await (Array.isArray(escolha) ? lerArquivos(escolha) : lerPasta(escolha)),
      },
    ]);
  }

  /** O que veio solto do sistema: cada pasta por si, os arquivos juntos. */
  async function soltar(caminhos: string[]) {
    await preparar(async () => {
      const identidades = await identificar(caminhos);
      const pastas = identidades.filter((item) => item.tipo !== "arquivo");
      const arquivos = identidades.filter((item) => item.tipo === "arquivo");

      // Em série: cada pasta é uma varredura de disco, e duas ao mesmo tempo
      // só disputariam o mesmo disco.
      const lidas: Pendente[] = [];
      for (const pasta of pastas)
        lidas.push({
          origem: pasta.tipo === "vault" ? "obsidian" : "pasta",
          leitura: await lerPasta(pasta.caminho),
        });
      if (arquivos.length > 0)
        lidas.push({
          origem: "arquivos",
          leitura: await lerArquivos(arquivos.map((item) => item.caminho)),
        });

      return lidas;
    });
  }

  async function importar(lidas: readonly Pendente[]) {
    setPendentes([]);

    const unica = lidas.length === 1 ? lidas[0]!.leitura : null;
    const aviso = toast.loading(
      t.importarDeFora.importando(unica?.nome || t.importarDeFora.vemArquivos(somar(lidas, contarArquivos))),
    );

    const total = { notas: 0, anexos: 0, quadros: 0, falhas: [] as string[], cancelado: false };
    try {
      for (const { leitura } of lidas) {
        const resultado = await importarDeFora(leitura);
        total.notas += resultado.notas;
        total.anexos += resultado.anexos;
        total.quadros += resultado.quadros;
        total.falhas.push(...resultado.falhas);
        total.cancelado ||= resultado.cancelado;
      }

      const resumo = [
        t.importarDeFora.notas(total.notas),
        t.importarDeFora.anexos(total.anexos),
        ...(total.quadros ? [t.importarDeFora.quadros(total.quadros)] : []),
      ].join(", ");
      toast.success(t.importarDeFora.pronto(resumo), { id: aviso });
    } catch (cause) {
      toast.error(mensagemDe(cause, t.importarDeFora.falhou), { id: aviso });
    }

    if (total.cancelado) toast.warning(t.importarDeFora.parado);
    if (total.falhas.length > 0) {
      const primeiros = total.falhas.slice(0, FALHAS_NO_AVISO).join(", ");
      const resto = total.falhas.length > FALHAS_NO_AVISO ? "…" : "";
      toast.error(t.importarDeFora.falhas(total.falhas.length, primeiros + resto));
    }
  }

  const unica = pendentes.length === 1 ? pendentes[0]! : null;
  const nomesDasPastas = pendentes.map(({ leitura }) => leitura.nome).filter(Boolean);
  const ignorados = somar(pendentes, (leitura) => leitura.ignorados.length);
  const quadros = somar(pendentes, (leitura) => leitura.boards.length);

  const dialogo = (
    <AlertDialog
      open={pendentes.length > 0}
      onOpenChange={(aberto) => !aberto && setPendentes([])}
    >
      {pendentes.length > 0 ? (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {!unica
                ? t.importarDeFora.tituloDoArrasto
                : unica.leitura.nome
                  ? t.importarDeFora.tituloDaPasta(unica.leitura.nome)
                  : t.importarDeFora.tituloDosArquivos}
            </AlertDialogTitle>

            {/* `div` e não o `p` de nascença: a lista dentro de um `p` o
                navegador fecha antes dela. Ver `ConfirmarRemocao`. */}
            <AlertDialogDescription render={<div className="space-y-2" />}>
              <ul className="text-foreground marker:text-muted-foreground/40 list-disc space-y-0.5 pl-4">
                <li>{t.importarDeFora.notas(somar(pendentes, (leitura) => leitura.notas.length))}</li>
                <li>{t.importarDeFora.anexos(somar(pendentes, (leitura) => leitura.anexos.length))}</li>
                {quadros > 0 ? <li>{t.importarDeFora.quadros(quadros)}</li> : null}
              </ul>
              <p>
                {!unica
                  ? t.importarDeFora.ondeMisto(nomesDasPastas.join(", "))
                  : unica.leitura.nome
                    ? t.importarDeFora.ondeNaPasta(unica.leitura.nome)
                    : t.importarDeFora.ondeNaRaiz}
              </p>
              {/* Só quando o mestre PEDIU um vault: no arrasto, quem decide se
                  é vault é a própria pasta, e não há promessa a desmentir. */}
              {unica?.origem === "obsidian" && !unica.leitura.obsidian ? (
                <p>{t.importarDeFora.naoEVault}</p>
              ) : null}
              {ignorados > 0 ? <p>{t.importarDeFora.ignorados(ignorados)}</p> : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{comum.cancelar}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void importar(pendentes)}>
              {t.importarDeFora.importar}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );

  return {
    iniciar: (origem) => void iniciar(origem),
    soltar: (caminhos) => void soltar(caminhos),
    dialogo,
  };
}

function contarArquivos(leitura: LeituraDeFora): number {
  return leitura.notas.length + leitura.boards.length + leitura.anexos.length;
}

/**
 * O que está no ar sobre o painel, já dito: "Vault do Obsidian · Lendas".
 *
 * Os caminhos chegam na entrada do arrasto, e o tipo de cada um é uma ida ao
 * Rust. Até ela voltar, a linha diz quantos são -- o que já se sabe sem
 * perguntar --, e a resposta de um arrasto que já acabou é descartada.
 */
export function useRotuloDoArrasto(caminhos: readonly string[] | undefined): string | null {
  const chave = caminhos?.join("\n") ?? "";
  const [identificado, setIdentificado] = useState<{ chave: string; rotulo: string } | null>(null);

  useEffect(() => {
    if (!chave) return;

    let vivo = true;
    void identificar(chave.split("\n")).then(
      (identidades) => {
        if (vivo) setIdentificado({ chave, rotulo: rotuloDoQueVem(identidades) });
      },
      () => undefined,
    );

    return () => {
      vivo = false;
    };
  }, [chave]);

  if (!caminhos) return null;
  if (identificado?.chave === chave) return identificado.rotulo;
  return caminhos.length === 1
    ? t.importarDeFora.soltarParaImportar
    : t.importarDeFora.vemArquivos(caminhos.length);
}

/**
 * O botão "Importar" do cabeçalho de Arquivos, redondo como os de criar ao
 * lado dele, com o menu das três origens.
 */
export function BotaoDeImportar({
  disabled,
  onEscolher,
}: {
  disabled: boolean;
  onEscolher: (origem: Origem) => void;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  className="shrink-0 rounded-full"
                  variant="outline"
                  size="icon"
                  aria-label={t.importarDeFora.botao}
                  disabled={disabled}
                >
                  <Import />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          <p className="font-medium">{t.importarDeFora.botao}</p>
          <p className="text-muted-foreground max-w-48">{t.importarDeFora.dica}</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-52">
        {ORIGENS.map((origem) => {
          const Icone = ICONE_DA_ORIGEM[origem];
          return (
            <DropdownMenuItem key={origem} onClick={() => onEscolher(origem)}>
              <Icone />
              {t.importarDeFora[origem]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
