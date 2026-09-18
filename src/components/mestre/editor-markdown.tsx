"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  AArrowDown,
  AArrowUp,
  ChevronDown,
  ChevronRight,
  Code,
  FileText,
  Trash2,
} from "lucide-react";

import { ListaDeSugestoes, MARCA_LISTA } from "@/components/mencoes/sugestoes";
import { LinhaMarkdown, VinculosContext } from "@/components/playground/markdown-view";
import { bloco } from "@/lib/markdown/linha";
import { cn } from "@/lib/utils";
import {
  aplicaSugestao,
  fantasmaDe,
  filtraSugestoes,
  type Sugestao,
} from "@/lib/mencoes/sugestao";
import {
  fragmentoDoPostit,
  TITULO_DO_POSTIT,
  type SinalDoPostit,
} from "@/lib/mestre/postit-mencoes";
import { normaliza } from "@/lib/search";
import { useMencoesDoMestre } from "@/hooks/use-mencoes-do-mestre";
import { Button } from "@/components/ui/button";
import { aoApertarF2 } from "@/hooks/use-renomear-pelo-menu";
import { useArquivoAbertoStore } from "@/lib/store/use-arquivo-aberto-store";
import { useAssetsStore } from "@/lib/store/use-assets-store";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import {
  deslocamentoDe,
  posicaoDe,
  useHistoricoDeTexto,
} from "@/lib/mestre/historico-de-texto";
import { ConfirmarRemocao } from "@/components/mestre/confirmar-remocao";
import { useDocumentoStore } from "@/lib/store/use-documento-store";
import { useTokenDragStore, type FonteDoArrasto } from "@/lib/store/use-token-drag-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { apagarDocumento } from "@/lib/vault/documentos";
import type { Nota } from "@/types/scene";

/**
 * A vista de uma nota: o editor de Markdown no lugar do palco.
 *
 * Como o Obsidian abre um arquivo no painel principal. Título em cima, editável
 * no clique; o corpo é o `EditorAoVivo`; rodapé com fonte e contagem. O texto
 * vem do `useDocumentoStore`, o mesmo que os cartões do quadro leem -- a nota
 * é uma, os cartões são N.
 */
export function NotaEditor({ nota }: { nota: Nota }) {
  const texto = useDocumentoStore((state) => state.textos[nota.arquivo]);
  const carregar = useDocumentoStore((state) => state.carregar);
  const escrever = useDocumentoStore((state) => state.escrever);
  const renomearNota = useSceneStore((state) => state.renomearNota);
  const removerNota = useSceneStore((state) => state.removerNota);
  const fechar = useArquivoAbertoStore((state) => state.fechar);
  const { vinculos, candidatos } = useMencoesDoMestre();

  useEffect(() => {
    carregar(nota.arquivo);
  }, [nota.arquivo, carregar]);

  const [renomeando, setRenomeando] = useState(false);
  const [fonte, setFonte] = useState(16);
  /** Um pedido de ir a uma linha, vindo do sumário. `vez` distingue dois cliques na mesma. */
  const [salto, setSalto] = useState<{ indice: number; vez: number } | null>(null);
  const [cru, setCru] = useState(false);

  const conteudo = texto ?? "";
  const palavras = conteudo.trim() ? conteudo.trim().split(/\s+/).length : 0;
  const linhas = conteudo ? conteudo.split("\n").length : 0;

  const [confirmando, setConfirmando] = useState(false);

  function apagar() {
    fechar();
    removerNota(nota.id);
    void apagarDocumento(nota.arquivo).catch((cause: unknown) => {
      console.error("falha ao apagar a nota", cause);
    });
  }

  return (
    <VinculosContext value={vinculos}>
    <div className="bg-background flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
        {renomeando ? (
          <input
            autoFocus
            defaultValue={nota.titulo}
            className="bg-card min-w-0 flex-1 rounded px-2 py-0.5 text-lg font-semibold outline-none"
            aria-label="Título da nota"
            onFocus={(event) => event.currentTarget.select()}
            onBlur={(event) => {
              renomearNota(nota.id, event.currentTarget.value);
              setRenomeando(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setRenomeando(false);
              event.stopPropagation();
            }}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-lg font-semibold"
            title="Clique para renomear"
            onClick={() => setRenomeando(true)}
            onKeyDown={aoApertarF2(() => setRenomeando(true))}
          >
            {nota.titulo}
          </button>
        )}
        <span className="text-muted-foreground shrink-0 text-xs">{nota.arquivo}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Apagar esta nota"
          title="Apaga a nota, o arquivo .md e os cartões dela nos quadros"
          onClick={() => setConfirmando(true)}
        >
          <Trash2 />
        </Button>
        <ConfirmarRemocao
          aberto={confirmando}
          onAberto={setConfirmando}
          titulo={`Apagar "${nota.titulo}"?`}
          descricao="Vão junto o arquivo .md e os cartões desta nota nos quadros. Ctrl+Z não traz de volta."
          onConfirmar={apagar}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* O sumário: a hierarquia do texto -- títulos e itens -- para achar e
            pular. Como o painel de outline do Obsidian. Fica à esquerda, onde
            o olho procura estrutura, e recolhe por seção. */}
        <Sumario
          texto={conteudo}
          onIr={(indice) => {
            // Sai do texto cru, se estava nele: o salto é para uma linha viva.
            setCru(false);
            setSalto({ indice, vez: (salto?.vez ?? 0) + 1 });
          }}
        />

        <div
          className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
          style={{ fontSize: fonte, lineHeight: 1.6 }}
        >
          <div className="mx-auto max-w-3xl">
            {texto === undefined ? (
              <span className="text-muted-foreground italic">Abrindo…</span>
            ) : (
              <EditorAoVivo
                texto={texto}
                candidatos={candidatos}
                salto={salto}
                cru={cru}
                onCru={setCru}
                onChange={(novo) => escrever(nota.arquivo, novo)}
              />
            )}
          </div>
        </div>
      </div>

      <div className="text-muted-foreground flex shrink-0 items-center gap-1 border-t px-3 py-1 text-xs">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Diminuir a fonte"
          disabled={fonte <= 12}
          onClick={() => setFonte((f) => Math.max(12, f - 2))}
        >
          <AArrowDown />
        </Button>
        <span className="min-w-6 text-center tabular-nums">{fonte}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Aumentar a fonte"
          disabled={fonte >= 28}
          onClick={() => setFonte((f) => Math.min(28, f + 2))}
        >
          <AArrowUp />
        </Button>
        <Button
          variant={cru ? "secondary" : "ghost"}
          size="icon-xs"
          aria-label={cru ? "Voltar à prévia" : "Ver o texto cru"}
          title={cru ? "Voltar à prévia ao vivo (Esc)" : "Texto cru: o arquivo inteiro num campo só (Ctrl+A)"}
          aria-pressed={cru}
          onClick={() => setCru((atual) => !atual)}
        >
          <Code />
        </Button>
        <span className="flex-1 text-right tabular-nums">
          {palavras} palavras · {linhas} linhas
        </span>
      </div>
    </div>
    </VinculosContext>
  );
}

type Entrada = {
  indice: number;
  /** 1 a 3 para título; 4 para item de lista, que fica sob o título mais próximo. */
  nivel: number;
  texto: string;
  titulo: boolean;
};

/** As linhas que contam para o sumário: títulos e itens de lista. */
function entradasDe(texto: string): Entrada[] {
  const saida: Entrada[] = [];
  texto.split("\n").forEach((linha, indice) => {
    const b = bloco(linha);
    if (b.tipo === "titulo")
      saida.push({ indice, nivel: b.nivel, texto: b.conteudo, titulo: true });
    else if (b.tipo === "item" || b.tipo === "tarefa" || b.tipo === "numero")
      saida.push({ indice, nivel: 4, texto: b.conteudo, titulo: false });
  });
  return saida;
}

/**
 * O sumário da nota: títulos por nível e os itens de lista sob cada um. Clique
 * leva à linha; a seta recolhe a seção -- tudo que vem depois do título até
 * outro do mesmo nível ou acima. É a forma de achar num texto de três telas.
 */
function Sumario({ texto, onIr }: { texto: string; onIr: (indice: number) => void }) {
  const entradas = entradasDe(texto);
  const [recolhidos, setRecolhidos] = useState<Set<number>>(() => new Set());

  if (entradas.length === 0) return null;

  // Visíveis: fora de qualquer seção recolhida. Uma seção vai do título até o
  // próximo título de nível igual ou menor.
  const visiveis: Array<Entrada & { temFilhos: boolean }> = [];
  let escondendoAte: number | null = null; // nível do título recolhido
  for (const [i, entrada] of entradas.entries()) {
    if (escondendoAte !== null) {
      if (entrada.titulo && entrada.nivel <= escondendoAte) escondendoAte = null;
      else continue;
    }
    const proxima = entradas[i + 1];
    const temFilhos =
      entrada.titulo && !!proxima && (!proxima.titulo || proxima.nivel > entrada.nivel);
    visiveis.push({ ...entrada, temFilhos });
    if (entrada.titulo && recolhidos.has(entrada.indice)) escondendoAte = entrada.nivel;
  }

  function alternar(indice: number) {
    setRecolhidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(indice)) proximo.delete(indice);
      else proximo.add(indice);
      return proximo;
    });
  }

  return (
    <nav
      aria-label="Sumário da nota"
      className="bg-background/60 w-56 shrink-0 overflow-y-auto border-r px-2 py-3 text-xs"
    >
      <ul className="space-y-0.5">
        {visiveis.map((entrada) => (
          <li
            key={entrada.indice}
            className="flex items-center gap-0.5"
            style={{ paddingLeft: (entrada.nivel - 1) * 10 }}
          >
            {entrada.temFilhos ? (
              <button
                type="button"
                aria-label={recolhidos.has(entrada.indice) ? "Abrir a seção" : "Recolher a seção"}
                aria-expanded={!recolhidos.has(entrada.indice)}
                className="text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => alternar(entrada.indice)}
              >
                {recolhidos.has(entrada.indice) ? (
                  <ChevronRight className="size-3" />
                ) : (
                  <ChevronDown className="size-3" />
                )}
              </button>
            ) : (
              <span className="size-3 shrink-0" aria-hidden />
            )}
            <button
              type="button"
              className={cn(
                "hover:bg-accent min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left",
                entrada.titulo ? "font-medium" : "text-muted-foreground",
                entrada.nivel === 1 && "text-sm",
              )}
              title={entrada.texto}
              onClick={() => onIr(entrada.indice)}
            >
              {entrada.titulo ? entrada.texto : `• ${entrada.texto}`}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * O editor de prévia ao vivo: uma linha crua, as outras desenhadas.
 *
 * O texto é UMA string, e a linha ativa é um índice nela. Cada tecla reescreve
 * a string inteira -- é o que mantém o texto uma coisa só para o arquivo e
 * para a mesa --, e um documento de mestre cabe nisso com folga.
 *
 * As teclas que atravessam linhas são as de qualquer editor: Enter divide a
 * linha no cursor, Backspace no começo junta com a de cima, Delete no fim junta
 * com a de baixo, seta para cima na primeira linha do campo sobe, seta para
 * baixo na última desce. Esc larga o cursor e desenha tudo.
 */
export function EditorAoVivo({
  texto,
  candidatos,
  salto,
  cru = false,
  onCru,
  onChange,
}: {
  texto: string;
  /** O que `@`, `/` e `>` podem completar. Ausente = sem lista. */
  candidatos?: Record<SinalDoPostit, Sugestao[]>;
  /** Pedido de ativar uma linha, vindo de fora (o sumário). */
  salto?: { indice: number; vez: number } | null;
  /**
   * Texto CRU: o arquivo inteiro num `<textarea>` só, sem prévia. É o modo
   * do Ctrl+A -- selecionar tudo não tem sentido linha a linha -- e de quem
   * quer colar um bloco grande ou ver o Markdown como está no disco.
   */
  cru?: boolean;
  onCru?: (cru: boolean) => void;
  onChange: (texto: string) => void;
}) {
  const linhas = texto.split("\n");

  const [ativa, setAtiva] = useState<{ indice: number; cursor: number } | null>(null);
  const campo = useRef<HTMLTextAreaElement | null>(null);
  // O cursor no DOCUMENTO, e não na linha: é o que o desfazer guarda, porque
  // a linha em que ele estava pode nem existir depois de voltar um passo.
  const historico = useHistoricoDeTexto(
    texto,
    ativa ? deslocamentoDe(texto, ativa.indice, ativa.cursor) : texto.length,
  );
  const caixa = useRef<HTMLDivElement | null>(null);

  // O sumário pediu uma linha: ativa e leva o cursor ao começo dela. Estado
  // derivado da prop, ajustado no render como o React recomenda -- e não num
  // efeito, que faria um render a mais com a linha errada. `vez` faz dois
  // cliques na mesma linha valerem os dois.
  const [saltoAtendido, setSaltoAtendido] = useState<number | null>(null);
  if (salto && salto.vez !== saltoAtendido) {
    setSaltoAtendido(salto.vez);
    setAtiva({ indice: Math.min(salto.indice, linhas.length - 1), cursor: 0 });
  }

  // A linha ativa entra na vista quando o salto veio de fora.
  useEffect(() => {
    if (salto) campo.current?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- acompanha o salto
  }, [ativa, salto?.vez]);

  /**
   * Onde o cursor está dentro da linha ativa, em estado: é ele que decide se a
   * lista de sugestão aparece. Mesmo desenho do postit -- ver `PostitPapel`.
   */
  const [cursor, setCursor] = useState(0);
  const [indice, setIndice] = useState(0);
  /** O `inicio` do fragmento que o mestre dispensou com Esc. */
  const [dispensadoEm, setDispensadoEm] = useState<number | null>(null);
  /** A marca de largura zero no cursor, no espelho, para a lista se pendurar. */
  const marca = useRef<HTMLSpanElement | null>(null);

  const linhaAtiva = ativa ? (linhas[ativa.indice] ?? "") : "";
  const fragmento =
    ativa && candidatos ? fragmentoDoPostit(linhaAtiva, cursor) : null;
  const sugestoes =
    fragmento && candidatos && fragmento.inicio !== dispensadoEm
      ? filtraSugestoes(candidatos[fragmento.sinal], fragmento.prefixo, normaliza)
      : [];
  const escolhido = Math.min(indice, Math.max(sugestoes.length - 1, 0));
  const fantasma =
    fragmento && sugestoes.length > 0
      ? fantasmaDe(
          sugestoes[escolhido]!.nome,
          fragmento.prefixo,
          linhaAtiva[cursor],
          normaliza,
        )
      : "";

  function aplicar(nome: string) {
    if (!ativa || !fragmento) return;
    const resultado = aplicaSugestao(linhaAtiva, fragmento, cursor, nome);
    trocar(ativa.indice, resultado.texto);
    setIndice(0);
    setCursor(resultado.cursor);
    // Objeto novo: é o que faz o efeito de foco repor o cursor depois do nome.
    setAtiva({ indice: ativa.indice, cursor: resultado.cursor });
  }

  /**
   * Clique fora do editor larga a linha. Na captura e no documento, como o
   * postit: o `blur` sozinho não vem quando o clique cai no palco, que não
   * toma foco -- e o mestre ficava com a linha crua aberta depois de clicar
   * no vazio.
   */
  useEffect(() => {
    if (!ativa) return;
    function foraDaqui(event: PointerEvent) {
      const alvo = event.target;
      if (alvo instanceof Node && caixa.current?.contains(alvo)) return;
      // A lista de sugestões mora num portal no `body`: escolher nela é parte
      // de escrever, e não clique fora.
      if (alvo instanceof Element && alvo.closest(`[${MARCA_LISTA}]`)) return;
      setAtiva(null);
    }
    document.addEventListener("pointerdown", foraDaqui, true);
    return () => document.removeEventListener("pointerdown", foraDaqui, true);
  }, [ativa]);

  // Foco e cursor SÓ quando o campo troca de linha, e nunca a cada tecla: o
  // `<textarea>` é um só e muda de valor, então o cursor tem de ser reposto na
  // troca -- mas repô-lo a cada mudança de texto matava o acento morto. O
  // `´` seguido de `a` compõe `á` dentro do campo, e um `setSelectionRange`
  // no meio da composição a cancela: saía `´a`.
  useLayoutEffect(() => {
    if (!ativa) return;
    const alvo = campo.current;
    if (!alvo) return;
    alvo.focus();
    const pos = Math.min(ativa.cursor, alvo.value.length);
    alvo.setSelectionRange(pos, pos);
    setCursor(pos);
    setIndice(0);
    setDispensadoEm(null);
  }, [ativa]);

  // A altura acompanha o texto: a linha dobra na largura do cartão.
  useLayoutEffect(() => {
    const alvo = campo.current;
    if (!alvo) return;
    alvo.style.height = "0px";
    alvo.style.height = `${alvo.scrollHeight}px`;
  }, [ativa, texto]);

  function trocar(indice: number, valor: string) {
    const proximas = [...linhas];
    proximas[indice] = valor;
    onChange(proximas.join("\n"));
  }

  function teclas(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!ativa) return;

    // Ctrl+Z / Ctrl+Y: o texto inteiro volta um passo, e o cursor vai para a
    // linha em que estava. Ver `useHistoricoDeTexto`.
    const volta = historico.tratarTecla(event);
    if (volta !== false) {
      if (volta) {
        onChange(volta.texto);
        setAtiva(posicaoDe(volta.texto, volta.cursor));
      }
      return;
    }

    const alvo = event.currentTarget;
    const { selectionStart, selectionEnd, value } = alvo;
    const indice = ativa.indice;

    const lista = sugestoes.length > 0;

    // Ctrl+A: selecionar tudo é o documento, não a linha. Vai para o texto
    // cru, que é um campo só, já com tudo selecionado.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      event.stopPropagation();
      setAtiva(null);
      onCru?.(true);
      return;
    }

    // Tab e seta-direita confirmam o fantasma, como no VS Code.
    if (fantasma && event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      aplicar(sugestoes[escolhido]!.nome);
      return;
    }

    // Com a lista aberta, as setas andam nela, e Enter e Tab escolhem.
    if (lista && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      event.stopPropagation();
      const passo = event.key === "ArrowDown" ? 1 : -1;
      setIndice((atual) => {
        const proximo = (Math.min(atual, sugestoes.length - 1) + passo) % sugestoes.length;
        return proximo < 0 ? sugestoes.length - 1 : proximo;
      });
      return;
    }
    if (lista && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault();
      event.stopPropagation();
      aplicar(sugestoes[escolhido]!.nome);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      // Primeiro Esc fecha a lista, segundo larga a linha.
      if (lista && fragmento) setDispensadoEm(fragmento.inicio);
      else setAtiva(null);
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const antes = value.slice(0, selectionStart);
      const depois = value.slice(selectionEnd);
      // Continua a lista: Enter no fim de um item começa outro; num item vazio,
      // sai da lista. É o gesto que todo editor de Markdown faz.
      const marca = /^(\s*(?:[-*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+))/.exec(antes)?.[1] ?? "";
      const vazio = marca !== "" && antes.trim() === marca.trim();
      const proximas = [...linhas];
      if (vazio) {
        proximas.splice(indice, 1, "", depois);
        onChange(proximas.join("\n"));
        setAtiva({ indice: indice + 1, cursor: 0 });
        return;
      }
      const continuacao = marca.replace(/\[[xX]\]/, "[ ]").replace(/^(\s*)(\d+)/, (_, s: string, n: string) => `${s}${Number(n) + 1}`);
      proximas.splice(indice, 1, antes, continuacao + depois);
      onChange(proximas.join("\n"));
      setAtiva({ indice: indice + 1, cursor: continuacao.length });
    } else if (event.key === "Backspace" && selectionStart === 0 && selectionEnd === 0 && indice > 0) {
      event.preventDefault();
      const anterior = linhas[indice - 1] ?? "";
      const proximas = [...linhas];
      proximas.splice(indice - 1, 2, anterior + value);
      onChange(proximas.join("\n"));
      setAtiva({ indice: indice - 1, cursor: anterior.length });
    } else if (
      event.key === "Delete" &&
      selectionStart === value.length &&
      selectionEnd === value.length &&
      indice < linhas.length - 1
    ) {
      event.preventDefault();
      const proxima = linhas[indice + 1] ?? "";
      const proximas = [...linhas];
      proximas.splice(indice, 2, value + proxima);
      onChange(proximas.join("\n"));
      setAtiva({ indice, cursor: value.length });
    } else if (event.key === "ArrowUp" && indice > 0 && naPrimeiraLinhaVisual(alvo)) {
      event.preventDefault();
      setAtiva({ indice: indice - 1, cursor: selectionStart });
    } else if (
      event.key === "ArrowDown" &&
      indice < linhas.length - 1 &&
      naUltimaLinhaVisual(alvo)
    ) {
      event.preventDefault();
      setAtiva({ indice: indice + 1, cursor: selectionStart });
    }
    // Ctrl+Z e os outros atalhos do palco não chegam aqui: `isTyping` os barra.
    event.stopPropagation();
  }

  /**
   * O que cai de outro painel vira menção: imagem ou arquivo da Biblioteca
   * vira `/nome`, personagem vira `@nome`, mapa vira `>nome`. Entra no fim da
   * linha sob o cursor, ou numa linha nova no fim quando cai no vazio. É a
   * mesma convenção do postit, sem digitar o sinal: arrastar É apontar.
   */
  const sobreNota = useTokenDragStore((state) => state.arrasto?.destino?.tipo === "nota");
  const textoRef = useRef(texto);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    textoRef.current = texto;
    onChangeRef.current = onChange;
  });
  useEffect(
    () =>
      useTokenDragStore.getState().registrarAlvo("nota", (solto, destino) => {
        if (destino.tipo !== "nota") return;
        const mencao = mencaoDe(solto.fonte);
        if (!mencao) return;

        const atuais = textoRef.current.split("\n");
        const sob = document
          .elementFromPoint(solto.x, solto.y)
          ?.closest<HTMLElement>("[data-linha]");
        const indice = sob ? Number(sob.dataset.linha) : -1;

        if (indice >= 0 && indice < atuais.length) {
          const linha = atuais[indice] ?? "";
          const separador = linha === "" || /\s$/.test(linha) ? "" : " ";
          atuais[indice] = `${linha}${separador}${mencao}`;
          onChangeRef.current(atuais.join("\n"));
          setAtiva({ indice, cursor: atuais[indice]!.length });
          return;
        }

        // No vazio: linha nova no fim, e o cursor logo depois da menção.
        const base = textoRef.current === "" ? [] : atuais;
        onChangeRef.current([...base, mencao].join("\n"));
        setAtiva({ indice: base.length, cursor: mencao.length });
      }),
    [],
  );

  if (cru)
    return (
      <TextoCru
        texto={texto}
        onChange={onChange}
        onSair={() => onCru?.(false)}
      />
    );

  const vazio = texto.trim() === "";

  return (
    <div
      ref={caixa}
      data-nota-editor=""
      className={cn(
        "min-h-full cursor-text rounded-md",
        // Acende enquanto algo arrastado está por cima: é o que diz "solte aqui".
        sobreNota && "ring-primary/60 bg-primary/5 ring-2",
      )}
      // Clique abaixo da última linha: cursor no fim do documento.
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const ultima = linhas.length - 1;
        setAtiva({ indice: ultima, cursor: (linhas[ultima] ?? "").length });
      }}
    >
      {/* Nota vazia sem linha ativa: a dica de onde clicar. Uma folha preta
          sem nada não diz que é um editor. */}
      {vazio && !ativa ? (
        <p className="text-muted-foreground pointer-events-none absolute italic">
          Clique aqui e comece a escrever. # título, - lista, @personagem…
        </p>
      ) : null}
      {linhas.map((linha, indice) =>
        ativa?.indice === indice ? (
          <div key="ativa" className="relative">
            {/* O espelho: o mesmo texto com a mesma tipografia, com uma marca
                de largura zero no cursor -- é dela que a lista se pendura -- e o
                nome fantasma em cinza depois dele. O campo, transparente,
                fica por cima. Ver o mesmo desenho no postit. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 font-mono text-[0.95em] break-words whitespace-pre-wrap"
            >
              <span className="invisible">{linha.slice(0, cursor)}</span>
              <span ref={marca} className="inline-block w-0" />
              {fantasma ? <span className="text-muted-foreground/60">{fantasma}</span> : null}
            </div>
            <textarea
              ref={campo}
              rows={1}
              value={linha}
              aria-label="Linha em edição"
              className="text-foreground relative block w-full resize-none overflow-hidden bg-transparent font-mono text-[0.95em] outline-none"
              onChange={(event) => {
                trocar(indice, event.target.value);
                setCursor(event.target.selectionStart);
              }}
              onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
              onKeyDown={teclas}
              onBlur={() => setAtiva(null)}
              onPointerDown={(event) => event.stopPropagation()}
            />
            {sugestoes.length > 0 && fragmento ? (
              <ListaDeSugestoes
                titulo={TITULO_DO_POSTIT[fragmento.sinal]}
                itens={sugestoes}
                indice={escolhido}
                ancora={marca}
                onEscolher={aplicar}
              />
            ) : null}
          </div>
        ) : (
          <div
            key={indice}
            data-linha={indice}
            className="hover:bg-foreground/5 -mx-1 rounded px-1"
            onClick={(event) => {
              event.stopPropagation();
              setAtiva({ indice, cursor: linha.length });
            }}
          >
            <LinhaMarkdown linha={linha} />
          </div>
        ),
      )}
    </div>
  );
}

/** O sinal e o nome, entre aspas quando o nome tem espaço, como `aplicaSugestao`. */
function mencaoDe(fonte: FonteDoArrasto): string | null {
  const escreve = (sinal: string, nome: string) =>
    /\s/.test(nome) ? `${sinal}"${nome}"` : `${sinal}${nome}`;

  switch (fonte.tipo) {
    case "acervo":
    case "handout": {
      const acervo = useAssetsStore.getState();
      const asset = [
        ...(acervo.image.assets ?? []),
        ...(acervo.file.assets ?? []),
        ...(acervo.audio.assets ?? []),
      ].find((atual) => atual.id === fonte.assetId);
      return asset ? escreve("/", asset.name) : null;
    }
    case "personagem": {
      const personagem = useCharactersStore
        .getState()
        .personagens?.find((atual) => atual.id === fonte.personagemId);
      return personagem ? escreve("@", personagem.nome) : null;
    }
    case "cena":
      return escreve(">", fonte.nome);
    default:
      return null;
  }
}

/**
 * O arquivo inteiro num campo só, tudo selecionado ao entrar. É onde o Ctrl+A
 * chega, e onde se cola um bloco grande. Esc volta à prévia; o texto continua
 * o mesmo, e a gravação é a mesma do editor ao vivo.
 */
function TextoCru({
  texto,
  onChange,
  onSair,
}: {
  texto: string;
  onChange: (texto: string) => void;
  onSair: () => void;
}) {
  const campo = useRef<HTMLTextAreaElement | null>(null);
  const [cursor, setCursor] = useState(texto.length);
  const historico = useHistoricoDeTexto(texto, cursor);
  /** Cursor a repor depois que um desfazer trocar o valor. */
  const repor = useRef<number | null>(null);
  useLayoutEffect(() => {
    const alvo = campo.current;
    if (!alvo) return;
    alvo.focus();
    alvo.select();
  }, []);
  useLayoutEffect(() => {
    const alvo = campo.current;
    if (!alvo || repor.current === null) return;
    alvo.setSelectionRange(repor.current, repor.current);
    repor.current = null;
  }, [texto]);
  useLayoutEffect(() => {
    const alvo = campo.current;
    if (!alvo) return;
    alvo.style.height = "0px";
    alvo.style.height = `${alvo.scrollHeight}px`;
  }, [texto]);

  return (
    <textarea
      ref={campo}
      value={texto}
      aria-label="Texto cru da nota"
      className="text-foreground block min-h-[60vh] w-full resize-none bg-transparent font-mono text-[0.95em] outline-none"
      onChange={(event) => {
        onChange(event.target.value);
        setCursor(event.target.selectionStart);
      }}
      onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
      onKeyDown={(event) => {
        const volta = historico.tratarTecla(event);
        if (volta !== false) {
          if (volta) {
            repor.current = volta.cursor;
            setCursor(volta.cursor);
            onChange(volta.texto);
          }
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onSair();
        }
        event.stopPropagation();
      }}
    />
  );
}

/**
 * O cursor está na primeira (ou última) linha VISUAL do campo. O campo é uma
 * linha do documento, sem `\n`, mas ela pode dobrar na largura do cartão -- e
 * seta para cima numa linha dobrada tem de subir DENTRO dela antes de trocar
 * de linha do documento. Com o campo em uma linha só, qualquer posição vale.
 */
function naPrimeiraLinhaVisual(alvo: HTMLTextAreaElement): boolean {
  return linhasVisuais(alvo) <= 1 || alvo.selectionStart === 0;
}

function naUltimaLinhaVisual(alvo: HTMLTextAreaElement): boolean {
  return linhasVisuais(alvo) <= 1 || alvo.selectionStart === alvo.value.length;
}

/** Quantas linhas o campo ocupa na tela, pela altura. */
function linhasVisuais(alvo: HTMLTextAreaElement): number {
  const altura = parseFloat(getComputedStyle(alvo).lineHeight) || 1;
  return Math.round(alvo.scrollHeight / altura);
}
