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
import { DetalhesDoPlugin } from "@/components/desktop/detalhes-do-plugin";
import { IconeDePlugin, tingir, useImagem } from "@/components/desktop/icone-de-plugin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buscarCatalogo,
  comoPluginDoCatalogo,
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
 * repositório passa da instalada. Clicar no card abre o README dele, ver
 * `DetalhesDoPlugin`.
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
 * O manifesto do repositório de um plugin já instalado, que é de onde sai o
 * Atualizar, ou aberto na janela de detalhes, que mostra a versão. O resto
 * não pergunta nada à rede até o clique.
 */
function useManifestoDoRepositorio(repositorio: string, ativo: boolean) {
  const [lido, setLido] = useState<ManifestoDoRepositorio | null>(null);

  useEffect(() => {
    if (!ativo) return;

    let montado = true;
    void lerManifestoDoRepositorio(repositorio).then((manifesto) => montado && setLido(manifesto));

    return () => {
      montado = false;
    };
  }, [repositorio, ativo]);

  return ativo ? lido : null;
}

/**
 * Instalar, Atualizar, ou o aviso de que já está instalado. O mesmo no card e
 * na janela de detalhes: o estado de "instalando" é o do store, e os dois
 * acompanham juntos.
 */
function BotaoDeInstalar({
  plugin,
  instalada,
  remoto,
  className,
}: {
  plugin: PluginDoCatalogo;
  instalada: Extensao | undefined;
  remoto: ManifestoDoRepositorio | null;
  className?: string;
}) {
  const nome = resolverTexto(plugin.nome);
  const texto = t.configuracoes.plugins.catalogo;
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

  if (!acao) {
    return (
      <span
        title={instalada ? texto.versaoInstalada(instalada.versao) : undefined}
        className={`text-muted-foreground flex h-7 items-center justify-center gap-1 text-xs ${className ?? ""}`}
      >
        <Check className="size-3.5" aria-hidden />
        {texto.instalado}
      </span>
    );
  }

  return (
    <>
      <Button
        size="sm"
        className={className}
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
    </>
  );
}

/**
 * Um plugin da lista: o que ele faz, e Instalar. Clicar no resto abre a
 * janela de detalhes, com o README.
 *
 * Sem selo de "executa código": quem escolhe um plugin quer saber o que ele
 * faz, e isso é a descrição e o README. A confiança é perguntada na hora em
 * que conta, quando Instalar vai trazer código (ver `BotaoDeInstalar`).
 */
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
  const texto = t.configuracoes.plugins.catalogo;
  const [aberto, setAberto] = useState(false);

  // A versão do repositório: o Atualizar do instalado, e o "v0.2.0" da janela.
  const remoto = useManifestoDoRepositorio(plugin.repositorio, instalada !== undefined || aberto);

  return (
    <li className="bg-muted/20 flex flex-col overflow-hidden rounded-lg border">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setAberto(true)}
        className="hover:bg-muted/40 focus-visible:ring-ring/50 flex flex-1 flex-col text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset"
      >
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
            className="grid aspect-video w-full place-items-center border-b px-4 font-mono text-xs break-all"
            style={{ backgroundColor: tingir(plugin.id, 16, "--muted"), color: tingir(plugin.id, 70, "--foreground") }}
          >
            {plugin.id}/
          </div>
        )}

        <div className="flex flex-1 flex-col gap-2 p-3 pb-0">
          <div className="flex items-center gap-2.5">
            <IconeDePlugin id={plugin.id} nome={nome} url={plugin.icone} />

            <div className="min-w-0">
              <p className="text-sm leading-tight font-medium">{nome}</p>
              <p className="text-muted-foreground truncate text-xs">{texto.por(plugin.autor)}</p>
            </div>
          </div>

          <p className="text-muted-foreground line-clamp-3 flex-1 text-xs" title={descricao}>
            {descricao}
          </p>

          {plugin.apiVersao > API_VERSAO ? (
            <span
              title={texto.pedeVersaoNovaNota(plugin.apiVersao, API_VERSAO)}
              className="text-muted-foreground self-start rounded border border-dashed px-1.5 py-0.5 text-[10px] font-medium uppercase"
            >
              {texto.pedeVersaoNova}
            </span>
          ) : null}
        </div>
      </button>

      <div className="p-3 pt-2.5">
        <BotaoDeInstalar plugin={plugin} instalada={instalada} remoto={remoto} className="w-full" />
      </div>

      <DetalhesDoPlugin
        plugin={{
          nome,
          descricao,
          autor: plugin.autor,
          versao: remoto?.versao ?? null,
          apiVersao: plugin.apiVersao,
          tags: plugin.tags,
          repositorio: plugin.repositorio,
        }}
        aberto={aberto}
        aoMudar={setAberto}
        icone={<IconeDePlugin id={plugin.id} nome={nome} url={plugin.icone} tamanho="grande" />}
        acoes={
          <>
            <BotaoDeInstalar plugin={plugin} instalada={instalada} remoto={remoto} />
            <BotaoDoGithub repositorio={plugin.repositorio} />
          </>
        }
      />
    </li>
  );
}

function BotaoDoGithub({ repositorio }: { repositorio: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        void openUrl(repositorio).catch(() => toast.error(t.novidades.semNavegador));
      }}
    >
      <ExternalLink />
      {t.configuracoes.plugins.catalogo.verNoGithub}
    </Button>
  );
}

/**
 * A página de um plugin instalado, aberta da lista de Instalados: a mesma
 * janela do catálogo, montada pelo manifesto da pasta.
 *
 * A versão é a instalada, e o README vem do `repositorio` que o manifesto
 * declara, pedido só quando a janela abre. Com repositório no GitHub, os
 * botões são os do card (Atualizar quando há versão nova, e o GitHub); sem
 * ele, o plugin importado à mão abre só com o cabeçalho.
 */
export function DetalhesDoInstalado({
  extensao,
  icone,
  aberto,
  aoMudar,
}: {
  extensao: Extensao;
  icone: React.ReactNode;
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
}) {
  const plugin = comoPluginDoCatalogo(extensao);
  const remoto = useManifestoDoRepositorio(plugin?.repositorio ?? "", plugin !== null && aberto);

  return (
    <DetalhesDoPlugin
      plugin={{
        nome: extensao.nome,
        descricao: extensao.descricao ?? "",
        autor: extensao.autor,
        versao: extensao.versao,
        apiVersao: extensao.apiVersao,
        tags: [],
        repositorio: extensao.repositorio,
      }}
      aberto={aberto}
      aoMudar={aoMudar}
      icone={icone}
      acoes={
        plugin ? (
          <>
            <BotaoDeInstalar plugin={plugin} instalada={extensao} remoto={remoto} />
            <BotaoDoGithub repositorio={plugin.repositorio} />
          </>
        ) : null
      }
    />
  );
}
