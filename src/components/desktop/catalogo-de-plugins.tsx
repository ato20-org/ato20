"use client";

import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Download, ExternalLink, Loader2, RotateCw, Search } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  buscarCatalogo,
  type Catalogo,
  catalogoJaLido,
  filtrarCatalogo,
  lerManifestoDoRepositorio,
  type ManifestoDoRepositorio,
  type PluginDoCatalogo,
  versaoMaisNova,
} from "@/lib/extensoes/catalogo";
import { API_VERSAO, type Extensao } from "@/lib/extensoes/manifesto";
import { resolverTexto } from "@/lib/extensoes/texto";
import { comum } from "@/lib/i18n/comum";
import { t } from "@/lib/i18n/desktop";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";

type Estado = { tipo: "buscando" } | { tipo: "erro" } | Catalogo;

/**
 * A vitrine do site dentro da tela de Plugins.
 *
 * Cada card instala o plugin direto do repositório (o Rust baixa o zip, ver
 * `catalogo.rs`) e, depois de instalado, oferece Atualizar quando a versão do
 * repositório passa da instalada.
 *
 * Montado só com a aba aberta (o painel do `Tabs` desmonta a aba escondida):
 * é isso que faz o catálogo não buscar nada para quem nunca o abre.
 */
export function CatalogoDePlugins() {
  const [estado, setEstado] = useState<Estado>(() => catalogoJaLido() ?? { tipo: "buscando" });
  const [tentativa, setTentativa] = useState(0);
  const [busca, setBusca] = useState("");
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

  const porId = new Map(instalados.map((extensao) => [extensao.id, extensao]));
  const texto = t.configuracoes.plugins.catalogo;
  const visiveis = filtrarCatalogo(estado.plugins, busca);
  const buscando = busca.trim() !== "";

  return (
    <div className="@container flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">{texto.comoInstalar}</p>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            type="search"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder={texto.buscar}
            aria-label={texto.buscarRotulo}
            className="pl-7"
          />
        </div>
        {buscando ? (
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums" aria-live="polite">
            {texto.achados(visiveis.length, estado.plugins.length)}
          </span>
        ) : null}
      </div>

      {visiveis.length === 0 ? (
        <Aviso>
          {texto.nada(busca.trim())}
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setBusca("")}>
            {texto.limparBusca}
          </Button>
        </Aviso>
      ) : (
        <ul className="grid gap-3 @md:grid-cols-2">
          {visiveis.map((plugin) => (
            <CardDoPlugin key={plugin.id} plugin={plugin} instalada={porId.get(plugin.id)} />
          ))}
        </ul>
      )}
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

/**
 * O manifesto do repositório de um plugin já instalado: é dele que sai o
 * Atualizar. O que não está instalado não pergunta nada à rede até o clique.
 */
function useManifestoDoRepositorio(repositorio: string, instalado: boolean) {
  const [lido, setLido] = useState<ManifestoDoRepositorio | null>(null);

  useEffect(() => {
    if (!instalado) return;

    let montado = true;
    void lerManifestoDoRepositorio(repositorio).then((manifesto) => montado && setLido(manifesto));

    return () => {
      montado = false;
    };
  }, [repositorio, instalado]);

  return instalado ? lido : null;
}

function CardDoPlugin({
  plugin,
  instalada,
}: {
  plugin: PluginDoCatalogo;
  instalada: Extensao | undefined;
}) {
  const nome = resolverTexto(plugin.nome);
  const descricao = resolverTexto(plugin.descricao);
  const capa = useImagem(plugin.capa);
  const icone = useImagem(plugin.icone);
  const texto = t.configuracoes.plugins.catalogo;
  const instalado = instalada !== undefined;

  const remoto = useManifestoDoRepositorio(plugin.repositorio, instalado);
  const instalando = useExtensoesStore((state) => state.instalando);
  const instalar = useExtensoesStore((state) => state.instalar);
  const [lendo, setLendo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const novoDemais = plugin.apiVersao > API_VERSAO;
  const acao = !instalada
    ? "instalar"
    : remoto && versaoMaisNova(remoto.versao, instalada.versao)
      ? "atualizar"
      : null;
  const esteInstalando = instalando === plugin.id;

  async function executar() {
    const erro = await instalar(plugin.id, plugin.repositorio);

    if (erro) {
      toast.error(texto.falhou(nome), { description: erro });
      return;
    }
    toast.success(acao === "atualizar" ? texto.atualizado(nome) : texto.instaladoAgora(nome));
  }

  // Pergunta antes quando o catálogo diz que executa código, ou quando o
  // manifesto do repositório tem `principal`, diga o catálogo o que disser:
  // o catálogo é escrito à mão, e o manifesto é o que vai rodar.
  async function pedir() {
    setLendo(true);
    const real = await lerManifestoDoRepositorio(plugin.repositorio);
    setLendo(false);

    if (plugin.executaCodigo || real?.executaCodigo) {
      setConfirmando(true);
      return;
    }
    await executar();
  }

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

          {instalada ? (
            <span
              title={texto.versaoInstalada(instalada.versao)}
              className="text-muted-foreground flex items-center gap-1 px-0.5"
            >
              <Check className="size-3" aria-hidden />
              {texto.instalado}
            </span>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap gap-1.5">
          {acao ? (
            <Button
              size="sm"
              className="flex-1"
              disabled={novoDemais || instalando !== null || lendo}
              title={novoDemais ? texto.pedeVersaoNovaNota(plugin.apiVersao, API_VERSAO) : undefined}
              onClick={() => void pedir()}
            >
              {esteInstalando || lendo ? <Loader2 className="animate-spin" /> : <Download />}
              {esteInstalando
                ? acao === "atualizar"
                  ? texto.atualizando
                  : texto.instalando
                : acao === "atualizar"
                  ? texto.atualizar
                  : texto.instalar}
            </Button>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              void openUrl(plugin.repositorio).catch(() => toast.error(t.novidades.semNavegador));
            }}
          >
            <ExternalLink />
            {texto.verNoGithub}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {acao === "atualizar" ? texto.confirmarAtualizar(nome) : texto.confirmarInstalar(nome)}
            </AlertDialogTitle>
            <AlertDialogDescription>{texto.confirmarTexto}</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-muted-foreground text-xs">
            {texto.por(plugin.autor)}
            <br />
            <span className="font-mono break-all">{plugin.repositorio}</span>
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>{comum.cancelar}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executar()}>
              {acao === "atualizar" ? texto.atualizar : texto.instalar}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
