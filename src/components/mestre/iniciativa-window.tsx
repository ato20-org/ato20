"use client";

import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as EventoDePonteiro,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Dices,
  GripVertical,
  Square,
  Swords,
  UserMinus,
  UserPlus,
} from "lucide-react";

import { Rosto } from "@/components/mestre/characters-window";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCharacterOwners } from "@/hooks/use-character-owners";
import { useCharacters } from "@/hooks/use-characters";
import { t } from "@/lib/i18n/mestre";
import {
  daVez,
  porVez,
  totalDaRolagem,
  type DadoRolado,
  type EventoDaRodada,
  type Rodada,
} from "@/lib/iniciativa/rodadas";
import { useIniciativaStore } from "@/lib/store/use-iniciativa-store";
import { selectCenaParaMesa, useSceneStore } from "@/lib/store/use-scene-store";
import { duracao } from "@/lib/tempo";
import { cn } from "@/lib/utils";
import type { Personagem } from "@/types/character";

/** Quantos pixels o ponteiro anda antes de o aperto virar arrasto. */
const LIMIAR_DO_ARRASTO = 4;

/**
 * A ordem da rodada: quem age, de quem é a vez, e o que aconteceu em cada
 * rodada.
 *
 * A lista é de quem tem token no mapa que a MESA está vendo, e não da campanha
 * inteira: o combate acontece numa cena, e o bestiário de trinta PNJs da
 * campanha não tem lugar na ordem. Quem saiu do mapa no meio do combate continua
 * na ordem -- sair dela é gesto do mestre, e não efeito de mover um token.
 *
 * A vez e os botões moram no RODAPÉ, fora da área que rola: são o gesto de todo
 * turno, e não podem sumir porque a ordem tem doze nomes.
 */
export function IniciativaBody() {
  const iniciativa = useIniciativaStore((state) => state.iniciativa);
  const cena = useSceneStore(selectCenaParaMesa);
  const { personagens, jogadores } = useCharacters();
  const donos = useCharacterOwners(jogadores);

  const porId = useMemo(
    () => new Map((personagens ?? []).map((personagem) => [personagem.id, personagem])),
    [personagens],
  );

  // Jogadores primeiro, e é nesta ordem que o "Iniciar" os põe: costuma ser o
  // grupo contra o que está no mapa, e o mestre arruma o resto arrastando.
  const noMapa = useMemo(() => {
    if (!cena || !personagens) return [];

    const ids = new Set(
      cena.items.flatMap((item) => (item.personagemId ? [item.personagemId] : [])),
    );
    const presentes = personagens.filter((personagem) => ids.has(personagem.id));
    const temDono = (personagem: Personagem) => (donos.get(personagem.id) ?? []).length > 0;

    return [
      ...presentes.filter(temDono),
      ...presentes.filter((personagem) => !temDono(personagem)),
    ];
  }, [cena, personagens, donos]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs defaultValue="ordem" className="min-h-0 flex-1 gap-0">
        <TabsList variant="line" className="h-7 w-full shrink-0 justify-start gap-2 px-2">
          <TabsTrigger value="ordem" className="flex-none text-xs">
            {t.iniciativa.abaOrdem}
          </TabsTrigger>
          <TabsTrigger value="rodadas" className="flex-none text-xs">
            {t.iniciativa.abaRodadas}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ordem" className="flex min-h-0 flex-col border-t">
          <ScrollArea className="min-h-0 flex-1">
            <AbaOrdem noMapa={noMapa} porId={porId} donos={donos} />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="rodadas" className="flex min-h-0 flex-col border-t">
          <ScrollArea className="min-h-0 flex-1">
            <AbaRodadas rodadas={iniciativa.rodadas} porId={porId} />
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <Rodape noMapa={noMapa} porId={porId} donos={donos} />
    </div>
  );
}

type Donos = Map<string, string[]>;

function AbaOrdem({
  noMapa,
  porId,
  donos,
}: {
  noMapa: Personagem[];
  porId: Map<string, Personagem>;
  donos: Donos;
}) {
  const iniciativa = useIniciativaStore((state) => state.iniciativa);
  const incluir = useIniciativaStore((state) => state.incluir);

  if (!iniciativa.rodando) {
    if (noMapa.length === 0)
      return (
        <Vazio>
          <p className="text-foreground">{t.iniciativa.ninguemNoMapa}</p>
          <p>{t.iniciativa.ninguemNoMapaDica}</p>
        </Vazio>
      );

    return (
      <div className="flex flex-col gap-3 p-2">
        <Secao titulo={t.iniciativa.noMapa}>
          {noMapa.map((personagem) => (
            <li key={personagem.id}>
              <Linha personagem={personagem} id={personagem.id} donos={donos} />
            </li>
          ))}
        </Secao>
        <p className="text-muted-foreground px-1.5 text-xs">{t.iniciativa.iniciarDica}</p>
      </div>
    );
  }

  const fora = noMapa.filter((personagem) => !iniciativa.ordem.includes(personagem.id));

  return (
    <div className="flex flex-col gap-3 p-2">
      <Secao titulo={t.iniciativa.naOrdem}>
        {iniciativa.ordem.length === 0 ? (
          <li className="text-muted-foreground px-1.5 py-2 text-xs">
            {t.iniciativa.ordemVazia}
          </li>
        ) : (
          <OrdemArrastavel porId={porId} donos={donos} />
        )}
      </Secao>

      {fora.length > 0 ? (
        <Secao titulo={t.iniciativa.foraDaOrdem}>
          {fora.map((personagem) => (
            <li key={personagem.id}>
              <Linha
                personagem={personagem}
                id={personagem.id}
                donos={donos}
                acao={
                  <BotaoDaLinha
                    rotulo={t.iniciativa.por(personagem.nome)}
                    onClick={() => incluir(personagem.id)}
                  >
                    <UserPlus />
                  </BotaoDaLinha>
                }
              />
            </li>
          ))}
        </Secao>
      ) : null}
    </div>
  );
}

/**
 * A ordem, que se arruma arrastando a linha.
 *
 * Com ponteiro e não com o arrasto nativo do HTML: o nativo desenha um fantasma
 * da linha que o WebKitGTK pinta como quer, e não avisa nada enquanto o dedo
 * anda -- só no soltar. Aqui o alvo é recalculado a cada movimento, e a linha
 * fina mostra onde ele vai cair.
 *
 * A linha INTEIRA arrasta, e não só a alça: a alça é a pista de que dá, mas
 * mirar seis pixels de ícone no meio do combate é pedir demais. Os botões da
 * linha ficam de fora do gesto.
 */
function OrdemArrastavel({
  porId,
  donos,
}: {
  porId: Map<string, Personagem>;
  donos: Donos;
}) {
  const iniciativa = useIniciativaStore((state) => state.iniciativa);
  const mover = useIniciativaStore((state) => state.mover);
  const retirar = useIniciativaStore((state) => state.retirar);

  const linhas = useRef(new Map<string, HTMLLIElement>());
  const gesto = useRef<{ id: string; y: number; arrastando: boolean } | null>(null);
  const [arrasto, setArrasto] = useState<{ id: string; alvo: number } | null>(null);

  const vez = daVez(iniciativa);
  const { ordem } = iniciativa;

  /** Quantos dos OUTROS ficaram acima do ponteiro: a posição final, sem ele. */
  function alvoPara(id: string, y: number): number {
    let alvo = 0;
    for (const outro of ordem) {
      if (outro === id) continue;
      const caixa = linhas.current.get(outro)?.getBoundingClientRect();
      if (caixa && y > caixa.top + caixa.height / 2) alvo += 1;
    }

    return alvo;
  }

  function aoApertar(event: EventoDePonteiro<HTMLLIElement>, id: string) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;

    gesto.current = { id, y: event.clientY, arrastando: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function aoMover(event: EventoDePonteiro<HTMLLIElement>) {
    const atual = gesto.current;
    if (!atual) return;
    if (!atual.arrastando && Math.abs(event.clientY - atual.y) < LIMIAR_DO_ARRASTO) return;

    atual.arrastando = true;
    setArrasto({ id: atual.id, alvo: alvoPara(atual.id, event.clientY) });
  }

  function aoSoltar(event: EventoDePonteiro<HTMLLIElement>) {
    const atual = gesto.current;
    gesto.current = null;
    if (atual?.arrastando) mover(atual.id, alvoPara(atual.id, event.clientY));
    setArrasto(null);
  }

  function aoCancelar() {
    gesto.current = null;
    setArrasto(null);
  }

  const outros = arrasto ? ordem.filter((id) => id !== arrasto.id) : ordem;

  return (
    <>
      {ordem.map((id) => {
        const personagem = porId.get(id);
        const nome = personagem?.nome ?? t.iniciativa.personagemApagado;
        const indiceEntreOutros = outros.indexOf(id);

        return (
          <li
            key={id}
            ref={(no) => {
              if (no) linhas.current.set(id, no);
              else linhas.current.delete(id);
            }}
            title={t.iniciativa.arrastar}
            onPointerDown={(event) => aoApertar(event, id)}
            onPointerMove={aoMover}
            onPointerUp={aoSoltar}
            onPointerCancel={aoCancelar}
            className={cn(
              "relative touch-none select-none",
              arrasto?.id === id && "opacity-40",
            )}
          >
            {arrasto && indiceEntreOutros === arrasto.alvo ? <MarcaDeQueda lado="cima" /> : null}
            <Linha
              personagem={personagem}
              id={id}
              donos={donos}
              daVez={id === vez}
              arrastavel
              acao={
                <BotaoDaLinha rotulo={t.iniciativa.tirar(nome)} onClick={() => retirar(id)}>
                  <UserMinus />
                </BotaoDaLinha>
              }
            />
            {arrasto &&
            arrasto.alvo === outros.length &&
            id === outros[outros.length - 1] ? (
              <MarcaDeQueda lado="baixo" />
            ) : null}
          </li>
        );
      })}
    </>
  );
}

/** A linha fina que diz onde o arrastado vai cair. */
function MarcaDeQueda({ lado }: { lado: "cima" | "baixo" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-primary pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full",
        lado === "cima" ? "-top-px" : "-bottom-px",
      )}
    />
  );
}

/**
 * Uma linha de personagem: o retrato, o nome, e embaixo quem o joga.
 *
 * PNJ não ganha segunda linha: "sem jogador" repetido em dez goblins é ruído,
 * e a falta do nome já diz a mesma coisa.
 */
function Linha({
  personagem,
  id,
  donos,
  daVez = false,
  arrastavel = false,
  acao,
}: {
  personagem: Personagem | undefined;
  id: string;
  donos: Donos;
  daVez?: boolean;
  arrastavel?: boolean;
  acao?: ReactNode;
}) {
  const quem = (donos.get(id) ?? []).join(", ");

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1",
        arrastavel && "hover:bg-muted/50 cursor-grab active:cursor-grabbing",
        daVez && "border-primary/40 bg-primary/10 hover:bg-primary/10",
      )}
    >
      {arrastavel ? (
        <GripVertical className="text-muted-foreground/60 size-3.5 shrink-0" aria-hidden />
      ) : null}

      {personagem ? (
        <Rosto personagem={personagem} />
      ) : (
        <span className="bg-muted/60 size-7 shrink-0 rounded border" />
      )}

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", daVez && "font-medium")}>
          {personagem?.nome ?? t.iniciativa.personagemApagado}
        </p>
        {quem ? <p className="text-muted-foreground truncate text-xs">{quem}</p> : null}
      </div>

      {acao}
    </div>
  );
}

function BotaoDaLinha({
  rotulo,
  onClick,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground shrink-0"
      aria-label={rotulo}
      title={rotulo}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * De quem é a vez, a rodada, e os gestos de todo turno.
 *
 * Fora de combate o rodapé inteiro vira o "Iniciar", que põe na ordem todos os
 * personagens do mapa: é quase sempre o que o mestre faria um por um, e tirar
 * os dois que não entram é mais rápido que pôr os oito que entram.
 */
function Rodape({
  noMapa,
  porId,
  donos,
}: {
  noMapa: Personagem[];
  porId: Map<string, Personagem>;
  donos: Donos;
}) {
  const iniciativa = useIniciativaStore((state) => state.iniciativa);
  const iniciar = useIniciativaStore((state) => state.iniciar);
  const proximo = useIniciativaStore((state) => state.proximo);
  const anterior = useIniciativaStore((state) => state.anterior);
  const encerrar = useIniciativaStore((state) => state.encerrar);

  if (!iniciativa.rodando)
    return (
      <footer className="shrink-0 border-t p-2">
        <Button
          size="sm"
          className="w-full"
          disabled={noMapa.length === 0}
          onClick={() => iniciar(noMapa.map((personagem) => personagem.id))}
        >
          <Swords />
          {t.iniciativa.iniciar}
        </Button>
      </footer>
    );

  const vez = daVez(iniciativa);
  const personagem = vez ? porId.get(vez) : undefined;
  const nome = vez ? (personagem?.nome ?? t.iniciativa.personagemApagado) : null;
  const quem = vez ? (donos.get(vez) ?? []).join(", ") : "";
  const rodada = iniciativa.rodadas.at(-1)?.numero ?? 1;
  const semNinguem = iniciativa.ordem.length === 0;

  return (
    <footer className="flex shrink-0 items-center gap-2 border-t px-2 py-1.5">
      {/* A rodada em selo, e não numa linha miúda embaixo do nome: é o número
          que a mesa pergunta ("em que rodada estamos?") e o que conta a duração
          das magias, e tem de ser lido de longe. No lugar do retrato, que a
          linha destacada da ordem já mostra.

          Quadrado de tamanho FIXO: a palavra miúda em cima esticava o selo
          para os lados, e um selo que muda de largura com a língua parece
          outro elemento a cada rodada. */}
      <div
        title={t.iniciativa.rodada(rodada)}
        className="flex size-10 shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md bg-amber-400 leading-none text-amber-950"
      >
        <span className="text-[7.5px] font-semibold tracking-tight uppercase">
          {t.iniciativa.rotuloDaRodada}
        </span>
        <span className="text-base font-bold tabular-nums">{rodada}</span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {nome ? t.iniciativa.vezDe(nome) : t.iniciativa.ninguemNaVez}
        </p>
        {quem ? <p className="text-muted-foreground truncate text-xs">{quem}</p> : null}
      </div>

      {/* Só ícone, como os controles de um tocador: voltar, parar e
          avançar se reconhecem pela forma, e o nome vai no `title`. O parar
          no MEIO e vermelho, para o dedo que vai ao "próximo" a cada turno
          não encerrar o combate de passagem. */}
      <div className="flex shrink-0 items-center gap-1">
        <BotaoDoTurno
          rotulo={t.iniciativa.anterior}
          dica={t.iniciativa.anteriorDica}
          disabled={semNinguem}
          onClick={anterior}
        >
          <ChevronLeft />
        </BotaoDoTurno>
        <BotaoDoTurno
          rotulo={t.iniciativa.encerrar}
          dica={t.iniciativa.encerrarDica}
          variante="destructive"
          onClick={encerrar}
        >
          <Square className="fill-current" />
        </BotaoDoTurno>
        <BotaoDoTurno
          rotulo={t.iniciativa.proximo}
          dica={t.iniciativa.proximoDica}
          disabled={semNinguem}
          onClick={proximo}
        >
          <ChevronRight />
        </BotaoDoTurno>
      </div>
    </footer>
  );
}

function BotaoDoTurno({
  rotulo,
  dica,
  variante = "secondary",
  disabled = false,
  onClick,
  children,
}: {
  rotulo: string;
  dica: string;
  variante?: "secondary" | "destructive";
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant={variante}
      size="icon"
      aria-label={rotulo}
      title={dica}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * As rodadas, da corrente para a primeira, e o que aconteceu em cada uma.
 *
 * Uma aberta por vez, e a corrente aberta de início: é a que se consulta no
 * meio do combate ("quanto ele já levou nesta?"). As outras abrem num clique,
 * com o que aconteceu em blocos pela vez de quem era.
 */
function AbaRodadas({
  rodadas,
  porId,
}: {
  rodadas: Rodada[];
  porId: Map<string, Personagem>;
}) {
  // `undefined` é "a de sempre": a corrente, se houver uma em andamento.
  const [escolhida, setEscolhida] = useState<number | null | undefined>(undefined);

  if (rodadas.length === 0) return <Vazio>{t.iniciativa.semRodadas}</Vazio>;

  const corrente = rodadas.at(-1);
  const aberta =
    escolhida === undefined ? (corrente?.fim === null ? corrente.numero : null) : escolhida;

  return (
    <ul className="flex flex-col gap-1 p-2">
      {[...rodadas].reverse().map((rodada) => {
        const estaAberta = rodada.numero === aberta;

        return (
          <li key={rodada.numero} className="rounded-md border">
            <button
              type="button"
              aria-expanded={estaAberta}
              onClick={() => setEscolhida(estaAberta ? null : rodada.numero)}
              className="hover:bg-muted/50 flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left"
            >
              <ChevronRight
                aria-hidden
                className={cn(
                  "text-muted-foreground size-3.5 shrink-0 self-center transition-transform",
                  estaAberta && "rotate-90",
                )}
              />
              <span className="text-sm font-medium">{t.iniciativa.rodada(rodada.numero)}</span>
              <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
                {rodada.fim === null
                  ? t.iniciativa.emAndamento
                  : duracao(rodada.fim - rodada.inicio)}
                {" · "}
                {t.iniciativa.contarEventos(rodada.eventos.length)}
              </span>
            </button>

            {estaAberta ? <EventosDaRodada rodada={rodada} porId={porId} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function EventosDaRodada({
  rodada,
  porId,
}: {
  rodada: Rodada;
  porId: Map<string, Personagem>;
}) {
  if (rodada.eventos.length === 0)
    return (
      <p className="text-muted-foreground border-t px-2 py-2 text-xs">
        {t.iniciativa.nadaNaRodada}
      </p>
    );

  return (
    <div className="flex flex-col gap-2 border-t px-2 py-2">
      {porVez(rodada.eventos).map((bloco, indice) => {
        const nome = bloco.vezDe
          ? (porId.get(bloco.vezDe)?.nome ?? t.iniciativa.personagemApagado)
          : null;

        return (
          <section key={indice} className="flex flex-col gap-1">
            <p className="text-muted-foreground text-[10px] font-medium uppercase">
              {nome ? t.iniciativa.vezDe(nome) : t.iniciativa.ninguemNaVez}
            </p>
            <ul className="flex flex-col gap-0.5">
              {bloco.eventos.map((evento, posicao) => (
                <LinhaDeEvento key={`${evento.quando}-${posicao}`} evento={evento} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** `2d6 + 1d4`: os dados de uma rolagem sem nome, agrupados por faces. */
function notacao(dados: readonly DadoRolado[]): string {
  const porFaces = new Map<number, number>();
  for (const dado of dados) porFaces.set(dado.faces, (porFaces.get(dado.faces) ?? 0) + 1);

  return [...porFaces].map(([faces, quantos]) => `${quantos}d${faces}`).join(" + ");
}

function LinhaDeEvento({ evento }: { evento: EventoDaRodada }) {
  switch (evento.tipo) {
    case "rolagem": {
      const quem = evento.personagem ?? evento.jogador ?? t.iniciativa.mestre;

      return (
        <li className="flex items-center gap-2 text-xs">
          <Dices className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            {t.iniciativa.quemRolou(quem, evento.rotulo ?? notacao(evento.dados))}
          </span>
          <span className="shrink-0 font-medium tabular-nums">{totalDaRolagem(evento)}</span>
        </li>
      );
    }

    case "medidor": {
      const diferenca = evento.antes === null ? null : evento.depois - evento.antes;

      return (
        <li className="flex items-center gap-2 text-xs">
          <Bolinha cor={evento.cor} />
          <span className="min-w-0 flex-1 truncate">
            {t.iniciativa.noMedidor(evento.personagem, evento.medidor)}
          </span>
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {t.iniciativa.mudouDe(evento.antes, evento.depois, evento.maximo)}
          </span>
          {diferenca ? (
            <span
              className={cn(
                "w-8 shrink-0 text-right font-medium tabular-nums",
                diferenca < 0 ? "text-destructive" : "text-emerald-500",
              )}
            >
              {diferenca > 0 ? `+${diferenca}` : diferenca}
            </span>
          ) : null}
        </li>
      );
    }

    case "condicao":
      return (
        <li className="flex items-center gap-2 text-xs">
          <Bolinha cor={evento.cor} />
          <span className={cn("min-w-0 flex-1 truncate", !evento.ligada && "text-muted-foreground")}>
            {evento.ligada
              ? t.iniciativa.ganhou(evento.personagem, evento.condicao)
              : t.iniciativa.perdeu(evento.personagem, evento.condicao)}
          </span>
        </li>
      );
  }
}

function Bolinha({ cor }: { cor: string }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: cor }}
    />
  );
}

/** Um grupo da lista, com o título miúdo das outras janelas. */
function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <p className="text-muted-foreground px-1.5 text-[10px] font-medium uppercase">
        {titulo}
      </p>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-1 px-4 py-10 text-center text-xs">
      {children}
    </div>
  );
}
