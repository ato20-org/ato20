"use client";

import { useCallback, useEffect, useState } from "react";
import {
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Loader2,
  Paperclip,
  Plus,
  Radio,
  RadioTower,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AttachmentViewer } from "@/components/attachments/attachment-viewer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssetList } from "@/hooks/use-asset-list";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { attachmentKind, type AttachmentKind } from "@/lib/attachments/kind";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { shareCharacterAttachment } from "@/lib/vault/evidence";
import { formatBytes } from "@/lib/player/session";
import {
  attachToCharacter,
  characterAttachmentUrl,
  characterAttachments,
  characterNote,
  characterPlayers,
  createCharacter,
  detachFromCharacter,
  linkCharacter,
  listCharacters,
  removeCharacter,
  renameCharacter,
  preencherCampoComArquivo,
  setCharacterCampo,
  setCharacterNote,
  unlinkCharacter,
} from "@/lib/vault/characters";
import { listPlayers, type Player } from "@/lib/vault/players";
import { cn } from "@/lib/utils";
import type { AnexoPersonagem, CampoPersonagem, Personagem } from "@/types/character";
import { doJogador } from "@/types/character";

const ICONE: Record<AttachmentKind, typeof File> = {
  image: FileImage,
  pdf: FileText,
  audio: FileAudio,
  video: FileVideo,
  text: FileText,
  other: File,
};

/**
 * Os personagens da campanha, do lado do mestre.
 *
 * Lista à esquerda, o escolhido à direita. Um diálogo, e não uma aba do painel
 * esquerdo: isto é preparação — criar personagem, anexar ficha, escolher a
 * miniatura, entregar a quem joga —, não algo que fica à vista durante a
 * sessão. E o painel esquerdo já tem três abas em 288 pixels.
 *
 * O que este diálogo escreve é conteúdo de campanha: vai para `personagens/` no
 * vault e viaja no zip. O vínculo com jogador é a exceção, e mora no banco de
 * estado da máquina — o personagem viaja, quem senta na mesa não.
 */
export function CharactersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  /**
   * `null` é "ainda não leu", e não uma lista vazia.
   *
   * Distinguir os dois é o que permite mostrar "Lendo…" sem uma segunda
   * variável de estado — e uma variável a menos aqui é uma escrita a menos
   * dentro do efeito, que é o que o compilador do React não aceita.
   */
  const [personagens, setPersonagens] = useState<Personagem[] | null>(null);
  const [jogadores, setJogadores] = useState<Player[]>([]);
  const [escolhido, setEscolhido] = useState<string | null>(null);

  /**
   * Contador de releituras, no lugar de uma função que busca e grava.
   *
   * Mesmo padrão do `useAssetList`: quem mexe em algo incrementa isto, e existe
   * UM lugar que busca. A alternativa — uma `recarregar()` chamada do efeito e
   * dos handlers — grava estado de dentro do efeito, o que o compilador
   * proíbe, e ainda espalha a busca por vários pontos.
   */
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((atual) => atual + 1), []);

  // Relê a cada abertura, e não uma vez só: o mestre pode ter anexado arquivo
  // pela pasta, ou um jogador pode ter entrado desde a última vez.
  useEffect(() => {
    if (!open) return;

    let ativo = true;

    void Promise.all([listCharacters(), listPlayers()]).then(
      ([lista, mesa]) => {
        if (!ativo) return;

        setPersonagens(lista);
        setJogadores(mesa);
      },
      (cause) => {
        if (!ativo) return;

        setPersonagens([]);
        toast.error(cause instanceof Error ? cause.message : "Falha ao ler os personagens.");
      },
    );

    return () => {
      ativo = false;
    };
  }, [open, versao]);

  const atual = personagens?.find((p) => p.id === escolhido) ?? null;

  async function criar() {
    try {
      const novo = await createCharacter("Novo personagem");
      await recarregar();
      // Já escolhido: o gesto seguinte é sempre dar um nome a ele.
      setEscolhido(novo.id);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao criar.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <div className="border-b p-4">
          <DialogTitle className="text-base">Personagens</DialogTitle>
          <DialogDescription className="text-xs">
            Ficha, miniaturas e a quem cada um pertence. Fica na campanha e viaja no zip — o
            jogador lê o que está aqui, e não pode apagar.
          </DialogDescription>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[13rem_1fr] divide-x">
          <div className="flex min-h-0 flex-col">
            <div className="p-2">
              <Button variant="outline" size="sm" className="w-full" onClick={() => void criar()}>
                <Plus />
                Novo
              </Button>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              {personagens === null ? (
                <p className="text-muted-foreground p-3 text-xs">Lendo…</p>
              ) : personagens.length === 0 ? (
                <p className="text-muted-foreground p-3 text-xs leading-snug">
                  Nenhum personagem ainda. Crie um e anexe a ficha dele.
                </p>
              ) : (
                <ul className="space-y-0.5 p-2 pt-0">
                  {personagens.map((personagem) => (
                    <li key={personagem.id}>
                      <button
                        type="button"
                        className={cn(
                          "w-full truncate rounded-md px-2 py-1.5 text-left text-xs",
                          personagem.id === escolhido ? "bg-accent" : "hover:bg-accent/50",
                        )}
                        onClick={() => setEscolhido(personagem.id)}
                      >
                        {personagem.nome}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>

          {atual ? (
            <CharacterPane
              personagem={atual}
              jogadores={jogadores}
              onChanged={recarregar}
              onRemoved={() => {
                setEscolhido(null);
                recarregar();
              }}
            />
          ) : (
            <p className="text-muted-foreground m-auto max-w-56 p-6 text-center text-xs">
              Escolha um personagem à esquerda.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** O personagem escolhido: nome, arquivos, miniaturas e donos. */
function CharacterPane({
  personagem,
  jogadores,
  onChanged,
  onRemoved,
}: {
  personagem: Personagem;
  jogadores: Player[];
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const [anexos, setAnexos] = useState<AnexoPersonagem[]>([]);
  const [donos, setDonos] = useState<string[]>([]);
  const [anexando, setAnexando] = useState(false);

  /** Ver a nota em `CharactersDialog`: um lugar que busca, um contador. */
  const [versao, setVersao] = useState(0);
  const relerAnexos = useCallback(() => setVersao((atual) => atual + 1), []);

  /** Anexo aberto no visualizador, com o endereço já resolvido. */
  const [abrindo, setAbrindo] = useState<AnexoPersonagem | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    void Promise.all([
      characterAttachments(personagem.id),
      characterPlayers(personagem.id),
    ]).then(
      ([lista, quem]) => {
        if (!ativo) return;

        setAnexos(lista);
        setDonos(quem);
      },
      (cause) => {
        if (!ativo) return;

        setAnexos([]);
        toast.error(cause instanceof Error ? cause.message : "Falha ao ler os arquivos.");
      },
    );

    return () => {
      ativo = false;
    };
  }, [personagem.id, versao]);

  // A blob URL do visualizador é revogada ao fechar. Sem isto, abrir a ficha de
  // cinco personagens numa sessão deixa cinco arquivos presos na memória da
  // webview até a janela fechar.
  function fecharVisualizador() {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    setAbrindo(null);
  }

  async function anexar() {
    setAnexando(true);

    try {
      const resultado = await attachToCharacter(personagem.id);
      if (!resultado) return;

      for (const motivo of resultado.recusados) toast.error(motivo);
      if (resultado.aceitos.length > 0) relerAnexos();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao anexar.");
    } finally {
      setAnexando(false);
    }
  }

  return (
    <ScrollArea className="min-h-0">
      <div className="space-y-5 p-4">
        <div className="flex items-center gap-2">
          <Input
            className="h-8 flex-1 text-sm font-medium"
            defaultValue={personagem.nome}
            aria-label="Nome do personagem"
            // No `blur`, e não a cada tecla: renomear reescreve o índice
            // inteiro, e gravar por tecla o regravaria a cada letra.
            key={personagem.id}
            onBlur={(event) => {
              const nome = event.target.value.trim();
              if (!nome || nome === personagem.nome) return;

              void renameCharacter(personagem.id, nome).then(onChanged);
            }}
          />

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Apagar este personagem"
                  onClick={() => {
                    void removeCharacter(personagem.id).then(onRemoved);
                  }}
                >
                  <Trash2 />
                </Button>
              }
            />
            <TooltipContent>
              <p className="max-w-52">
                Apaga o personagem, os arquivos dele e as notas que os jogadores escreveram.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Files
          personagemId={personagem.id}
          anexos={anexos}
          anexando={anexando}
          onAnexar={() => void anexar()}
          onAbrir={async (anexo) => {
            setAbrindo(anexo);
            setUrl(await characterAttachmentUrl(personagem.id, anexo));
          }}
          onRemover={async (anexo) => {
            await detachFromCharacter(personagem.id, anexo.autor, anexo.arquivo);
            relerAnexos();
          }}
        />

        <Slots personagem={personagem} onChanged={onChanged} />

        <Owners
          personagem={personagem}
          jogadores={jogadores}
          donos={donos}
          onChanged={relerAnexos}
        />

        <p className="text-muted-foreground text-[10px] leading-snug">
          Os arquivos ficam em <code>personagens/{personagem.id}/anexos/</code>, separados por
          quem os pôs ali.
        </p>
      </div>

      <AttachmentViewer
        attachment={abrindo}
        url={url}
        onClose={fecharVisualizador}
      />
    </ScrollArea>
  );
}

/** Ficha e arquivos, dos dois autores. */
function Files({
  personagemId,
  anexos,
  anexando,
  onAnexar,
  onAbrir,
  onRemover,
}: {
  personagemId: string;
  anexos: AnexoPersonagem[];
  anexando: boolean;
  onAnexar: () => void;
  onAbrir: (anexo: AnexoPersonagem) => Promise<void>;
  onRemover: (anexo: AnexoPersonagem) => Promise<void>;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium">Arquivos</h3>

      {anexos.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Nada anexado. A ficha entra aqui, e o jogador vinculado passa a ler.
        </p>
      ) : (
        <ul className="space-y-1">
          {anexos.map((anexo) => {
            const Icone = ICONE[attachmentKind(anexo.arquivo, anexo.mimeType)];

            return (
              <li
                key={`${anexo.autor}/${anexo.arquivo}`}
                className="bg-muted/40 flex items-center gap-2 rounded-md border p-1.5"
              >
                <Icone className="text-muted-foreground size-4 shrink-0" aria-hidden />

                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-xs hover:underline"
                  onClick={() => void onAbrir(anexo)}
                >
                  {anexo.arquivo}
                </button>

                {/* O autor é rótulo, e não decoração: ele diz de quem é o
                    arquivo, e é o que explica por que existem dois "ficha.pdf"
                    na mesma lista. */}
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                    doJogador(anexo)
                      ? "bg-sky-500/15 text-sky-300"
                      : "bg-amber-400/15 text-amber-300",
                  )}
                >
                  {doJogador(anexo) ? "do jogador" : "seu"}
                </span>

                <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                  {formatBytes(anexo.tamanho)}
                </span>

                <Transmitir anexo={anexo} personagemId={personagemId} />

                {/* O mestre alcança os dois autores — é o lado dele da
                    segmentação. O jogador só apaga o que ele mesmo mandou. */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Tirar ${anexo.arquivo}`}
                  onClick={() => void onRemover(anexo)}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Button variant="secondary" size="sm" disabled={anexando} onClick={onAnexar}>
        {anexando ? <Loader2 className="animate-spin" /> : <Paperclip />}
        Anexar arquivos
      </Button>
    </section>
  );
}

/**
 * Joga o arquivo na frente de tudo, na TV e nos celulares.
 *
 * Reusa a evidência que já existia para o anexo de jogador: o daemon serve UM
 * arquivo num endereço sorteado, que morre quando sai do ar. Não copia para o
 * acervo — isso deixaria um duplicado por transmissão na biblioteca de imagens,
 * para um documento que nem é imagem de mapa.
 */
function Transmitir({
  personagemId,
  anexo,
}: {
  personagemId: string;
  anexo: AnexoPersonagem;
}) {
  const spotlight = useSpotlightStore((state) => state.spotlight);
  const transmitShared = useSpotlightStore((state) => state.transmitShared);
  const clear = useSpotlightStore((state) => state.clear);

  const [sharedId, setSharedId] = useState<string | null>(null);
  const noAr = Boolean(sharedId) && spotlight?.sharedId === sharedId;

  async function transmitir() {
    try {
      // O id sai do daemon ANTES de a evidência subir: pedir o endereço pode
      // falhar, e falhar tem de virar aviso na tela do mestre, não evidência
      // vazia na TV.
      const id = await shareCharacterAttachment(personagemId, anexo.autor, anexo.arquivo);
      setSharedId(id);
      transmitShared(id, anexo.arquivo);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao transmitir.");
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={noAr ? "default" : "ghost"}
            size="icon-xs"
            aria-label={noAr ? "Tirar da evidência" : "Transmitir para a mesa"}
            aria-pressed={noAr}
            onClick={() => (noAr ? clear() : void transmitir())}
          >
            {noAr ? <RadioTower /> : <Radio />}
          </Button>
        }
      />
      <TooltipContent>
        <p className="max-w-48">
          {noAr ? "No ar agora. Clique para tirar." : "Põe este arquivo na frente de tudo."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Os três campos nomeados: ficha, retrato e miniatura.
 *
 * Substituíram o par "Arquivos genéricos + escolher miniatura do acervo". O
 * monte genérico não dizia qual arquivo era o quê, e a miniatura pedia um asset
 * quando todo o resto pedia arquivo — dois gestos diferentes para a mesma
 * intenção, na mesma tela.
 *
 * Agora os três pedem arquivo, e a diferença de armazenamento fica escondida em
 * `preencherCampoComArquivo`: ficha vira anexo do personagem, retrato e
 * miniatura viram asset do acervo porque precisam alcançar a TV.
 */
const CAMPOS: Array<{ campo: CampoPersonagem; titulo: string; nota: string }> = [
  {
    campo: "ficha",
    titulo: "Ficha",
    nota: "Documento. Fica no personagem, e só quem está vinculado lê.",
  },
  {
    campo: "retrato",
    titulo: "Retrato",
    nota: "Imagem. Entra no acervo, porque a TV alcança imagem só por lá.",
  },
  {
    campo: "miniatura",
    titulo: "Miniatura",
    nota: "A peça dele no mapa. Também entra no acervo, pela mesma razão.",
  },
];

function Slots({
  personagem,
  onChanged,
}: {
  personagem: Personagem;
  onChanged: () => void;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium">Campos do personagem</h3>

      <ul className="space-y-1.5">
        {CAMPOS.map(({ campo, titulo, nota }) => (
          <Slot
            key={campo}
            personagem={personagem}
            campo={campo}
            titulo={titulo}
            nota={nota}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </section>
  );
}

function Slot({
  personagem,
  campo,
  titulo,
  nota,
  onChanged,
}: {
  personagem: Personagem;
  campo: CampoPersonagem;
  titulo: string;
  nota: string;
  onChanged: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);

  const valor = personagem[campo];
  const { assets } = useAssetList("image");

  // Ficha guarda nome de arquivo; retrato e miniatura guardam id do acervo, e
  // o nome sai da lista de imagens. Ver `Personagem`.
  const rotulo =
    campo === "ficha"
      ? valor
      : (assets.find((asset) => asset.id === valor)?.name ?? valor);

  async function escolher() {
    setOcupado(true);

    try {
      const preenchido = await preencherCampoComArquivo(personagem.id, campo);
      if (preenchido) onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao anexar.");
    } finally {
      setOcupado(false);
    }
  }

  async function limpar() {
    try {
      await setCharacterCampo(personagem.id, campo, null);
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao limpar.");
    }
  }

  return (
    <li className="bg-muted/40 flex items-center gap-2 rounded-md border p-1.5">
      {/* A miniatura do próprio arquivo quando ele é imagem: numa campanha com
          trinta imagens o nome raramente é o que faz reconhecer qual é. */}
      {campo === "ficha" ? (
        <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
      ) : (
        <SlotThumb assetId={valor} />
      )}

      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">{titulo}</span>
        <span className="text-muted-foreground block truncate text-[10px]">
          {rotulo ?? nota}
        </span>
      </span>

      <Button variant="secondary" size="sm" disabled={ocupado} onClick={() => void escolher()}>
        {ocupado ? <Loader2 className="animate-spin" /> : <Paperclip />}
        {valor ? "Trocar" : "Anexar"}
      </Button>

      {valor ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Limpar ${titulo}`}
          onClick={() => void limpar()}
        >
          <X />
        </Button>
      ) : null}
    </li>
  );
}

/**
 * A imagem do campo, quando há.
 *
 * Limpar o campo NÃO apaga o asset do acervo, e é de propósito: a imagem pode
 * estar numa cena como item, e apagá-la por causa deste campo deixaria um item
 * órfão no mapa.
 */
function SlotThumb({ assetId }: { assetId: string | undefined }) {
  const url = useAssetUrl(assetId);

  return (
    <span className="bg-background size-9 shrink-0 overflow-hidden rounded border">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" draggable={false} className="size-full object-cover" />
      ) : null}
    </span>
  );
}

/**
 * A nota que um jogador escreveu, editável pelo mestre.
 *
 * O mestre escreve na nota DO JOGADOR, e não numa nota própria: é o que foi
 * pedido, e o `jogadorId` na chamada diz de quem é o texto, não quem está
 * digitando. Sem esse par, a nota do Edgar e a da Mira sobre o mesmo
 * personagem seriam o mesmo campo.
 *
 * Grava no `blur`, e não a cada tecla: é IPC para dentro do SQLite, e o mestre
 * digitando um parágrafo não deveria abrir uma transação por letra. O jogador
 * tem debounce porque escreve pela rede numa aba que pode fechar; aqui a janela
 * é a mesma que grava.
 */
function PlayerNote({
  personagemId,
  jogador,
}: {
  personagemId: string;
  jogador: Player;
}) {
  const [texto, setTexto] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    void characterNote(personagemId, jogador.id).then(
      (lido) => {
        if (ativo) setTexto(lido);
      },
      () => {
        // Nota ilegível não pode esconder o resto da ficha: campo vazio, e o
        // mestre pode escrever por cima.
        if (ativo) setTexto("");
      },
    );

    return () => {
      ativo = false;
    };
  }, [personagemId, jogador.id]);

  if (texto === null) return null;

  return (
    <Textarea
      className="min-h-16 resize-y text-xs"
      placeholder={`O que ${jogador.nome} anotou sobre este personagem`}
      aria-label={`Nota de ${jogador.nome}`}
      defaultValue={texto}
      onBlur={(event) => {
        if (event.target.value === texto) return;

        void setCharacterNote(personagemId, jogador.id, event.target.value).then(
          () => setTexto(event.target.value),
          (cause) => toast.error(cause instanceof Error ? cause.message : "Falha ao gravar."),
        );
      }}
    />
  );
}

/** Quem está com este personagem. */
function Owners({
  personagem,
  jogadores,
  donos,
  onChanged,
}: {
  personagem: Personagem;
  jogadores: Player[];
  donos: string[];
  onChanged: () => void;
}) {
  const vinculados = jogadores.filter((jogador) => donos.includes(jogador.id));
  const livres = jogadores.filter((jogador) => !donos.includes(jogador.id));

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium">Quem joga com ele</h3>

      {vinculados.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Sem dono. Vinculado, o jogador passa a ver os arquivos e pode escrever notas.
        </p>
      ) : (
        <ul className="space-y-1">
          {vinculados.map((jogador) => (
            <li key={jogador.id} className="bg-muted/40 space-y-1.5 rounded-md border p-1.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs">
                  {jogador.nome}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Desvincular ${jogador.nome}`}
                  onClick={() => {
                    void unlinkCharacter(jogador.id, personagem.id).then(onChanged);
                  }}
                >
                  <X />
                </Button>
              </div>

              <PlayerNote personagemId={personagem.id} jogador={jogador} />
            </li>
          ))}
        </ul>
      )}

      {livres.length > 0 ? (
        <select
          className="bg-background h-8 w-full rounded-md border px-2 text-xs"
          aria-label="Vincular a um jogador"
          value=""
          onChange={(event) => {
            if (event.target.value) {
              void linkCharacter(event.target.value, personagem.id).then(onChanged);
            }
          }}
        >
          <option value="">Vincular a…</option>
          {livres.map((jogador) => (
            <option key={jogador.id} value={jogador.id}>
              {jogador.nome}
            </option>
          ))}
        </select>
      ) : jogadores.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Ninguém entrou na mesa ainda. Desvincular não apaga nota: o que o jogador escreveu volta
          quando ele for vinculado de novo.
        </p>
      ) : null}
    </section>
  );
}
