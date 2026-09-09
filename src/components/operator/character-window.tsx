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
  Radio,
  RadioTower,
  Trash2,
  X,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssetList } from "@/hooks/use-asset-list";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useCharacters } from "@/hooks/use-characters";
import { useFecharJanela } from "@/hooks/use-fechar-janela";
import { attachmentKind, imageMimeByName, type AttachmentKind } from "@/lib/attachments/kind";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { chaveDe, type ConteudoJanela } from "@/lib/store/use-window-store";
import { shareCharacterAttachment } from "@/lib/vault/evidence";
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

  const personagem = personagens?.find((atual) => atual.id === personagemId) ?? null;

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
      onRemoved={() => fecharJanela(chave)}
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
        toast.error(cause instanceof Error ? cause.message : "Falha ao ler os arquivos.");
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

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-5 p-3">
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
                <Button variant="ghost" size="icon-sm" aria-label="Apagar este personagem">
                  <Trash2 />
                </Button>
              }
            />

            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar {personagem.nome}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Vão com ele a ficha, os arquivos que você anexou, os que o jogador mandou, e as
                  notas que cada um escreveu sobre ele. O token que estiver no mapa continua lá,
                  como imagem. Não tem como desfazer.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    void removeCharacter(personagem.id).then(onRemoved, (cause) =>
                      toast.error(cause instanceof Error ? cause.message : "Falha ao apagar."),
                    );
                  }}
                >
                  Apagar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <Files
          personagemId={personagem.id}
          anexos={anexos}
          ficha={personagem.ficha}
          anexando={anexando}
          onAnexar={() => void anexar()}
          onAbrir={abrirAnexo}
          onRemover={async (anexo) => {
            await detachFromCharacter(personagem.id, anexo.autor, anexo.arquivo);
            relerAnexos();
            // Apagar o anexo da ficha limpa o CAMPO ficha do lado nativo — ver
            // `remove_anexo`. Sem reler o índice, a linha da ficha continuaria
            // mostrando o nome de um arquivo que acabou de sair do disco.
            onChanged();
          }}
        />

        {/* Os dois: preencher a ficha muda o ÍNDICE (o campo) e a pasta de
            anexos (o arquivo). Chamando só `onChanged`, a lista de arquivos
            acima ficava dizendo "nada anexado" com a ficha já posta. */}
        <Slots
          personagem={personagem}
          onChanged={() => {
            onChanged();
            relerAnexos();
          }}
          onAbrirAnexo={abrirAnexo}
          onAbrirImagem={abrirImagem}
        />

        {/* Os dois de novo: vincular muda quem são os donos DESTA ficha, que é
            leitura local, e muda o nome que a lista de personagens mostra
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

        <p className="text-muted-foreground text-[10px] leading-snug">
          Os arquivos ficam em <code>personagens/{personagem.id}/anexos/</code>, separados por
          quem os pôs ali.
        </p>
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
    <section className="space-y-2">
      <h3 className="text-xs font-medium">Arquivos</h3>

      {soltos.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Nada além dos campos. O que entrar aqui o jogador vinculado também lê.
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
                  <Icone className="text-muted-foreground size-4 shrink-0" aria-hidden />
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
  onAbrirAnexo,
  onAbrirImagem,
}: {
  personagem: Personagem;
  onChanged: () => void;
  onAbrirAnexo: (anexo: AnexoPersonagem) => void;
  onAbrirImagem: (assetId: string, nome: string) => void;
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
            onAbrirAnexo={onAbrirAnexo}
            onAbrirImagem={onAbrirImagem}
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
   * A ficha como anexo, quando ela é imagem.
   *
   * Ficha imagem existe — um print da ficha de papel, um card de personagem —,
   * e nesse caso ela é evidência como qualquer outra imagem: cabe na TV e cabe
   * no quadradinho. Ficha PDF continua só ícone, porque o Assistir não
   * renderiza PDF.
   *
   * O registro é montado do NOME, e não procurado na lista de anexos: o campo
   * guarda o nome, e a lista é outra leitura, que pode não ter chegado ainda —
   * ou não ter o arquivo, se ele foi apagado por fora. Procurar ali fazia a
   * miniatura e o transmitir simplesmente não aparecerem, sem dizer por quê.
   * `tamanho` fica em zero porque só a lista de arquivos o mostra.
   */
  const fichaImagem: AnexoPersonagem | null = (() => {
    if (campo !== "ficha" || !valor) return null;

    const mimeType = imageMimeByName(valor);
    if (!mimeType) return null;

    return { arquivo: valor, mimeType, tamanho: 0, autor: "mestre" };
  })();

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
          trinta imagens o nome raramente é o que faz reconhecer qual é. E ela
          abre o visualizador, com zoom: o quadradinho de 36 pixels serve para
          reconhecer, não para conferir se o token é o certo. */}
      {campo !== "ficha" ? (
        <Thumb
          url={enderecoAsset}
          alt={rotulo ?? titulo}
          // Pelo id do asset, e não pelo endereço que a miniatura já tem: a
          // janela resolve o endereço por conta dela, e passar o resolvido para
          // dentro do store amarraria a janela ao ciclo de vida desta linha.
          onAbrir={valor ? () => onAbrirImagem(valor, rotulo ?? titulo) : undefined}
        />
      ) : fichaImagem ? (
        // `key` no arquivo: trocar a ficha REMONTA a miniatura, e é o que
        // devolve o estado de "falhou" ao início sem escrever estado de dentro
        // do efeito.
        <AnexoThumb
          key={fichaImagem.arquivo}
          personagemId={personagem.id}
          anexo={fichaImagem}
          Fallback={FileText}
          onAbrir={() => onAbrirAnexo(fichaImagem)}
        />
      ) : (
        <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
      )}

      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">{titulo}</span>
        <span className="text-muted-foreground block truncate text-[10px]">
          {rotulo ?? nota}
        </span>
      </span>

      {fichaImagem ? (
        <Transmitir anexo={fichaImagem} personagemId={personagem.id} />
      ) : null}

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
}: {
  personagemId: string;
  anexo: AnexoPersonagem;
  Fallback: typeof File;
  onAbrir: () => void;
}) {
  const { autor, arquivo, mimeType, tamanho } = anexo;
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let ativo = true;
    let criada: string | null = null;

    void characterAttachmentUrl(personagemId, { autor, arquivo, mimeType, tamanho }).then(
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

  if (falhou) return <Fallback className="text-muted-foreground size-4 shrink-0" aria-hidden />;

  return (
    <Thumb
      url={url}
      alt={arquivo}
      onAbrir={url ? onAbrir : undefined}
      onError={() => setFalhou(true)}
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
}: {
  url: string | null | undefined;
  alt: string;
  onAbrir?: () => void;
  onError?: () => void;
}) {
  const imagem = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" draggable={false} className="size-full object-cover" onError={onError} />
  ) : null;

  const moldura = "bg-background size-9 shrink-0 overflow-hidden rounded border";

  if (!onAbrir) return <span className={moldura}>{imagem}</span>;

  return (
    <button
      type="button"
      className={cn(moldura, "hover:ring-ring focus-visible:ring-ring cursor-zoom-in hover:ring-2 focus-visible:ring-2 focus-visible:outline-none")}
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
        <Select<string>
          value={null}
          onValueChange={(jogadorId) => {
            if (jogadorId) {
              void linkCharacter(jogadorId, personagem.id).then(onChanged);
            }
          }}
        >
          <SelectTrigger className="w-full text-xs" aria-label="Vincular a um jogador">
            <SelectValue placeholder="Vincular a…" />
          </SelectTrigger>
          <SelectContent>
            {livres.map((jogador) => (
              <SelectItem key={jogador.id} value={jogador.id} className="text-xs">
                {jogador.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : jogadores.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Ninguém entrou na mesa ainda. Desvincular não apaga nota: o que o jogador escreveu volta
          quando ele for vinculado de novo.
        </p>
      ) : null}
    </section>
  );
}
