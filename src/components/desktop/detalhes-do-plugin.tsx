"use client";

import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { lerReadmeDoRepositorio, repositorioDoGithub } from "@/lib/extensoes/catalogo";
import { t } from "@/lib/i18n/desktop";

/** O Markdown só vem quando alguém abre um plugin: o Mestre não paga por ele. */
const ReadmeDoPlugin = dynamic(
  () => import("@/components/desktop/readme-do-plugin").then((modulo) => modulo.ReadmeDoPlugin),
  { ssr: false, loading: () => <Lendo /> },
);

/** O que a página mostra de um plugin, venha ele do catálogo ou da pasta instalada. */
export type PluginNaPagina = {
  nome: string;
  descricao: string;
  autor: string | null;
  /** A do repositório no catálogo, a instalada em Instalados. `null` enquanto não se sabe. */
  versao: string | null;
  apiVersao: number;
  tags: string[];
  /** De onde vem o README. `null` no plugin importado à mão sem `repositorio`. */
  repositorio: string | null;
};

/**
 * A página de um plugin, como a de uma extensão no VS Code: o cabeçalho com o
 * ícone, quem fez, a versão e os botões, e embaixo o README do repositório,
 * que é onde o autor mostra o plugin funcionando.
 *
 * Abre do card do Catálogo e da linha de Instalados. Uma janela por cima de
 * Configurações, e não a lista trocada pelo detalhe: o README tem imagem e
 * tabela, e o painel de Configurações é estreito demais para elas. Fechar
 * devolve a lista onde estava, com a busca e a rolagem.
 *
 * O ícone e os botões chegam prontos de quem abre: são os mesmos da lista, e
 * Instalar aqui e lá é o mesmo estado.
 */
export function DetalhesDoPlugin({
  plugin,
  aberto,
  aoMudar,
  icone,
  acoes,
}: {
  plugin: PluginNaPagina;
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  icone: ReactNode;
  acoes: ReactNode;
}) {
  const texto = t.configuracoes.plugins.catalogo;

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="flex h-[min(46rem,88vh)] flex-col gap-0 p-0 sm:max-w-[min(56rem,calc(100%-2rem))]">
        <div className="flex gap-4 border-b p-5 pr-12">
          {icone}

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <DialogTitle className="text-lg leading-tight">{plugin.nome}</DialogTitle>
            <p className="text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
              {/* O separador antes de cada item, menos do primeiro que houver:
                  o plugin importado à mão pode vir sem autor. */}
              {[
                plugin.autor ? texto.por(plugin.autor) : null,
                plugin.versao ? texto.versao(plugin.versao) : null,
                texto.api(plugin.apiVersao),
              ]
                .filter((item) => item !== null)
                .map((item, indice) => (
                  <span key={item}>{indice === 0 ? item : `· ${item}`}</span>
                ))}
              {plugin.tags.map((tag) => (
                <span key={tag} className="font-mono">
                  #{tag}
                </span>
              ))}
            </p>
            {plugin.descricao ? (
              <DialogDescription className="text-foreground/80 text-sm text-pretty">
                {plugin.descricao}
              </DialogDescription>
            ) : null}
            {acoes ? <div className="mt-1.5 flex flex-wrap items-center gap-2">{acoes}</div> : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {plugin.repositorio && repositorioDoGithub(plugin.repositorio) ? (
            <Readme repositorio={plugin.repositorio} />
          ) : (
            <p className="text-muted-foreground py-10 text-center text-xs">
              {t.configuracoes.plugins.catalogo.semRepositorio}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O README, lido quando a janela abre: o `DialogContent` só monta aberto, e é
 * isso que faz a lista não pedir um README por card.
 */
function Readme({ repositorio }: { repositorio: string }) {
  // `undefined` é lendo; `null`, não deu.
  const [readme, setReadme] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let montado = true;
    void lerReadmeDoRepositorio(repositorio).then((lido) => montado && setReadme(lido));

    return () => {
      montado = false;
    };
  }, [repositorio]);

  if (readme === undefined) return <Lendo />;

  if (readme === null) {
    return (
      <p className="text-muted-foreground py-10 text-center text-xs">
        {t.configuracoes.plugins.catalogo.semReadme}
      </p>
    );
  }

  return <ReadmeDoPlugin texto={readme} repositorio={repositorio} />;
}

function Lendo() {
  return (
    <p className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-xs">
      <Loader2 className="size-3.5 animate-spin" aria-hidden />
      {t.configuracoes.plugins.catalogo.lendoReadme}
    </p>
  );
}
