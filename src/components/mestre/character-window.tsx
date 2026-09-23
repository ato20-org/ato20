"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Loader2,
  Paperclip,
  Pencil,
  Radio,
  RadioTower,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAssetList } from "@/hooks/use-asset-list";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useCharacters } from "@/hooks/use-characters";
import { useFecharJanela } from "@/hooks/use-fechar-janela";
import { useFontesDeRetrato } from "@/hooks/use-fontes-de-retrato";
import { fonteDaUrl, urlDaFonte } from "@/lib/extensoes/fontes";
import { usePaginaVivaSuportada } from "@/lib/motor";
import { MINIATURA } from "@/lib/miniatura";
import {
  attachmentKind,
  imageMimeByName,
  type AttachmentKind,
} from "@/lib/attachments/kind";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { chaveDe, type ConteudoJanela } from "@/lib/store/use-window-store";
import { invalidarAcervo } from "@/lib/store/use-assets-store";
import { setAssetEscopo } from "@/lib/vault/assets";
import { shareCharacterAttachment } from "@/lib/vault/evidence";

import { PlayerDialog } from "@/components/mestre/player-dialog";
import { presente } from "@/hooks/use-players";
import { desde } from "@/lib/tempo";
import { InventarioPersonagem } from "./inventario-personagem";
import { SecaoFicha } from "./secao-ficha";
import { formatBytes } from "@/lib/player/session";
import {
  attachToCharacter,
  characterAttachmentUrl,
  characterAttachments,
  characterNote,
  characterPlayers,
  detachFromCharacter,
  linkCharacter,
  removeCharacter,
  renameCharacter,
  preencherCampoComArquivo,
  setCharacterCampo,
  setCharacterNote,
  unlinkCharacter,
} from "@/lib/vault/characters";
import type { Player } from "@/lib/vault/players";
import { cn } from "@/lib/utils";
import type {
  AnexoPersonagem,
  CampoPersonagem,
  Personagem,
} from "@/types/character";
import { doJogador } from "@/types/character";
import { AparenciasPersonagem } from "@/components/mestre/aparencias-personagem";

const ICONE: Record<AttachmentKind, typeof File> = {
  image: FileImage,
  pdf: FileText,
  audio: FileAudio,
  video: FileVideo,
  text: FileText,
  other: File,
};

/**
 * A ficha de um personagem: nome, arquivos, campos e donos.
 *
 * Uma janela por personagem, e não uma que troca de conteúdo: duas fichas lado
 * a lado é o caso real — comparar o que dois jogadores têm, ou conduzir uma
 * cena com os dois presentes. A chave da janela sai do id, então clicar duas
 * vezes no mesmo nome traz a que já está aberta para a frente em vez de
 * duplicá-la. Ver `chaveDe`.
 *
 * Corpo sem moldura: quem desenha cabeçalho, arrasto e X é a moldura de fora —
 * `InnerWindow` quando a ficha flutua, a tira de abas do grupo quando ela está
 * atracada numa coluna. O mesmo corpo serve aos dois.
 */
export function CharacterBody({ personagemId }: { personagemId: string }) {
  const { personagens, jogadores, recarregar } = useCharacters();
  const fecharJanela = useFecharJanela();
  const abrirJanela = useAbrirJanela();

  const personagem =
    personagens?.find((atual) => atual.id === personagemId) ?? null;

  const chave = chaveDe({ tipo: "personagem", personagemId });

  // Apagado por outra janela — ou pela própria, no botão da lixeira: a ficha de
  // quem não existe mais sai da tela em vez de ficar mostrando o último retrato
  // dele. `personagens === null` é "ainda não leu", e não "não existe".
  useEffect(() => {
    if (personagens !== null && !personagem) fecharJanela(chave);
  }, [personagens, personagem, fecharJanela, chave]);

  if (!personagem) {
    return <p className="text-muted-foreground p-4 text-xs">Lendo…</p>;
  }

  return (
    <Ficha
      personagem={personagem}
      jogadores={jogadores}
      onChanged={recarregar}
      // `recarregar` junto, e nao so fechar: quem apaga mexeu na LISTA, e o
      // store so rele quando alguem pede. Sem isto o personagem sumia da
      // pasta mas continuava na barra ate a janela ser recarregada.
      onRemoved={() => {
        fecharJanela(chave);
        recarregar();
      }}
      onAbrirJanela={abrirJanela}
    />
  );
}

/**
 * O conteúdo, num componente à parte.
 *
 * Separado da moldura porque `personagem` já chega garantido aqui: as leituras
 * de anexo e de dono são deste personagem, e um componente que aceitasse `null`
 * teria de checar isso em cada uma delas.
 */
function Ficha({
  personagem,
  jogadores,
  onChanged,
  onRemoved,
  onAbrirJanela,
}: {
  personagem: Personagem;
  jogadores: Player[];
  onChanged: () => void;
  onRemoved: () => void;
  onAbrirJanela: (conteudo: ConteudoJanela) => void;
}) {
  const [anexos, setAnexos] = useState<AnexoPersonagem[]>([]);
  const [donos, setDonos] = useState<string[]>([]);
  const [anexando, setAnexando] = useState(false);

  /**
   * Contador de releituras dos ANEXOS, local a esta ficha.
   *
   * Separado do contador compartilhado do `useCharactersStore`: anexar arquivo
   * ao Edgar não tem por que fazer a ficha da Mira reler a pasta dela. O que é
   * compartilhado é o índice — nome, campos, quem existe.
   */
  const [versao, setVersao] = useState(0);
  const relerAnexos = useCallback(() => setVersao((atual) => atual + 1), []);

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
        toast.error(
          cause instanceof Error ? cause.message : "Falha ao ler os arquivos.",
        );
      },
    );

    return () => {
      ativo = false;
    };
  }, [personagem.id, versao]);

  /**
   * Abre um arquivo como JANELA, e não como modal por cima desta.
   *
   * Ver a imagem grande enquanto a ficha continua à vista é o ponto: no modal,
   * conferir se o token é o certo cobria a ficha de onde o token saiu. E a
   * janela da imagem entra na mesma pilha desta, então ela vem para a frente
   * quando é ela que está em uso.
   */
  function abrirAnexo(anexo: AnexoPersonagem) {
    onAbrirJanela({ tipo: "anexo", personagemId: personagem.id, anexo });
  }

  /** Abre uma imagem do acervo — retrato, miniatura. */
  function abrirImagem(assetId: string, nome: string) {
    onAbrirJanela({ tipo: "asset", assetId, nome });
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

  const donosNomes = jogadores
    .filter((jogador) => donos.includes(jogador.id))
    .map((jogador) => jogador.nome);

  return (
    <ScrollArea className="min-h-0 flex-1">
      {/* `@container`, e nao breakpoint de tela: esta janela flutua, atraca numa
          coluna e redimensiona na mao. A largura dela nao tem relacao nenhuma
          com a da tela, e um `md:` aqui quebraria em duas colunas uma ficha de
          360 pixels so porque o monitor e grande. */}
      <div className="@container/ficha space-y-4 p-3">
        <Identidade
          personagem={personagem}
          donos={donosNomes}
          onChanged={onChanged}
          onRemoved={onRemoved}
          onAbrirImagem={abrirImagem}
        />

        {/* Duas colunas a partir de 560: abaixo disso os quadros do inventario
            cairiam para 50 pixels, e a grade de cinco deixaria de ser legivel.
            Acima, e a largura que a janela larga finalmente usa -- antes ela so
            esticava o texto das mesmas linhas empilhadas. */}
        <div className="grid gap-4 @[560px]/ficha:grid-cols-2 @[560px]/ficha:gap-x-6">
          <div className="min-w-0 space-y-4">
            {/* Os dois: preencher a ficha muda o ÍNDICE (o campo) e a pasta de
                anexos (o arquivo). Chamando só `onChanged`, a lista de arquivos
                ficava dizendo "nada anexado" com a ficha já posta. */}
            <SecaoFicha secao="campos" titulo="Campos do personagem">
              <Slots
                personagem={personagem}
                onChanged={() => {
                  onChanged();
                  relerAnexos();
                }}
                onAbrirAnexo={abrirAnexo}
                onAbrirImagem={abrirImagem}
              />
            </SecaoFicha>

            {/* Logo abaixo dos campos, e não numa coluna própria: a aparência é
                o que aqueles campos mostram, e a distância entre "escolhi
                Ferido" e "troquei a miniatura" é a distância entre os dois
                gestos que essa troca sempre pede. */}
            <AparenciasPersonagem
              personagem={personagem}
              onChanged={onChanged}
            />

            <Files
              personagemId={personagem.id}
              anexos={anexos}
              ficha={personagem.ficha}
              anexando={anexando}
              onAnexar={() => void anexar()}
              onAbrir={abrirAnexo}
              onRemover={async (anexo) => {
                await detachFromCharacter(
                  personagem.id,
                  anexo.autor,
                  anexo.arquivo,
                );
                relerAnexos();
                // Apagar o anexo da ficha limpa o CAMPO ficha do lado nativo —
                // ver `remove_anexo`. Sem reler o índice, a linha da ficha
                // continuaria mostrando o nome de um arquivo que saiu do disco.
                onChanged();
              }}
            />
          </div>

          <div className="min-w-0 space-y-4">
            {/* O inventário abre a coluna da direita porque é o bloco que mais
                pede largura: a grade é de cinco, e cada coluna a mais de janela
                vira quadro maior. Recarrega os anexos junto porque a imagem de
                item do jogador é um anexo — e a lista de arquivos subtrai
                justamente os que o inventário usa. */}
            <InventarioPersonagem
              personagem={personagem}
              onChangedAnexos={relerAnexos}
            />

            {/* Os dois de novo: vincular muda quem são os donos DESTA ficha, que
                é leitura local, e muda o nome que a lista de personagens mostra
                embaixo do nome dele — outra janela. Ver `useCharacterOwners`. */}
            <Owners
              personagem={personagem}
              jogadores={jogadores}
              donos={donos}
              onChanged={() => {
                relerAnexos();
                onChanged();
              }}
            />
          </div>
        </div>

      </div>
    </ScrollArea>
  );
}

/**
 * O que existe ALÉM dos campos: anexos soltos, dos dois autores.
 *
 * A ficha sai daqui de propósito. Ela é anexo como qualquer outro no disco, mas
 * na tela é um CAMPO — tem linha própria, com miniatura, transmitir e trocar.
 * Aparecendo nos dois lugares, a mesma ficha ficava com dois nomes de gesto:
 * "Trocar" ali e um X aqui, um que limpa o campo e outro que apaga o arquivo.
 * O que sobra nesta lista é o que ninguém nomeou — o mapa da masmorra que o
 * mestre anexou, o desenho que o jogador mandou.
 */
/**
 * Quem o personagem e: retrato, nome, lixeira, e quem joga com ele.
 *
 * No topo e fora das secoes colapsaveis, porque e a unica parte que nao faz
 * sentido fechar -- uma ficha sem nome nem rosto seria uma janela em branco
 * dentro de uma janela com titulo.
 *
 * O retrato veio para ca de dentro dos campos. Ele continua editavel la, no
 * quadro dele; aqui ele so identifica, e e por isso que o quadrado nao tem
 * botao nenhum: dois lugares para trocar a mesma imagem foi o problema que a
 * lista de arquivos e a linha da ficha ja tinham -- ver `Files`.
 */
/**
 * O que a pessoa perde ao apagar um personagem.
 *
 * Exportado porque a pergunta e feita em DOIS lugares -- a lixeira da ficha e a
 * lista de personagens -- e um aviso de coisa irreversivel que diverge entre as
 * duas portas e pior que nenhum: a pessoa leria um dos textos e decidiria pelo
 * outro.
 *
 * LISTA e nao paragrafo. Era um bloco de cinco linhas corridas, e ninguem le
 * texto denso com o dedo ja no botao vermelho -- o que se lia era o titulo e o
 * "Apagar". Em itens, o preco se conta de relance, e cada linha e uma coisa
 * so. O aviso de que nao tem volta sai do fim do paragrafo, onde era a sexta
 * informacao seguida, e vira a ultima linha com um simbolo ao lado.
 *
 * Componente e nao string por causa disso: o que importa aqui e a forma.
 */
export function OQueVaiJunto() {
  return (
    <>
      <p>
        Ao apagar você vai <strong className="text-foreground">remover</strong>
      </p>

      {/* Substantivo solto, sem artigo e sem oracao. A lista responde "o que
          vai embora", e "a ficha dele", "os que o jogador mandou" faziam cada
          item comecar por uma palavra que nao carrega informacao nenhuma --
          quatro linhas para ler quatro coisas. Aqui o olho bate na primeira
          palavra de cada uma e ja sabe. */}
      <ul className="text-foreground marker:text-muted-foreground/40 list-disc space-y-0.5 pl-4">
        <li>Ficha</li>
        <li>Arquivos em anexo</li>
        <li>Arquivos do jogador</li>
        <li>Anotações</li>
      </ul>

      {/* O que NAO vai junto, e a pergunta que se faz no meio da sessao: o
          token ja posto no mapa nao some com o personagem. Fica fora da lista
          de proposito -- a lista e do que se perde. */}
      <p>O token no mapa continua lá, como imagem.</p>

      <p className="text-foreground flex items-center gap-1.5 font-medium">
        <TriangleAlert className="size-4 shrink-0 text-amber-400" aria-hidden />
        Não tem como desfazer isso
      </p>
    </>
  );
}

function Identidade({
  personagem,
  donos,
  onChanged,
  onRemoved,
  onAbrirImagem,
}: {
  personagem: Personagem;
  /** Os nomes de quem joga com ele, para a linha embaixo do nome. */
  donos: string[];
  onChanged: () => void;
  onRemoved: () => void;
  onAbrirImagem: (assetId: string, nome: string) => void;
}) {
  const retrato = useAssetUrl(personagem.retrato);

  const [editando, setEditando] = useState(false);
  /** Saiu pelo Escape: o `blur` que vem em seguida não deve gravar. */
  const desistiu = useRef(false);

  return (
    <div className="flex items-start gap-3">
      {personagem.retrato ? (
        <Thumb
          url={retrato}
          alt={personagem.nome}
          onAbrir={() =>
            onAbrirImagem(personagem.retrato as string, personagem.nome)
          }
          className="size-16 rounded-md"
        />
      ) : (
        // Sem retrato, um quadrado vazio seria indistinguível de um que ainda
        // está carregando. O ícone diz que não há imagem, e a borda tracejada
        // repete a mesma pista do quadro vazio dos campos.
        <span className="bg-muted/40 flex size-16 shrink-0 items-center justify-center rounded-md border border-dashed">
          <FileImage className="text-muted-foreground/40 size-6" aria-hidden />
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          {editando ? (
            <Input
              className="h-8 min-w-0 flex-1 text-sm font-medium"
              defaultValue={personagem.nome}
              aria-label="Nome do personagem"
              // O campo nasce com o foco e com o texto todo marcado: quem
              // clicou no lápis quer escrever, e não posicionar cursor primeiro.
              autoFocus
              onFocus={(event) => event.target.select()}
              onKeyDown={(event) => {
                // Enter grava pelo mesmo caminho do `blur`, em vez de duplicar
                // a gravação aqui: uma escrita só, um lugar só para errar.
                if (event.key === "Enter") event.currentTarget.blur();

                if (event.key === "Escape") {
                  desistiu.current = true;
                  event.currentTarget.blur();
                }
              }}
              // No `blur`, e não a cada tecla: renomear reescreve o índice
              // inteiro, e gravar por tecla o regravaria a cada letra.
              onBlur={(event) => {
                setEditando(false);

                // Escape sai sem gravar. A marca é um `ref` e não estado
                // porque ela é lida no `blur` que acontece no mesmo gesto --
                // um `setState` aqui só chegaria no render seguinte.
                if (desistiu.current) {
                  desistiu.current = false;
                  return;
                }

                const nome = event.target.value.trim();
                if (!nome || nome === personagem.nome) return;

                void renameCharacter(personagem.id, nome).then(onChanged);
              }}
            />
          ) : (
            <>
              {/* Texto, e não um campo sempre aberto. Um `input` em volta do
                  nome diz "isto está para ser escrito", e o que o mestre faz
                  com esta linha quase sempre é LER — ele nomeia o personagem
                  uma vez. O lápis é o que separa as duas coisas. */}
              <h2
                className="min-w-0 flex-1 truncate text-sm font-medium"
                title={personagem.nome}
              >
                {personagem.nome}
              </h2>

              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Renomear ${personagem.nome}`}
                onClick={() => setEditando(true)}
              >
                <Pencil />
              </Button>
            </>
          )}

          {/* Pergunta antes, e é a única ação do aplicativo que pergunta.
              Apagar cena ou imagem tem desfazer; isto não tem: o personagem sai
              do índice, a pasta dele sai do disco com a ficha e os anexos
              dentro, e as notas que os jogadores escreveram vão com ele. E a
              lixeira fica a um clique do campo de nome, que é onde a mão está
              logo depois de renomear. */}
          <AlertDialog>
            {/* Sem tooltip: ele avisava o que a lixeira apaga, e agora é o
                próprio diálogo que faz isso -- com mais espaço e no momento em
                que a informação importa. Dois textos dizendo a mesma coisa, um
                no hover e um depois do clique, era um deles a mais. */}
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Apagar este personagem"
                >
                  <Trash2 />
                </Button>
              }
            />

            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Deseja apagar {personagem.nome}?
                </AlertDialogTitle>
                {/* `render` de `div`: a descricao nasce `<p>`, e uma `<ul>`
                    dentro de um `<p>` o navegador fecha sozinho antes da
                    lista -- o texto saia do lugar sem erro nenhum no console. */}
                <AlertDialogDescription render={<div className="space-y-2" />}>
                  <OQueVaiJunto />
                </AlertDialogDescription>
              </AlertDialogHeader>

              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    void removeCharacter(personagem.id).then(
                      onRemoved,
                      (cause) =>
                        toast.error(
                          cause instanceof Error
                            ? cause.message
                            : "Falha ao apagar.",
                        ),
                    );
                  }}
                >
                  Apagar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Quem joga com ele, aqui em cima e nao so la embaixo: e a pergunta que
            se faz olhando a ficha de longe -- "de quem e este?" --, e a resposta
            estava a oitocentos pixels de rolagem dentro de uma secao. La embaixo
            continua a lista que se EDITA; aqui e so o que ela diz. */}
        <p className="text-muted-foreground truncate text-[11px]">
          {donos.length === 0 ? "Sem dono" : donos.join(", ")}
        </p>
      </div>
    </div>
  );
}

function Files({
  personagemId,
  anexos,
  ficha,
  anexando,
  onAnexar,
  onAbrir,
  onRemover,
}: {
  personagemId: string;
  anexos: AnexoPersonagem[];
  /** O nome do arquivo que é a ficha, para não repeti-lo aqui. */
  ficha: string | undefined;
  anexando: boolean;
  onAnexar: () => void;
  onAbrir: (anexo: AnexoPersonagem) => void;
  onRemover: (anexo: AnexoPersonagem) => Promise<void>;
}) {
  // Só a do mestre: um "ficha-edgar.jpg" que o JOGADOR mandou é outro arquivo,
  // noutra pasta, e não é o campo. Ver `AnexoAutor`.
  const soltos = anexos.filter(
    (anexo) => !(anexo.autor === "mestre" && anexo.arquivo === ficha),
  );

  return (
    <SecaoFicha secao="arquivos" titulo="Arquivos" contagem={soltos.length}>
      <div className="space-y-2">
        {soltos.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Nada além dos campos. O que entrar aqui o jogador vinculado também
            lê.
          </p>
        ) : (
          <ul className="space-y-1">
            {soltos.map((anexo) => {
              const kind = attachmentKind(anexo.arquivo, anexo.mimeType);
              const Icone = ICONE[kind];

              return (
                <li
                  key={`${anexo.autor}/${anexo.arquivo}`}
                  className="bg-muted/40 flex items-center gap-2 rounded-md border p-1.5"
                >
                  {/* Imagem mostra a imagem, e não o ícone de imagem: numa
                    campanha com trinta arquivos "logo1.png" não diz nada, e o
                    ícone diz menos ainda. O resto continua ícone — não há
                    miniatura de PDF nem de som para mostrar. */}
                  {kind === "image" ? (
                    <AnexoThumb
                      key={anexo.arquivo}
                      personagemId={personagemId}
                      anexo={anexo}
                      Fallback={Icone}
                      onAbrir={() => onAbrir(anexo)}
                    />
                  ) : (
                    <Icone
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden
                    />
                  )}

                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-xs hover:underline"
                    onClick={() => onAbrir(anexo)}
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

                  {/* Lixeira, e não X: isto APAGA o arquivo do disco, e não o
                    tira de uma lista. A regra dos dois ícones no aplicativo é
                    essa -- lixeira destrói, X fecha ou desfaz um vínculo --, e
                    um X aqui prometia algo reversível que não é.

                    O mestre alcança os dois autores, que é o lado dele da
                    segmentação. O jogador só apaga o que ele mesmo mandou. */}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Apagar ${anexo.arquivo}`}
                    onClick={() => void onRemover(anexo)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {/* O caminho no disco era um rodapé fixo em toda ficha; é informação
            de uma vez só, e mora onde o arquivo entra. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="secondary"
                size="sm"
                disabled={anexando}
                onClick={onAnexar}
              />
            }
          >
            {anexando ? <Loader2 className="animate-spin" /> : <Paperclip />}
            Anexar arquivos
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-64">
            Ficam em <code>personagens/{personagemId}/anexos/</code>, separados
            por quem os pôs ali. O jogador vinculado também os lê.
          </TooltipContent>
        </Tooltip>
      </div>
    </SecaoFicha>
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
      const id = await shareCharacterAttachment(
        personagemId,
        anexo.autor,
        anexo.arquivo,
      );
      setSharedId(id);
      transmitShared(id, anexo.arquivo);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao transmitir.",
      );
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
          {noAr
            ? "No ar agora. Clique para tirar."
            : "Põe este arquivo na frente de tudo."}
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
const CAMPOS: Array<{ campo: CampoPersonagem; titulo: string; nota: string }> =
  [
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

/**
 * O retrato ao vivo: uma página externa no lugar da imagem parada.
 *
 * Fora da lista `CAMPOS` porque o gesto é outro: aqueles três abrem um seletor
 * de ARQUIVO, e este pede um texto colado. Uma linha de arquivo com um campo de
 * texto dentro pareceria um dos três e se comportaria como nenhum.
 *
 * Convive com o Retrato do acervo em vez de substituí-lo. Quem tem os dois vê a
 * página, com a imagem atrás — é o que mantém o rosto na mesa quando a internet
 * cai no meio da sessão.
 *
 * O que é gravado é a URL INTEIRA, mesmo quando montada por uma fonte: o dia em
 * que a extensão for desinstalada, o retrato continua desenhando. A fonte
 * escolhida é reconhecida de volta pelo começo da URL — ver `fonteDaUrl`.
 */
function RetratoAoVivo({
  personagem,
  onChanged,
}: {
  personagem: Personagem;
  onChanged: () => void;
}) {
  const fontes = useFontesDeRetrato();
  const paginaVivaOk = usePaginaVivaSuportada();
  const salva = personagem.retratoUrl ?? "";
  const fonteSalva = salva ? fonteDaUrl(salva, fontes) : null;

  // `URL completa` é a opção sempre presente, e o padrão de quem não tem
  // extensão nenhuma: colar o link do serviço funciona sem plugin.
  const [fonteId, setFonteId] = useState<string>(fonteSalva?.fonte ?? "");
  const [texto, setTexto] = useState(() =>
    fonteSalva
      ? salva.slice(fonteSalva.modelo.split("{codigo}")[0].length)
      : salva,
  );
  const [salvando, setSalvando] = useState(false);

  const fonte = fontes.find((atual) => atual.fonte === fonteId) ?? null;
  const alvo = texto.trim()
    ? fonte
      ? urlDaFonte(fonte, texto)
      : texto.trim()
    : null;
  const mudou = (alvo ?? "") !== salva;

  async function gravar(valor: string | null) {
    setSalvando(true);

    try {
      await setCharacterCampo(personagem.id, "retratoUrl", valor);
      onChanged();
    } catch (causa) {
      toast.error(
        causa instanceof Error ? causa.message : "Não deu para gravar.",
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={
                    salva
                      ? "Retrato ao vivo, configurado"
                      : "Pôr um retrato ao vivo"
                  }
                  className={cn(
                    "focus-visible:ring-ring absolute top-1 right-1 z-10 flex size-5 items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-none",
                    // Aceso quando há URL, apagado quando não: é a informação
                    // que o bloco antigo gastava cem pixels e um parágrafo para
                    // dar, e que agora se lê sem abrir nada.
                    salva
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/80 text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-hover/slot:opacity-100 group-focus-within/slot:opacity-100 motion-reduce:transition-none",
                  )}
                >
                  <Zap className="size-3" aria-hidden />
                </button>
              }
            />
          }
        />
        <TooltipContent>
          <p className="max-w-48">
            {salva
              ? "Retrato ao vivo no ar. Clique para trocar."
              : "Retrato ao vivo"}
          </p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="start" className="w-80 space-y-2">
        <div>
          <h3 className="text-xs font-medium">Retrato ao vivo</h3>
          <p className="text-muted-foreground text-[11px]">
            Uma página que se atualiza sozinha — vida, sanidade, o que o serviço
            mostrar. Sem internet ela não carrega, e o Retrato do acervo aparece
            no lugar.
          </p>
        </div>

        <div className="flex gap-1.5">
          {/* O seletor só existe quando há o que selecionar: com nenhuma extensão
            de fonte instalada, ele seria um menu de uma opção só. */}
          {fontes.length > 0 ? (
            <select
              value={fonteId}
              onChange={(evento) => {
                setFonteId(evento.target.value);
                setTexto("");
              }}
              aria-label="Fonte do retrato"
              className="border-input bg-background h-8 shrink-0 rounded-md border px-2 text-xs"
            >
              <option value="">URL completa</option>
              {fontes.map((atual) => (
                <option key={atual.fonte} value={atual.fonte}>
                  {atual.rotulo}
                </option>
              ))}
            </select>
          ) : null}

          <Input
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder={fonte ? (fonte.exemplo ?? fonte.campo) : "https://…"}
            aria-label={fonte ? fonte.campo : "URL do retrato ao vivo"}
            className="h-8 min-w-0 flex-1 text-xs"
            // Enter grava: o campo tem um valor só, e pedir um clique depois de
            // colar é um passo a mais para a coisa mais frequente aqui.
            onKeyDown={(evento) => {
              if (evento.key === "Enter" && mudou && alvo) void gravar(alvo);
            }}
          />

          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            disabled={salvando || !mudou || !alvo}
            onClick={() => alvo && void gravar(alvo)}
          >
            Usar
          </Button>

          {salva ? (
            <Button
              size="icon"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive size-8 shrink-0"
              aria-label="Tirar o retrato ao vivo"
              disabled={salvando}
              onClick={() => {
                setTexto("");
                setFonteId("");
                void gravar(null);
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>

        {/* A URL gravada por extenso, e não só "configurado": é ela que a mesa
          vai abrir, e conferir o link é o jeito de descobrir que se colou o do
          personagem errado. */}
        {salva ? (
          <p
            className="text-muted-foreground truncate font-mono text-[10px]"
            title={salva}
          >
            {salva}
          </p>
        ) : null}

        {/* O aviso só aparece quando há URL E esta tela não desenha página viva.
          Sem ele, o mestre veria a imagem parada na própria bancada e concluiria
          que o link está errado -- quando ele está certo, e a mesa está vendo. */}
        {salva && !paginaVivaOk ? (
          <p className="text-muted-foreground text-[11px]">
            Esta tela não desenha página viva — ela usa o motor WebKit, e é uma
            limitação do serviço, não do link. Aqui aparece o Retrato do acervo.
            <strong className="font-medium">
              {" "}
              A TV e os celulares Android mostram normalmente
            </strong>
            ; iPhone, não, porque todo navegador de iOS é WebKit.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Os tres campos nomeados, como QUADROS e nao como linhas.
 *
 * Eram tres linhas de 56 pixels com miniatura, titulo, nome do arquivo e dois
 * botoes -- 190 pixels de altura para dizer tres coisas. O Jogador ja mostrava
 * os mesmos tres como quadrados de 80 lado a lado, e ali eles se leem de
 * relance: o que identifica um retrato e a cara dele, nao o nome do arquivo.
 *
 * O que se perdeu na troca foi o nome do arquivo sempre visivel. Ele continua
 * no `title` do quadro e no visualizador, e o caso em que importava -- conferir
 * se o token e o certo -- sempre pediu a imagem grande, nao um nome truncado em
 * dez caracteres.
 */
function Slots({
  personagem,
  onChanged,
  onAbrirAnexo,
  onAbrirImagem,
}: {
  personagem: Personagem;
  onChanged: () => void;
  onAbrirAnexo: (anexo: AnexoPersonagem) => void;
  onAbrirImagem: (assetId: string, nome: string) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {CAMPOS.map(({ campo, titulo, nota }) => (
        <Slot
          key={campo}
          personagem={personagem}
          campo={campo}
          titulo={titulo}
          nota={nota}
          onChanged={onChanged}
          onAbrirAnexo={onAbrirAnexo}
          onAbrirImagem={onAbrirImagem}
        />
      ))}
    </ul>
  );
}

function Slot({
  personagem,
  campo,
  titulo,
  nota,
  onChanged,
  onAbrirAnexo,
  onAbrirImagem,
}: {
  personagem: Personagem;
  campo: CampoPersonagem;
  titulo: string;
  nota: string;
  onChanged: () => void;
  onAbrirAnexo: (anexo: AnexoPersonagem) => void;
  onAbrirImagem: (assetId: string, nome: string) => void;
}) {
  const [ocupado, setOcupado] = useState(false);

  const valor = personagem[campo];
  const { assets } = useAssetList("image");

  // O endereço do asset sai daqui, e não de dentro da miniatura: ele é o mesmo
  // que o visualizador usa ao abrir a imagem grande, e resolvê-lo duas vezes
  // faria a linha e o diálogo pedirem o mesmo arquivo ao daemon.
  const enderecoAsset = useAssetUrl(campo === "ficha" ? undefined : valor);

  /**
   * A ficha como registro de anexo, qualquer que seja o tipo dela.
   *
   * O registro é montado do NOME, e não procurado na lista de anexos: o campo
   * guarda o nome, e a lista é outra leitura, que pode não ter chegado ainda —
   * ou não ter o arquivo, se ele foi apagado por fora. Procurar ali fazia a
   * miniatura e o transmitir simplesmente não aparecerem, sem dizer por quê.
   * `tamanho` fica em zero porque só a lista de arquivos o mostra.
   *
   * O tipo sai do nome também: imagem tem o dela, PDF é o outro que o app sabe
   * exibir, e o resto vai sem tipo. Blob sem tipo deixa a decisão de renderizar
   * para o palpite do navegador — e é o que faz "Abrir no navegador" virar o
   * download de um arquivo desconhecido.
   */
  const fichaAnexo: AnexoPersonagem | null = (() => {
    if (campo !== "ficha" || !valor) return null;

    const mimeType =
      imageMimeByName(valor) ??
      (attachmentKind(valor, "") === "pdf" ? "application/pdf" : "");

    return { arquivo: valor, mimeType, tamanho: 0, autor: "mestre" };
  })();

  /**
   * A ficha quando ela é IMAGEM.
   *
   * Ficha imagem existe — um print da ficha de papel, um card de personagem —,
   * e nesse caso ela é evidência como qualquer outra imagem: cabe na TV e cabe
   * no quadradinho. Ficha PDF não tem miniatura, porque o que o daemon reduz é
   * imagem, nem vai para a TV, porque o Espectador não renderiza PDF.
   */
  const fichaImagem: AnexoPersonagem | null =
    fichaAnexo && imageMimeByName(fichaAnexo.arquivo) ? fichaAnexo : null;

  /** O ícone do quadro da ficha: o do tipo dela, ou o genérico se não há ficha. */
  const IconeDaFicha = fichaAnexo
    ? ICONE[attachmentKind(fichaAnexo.arquivo, "")]
    : FileText;

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

      // Retrato e miniatura são arquivos do acervo marcados como `personagem`,
      // e a biblioteca esconde quem tem dono. Limpar o campo os deixa sem dono:
      // sem desmarcar, eles ficariam escondidos para sempre e sem lugar de onde
      // ser alcançados. O arquivo em si continua no acervo, de propósito -- a
      // imagem pode estar numa cena como item.
      if (campo !== "ficha" && valor) {
        await setAssetEscopo(valor, undefined);
        // O arquivo volta a aparecer na biblioteca, e a biblioteca pode estar
        // aberta ao lado desta ficha. `onChanged` só relê os personagens.
        invalidarAcervo("image");
      }

      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao limpar.");
    }
  }

  const preenchido = Boolean(valor);

  return (
    <li className="w-20 space-y-1">
      <div
        title={rotulo ?? nota}
        className={cn(
          "group/slot bg-muted/40 relative size-20 overflow-hidden rounded-md border",
          // Tracejado quando vazio, e e a unica pista que resta sem a linha de
          // texto: um quadro cheio e um vazio com a mesma borda seriam dois
          // quadros cinza para quem passa o olho.
          !preenchido && "border-dashed",
        )}
      >
        {campo !== "ficha" ? (
          <Thumb
            url={enderecoAsset}
            alt={rotulo ?? titulo}
            // Pelo id do asset, e nao pelo endereco que a miniatura ja tem: a
            // janela resolve o endereco por conta dela, e passar o resolvido
            // para dentro do store amarraria a janela ao ciclo de vida daqui.
            onAbrir={
              valor ? () => onAbrirImagem(valor, rotulo ?? titulo) : undefined
            }
            className="absolute inset-0 size-full rounded-none border-0"
          />
        ) : fichaImagem ? (
          // `key` no arquivo: trocar a ficha REMONTA a miniatura, e e o que
          // devolve o estado de "falhou" ao inicio sem escrever estado de
          // dentro do efeito.
          <AnexoThumb
            key={fichaImagem.arquivo}
            personagemId={personagem.id}
            anexo={fichaImagem}
            Fallback={FileText}
            onAbrir={() => onAbrirAnexo(fichaImagem)}
            className="absolute inset-0 size-full rounded-none border-0"
          />
        ) : fichaAnexo ? (
          // Ficha PDF: ícone, e clicável. O ícone é o do TIPO, como no celular,
          // e o clique abre o arquivo no leitor -- ver `AnexoBody`. Era um
          // `<span>` inerte, e o efeito era o mestre não ter caminho nenhum
          // para a ficha em PDF de dentro do aplicativo: aqui ela não abria, e
          // na lista de arquivos abaixo ela é escondida de propósito, porque
          // tem lugar próprio. Ver `Files`.
          <button
            type="button"
            // O nome vive no `title` do quadro e no cabeçalho da janela: em
            // oitenta pixels ele viraria três letras e reticências.
            aria-label={`Abrir ${fichaAnexo.arquivo}`}
            onClick={() => onAbrirAnexo(fichaAnexo)}
            className="hover:bg-accent focus-visible:ring-ring absolute inset-0 grid size-full place-items-center focus-visible:ring-2 focus-visible:outline-none"
          >
            <IconeDaFicha className="text-muted-foreground size-5" aria-hidden />
          </button>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <IconeDaFicha
              className="text-muted-foreground/40 size-5"
              aria-hidden
            />
          </span>
        )}

        {/* O retrato ao vivo mora no canto do quadro do Retrato, e nao num
            bloco proprio: era uma secao inteira -- titulo, paragrafo de tres
            linhas, seletor, campo e botao -- para um campo que a maioria das
            fichas deixa vazio. Aqui ele ocupa 20 pixels, e acende quando ha
            URL, que e a informacao que o bloco levava cem pixels para dar. */}
        {campo === "retrato" ? (
          <RetratoAoVivo personagem={personagem} onChanged={onChanged} />
        ) : null}

        {/* A tira de acoes aparece no hover E no foco de dentro. `opacity`, e
            nao `hidden`: o botao escondido por `hidden` sai da ordem de
            tabulacao, e trocar a ficha deixaria de ser alcancavel pelo teclado.
            Com `opacity-0` ele continua focavel, e `focus-within` o revela. */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-black/60 p-0.5 opacity-0 transition-opacity group-hover/slot:opacity-100 group-focus-within/slot:opacity-100 motion-reduce:transition-none">
          {fichaImagem ? (
            <Transmitir anexo={fichaImagem} personagemId={personagem.id} />
          ) : null}

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-white hover:bg-white/20 hover:text-white"
                  aria-label={`${preenchido ? "Trocar" : "Anexar"} ${titulo}`}
                  disabled={ocupado}
                  onClick={() => void escolher()}
                >
                  {ocupado ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Paperclip />
                  )}
                </Button>
              }
            />
            <TooltipContent>
              <p className="max-w-48">
                {preenchido ? `Trocar ${titulo}` : nota}
              </p>
            </TooltipContent>
          </Tooltip>

          {preenchido ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-white hover:bg-white/20 hover:text-white"
              aria-label={`Limpar ${titulo}`}
              onClick={() => void limpar()}
            >
              <X />
            </Button>
          ) : null}
        </div>
      </div>

      <p
        className="truncate text-[10px] leading-tight font-medium"
        title={titulo}
      >
        {titulo}
      </p>
    </li>
  );
}

/**
 * A miniatura de um anexo imagem, e o atalho para vê-lo grande.
 *
 * Não dá para reusar `useAssetUrl`: anexo é do personagem, fica atrás do token
 * e chega por IPC como bytes — não tem `/asset/{id}`. Isso custa uma blob URL
 * por linha, revogada na saída; sem revogar, abrir dez personagens numa sessão
 * deixa dez arquivos presos na memória da webview.
 *
 * `Fallback` é o ícone de quando os bytes não vêm. O caso real é campo
 * apontando para arquivo que saiu do disco, e ali um quadrado vazio não diria
 * nada ao mestre.
 */
function AnexoThumb({
  personagemId,
  anexo,
  Fallback,
  onAbrir,
  className,
}: {
  personagemId: string;
  anexo: AnexoPersonagem;
  Fallback: typeof File;
  onAbrir: () => void;
  className?: string;
}) {
  const { autor, arquivo, mimeType, tamanho } = anexo;
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let ativo = true;
    let criada: string | null = null;

    void characterAttachmentUrl(personagemId, {
      autor,
      arquivo,
      mimeType,
      tamanho,
    }).then(
      (endereco) => {
        // Trocou o arquivo enquanto os bytes vinham: a blob nova não serve mais
        // a ninguém, e guardá-la seria vazamento.
        if (!ativo) {
          URL.revokeObjectURL(endereco);
          return;
        }

        criada = endereco;
        setUrl(endereco);
      },
      () => {
        if (ativo) setFalhou(true);
      },
    );

    return () => {
      ativo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [personagemId, autor, arquivo, mimeType, tamanho]);

  if (falhou) {
    // Sem moldura pedida, o ícone vai solto: é como a linha de arquivo sempre o
    // mostrou, ao lado do nome. Com moldura, ele precisa do quadro em volta —
    // senão o quadro do campo colapsaria para nada quando os bytes não vêm.
    if (!className) {
      return (
        <Fallback
          className="text-muted-foreground size-4 shrink-0"
          aria-hidden
        />
      );
    }

    return (
      <span
        className={cn(
          "bg-background flex items-center justify-center",
          className,
        )}
      >
        <Fallback
          className="text-muted-foreground size-5 shrink-0"
          aria-hidden
        />
      </span>
    );
  }

  return (
    <Thumb
      url={url}
      alt={arquivo}
      onAbrir={url ? onAbrir : undefined}
      onError={() => setFalhou(true)}
      className={className}
    />
  );
}

/**
 * O quadrado da imagem, vazio enquanto não há endereço.
 *
 * Com `onAbrir` é botão, e não `span` com clique pendurado: abrir a imagem
 * grande é ação, e ação que não alcança o teclado deixa metade da tela fora do
 * alcance de quem não usa mouse. Sem `onAbrir` — enquanto o endereço não
 * chegou — fica o `span`, porque botão que não faz nada ainda recebe foco.
 */
function Thumb({
  url,
  alt,
  onAbrir,
  onError,
  className,
}: {
  url: string | null | undefined;
  alt: string;
  onAbrir?: () => void;
  onError?: () => void;
  /**
   * Por cima da moldura padrão.
   *
   * Existe porque o mesmo quadrado serve a dois tamanhos: 36 pixels na linha de
   * um arquivo, e 80 preenchendo o quadro de um campo. Um componente por
   * tamanho seria a segunda cópia da mesma blob, do mesmo `onError` e do mesmo
   * cuidado com foco.
   */
  className?: string;
}) {
  const imagem = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      draggable={false}
      className="size-full object-cover"
      onError={onError}
      {...MINIATURA}
    />
  ) : null;

  const moldura = cn(
    "bg-background size-9 shrink-0 overflow-hidden rounded border",
    className,
  );

  if (!onAbrir) return <span className={moldura}>{imagem}</span>;

  return (
    <button
      type="button"
      className={cn(
        moldura,
        "hover:ring-ring focus-visible:ring-ring cursor-zoom-in hover:ring-2 focus-visible:ring-2 focus-visible:outline-none",
      )}
      aria-label={`Ver ${alt}`}
      onClick={onAbrir}
    >
      {imagem}
    </button>
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
  // Fechada por padrão: cinco jogadores vinculados eram cinco caixas vazias
  // de 64px empilhadas. O resumo na linha diz se há algo dentro.
  const [aberta, setAberta] = useState(false);
  const [salvo, setSalvo] = useState(false);

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

  useEffect(() => {
    if (!salvo) return;
    const timer = setTimeout(() => setSalvo(false), 2000);
    return () => clearTimeout(timer);
  }, [salvo]);

  if (texto === null) return null;

  const resumo = texto.trim().split("\n")[0] ?? "";
  const id = `nota-${personagemId}-${jogador.id}`;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        aria-controls={id}
        className="text-muted-foreground hover:text-foreground flex w-full min-w-0 items-center gap-1 rounded px-0.5 text-left text-[11px] focus-visible:ring-2 focus-visible:outline-none"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 transition-transform motion-reduce:transition-none",
            aberta && "rotate-90",
          )}
          aria-hidden
        />
        <span className="shrink-0">Nota</span>
        <span className="min-w-0 flex-1 truncate italic">
          {resumo || "vazia"}
        </span>
        {salvo ? (
          <span className="text-emerald-500 shrink-0 not-italic">salvo</span>
        ) : null}
      </button>

      {aberta ? (
        <Textarea
          id={id}
          autoFocus
          className="min-h-16 resize-y text-xs"
          placeholder={`Sua nota sobre ${jogador.nome} neste personagem`}
          aria-label={`Sua nota sobre ${jogador.nome}`}
          defaultValue={texto}
          onBlur={(event) => {
            if (event.target.value === texto) return;

            void setCharacterNote(
              personagemId,
              jogador.id,
              event.target.value,
            ).then(
              () => {
                setTexto(event.target.value);
                setSalvo(true);
              },
              (cause) =>
                toast.error(
                  cause instanceof Error ? cause.message : "Falha ao gravar.",
                ),
            );
          }}
        />
      ) : null}
    </div>
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
  const [escolhido, setEscolhido] = useState<string | null>(null);

  // Relógio em estado, e não `Date.now()` no render — ver `usePlayers`. A
  // lista chega pela sondagem do chip, então acompanhar a mudança dela é
  // acompanhar a sondagem.
  const [agora, setAgora] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAgora(Date.now());
  }, [jogadores]);

  const aberto = jogadores.find((jogador) => jogador.id === escolhido) ?? null;

  return (
    <SecaoFicha
      secao="nota"
      titulo="Quem joga com ele"
      contagem={vinculados.length}
    >
      <div className="space-y-2">
        {vinculados.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {jogadores.length === 0
              ? "Ninguém entrou na mesa ainda."
              : "Ninguém vinculado. Vinculado, o jogador vê os arquivos e escreve notas."}
          </p>
        ) : (
          <ul className="space-y-1">
            {vinculados.map((jogador) => {
              const naMesa = presente(jogador, agora);
              return (
                <li
                  key={jogador.id}
                  className="bg-muted/40 space-y-1 rounded-md border p-1.5"
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEscolhido(jogador.id)}
                      className="hover:bg-muted flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left focus-visible:ring-2 focus-visible:outline-none"
                      aria-label={`Abrir ${jogador.nome}`}
                    >
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          naMesa ? "bg-emerald-500" : "bg-muted-foreground/40",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {jogador.nome}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-[10px]">
                        {naMesa ? "na mesa" : `visto ${desde(jogador.vistoEm)}`}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Desvincular ${jogador.nome}`}
                      onClick={() => {
                        void unlinkCharacter(jogador.id, personagem.id).then(
                          onChanged,
                        );
                      }}
                    >
                      <X />
                    </Button>
                  </div>

                  <PlayerNote personagemId={personagem.id} jogador={jogador} />
                </li>
              );
            })}
          </ul>
        )}

        {livres.length > 0 ? (
          <Select<string>
            value={null}
            onValueChange={(jogadorId) => {
              if (jogadorId) {
                void linkCharacter(jogadorId, personagem.id).then(onChanged);
              }
            }}
          >
            <SelectTrigger
              className="w-full text-xs"
              aria-label="Vincular a um jogador"
            >
              <SelectValue placeholder="Vincular a…" />
            </SelectTrigger>
            {/* Abaixo do gatilho, e não por cima: sem valor escolhido não há
                item para alinhar, e o popup cobria o próprio "Vincular a…". */}
            <SelectContent alignItemWithTrigger={false}>
              {livres.map((jogador) => (
                <SelectItem
                  key={jogador.id}
                  value={jogador.id}
                  className="text-xs"
                >
                  {jogador.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <PlayerDialog
        player={aberto}
        presente={aberto ? presente(aberto, agora) : false}
        onVoltar={() => setEscolhido(null)}
        onChanged={onChanged}
      />
    </SecaoFicha>
  );
}
