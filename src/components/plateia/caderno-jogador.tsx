"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
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
import { NotaTextoView, type VinculosDaNota } from "@/components/plateia/nota-texto-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMencoesDoCaderno, type ArquivoDoCaderno } from "@/hooks/use-mencoes-do-caderno";
import { FADE_DE_ROLAGEM, useScrollFade } from "@/hooks/use-scroll-fade";
import {
  aplicaSugestao,
  fantasmaDe,
  filtraSugestoes,
  type Sugestao,
} from "@/lib/mencoes/sugestao";
import { characterFileUrl, revokeCharacterFileUrl } from "@/lib/player/characters";
import type { Nota } from "@/lib/player/caderno";
import {
  fragmentoDaNota,
  TITULO_DA_NOTA,
  type SinalDaNota,
} from "@/lib/player/caderno-mencoes";
import { normaliza } from "@/lib/search";
import { useCadernoStore } from "@/lib/store/use-caderno-store";
import { cn } from "@/lib/utils";

/** Espera antes de gravar, em milissegundos. Igual à nota de personagem. */
const DEBOUNCE_MS = 800;

/** Como uma nota sem título aparece na lista e na menção. */
const SEM_TITULO = "Sem título";

/**
 * O caderno do jogador.
 *
 * Era uma caixa de texto só, de vinte mil caracteres, e o problema dela não era
 * tamanho: uma campanha inteira num campo só não tem como ser procurada,
 * separada, nem retomada três semanas depois. Agora são notas — uma por
 * assunto, com título e etiquetas —, e a aba abre na lista delas.
 *
 * Duas telas, e não duas colunas: um celular em pé tem 390px, e lista mais
 * editor lado a lado dariam duas colunas ruins. A lista leva à nota, a seta
 * volta — é a navegação que todo aplicativo de notas do telefone usa, e é a que
 * a mão já conhece.
 *
 * O que se escreve aqui aceita menção: `@personagem` da mesa, `/arquivo` dos
 * personagens dele, `#nota` do próprio caderno. É a diferença entre anotar "o
 * taverneiro mentiu" e ter, três sessões depois, como chegar de volta na nota
 * em que o nome dele aparece.
 */
export function CadernoJogador({
  codigo,
  emCena,
  rodape,
}: {
  codigo: string;
  /**
   * Quem está com o retrato no ar agora, por id de personagem.
   *
   * Vem de cima porque quem assina a cena é a casca da Plateia — a inscrição
   * não pode morrer quando o jogador troca de aba. Aqui ela só pinta de verde
   * a menção de quem está na tela logo acima do caderno.
   */
  emCena: Set<string>;
  /**
   * O que vem embaixo da lista — hoje, as notas de cada personagem.
   *
   * Aqui dentro e não ao lado: anotar é UM lugar, e as duas caixas em dois
   * cantos da interface deixavam a pergunta de qual delas valia. Some quando
   * uma nota está aberta, e isso é o ponto — escrever é uma tela só.
   */
  rodape?: ReactNode;
}) {
  const status = useCadernoStore((state) => state.status);
  const notas = useCadernoStore((state) => state.notas);
  const carregar = useCadernoStore((state) => state.carregar);
  const criar = useCadernoStore((state) => state.criar);
  const apagar = useCadernoStore((state) => state.apagar);

  useEffect(() => {
    void carregar(codigo);
  }, [carregar, codigo]);

  /** Qual nota está aberta. `null` = a lista. */
  const [aberta, setAberta] = useState<string | null>(null);

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
      void characterFileUrl(codigo, arquivo.personagemId, arquivo.anexo).then(setUrl, () =>
        toast.error("Não foi possível abrir o arquivo."),
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

        return { nome: achado.nome, dono: achado.dono, emCena: emCena.has(achado.id) };
      },
      arquivo: (nome) => mencoes.arquivosPorNome.get(nome) ?? null,
      nota: (titulo) => {
        const achada = notas.find((nota) => (nota.titulo || SEM_TITULO) === titulo);

        return achada ? { id: achada.id, titulo: achada.titulo || SEM_TITULO } : null;
      },
      abrirArquivo,
      abrirNota: setAberta,
    }),
    [abrirArquivo, emCena, mencoes.arquivosPorNome, mencoes.personagensPorNome, notas],
  );

  async function novaNota() {
    setCriando(true);

    const nota = await criar(codigo);

    setCriando(false);

    // Abre já na nota criada: o gesto foi "quero escrever agora", e uma nota
    // vazia no topo de uma lista é o meio do caminho, não o fim dele.
    if (nota) setAberta(nota.id);
    else toast.error("Não foi possível abrir a nota.");
  }

  const notaAberta = notas.find((nota) => nota.id === aberta) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {notaAberta ? (
        <Editor
          // A chave é a nota: trocar de nota pelo `#nota` de dentro do texto
          // troca o conteúdo do editor inteiro, e sem remontar o campo ficaria
          // com o texto da nota anterior sob o título da nova.
          key={notaAberta.id}
          codigo={codigo}
          nota={notaAberta}
          notas={notas}
          mencoes={mencoes}
          emCena={emCena}
          vinculos={vinculos}
          onVoltar={() => setAberta(null)}
          onApagar={() => {
            setAberta(null);
            void apagar(codigo, notaAberta.id);
          }}
        />
      ) : (
        <Lista
          notas={notas}
          carregando={status === "lendo" && notas.length === 0}
          criando={criando}
          rodape={rodape}
          onAbrir={setAberta}
          onNova={() => void novaNota()}
        />
      )}

      {/* O mesmo visualizador da ficha: quem tocou num `/arquivo` dentro da nota
          vê a imagem abrir do jeito que ela abre na lista de arquivos do
          personagem. */}
      <AttachmentViewer attachment={abrindo?.anexo ?? null} url={url} onClose={fecharArquivo} />
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
  carregando,
  criando,
  rodape,
  onAbrir,
  onNova,
}: {
  notas: Nota[];
  carregando: boolean;
  criando: boolean;
  rodape?: ReactNode;
  onAbrir: (id: string) => void;
  onNova: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [etiqueta, setEtiqueta] = useState<string | null>(null);

  // O esmaecido das bordas só quando a lista passa da altura da tela. Ver
  // `useScrollFade`: fixo, ele comia o topo do primeiro cartão num caderno de
  // uma nota.
  const [areaDaLista, listaRola] = useScrollFade<HTMLDivElement>([notas.length, busca, etiqueta]);

  /** Todas as etiquetas do caderno, em ordem alfabética. */
  const etiquetas = useMemo(() => {
    const todas = new Set<string>();

    for (const nota of notas) for (const tag of nota.tags) todas.add(tag);

    return [...todas].sort((a, b) => a.localeCompare(b, "pt-BR"));
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
        <NotebookPen className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <p className="flex-1 text-sm font-medium">Caderno</p>

        <Button size="sm" variant="secondary" disabled={criando} onClick={onNova}>
          {criando ? <Loader2 className="animate-spin" /> : <Plus />}
          Nova nota
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
            placeholder="Procurar no caderno"
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
              onClick={() => setEtiqueta((atual) => (atual === tag ? null : tag))}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={areaDaLista}
        className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto pb-6", listaRola && FADE_DE_ROLAGEM)}
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
                <span className="text-muted-foreground mt-1 line-clamp-2 block text-xs whitespace-pre-wrap">
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
              ? "Abrindo o caderno…"
              : notas.length === 0
                ? "Nada escrito ainda. O que você descobrir, quem mentiu, o que não pode esquecer."
                : "Nenhuma nota com isso."}
          </li>
        ) : null}
      </ul>

        {rodape}
      </div>
    </>
  );
}

/**
 * Uma nota aberta: título, etiquetas e o corpo.
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
  onVoltar,
  onApagar,
}: {
  codigo: string;
  nota: Nota;
  notas: Nota[];
  mencoes: ReturnType<typeof useMencoesDoCaderno>;
  emCena: Set<string>;
  vinculos: VinculosDaNota;
  onVoltar: () => void;
  onApagar: () => void;
}) {
  const mudar = useCadernoStore((state) => state.mudar);
  const gravando = useCadernoStore((state) => state.gravando);
  const falhou = useCadernoStore((state) => state.falhou);

  /**
   * O texto sendo digitado.
   *
   * Local, e não lido do store a cada tecla: a gravação é atrasada, e um campo
   * controlado pelo store mostraria a letra só quando a requisição voltasse.
   * Semeado pela nota e refeito quando a nota troca — ver a chave em `key`, no
   * pai.
   */
  const [texto, setTexto] = useState(nota.texto);
  const [titulo, setTitulo] = useState(nota.titulo);

  const [escrevendo, setEscrevendo] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [indice, setIndice] = useState(0);
  /** Onde começava o marcador cuja lista foi dispensada com Esc. */
  const [dispensadoEm, setDispensadoEm] = useState(-1);

  const campo = useRef<HTMLTextAreaElement | null>(null);
  const [areaDoTexto, textoRola] = useScrollFade<HTMLDivElement>([texto, escrevendo]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cursorPendente = useRef<number | null>(null);

  useEffect(() => {
    return () => clearTimeout(timer.current);
  }, []);

  /**
   * Grava com atraso: a escrita vai pela rede, e uma requisição por tecla numa
   * mão pesada são dezenas de PATCHs por frase.
   */
  const gravarDepois = useCallback(
    (patch: { texto?: string; titulo?: string }) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void mudar(codigo, nota.id, patch), DEBOUNCE_MS);
    },
    [codigo, mudar, nota.id],
  );

  // Sair da nota não pode perder os últimos 800ms de digitação: o gesto de
  // voltar é o mesmo que fecha o teclado, e ele acontece justo depois da última
  // palavra.
  function sair() {
    clearTimeout(timer.current);

    if (texto !== nota.texto || titulo !== nota.titulo) {
      void mudar(codigo, nota.id, { texto, titulo });
    }

    onVoltar();
  }

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
        .map((personagem) => ({ nome: personagem.nome, detalhe: personagem.dono })),
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
      ? filtraSugestoes(candidatos[fragmento.sinal], fragmento.prefixo, normaliza)
      : [];

  // O item sob as setas nunca aponta para fora da lista: descer até o sexto e
  // digitar mais uma letra encurta a lista para dois.
  const escolhido = Math.min(indice, Math.max(sugestoes.length - 1, 0));

  const fantasma =
    fragmento && sugestoes.length > 0
      ? fantasmaDe(sugestoes[escolhido].nome, fragmento.prefixo, texto[cursor], normaliza)
      : "";

  function aplicar(nome: string) {
    if (!fragmento) return;

    const resultado = aplicaSugestao(texto, fragmento, cursor, nome);

    cursorPendente.current = resultado.cursor;
    setTexto(resultado.texto);
    gravarDepois({ texto: resultado.texto });
    setIndice(0);

    // O foco pode ter ficado no caminho quando a escolha veio do toque.
    campo.current?.focus();
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Voltar para o caderno" onClick={sair}>
          <ArrowLeft />
        </Button>

        {/* O estado da gravação, em duas letras de altura. Sem ele, o atraso de
            800ms é indistinguível de não ter gravado — e a dúvida leva o
            jogador a copiar tudo para outro aplicativo. */}
        <span className="text-muted-foreground flex h-4 flex-1 items-center gap-1 text-[11px]">
          {gravando ? (
            <>
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Gravando
            </>
          ) : falhou ? (
            <span className="flex items-center gap-1 text-amber-300">
              <TriangleAlert className="size-3" aria-hidden />
              Não gravou
            </span>
          ) : (
            <>
              <Check className="size-3" aria-hidden />
              Gravado
            </>
          )}
        </span>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Apagar esta nota"
          onClick={() => {
            // Sem diálogo de confirmação: a nota volta pela lista se a remoção
            // falhar, e o que se perde no toque errado é uma nota que o jogador
            // acabou de ver na tela. Um "tem certeza?" a cada gesto do polegar
            // custaria mais que o engano.
            onApagar();
            toast.success("Nota apagada.");
          }}
        >
          <Trash2 />
        </Button>
      </div>

      <Input
        className="shrink-0 text-base font-medium"
        placeholder="Título da nota"
        value={titulo}
        maxLength={120}
        onChange={(event) => {
          setTitulo(event.target.value);
          gravarDepois({ titulo: event.target.value });
        }}
      />

      <Etiquetas
        tags={nota.tags}
        // Etiqueta grava na hora, sem atraso: marcar uma é um gesto que termina
        // em si mesmo, ao contrário de digitar uma frase.
        onMudar={(tags) => void mudar(codigo, nota.id, { tags })}
      />

      <div className="relative min-h-0 flex-1">
        {escrevendo ? (
          <>
            <Textarea
              ref={campo}
              autoFocus
              className="h-full resize-none text-base leading-relaxed"
              placeholder="@personagem  /arquivo  #nota  **negrito**"
              value={texto}
              maxLength={20_000}
              spellCheck={false}
              onChange={(event) => {
                setTexto(event.target.value);
                setCursor(event.target.selectionStart);
                gravarDepois({ texto: event.target.value });
              }}
              // Cobre seta, toque e arrasto de seleção de uma vez: `select`
              // dispara em qualquer mudança de posição do cursor.
              onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
              onBlur={(event) => {
                // A lista vive num portal fora do campo, e escolher nela tira o
                // foco daqui. Sem esta guarda, o texto voltaria a ser só leitura
                // no meio do gesto de escolher.
                const alvo = event.relatedTarget;
                if (alvo instanceof Element && alvo.closest(`[${MARCA_LISTA}]`)) return;

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

                if (lista && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                  event.preventDefault();

                  const passo = event.key === "ArrowDown" ? 1 : -1;
                  setIndice((atual) => {
                    const proximo =
                      (Math.min(atual, sugestoes.length - 1) + passo) % sugestoes.length;

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
                  // Primeiro Esc fecha a lista, segundo sai da escrita.
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
              />
            ) : null}
          </>
        ) : (
          // A nota em repouso: o texto com as menções pintadas, e um toque
          // volta a escrever. `role` de botão não serve — há botões DENTRO do
          // texto, e botão dentro de botão é marcação que o navegador desmancha.
          <div
            ref={areaDoTexto}
            className={cn("h-full overflow-y-auto", textoRola && FADE_DE_ROLAGEM)}
            onClick={(event) => {
              // Toque numa menção abre a menção; toque no texto volta a
              // escrever. Sem isto, abrir um arquivo mencionado também abriria
              // o teclado por cima dele.
              if (event.target instanceof Element && event.target.closest("button")) return;

              setEscrevendo(true);
            }}
          >
            {texto ? (
              <NotaTextoView texto={texto} vinculos={vinculos} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Toque para escrever. <code>@</code> chama um personagem da mesa, <code>/</code> um
                arquivo seu, <code>#</code> outra nota.
              </p>
            )}
          </div>
        )}

        {/* O fantasma do que falta do nome, em cinza, à frente do cursor. Não
            está no texto e não vai para lugar nenhum — só aparece. */}
        {fantasma ? (
          <span className="text-muted-foreground pointer-events-none absolute right-3 bottom-2 text-[11px]">
            Enter completa {fantasma}
          </span>
        ) : null}
      </div>
    </>
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
function Etiquetas({ tags, onMudar }: { tags: string[]; onMudar: (tags: string[]) => void }) {
  const [nova, setNova] = useState("");
  const [abrindo, setAbrindo] = useState(false);

  function adicionar() {
    const limpa = nova.trim();

    setNova("");
    setAbrindo(false);

    // Repetida não entra: o daemon já as limpa, e deixar a tela mandar a
    // duplicata faria a etiqueta piscar na lista antes de a resposta voltar.
    if (limpa.length === 0 || tags.some((tag) => tag.toLowerCase() === limpa.toLowerCase())) {
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
            aria-label={`Tirar a etiqueta ${tag}`}
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
          placeholder="etiqueta"
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
          Etiqueta
        </button>
      )}
    </div>
  );
}
