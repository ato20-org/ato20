"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronRight,
  Clapperboard,
  Dices,
  Eye,
  EyeOff,
  Flag,
  HeartPulse,
  MessagesSquare,
  Package,
  Search,
  Swords,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmarRemocao } from "@/components/mestre/confirmar-remocao";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { abrirJanela } from "@/lib/extensoes/janelas";
import { fraseDe } from "@/lib/historico/frases";
import {
  CATEGORIAS,
  categoriaDe,
  emSessoes,
  filtrar,
  linhaDoTempo,
  type Categoria,
  type Entrada,
  type MarcoExibido,
  type Sessao,
} from "@/lib/historico/linha-do-tempo";
import { idioma } from "@/lib/i18n/idioma";
import { t } from "@/lib/i18n/mestre";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useFioStore } from "@/lib/store/use-fio-store";
import { useHistoricoStore } from "@/lib/store/use-historico-store";
import { cn } from "@/lib/utils";
import type { LinhaDoFio } from "@/types/fio";

/**
 * De quanto em quanto tempo a janela aberta lê o fim do arquivo: é por onde
 * chega o que o Rust grava sozinho -- o item que o celular tirou da mochila. O
 * que o Mestre grava entra na hora, sem esperar.
 */
const RELEITURA_MS = 4000;

const HORA = new Intl.DateTimeFormat(idioma, { hour: "2-digit", minute: "2-digit" });
const DIA = new Intl.DateTimeFormat(idioma, { weekday: "long", day: "numeric", month: "long" });

/**
 * O histórico da campanha, como janela da bancada: tudo o que aconteceu na
 * mesa, sessão por sessão, com a conversa do fio intercalada pela hora.
 *
 * Para RELEMBRAR, e por isso as sessões antigas fecham mostrando só os
 * marcos: o resumo de uma noite é o que o mestre escreveu dela. A mais nova
 * abre inteira, e o filtro abre toda sessão em que achou alguma coisa.
 *
 * Só o Mestre vê: aqui estão os sussurros do fio, as condições escondidas e o
 * item dado às escondidas.
 */
export function HistoricoBody() {
  const registros = useHistoricoStore((state) => state.registros);
  const fioLido = useHistoricoStore((state) => state.fio);
  const erro = useHistoricoStore((state) => state.erro);
  const fioAoVivo = useFioStore((state) => state.linhas);
  const personagens = useCharactersStore((state) => state.personagens);

  useEffect(() => {
    const { carregar, atualizar } = useHistoricoStore.getState();
    void carregar();
    const relogio = window.setInterval(() => void atualizar(), RELEITURA_MS);
    return () => window.clearInterval(relogio);
  }, []);

  const [busca, setBusca] = useState("");
  const [categorias, setCategorias] = useState<ReadonlySet<Categoria>>(() => new Set());
  const [personagemId, setPersonagemId] = useState<string | null>(null);
  /** As sessões que o mestre abriu ou fechou à mão. Ausente = o padrão. */
  const [alternadas, setAlternadas] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [apagando, setApagando] = useState<MarcoExibido | null>(null);

  const fio = useMemo(() => unirFio(fioLido, fioAoVivo), [fioLido, fioAoVivo]);
  const sessoes = useMemo(
    () => (registros ? emSessoes(linhaDoTempo(registros, fio)) : []),
    [registros, fio],
  );

  const filtrando = categorias.size > 0 || personagemId !== null || busca.trim() !== "";
  const vistas = useMemo(() => {
    const filtro = { categorias, personagemId, busca };
    return sessoes
      .map((sessao) => ({
        sessao,
        entradas: filtrando ? filtrar(sessao.entradas, filtro, fraseDe) : sessao.entradas,
      }))
      .filter(({ entradas }) => entradas.length > 0);
  }, [busca, categorias, filtrando, personagemId, sessoes]);

  // Quem abre a janela quer o agora: o fim da última sessão.
  const rolagem = useRef<HTMLDivElement>(null);
  const carregado = registros !== null;
  useEffect(() => {
    if (carregado) rolagem.current?.scrollTo({ top: rolagem.current.scrollHeight });
  }, [carregado]);

  const alternarCategoria = (categoria: Categoria) =>
    setCategorias((atuais) => {
      const novas = new Set(atuais);
      if (novas.has(categoria)) novas.delete(categoria);
      else novas.add(categoria);
      return novas;
    });

  const ultima = sessoes.at(-1)?.id;
  const aberta = (sessao: Sessao) =>
    filtrando || (alternadas.get(sessao.id) ?? sessao.id === ultima);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border/60 flex flex-col gap-2 border-b p-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
            <Input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder={t.historico.buscar}
              aria-label={t.historico.buscar}
              className="h-7 pl-7 text-xs"
            />
          </div>
          <Select<string>
            value={personagemId ?? TODOS}
            onValueChange={(valor) => setPersonagemId(!valor || valor === TODOS ? null : valor)}
          >
            <SelectTrigger
              size="sm"
              className="h-7 w-44 shrink-0 text-xs"
              aria-label={t.historico.qualquerPersonagem}
            >
              <SelectValue>
                {(valor: string) =>
                  personagens?.find((personagem) => personagem.id === valor)?.nome ??
                  t.historico.qualquerPersonagem
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value={TODOS} className="text-xs">
                {t.historico.qualquerPersonagem}
              </SelectItem>
              {(personagens ?? []).map((personagem) => (
                <SelectItem key={personagem.id} value={personagem.id} className="text-xs">
                  {personagem.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-1">
          {CATEGORIAS.map((categoria) => (
            <button
              key={categoria}
              type="button"
              aria-pressed={categorias.has(categoria)}
              onClick={() => alternarCategoria(categoria)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                categorias.has(categoria)
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {t.historico.categorias[categoria]}
            </button>
          ))}
        </div>
      </div>

      <div ref={rolagem} className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {erro ? (
          <PainelVazio conteudo={{ tipo: "historico" }}>{t.historico.naoLeu}</PainelVazio>
        ) : !carregado ? (
          <PainelVazio conteudo={{ tipo: "historico" }}>{t.historico.carregando}</PainelVazio>
        ) : sessoes.length === 0 ? (
          <PainelVazio conteudo={{ tipo: "historico" }}>{t.historico.vazio}</PainelVazio>
        ) : vistas.length === 0 ? (
          <PainelVazio conteudo={{ tipo: "historico" }}>{t.historico.nadaNoFiltro}</PainelVazio>
        ) : (
          vistas.map(({ sessao, entradas }) => (
            <SessaoDoHistorico
              key={sessao.id}
              sessao={sessao}
              entradas={entradas}
              aberta={aberta(sessao)}
              onAlternar={() =>
                setAlternadas((atuais) => new Map(atuais).set(sessao.id, !aberta(sessao)))
              }
              onApagarMarco={setApagando}
            />
          ))
        )}
      </div>

      <CampoDoMarco />

      <ConfirmarRemocao
        aberto={apagando !== null}
        onAberto={(aberto) => {
          if (!aberto) setApagando(null);
        }}
        titulo={t.historico.apagarMarcoTitulo}
        itens={apagando ? [apagando.texto] : []}
        ressalva={t.historico.apagarMarcoRessalva}
        onConfirmar={() => {
          const alvo = apagando;
          setApagando(null);
          if (!alvo) return;

          void useHistoricoStore
            .getState()
            .apagarMarco(alvo.id)
            .catch(() => toast.error(t.historico.marcoNaoGravou));
        }}
      />
    </div>
  );
}

/** O valor do "qualquer personagem": o `Select` não aceita item sem valor. */
const TODOS = "todos";

/**
 * O fio lido junto com o histórico, e o que chegou depois pelo fluxo.
 *
 * O fluxo traz também o replay das últimas linhas, que a leitura já tinha: o
 * id é quem diz que é a mesma.
 */
function unirFio(lido: readonly LinhaDoFio[], aoVivo: readonly LinhaDoFio[]): LinhaDoFio[] {
  if (aoVivo.length === 0) return [...lido];

  const vistos = new Set(lido.map((linha) => linha.id));
  return [...lido, ...aoVivo.filter((linha) => !vistos.has(linha.id))];
}

function SessaoDoHistorico({
  sessao,
  entradas,
  aberta,
  onAlternar,
  onApagarMarco,
}: {
  sessao: Sessao;
  /** As que passaram no filtro. */
  entradas: Entrada[];
  aberta: boolean;
  onAlternar: () => void;
  onApagarMarco: (marco: MarcoExibido) => void;
}) {
  // Fechada, a sessão mostra os marcos: é o resumo da noite.
  const mostradas = aberta
    ? entradas
    : entradas.filter((entrada) => categoriaDe(entrada) === "marcos");

  return (
    <section className="py-1">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberta}
        className="hover:bg-accent/40 flex w-full items-center gap-1.5 rounded px-1 py-1 text-left"
      >
        <ChevronRight
          className={cn("text-muted-foreground size-3.5 shrink-0 transition-transform", aberta && "rotate-90")}
        />
        <span className="text-xs font-medium">
          {t.historico.sessao(DIA.format(sessao.inicio))}
        </span>
        <span className="text-muted-foreground ml-auto shrink-0 text-[11px] tabular-nums">
          {t.historico.horario(HORA.format(sessao.inicio), HORA.format(sessao.fim))} ·{" "}
          {t.historico.acontecimentos(entradas.length)}
        </span>
      </button>

      {mostradas.length > 0 ? (
        <ol className="mt-0.5 flex flex-col">
          {mostradas.map((entrada) => (
            <LinhaDoHistorico key={entrada.id} entrada={entrada} onApagarMarco={onApagarMarco} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function LinhaDoHistorico({
  entrada,
  onApagarMarco,
}: {
  entrada: Entrada;
  onApagarMarco: (marco: MarcoExibido) => void;
}) {
  const registro = entrada.tipo === "registro" ? entrada.registro : null;

  // A rodada é uma régua entre os golpes, e não uma linha como as outras.
  if (registro?.tipo === "combate" && registro.fase === "rodada")
    return (
      <li className="text-muted-foreground flex items-center gap-2 py-0.5 pl-10 text-[11px]">
        <span className="bg-border/60 h-px flex-1" />
        {fraseDe(entrada)}
        <span className="bg-border/60 h-px flex-1" />
      </li>
    );

  const personagemId = personagemDa(entrada);

  return (
    <li
      className={cn(
        "group flex items-start gap-2 rounded px-1 py-0.5 text-xs",
        registro?.tipo === "marco" && "bg-amber-500/10",
        registro?.tipo === "cena" && "mt-1",
      )}
    >
      <time
        dateTime={new Date(entrada.quando).toISOString()}
        className="text-muted-foreground w-9 shrink-0 pt-px text-[11px] tabular-nums"
      >
        {HORA.format(entrada.quando)}
      </time>
      <span className="mt-0.5 shrink-0">{iconeDa(entrada)}</span>

      {registro?.tipo === "marco" ? (
        <MarcoEditavel marco={registro} onApagar={() => onApagarMarco(registro)} />
      ) : (
        <span
          className={cn(
            "min-w-0 flex-1 break-words",
            registro?.tipo === "cena" && "font-medium",
            entrada.tipo === "fio" && "text-muted-foreground",
            personagemId && "hover:text-foreground cursor-pointer hover:underline",
          )}
          onClick={
            personagemId
              ? () => abrirJanela({ tipo: "personagem", personagemId })
              : undefined
          }
        >
          {fraseDe(entrada)}
          {registro?.tipo === "medidor" ? <Diferenca de={registro.antes} para={registro.depois} /> : null}
          {registro && "escondido" in registro && registro.escondido ? (
            <EyeOff
              aria-label={t.historico.escondido}
              className="text-muted-foreground ml-1 inline size-3 align-[-2px]"
            />
          ) : null}
        </span>
      )}
    </li>
  );
}

/** O personagem de quem a linha fala, para o clique abrir a ficha. */
function personagemDa(entrada: Entrada): string | null {
  if (entrada.tipo !== "registro") return null;

  const registro = entrada.registro;
  if (registro.tipo === "medidor") return registro.personagemId;
  if (registro.tipo === "condicao" && registro.alvo === "personagem") return registro.alvoId;
  if (registro.tipo === "item" && "personagemId" in registro && registro.personagemId)
    return registro.personagemId;
  if (registro.tipo === "disparo") return registro.deId ?? registro.emId ?? null;
  return null;
}

/** O −7 ou o +3 ao lado do medidor: o tamanho do golpe, de relance. */
function Diferenca({ de, para }: { de: number; para: number }) {
  const diferenca = para - de;
  if (diferenca === 0) return null;

  return (
    <span
      className={cn(
        "ml-1.5 tabular-nums",
        diferenca < 0 ? "text-red-400" : "text-emerald-400",
      )}
    >
      {diferenca > 0 ? `+${diferenca}` : `−${-diferenca}`}
    </span>
  );
}

function iconeDa(entrada: Entrada): ReactNode {
  const classe = "text-muted-foreground size-3.5";

  if (entrada.tipo === "fio")
    return entrada.linha.rolagem ? (
      <Dices className={classe} />
    ) : (
      <MessagesSquare className={classe} />
    );

  const registro = entrada.registro;
  switch (registro.tipo) {
    case "marco":
      return <Flag className="size-3.5 text-amber-400" />;
    case "cena":
      return <Clapperboard className={classe} />;
    case "combate":
      return <Swords className={classe} />;
    case "disparo":
      return <Zap className="size-3.5 text-orange-400" />;
    case "medidor":
      return <HeartPulse className="size-3.5" style={{ color: registro.cor }} />;
    case "condicao":
      return (
        <span
          className="m-[3px] block size-2 rounded-full"
          style={{ backgroundColor: registro.cor, opacity: registro.ligada ? 1 : 0.35 }}
        />
      );
    case "item":
      return <Package className={classe} />;
    case "mostrado":
      return <Eye className={classe} />;
  }
}

/**
 * O marco se edita no lugar: clicar no texto o abre num campo, Enter guarda e
 * Esc desiste. Nada de formulário à parte -- ver "editar no próprio card".
 */
function MarcoEditavel({ marco, onApagar }: { marco: MarcoExibido; onApagar: () => void }) {
  const [rascunho, setRascunho] = useState<string | null>(null);

  const guardar = () => {
    const texto = rascunho?.trim() ?? "";
    setRascunho(null);
    if (!texto || texto === marco.texto) return;

    void useHistoricoStore
      .getState()
      .editarMarco(marco.id, texto)
      .catch(() => toast.error(t.historico.marcoNaoGravou));
  };

  if (rascunho !== null)
    return (
      <Input
        autoFocus
        value={rascunho}
        aria-label={t.historico.editarMarco}
        onChange={(event) => setRascunho(event.target.value)}
        onBlur={guardar}
        onKeyDown={(event) => {
          if (event.key === "Enter") guardar();
          if (event.key === "Escape") setRascunho(null);
        }}
        className="h-6 flex-1 text-xs"
      />
    );

  return (
    <>
      <button
        type="button"
        title={t.historico.editarMarco}
        onClick={() => setRascunho(marco.texto)}
        className="min-w-0 flex-1 cursor-text text-left font-medium break-words"
      >
        {marco.texto}
        {marco.editadoEm ? (
          <span className="text-muted-foreground ml-1.5 text-[10px] font-normal">
            {t.historico.editado}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        aria-label={t.historico.apagarMarco}
        title={t.historico.apagarMarco}
        onClick={onApagar}
        className="text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </>
  );
}

/** O campo de escrever um marco, no pé da janela: o marco entra AGORA. */
function CampoDoMarco() {
  const [texto, setTexto] = useState("");

  const escrever = () => {
    const limpo = texto.trim();
    if (!limpo) return;

    setTexto("");
    void useHistoricoStore
      .getState()
      .escreverMarco(limpo)
      .catch(() => {
        setTexto(limpo);
        toast.error(t.historico.marcoNaoGravou);
      });
  };

  return (
    <div className="border-border/60 flex items-center gap-2 border-t p-2">
      <Flag className="size-3.5 shrink-0 text-amber-400" />
      <Input
        value={texto}
        maxLength={2000}
        onChange={(event) => setTexto(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") escrever();
        }}
        placeholder={t.historico.marcoExemplo}
        aria-label={t.historico.escreverMarco}
        className="h-7 text-xs"
      />
    </div>
  );
}
