"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Loader2,
  Radio,
  RadioTower,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AttachmentViewer } from "@/components/attachments/attachment-viewer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MINIATURA } from "@/lib/miniatura";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { attachmentKind, type AttachmentKind } from "@/lib/attachments/kind";
import { shareAttachment } from "@/lib/vault/evidence";
// `formatBytes` vem do módulo do jogador porque é lá que o tamanho é escrito
// para ele; repetir a conta aqui faria a mesma pasta ser medida em duas
// unidades dependendo de quem olha.
import { formatBytes } from "@/lib/player/session";
import { DadoParado } from "@/components/playground/dado-parado";
import { useCharacterNames } from "@/hooks/use-character-names";
import { useRolagensStore } from "@/lib/store/use-rolagens-store";
import { valorDaRolagem } from "@/types/dado";
import {
  playerAttachments,
  playerAttachmentUrl,
  playerNotes,
  removePlayer,
  type Player,
  type PlayerAttachment,
} from "@/lib/vault/players";
import type { Nota } from "@/types/caderno";

const ICONE: Record<AttachmentKind, typeof File> = {
  image: FileImage,
  pdf: FileText,
  audio: FileAudio,
  video: FileVideo,
  text: FileText,
  other: File,
};

/**
 * A ficha de um jogador, do lado do mestre.
 *
 * Separada da lista porque as duas respondem perguntas diferentes: a lista é
 * "quem está aí", e isto é "o que este trouxe". Juntar as duas obrigava a
 * carregar os anexos de todos para mostrar nomes de arquivo que ninguém pediu
 * — uma chamada de IPC por jogador a cada sondagem.
 */
export function PlayerDialog({
  player,
  presente,
  onVoltar,
  onChanged,
}: {
  /** `null` mantém o diálogo fechado. */
  player: Player | null;
  presente: boolean;
  onVoltar: () => void;
  onChanged: () => void;
}) {
  return (
    <Dialog open={Boolean(player)} onOpenChange={(open) => !open && onVoltar()}>
      <DialogContent className="sm:max-w-md">
        {player ? (
          <Ficha
            player={player}
            presente={presente}
            onVoltar={onVoltar}
            onChanged={onChanged}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * O conteúdo, num componente à parte.
 *
 * O estado do apelido e a lista de anexos são deste jogador, e não do diálogo:
 * montar de novo a cada troca é o que garante que o campo não carregue o
 * apelido do anterior.
 */
function Ficha({
  player,
  presente,
  onVoltar,
  onChanged,
}: {
  player: Player;
  presente: boolean;
  onVoltar: () => void;
  onChanged: () => void;
}) {
  /** Os personagens dele. Substituiu o apelido — ver a seção abaixo. */
  const nomes = useCharacterNames();

  /**
   * O que este jogador tirou nesta sessão.
   *
   * Filtrado do histórico da mesa, e não guardado por jogador: a lista inteira
   * cabe em sessenta linhas, e um índice por jogador seria estrutura para
   * economizar um `filter` que roda quando alguém abre uma ficha.
   *
   * O `filter` fica no `useMemo` e NÃO dentro do seletor. Seletor que monta um
   * array novo a cada chamada devolve uma referência nova toda vez, e o zustand
   * compara por identidade para decidir se re-renderiza: o componente entraria
   * em laço.
   */
  const historico = useRolagensStore((state) => state.historico);
  const rolagens = useMemo(
    () => historico.filter((rolagem) => rolagem.jogadorId === player.id),
    [historico, player.id],
  );

  const [anexos, setAnexos] = useState<PlayerAttachment[] | null>(null);
  const [vendo, setVendo] = useState<PlayerAttachment | null>(null);

  /**
   * O caderno dele, lido quando a ficha abre.
   *
   * Aqui e não na lista de jogadores, pelo mesmo motivo dos anexos: são
   * duzentas notas possíveis por pessoa, e ninguém as pede para desenhar a
   * linha "Edgar — na mesa agora".
   */
  const [caderno, setCaderno] = useState<Nota[]>([]);

  useEffect(() => {
    let ativo = true;

    void playerNotes(player.id).then(
      (notas) => {
        if (ativo) setCaderno(notas);
      },
      // Silencioso: o resto da ficha — anexos, rolagens, o botão de tirar da
      // mesa — continua servindo sem o caderno.
      () => {
        if (ativo) setCaderno([]);
      },
    );

    return () => {
      ativo = false;
    };
  }, [player.id]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const spotlight = useSpotlightStore((state) => state.spotlight);
  const transmitShared = useSpotlightStore((state) => state.transmitShared);
  const limparEvidencia = useSpotlightStore((state) => state.clear);

  /**
   * Que endereço cada arquivo ganhou ao ser transmitido.
   *
   * Guardado para saber qual miniatura está no ar: o `sharedId` é sorteado a
   * cada transmissão, então comparar nome de arquivo não serve — e o que a
   * evidência carrega é o endereço, não o arquivo.
   */
  const [partilhados, setPartilhados] = useState<Record<string, string>>({});

  /**
   * As blob URLs abertas, para revogar na saída.
   *
   * Num ref além do estado porque a limpeza roda na desmontagem, e um efeito
   * com `[]` de dependências leria o `urls` de quando montou — vazio. O ref é
   * a mesma caixa do começo ao fim.
   */
  const abertas = useRef<Record<string, string>>({});

  useEffect(() => {
    let ativo = true;

    void playerAttachments(player.id).then(
      async (lista) => {
        if (!ativo) return;

        // A lista primeiro: os nomes e os tamanhos aparecem enquanto as
        // imagens descem, em vez de a ficha ficar em branco esperando o disco.
        setAnexos(lista);

        // Só as IMAGENS, e na abertura da ficha: elas são o preview, e sem
        // isso não há o que mostrar. O resto espera um clique — um PDF de
        // 40 MB atravessando o IPC para ninguém olhar é o desperdício que a
        // Jogador também evita.
        const resolvidas = await Promise.all(
          lista
            .filter(
              (anexo) =>
                attachmentKind(anexo.arquivo, anexo.mimeType) === "image",
            )
            .map(async (anexo) => {
              try {
                return [
                  anexo.arquivo,
                  await playerAttachmentUrl(player.id, anexo),
                ] as const;
              } catch {
                // Uma imagem ilegível deixa a miniatura dela vazia, e não a
                // ficha inteira sem arquivos.
                return null;
              }
            }),
        );

        const novas = Object.fromEntries(
          resolvidas.filter((par): par is [string, string] => par !== null),
        );

        // Trocar de jogador no meio do download: o que já foi criado tem de
        // ser revogado aqui, porque a limpeza da desmontagem só conhece o que
        // chegou ao ref.
        if (!ativo) {
          for (const url of Object.values(novas)) URL.revokeObjectURL(url);
          return;
        }

        abertas.current = { ...abertas.current, ...novas };
        setUrls({ ...abertas.current });
      },
      () => ativo && setAnexos([]),
    );

    return () => {
      ativo = false;
    };
  }, [player.id]);

  // Fechar a ficha devolve a memória: cada imagem vista é uma cópia do arquivo
  // na webview, e uma sessão de mesa abre a ficha de todo mundo.
  useEffect(
    () => () => {
      for (const url of Object.values(abertas.current))
        URL.revokeObjectURL(url);
      abertas.current = {};
    },
    [],
  );

  /**
   * Baixa um anexo que ainda não tem endereço.
   *
   * É o caminho de quem não é imagem: as imagens já vêm resolvidas com a
   * lista, para virarem miniatura, e este gancho cobre o clique num arquivo
   * que ninguém baixou ainda.
   */
  const abrir = useCallback(
    async (anexo: PlayerAttachment) => {
      if (abertas.current[anexo.arquivo]) return;

      try {
        const url = await playerAttachmentUrl(player.id, anexo);

        abertas.current = { ...abertas.current, [anexo.arquivo]: url };
        setUrls({ ...abertas.current });
      } catch {
        toast.error(`Não foi possível abrir ${anexo.arquivo}.`);
      }
    },
    [player.id],
  );

  // Imagem tem preview; o resto tem linha. Separar aqui deixa cada grupo com
  // a forma que o formato dele aguenta, em vez de uma lista só que serve mal
  // aos dois.
  const imagens = (anexos ?? []).filter(
    (anexo) => attachmentKind(anexo.arquivo, anexo.mimeType) === "image",
  );
  const outros = (anexos ?? []).filter(
    (anexo) => attachmentKind(anexo.arquivo, anexo.mimeType) !== "image",
  );

  /**
   * Põe um arquivo do jogador na frente de tudo, na TV e nos celulares.
   *
   * Duas etapas porque as origens da evidência são diferentes: uma imagem do
   * acervo já tem endereço público, e um anexo não — o daemon precisa abrir um
   * para ele antes. Se essa parte falhar, o mestre vê o aviso e a mesa não vê
   * evidência vazia.
   */
  async function transmitir(anexo: PlayerAttachment) {
    try {
      const sharedId = await shareAttachment(player.id, anexo.arquivo);

      setPartilhados((atual) => ({ ...atual, [anexo.arquivo]: sharedId }));
      transmitShared(sharedId, anexo.arquivo);
    } catch {
      toast.error(`Não foi possível transmitir ${anexo.arquivo}.`);
    }
  }

  return (
    <>
      <div className="flex items-start gap-2 pr-6">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Voltar à lista"
          className="-ml-1 shrink-0"
          onClick={onVoltar}
        >
          <ArrowLeft />
        </Button>

        <div className="min-w-0 flex-1">
          <DialogTitle className="flex items-center gap-2">
            <span
              className={`size-2 shrink-0 rounded-full ${presente ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
              aria-label={presente ? "na mesa agora" : "não visto há um tempo"}
            />
            <span className="truncate">{player.nome}</span>
          </DialogTitle>
          <DialogDescription className="mt-1">
            {presente ? "Na mesa agora." : "Não aparece há um tempo."}
          </DialogDescription>
        </div>
      </div>

      {/* Os personagens dele, no lugar onde ficava o apelido.

          O apelido era um campo de texto que o mestre preenchia à mão, e o que
          ele escrevia ali era quase sempre o personagem — os próprios testes do
          projeto o preenchiam com "o ladino". Com personagem de verdade, isto
          deixou de ser anotação e passou a ser vínculo: acompanha quando o
          mestre troca o personagem de mãos, e não vira mentira quando ele
          esquece de atualizar. Quem vincula é o diálogo de personagens. */}
      <section className="space-y-1.5">
        <p className="text-muted-foreground text-xs">Personagens</p>
        {(nomes.get(player.id) ?? []).length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Nenhum. Entregue um a ele pelo canto de personagens do palco — é o
            que dá acesso à ficha e às notas.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {(nomes.get(player.id) ?? []).map((nome) => (
              <li
                key={nome}
                className="bg-muted/40 rounded-md border px-2 py-0.5 text-xs"
              >
                {nome}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-1.5">
        <p className="text-muted-foreground text-xs">Arquivos</p>

        {anexos === null ? (
          <Loader2
            className="text-muted-foreground size-4 animate-spin"
            aria-label="Carregando"
          />
        ) : anexos.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Nada anexado. Retrato, ficha, mapa rabiscado — ele anexa na aba
            Personagem.
          </p>
        ) : (
          <div className="space-y-2">
            {/* As imagens como miniatura, aqui mesmo: o retrato do personagem
                é a coisa que o mestre mais olha nesta ficha, e uma linha
                dizendo "retrato.jpg" o obrigava a abrir para descobrir de quem
                é a cara. Clicar amplia, com o zoom do visualizador. */}
            {imagens.length > 0 ? (
              <ul className="grid grid-cols-3 gap-2">
                {imagens.map((anexo) => {
                  const noAr =
                    Boolean(spotlight?.sharedId) &&
                    partilhados[anexo.arquivo] === spotlight?.sharedId;

                  return (
                    <li key={anexo.arquivo} className="relative">
                      <button
                        type="button"
                        className="hover:border-primary/60 focus-visible:ring-ring block w-full overflow-hidden rounded-md border text-left focus-visible:ring-2 focus-visible:outline-none"
                        aria-label={`Ampliar ${anexo.arquivo}`}
                        onClick={() => setVendo(anexo)}
                      >
                        {urls[anexo.arquivo] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={urls[anexo.arquivo]}
                            alt={anexo.arquivo}
                            className="aspect-square w-full bg-black object-cover"
                            {...MINIATURA}
                          />
                        ) : (
                          <span className="bg-muted grid aspect-square w-full place-items-center">
                            <Loader2
                              className="text-muted-foreground size-4 animate-spin"
                              aria-hidden
                            />
                          </span>
                        )}
                        <span
                          className="block truncate p-1 text-[10px]"
                          title={anexo.arquivo}
                        >
                          {anexo.arquivo}
                        </span>
                      </button>

                      {/* Irmão da miniatura, e não dentro dela: botão dentro de
                        botão é HTML inválido, e a miniatura inteira já é o
                        alvo de ampliar. */}
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant={noAr ? "default" : "secondary"}
                              size="icon-xs"
                              className={
                                noAr
                                  ? "absolute top-1 right-1"
                                  : "bg-background/85 absolute top-1 right-1 backdrop-blur"
                              }
                              aria-label={
                                noAr
                                  ? `Tirar ${anexo.arquivo} da evidência`
                                  : `Transmitir ${anexo.arquivo} para a mesa`
                              }
                              aria-pressed={noAr}
                              // Clicar de novo no que já está no ar TIRA, como no
                              // anexo do ponto de anotação: o alvo é o mesmo, e
                              // procurar onde desligar com a imagem cobrindo a TV
                              // é o pior momento para procurar um botão.
                              onClick={() =>
                                noAr
                                  ? limparEvidencia()
                                  : void transmitir(anexo)
                              }
                            >
                              {noAr ? <RadioTower /> : <Radio />}
                            </Button>
                          }
                        />
                        <TooltipContent>
                          <p className="max-w-48">
                            {noAr
                              ? "No ar agora. Clique para tirar."
                              : "Põe este arquivo na frente de tudo, na TV e nos celulares. O endereço morre quando sair do ar."}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {/* O que não é imagem segue em linha, com o tamanho: uma
                miniatura de PDF pediria baixar o arquivo inteiro para
                desenhar a primeira página, e um vídeo de 60 MB lido pelo IPC
                para virar quadrado de 80px é caro pelo que informa. Clicar
                abre no visualizador. */}
            {outros.length > 0 ? (
              <ul className="space-y-0.5">
                {outros.map((anexo) => {
                  const Icone =
                    ICONE[attachmentKind(anexo.arquivo, anexo.mimeType)];

                  return (
                    <li key={anexo.arquivo}>
                      <button
                        type="button"
                        className="hover:bg-accent flex w-full items-center gap-2 rounded-md p-1 text-left text-xs"
                        onClick={() => setVendo(anexo)}
                      >
                        <Icone
                          className="text-muted-foreground size-3.5 shrink-0"
                          aria-hidden
                        />
                        <span className="truncate" title={anexo.arquivo}>
                          {anexo.arquivo}
                        </span>
                        <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
                          {formatBytes(anexo.tamanho)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-1.5">
        <p className="text-muted-foreground text-xs">O que ele tirou</p>

        {/* Da sessão, e só dela: o histórico da mesa vive na memória desta
            janela, não no cofre. Ver `useRolagensStore`. */}
        {rolagens.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Nenhum dado nesta sessão.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {rolagens.map((rolagem) => (
              <li
                key={rolagem.id}
                className="flex items-center gap-1 rounded border px-1.5 py-0.5"
                title={`d${rolagem.faces}`}
              >
                <DadoParado
                  faces={rolagem.faces}
                  valor={rolagem.valor}
                  tamanho={18}
                />
                <span className="text-xs font-medium tabular-nums">
                  {valorDaRolagem(rolagem.faces, rolagem.valor)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-1.5">
        <p className="text-muted-foreground text-xs">Caderno dele</p>

        {/* O caderno é dele, mas o mestre é dono do disco: não faz sentido
            esconder na tela o que está em texto no SQLite ao lado. O que o
            token protege é o acesso de OUTRO jogador.

            Só leitura, e não um campo editável: escrever na anotação alheia é
            outra coisa, e não é uma que o mestre precise fazer. */}
        <Caderno notas={caderno} />
      </section>

      {/* O mesmo visualizador do Jogador, com o zoom que ele já traz: a
          pergunta "que retrato é esse?" é a mesma dos dois lados da mesa. */}
      <AttachmentViewer
        attachment={vendo}
        url={vendo ? (urls[vendo.arquivo] ?? null) : null}
        onOpen={abrir}
        onClose={() => setVendo(null)}
      />

      <Button
        variant="destructive"
        size="sm"
        className="w-full"
        onClick={() => {
          void removePlayer(player.id).then(
            () => {
              onChanged();
              onVoltar();
            },
            () => toast.error("Não foi possível tirar o jogador da mesa."),
          );
        }}
      >
        <Trash2 />
        Tirar {player.nome} da mesa, com os arquivos
      </Button>
    </>
  );
}

/**
 * O caderno do jogador, do lado do mestre.
 *
 * Em texto CRU, com os `@`, `/` e `#` à vista, e isso é deliberado: as menções
 * de uma nota resolvem contra o que AQUELE jogador alcança — os personagens que
 * ele conhece, os arquivos dos personagens dele, as outras notas dele. Pintá-las
 * aqui pediria montar o mundo dele dentro da janela do mestre para transformar
 * `/ficha.pdf` num botão que abriria o arquivo de outra pessoa.
 *
 * Rolagem no bloco inteiro, e não por nota: o mestre está lendo para saber o
 * que a mesa anotou, e uma caixa de rolagem por nota transformaria isso em
 * dezenas de janelinhas de três linhas.
 */
function Caderno({ notas }: { notas: Nota[] }) {
  if (notas.length === 0) {
    return <p className="text-muted-foreground text-xs">Nada escrito ainda.</p>;
  }

  return (
    <ul className="scroll-fade max-h-56 space-y-2 overflow-y-auto">
      {notas.map((nota) => (
        <li key={nota.id} className="rounded border px-2 py-1.5">
          <p className="truncate text-xs font-medium">
            {nota.titulo || "Sem título"}
          </p>

          {nota.tags.length > 0 ? (
            <p className="text-muted-foreground mt-0.5 text-[10px]">
              {nota.tags.join(" · ")}
            </p>
          ) : null}

          {nota.texto ? (
            <p className="mt-1 text-xs whitespace-pre-wrap">{nota.texto}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
