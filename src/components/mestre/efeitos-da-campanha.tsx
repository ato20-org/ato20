"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";

import { DeclarativoDoMestre } from "@/components/mestre/declarativo-do-mestre";
import { FiguraComEfeitos } from "@/components/playground/figura-com-efeitos";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import { importAssets } from "@/lib/vault/assets";
import type {
  AnimacaoDoEfeito,
  DefinicaoDeEfeito,
  ExternoDoEfeito,
  FiguraDoEfeito,
  LuzDoEfeito,
  ParticulasDoEfeito,
  QuadrosDoEfeito,
} from "@/types/efeito";

import amostra from "./amostra-da-figura.png";

/**
 * Os efeitos que a campanha cria: o editor.
 *
 * Só formulário, por escolha do mestre: cada camada do efeito -- a figura, a
 * imagem em volta, as partículas, a luz -- é uma seção que liga e desliga, com
 * os controles dela, e a prévia mostra o resultado numa figura de amostra
 * enquanto o controle anda. As imagens vêm do acervo da campanha, marcadas
 * como do efeito (escondidas da biblioteca, como o fundo de cena).
 *
 * O que se mexe vai para a mesa na hora e para o disco um instante depois --
 * ver `useEfeitosDaCampanhaStore`. Os números são presos de novo quando o
 * efeito é desenhado (`resolverExterno`, `particulasDosEfeitos`), então o que
 * o formulário deixa escolher é o que a mesa sabe desenhar.
 */
export function EfeitosDaCampanha() {
  const efeitos = useEfeitosDaCampanhaStore((state) => state.efeitos);
  const criar = useEfeitosDaCampanhaStore((state) => state.criar);
  const salvar = useEfeitosDaCampanhaStore((state) => state.salvar);
  const apagar = useEfeitosDaCampanhaStore((state) => state.apagar);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [aApagar, setAApagar] = useState<DefinicaoDeEfeito | null>(null);

  if (efeitos === null) {
    return <p className="text-muted-foreground text-xs">Lendo…</p>;
  }

  const atual = efeitos.find((efeito) => efeito.id === escolhido) ?? efeitos[0] ?? null;

  async function novo() {
    const criado = await criar();
    if (criado) setEscolhido(criado.id);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {efeitos.map((efeito) => (
          <button
            key={efeito.id}
            type="button"
            aria-pressed={atual?.id === efeito.id}
            className={cn(
              "hover:bg-muted max-w-40 truncate rounded-md border px-2 py-1 text-xs",
              atual?.id === efeito.id ? "bg-muted border-foreground/30" : "border-transparent",
            )}
            onClick={() => setEscolhido(efeito.id)}
          >
            {efeito.titulo}
          </button>
        ))}
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void novo()}>
          <Plus />
          Novo efeito
        </Button>
      </div>

      {atual ? (
        <EditorDeEfeito
          key={atual.id}
          efeito={atual}
          onMudar={salvar}
          onApagar={() => setAApagar(atual)}
        />
      ) : (
        <p className="text-muted-foreground text-[11px] leading-snug">
          Um efeito é o que uma condição faz com a figura: um fogo em volta, partículas
          subindo, uma luz, a cor por cima. Crie um aqui e escolha-o no efeito de uma
          condição.
        </p>
      )}

      <AlertDialog
        open={aApagar !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setAApagar(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar {aApagar?.titulo}?</AlertDialogTitle>
            <AlertDialogDescription>
              As condições que usam este efeito continuam com o selo, sem efeito na figura.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (aApagar) void apagar(aApagar.id);
                setEscolhido(null);
              }}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Um campo fora do objeto: `undefined` some, e o arquivo não ganha campo vazio. */
function com<T extends object, K extends keyof T>(objeto: T, chave: K, valor: T[K] | undefined): T {
  const novo = { ...objeto };
  if (valor === undefined) delete novo[chave];
  else novo[chave] = valor;
  return novo;
}

function EditorDeEfeito({
  efeito,
  onMudar,
  onApagar,
}: {
  efeito: DefinicaoDeEfeito;
  onMudar: (efeito: DefinicaoDeEfeito) => void;
  onApagar: () => void;
}) {
  const [cor, setCor] = useState<string>(CORES_LAPIS[1] ?? "#f59e0b");
  const mudar = <K extends keyof DefinicaoDeEfeito>(chave: K, valor: DefinicaoDeEfeito[K] | undefined) =>
    onMudar(com(efeito, chave, valor));

  const figura = efeito.figura ?? {};
  const mudarFigura = <K extends keyof FiguraDoEfeito>(chave: K, valor: FiguraDoEfeito[K] | undefined) => {
    const nova = com(figura, chave, valor);
    mudar("figura", Object.keys(nova).length > 0 ? nova : undefined);
  };

  return (
    <div className="@container space-y-3">
      <div className="grid gap-3 @lg:grid-cols-[14rem_1fr]">
        <div className="space-y-2 @lg:sticky @lg:top-0 @lg:self-start">
          <Previa efeito={efeito} cor={cor} />
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground mr-1 text-[11px]">Cor da condição</span>
            {CORES_LAPIS.map((opcao) => (
              <button
                key={opcao}
                type="button"
                aria-label={`Prévia na cor ${opcao}`}
                aria-pressed={cor === opcao}
                className={cn(
                  "size-5 rounded-full border-2",
                  cor === opcao ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: opcao }}
                onClick={() => setCor(opcao)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid gap-2 @sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs">Nome</span>
              <Input
                value={efeito.titulo}
                maxLength={40}
                onChange={(evento) => mudar("titulo", evento.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs">Dica</span>
              <Input
                value={efeito.dica ?? ""}
                maxLength={120}
                placeholder="Uma linha, embaixo do seletor"
                onChange={(evento) => mudar("dica", evento.target.value || undefined)}
              />
            </label>
          </div>

          <Secao titulo="Na figura" descricao="O que acontece com a própria figura.">
            <Interruptor rotulo="Halo atrás" valor={Boolean(figura.halo)} onMudar={(v) => mudarFigura("halo", v || undefined)} />
            <Interruptor
              rotulo="Cor por cima"
              valor={typeof figura.tinta === "number"}
              onMudar={(v) => mudarFigura("tinta", v ? 0.5 : undefined)}
            />
            {typeof figura.tinta === "number" ? (
              <Faixa rotulo="Força da cor" valor={figura.tinta} min={0.05} max={1} passo={0.05} porcento onMudar={(v) => mudarFigura("tinta", v)} />
            ) : null}
            <Interruptor rotulo="Cinza e escura" valor={Boolean(figura.cinza)} onMudar={(v) => mudarFigura("cinza", v || undefined)} />
            <Interruptor rotulo="Meio transparente" valor={Boolean(figura.translucido)} onMudar={(v) => mudarFigura("translucido", v || undefined)} />
            <Interruptor rotulo="Tremendo" valor={Boolean(figura.tremor)} onMudar={(v) => mudarFigura("tremor", v || undefined)} />
          </Secao>

          <SecaoDoExterno externo={efeito.externo} onMudar={(externo) => mudar("externo", externo)} />
          <SecaoDasParticulas particulas={efeito.particulas} onMudar={(p) => mudar("particulas", p)} />
          <SecaoDaLuz luz={efeito.luz} onMudar={(luz) => mudar("luz", luz)} />

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive h-7 text-xs"
            onClick={onApagar}
          >
            <Trash2 />
            Apagar efeito
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- as camadas ----------------------------------------------------------------

function SecaoDoExterno({
  externo,
  onMudar,
}: {
  externo: ExternoDoEfeito | undefined;
  onMudar: (externo: ExternoDoEfeito | undefined) => void;
}) {
  const ligado = externo !== undefined;
  const e = externo ?? { imagem: "" };
  const mudar = <K extends keyof ExternoDoEfeito>(chave: K, valor: ExternoDoEfeito[K] | undefined) =>
    onMudar(com(e, chave, valor));
  const animacao = e.animacao;
  const mudarAnimacao = <K extends keyof AnimacaoDoEfeito>(chave: K, valor: AnimacaoDoEfeito[K]) =>
    animacao && mudar("animacao", { ...animacao, [chave]: valor });

  return (
    <Secao
      titulo="Imagem em volta"
      descricao="Uma imagem atrás ou na frente da figura: o fogo, a fumaça, o círculo."
      ligado={ligado}
      onLigar={(v) => onMudar(v ? { imagem: "" } : undefined)}
    >
      <ImagemDoAcervo rotulo="Imagem" assetId={e.imagem || undefined} onMudar={(id) => mudar("imagem", id ?? "")} />
      {/* `comFps`: o externo toca sempre em laço, e a grade sai com a velocidade. */}
      <Quadros
        quadros={e.quadros}
        onMudar={(q) => mudar("quadros", q as QuadrosDoEfeito | undefined)}
        comFps
      />
      <Faixa rotulo="Tamanho" valor={e.tamanho ?? 1.5} min={0.25} max={2} passo={0.05} sufixo="×" onMudar={(v) => mudar("tamanho", v)} />
      <Escolha
        rotulo="Lado"
        valor={e.lado ?? "atras"}
        opcoes={[
          { valor: "atras", rotulo: "Atrás" },
          { valor: "frente", rotulo: "Na frente" },
        ]}
        onMudar={(v) => mudar("lado", v === "atras" ? undefined : v)}
      />
      <Escolha
        rotulo="Cresce de"
        valor={e.ancora ?? "centro"}
        opcoes={[
          { valor: "centro", rotulo: "Centro" },
          { valor: "base", rotulo: "Pés" },
          { valor: "topo", rotulo: "Cabeça" },
        ]}
        onMudar={(v) => mudar("ancora", v === "centro" ? undefined : v)}
      />
      <Faixa rotulo="Opacidade" valor={e.opacidade ?? 1} min={0.05} max={1} passo={0.05} porcento onMudar={(v) => mudar("opacidade", v >= 1 ? undefined : v)} />
      <Interruptor
        rotulo="Pintar na cor da condição"
        dica="A imagem em tons de cinza ganha a cor da condição: o mesmo fogo vira azul ou verde."
        valor={e.cores === "condicao"}
        onMudar={(v) => mudar("cores", v ? "condicao" : undefined)}
      />
      <ImagemDoAcervo
        rotulo="Máscara"
        dica="Tons de cinza: o claro deixa a imagem aparecer, o escuro apaga."
        assetId={e.mascara}
        onMudar={(id) => mudar("mascara", id)}
      />
      <ImagemDoAcervo
        rotulo="Profundidade"
        dica="Tons de cinza: o claro passa na frente da figura, o escuro fica atrás."
        assetId={e.profundidade}
        onMudar={(id) => mudar("profundidade", id)}
      />
      <Escolha
        rotulo="Movimento"
        valor={animacao?.tipo ?? "nenhum"}
        opcoes={[
          { valor: "nenhum", rotulo: "Parada" },
          { valor: "pulsar", rotulo: "Pulsar" },
          { valor: "girar", rotulo: "Girar" },
          { valor: "flutuar", rotulo: "Flutuar" },
          { valor: "piscar", rotulo: "Piscar" },
        ]}
        onMudar={(v) =>
          mudar("animacao", v === "nenhum" ? undefined : { ...(animacao ?? {}), tipo: v as AnimacaoDoEfeito["tipo"] })
        }
      />
      {animacao ? (
        <>
          <Faixa rotulo="Ciclo" valor={animacao.periodo ?? 2} min={0.2} max={10} passo={0.1} sufixo=" s" onMudar={(v) => mudarAnimacao("periodo", v)} />
          <Faixa rotulo="Intensidade" valor={animacao.intensidade ?? 0.5} min={0} max={1} passo={0.05} porcento onMudar={(v) => mudarAnimacao("intensidade", v)} />
        </>
      ) : null}
    </Secao>
  );
}

function SecaoDasParticulas({
  particulas,
  onMudar,
}: {
  particulas: ParticulasDoEfeito | undefined;
  onMudar: (particulas: ParticulasDoEfeito | undefined) => void;
}) {
  const p = particulas ?? { quantidade: 8 };
  const mudar = <K extends keyof ParticulasDoEfeito>(chave: K, valor: ParticulasDoEfeito[K] | undefined) =>
    onMudar(com(p, chave, valor));
  const emissor = p.emissor ?? {};
  const mudarEmissor = <K extends keyof NonNullable<ParticulasDoEfeito["emissor"]>>(
    chave: K,
    valor: NonNullable<ParticulasDoEfeito["emissor"]>[K],
  ) => mudar("emissor", { ...emissor, [chave]: valor });

  return (
    <Secao
      titulo="Partículas"
      descricao="O que a figura solta: a fagulha, a gota, a cinza."
      ligado={particulas !== undefined}
      onLigar={(v) => onMudar(v ? { quantidade: 8 } : undefined)}
    >
      <Faixa rotulo="Quantidade" valor={p.quantidade} min={1} max={24} passo={1} onMudar={(v) => mudar("quantidade", v)} />
      <Faixa rotulo="Tamanho" valor={p.tamanho ?? 0.06} min={0.01} max={0.5} passo={0.01} porcento onMudar={(v) => mudar("tamanho", v)} />
      <Faixa rotulo="Variação do tamanho" valor={p.variacao ?? 0.5} min={0} max={1} passo={0.05} porcento onMudar={(v) => mudar("variacao", v)} />
      <Faixa rotulo="Direção" valor={p.direcao ?? 270} min={0} max={359} passo={1} sufixo="°" onMudar={(v) => mudar("direcao", v)} />
      <Faixa rotulo="Abertura" valor={p.abertura ?? 40} min={0} max={360} passo={1} sufixo="°" onMudar={(v) => mudar("abertura", v)} />
      <Faixa rotulo="Velocidade" valor={p.velocidade ?? 1} min={0} max={5} passo={0.05} sufixo=" fig/s" onMudar={(v) => mudar("velocidade", v)} />
      <Faixa rotulo="Vida" valor={p.vida ?? 1.5} min={0.3} max={6} passo={0.1} sufixo=" s" onMudar={(v) => mudar("vida", v)} />
      <Faixa rotulo="Largura de onde nascem" valor={emissor.largura ?? 0.8} min={0} max={2} passo={0.05} porcento onMudar={(v) => mudarEmissor("largura", v)} />
      <Faixa rotulo="Altura de onde nascem" valor={emissor.altura ?? 0.3} min={0} max={2} passo={0.05} porcento onMudar={(v) => mudarEmissor("altura", v)} />
      <Escolha
        rotulo="Nascem em"
        valor={emissor.ancora ?? "base"}
        opcoes={[
          { valor: "base", rotulo: "Pés" },
          { valor: "centro", rotulo: "Centro" },
          { valor: "topo", rotulo: "Cabeça" },
        ]}
        onMudar={(v) => mudarEmissor("ancora", v as "base" | "centro" | "topo")}
      />
      <ImagemDoAcervo
        rotulo="Imagem da partícula"
        dica="Sem imagem, é um brilho redondo na cor da condição."
        assetId={p.imagem}
        onMudar={(id) => mudar("imagem", id)}
      />
      {p.imagem ? (
        <>
          <Interruptor
            rotulo="Pintar na cor da condição"
            dica="A imagem vira só a forma, na cor da condição."
            valor={Boolean(p.pintar)}
            onMudar={(v) => mudar("pintar", v || undefined)}
          />
          <Faixa rotulo="Giro na vida" valor={p.giro ?? 0} min={-720} max={720} passo={10} sufixo="°" onMudar={(v) => mudar("giro", v || undefined)} />
          <Quadros quadros={p.quadros} onMudar={(q) => mudar("quadros", q)} />
        </>
      ) : null}
    </Secao>
  );
}

function SecaoDaLuz({
  luz,
  onMudar,
}: {
  luz: LuzDoEfeito | undefined;
  onMudar: (luz: LuzDoEfeito | undefined) => void;
}) {
  const l = luz ?? { raio: 2.5 };
  const mudar = <K extends keyof LuzDoEfeito>(chave: K, valor: LuzDoEfeito[K] | undefined) =>
    onMudar(com(l, chave, valor));

  return (
    <Secao
      titulo="Luz"
      descricao="A figura clareia em volta, e as paredes tapam. Num mapa sem escuro, é um véu da cor."
      ligado={luz !== undefined}
      onLigar={(v) => onMudar(v ? { raio: 2.5 } : undefined)}
    >
      <Faixa rotulo="Alcance" valor={l.raio} min={0.5} max={10} passo={0.1} sufixo="× a figura" onMudar={(v) => mudar("raio", v)} />
      <Faixa rotulo="Intensidade" valor={l.intensidade ?? 1} min={0.05} max={1} passo={0.05} porcento onMudar={(v) => mudar("intensidade", v >= 1 ? undefined : v)} />
      <Escolha
        rotulo="Movimento"
        valor={l.efeito ?? "fixa"}
        opcoes={[
          { valor: "fixa", rotulo: "Fixa" },
          { valor: "fogo", rotulo: "Fogo" },
          { valor: "pulsando", rotulo: "Pulsando" },
          { valor: "piscando", rotulo: "Piscando" },
        ]}
        onMudar={(v) => mudar("efeito", v === "fixa" ? undefined : (v as LuzDoEfeito["efeito"]))}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">Cor</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={!l.cor}
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[11px]",
              !l.cor ? "bg-muted border-foreground/30" : "border-transparent",
            )}
            onClick={() => mudar("cor", undefined)}
          >
            Da condição
          </button>
          {CORES_LAPIS.map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-label={`Luz na cor ${opcao}`}
              aria-pressed={l.cor === opcao}
              className={cn(
                "size-5 rounded-full border-2",
                l.cor === opcao ? "border-foreground" : "border-transparent",
              )}
              style={{ backgroundColor: opcao }}
              onClick={() => mudar("cor", opcao)}
            />
          ))}
        </div>
      </div>
    </Secao>
  );
}

// --- a prévia ------------------------------------------------------------------

/**
 * O efeito numa figura de amostra, sobre o escuro do mapa à noite. O mesmo
 * `FiguraComEfeitos` do palco -- a prévia não mente sobre a mesa. A luz, que
 * lá é a camada da cena, aqui é um brilho na cor dela, do tamanho do alcance.
 */
function Previa({ efeito, cor }: { efeito: DefinicaoDeEfeito; cor: string }) {
  const pedidos = useMemo(() => [{ efeito: efeito.id, cor }], [efeito.id, cor]);
  const lado = 88;
  const luz = efeito.luz;
  const raioDaLuz = luz ? Math.min(Math.max(luz.raio, 0.5), 10) * lado : 0;

  return (
    <div className="relative h-60 w-full overflow-hidden rounded-md bg-neutral-950">
      {luz ? (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 rounded-full"
          style={{
            bottom: 24 + lado / 2 - raioDaLuz,
            width: raioDaLuz * 2,
            height: raioDaLuz * 2,
            transform: "translateX(-50%)",
            background: `radial-gradient(circle, ${luz.cor ?? cor}55 0%, transparent 70%)`,
            opacity: luz.intensidade ?? 1,
          }}
        />
      ) : null}
      <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 24, width: lado, height: lado }}>
        {/* O declarativo do Mestre por perto: é por ele que o efeito da
            campanha chega ao `FiguraComEfeitos`, como no palco. */}
        <DeclarativoDoMestre>
          <FiguraComEfeitos
            efeitos={pedidos}
            url={amostra.src}
            semente="previa-do-efeito"
            alcance={{ livre: true, largura: lado }}
          >
            {(fonte) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fonte ?? amostra.src}
                alt=""
                draggable={false}
                className="absolute inset-0 size-full select-none"
              />
            )}
          </FiguraComEfeitos>
        </DeclarativoDoMestre>
      </div>
    </div>
  );
}

// --- os controles --------------------------------------------------------------

function Secao({
  titulo,
  descricao,
  ligado,
  onLigar,
  children,
}: {
  titulo: string;
  descricao: string;
  /** Ausente = a seção sempre aberta, sem interruptor. */
  ligado?: boolean;
  onLigar?: (ligado: boolean) => void;
  children: ReactNode;
}) {
  const aberta = ligado ?? true;

  return (
    <section className="space-y-2 rounded-md border p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium">{titulo}</p>
          <p className="text-muted-foreground text-[11px] leading-snug">{descricao}</p>
        </div>
        {onLigar ? (
          <Switch size="sm" aria-label={titulo} checked={aberta} onCheckedChange={onLigar} />
        ) : null}
      </div>
      {aberta ? <div className="space-y-2">{children}</div> : null}
    </section>
  );
}

function Interruptor({
  rotulo,
  dica,
  valor,
  onMudar,
}: {
  rotulo: string;
  dica?: string;
  valor: boolean;
  onMudar: (valor: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs" title={dica}>
        {rotulo}
      </span>
      <Switch size="sm" checked={valor} onCheckedChange={onMudar} />
    </label>
  );
}

function Faixa({
  rotulo,
  valor,
  min,
  max,
  passo,
  sufixo = "",
  porcento = false,
  onMudar,
}: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  passo: number;
  sufixo?: string;
  /** Mostra a fração como porcentagem. */
  porcento?: boolean;
  onMudar: (valor: number) => void;
}) {
  const texto = porcento ? `${Math.round(valor * 100)}%` : `${Number(valor.toFixed(2))}${sufixo}`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">{rotulo}</span>
        <span className="text-muted-foreground text-[10px] tabular-nums">{texto}</span>
      </div>
      <Slider
        aria-label={rotulo}
        value={[valor]}
        min={min}
        max={max}
        step={passo}
        onValueChange={(novo) => {
          const numero = Array.isArray(novo) ? novo[0] : novo;
          if (typeof numero === "number") onMudar(numero);
        }}
      />
    </div>
  );
}

function Escolha<T extends string>({
  rotulo,
  valor,
  opcoes,
  onMudar,
}: {
  rotulo: string;
  valor: T;
  opcoes: ReadonlyArray<{ valor: T; rotulo: string }>;
  onMudar: (valor: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-1">
      <span className="text-xs">{rotulo}</span>
      <div className="flex flex-wrap gap-0.5">
        {opcoes.map((opcao) => (
          <Button
            key={opcao.valor}
            variant={valor === opcao.valor ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={valor === opcao.valor}
            className="h-6 px-1.5 text-[11px]"
            onClick={() => onMudar(opcao.valor)}
          >
            {opcao.rotulo}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * A grade de quadros de uma imagem: ligada, ela vira animação quadro a quadro.
 * `comFps` é o externo, que toca sempre em laço. Sem ele é a partícula, que
 * pode tocar em laço ou uma vez ao longo da vida -- a fagulha que acende e
 * apaga --, e é a velocidade ausente que diz "uma vez".
 */
function Quadros({
  quadros,
  onMudar,
  comFps = false,
}: {
  quadros: { colunas: number; total: number; fps?: number } | undefined;
  onMudar: (quadros: QuadrosDoEfeito | { colunas: number; total: number } | undefined) => void;
  comFps?: boolean;
}) {
  const colunas = quadros?.colunas ?? 4;
  const total = quadros?.total ?? 8;
  const fps = quadros?.fps;
  const emLaco = comFps || fps !== undefined;
  const linhasCheias = total % colunas === 0;
  const grade = (patch: { colunas?: number; total?: number; fps?: number | undefined }) => {
    const nova = { colunas, total, ...(emLaco ? { fps: fps ?? 12 } : {}), ...patch };
    if (nova.fps === undefined) delete nova.fps;
    onMudar(nova as QuadrosDoEfeito);
  };

  return (
    <div className="space-y-2">
      <Interruptor
        rotulo="Animada (grade de quadros)"
        dica="A imagem é uma grade de quadros, tocados em ordem, da esquerda para a direita e de cima para baixo."
        valor={quadros !== undefined}
        onMudar={(v) =>
          onMudar(v ? { colunas, total, ...(comFps ? { fps: 12 } : {}) } : undefined)
        }
      />
      {quadros ? (
        <div className="flex flex-wrap items-end gap-2">
          <Numero rotulo="Colunas" valor={colunas} min={1} max={16} onMudar={(v) => grade({ colunas: v })} />
          <Numero rotulo="Quadros" valor={total} min={1} max={64} onMudar={(v) => grade({ total: v })} />
          {emLaco ? (
            <Numero rotulo="Por segundo" valor={fps ?? 12} min={1} max={60} onMudar={(v) => grade({ fps: v })} />
          ) : null}
          {!comFps ? (
            <div className="w-full">
              <Interruptor
                rotulo="Em laço"
                dica="Ligado, a grade toca sem parar. Desligado, uma vez ao longo da vida da partícula."
                valor={emLaco}
                onMudar={(v) => grade({ fps: v ? 12 : undefined })}
              />
            </div>
          ) : null}
          {!linhasCheias ? (
            <p className="text-destructive w-full text-[10px]">
              O total tem de encher as linhas: um múltiplo de {colunas}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  min,
  max,
  onMudar,
}: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  onMudar: (valor: number) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-muted-foreground text-[10px]">{rotulo}</span>
      <NumberField
        className="h-7"
        value={valor}
        min={min}
        max={max}
        onValueChange={(novo) => {
          if (novo !== null) onMudar(Math.round(novo));
        }}
      />
    </label>
  );
}

/**
 * Uma imagem do acervo: a miniatura, o botão de escolher e o de tirar. O
 * arquivo entra marcado como do EFEITO, e a biblioteca de imagens do mapa não
 * o lista -- a mesma regra do fundo de cena.
 */
function ImagemDoAcervo({
  rotulo,
  dica,
  assetId,
  onMudar,
}: {
  rotulo: string;
  dica?: string;
  assetId: string | undefined;
  onMudar: (assetId: string | undefined) => void;
}) {
  const url = useAssetUrl(assetId, "mini");

  async function escolher() {
    const resultado = await importAssets("image", "efeito");
    const primeiro = resultado?.aceitos[0];
    if (primeiro) onMudar(primeiro.id);
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs" title={dica}>
        {rotulo}
      </span>
      <div className="flex items-center gap-1">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-7 rounded border bg-neutral-900 object-cover" />
        ) : null}
        <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => void escolher()}>
          <ImagePlus />
          {assetId ? "Trocar" : "Escolher"}
        </Button>
        {assetId ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Tirar ${rotulo.toLowerCase()}`}
            onClick={() => onMudar(undefined)}
          >
            <X />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
