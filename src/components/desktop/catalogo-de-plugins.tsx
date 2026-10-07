"use client";

import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ExternalLink, RotateCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  buscarCatalogo,
  type Catalogo,
  catalogoJaLido,
  type PluginDoCatalogo,
} from "@/lib/extensoes/catalogo";
import { API_VERSAO } from "@/lib/extensoes/manifesto";
import { resolverTexto } from "@/lib/extensoes/texto";
import { t } from "@/lib/i18n/desktop";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";

type Estado = { tipo: "buscando" } | { tipo: "erro" } | Catalogo;

/**
 * A vitrine do site dentro da tela de Plugins.
 *
 * Só mostra, e ainda não instala: o botão do card leva ao repositório, e a
 * instalação continua sendo o "Importar plugin" da aba ao lado. Baixar o zip
 * daqui é o passo seguinte, e pede um cliente HTTP no Rust que hoje só existe
 * com o atualizador.
 *
 * Montado só com a aba aberta (o painel do `Tabs` desmonta a aba escondida):
 * é isso que faz o catálogo não buscar nada para quem nunca o abre.
 */
export function CatalogoDePlugins() {
  const [estado, setEstado] = useState<Estado>(() => catalogoJaLido() ?? { tipo: "buscando" });
  const [tentativa, setTentativa] = useState(0);
  const instalados = useExtensoesStore((state) => state.extensoes);

  useEffect(() => {
    let montado = true;

    buscarCatalogo().then(
      (catalogo) => montado && setEstado(catalogo),
      () => montado && setEstado({ tipo: "erro" }),
    );

    return () => {
      montado = false;
    };
  }, [tentativa]);

  if (estado.tipo === "buscando") {
    return <Aviso>{t.configuracoes.plugins.catalogo.buscando}</Aviso>;
  }

  if (estado.tipo === "erro") {
    return (
      <Aviso>
        {t.configuracoes.plugins.catalogo.erro}
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => {
            setEstado({ tipo: "buscando" });
            setTentativa((anterior) => anterior + 1);
          }}
        >
          <RotateCw />
          {t.configuracoes.plugins.catalogo.tentarDeNovo}
        </Button>
      </Aviso>
    );
  }

  if (estado.tipo === "formatoNovo") {
    return <Aviso>{t.configuracoes.plugins.catalogo.formatoNovo}</Aviso>;
  }

  if (estado.plugins.length === 0) {
    return <Aviso>{t.configuracoes.plugins.catalogo.vazio}</Aviso>;
  }

  const ids = new Set(instalados.map((extensao) => extensao.id));

  return (
    <div className="@container flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        {t.configuracoes.plugins.catalogo.comoInstalar}
      </p>

      <ul className="grid gap-3 @md:grid-cols-2">
        {estado.plugins.map((plugin) => (
          <CardDoPlugin key={plugin.id} plugin={plugin} instalado={ids.has(plugin.id)} />
        ))}
      </ul>
    </div>
  );
}

/** Buscando, falhou, vazio: no meio do painel, como o "nenhum instalado" da aba ao lado. */
function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center px-4 py-10 text-center text-xs">
      {children}
    </div>
  );
}

/**
 * Um matiz estável por plugin, o mesmo do site. Sem ícone, a inicial é o que
 * distingue um card do outro, e "Ordem" e "OBS" começam com a mesma letra.
 *
 * Misturado aos tokens do tema e não uma cor fixa: o aplicativo tem claro e
 * escuro, e um tema de plugin pode trocar os dois.
 */
function tingir(id: string, quanto: number, sobre: string): string {
  let matiz = 0;
  for (const letra of id) matiz = (matiz * 31 + letra.charCodeAt(0)) % 360;

  return `color-mix(in oklch, oklch(0.62 0.12 ${matiz}) ${quanto}%, var(${sobre}))`;
}

/**
 * Uma imagem do catálogo, que cai para o desenho de reserva quando não carrega.
 * Ela vem da rede: sem conexão, ou com o arquivo fora do ar no site, o card
 * fica com a inicial em vez de um ícone de imagem quebrada.
 */
function useImagem(url: string | null) {
  const [falhou, setFalhou] = useState(false);

  return { url: falhou ? null : url, aoFalhar: () => setFalhou(true) };
}

function CardDoPlugin({
  plugin,
  instalado,
}: {
  plugin: PluginDoCatalogo;
  instalado: boolean;
}) {
  const nome = resolverTexto(plugin.nome);
  const descricao = resolverTexto(plugin.descricao);
  const capa = useImagem(plugin.capa);
  const icone = useImagem(plugin.icone);
  const texto = t.configuracoes.plugins.catalogo;

  return (
    <li className="bg-muted/20 flex flex-col overflow-hidden rounded-lg border">
      {capa.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={capa.url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={capa.aoFalhar}
          className="aspect-video w-full border-b object-cover"
        />
      ) : (
        // A pasta e não o nome, que já está logo embaixo: é a promessa de que
        // um plugin é uma pasta, a mesma do card no site.
        <div
          className="grid aspect-video place-items-center border-b px-4 font-mono text-xs break-all"
          style={{ backgroundColor: tingir(plugin.id, 16, "--muted"), color: tingir(plugin.id, 70, "--foreground") }}
        >
          {plugin.id}/
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-2.5">
          {icone.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={icone.url}
              alt=""
              loading="lazy"
              decoding="async"
              onError={icone.aoFalhar}
              className="size-9 shrink-0 rounded-md"
            />
          ) : (
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-md font-mono text-sm font-medium"
              style={{ backgroundColor: tingir(plugin.id, 30, "--muted"), color: tingir(plugin.id, 80, "--foreground") }}
            >
              {Array.from(nome)[0]?.toUpperCase()}
            </span>
          )}

          <div className="min-w-0">
            <p className="text-sm leading-tight font-medium">{nome}</p>
            <p className="text-muted-foreground truncate text-xs">{texto.por(plugin.autor)}</p>
          </div>
        </div>

        <p className="text-muted-foreground line-clamp-3 flex-1 text-xs" title={descricao}>
          {descricao}
        </p>

        {/* O selo de código primeiro, e em todo card: a guarda do aplicativo é
            contra plugin malformado, não contra plugin malicioso, e uma lista
            dentro do próprio ATO20 parece aval. É o selo que diz, card a card,
            quanto se confia ao instalar. */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase">
          {plugin.executaCodigo ? (
            <span
              title={texto.executaCodigoNota}
              className="rounded border border-amber-500/40 px-1.5 py-0.5 text-amber-600 dark:text-amber-400"
            >
              {texto.executaCodigo}
            </span>
          ) : (
            <span title={texto.semCodigoNota} className="bg-muted rounded border px-1.5 py-0.5">
              {texto.semCodigo}
            </span>
          )}

          {plugin.apiVersao > API_VERSAO ? (
            <span
              title={texto.pedeVersaoNovaNota(plugin.apiVersao, API_VERSAO)}
              className="text-muted-foreground rounded border border-dashed px-1.5 py-0.5"
            >
              {texto.pedeVersaoNova}
            </span>
          ) : null}

          {instalado ? (
            <span className="text-muted-foreground flex items-center gap-1 px-0.5">
              <Check className="size-3" aria-hidden />
              {texto.instalado}
            </span>
          ) : null}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() => {
            void openUrl(plugin.repositorio).catch(() => toast.error(t.novidades.semNavegador));
          }}
        >
          <ExternalLink />
          {texto.verNoGithub}
        </Button>
      </div>
    </li>
  );
}
