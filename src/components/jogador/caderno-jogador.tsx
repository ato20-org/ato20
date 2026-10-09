"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  Check,
  Loader2,
  NotebookPen,
  Plus,
  Search,
  Tag,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ListaDeSugestoes, MARCA_LISTA } from "@/components/mencoes/sugestoes";
import { AttachmentViewer } from "@/components/attachments/attachment-viewer";
import {
  NotaTextoView,
  type VinculosDaNota,
} from "@/components/jogador/nota-texto-view";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useMencoesDoCaderno,
  type ArquivoDoCaderno,
} from "@/hooks/use-mencoes-do-caderno";
import { FADE_DE_ROLAGEM, useScrollFade } from "@/hooks/use-scroll-fade";
import {
  aplicaSugestao,
  fantasmaDe,
  filtraSugestoes,
  type Sugestao,
} from "@/lib/mencoes/sugestao";
import {
  characterFileUrl,
  revokeCharacterFileUrl,
} from "@/lib/player/characters";
import type { Nota } from "@/lib/player/caderno";
import {
  fragmentoDaNota,
  TITULO_DA_NOTA,
  type SinalDaNota,
} from "@/lib/player/caderno-mencoes";
import { normaliza } from "@/lib/search";
import { idioma } from "@/lib/i18n/idioma";
import { dicionarios, t } from "@/lib/i18n/jogador";
import { rico } from "@/lib/i18n/rico";
import { useCadernoStore } from "@/lib/store/use-caderno-store";
import { cn } from "@/lib/utils";

/** Como uma nota sem título aparece na lista e na menção. */
const SEM_TITULO = t.caderno.semTitulo;

/**
 * O nome da nota sem título em TODOS os idiomas, para a menção achá-la.
 *
 * A menção grava o nome que se via ao escrevê-la: `#Sem título` escrito em
 * português continua no texto quando o celular passa para o inglês, e tem de
 * continuar achando a mesma nota.
 */
const SEM_TITULO_EM_QUALQUER_IDIOMA = new Set(
  Object.values(dicionarios).map((cada) => cada.caderno.semTitulo),
);

/** A nota que uma menção `#titulo` aponta. */
function bateComTitulo(titulo: string, procurado: string): boolean {
  if (titulo) return titulo === procurado;

  return SEM_TITULO_EM_QUALQUER_IDIOMA.has(procurado);
}

/**
 * O caderno do jogador.
 *
 * Era uma caixa de texto só, de vinte mil caracteres, e o problema dela não era
 * tamanho: uma campanha inteira num campo só não tem como ser procurada,
 * separada, nem retomada três semanas depois. Agora são notas — uma por
 * assunto, com título e etiquetas —, e a aba abre na lista delas.
 *
 * A lista mora na aba; a nota abre NO MEIO DA TELA, grande, sobre o fundo
 * escurecido. Escrever pede largura e altura que a aba não tem -- deitado ela é
 * uma coluna estreita, em pé divide a altura com a cena --, e a nota trocava a
 * lista de lugar dentro da aba, com uma seta para voltar. Aberta por cima, a
 * lista continua onde estava ao fechar.
 *
 * Um caderno por PERSONAGEM: ver `AnotacoesJogador`, que escolhe de qual.
 *
 * O que se escreve aqui aceita menção: `@personagem` da mesa, `/arquivo` dos
 * personagens dele, `#nota` do próprio caderno. É a diferença entre anotar "o
 * taverneiro mentiu" e ter, três sessões depois, como chegar de volta na nota
 * em que o nome dele aparece.
 */
export function CadernoJogador({
  codigo,
  personagemId,
  deQuem,
  emCena,
}: {
  codigo: string;
  personagemId: string;
  /** O nome do personagem, ao lado do título, quando não há escolha no alto. */
  deQuem?: string;
  /**
   * Quem está com o retrato no ar agora, por id de personagem.
   *
   * Vem de cima porque quem assina a cena é a casca do Jogador — a inscrição
   * não pode morrer quando o jogador troca de aba. Aqui ela só pinta de verde
   * a menção de quem está na tela logo acima do caderno.
   */
  emCena: Set<string>;
}) {
  const status = useCadernoStore((state) => state.status);
  const notas = useCadernoStore((state) => state.notas);
  const carregar = useCadernoStore((state) => state.carregar);
  const criar = useCadernoStore((state) => state.criar);
  const apagar = useCadernoStore((state) => state.apagar);

  useEffect(() => {
    void carregar(codigo, personagemId);
  }, [carregar, codigo, personagemId]);

  /** Qual nota está aberta. `null` = a lista. */
  const [aberta, setAberta] = useState<string | null>(null);
  const editor = useRef<EditorAberto>(null);

  /**
   * Trocar de nota ou fechar, PEDINDO ao editor: com rascunho, ele pergunta
   * antes. Sem nota aberta, vai direto.
   */
  const tentarIr = useCallback((destino: string | null) => {
    if (editor.current) editor.current.sair(destino);
    else setAberta(destino);
  }, []);

  const [criando, setCriando] = useState(false);

  const mencoes = useMencoesDoCaderno(codigo);

  // O arquivo que uma menção abriu. Estado aqui, e não dentro da nota: a nota
  // desmonta ao trocar de nota, e o visualizador fecharia junto no meio do
  // carregamento.
  const [abrindo, setAbrindo] = useState<ArquivoDoCaderno | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const abrirArquivo = useCallback(
    (arquivo: ArquivoDoCaderno) => {
      setAbrindo(arquivo);
      void characterFileUrl(codigo, arquivo.personagemId, arquivo.anexo).then(
        setUrl,
        () => toast.error(t.erros.abrirArquivo),
      );
    },
    [codigo],
  );

  function fecharArquivo() {
    if (abrindo) revokeCharacterFileUrl(abrindo.personagemId, abrindo.anexo);
    setUrl(null);
    setAbrindo(null);
  }

  /**
   * Como o texto de uma nota resolve os nomes que ele menciona.
   *
   * Montado aqui, uma vez, e não dentro de cada nota: um caderno aberto com
   * trinta menções não pode virar trinta varreduras das mesmas listas.
   */
  const vinculos = useMemo<VinculosDaNota>(
    () => ({
      personagem: (nome) => {
        const achado = mencoes.personagensPorNome.get(nome);
        if (!achado) return null;

        return {
          nome: achado.nome,
          dono: achado.dono,
          emCena: emCena.has(achado.id),
        };
      },
      arquivo: (nome) => mencoes.arquivosPorNome.get(nome) ?? null,
      nota: (titulo) => {
        const achada = notas.find(
          (nota) => bateComTitulo(nota.titulo, titulo),
        );

        return achada
          ? { id: achada.id, titulo: achada.titulo || SEM_TITULO }
          : null;
      },
      abrirArquivo,
      abrirNota: tentarIr,
    }),
    [
      tentarIr,
      abrirArquivo,
      emCena,
      mencoes.arquivosPorNome,
      mencoes.personagensPorNome,
      notas,
    ],
  );

  async function novaNota() {
    setCriando(true);

    const nota = await criar(codigo);

    setCriando(false);

    // Abre já na nota criada: o gesto foi "quero escrever agora", e uma nota
    // vazia no topo de uma lista é o meio do caminho, não o fim dele.
    if (nota) setAberta(nota.id);
    else toast.error(t.erros.abrirNota);
  }

  const notaAberta = notas.find((nota) => nota.id === aberta) ?? null;

  /**
   * Sai da nota aberta de vez -- o editor já perguntou o que tinha de
   * perguntar. A nota nova que fecha sem nada gravado vai embora junto: o "Nova
   * nota" cria no daemon antes de se escrever, e quem abriu e desistiu deixava
   * um "Sem título" vazio na lista.
   */
  function ir(destino: string | null) {
    if (
      notaAberta &&
      notaAberta.titulo === "" &&
      notaAberta.texto === "" &&
      notaAberta.tags.length === 0
    ) {
      void apagar(codigo, notaAberta.id);
    }
    setAberta(destino);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Lista
        notas={notas}
        deQuem={deQuem}
        carregando={status === "lendo" && notas.length === 0}
        criando={criando}
        onAbrir={setAberta}
        onNova={() => void novaNota()}
      />

      <Dialog
        open={notaAberta !== null}
        onOpenChange={(abrir, detalhes) => {
          if (abrir) return;
          // Quem fecha é o editor, depois de perguntar se há rascunho.
          detalhes.cancel();
          // O Esc que o campo já usou -- fechar a lista de menções, sair da
          // escrita -- não fecha a nota junto. Ver o `onKeyDown` do `Editor`.
          if (detalhes.reason === "escape-key" && detalhes.event.defaultPrevented) return;
          tentarIr(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-black/60"
          // A nota nova abre no título; a que já existe, no X -- nunca na
          // lixeira, que é o primeiro botão da fila e apagaria com um Enter.
          initialFocus={() => document.querySelector<HTMLElement>("[data-foco-da-nota]") ?? true}
          className="flex h-[min(52rem,calc(100dvh-2rem))] flex-col gap-3 p-4 sm:max-w-2xl sm:p-6"
        >
          {notaAberta ? (
            <Editor
              // A chave é a nota: trocar de nota pelo `#nota` de dentro do texto
              // troca o conteúdo do editor inteiro, e sem remontar o campo
              // ficaria com o texto da nota anterior sob o título da nova.
              key={notaAberta.id}
              ref={editor}
              codigo={codigo}
              nota={notaAberta}
              notas={notas}
              mencoes={mencoes}
              emCena={emCena}
              vinculos={vinculos}
              onIr={ir}
              onApagar={() => {
                setAberta(null);
                void apagar(codigo, notaAberta.id);
              }}
            />
          ) : null}

          {/* O mesmo visualizador da ficha: quem tocou num `/arquivo` dentro da
              nota vê a imagem abrir do jeito que ela abre na lista de arquivos
              do personagem. Dentro do diálogo da nota, e não ao lado dele: um
              diálogo de fora seria "toque fora" e fecharia a nota. */}
          <AttachmentViewer
            attachment={abrindo?.anexo ?? null}
            url={url}
            onClose={fecharArquivo}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * A lista de notas, com busca e filtro por etiqueta.
 *
 * Busca e filtro são duas perguntas diferentes e ficam separados: a busca é
 * "onde eu escrevi aquela palavra", e a etiqueta é "me mostre tudo que é
 * pista". Um campo só faria a segunda pergunta depender de o jogador lembrar a
 * palavra exata que usou.
 */
function Lista({
  notas,
  deQuem,
  carregando,
  criando,
  onAbrir,
  onNova,
}: {
  notas: Nota[];
  deQuem?: string;
  carregando: boolean;
  criando: boolean;
  onAbrir: (id: string) => void;
  onNova: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [etiqueta, setEtiqueta] = useState<string | null>(null);

  // O esmaecido das bordas só quando a lista passa da altura da tela. Ver
  // `useScrollFade`: fixo, ele comia o topo do primeiro cartão num caderno de
  // uma nota.
  const [areaDaLista, listaRola] = useScrollFade<HTMLDivElement>([
    notas.length,
    busca,
    etiqueta,
  ]);

  /** Todas as etiquetas do caderno, em ordem alfabética. */
  const etiquetas = useMemo(() => {
    const todas = new Set<string>();

    for (const nota of notas) for (const tag of nota.tags) todas.add(tag);

    return [...todas].sort((a, b) => a.localeCompare(b, idioma));
  }, [notas]);

  const filtradas = useMemo(() => {
    const alvo = normaliza(busca.trim());

    return notas.filter((nota) => {
      if (etiqueta && !nota.tags.includes(etiqueta)) return false;
      if (alvo.length === 0) return true;

      // Título, corpo e etiquetas na mesma busca: quem procura "porão" não
      // lembra se escreveu a palavra no título ou no meio da terceira linha.
      return (
        normaliza(nota.titulo).includes(alvo) ||
        normaliza(nota.texto).includes(alvo) ||
        nota.tags.some((tag) => normaliza(tag).includes(alvo))
      );
    });
  }, [busca, etiqueta, notas]);

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <NotebookPen
          className="text-muted-foreground size-4 shrink-0"
          aria-hidden
        />
        <p className="text-sm font-medium">{t.caderno.titulo}</p>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
          {deQuem}
        </span>

        <Button
          size="sm"
          variant="secondary"
          disabled={criando}
          onClick={onNova}
        >
          {criando ? <Loader2 className="animate-spin" /> : <Plus />}
          {t.caderno.novaNota}
        </Button>
      </div>

      {/* A busca só aparece quando há o que procurar: num caderno de duas notas
          ela é um campo a mais ocupando a altura que a segunda nota queria. */}
      {notas.length > 3 ? (
        <div className="relative shrink-0">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            className="pl-8"
            placeholder={t.caderno.procurar}
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
        </div>
      ) : null}

      {etiquetas.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-1">
          {etiquetas.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={etiqueta === tag}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px]",
                etiqueta === tag
                  ? "bg-accent text-accent-foreground border-transparent"
                  : "text-muted-foreground",
              )}
              // Tocar na etiqueta ligada desliga: o filtro é um interruptor, e
              // procurar onde desligá-lo seria pior que o filtro.
              onClick={() =>
                setEtiqueta((atual) => (atual === tag ? null : tag))
              }
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={areaDaLista}
        className={cn(
          "min-h-0 flex-1 space-y-4 overflow-y-auto pb-6",
          listaRola && FADE_DE_ROLAGEM,
        )}
      >
        <ul className="space-y-2">
          {filtradas.map((nota) => (
            <li key={nota.id}>
              <button
                type="button"
                className="bg-card/60 hover:bg-accent/40 w-full rounded-lg border p-3 text-left"
                onClick={() => onAbrir(nota.id)}
              >
                <span className="block truncate text-sm font-medium">
                  {nota.titulo || SEM_TITULO}
                </span>

                {/* Duas linhas do corpo, e o texto CRU com os sinais à vista: na
                  lista o que importa é reconhecer a nota, e `@Corvo` reconhece
                  tão bem quanto o nome pintado — sem montar a menção inteira
                  para cada linha de uma lista que pode ter duzentas. */}
                {nota.texto ? (
                  <span className="text-muted-foreground mt-1 line-clamp-2 block text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {nota.texto}
                  </span>
                ) : null}

                {nota.tags.length > 0 ? (
                  <span className="mt-2 flex flex-wrap gap-1">
                    {nota.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-muted-foreground rounded-full border px-1.5 py-px text-[10px]"
                      >
                        {tag}
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            </li>
          ))}

          {filtradas.length === 0 ? (
            <li className="text-muted-foreground px-1 py-6 text-center text-xs leading-relaxed">
              {carregando
                ? t.caderno.abrindo
                : notas.length === 0
                  ? t.caderno.vazio
                  : t.caderno.nenhuma}
            </li>
          ) : null}
        </ul>
      </div>
    </>
  );
}

/** O que o pai pede ao editor aberto. Ver `pedirSaida`. */
type EditorAberto = { sair: (destino: string | null) => void };

/** As mesmas etiquetas, na mesma ordem. */
function mesmasEtiquetas(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((tag, posicao) => tag === b[posicao]);
}

/**
 * Uma nota aberta: título, etiquetas e o corpo.
 *
 * Grava no botão Salvar (ou Ctrl+S), e não a cada tecla: o rascunho -- título,
 * texto e etiquetas -- mora aqui até o jogador mandar. Sair com alteração não
 * salva pergunta antes: salvar, descartar ou continuar. A gravação sozinha a
 * cada 800ms fazia "Gravado" piscar a cada palavra e gravava também o que o
 * jogador escreveu e desistiu.
 *
 * O corpo troca de cara conforme o foco — `<textarea>` enquanto se escreve, o
 * texto com as menções pintadas quando o dedo sai dali. É o mesmo contrato do
 * postit do mestre, e pela mesma razão: formatar durante a digitação esconderia
 * os caracteres que quem escreve precisa ver para saber se escreveu `@Corvo` ou
 * `@ Corvo`.
 */
function Editor({
  codigo,
  nota,
  notas,
  mencoes,
  emCena,
  vinculos,
  onIr,
  onApagar,
  ref,
}: {
  codigo: string;
  nota: Nota;
  notas: Nota[];
  mencoes: ReturnType<typeof useMencoesDoCaderno>;
  emCena: Set<string>;
  vinculos: VinculosDaNota;
  /** Sai da nota: para a lista (`null`) ou para outra nota. */
  onIr: (destino: string | null) => void;
  onApagar: () => void;
  ref: Ref<EditorAberto>;
}) {
  const salvarNaMesa = useCadernoStore((state) => state.salvar);

  /**
   * O rascunho: o que está na tela e ainda não foi salvo. Semeado pela nota e
   * refeito quando a nota troca -- ver a chave em `key`, no pai.
   */
  const [texto, setTexto] = useState(nota.texto);
  const [titulo, setTitulo] = useState(nota.titulo);
  const [tags, setTags] = useState(nota.tags);

  const [salvando, setSalvando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  /** A saída que esperou a pergunta "salvar?". `null` = sem pergunta aberta. */
  const [saida, setSaida] = useState<{ destino: string | null } | null>(null);

  const sujo =
    titulo !== nota.titulo || texto !== nota.texto || !mesmasEtiquetas(tags, nota.tags);

  const [escrevendo, setEscrevendo] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [indice, setIndice] = useState(0);
  /** Onde começava o marcador cuja lista foi dispensada com Esc. */
  const [dispensadoEm, setDispensadoEm] = useState(-1);

  const campo = useRef<HTMLTextAreaElement | null>(null);
  /** Onde a lista de menções entra: dentro do diálogo. Ver `recipiente`. */
  const [folha, setFolha] = useState<HTMLDivElement | null>(null);
  const nova = nota.titulo === "" && nota.texto === "";
  const [areaDoTexto, textoRola] = useScrollFade<HTMLDivElement>([
    texto,
    escrevendo,
  ]);
  const cursorPendente = useRef<number | null>(null);

  async function salvar(): Promise<boolean> {
    if (!sujo) return true;

    const enviado = { titulo, texto, tags };
    setSalvando(true);
    const gravada = await salvarNaMesa(codigo, nota.id, enviado);
    setSalvando(false);

    if (!gravada) {
      setFalhou(true);
      toast.error(t.erros.gravarNota);
      return false;
    }

    setFalhou(false);
    // O daemon limpa o que recebe -- título de uma linha, etiqueta repetida
    // fora --, e o rascunho passa a ser o que ficou gravado: sem isto, a nota
    // apareceria "não salva" logo depois de salva. O que mudou enquanto a
    // gravação ia e voltava continua rascunho.
    setTitulo((atual) => (atual === enviado.titulo ? gravada.titulo : atual));
    setTexto((atual) => (atual === enviado.texto ? gravada.texto : atual));
    setTags((atual) => (atual === enviado.tags ? gravada.tags : atual));
    return true;
  }

  /**
   * Sair da nota -- pelo X, pelo Esc, pelo toque no fundo escurecido, pelo
   * `#nota` que leva a outra. Com alteração não salva, pergunta antes.
   */
  function pedirSaida(destino: string | null) {
    if (sujo) setSaida({ destino });
    else onIr(destino);
  }

  useImperativeHandle(ref, () => ({ sair: pedirSaida }));

  // Fechar a aba ou recarregar a página com rascunho: o aviso do navegador.
  useEffect(() => {
    if (!sujo) return;

    const avisar = (evento: BeforeUnloadEvent) => evento.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sujo]);

  // Tocar para escrever leva o cursor ao FIM do texto, e não ao começo, onde o
  // `autoFocus` o deixa: o que se acrescenta a uma nota quase sempre vai
  // embaixo do que já estava, e a frase nova entrava antes da primeira palavra.
  useEffect(() => {
    const elemento = campo.current;
    if (!escrevendo || !elemento) return;

    const fim = elemento.value.length;
    elemento.setSelectionRange(fim, fim);
    elemento.scrollTop = elemento.scrollHeight;
  }, [escrevendo]);

  /**
   * Devolve o cursor ao lugar depois de uma escolha da lista.
   *
   * Num efeito de layout não daria: a posição depende do texto que o pai acabou
   * de aplicar, e escrever no DOM antes da pintura é exatamente o que o React
   * faz por nós aqui — basta esperar o render em que o texto novo já está.
   */
  useEffect(() => {
    const posicao = cursorPendente.current;
    if (posicao === null || !campo.current) return;

    cursorPendente.current = null;
    campo.current.setSelectionRange(posicao, posicao);
    setCursor(posicao);
  }, [texto]);

  /**
   * O que cada sinal oferece.
   *
   * Personagem em cena primeiro: numa lista de seis, quem está no ar agora é
   * quase sempre sobre quem se está escrevendo. O detalhe de cada um é o nome
   * de quem joga — é o que separa dois personagens de nome parecido.
   */
  const candidatos = useMemo<Record<SinalDaNota, Sugestao[]>>(
    () => ({
      "@": [...mencoes.personagens]
        .sort((a, b) => Number(emCena.has(b.id)) - Number(emCena.has(a.id)))
        .map((personagem) => ({
          nome: personagem.nome,
          detalhe: personagem.dono,
        })),
      "/": mencoes.arquivos.map((arquivo) => ({
        nome: arquivo.anexo.arquivo,
        detalhe: arquivo.personagemNome,
      })),
      // A própria nota fica de fora: uma nota que aponta para si mesma é um
      // link que não leva a lugar nenhum.
      "#": notas
        .filter((outra) => outra.id !== nota.id)
        .map((outra) => ({ nome: outra.titulo || SEM_TITULO })),
    }),
    [emCena, mencoes.arquivos, mencoes.personagens, nota.id, notas],
  );

  const fragmento = escrevendo ? fragmentoDaNota(texto, cursor) : null;

  const sugestoes =
    fragmento && fragmento.inicio !== dispensadoEm
      ? filtraSugestoes(
          candidatos[fragmento.sinal],
          fragmento.prefixo,
          normaliza,
        )
      : [];

  // O item sob as setas nunca aponta para fora da lista: descer até o sexto e
  // digitar mais uma letra encurta a lista para dois.
  const escolhido = Math.min(indice, Math.max(sugestoes.length - 1, 0));

  const fantasma =
    fragmento && sugestoes.length > 0
      ? fantasmaDe(
          sugestoes[escolhido].nome,
          fragmento.prefixo,
          texto[cursor],
          normaliza,
        )
      : "";

  function aplicar(nome: string) {
    if (!fragmento) return;

    const resultado = aplicaSugestao(texto, fragmento, cursor, nome);

    cursorPendente.current = resultado.cursor;
    setTexto(resultado.texto);
    setIndice(0);

    // O foco pode ter ficado no caminho quando a escolha veio do toque.
    campo.current?.focus();
  }

  return (
    // Ctrl+S (ou Cmd+S) salva de qualquer campo da nota.
    <div
      className="contents"
      onKeyDown={(evento) => {
        if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "s") {
          evento.preventDefault();
          void salvar();
        }
      }}
    >
      <DialogTitle className="sr-only">{titulo || SEM_TITULO}</DialogTitle>

      <div className="flex shrink-0 items-center gap-1">
        {/* Em que pé está a nota: salva, com alteração, salvando, ou a
            gravação que falhou. */}
        <span className="text-muted-foreground flex h-4 min-w-0 flex-1 items-center gap-1 text-[11px]">
          {salvando ? (
            <>
              <Loader2 className="size-3 animate-spin" aria-hidden />
              {t.caderno.salvando}
            </>
          ) : falhou && sujo ? (
            <span className="flex items-center gap-1 text-amber-300">
              <TriangleAlert className="size-3" aria-hidden />
              {t.caderno.naoSalvou}
            </span>
          ) : sujo ? (
            <>
              <span className="size-1.5 shrink-0 rounded-full bg-amber-300" aria-hidden />
              <span className="truncate">{t.caderno.naoSalvo}</span>
            </>
          ) : (
            <>
              <Check className="size-3" aria-hidden />
              {t.caderno.salvo}
            </>
          )}
        </span>

        <Button
          size="sm"
          disabled={!sujo || salvando}
          onClick={() => void salvar()}
          className="mr-1"
        >
          {t.caderno.salvar}
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.caderno.apagar}
          onClick={() => {
            // Sem diálogo de confirmação: a nota volta pela lista se a remoção
            // falhar, e o que se perde no toque errado é uma nota que o jogador
            // acabou de ver na tela. Um "tem certeza?" a cada gesto do polegar
            // custaria mais que o engano.
            onApagar();
            toast.success(t.caderno.apagada);
          }}
        >
          <Trash2 />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.caderno.fechar}
          onClick={() => pedirSaida(null)}
          {...(nova ? {} : { "data-foco-da-nota": "" })}
        >
          <X />
        </Button>
      </div>

      {/* Título e etiquetas sem caixa em volta, como o cabeçalho de uma
          página: a nota aberta é uma folha para escrever, e não um formulário.
          A nota nova abre com o cursor no título. */}
      <input
        className="placeholder:text-muted-foreground/60 w-full shrink-0 bg-transparent text-xl font-semibold outline-none"
        placeholder={t.caderno.tituloDaNota}
        aria-label={t.caderno.tituloDaNota}
        {...(nova ? { "data-foco-da-nota": "" } : {})}
        value={titulo}
        maxLength={120}
        onChange={(event) => setTitulo(event.target.value)}
      />

      <Etiquetas tags={tags} onMudar={setTags} />

      <div className="relative -mx-4 min-h-0 flex-1 border-t px-4 pt-3 sm:-mx-6 sm:px-6">
        {escrevendo ? (
          <>
            <Textarea
              ref={campo}
              autoFocus
              // Sem borda nem recuo: o texto escrito fica no MESMO lugar do
              // texto lido, e tocar para escrever não faz a nota pular.
              className="h-full resize-none rounded-none border-0 bg-transparent p-0 text-base leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent"
              placeholder={t.caderno.dicaDoTexto}
              value={texto}
              maxLength={20_000}
              spellCheck={false}
              onChange={(event) => {
                setTexto(event.target.value);
                setCursor(event.target.selectionStart);
              }}
              // Cobre seta, toque e arrasto de seleção de uma vez: `select`
              // dispara em qualquer mudança de posição do cursor.
              onSelect={(event) =>
                setCursor(event.currentTarget.selectionStart)
              }
              onBlur={(event) => {
                // A lista vive num portal fora do campo, e escolher nela tira o
                // foco daqui. Sem esta guarda, o texto voltaria a ser só leitura
                // no meio do gesto de escolher.
                const alvo = event.relatedTarget;
                if (alvo instanceof Element && alvo.closest(`[${MARCA_LISTA}]`))
                  return;

                setEscrevendo(false);
              }}
              onKeyDown={(event) => {
                const lista = sugestoes.length > 0;

                // Seta-direita confirma o fantasma, como no VS Code: com o
                // cursor no fim da linha ela não tem para onde ir, e é o gesto
                // que a mão já faz para "aceitar isso".
                if (fantasma && event.key === "ArrowRight") {
                  event.preventDefault();
                  aplicar(sugestoes[escolhido].nome);

                  return;
                }

                if (
                  lista &&
                  (event.key === "ArrowDown" || event.key === "ArrowUp")
                ) {
                  event.preventDefault();

                  const passo = event.key === "ArrowDown" ? 1 : -1;
                  setIndice((atual) => {
                    const proximo =
                      (Math.min(atual, sugestoes.length - 1) + passo) %
                      sugestoes.length;

                    return proximo < 0 ? sugestoes.length - 1 : proximo;
                  });

                  return;
                }

                // Enter só escolhe com a lista aberta: fora dela ele é quebra de
                // linha, e a nota de três parágrafos é o caso comum.
                if (lista && (event.key === "Enter" || event.key === "Tab")) {
                  event.preventDefault();
                  aplicar(sugestoes[escolhido].nome);

                  return;
                }

                if (event.key === "Escape") {
                  // Primeiro Esc fecha a lista, segundo sai da escrita, o
                  // terceiro fecha a nota. O `preventDefault` é o recado ao
                  // diálogo de que este Esc já foi usado.
                  event.preventDefault();
                  if (lista && fragmento) setDispensadoEm(fragmento.inicio);
                  else setEscrevendo(false);
                }
              }}
            />

            {sugestoes.length > 0 && fragmento ? (
              <ListaDeSugestoes
                titulo={TITULO_DA_NOTA[fragmento.sinal]}
                itens={sugestoes}
                indice={escolhido}
                // Ancorada no CAMPO, e não na linha do cursor como no postit:
                // aqui o campo é uma caixa de texto comum de uma tela que não
                // dá zoom, e o espelho que acha a linha do cursor existiria só
                // para subir a lista duas linhas. No celular ela abre acima do
                // teclado de qualquer jeito.
                ancora={campo}
                onEscolher={aplicar}
                recipiente={folha}
              />
            ) : null}
          </>
        ) : (
          // A nota em repouso: o texto com as menções pintadas, e um toque
          // volta a escrever. `role` de botão não serve — há botões DENTRO do
          // texto, e botão dentro de botão é marcação que o navegador desmancha.
          <div
            ref={areaDoTexto}
            className={cn(
              "h-full overflow-y-auto",
              textoRola && FADE_DE_ROLAGEM,
            )}
            onClick={(event) => {
              // Toque numa menção abre a menção; toque no texto volta a
              // escrever. Sem isto, abrir um arquivo mencionado também abriria
              // o teclado por cima dele.
              if (
                event.target instanceof Element &&
                event.target.closest("button")
              )
                return;

              setEscrevendo(true);
            }}
          >
            {texto ? (
              <NotaTextoView texto={texto} vinculos={vinculos} />
            ) : (
              <p className="text-muted-foreground text-sm">
                {rico(t.caderno.tocarParaEscrever, {
                  arroba: <code>@</code>,
                  barra: <code>/</code>,
                  cerquilha: <code>#</code>,
                })}
              </p>
            )}
          </div>
        )}

        {/* O fantasma do que falta do nome, em cinza, à frente do cursor. Não
            está no texto e não vai para lugar nenhum — só aparece. */}
        {fantasma ? (
          <span className="text-muted-foreground pointer-events-none absolute right-3 bottom-2 text-[11px]">
            {t.caderno.completa(fantasma)}
          </span>
        ) : null}
      </div>

      <div ref={setFolha} className="contents" />

      {/* Dentro do diálogo da nota, para o Esc e o toque fora fecharem só a
          pergunta. */}
      <AlertDialog
        open={saida !== null}
        onOpenChange={(abrir) => {
          if (!abrir) setSaida(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.caderno.sair.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{t.caderno.sair.descricao}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.caderno.sair.continuar}</AlertDialogCancel>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const destino = saida?.destino ?? null;
                setSaida(null);
                onIr(destino);
              }}
            >
              {t.caderno.sair.descartar}
            </Button>
            <Button
              size="sm"
              disabled={salvando}
              onClick={async () => {
                const destino = saida?.destino ?? null;
                // Falhou: a pergunta fica, e o rascunho também.
                if (!(await salvar())) return;
                setSaida(null);
                onIr(destino);
              }}
            >
              {salvando ? <Loader2 className="animate-spin" /> : null}
              {t.caderno.salvar}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * As etiquetas de uma nota.
 *
 * Campo próprio, e não `#` no meio do texto: `#` já é a menção de outra nota, e
 * os dois no mesmo caractere seriam ambiguidade a cada tecla. Aqui elas também
 * ganham o que texto não dá — a lista de todas as que existem, no alto do
 * caderno, servindo de filtro.
 */
function Etiquetas({
  tags,
  onMudar,
}: {
  tags: string[];
  onMudar: (tags: string[]) => void;
}) {
  const [nova, setNova] = useState("");
  const [abrindo, setAbrindo] = useState(false);

  function adicionar() {
    const limpa = nova.trim();

    setNova("");
    setAbrindo(false);

    // Repetida não entra: o daemon já as limpa, e deixar a tela mandar a
    // duplicata faria a etiqueta piscar na lista antes de a resposta voltar.
    if (
      limpa.length === 0 ||
      tags.some((tag) => tag.toLowerCase() === limpa.toLowerCase())
    ) {
      return;
    }

    onMudar([...tags, limpa]);
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="text-muted-foreground flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2 text-[11px]"
        >
          {tag}
          <button
            type="button"
            aria-label={t.caderno.tirarEtiqueta(tag)}
            className="hover:text-foreground"
            onClick={() => onMudar(tags.filter((outra) => outra !== tag))}
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}

      {abrindo ? (
        <Input
          autoFocus
          className="h-7 w-32 text-xs"
          placeholder={t.caderno.novaEtiqueta}
          value={nova}
          maxLength={24}
          onChange={(event) => setNova(event.target.value)}
          onBlur={adicionar}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              adicionar();
            }

            if (event.key === "Escape") {
              // Fecha o campo da etiqueta, e não a nota. Ver o Esc do texto.
              event.preventDefault();
              setNova("");
              setAbrindo(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px]"
          onClick={() => setAbrindo(true)}
        >
          <Tag className="size-3" aria-hidden />
          {t.caderno.etiqueta}
        </button>
      )}
    </div>
  );
}
