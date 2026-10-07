"use client";

import { useRef, useState } from "react";
import { Check, ListVideo, Loader2, Music, Waves } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { comum } from "@/lib/i18n/comum";
import { t } from "@/lib/i18n/arquivos";
import { CORES_DO_SOM } from "@/lib/mestre/cores-do-som";
import { listarPlaylist } from "@/lib/player-do-youtube";
import { useTrackStore } from "@/lib/store/use-track-store";
import { cn } from "@/lib/utils";
import { addYoutube, setTrechoDoYoutube } from "@/lib/vault/assets";
import {
  buscarVideo,
  formatarTempo,
  type LinkDoYoutube,
  lerLink,
  lerTrecho,
  miniaturaDo,
  type VideoBuscado,
} from "@/lib/youtube";
import type { AssetMeta } from "@/types/scene";

/** Os dois tipos que um som do YouTube pode ter. Efeito não: ver `AssetMeta.youtube`. */
type TipoDoYoutube = "trilha" | "ambiente";

const TIPOS: { tipo: TipoDoYoutube; Icone: typeof Music }[] = [
  { tipo: "trilha", Icone: Music },
  { tipo: "ambiente", Icone: Waves },
];

/**
 * Quantos vídeos de uma playlist entram de uma vez.
 *
 * O player devolve até duzentos, e cada um custa uma pergunta ao oEmbed para
 * ter título. Uma playlist maior que isso é uma estação de rádio, não a
 * trilha de uma campanha.
 */
const TETO_DA_LISTA = 200;

/** Quantas perguntas ao oEmbed ao mesmo tempo, para a lista encher rápido sem afogar a rede. */
const EM_PARALELO = 6;

/** O que o YouTube respondeu sobre a playlist. */
type Lista =
  | { fase: "lendo" }
  | { fase: "erro" }
  | { fase: "pronta"; ids: string[]; itens: Record<string, VideoBuscado> };

/**
 * Pôr no acervo um som que toca do YouTube.
 *
 * Um campo de link e um botão, e o resto aparece com a resposta: o vídeo com o
 * título e a miniatura, ou a lista da playlist para escolher quais entram. O
 * oEmbed responde se o vídeo deixa tocar fora do YouTube, e o que não deixa
 * fica de fora AGORA, e não no meio da sessão.
 *
 * O tipo é escolhido aqui, como no botão de importar arquivo, e a leva toda
 * entra com ele.
 */
export function SomDoYoutubeDialog({
  aberto,
  onFechar,
  onAdicionados,
}: {
  aberto: boolean;
  onFechar: () => void;
  onAdicionados: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [link, setLink] = useState<LinkDoYoutube | null>(null);
  const [erroDoLink, setErroDoLink] = useState<string | null>(null);
  const [video, setVideo] = useState<VideoBuscado | "lendo" | null>(null);
  const [lista, setLista] = useState<Lista | null>(null);
  const [usarLista, setUsarLista] = useState(false);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [tipo, setTipo] = useState<TipoDoYoutube>("trilha");
  const [inicioTexto, setInicioTexto] = useState("");
  const [fimTexto, setFimTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  /**
   * Qual busca é a de agora.
   *
   * Colar um link, buscar, e colar outro antes de o primeiro responder deixava
   * a resposta velha cair por cima da nova. Cada busca leva um número, e só a
   * última escreve.
   */
  const geracao = useRef(0);

  function zerar() {
    geracao.current += 1;
    setTexto("");
    setLink(null);
    setErroDoLink(null);
    setVideo(null);
    setLista(null);
    setUsarLista(false);
    setEscolhidos(new Set());
    setInicioTexto("");
    setFimTexto("");
    setSalvando(false);
  }

  function fechar() {
    zerar();
    onFechar();
  }

  function buscar() {
    const lido = lerLink(texto);
    const minha = ++geracao.current;

    setLink(lido);
    setVideo(null);
    setLista(null);
    setEscolhidos(new Set());

    if (!lido) {
      setErroDoLink(t.audioLibrary.youtube.naoEhLink);
      return;
    }

    setErroDoLink(null);
    setInicioTexto(lido.inicio ? formatarTempo(lido.inicio) : "");
    setFimTexto("");

    // Vídeo e playlist no mesmo link: quem copiou estava OUVINDO o vídeo, e é
    // ele que vem primeiro. A playlist fica no interruptor ao lado.
    setUsarLista(!lido.video && Boolean(lido.lista));

    if (lido.video) {
      setVideo("lendo");
      void buscarVideo(lido.video).then((resposta) => {
        if (geracao.current === minha) setVideo(resposta);
      });
    } else if (lido.lista) {
      lerLista(lido.lista, minha);
    }
  }

  function lerLista(id: string, minha: number) {
    setLista({ fase: "lendo" });

    void listarPlaylist(id).then(
      async (todos) => {
        if (geracao.current !== minha) return;

        const ids = [...new Set(todos)].slice(0, TETO_DA_LISTA);
        const itens: Record<string, VideoBuscado> = {};

        setLista({ fase: "pronta", ids, itens: {} });

        // Em levas, e a lista acende conforme chega: duzentos títulos em fila
        // seriam meio minuto olhando uma lista em branco.
        for (let i = 0; i < ids.length; i += EM_PARALELO) {
          const leva = await Promise.all(ids.slice(i, i + EM_PARALELO).map(buscarVideo));
          if (geracao.current !== minha) return;

          for (const resposta of leva) itens[resposta.video] = resposta;

          setLista({ fase: "pronta", ids, itens: { ...itens } });
          setEscolhidos((antes) => {
            const depois = new Set(antes);
            for (const resposta of leva) if (resposta.ok) depois.add(resposta.video);
            return depois;
          });
        }
      },
      () => {
        if (geracao.current === minha) setLista({ fase: "erro" });
      },
    );
  }

  function alternarLista(ligar: boolean) {
    setUsarLista(ligar);

    if (ligar && link?.lista && lista === null) {
      lerLista(link.lista, geracao.current);
    }
  }

  const trecho = lerTrecho(inicioTexto, fimTexto);

  const naLista =
    usarLista && lista?.fase === "pronta"
      ? lista.ids.filter((id) => escolhidos.has(id) && lista.itens[id]?.ok)
      : [];

  const quantos = usarLista ? naLista.length : video !== "lendo" && video?.ok ? 1 : 0;
  const pode = quantos > 0 && !salvando && (usarLista || trecho.ok);

  async function adicionar() {
    if (!pode) return;

    const sons =
      usarLista && lista?.fase === "pronta"
        ? naLista.map((id) => {
            const item = lista.itens[id];
            return { video: id, nome: item?.ok ? item.titulo : "" };
          })
        : video && video !== "lendo" && video.ok && trecho.ok
          ? [{ video: video.video, nome: video.titulo, inicio: trecho.inicio, fim: trecho.fim }]
          : [];

    setSalvando(true);

    try {
      const novos = await addYoutube(sons, tipo);
      toast.success(t.audioLibrary.youtube.adicionados(novos.length));
      onAdicionados();
      fechar();
    } catch (cause) {
      setSalvando(false);
      toast.error(cause instanceof Error ? cause.message : t.audioLibrary.youtube.falhou);
    }
  }

  const textos = t.audioLibrary.youtube;

  return (
    <Dialog open={aberto} onOpenChange={(abrir) => !abrir && fechar()}>
      <DialogContent className="max-w-md">
        <DialogTitle>{textos.titulo}</DialogTitle>
        <DialogDescription>{textos.descricao}</DialogDescription>

        <form
          className="flex gap-2"
          onSubmit={(evento) => {
            evento.preventDefault();
            buscar();
          }}
        >
          <Input
            autoFocus
            value={texto}
            aria-label={textos.link}
            placeholder={textos.exemplo}
            onChange={(evento) => setTexto(evento.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!texto.trim()}>
            {textos.buscar}
          </Button>
        </form>

        {erroDoLink ? <p className="text-destructive text-xs">{erroDoLink}</p> : null}

        {link?.video && video ? <Previa video={video} /> : null}

        {link?.video && link.lista ? (
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={usarLista} onCheckedChange={alternarLista} />
            <ListVideo className="size-3.5" />
            {textos.playlistInteira}
          </label>
        ) : null}

        {usarLista && lista ? (
          <ListaDaPlaylist
            lista={lista}
            escolhidos={escolhidos}
            onEscolhidos={setEscolhidos}
          />
        ) : null}

        {quantos > 0 ? (
          <div className="space-y-3">
            <fieldset className="flex items-center gap-2">
              <legend className="text-muted-foreground mb-1 text-xs">{textos.tocaComo}</legend>
              {TIPOS.map(({ tipo: candidato, Icone }) => (
                <Button
                  key={candidato}
                  type="button"
                  size="sm"
                  variant={tipo === candidato ? "secondary" : "ghost"}
                  aria-pressed={tipo === candidato}
                  onClick={() => setTipo(candidato)}
                >
                  <Icone className={CORES_DO_SOM[candidato].texto} />
                  {t.audioLibrary.tipos[candidato].rotulo}
                </Button>
              ))}
            </fieldset>

            {/* O trecho só para o vídeo sozinho. Numa playlist cada vídeo
                tem o seu, e um campo para todos cortaria o mesmo minuto de
                músicas diferentes; o trecho de cada um se acerta depois, no
                menu da linha. */}
            {!usarLista ? (
              <CamposDoTrecho
                inicio={inicioTexto}
                fim={fimTexto}
                onInicio={setInicioTexto}
                onFim={setFimTexto}
                erro={trecho.ok ? null : trecho.erro}
              />
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={fechar}>
            {comum.cancelar}
          </Button>
          <Button disabled={!pode} onClick={() => void adicionar()}>
            {salvando ? <Loader2 className="animate-spin" /> : null}
            {salvando ? textos.adicionando : textos.adicionar(Math.max(1, quantos))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** O vídeo achado: miniatura e título, ou por que ele não serve. */
function Previa({ video }: { video: VideoBuscado | "lendo" }) {
  const textos = t.audioLibrary.youtube;

  if (video === "lendo") {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <Loader2 className="size-3.5 animate-spin" />
        {textos.buscando}
      </p>
    );
  }

  if (!video.ok) {
    return <p className="text-destructive text-xs">{textos[video.motivo]}</p>;
  }

  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de fora, sem otimização a fazer */}
      <img
        src={miniaturaDo(video.video)}
        alt=""
        className="aspect-video w-24 shrink-0 rounded object-cover"
      />
      <p className="line-clamp-3 min-w-0 text-sm">{video.titulo}</p>
    </div>
  );
}

/**
 * Os vídeos da playlist, para escolher quais entram.
 *
 * Linhas que alternam, e não caixas de marcar: o projeto não tem caixa, e uma
 * linha inteira clicável é o alvo maior. O que não toca fora do YouTube fica
 * na lista, desligado e com o motivo, em vez de sumir: quem conhece a playlist
 * procuraria a música que falta.
 */
function ListaDaPlaylist({
  lista,
  escolhidos,
  onEscolhidos,
}: {
  lista: Lista;
  escolhidos: Set<string>;
  onEscolhidos: (escolhidos: Set<string>) => void;
}) {
  const textos = t.audioLibrary.youtube;

  if (lista.fase === "lendo") {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <Loader2 className="size-3.5 animate-spin" />
        {textos.buscando}
      </p>
    );
  }

  if (lista.fase === "erro") {
    return <p className="text-destructive text-xs">{textos.listaIlegivel}</p>;
  }

  const tocaveis = lista.ids.filter((id) => lista.itens[id]?.ok);
  const faltam = lista.ids.length - Object.keys(lista.itens).length;

  return (
    <div className="space-y-1">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <span className="flex-1">
          {faltam > 0 ? textos.lendoLista(lista.ids.length) : null}
        </span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => onEscolhidos(new Set(tocaveis))}
        >
          {textos.todos}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => onEscolhidos(new Set())}
        >
          {textos.nenhum}
        </Button>
      </div>

      <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border p-1">
        {lista.ids.map((id) => {
          const item = lista.itens[id];
          const escolhido = escolhidos.has(id);

          return (
            <li key={id}>
              <button
                type="button"
                disabled={!item?.ok}
                aria-pressed={escolhido}
                className={cn(
                  "hover:bg-accent/50 flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs",
                  "disabled:hover:bg-transparent",
                )}
                onClick={() => {
                  const depois = new Set(escolhidos);
                  if (escolhido) depois.delete(id);
                  else depois.add(id);
                  onEscolhidos(depois);
                }}
              >
                <Check
                  className={cn(
                    "size-3.5 shrink-0",
                    escolhido ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">
                  {item?.ok ? item.titulo : item ? id : "…"}
                </span>
                {item && !item.ok ? (
                  <span className="text-muted-foreground shrink-0 text-[10px]">
                    {item.motivo === "bloqueado" ? textos.naoToca : textos.indisponivel}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Início e fim do trecho. Vazio é "do começo" e "até o fim".
 *
 * Texto, e não dois campos numéricos de segundos: quem marca um trecho está
 * olhando o relógio do YouTube, que diz 1:30, e não 90.
 */
function CamposDoTrecho({
  inicio,
  fim,
  onInicio,
  onFim,
  erro,
}: {
  inicio: string;
  fim: string;
  onInicio: (texto: string) => void;
  onFim: (texto: string) => void;
  erro: "ilegivel" | "fimAntes" | null;
}) {
  const textos = t.audioLibrary.youtube;

  return (
    <fieldset className="space-y-1">
      <legend className="text-muted-foreground mb-1 text-xs">{textos.trecho}</legend>
      <div className="flex items-center gap-2">
        <Input
          value={inicio}
          inputMode="numeric"
          aria-label={textos.inicio}
          placeholder={`${textos.inicio}: ${textos.doComeco}`}
          className="h-8 text-xs tabular-nums"
          onChange={(evento) => onInicio(evento.target.value)}
        />
        <Input
          value={fim}
          inputMode="numeric"
          aria-label={textos.fim}
          placeholder={`${textos.fim}: ${textos.ateOFim}`}
          className="h-8 text-xs tabular-nums"
          onChange={(evento) => onFim(evento.target.value)}
        />
      </div>
      {erro ? (
        <p className="text-destructive text-xs">
          {erro === "ilegivel" ? textos.tempoIlegivel : textos.fimAntes}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * Acertar o trecho de um som do YouTube que já está no acervo.
 *
 * Existe sobretudo pela playlist: ela entra inteira sem trecho, e cortar a
 * introdução de uma das músicas é aqui.
 */
export function TrechoDoYoutubeDialog({
  asset,
  onFechar,
  onSalvo,
}: {
  /** O som cujo trecho se edita. `null` = fechado. */
  asset: AssetMeta | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  return (
    <Dialog open={asset !== null} onOpenChange={(abrir) => !abrir && onFechar()}>
      <DialogContent className="max-w-sm">
        {/* Por dentro, e com `key`: os campos nascem do trecho de QUEM abriu,
            e reabrir em outro som não pode trazer o texto do anterior. */}
        {asset?.youtube ? (
          <EditorDoTrecho key={asset.id} asset={asset} onFechar={onFechar} onSalvo={onSalvo} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditorDoTrecho({
  asset,
  onFechar,
  onSalvo,
}: {
  asset: AssetMeta;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const atual = asset.youtube;
  const [inicio, setInicio] = useState(atual?.inicio ? formatarTempo(atual.inicio) : "");
  const [fim, setFim] = useState(atual?.fim ? formatarTempo(atual.fim) : "");
  const [salvando, setSalvando] = useState(false);
  const trocarYoutube = useTrackStore((state) => state.trocarYoutube);

  const trecho = lerTrecho(inicio, fim);
  const textos = t.audioLibrary.youtube;

  async function salvar() {
    if (!trecho.ok || !atual) return;

    setSalvando(true);

    try {
      await setTrechoDoYoutube(asset.id, trecho.inicio, trecho.fim);
      // O que está no ar passa a tocar o trecho novo agora, e não na próxima
      // vez que alguém acionar o som. Ver `trocarYoutube`.
      trocarYoutube(asset.id, { video: atual.video, inicio: trecho.inicio, fim: trecho.fim });
      onSalvo();
      onFechar();
    } catch (cause) {
      setSalvando(false);
      toast.error(cause instanceof Error ? cause.message : textos.falhou);
    }
  }

  return (
    <>
      <DialogTitle>{t.audioLibrary.editarTrecho}</DialogTitle>
      <DialogDescription>{textos.trechoDescricao(asset.name)}</DialogDescription>

      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          void salvar();
        }}
      >
        <CamposDoTrecho
          inicio={inicio}
          fim={fim}
          onInicio={setInicio}
          onFim={setFim}
          erro={trecho.ok ? null : trecho.erro}
        />

        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={onFechar}>
            {comum.cancelar}
          </Button>
          <Button type="submit" disabled={!trecho.ok || salvando}>
            {salvando ? <Loader2 className="animate-spin" /> : null}
            {textos.salvar}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
