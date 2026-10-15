"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { EyeOff, SendHorizontal, Trash2, VenetianMask } from "lucide-react";

import { ListaDeSugestoes, MARCA_LISTA } from "@/components/mencoes/sugestoes";
import { DadoParado } from "@/components/playground/dado-parado";
import { DadoRolando } from "@/components/playground/dado-rolando";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DURACAO_DA_CHEGADA,
  instanteDaQueda,
  useQuedaDasRolagens,
} from "@/hooks/use-queda-das-rolagens";
import {
  avisoDoSussurro,
  caiAoChegar,
  continuaAnterior,
  MAX_TEXTO_DO_FIO,
  mesmoDia,
  nomeDoAutor,
  parseDoChat,
  partesDaRolagem,
  SINAIS_DO_CHAT_EM_ORDEM,
  type LeitorDoFio,
} from "@/lib/fio";
import {
  aplicaSugestao,
  filtraSugestoes,
  fragmentoNoCursor,
  type Sugestao,
} from "@/lib/mencoes/sugestao";
import { normaliza } from "@/lib/search";
import { idioma } from "@/lib/i18n/idioma";
import { t as textos } from "@/lib/i18n/palco";
import { cn } from "@/lib/utils";
import type { LinhaDoFio, RolagemNoFio } from "@/types/fio";

/**
 * O fio da campanha, desenhado. As mesmas peças na janela do Mestre e na aba
 * do celular: a conversa é uma só, e as duas telas contando-a de jeitos
 * diferentes fariam a mesa discutir qual das duas está certa.
 *
 * `denso` é a janela do Mestre, que divide a bancada com o mapa; o celular tem
 * a tela inteira e o dedo, e lá a letra é a de leitura.
 */

/** Quantos dados de uma rolagem aparecem desenhados. O resto vira "+N". */
const DADOS_DESENHADOS = 6;

/**
 * Quão perto do fim conta como "estava lendo o fim".
 *
 * Quem está no fim quer ver a linha nova; quem rolou para cima para achar o
 * ataque de vinte minutos atrás não quer ser arrancado de lá por um "ok" de
 * outro jogador.
 */
const FOLGA_DO_FIM_PX = 48;

const HORA = new Intl.DateTimeFormat(idioma, {
  hour: "2-digit",
  minute: "2-digit",
});

const DIA = new Intl.DateTimeFormat(idioma, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/**
 * Quem resolve `@nome` em personagem, nesta tela.
 *
 * Vem de fora, como no postit e no caderno: cada lado da mesa conhece um elenco
 * diferente. O Mestre conhece todos, PNJ inclusive; o celular só os que têm
 * jogador (`/eu/mesa/personagens`), porque o índice inteiro entregaria a
 * preparação do Mestre.
 */
export type MencoesDoFio = {
  personagem: (nome: string) => {
    id: string;
    nome: string;
    /** Quem joga. Ausente = PNJ, ou ficha que ainda não foi entregue. */
    dono?: string;
    /** Verde: quem joga está na mesa agora (Mestre) ou o retrato está no ar (celular). */
    ativo: boolean;
  } | null;
  /** O clique na menção. Sem isto ela não é botão — no celular não há ficha alheia a abrir. */
  abrir?: (personagemId: string) => void;
  /**
   * O que fazer com o nome que não resolve.
   *
   * `aviso` é o do Mestre: personagem renomeado, ou nome digitado errado — e
   * ele é quem pode corrigir. `nome` é o do celular: o Mestre escreveu `@Aldren`
   * para a mesa, o PNJ não está no elenco que o celular conhece, e a mesa lê o
   * nome sem nenhum aviso de erro que não é dela.
   */
  desconhecido: "aviso" | "nome";
};

export function ListaDoFio({
  linhas,
  aoVivo,
  leitor,
  denso = false,
  onApagar,
  abrirLink,
  mencoes,
  vazio,
}: {
  linhas: LinhaDoFio[];
  /** As que chegaram depois do replay. Só a rolagem delas cai. */
  aoVivo: ReadonlySet<string>;
  leitor: LeitorDoFio;
  denso?: boolean;
  /** Só o Mestre apaga. Sem isto, a linha não tem lixeira. */
  onApagar?: (linha: LinhaDoFio) => void;
  /**
   * Quem abre um link. Na janela do Mestre o `<a>` não sai da webview sozinho
   * — passa pelo navegador do sistema; no celular o próprio `<a>` resolve.
   */
  abrirLink?: (url: string) => void;
  /** Quem resolve `@personagem`. Sem isto, a menção é texto. */
  mencoes?: MencoesDoFio;
  vazio: ReactNode;
}) {
  /**
   * As rolagens de jogador que chegaram agora. Mesmo relógio da bandeja (o id é
   * o mesmo), e é por isso que a linha e a rolagem na mesa pousam juntas.
   */
  const caindo = useMemo(
    () => linhas.filter((linha) => aoVivo.has(linha.id) && caiAoChegar(linha)),
    [linhas, aoVivo],
  );
  const { chegada, agora } = useQuedaDasRolagens(caindo);

  const rolavel = useRef<HTMLDivElement>(null);
  /** Quem lê está no fim? Atualizado na rolagem, lido na linha nova. */
  const noFim = useRef(true);

  // Antes da pintura, e não depois: num efeito comum o quadro com a linha
  // nova fora da vista chegaria à tela, e o fio daria um soluço a cada frase.
  useLayoutEffect(() => {
    const caixa = rolavel.current;
    if (caixa && noFim.current) caixa.scrollTop = caixa.scrollHeight;
  }, [linhas]);

  if (linhas.length === 0)
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
        {vazio}
      </div>
    );

  return (
    <div
      ref={rolavel}
      onScroll={(event) => {
        const caixa = event.currentTarget;
        noFim.current =
          caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < FOLGA_DO_FIM_PX;
      }}
      // `overscroll-contain`: no celular, chegar ao topo do fio e continuar
      // puxando recarregava a página — e a página é a mesa. A barra fina, na
      // cor da borda: a larga do sistema era o elemento mais claro da janela.
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
    >
      <ol className="flex flex-col pb-2">
        {linhas.map((linha, i) => {
          const anterior = linhas[i - 1];
          const novoDia = !anterior || !mesmoDia(linha.quando, anterior.quando);
          const desde = chegada.get(linha.id);

          return (
            <LinhaView
              key={linha.id}
              linha={linha}
              leitor={leitor}
              dia={novoDia ? DIA.format(linha.quando) : null}
              cabecalho={novoDia || !continuaAnterior(linha, anterior)}
              t={desde === undefined ? undefined : instanteDaQueda(desde, agora)}
              denso={denso}
              onApagar={onApagar}
              abrirLink={abrirLink}
              mencoes={mencoes}
            />
          );
        })}
      </ol>
    </div>
  );
}

function LinhaView({
  linha,
  leitor,
  dia,
  cabecalho,
  t,
  denso,
  onApagar,
  abrirLink,
  mencoes,
}: {
  linha: LinhaDoFio;
  leitor: LeitorDoFio;
  /** A divisória do dia, quando esta é a primeira linha dele. */
  dia: string | null;
  cabecalho: boolean;
  /** A idade da queda, quando a rolagem ainda está caindo nesta tela. */
  t: number | undefined;
  denso: boolean;
  onApagar?: (linha: LinhaDoFio) => void;
  abrirLink?: (url: string) => void;
  mencoes?: MencoesDoFio;
}) {
  const aviso = avisoDoSussurro(linha, leitor);

  return (
    <li className="contents">
      {/* O fio é a memória da CAMPANHA: a conversa de hoje fica embaixo da de
          três semanas atrás, e sem a data uma não se distingue da outra. */}
      {dia ? (
        <p className="text-muted-foreground px-3 pt-3 pb-1 text-center text-[10px] font-medium tracking-wide uppercase first-letter:uppercase">
          {dia}
        </p>
      ) : null}

      <div
        className={cn(
          "group/linha relative px-3",
          cabecalho ? "pt-2" : "pt-0.5",
          // O sussurro tem fundo, e não só o aviso: responder em voz alta a
          // um recado que era só para o Mestre é o erro que ele evita.
          aviso && "bg-amber-500/5",
        )}
      >
        {cabecalho ? (
          <div className="flex min-w-0 items-baseline gap-1.5 pr-6">
            <span
              className={cn(
                "truncate font-semibold",
                denso ? "text-xs" : "text-sm",
                linha.autor.tipo === "mestre" && "text-primary",
              )}
            >
              {nomeDoAutor(linha.autor)}
            </span>

            {linha.autor.tipo === "plugin" ? (
              <span className="text-muted-foreground shrink-0 text-[10px]">
                {textos.fio.plugin}
              </span>
            ) : null}

            {aviso ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-500/15 px-1 text-[10px] text-amber-700 dark:text-amber-300">
                <EyeOff className="size-2.5" aria-hidden />
                {aviso}
              </span>
            ) : null}

            <time
              dateTime={new Date(linha.quando).toISOString()}
              className="text-muted-foreground ml-auto shrink-0 text-[10px] tabular-nums"
            >
              {HORA.format(linha.quando)}
            </time>
          </div>
        ) : null}

        {linha.texto ? (
          <p
            className={cn(
              "break-words whitespace-pre-wrap",
              denso ? "text-xs leading-relaxed" : "text-sm leading-relaxed",
            )}
          >
            <TextoDaLinha
              texto={linha.texto}
              abrirLink={abrirLink}
              mencoes={mencoes}
            />
          </p>
        ) : null}

        {linha.rolagem ? (
          <RolagemView id={linha.id} rolagem={linha.rolagem} t={t} denso={denso} />
        ) : null}

        {onApagar ? (
          <Button
            variant="ghost"
            size="icon-xs"
            // No foco também, e não só no hover: quem chega por teclado precisa
            // alcançar o mesmo gesto.
            className="bg-card absolute top-1 right-1 opacity-0 transition-opacity group-hover/linha:opacity-100 group-focus-within/linha:opacity-100"
            aria-label={textos.fio.apagarLinha(nomeDoAutor(linha.autor))}
            onClick={() => onApagar(linha)}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * A rolagem: os dados desenhados, o que foi jogado e o resultado.
 *
 * Enquanto o dado cai, o resultado não aparece — "Rolando…" na MESMA célula,
 * empilhado, como na bandeja: trocar um pelo outro faria a linha escorregar
 * para o lado justo quando a mesa está olhando para ela.
 */
function RolagemView({
  id,
  rolagem,
  t,
  denso,
}: {
  id: string;
  rolagem: RolagemNoFio;
  t: number | undefined;
  denso: boolean;
}) {
  const { rotulo, notacao, resultado } = partesDaRolagem(rolagem);
  const assentou = t === undefined || t >= DURACAO_DA_CHEGADA;
  const tamanho = denso ? 20 : 26;

  const desenhados = rolagem.dados.slice(0, DADOS_DESENHADOS);
  const resto = rolagem.dados.length - desenhados.length;

  return (
    <div className="flex min-w-0 items-center gap-2 py-0.5">
      <span className="flex shrink-0 items-center gap-0.5">
        {desenhados.map((dado, i) =>
          // Só a rolagem de jogador cai, e ela tem um dado só.
          t !== undefined && rolagem.dados.length === 1 ? (
            <DadoRolando
              key={i}
              id={id}
              faces={dado.faces}
              valor={dado.valor}
              tamanho={tamanho}
              t={t}
            />
          ) : (
            <DadoParado key={i} faces={dado.faces} valor={dado.valor} tamanho={tamanho} />
          ),
        )}
        {resto > 0 ? (
          <span className="text-muted-foreground text-[10px]">+{resto}</span>
        ) : null}
      </span>

      <span
        className={cn(
          "text-muted-foreground min-w-0 flex-1 truncate",
          denso ? "text-xs" : "text-sm",
        )}
      >
        {rotulo ? <span className="text-foreground">{rotulo} · </span> : null}
        {notacao}
      </span>

      <span className="grid shrink-0 place-items-end">
        <span
          className={cn(
            "leading-tight font-semibold tabular-nums transition-opacity duration-200 [grid-area:1/1]",
            denso ? "text-sm" : "text-base",
          )}
          style={{ opacity: assentou ? 1 : 0 }}
        >
          {resultado}
        </span>
        <span
          aria-hidden
          className="text-muted-foreground self-center text-[10px] leading-tight transition-opacity duration-200 [grid-area:1/1]"
          style={{ opacity: assentou ? 0 : 1 }}
        >
          {textos.dados.rolando}
        </span>
      </span>
    </div>
  );
}

/**
 * Um endereço no texto. Sem a pontuação do fim: "olha isto: https://x.com." é
 * uma frase que termina em ponto, e o ponto não é do endereço.
 */
const ENDERECO = /(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)\]])/g;

/**
 * O texto com os endereços clicáveis. Colar um link para a mesa é metade do
 * motivo de a conversa estar no WhatsApp ao lado.
 *
 * `split` com o grupo de captura devolve os endereços nas posições ímpares.
 */
function comLinks(texto: string, abrirLink?: (url: string) => void): ReactNode[] {
  return texto.split(ENDERECO).map((parte, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={parte}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all underline underline-offset-2"
        onClick={
          abrirLink
            ? (event) => {
                event.preventDefault();
                abrirLink(parte);
              }
            : undefined
        }
      >
        {parte}
      </a>
    ) : (
      parte
    ),
  );
}

/**
 * O texto de uma linha: `**negrito**`, quebras, endereços e `@personagem`.
 *
 * As mesmas regras do postit e do caderno (`parseDoChat`), para o `@` que o
 * Mestre aprendeu a usar no mapa valer igual aqui. Os endereços saem dos
 * pedaços de texto comum — uma menção nunca é link.
 */
function TextoDaLinha({
  texto,
  abrirLink,
  mencoes,
}: {
  texto: string;
  abrirLink?: (url: string) => void;
  mencoes?: MencoesDoFio;
}) {
  return (
    <>
      {parseDoChat(texto).map((token, indice) => {
        // Índice como chave: a lista é derivada do texto, que não muda.
        if (token.tipo === "quebra") return <br key={indice} />;
        if (token.tipo === "bold")
          return (
            <strong key={indice} className="font-semibold">
              {token.valor}
            </strong>
          );
        if (token.tipo === "texto")
          return <span key={indice}>{comLinks(token.valor, abrirLink)}</span>;

        return <Mencao key={indice} nome={token.valor} bruto={token.bruto} mencoes={mencoes} />;
      })}
    </>
  );
}

/** Classes do ícone que vai no texto: do tamanho da letra, na linha dela. */
const ICONE = "inline-block size-[1em] shrink-0 translate-y-[0.1em]";

/**
 * Um `@personagem`. A máscara e o azul são os do caderno e do postit: a mesma
 * coisa com a mesma cara em todo lugar onde se escreve.
 */
function Mencao({
  nome,
  bruto,
  mencoes,
}: {
  nome: string;
  bruto: string;
  mencoes?: MencoesDoFio;
}) {
  const achado = mencoes?.personagem(nome) ?? null;

  if (!achado) {
    // Sem quem resolva, ou resolvido no celular para um PNJ: o nome, só.
    if (!mencoes || mencoes.desconhecido === "nome")
      return <span className="font-medium">{nome}</span>;

    // No Mestre o `@` fica à vista, tracejado: é o que ele digitou, e é ele
    // quem sabe se o personagem mudou de nome ou se a mão escorregou.
    return (
      <span
        className="text-muted-foreground underline decoration-dashed underline-offset-2"
        title={textos.fio.nenhumPersonagem}
      >
        {bruto}
      </span>
    );
  }

  const legenda = achado.dono
    ? textos.fio.comJogador(achado.nome, achado.dono)
    : textos.fio.semJogador(achado.nome);
  const conteudo = (
    <>
      <VenetianMask
        aria-hidden
        className={cn(ICONE, achado.ativo ? "text-emerald-400" : "text-sky-300/70")}
      />
      {achado.nome}
    </>
  );

  const abrir = mencoes?.abrir;
  if (!abrir)
    return (
      <span
        className="inline-flex items-baseline gap-[0.2em] font-medium text-sky-300"
        title={legenda}
      >
        {conteudo}
      </span>
    );

  return (
    <button
      type="button"
      className="inline-flex cursor-pointer items-baseline gap-[0.2em] font-medium text-sky-300 underline decoration-sky-300/40 decoration-dotted underline-offset-2 hover:decoration-solid"
      title={textos.fio.abrirFicha(legenda)}
      onClick={() => abrir(achado.id)}
    >
      {conteudo}
    </button>
  );
}

/**
 * O campo de escrever.
 *
 * Enter envia, Shift+Enter quebra a linha — o costume de todo chat. O texto só
 * sai do campo quando o daemon aceitou: perder a frase porque o Wi-Fi caiu no
 * meio do envio é o que faria a mesa voltar para o WhatsApp.
 */
export function CampoDoFio({
  onEnviar,
  placeholder,
  denso = false,
  antes,
  personagens = [],
  tituloDosPersonagens = textos.fio.personagens,
}: {
  onEnviar: (texto: string) => Promise<void>;
  placeholder: string;
  denso?: boolean;
  /** O que vai acima do campo: o destino do Mestre, o sussurro do jogador. */
  antes?: ReactNode;
  /**
   * O que o `@` sugere, na ordem em que aparece com o sinal sozinho. Vazio =
   * o `@` não abre lista nenhuma, e é texto.
   */
  personagens?: Sugestao[];
  /** A linha de título da lista: o que ela está oferecendo. */
  tituloDosPersonagens?: string;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const campo = useRef<HTMLTextAreaElement | null>(null);
  const [cursor, setCursor] = useState(0);
  const [indice, setIndice] = useState(0);
  /** Onde começava o marcador cuja lista foi dispensada com Esc. */
  const [dispensadoEm, setDispensadoEm] = useState(-1);
  /** A lista só abre com o campo em foco: sem ele, ela flutuaria sobre o palco. */
  const [focado, setFocado] = useState(false);
  const cursorPendente = useRef<number | null>(null);

  /**
   * Devolve o cursor ao lugar depois de uma escolha da lista, no render em que
   * o texto novo já está no campo. Ver o mesmo efeito no caderno.
   */
  useLayoutEffect(() => {
    const posicao = cursorPendente.current;
    if (posicao === null || !campo.current) return;

    cursorPendente.current = null;
    campo.current.setSelectionRange(posicao, posicao);
    setCursor(posicao);
  }, [texto]);

  /**
   * O `@` em construção sob o cursor, recalculado a cada render: ele é função
   * do texto e do cursor, que já estão aqui. Ver `fragmentoNoCursor`.
   */
  const fragmento =
    focado && personagens.length > 0
      ? fragmentoNoCursor(texto, cursor, SINAIS_DO_CHAT_EM_ORDEM)
      : null;

  const sugestoes =
    fragmento && fragmento.inicio !== dispensadoEm
      ? filtraSugestoes(personagens, fragmento.prefixo, normaliza)
      : [];

  // O item sob as setas nunca aponta para fora da lista que encurtou.
  const escolhido = Math.min(indice, Math.max(sugestoes.length - 1, 0));

  function aplicar(nome: string) {
    if (!fragmento) return;

    const resultado = aplicaSugestao(texto, fragmento, cursor, nome);

    cursorPendente.current = resultado.cursor;
    setTexto(resultado.texto);
    setIndice(0);

    // O foco pode ter ficado no caminho quando a escolha veio do toque.
    campo.current?.focus();
  }

  async function enviar() {
    const limpo = texto.trim();
    if (!limpo || enviando) return;

    setEnviando(true);
    setErro(null);

    try {
      await onEnviar(limpo);
      setTexto("");
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : textos.fio.naoRecebeu);
    } finally {
      setEnviando(false);
    }
  }

  function tecla(event: KeyboardEvent<HTMLTextAreaElement>) {
    // `isComposing`: o Enter que confirma um acento composto no teclado não é
    // o Enter de enviar, nem o de escolher.
    if (event.nativeEvent.isComposing) return;

    const lista = sugestoes.length > 0;

    if (lista && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();

      const passo = event.key === "ArrowDown" ? 1 : -1;
      setIndice((atual) => {
        const proximo = (Math.min(atual, sugestoes.length - 1) + passo) % sugestoes.length;

        return proximo < 0 ? sugestoes.length - 1 : proximo;
      });

      return;
    }

    // Com a lista aberta, Enter e Tab escolhem o nome — e não enviam: mandar
    // "@Tha" para a mesa no meio da escolha é o erro que a lista existe para
    // evitar.
    if (lista && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault();
      aplicar(sugestoes[escolhido].nome);

      return;
    }

    // Esc fecha a lista e fica no campo. Sem lista, segue adiante — a janela
    // pode ter o que fazer com ele.
    if (lista && event.key === "Escape" && fragmento) {
      event.preventDefault();
      event.stopPropagation();
      setDispensadoEm(fragmento.inicio);

      return;
    }

    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    void enviar();
  }

  return (
    <form
      className="shrink-0 border-t p-2"
      onSubmit={(event) => {
        event.preventDefault();
        void enviar();
      }}
    >
      {antes ? <div className="mb-1.5 flex items-center gap-2">{antes}</div> : null}

      <div className="flex items-end gap-1.5">
        <Textarea
          ref={campo}
          value={texto}
          onChange={(event) => {
            setTexto(event.target.value);
            setCursor(event.target.selectionStart);
          }}
          // `select` cobre seta, toque e arrasto de seleção de uma vez.
          onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
          onFocus={() => setFocado(true)}
          onBlur={(event) => {
            // A lista vive num portal fora do campo, e escolher nela tira o
            // foco daqui. Sem esta guarda, ela fecharia no meio da escolha.
            const alvo = event.relatedTarget;
            if (alvo instanceof Element && alvo.closest(`[${MARCA_LISTA}]`)) return;

            setFocado(false);
          }}
          onKeyDown={tecla}
          maxLength={MAX_TEXTO_DO_FIO}
          rows={1}
          enterKeyHint="send"
          placeholder={placeholder}
          aria-label={textos.fio.mensagem}
          className={cn(
            "max-h-32 min-h-0 resize-none",
            denso && "py-1.5 text-xs md:text-xs",
          )}
        />
        <Button
          type="submit"
          size={denso ? "icon-sm" : "icon"}
          disabled={texto.trim() === "" || enviando}
          aria-label={textos.fio.enviar}
        >
          <SendHorizontal />
        </Button>
      </div>

      {erro ? (
        <p role="alert" className="text-destructive mt-1 text-xs">
          {erro}
        </p>
      ) : null}

      {sugestoes.length > 0 ? (
        <ListaDeSugestoes
          titulo={tituloDosPersonagens}
          itens={sugestoes}
          indice={escolhido}
          // Ancorada no CAMPO, como no caderno: o campo do chat tem uma ou duas
          // linhas, e a lista abre para cima dele, que está no pé da janela.
          ancora={campo}
          onEscolher={aplicar}
        />
      ) : null}
    </form>
  );
}
