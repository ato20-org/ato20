"use client";

import { useEffect, useRef, useState } from "react";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
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
import { listarPlaylist, testarNaPonte, type TesteDaPonte } from "@/lib/player-do-youtube";
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

/**
 * Quantos vídeos testados na ponte ao mesmo tempo.
 *
 * Menos que o oEmbed: cada teste é um player do YouTube inteiro num iframe,
 * com o script dele, e seis de uma vez pesariam numa máquina que está com o
 * mapa aberto. Três passam uma playlist de vinte em uns quinze segundos.
 */
const TESTES_EM_PARALELO = 3;

/** O vídeo do link: buscando o título, testando na ponte, ou a resposta. */
type VideoDoLink = VideoBuscado | "lendo" | "testando";

/** A resposta, quando já há uma. */
function respondido(video: VideoDoLink | null): VideoBuscado | null {
  return video !== null && typeof video === "object" ? video : null;
}

/** O teste da ponte, como resposta do diálogo: só bloqueado e sumido recusam. */
function comOTeste(resposta: VideoBuscado, teste: TesteDaPonte): VideoBuscado {
  const { resultado } = teste;

  return resultado === "bloqueado" || resultado === "sumiu"
    ? { ok: false, video: resposta.video, motivo: resultado }
    : resposta;
}

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
  const [video, setVideo] = useState<VideoDoLink | null>(null);
  /**
   * Os vídeos da playlist que já passaram pela ponte. `null` = nenhum teste
   * correndo. O oEmbed não vê a trava de quem tem os direitos da música, e
   * só o player a mostra -- ver `testarNaPonte`. Enquanto há teste, o
   * "Adicionar" espera: o que entrasse antes poderia ser um dos recusados.
   */
  const [testes, setTestes] = useState<{ feitos: number; total: number } | null>(null);
  /**
   * Quanto o vídeo do link dura, que o teste na ponte traz junto. É o que
   * deixa o trecho ser um slider em vez de dois campos. `null` = não se sabe,
   * e aí os campos voltam. Ver `TrechoNoSlider`.
   */
  const [duracao, setDuracao] = useState<number | null>(null);
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
    setTestes(null);
    setDuracao(null);
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
    setTestes(null);
    setDuracao(null);

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
      void buscarVideo(lido.video).then(async (resposta) => {
        if (geracao.current !== minha) return;
        if (!resposta.ok) {
          setVideo(resposta);
          return;
        }

        // O título veio; falta saber se o player deixa tocar. Ver `testarNaPonte`.
        setVideo("testando");
        const teste = await testarNaPonte(resposta.video);
        if (geracao.current !== minha) return;

        setVideo(comOTeste(resposta, teste));
        setDuracao(teste.duracao);
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

        // Com os títulos na tela, o teste na ponte: o oEmbed deixou passar,
        // mas quem tem os direitos da música pode recusar o player. O
        // recusado vira linha desligada e sai da escolha.
        const aTestar = ids.filter((id) => itens[id]?.ok);
        setTestes({ feitos: 0, total: aTestar.length });

        for (let i = 0; i < aTestar.length; i += TESTES_EM_PARALELO) {
          const leva = aTestar.slice(i, i + TESTES_EM_PARALELO);
          const resultados = await Promise.all(leva.map(testarNaPonte));
          if (geracao.current !== minha) return;

          const recusados = new Set<string>();
          leva.forEach((id, k) => {
            const antes = itens[id];
            const teste = resultados[k];
            if (!antes || !teste) return;

            itens[id] = comOTeste(antes, teste);
            if (!itens[id].ok) recusados.add(id);
          });

          setLista({ fase: "pronta", ids, itens: { ...itens } });
          if (recusados.size > 0) {
            setEscolhidos((antes) => new Set([...antes].filter((id) => !recusados.has(id))));
          }
          setTestes({ feitos: i + leva.length, total: aTestar.length });
        }

        setTestes(null);
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

  const doLink = respondido(video);
  const quantos = usarLista ? naLista.length : doLink?.ok ? 1 : 0;
  const pode =
    quantos > 0 && !salvando && (usarLista ? testes === null : trecho.ok);

  async function adicionar() {
    if (!pode) return;

    const sons =
      usarLista && lista?.fase === "pronta"
        ? naLista.map((id) => {
            const item = lista.itens[id];
            return { video: id, nome: item?.ok ? item.titulo : "" };
          })
        : doLink?.ok && trecho.ok
          ? [{ video: doLink.video, nome: doLink.titulo, inicio: trecho.inicio, fim: trecho.fim }]
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
    // `modal="trap-focus"` e o fundo começando em `top-8`, como as Novidades e
    // as Configurações: a barra da janela mora fora do diálogo, e o modal
    // cheio a borrava e deixava os botões dela mortos.
    <Dialog modal="trap-focus" open={aberto} onOpenChange={(abrir) => !abrir && fechar()}>
      {/* `sm:max-w-lg`, com o prefixo: a base do diálogo tem `sm:max-w-sm`,
          e um `max-w-md` sem ele perde para ela a partir do `sm` -- a caixa
          ficava em 384px. E a coluna do grid em `minmax(0,1fr)`: item de grid
          tem largura mínima igual à do conteúdo, e o título mais longo da
          playlist, numa linha só, empurrava tudo para fora da caixa. Presa na
          coluna, a lista trunca o título como a linha manda. */}
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-lg" overlayClassName="top-8">
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
            testes={testes}
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
            {!usarLista && doLink?.ok && duracao ? (
              <TrechoNoSlider
                video={doLink.video}
                duracao={duracao}
                inicio={inicioTexto}
                fim={fimTexto}
                onInicio={setInicioTexto}
                onFim={setFimTexto}
              />
            ) : !usarLista ? (
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
function Previa({ video }: { video: VideoDoLink }) {
  const textos = t.audioLibrary.youtube;

  if (video === "lendo" || video === "testando") {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <Loader2 className="size-3.5 animate-spin" />
        {video === "lendo" ? textos.buscando : textos.testando}
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
  testes,
}: {
  lista: Lista;
  escolhidos: Set<string>;
  onEscolhidos: (escolhidos: Set<string>) => void;
  /** O teste na ponte correndo. Ver `testes`, no diálogo. */
  testes: { feitos: number; total: number } | null;
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
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {faltam > 0 ? (
            textos.lendoLista(lista.ids.length)
          ) : testes ? (
            <>
              <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
              <span className="truncate">
                {textos.testandoLista(testes.feitos, testes.total)}
              </span>
            </>
          ) : null}
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
 * O trecho num slider de duas pontas, sobre o vídeo inteiro -- como a régua de
 * corte de um editor de vídeo.
 *
 * Um trecho é um INTERVALO, e dois campos de texto o mostravam como dois
 * números soltos: não se via quanto do vídeo ficava de fora, e acertar o fim de
 * uma introdução era digitar, tocar, errar e digitar de novo. A faixa mostra o
 * vídeo inteiro, o pedaço escolhido aceso e o resto apagado.
 *
 * A tira de fundo é a miniatura do vídeo repetida: o YouTube não dá os quadros
 * do meio sem chave, e a repetição basta para a faixa ler como "o vídeo" e não
 * como um controle de volume.
 *
 * Os valores continuam sendo os textos do trecho (`inicio`, `fim`), e não
 * números à parte: o resto do diálogo -- validar, salvar -- já fala com eles, e
 * ponta encostada na borda grava vazio, que é "do começo" e "até o fim". Setas
 * mexem de um em um segundo, e Shift de dez em dez: num vídeo de uma hora o
 * mouse anda segundos por pixel, e o teclado é o ajuste fino.
 */
function TrechoNoSlider({
  video,
  duracao,
  inicio,
  fim,
  onInicio,
  onFim,
}: {
  video: string;
  /** Em segundos. Ver `testarNaPonte`. */
  duracao: number;
  inicio: string;
  fim: string;
  onInicio: (texto: string) => void;
  onFim: (texto: string) => void;
}) {
  const textos = t.audioLibrary.youtube;
  const total = Math.max(1, Math.floor(duracao));

  // Do texto para a faixa. Ilegível ou além do vídeo, encosta na borda: o
  // slider sempre desenha um trecho que existe.
  const lido = lerTrecho(inicio, fim);
  const de = lido.ok ? Math.min(Math.max(0, Math.floor(lido.inicio ?? 0)), total - 1) : 0;
  const ate = lido.ok ? Math.min(Math.max(de + 1, Math.floor(lido.fim ?? total)), total) : total;

  const porcento = (segundos: number) => `${(segundos / total) * 100}%`;

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-muted-foreground mb-1 text-xs">{textos.trecho}</legend>

      <SliderPrimitive.Root
        value={[de, ate]}
        min={0}
        max={total}
        step={1}
        largeStep={10}
        minStepsBetweenValues={1}
        // As alças não se atravessam: o início empurra o fim, e não troca de
        // lugar com ele no meio do gesto.
        thumbCollisionBehavior="push"
        onValueChange={(valor) => {
          const [novoDe, novoAte] = Array.isArray(valor) ? valor : [valor, total];
          onInicio(novoDe && novoDe > 0 ? formatarTempo(novoDe) : "");
          onFim(novoAte !== undefined && novoAte < total ? formatarTempo(novoAte) : "");
        }}
      >
        <SliderPrimitive.Control className="relative flex h-11 w-full touch-none items-center select-none">
          <SliderPrimitive.Track
            className="relative h-11 w-full overflow-hidden rounded-md bg-black"
            style={{
              backgroundImage: `url(${miniaturaDo(video)})`,
              backgroundSize: "auto 100%",
              backgroundRepeat: "repeat-x",
            }}
          >
            {/* O que fica de fora, apagado dos dois lados. */}
            <div
              className="pointer-events-none absolute inset-y-0 left-0 bg-black/70"
              style={{ width: porcento(de) }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 right-0 bg-black/70"
              style={{ width: `calc(100% - ${porcento(ate)})` }}
            />
            {/* A moldura do trecho, entre as alças. */}
            <SliderPrimitive.Indicator className="border-primary pointer-events-none absolute inset-y-0 border-y-2" />
          </SliderPrimitive.Track>

          {[0, 1].map((indice) => (
            <SliderPrimitive.Thumb
              key={indice}
              index={indice}
              getAriaLabel={(qual) => (qual === 0 ? textos.inicio : textos.fim)}
              getAriaValueText={(_formatado, valor) => formatarTempo(valor)}
              className={cn(
                "bg-primary focus-visible:ring-ring grid h-11 w-3 cursor-ew-resize place-items-center shadow-sm outline-none focus-visible:ring-2",
                indice === 0 ? "rounded-l-md" : "rounded-r-md",
              )}
            >
              {/* O risco no meio da alça, que diz que ela se arrasta. */}
              <span aria-hidden className="bg-primary-foreground/80 h-4 w-0.5 rounded-full" />
            </SliderPrimitive.Thumb>
          ))}
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>

      <div className="text-muted-foreground flex items-center justify-between text-[11px] tabular-nums">
        <span>{de > 0 ? formatarTempo(de) : textos.doComeco}</span>
        <span className="text-foreground font-medium">
          {textos.trechoDura(formatarTempo(ate - de))}
        </span>
        <span>{ate < total ? formatarTempo(ate) : textos.ateOFim}</span>
      </div>
    </fieldset>
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
    // Fora da barra da janela, como o diálogo de pôr o som. Ver lá.
    <Dialog
      modal="trap-focus"
      open={asset !== null}
      onOpenChange={(abrir) => !abrir && onFechar()}
    >
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md" overlayClassName="top-8">
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
  /**
   * Quanto o vídeo dura, para o slider. O acervo não guarda -- o som é um
   * link --, então a ponte carrega o vídeo ao abrir, sem tocar, e diz. `null`
   * = ainda lendo; `0` = não deu, e voltam os dois campos. Ver `testarNaPonte`.
   */
  const [duracao, setDuracao] = useState<number | null>(null);
  const video = atual?.video;

  useEffect(() => {
    if (!video) return;

    let ativo = true;
    void testarNaPonte(video).then(
      (teste) => {
        if (ativo) setDuracao(teste.duracao ?? 0);
      },
      () => {
        if (ativo) setDuracao(0);
      },
    );

    return () => {
      ativo = false;
    };
  }, [video]);

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
        {duracao === null ? (
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            {textos.lendoDuracao}
          </p>
        ) : duracao > 0 && video ? (
          <TrechoNoSlider
            video={video}
            duracao={duracao}
            inicio={inicio}
            fim={fim}
            onInicio={setInicio}
            onFim={setFim}
          />
        ) : (
          <CamposDoTrecho
            inicio={inicio}
            fim={fim}
            onInicio={setInicio}
            onFim={setFim}
            erro={trecho.ok ? null : trecho.erro}
          />
        )}

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
