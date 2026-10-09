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
  Search,
  TriangleAlert,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AttachmentViewer } from "@/components/attachments/attachment-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/lib/i18n/jogador";
import { normaliza } from "@/lib/search";
import { MINIATURA } from "@/lib/miniatura";

import { DesenhoDoMedidor } from "@/components/playground/desenho-do-medidor";
import { SeloDaCondicao } from "@/components/playground/selos-da-condicao";
import { InventarioJogador } from "./inventario-jogador";
import { BlocosDePlugin } from "./blocos-de-plugin";
import { DetalhesDoJogador } from "./detalhes-jogador";
import { useFichasVersaoStore } from "@/lib/store/use-fichas-versao-store";
import { attachmentKind, type AttachmentKind } from "@/lib/attachments/kind";
import {
  characterFileThumbUrl,
  characterFileUrl,
  characterFiles,
  deleteCharacterFile,
  myCharacters,
  revokeCharacterFileUrl,
  uploadCharacterFile,
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
 * que ele pode: ler os arquivos e mandar os próprios -- as notas moram no
 * caderno do personagem, na aba Anotações. O que
 * ele não pode: apagar o que o mestre pôs ali.
 *
 * Sem personagem vinculado a lista fica vazia, e isso é estado normal — não
 * erro. Quem entrega personagem é o mestre.
 */
/**
 * Que parte do personagem mostrar: o cartão inteiro (a aba Personagem, e a
 * gaveta dela deitado) ou os arquivos (aba e gaveta Arquivos). O inventário
 * saiu para a mochila, ver `MochilaFlutuante`; a nota, para o caderno do
 * personagem, ver `AnotacoesJogador`.
 */
export type SecaoPersonagem = "tudo" | "arquivos";

export function MyCharacters({
  codigo,
  secao = "tudo",
  comBusca = true,
}: {
  codigo: string;
  secao?: SecaoPersonagem;
  /**
   * O campo de busca preso no alto do cartão. Sem ele na barra lateral da tela
   * deitada, onde a busca é um ícone da faixa e abre no meio da tela. Ver
   * `BuscaDoJogador`.
   */
  comBusca?: boolean;
}) {
  const [personagens, setPersonagens] = useState<Personagem[] | null>(null);
  // Relê quando o Mestre avisa que o elenco mudou -- o medidor que um botão
  // de plugin gastou tem de aparecer no aparelho de quem apertou.
  const versao = useFichasVersaoStore((state) => state.versao);

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
  }, [codigo, versao]);

  if (personagens === null) {
    return (
      <p
        className={cn("text-muted-foreground text-xs", secao === "tudo" && "pt-3")}
      >
        {t.personagens.lendo}
      </p>
    );
  }

  if (personagens.length === 0) {
    return (
      <p
        className={cn(
          "text-muted-foreground text-xs leading-snug",
          secao === "tudo" && "pt-3",
        )}
      >
        {t.personagens.nenhum}
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
          comBusca={comBusca}
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
  comBusca,
}: {
  codigo: string;
  personagem: Personagem;
  secao: SecaoPersonagem;
  comBusca: boolean;
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

  // A busca da aba em pé. Do cartão, e não da aba: com dois personagens cada
  // um procura no que é seu.
  const [busca, setBusca] = useState("");

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
        toast.error(t.erros.abrirArquivo),
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
          t.personagens.passaDoLimite(formatBytes(MAX_ATTACHMENT_BYTES)),
        );
        continue;
      }

      try {
        await uploadCharacterFile(codigo, personagem.id, file);
        encerra(file.name);
      } catch (cause) {
        encerra(
          file.name,
          cause instanceof Error ? cause.message : t.erros.falhaEnviar,
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

  /**
   * Os medidores deste personagem, como a mesa os vê.
   *
   * SÓ LEITURA, e não é limitação de tela: quem escreve é o mestre. A mesa
   * inteira olha para os mesmos números, e uma segunda mão mexendo neles
   * pediria uma rota de escrita numa porta aberta na rede — a única coisa que
   * hoje sobe do celular é a rolagem e o movimento do token.
   *
   * O que o mestre escondeu não chega aqui. O daemon o tira antes de responder,
   * e não há nada na tela para filtrar — ver `sem_ocultos`.
   *
   * Acima dos arquivos porque é o que se consulta a cada turno; arquivo se abre
   * uma vez por sessão.
   */
  const medidores = personagem.medidores ?? [];
  const blocoDeMedidores =
    medidores.length > 0 ? (
      <section className="space-y-1.5">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          {t.personagens.medidores}
        </p>

        {/* A mesma peça que desenha ao lado do retrato na TV, e é o ponto:
            o jogador confere o próprio número na forma em que a mesa o vê.
            Sem sombra — aqui não há mapa por baixo, e o contorno só sujaria um
            texto que já tem contraste. */}
        <div className="space-y-1.5">
          {medidores.map((medidor) => (
            <DesenhoDoMedidor
              key={medidor.id}
              medidor={medidor}
              largura={180}
              corpo={12}
            />
          ))}
        </div>
      </section>
    ) : null;

  /**
   * Os atributos deste personagem: a sigla e o número, FOR 4.
   *
   * Só leitura, como os medidores, e pela mesma razão: quem escreve é o mestre.
   * Em cartões, como na ficha dele, para o jogador achar o FOR na hora de rolar
   * sem ler uma lista.
   */
  const atributos = personagem.atributos ?? [];
  const blocoDeAtributos =
    atributos.length > 0 ? (
      <section className="space-y-1.5">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          {t.personagens.atributos}
        </p>

        <ul className="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-1.5">
          {atributos.map((atributo) => (
            <li
              key={atributo.id}
              className="bg-background/40 flex flex-col items-center rounded-md border py-1"
            >
              <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                {atributo.sigla}
              </span>
              <span className="text-xl leading-tight font-medium tabular-nums">
                {atributo.valor}
              </span>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  /**
   * As condições deste personagem, com o nome ao lado do selo.
   *
   * Com o NOME, ao contrário da TV: lá o selo é lido de longe, pelo desenho e
   * pela cor; aqui o jogador tem o celular na mão e quer saber o que aquele
   * frasco verde quer dizer. As escondidas não chegam -- o daemon as tira,
   * como os medidores. Só leitura, pela mesma razão deles.
   */
  const condicoes = personagem.condicoes ?? [];
  const blocoDeCondicoes =
    condicoes.length > 0 ? (
      <section className="space-y-1.5">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          {t.personagens.condicoes}
        </p>

        <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
          {condicoes.map((condicao) => (
            <li key={condicao.id} className="flex items-center gap-1.5 text-sm">
              <SeloDaCondicao condicao={condicao} tamanho={22} />
              {condicao.nome}
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  /**
   * Os três campos que o mestre nomeou: ficha, retrato e miniatura.
   *
   * A ficha sai da lista de arquivos abaixo, onde estava antes: ela tem lugar
   * próprio aqui, e nos dois lugares o mesmo arquivo aparecia duas vezes — uma
   * delas com um X que o jogador nem pode usar.
   */
  const camposDeArquivo =
    personagem.ficha || personagem.retrato || personagem.miniatura ? (
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
              {t.personagens.ficha}
            </span>
          </li>
        ) : null}

        {(
          [
            [t.personagens.retrato, personagem.retrato],
            [t.personagens.miniatura, personagem.miniatura],
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
                aria-label={t.personagens.ampliar(titulo)}
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
    ) : null;

  /** O que o mestre entregou e o que o jogador juntou. */
  const gruposDeArquivos = (
    <>
      {doMestre.length > 0 ? (
        <Grupo titulo={t.personagens.doMestre}>
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

      <Grupo titulo={t.personagens.seusArquivos}>
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
                  cause instanceof Error ? cause.message : t.erros.falhaRemover,
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
                {envio.erro ?? t.personagens.enviando}
              </span>
            </span>

            {/* O erro fica até ele dispensar. Some sozinho seria o toast de
                novo, que é o que não funcionava: a recusa apagava antes de o
                jogador voltar a olhar a tela. */}
            {envio.erro ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t.personagens.dispensar(envio.nome)}
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
          <li className="text-muted-foreground text-[11px] leading-snug">
            {t.personagens.nadaAinda}
          </li>
        ) : null}
      </Grupo>
    </>
  );

  const entradaDeArquivo = (
    <input
      ref={entrada}
      type="file"
      multiple
      className="hidden"
      onChange={(event) => void enviar(event.target.files)}
    />
  );

  const iconeDeEnvio = enviando ? (
    <Loader2 className="animate-spin" />
  ) : (
    <Paperclip />
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

  // Os ARQUIVOS, aba própria em pé e gaveta própria deitado: a ficha, o
  // retrato e a miniatura, o que o mestre entregou e o que o jogador juntou.
  // Saíram do fim da aba Personagem, onde ficavam a várias rolagens de
  // distância embaixo dos detalhes e do inventário. O nome no alto diz de quem
  // são, e o botão de mandar fica ao lado dele, à vista sem rolar.
  if (secao === "arquivos") {
    return (
      <section className="space-y-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-lg leading-tight font-semibold">
            {personagem.nome}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            disabled={enviando}
            onClick={() => entrada.current?.click()}
          >
            {iconeDeEnvio}
            {t.personagens.enviarArquivo}
          </Button>
        </div>
        {camposDeArquivo}
        {gruposDeArquivos}
        {entradaDeArquivo}
        {visualizadores}
      </section>
    );
  }

  /** O que se procura, sem acento nem caixa. Vazio = o cartão inteiro. */
  const termo = normaliza(busca.trim());

  /**
   * O rosto e o nome. O RETRATO, que é o rosto, e a miniatura de reserva,
   * pequenos e recortados no alto, onde a cabeça costuma estar; tocar amplia.
   */
  const rosto = personagem.retrato
    ? { id: personagem.retrato, titulo: t.personagens.retrato }
    : personagem.miniatura
      ? { id: personagem.miniatura, titulo: t.personagens.miniatura }
      : null;

  const nomeComRosto = (
    <div className="flex min-w-0 items-center gap-2.5">
      {rosto ? (
        <button
          type="button"
          onClick={() => setZoom({ titulo: rosto.titulo, assetId: rosto.id })}
          aria-label={t.personagens.ampliarImagem(personagem.nome)}
          className="bg-muted size-10 shrink-0 overflow-hidden rounded-full border"
        >
          {/* A variante `mini`: o quadrado é de 40px, e o arquivo inteiro vem
              só no diálogo de ampliar. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/asset/${rosto.id}/mini`}
            alt={personagem.nome}
            draggable={false}
            className="size-full object-cover object-top"
            {...MINIATURA}
          />
        </button>
      ) : null}
      <h3 className="min-w-0 truncate text-lg leading-tight font-semibold">
        {personagem.nome}
      </h3>
    </div>
  );

  // O cartão da tela em pé, SEM moldura: o painel já é a moldura, e cada caixa
  // a mais por dentro comia largura do celular e repetia a mesma borda três
  // vezes, uma dentro da outra. As seções se separam pelo título e por uma
  // linha fina.
  return (
    // `@container`: o alto do cartão escolhe uma ou duas colunas pela largura
    // DELE, que é a aba inteira em pé e a ficha fixa, mais estreita, deitado.
    <section className="@container">
      {/* A busca, presa no alto do painel enquanto se rola: achar o poder certo
          no meio do combate não pode pedir rolar até ele. Com dois personagens,
          a do segundo empurra a do primeiro para fora, porque cada uma só prende
          dentro do próprio cartão. Puxada até as bordas para o fundo cobrir o
          que passa por baixo.

          Só a busca, e não o nome junto: os dois presos comiam duas linhas da
          tela o tempo todo. O nome desceu para o começo do cartão. */}
      {/* O fundo vem de `--fundo-da-busca` quando quem embrulha o cartão o
          define -- a gaveta deitada é cor de cartão, e o fundo da página
          viraria uma faixa mais escura ali. */}
      {comBusca ? (
        <div className="sticky top-0 z-10 -mx-3 border-b bg-[var(--fundo-da-busca,var(--color-background))] px-3 py-2">
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setBusca("");
              }}
              enterKeyHint="search"
              placeholder={t.personagens.buscar}
              aria-label={t.personagens.buscar}
              className="h-9 pr-9 pl-8"
            />
            {busca ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t.personagens.limparBusca}
                onClick={() => setBusca("")}
                className="absolute top-1/2 right-1.5 -translate-y-1/2"
              >
                <X />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {termo ? (
        // Só o que casou, numa coluna: os detalhes (com a descrição aberta
        // quando foi nela que casou) e os itens. Medidor e atributo saem, porque
        // não são o que se procura pelo nome. O nome fica no alto, para os
        // achados dizerem de quem são quando há dois personagens. O aviso de
        // "nada" vem PRIMEIRO e só aparece sozinho (`only:`), para a pilha não
        // ganhar uma linha sobrando embaixo do último resultado.
        <>
          <div className="pt-3 pb-2">{nomeComRosto}</div>
          <div className={cn("min-w-0", PILHA)}>
            <p className="text-muted-foreground hidden text-xs only:block">
              {t.personagens.nadaEncontrado(busca.trim())}
            </p>
            <DetalhesDoJogador codigo={codigo} personagemId={personagem.id} busca={termo} />
            <InventarioJogador codigo={codigo} personagemId={personagem.id} busca={termo} />
          </div>
        </>
      ) : (
        // Uma coluna só, na largura toda, com o token grande fora -- ele tomava
        // um terço da largura e espremia os cartões dos detalhes; a imagem está
        // na aba Arquivos.
        <div className={cn("min-w-0 pt-3", PILHA)}>
          {/* O alto do cartão em duas colunas: o rosto, o nome e os números que
              mudam a cada turno à esquerda, os atributos à direita. Os dois são
              o que se consulta de relance, e lado a lado cabem numa tela só. A
              esquerda não desce dos 11,5rem, que é a largura do medidor
              desenhado.

              Lado a lado só com 26rem de CARTÃO, medidos no próprio cartão
              (`@container`), e não na janela: na ficha fixa da tela deitada a
              coluna dos atributos sobrava com um quadro por linha. Mais estreito,
              os atributos descem para baixo dos medidores, numa fileira. */}
          <div
            className={cn(
              "grid items-start gap-x-4 gap-y-3",
              blocoDeAtributos && "@[26rem]:grid-cols-[minmax(11.5rem,1fr)_minmax(0,1fr)]",
            )}
          >
            <div className="min-w-0 space-y-3">
              {nomeComRosto}
              {blocoDeCondicoes}
              {blocoDeMedidores}
            </div>
            {blocoDeAtributos}
          </div>

          {/* Os grupos da ficha (Identidade, Combate, Poderes), cada um uma
              seção da pilha, depois do alto: o atributo é o número de base, e
              o detalhe é o que se monta em cima dele. */}
          <DetalhesDoJogador
            codigo={codigo}
            personagemId={personagem.id}
            abas
            topoDasAbas={comBusca ? 53 : 0}
          />

          {/* As seções dos plugins, depois dos detalhes: são o personagem em
              cena, como eles. Sem plugin o componente devolve `null`, e a pilha
              não ganha linha.

              O inventário saiu daqui: mora na mochila, a bolinha do canto. A
              busca ainda acha os itens, e é por ela que eles aparecem nesta aba. */}
          <BlocosDePlugin codigo={codigo} personagemId={personagem.id} />
        </div>
      )}

      {visualizadores}
    </section>
  );
}

/**
 * As seções empilhadas do cartão, com uma linha entre uma e outra.
 *
 * Linha só ENTRE as que aparecem: quem não tem medidor nem condição não ganha
 * um traço sobrando no topo. O `null` de uma seção vazia não vira elemento, e é
 * por isso que basta contar irmãos no CSS.
 */
const PILHA =
  "divide-y [&>*:not(:first-child)]:pt-3 [&>*:not(:last-child)]:pb-3";

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
          aria-label={t.personagens.apagar(anexo.arquivo)}
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
      aria-label={t.personagens.abrir(arquivo)}
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
