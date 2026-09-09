"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Loader2,
  Paperclip,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AttachmentViewer } from "@/components/attachments/attachment-viewer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { attachmentKind, type AttachmentKind } from "@/lib/attachments/kind";
import {
  characterFileUrl,
  characterFiles,
  characterNote,
  deleteCharacterFile,
  myCharacters,
  revokeCharacterFileUrl,
  uploadCharacterFile,
  writeCharacterNote,
} from "@/lib/player/characters";
import { formatBytes, MAX_ATTACHMENT_BYTES } from "@/lib/player/session";
import { cn } from "@/lib/utils";
import { doJogador, type AnexoPersonagem, type Personagem } from "@/types/character";

const ICONE: Record<AttachmentKind, typeof File> = {
  image: FileImage,
  pdf: FileText,
  audio: FileAudio,
  video: FileVideo,
  text: FileText,
  other: File,
};

/** Espera antes de gravar a nota, em milissegundos. */
const DEBOUNCE_MS = 800;

/**
 * Os personagens deste jogador.
 *
 * Substituiu a ficha solta que ele tinha antes — um nome, uns arquivos e um
 * campo de notas, tudo pendurado na identidade dele. O problema não era a tela:
 * era que o mestre não tinha onde amarrar nada. Se o jogador não anexasse a
 * ficha, ou a apagasse no meio da campanha, não havia personagem a que ligar
 * uma miniatura no mapa.
 *
 * Agora o personagem é do mestre e da campanha, e o jogador recebe acesso. O
 * que ele pode: ler os arquivos, mandar os próprios, e escrever notas. O que
 * ele não pode: apagar o que o mestre pôs ali.
 *
 * Sem personagem vinculado a lista fica vazia, e isso é estado normal — não
 * erro. Quem entrega personagem é o mestre.
 */
export function MyCharacters({ codigo }: { codigo: string }) {
  const [personagens, setPersonagens] = useState<Personagem[] | null>(null);

  useEffect(() => {
    let ativo = true;

    void myCharacters(codigo).then(
      (lista) => {
        if (ativo) setPersonagens(lista);
      },
      () => {
        // Falha de rede não vira tela de erro: o jogador está num celular no
        // Wi-Fi da casa, e a lista volta ao recarregar.
        if (ativo) setPersonagens([]);
      },
    );

    return () => {
      ativo = false;
    };
  }, [codigo]);

  if (personagens === null) {
    return <p className="text-muted-foreground text-xs">Lendo…</p>;
  }

  if (personagens.length === 0) {
    return (
      <p className="text-muted-foreground text-xs leading-snug">
        Nenhum personagem ainda. O mestre é quem entrega um a você — quando isso acontecer, a
        ficha e os arquivos dele aparecem aqui.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {personagens.map((personagem) => (
        <CharacterCard key={personagem.id} codigo={codigo} personagem={personagem} />
      ))}
    </div>
  );
}

function CharacterCard({
  codigo,
  personagem,
}: {
  codigo: string;
  personagem: Personagem;
}) {
  const [anexos, setAnexos] = useState<AnexoPersonagem[]>([]);
  const [versao, setVersao] = useState(0);
  const [enviando, setEnviando] = useState(false);

  const [abrindo, setAbrindo] = useState<AnexoPersonagem | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let ativo = true;

    void characterFiles(codigo, personagem.id).then(
      (lista) => {
        if (ativo) setAnexos(lista);
      },
      () => {
        if (ativo) setAnexos([]);
      },
    );

    return () => {
      ativo = false;
    };
  }, [codigo, personagem.id, versao]);

  const reler = useCallback(() => setVersao((atual) => atual + 1), []);

  /** Baixa e mostra um anexo. Serve à lista e ao bloco da ficha. */
  const abrirAnexo = useCallback(
    (anexo: AnexoPersonagem) => {
      setAbrindo(anexo);
      void characterFileUrl(codigo, personagem.id, anexo).then(setUrl, () =>
        toast.error("Não foi possível abrir o arquivo."),
      );
    },
    [codigo, personagem.id],
  );

  // A ficha tem bloco próprio acima: aqui fica o que ninguém nomeou. Só a do
  // mestre, porque um arquivo de mesmo nome mandado pelo jogador é outro
  // arquivo, noutra pasta — ver `AnexoAutor`.
  const soltos = anexos.filter(
    (anexo) => !(anexo.autor === "mestre" && anexo.arquivo === personagem.ficha),
  );

  async function enviar(files: FileList | null) {
    if (!files || files.length === 0) return;

    setEnviando(true);

    try {
      for (const file of Array.from(files)) {
        // Conferido aqui além do daemon: subir 80 MB por 4G para receber uma
        // recusa no fim é o pior jeito de descobrir um limite.
        if (file.size > MAX_ATTACHMENT_BYTES) {
          toast.error(`${file.name} passa do limite de ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
          continue;
        }

        await uploadCharacterFile(codigo, personagem.id, file);
      }

      reler();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao enviar.");
    } finally {
      setEnviando(false);
      // Zera a entrada para o mesmo arquivo poder ser escolhido de novo: sem
      // isso, o `change` não dispara na segunda tentativa.
      if (entrada.current) entrada.current.value = "";
    }
  }

  function fecharVisualizador() {
    if (abrindo) revokeCharacterFileUrl(personagem.id, abrindo);
    setUrl(null);
    setAbrindo(null);
  }

  return (
    <section className="space-y-2 rounded-lg border p-3">
      <h3 className="text-sm font-medium">{personagem.nome}</h3>

      {/* Os três campos do personagem, juntos e antes do resto: é o que o
          mestre nomeou, e é o que o jogador vem ver. Retrato e miniatura saem
          do acervo, e `/asset/{id}` é aberto para a mesa — o celular os alcança
          sem credencial própria. A ficha é anexo, atrás do token, e por isso
          abre por toque em vez de aparecer desenhada.

          A ficha sai da lista de arquivos abaixo, onde estava antes: ela tem
          lugar próprio aqui, e nos dois lugares o mesmo arquivo aparecia duas
          vezes — uma delas com um X que o jogador nem pode usar. */}
      {personagem.ficha || personagem.retrato || personagem.miniatura ? (
        <ul className="flex flex-wrap items-start gap-1.5">
          {personagem.ficha ? (
            <li className="space-y-0.5">
              <FichaTile arquivo={personagem.ficha} onAbrir={abrirAnexo} />
              <span className="text-muted-foreground block text-[10px]">Ficha</span>
            </li>
          ) : null}

          {([
            ["Retrato", personagem.retrato],
            ["Miniatura", personagem.miniatura],
          ] as const)
            .filter(([, assetId]) => Boolean(assetId))
            .map(([titulo, assetId]) => (
              <li key={titulo} className="space-y-0.5">
                <span className="bg-muted block size-14 overflow-hidden rounded border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/asset/${assetId}`}
                    alt={titulo}
                    draggable={false}
                    className="size-full object-cover"
                  />
                </span>
                <span className="text-muted-foreground block text-[10px]">{titulo}</span>
              </li>
            ))}
        </ul>
      ) : null}

      {soltos.length > 0 ? (
        <ul className="space-y-1">
          {soltos.map((anexo) => {
            const Icone = ICONE[attachmentKind(anexo.arquivo, anexo.mimeType)];

            return (
              <li
                key={`${anexo.autor}/${anexo.arquivo}`}
                className="bg-muted/40 flex items-center gap-2 rounded-md border p-1.5"
              >
                <Icone className="text-muted-foreground size-4 shrink-0" aria-hidden />

                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-xs"
                  onClick={() => abrirAnexo(anexo)}
                >
                  {anexo.arquivo}
                </button>

                <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                  {formatBytes(anexo.tamanho)}
                </span>

                {/* Só o que ele mesmo mandou. O arquivo do mestre é leitura —
                    é o outro lado da segmentação: a ficha existe independente
                    de quem joga, e não pode sumir porque alguém se irritou com
                    a sessão. */}
                {doJogador(anexo) ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Apagar ${anexo.arquivo}`}
                    onClick={() => {
                      void deleteCharacterFile(codigo, personagem.id, anexo.arquivo).then(
                        reler,
                        (cause) =>
                          toast.error(
                            cause instanceof Error ? cause.message : "Falha ao remover.",
                          ),
                      );
                    }}
                  >
                    {/* Lixeira: isto apaga o arquivo do disco do mestre, e não
                        o tira de uma lista. Mesma regra dos dois ícones do lado
                        dele. */}
                    <Trash2 />
                  </Button>
                ) : (
                  <span
                    className={cn(
                      "shrink-0 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] text-amber-300",
                    )}
                  >
                    do mestre
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <input
        ref={entrada}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => void enviar(event.target.files)}
      />

      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        disabled={enviando}
        onClick={() => entrada.current?.click()}
      >
        {enviando ? <Loader2 className="animate-spin" /> : <Paperclip />}
        Enviar arquivo
      </Button>

      <CharacterNote codigo={codigo} personagemId={personagem.id} />

      <AttachmentViewer attachment={abrindo} url={url} onClose={fecharVisualizador} />
    </section>
  );
}

/**
 * O bloco da ficha, do tamanho dos outros dois campos.
 *
 * Ícone, e não miniatura do arquivo. A ficha fica atrás do token, então
 * desenhá-la exigiria BAIXÁ-LA no carregamento da aba — um PDF de quarenta
 * megabytes puxado no 4G para render de cinquenta e seis pixels. E a blob é
 * compartilhada com o visualizador, que a revoga ao fechar: a miniatura
 * quebraria na primeira vez que o jogador fechasse a ficha.
 *
 * O ícone sai do tipo do arquivo, então uma ficha em imagem e uma em PDF não
 * ficam com o mesmo desenho.
 */
function FichaTile({
  arquivo,
  onAbrir,
}: {
  arquivo: string;
  onAbrir: (anexo: AnexoPersonagem) => void;
}) {
  // Montado do NOME, que é o que o campo guarda. O `mimeType` vazio deixa
  // `attachmentKind` cair na extensão, e o tipo de verdade da blob vem do
  // daemon na hora de abrir — ver `characterFileUrl`.
  const anexo: AnexoPersonagem = { arquivo, mimeType: "", tamanho: 0, autor: "mestre" };
  const Icone = ICONE[attachmentKind(arquivo, "")];

  return (
    <button
      type="button"
      className="bg-muted hover:bg-accent grid size-14 place-items-center rounded border"
      // O nome do arquivo vive no rótulo acessível e no título do visualizador:
      // dentro de um quadrado de cinquenta e seis pixels ele viraria três
      // letras e reticências. Retrato e miniatura também não mostram nome.
      aria-label={`Abrir ${arquivo}`}
      onClick={() => onAbrir(anexo)}
    >
      <Icone className="text-muted-foreground size-6 shrink-0" aria-hidden />
    </button>
  );
}

/**
 * A nota deste jogador sobre este personagem.
 *
 * Com atraso antes de gravar, e não a cada tecla: a escrita vai pela rede, e
 * uma requisição por letra numa mão pesada é dezenas de PUTs por frase. O
 * mestre grava no `blur` porque a janela dele é a mesma que escreve no disco;
 * aqui a aba pode fechar antes, e por isso o atraso é curto.
 */
function CharacterNote({
  codigo,
  personagemId,
}: {
  codigo: string;
  personagemId: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let ativo = true;

    void characterNote(codigo, personagemId).then(
      (lido) => {
        if (ativo) setTexto(lido);
      },
      () => {
        if (ativo) setTexto("");
      },
    );

    return () => {
      ativo = false;
    };
  }, [codigo, personagemId]);

  // O que estava pendente ao sair da tela ainda vai: o jogador que troca de aba
  // no meio de uma frase não deveria perdê-la.
  useEffect(() => {
    return () => clearTimeout(timer.current);
  }, []);

  if (texto === null) return null;

  return (
    <div className="space-y-1">
      <label className="text-muted-foreground text-[10px]" htmlFor={`nota-${personagemId}`}>
        Suas anotações
      </label>
      <Textarea
        id={`nota-${personagemId}`}
        className="min-h-20 resize-y text-sm"
        placeholder="O que você descobriu, o que quer lembrar."
        defaultValue={texto}
        onChange={(event) => {
          const valor = event.target.value;

          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            void writeCharacterNote(codigo, personagemId, valor).catch(() =>
              toast.error("Não foi possível gravar a anotação."),
            );
          }, DEBOUNCE_MS);
        }}
      />
    </div>
  );
}
