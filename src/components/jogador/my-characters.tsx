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
  TriangleAlert,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AttachmentViewer } from "@/components/attachments/attachment-viewer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MINIATURA } from "@/lib/miniatura";

import { InventarioJogador } from "./inventario-jogador";
import { attachmentKind, type AttachmentKind } from "@/lib/attachments/kind";
import {
  characterFileThumbUrl,
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
import {
  doJogador,
  type AnexoPersonagem,
  type Personagem,
} from "@/types/character";

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
/**
 * Que parte do personagem mostrar.
 *
 * Existe porque a tela deitada quebrou o cartão em gavetas: ficha, inventário e
 * arquivos viraram três ferramentas da trilha lateral, e cada uma abre só o seu
 * pedaço. Em pé continua tudo junto — lá o cartão inteiro É a tela.
 */
export type SecaoPersonagem =
  "tudo" | "personagem" | "inventario" | "arquivos" | "notas";

export function MyCharacters({
  codigo,
  secao = "tudo",
}: {
  codigo: string;
  secao?: SecaoPersonagem;
}) {
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
        Nenhum personagem ainda. O mestre é quem entrega um a você — quando isso
        acontecer, a ficha e os arquivos dele aparecem aqui.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {personagens.map((personagem) => (
        <CharacterCard
          key={personagem.id}
          codigo={codigo}
          personagem={personagem}
          secao={secao}
        />
      ))}
    </div>
  );
}

/** Um arquivo em envio, e o que aconteceu com ele. */
type Envio = { nome: string; erro?: string };

function CharacterCard({
  codigo,
  personagem,
  secao,
}: {
  codigo: string;
  personagem: Personagem;
  secao: SecaoPersonagem;
}) {
  const [anexos, setAnexos] = useState<AnexoPersonagem[]>([]);
  const [versao, setVersao] = useState(0);
  const [enviando, setEnviando] = useState(false);

  // O que está subindo, e o que falhou ao subir. Antes isto era só o ícone do
  // botão trocando de forma: mandando três arquivos, o jogador não via qual
  // deles o daemon recusou — e a recusa vinha num toast que some sozinho, sobre
  // uma tela que ele já tinha rolado.
  const [fila, setFila] = useState<Envio[]>([]);

  const [abrindo, setAbrindo] = useState<AnexoPersonagem | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  // O retrato e a miniatura ampliados. Estado à parte do `abrindo`: aqueles são
  // ANEXOS, atrás do token e baixados para uma blob que depois se revoga; estes
  // são imagens do acervo, servidas abertas para a mesa em `/asset/{id}`. Um
  // estado só obrigaria o fechamento a adivinhar qual dos dois caminhos desfazer.
  const [zoom, setZoom] = useState<{ titulo: string; assetId: string } | null>(
    null,
  );

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
    (anexo) =>
      !(anexo.autor === "mestre" && anexo.arquivo === personagem.ficha),
  );

  // Separados por AUTOR, em dois blocos com título, e não misturados com uma
  // etiqueta por linha. São duas coisas diferentes na cabeça de quem joga: o
  // que a mesa entregou a ele, e o que ele juntou. Misturados, a diferença que
  // importava — o que ele pode apagar — ficava num selo de dez pixels no fim
  // da linha, que é onde ninguém olha antes de tocar na lixeira.
  const doMestre = soltos.filter((anexo) => !doJogador(anexo));
  const meus = soltos.filter(doJogador);

  async function enviar(files: FileList | null) {
    if (!files || files.length === 0) return;

    const escolhidos = Array.from(files);

    setEnviando(true);
    // A fila nova substitui a anterior: os erros que ficaram na tela são do
    // envio passado, e mantê-los ao lado dos novos faria o jogador conferir
    // duas vezes o que já resolveu.
    setFila(escolhidos.map((file) => ({ nome: file.name })));

    /** Marca o fim de UM arquivo: sai da fila se deu certo, fica se falhou. */
    const encerra = (nome: string, erro?: string) =>
      setFila((atual) =>
        atual.flatMap((envio) =>
          envio.nome === nome && envio.erro === undefined
            ? erro
              ? [{ nome, erro }]
              : []
            : [envio],
        ),
      );

    for (const file of escolhidos) {
      // Conferido aqui além do daemon: subir 80 MB por 4G para receber uma
      // recusa no fim é o pior jeito de descobrir um limite.
      if (file.size > MAX_ATTACHMENT_BYTES) {
        encerra(
          file.name,
          `Passa do limite de ${formatBytes(MAX_ATTACHMENT_BYTES)}.`,
        );
        continue;
      }

      try {
        await uploadCharacterFile(codigo, personagem.id, file);
        encerra(file.name);
      } catch (cause) {
        encerra(
          file.name,
          cause instanceof Error ? cause.message : "Falha ao enviar.",
        );
      }
    }

    setEnviando(false);
    reler();

    // Zera a entrada para o mesmo arquivo poder ser escolhido de novo: sem
    // isso, o `change` não dispara na segunda tentativa.
    if (entrada.current) entrada.current.value = "";
  }

  function fecharVisualizador() {
    if (abrindo) revokeCharacterFileUrl(personagem.id, abrindo);
    setUrl(null);
    setAbrindo(null);
  }

  // A MINIATURA, grande, quando existe uma. É ela que o mestre põe no mapa, e
  // é por ela que a mesa reconhece o personagem durante a sessão — a imagem
  // que o jogador tem na cabeça quando alguém fala o nome dele.
  //
  // Retrato serve de reserva: é a mesma pessoa de outro ângulo, e um quadro
  // vazio ao lado do nome é pior que a segunda escolha.
  const heroi = personagem.miniatura ?? personagem.retrato;

  // Só a nota: é a gaveta de anotações, que junta o caderno do jogador com o
  // que ele escreveu sobre cada personagem. Sai por cima para não arrastar a
  // moldura do cartão inteiro atrás de um `<textarea>`.
  if (secao === "notas") {
    return (
      <section className="space-y-1">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          Sobre {personagem.nome}
        </p>
        <CharacterNote codigo={codigo} personagemId={personagem.id} />
      </section>
    );
  }

  /** O token de corpo inteiro, grande e clicável. */
  const retratoGrande = (className: string) =>
    heroi ? (
      <button
        type="button"
        onClick={() =>
          setZoom({
            titulo: personagem.miniatura ? "Miniatura" : "Retrato",
            assetId: heroi,
          })
        }
        aria-label={`Ampliar a imagem de ${personagem.nome}`}
        className={className}
      >
        {/* `/asset/{id}` inteiro, e não a variante `mini`: aqui a imagem é o
            assunto, e a redução existe para caber num quadrado de 80px.
            `object-contain` porque o token costuma ser um recorte de corpo
            inteiro — cortar a cabeça para preencher a caixa é o oposto do que
            ele serve.

            Aberto para a mesa: o celular alcança sem credencial própria. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/asset/${heroi}`}
          alt={personagem.nome}
          draggable={false}
          className="max-h-72 w-full rounded-md object-contain object-bottom"
        />
      </button>
    ) : null;

  /**
   * Os três campos que o mestre nomeou: ficha, retrato e miniatura.
   *
   * A ficha sai da lista de arquivos abaixo, onde estava antes: ela tem lugar
   * próprio aqui, e nos dois lugares o mesmo arquivo aparecia duas vezes — uma
   * delas com um X que o jogador nem pode usar.
   */
  const blocoDeArquivos =
    personagem.ficha || personagem.retrato || personagem.miniatura ? (
      <section className="bg-muted/20 space-y-1.5 rounded-lg border p-2">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          Arquivos do personagem
        </p>

        <ul className="flex flex-wrap items-start gap-2">
          {personagem.ficha ? (
            <li className="space-y-0.5">
              <FichaTile
                codigo={codigo}
                personagemId={personagem.id}
                arquivo={personagem.ficha}
                onAbrir={abrirAnexo}
              />
              <span className="text-muted-foreground block text-[10px]">
                Ficha
              </span>
            </li>
          ) : null}

          {(
            [
              ["Retrato", personagem.retrato],
              ["Miniatura", personagem.miniatura],
            ] as const
          )
            .filter(([, assetId]) => Boolean(assetId))
            .map(([titulo, assetId]) => (
              <li key={titulo} className="space-y-0.5">
                {/* 80px, e não os 56 de antes: isto é alvo de toque num celular,
                    e o dedo médio cobre uns 45. Eles embrulham na coluna
                    estreita em vez de encolher — o que não cabe desce, e
                    continua clicável. */}
                <button
                  type="button"
                  onClick={() => setZoom({ titulo, assetId: assetId! })}
                  aria-label={`Ampliar ${titulo}`}
                  className="bg-muted hover:bg-accent block size-20 overflow-hidden rounded border"
                >
                  {/* A miniatura de 80px continua vindo da variante `mini`: o
                      que amplia é o diálogo, e só ele paga o arquivo inteiro. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/asset/${assetId}/mini`}
                    alt={titulo}
                    draggable={false}
                    className="size-full object-cover"
                    {...MINIATURA}
                  />
                </button>
                <span className="text-muted-foreground block text-[10px]">
                  {titulo}
                </span>
              </li>
            ))}
        </ul>
      </section>
    ) : null;

  /** O que o mestre entregou, o que o jogador juntou, e o botão de mandar mais. */
  const listaDeArquivos = (
    <>
      {doMestre.length > 0 ? (
        <Grupo titulo="Do mestre">
          {doMestre.map((anexo) => (
            <LinhaAnexo
              key={`mestre/${anexo.arquivo}`}
              codigo={codigo}
              personagemId={personagem.id}
              anexo={anexo}
              onAbrir={abrirAnexo}
            />
          ))}
        </Grupo>
      ) : null}

      <Grupo titulo="Seus arquivos">
        {meus.map((anexo) => (
          <LinhaAnexo
            key={`jogador/${anexo.arquivo}`}
            codigo={codigo}
            personagemId={personagem.id}
            anexo={anexo}
            onAbrir={abrirAnexo}
            // Só o que ele mesmo mandou, e é por isso que o botão vive aqui e
            // não no bloco de cima. O arquivo do mestre é leitura — a ficha
            // existe independente de quem joga, e não pode sumir porque alguém
            // se irritou com a sessão.
            onApagar={() => {
              void deleteCharacterFile(
                codigo,
                personagem.id,
                anexo.arquivo,
              ).then(reler, (cause) =>
                toast.error(
                  cause instanceof Error ? cause.message : "Falha ao remover.",
                ),
              );
            }}
          />
        ))}

        {fila.map((envio) => (
          <li
            key={envio.nome}
            className="bg-muted/40 flex items-center gap-2 rounded-md border p-1.5"
          >
            <span className="bg-muted grid size-10 shrink-0 place-items-center rounded">
              {envio.erro ? (
                <TriangleAlert className="size-4 text-amber-400" aria-hidden />
              ) : (
                <Loader2
                  className="text-muted-foreground size-4 animate-spin"
                  aria-hidden
                />
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs">{envio.nome}</span>
              <span
                className={cn(
                  "block text-[10px]",
                  envio.erro ? "text-amber-300" : "text-muted-foreground",
                )}
              >
                {envio.erro ?? "Enviando…"}
              </span>
            </span>

            {/* O erro fica até ele dispensar. Some sozinho seria o toast de
                novo, que é o que não funcionava: a recusa apagava antes de o
                jogador voltar a olhar a tela. */}
            {envio.erro ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Dispensar o aviso de ${envio.nome}`}
                onClick={() =>
                  setFila((atual) => atual.filter((outro) => outro !== envio))
                }
              >
                <X />
              </Button>
            ) : null}
          </li>
        ))}

        {meus.length === 0 && fila.length === 0 ? (
          <li className="text-muted-foreground px-1 text-[11px] leading-snug">
            Nada ainda. O que você mandar daqui fica com o personagem, e o
            mestre vê.
          </li>
        ) : null}
      </Grupo>

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
    </>
  );

  const visualizadores = (
    <>
      <AttachmentViewer
        attachment={abrindo}
        url={url}
        onClose={fecharVisualizador}
      />

      {/* O mesmo visualizador da ficha, com o mesmo zoom de pinça: o jogador que
          quer ler o brasão no peito do retrato faz o gesto que já fez na ficha.
          Sem baixar nada antes — `/asset/{id}` é aberto para a mesa, e o
          endereço vai direto para a tag. */}
      <AttachmentViewer
        attachment={
          zoom
            ? { arquivo: zoom.titulo, tamanho: 0, mimeType: "image/*" }
            : null
        }
        url={zoom ? `/asset/${zoom.assetId}` : null}
        onClose={() => setZoom(null)}
      />
    </>
  );

  // A GAVETA da tela deitada: uma coisa só, numa coluna só.
  //
  // Nome no alto, token embaixo dele, e os arquivos embaixo do token — nessa
  // ordem porque a gaveta é estreita e alta, o contrário do cartão largo da
  // tela em pé. Pôr o token ao lado dos arquivos ali dentro espremia os dois.
  if (secao !== "tudo") {
    return (
      <section className="space-y-3">
        {secao === "personagem" ? (
          <>
            <h3 className="truncate text-2xl leading-tight font-semibold">
              {personagem.nome}
            </h3>
            {retratoGrande("block w-full")}
            {blocoDeArquivos}
          </>
        ) : null}

        {/* Sem moldura por dentro: a gaveta já é o cartão, e dois retângulos
            encaixados só roubam largura dos quadros. */}
        {secao === "inventario" ? (
          <InventarioJogador codigo={codigo} personagemId={personagem.id} />
        ) : null}

        {secao === "arquivos" ? listaDeArquivos : null}

        {visualizadores}
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border p-3">
      {/* O cartão da tela em pé: o token à esquerda, atravessando as linhas, e o
          nome, os arquivos e o inventário do lado.

          Em grade e não em dois `flex`: é o que deixa o token ATRAVESSAR as
          linhas. A quarta linha, vazia, segura o espaçamento — sem ela a altura
          que sobra da imagem era repartida entre as linhas ocupadas, e o nome
          ficava boiando a uma mão de distância dos arquivos. */}
      <div
        className={cn(
          "grid items-start gap-x-3 gap-y-2",
          heroi
            ? "grid-cols-[minmax(5rem,8rem)_1fr] grid-rows-[auto_auto_auto_1fr] sm:grid-cols-[minmax(9rem,13rem)_1fr]"
            : "grid-cols-1",
        )}
      >
        {retratoGrande("row-span-4 h-full")}

        <h3 className="min-w-0 truncate text-2xl leading-tight font-semibold">
          {personagem.nome}
        </h3>

        {blocoDeArquivos}

        {/* O inventário é do personagem, como a ficha e o token. Na coluna da
            direita e com a mesma largura dos arquivos: passar por baixo do
            token dava a ele a largura da tela inteira, e os quadros viravam
            alvos maiores que o próprio personagem. */}
        <div
          className={cn(
            "bg-muted/20 rounded-lg border p-2",
            heroi && "col-start-2",
          )}
        >
          <InventarioJogador codigo={codigo} personagemId={personagem.id} />
        </div>
      </div>

      {listaDeArquivos}

      {visualizadores}
    </section>
  );
}

/**
 * Um bloco de arquivos com título.
 *
 * O título é o que separa o que o mestre entregou do que o jogador juntou. Era
 * uma etiqueta por linha antes, e ela dizia a mesma coisa cinco vezes gastando
 * a largura em que o nome do arquivo cabia.
 */
function Grupo({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
        {titulo}
      </p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

/**
 * Uma linha de arquivo: miniatura quando dá, ícone quando não.
 *
 * A miniatura é o que deixa bater o olho. "emb.jpg" e "estabrzemb.jpg" são o
 * mesmo ícone de imagem e dois nomes que ninguém escolheu pensando em ser lido
 * depois — o que distingue os dois é o que tem dentro.
 *
 * `onApagar` ausente é linha de leitura: é assim que o bloco do mestre não
 * oferece um botão que o daemon recusaria com 403.
 */
function LinhaAnexo({
  codigo,
  personagemId,
  anexo,
  onAbrir,
  onApagar,
}: {
  codigo: string;
  personagemId: string;
  anexo: AnexoPersonagem;
  onAbrir: (anexo: AnexoPersonagem) => void;
  onApagar?: () => void;
}) {
  const Icone = ICONE[attachmentKind(anexo.arquivo, anexo.mimeType)];

  return (
    <li className="bg-muted/40 flex items-center gap-2 rounded-md border p-1.5">
      <AnexoThumb
        codigo={codigo}
        personagemId={personagemId}
        anexo={anexo}
        className="size-10 rounded"
        Fallback={Icone}
      />

      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => onAbrir(anexo)}
      >
        <span className="block truncate text-xs">{anexo.arquivo}</span>
        <span className="text-muted-foreground block text-[10px] tabular-nums">
          {formatBytes(anexo.tamanho)}
        </span>
      </button>

      {onApagar ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Apagar ${anexo.arquivo}`}
          onClick={onApagar}
        >
          {/* Lixeira: isto apaga o arquivo do disco do mestre, e não o tira de
              uma lista. Mesma regra dos dois ícones do lado dele. */}
          <Trash2 />
        </Button>
      ) : null}
    </li>
  );
}

/**
 * A miniatura de um anexo, quando ele é imagem.
 *
 * Pela variante `mini` da rota do anexo, e não pelo arquivo inteiro: são uns
 * poucos KB contra os megabytes do original, e quem paga a diferença é um
 * celular no 4G — ver `characterFileThumbUrl`. Ainda assim é um `fetch` e uma
 * blob, porque a rota está atrás do token e `<img src>` não manda cabeçalho.
 *
 * Quem não é imagem nem tenta: o tipo sai do `mimeType` do anexo, e cai na
 * extensão quando o celular não declarou nenhum. PDF vira ícone direto.
 *
 * `Fallback` é o ícone de quando os bytes não vêm — arquivo que saiu do disco
 * por fora, redução que não saiu. Um quadrado vazio não diria nada.
 */
function AnexoThumb({
  codigo,
  personagemId,
  anexo,
  className,
  Fallback,
  fallbackClassName = "size-4",
}: {
  codigo: string;
  personagemId: string;
  anexo: AnexoPersonagem;
  className?: string;
  Fallback: typeof File;
  /** Tamanho do ícone de reserva: a linha tem 40px de caixa, o tile tem 80. */
  fallbackClassName?: string;
}) {
  const eImagem = attachmentKind(anexo.arquivo, anexo.mimeType) === "image";

  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  // Pelo AUTOR e pelo NOME, e não pelo objeto: o registro da ficha é montado a
  // cada render — ver `FichaTile` —, e um efeito que dependesse dele rebuscaria
  // a miniatura em todo render.
  const { autor, arquivo } = anexo;

  useEffect(() => {
    if (!eImagem) return;

    let ativo = true;

    void characterFileThumbUrl(codigo, personagemId, autor, arquivo).then(
      (endereco) => {
        if (ativo) setUrl(endereco);
      },
      () => {
        if (ativo) setFalhou(true);
      },
    );

    return () => {
      ativo = false;
    };
  }, [codigo, personagemId, autor, arquivo, eImagem]);

  return (
    <span
      className={cn(
        "bg-muted grid shrink-0 place-items-center overflow-hidden",
        className,
      )}
    >
      {eImagem && url && !falhou ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={url}
          alt={arquivo}
          draggable={false}
          className="size-full object-cover"
          onError={() => setFalhou(true)}
        />
      ) : eImagem && !falhou ? null : ( // ícone aqui faria ele piscar e ser trocado pela imagem em toda linha. // Enquanto a blob não chega: o quadrado do tamanho final, vazio. Pôr o
        <Fallback
          className={cn("text-muted-foreground shrink-0", fallbackClassName)}
          aria-hidden
        />
      )}
    </span>
  );
}

/**
 * O bloco da ficha, do tamanho dos outros dois campos.
 *
 * Ficha imagem é miniatura, como no lado do mestre: um print da ficha de papel,
 * um card de personagem. Ficha PDF é ícone, e continua sendo — o que o daemon
 * reduz é imagem, e o navegador do celular renderizando a primeira página de um
 * PDF para um quadrado de 80px seria o arquivo inteiro no fio para isso.
 *
 * O ícone sai do tipo do arquivo, então uma ficha em imagem que não abriu e uma
 * em PDF não ficam com o mesmo desenho.
 */
function FichaTile({
  codigo,
  personagemId,
  arquivo,
  onAbrir,
}: {
  codigo: string;
  personagemId: string;
  arquivo: string;
  onAbrir: (anexo: AnexoPersonagem) => void;
}) {
  // Montado do NOME, que é o que o campo guarda. O `mimeType` vazio deixa
  // `attachmentKind` cair na extensão, e o tipo de verdade da blob vem do
  // daemon na hora de abrir — ver `characterFileUrl`.
  const anexo: AnexoPersonagem = {
    arquivo,
    mimeType: "",
    tamanho: 0,
    autor: "mestre",
  };
  const Icone = ICONE[attachmentKind(arquivo, "")];

  return (
    <button
      type="button"
      className="hover:bg-accent block size-20 overflow-hidden rounded border"
      // O nome do arquivo vive no rótulo acessível e no título do visualizador:
      // dentro de um quadrado de oitenta pixels ele viraria três letras e
      // reticências. Retrato e miniatura também não mostram nome.
      aria-label={`Abrir ${arquivo}`}
      onClick={() => onAbrir(anexo)}
    >
      <AnexoThumb
        codigo={codigo}
        personagemId={personagemId}
        anexo={anexo}
        className="size-full"
        Fallback={Icone}
        fallbackClassName="size-7"
      />
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
      <label
        className="text-muted-foreground text-[10px]"
        htmlFor={`nota-${personagemId}`}
      >
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
