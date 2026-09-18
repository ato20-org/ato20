"use client";

import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChevronRight, ExternalLink, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";

import { ChromeButton } from "@/components/desktop/window-chrome";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { VERSOES, type Mudanca } from "@/lib/versoes";

/** A página de releases do repositório. Permitida em `capabilities/default.json`. */
const RELEASES_URL = "https://github.com/ato20-org/ato20/releases";

/**
 * O que mudou, em dois lugares e com a mesma voz.
 *
 * Na PORTA, numa coluna à direita: o histórico inteiro, da versão que está
 * rodando para trás. Já foi só a versão corrente, e o motivo era o lugar — no
 * meio da coluna única, uma lista que cresce a cada versão empurrava os botões
 * para fora da vista. Numa coluna própria, com rolagem própria, ela não empurra
 * nada, e aí não havia mais razão para esconder o resto.
 *
 * Nas CONFIGURAÇÕES, tudo também: é onde se vai quando a pergunta é "em que
 * versão entrou aquilo?", e essa pergunta não tem hora marcada — inclusive com
 * a campanha aberta, que é quando a porta não está à mão.
 *
 * Um arquivo para os dois porque a linha de mudança se desenha igual nos dois
 * lugares — e duas cópias divergem na primeira vez que uma delas ganhar um
 * ícone novo.
 *
 * ## Por que quase tudo começa fechado
 *
 * A 0.0.4 trouxe treze mudanças, e com ela os dois lugares viraram parede de
 * texto: cada linha despejava o `detalhe` junto do título, e as versões velhas
 * despejavam as delas embaixo. Medido no arquivo da 0.0.4, os detalhes são 75%
 * dos caracteres — 2.903 de 3.885. O título sozinho é o que se LÊ correndo o
 * olho; o detalhe é o que se lê quando aquela linha específica interessa.
 *
 * Daí a regra: título sempre à vista, detalhe a um clique, versão anterior a um
 * clique. Nada é escondido — tudo continua alcançável sem sair da tela.
 */

/** A data em `AAAA-MM-DD` escrita como quem fala. */
function dataLegivel(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return iso;

  return `${dia}/${mes}/${ano}`;
}

/** "1 correção", "8 correções" — o plural é do português, não do `+ "s"`. */
function contar(quantos: number, singular: string, plural: string): string {
  return `${quantos} ${quantos === 1 ? singular : plural}`;
}

/**
 * Uma versão já separada em novidades e correções, com a data e o resumo
 * prontos.
 *
 * A separação por tipo é o que substituiu a fileira de ícones alternados: numa
 * lista de treze, `Sparkles` e `Wrench` se intercalando não formam grupo
 * nenhum, e quem só quer saber o que foi CONSERTADO tinha de ler tudo para
 * achar as linhas de chave inglesa.
 */
type VersaoPronta = {
  versao: string;
  data: string;
  novidades: Mudanca[];
  correcoes: Mudanca[];
  /** "5 novidades · 8 correções", para a linha fechada dizer o que tem dentro. */
  resumo: string;
};

/**
 * Preparado UMA vez, na carga do módulo, e não a cada `render`.
 *
 * `VERSOES` é constante — viaja dentro do pacote e não muda em tempo de
 * execução —, então filtrar, contar e formatar data por render seria refazer
 * para sempre um trabalho cuja resposta já se sabe. Aqui custa uma passada na
 * importação e zero depois, inclusive ao abrir e fechar cada linha.
 */
const VERSOES_PRONTAS: VersaoPronta[] = VERSOES.map((versao) => {
  const novidades = versao.mudancas.filter((m) => m.tipo === "novidade");
  const correcoes = versao.mudancas.filter((m) => m.tipo === "correcao");

  const partes: string[] = [];
  if (novidades.length > 0) {
    partes.push(contar(novidades.length, "novidade", "novidades"));
  }
  if (correcoes.length > 0) {
    partes.push(contar(correcoes.length, "correção", "correções"));
  }

  return {
    versao: versao.versao,
    data: dataLegivel(versao.data),
    novidades,
    correcoes,
    resumo: partes.join(" · "),
  };
});

/** A seta que gira, e que é o único aviso de que a linha abre. */
function Seta({ aberto, className }: { aberto: boolean; className?: string }) {
  return (
    <ChevronRight
      className={cn(
        "text-muted-foreground/60 size-3.5 shrink-0 transition-transform duration-150",
        aberto && "rotate-90",
        className,
      )}
      aria-hidden
    />
  );
}

/**
 * Uma mudança: o título à vista, o detalhe a um clique.
 *
 * Quem não tem detalhe não vira botão. Um botão que não faz nada ao ser
 * clicado é pior que texto: ele promete alguma coisa e o clique é engolido.
 */
function LinhaDeMudanca({ mudanca }: { mudanca: Mudanca }) {
  const [aberto, setAberto] = useState(false);

  // Ícone e não etiqueta de texto: "NOVIDADE" e "CORREÇÃO" repetidos em cada
  // linha viram uma coluna de ruído maiúsculo, e o que se quer distinguir cabe
  // num símbolo. Ele sobrevive ao agrupamento por tipo porque a lista aberta de
  // uma versão antiga aparece longe do seu cabeçalho.
  const Icone = mudanca.tipo === "novidade" ? Sparkles : Wrench;
  const corDoIcone =
    mudanca.tipo === "novidade" ? "text-primary" : "text-muted-foreground";

  if (!mudanca.detalhe) {
    return (
      <li className="flex gap-2.5 px-1.5 py-1">
        <Icone className={cn(corDoIcone, "mt-0.5 size-3.5 shrink-0")} aria-hidden />
        <span className="text-foreground text-sm">{mudanca.titulo}</span>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((estava) => !estava)}
        className="hover:bg-muted/40 focus-visible:ring-ring/50 flex w-full gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors outline-none focus-visible:ring-3"
      >
        <Icone className={cn(corDoIcone, "mt-0.5 size-3.5 shrink-0")} aria-hidden />
        <span className="text-foreground min-w-0 flex-1 text-sm">
          {mudanca.titulo}
        </span>
        <Seta aberto={aberto} className="mt-0.5" />
      </button>

      {/* Montado só quando aberto, e não escondido com `hidden`: o detalhe é
          75% do texto deste arquivo, e o que não está aberto não precisa
          existir no documento para ser alcançado. */}
      {aberto ? (
        <p className="text-muted-foreground px-1.5 pb-1.5 pl-[1.625rem] text-xs leading-relaxed">
          {mudanca.detalhe}
        </p>
      ) : null}
    </li>
  );
}

/** Um bloco de um tipo só, com o nome dele em cima. */
function GrupoDeMudancas({
  titulo,
  mudancas,
}: {
  titulo: string;
  mudancas: Mudanca[];
}) {
  if (mudancas.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5">
      <h4 className="text-muted-foreground/80 px-1.5 text-[0.65rem] font-medium tracking-wide uppercase">
        {titulo}
      </h4>
      <ul className="flex flex-col">
        {mudancas.map((mudanca) => (
          <LinhaDeMudanca key={mudanca.titulo} mudanca={mudanca} />
        ))}
      </ul>
    </div>
  );
}

/** As duas metades de uma versão, na ordem em que interessam. */
function MudancasDaVersao({ versao }: { versao: VersaoPronta }) {
  return (
    <div className="flex flex-col gap-3">
      <GrupoDeMudancas titulo="Novidades" mudancas={versao.novidades} />
      <GrupoDeMudancas titulo="Correções" mudancas={versao.correcoes} />
    </div>
  );
}

/**
 * Uma versão anterior, fechada: número, o que tem dentro, e a data.
 *
 * O resumo é o que torna o fechado utilizável. Uma pilha de números sozinhos
 * obrigaria a abrir uma por uma para descobrir qual delas tem o conserto que se
 * procura; "1 correção" já responde por quase todas.
 *
 * As mudanças só são MONTADAS ao abrir. É o que mantém esta coluna do mesmo
 * tamanho na versão 0.0.4 e na 0.5.0: sem isso, cada release publicada somava
 * DOM permanente às duas telas, para sempre e sem ninguém pedir.
 */
function VersaoAnterior({ versao }: { versao: VersaoPronta }) {
  const [aberto, setAberto] = useState(false);

  return (
    <section>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((estava) => !estava)}
        className="hover:bg-muted/40 focus-visible:ring-ring/50 flex w-full items-baseline gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors outline-none focus-visible:ring-3"
      >
        <Seta aberto={aberto} className="self-center" />
        <span className="text-foreground text-sm font-medium tabular-nums">
          {versao.versao}
        </span>
        <span className="text-muted-foreground min-w-0 truncate text-xs">
          {versao.resumo}
        </span>
        <span className="text-muted-foreground/70 ml-auto shrink-0 text-xs tabular-nums">
          {versao.data}
        </span>
      </button>

      {aberto ? (
        <div className="pt-1 pb-2 pl-[1.375rem]">
          <MudancasDaVersao versao={versao} />
        </div>
      ) : null}
    </section>
  );
}

/**
 * "O que mudou", no botão ao lado das Configurações.
 *
 * Era uma coluna fixa na porta, ao lado da lista de campanhas. Saiu de lá por
 * duas razões: a coluna disputava largura com a lista, que é o que a pessoa
 * veio fazer; e as novidades interessam UMA vez por versão, não a cada
 * abertura. Um botão na barra da janela fica alcançável de qualquer tela --
 * porta, mesa, erro -- e fora do caminho o resto do tempo.
 *
 * O link para as releases no GitHub mora aqui e não nas Configurações: quem
 * está lendo o que mudou é quem quer ver o que vem, baixar outra versão ou
 * ler a nota completa.
 */
export function NovidadesDialog() {
  // A cabeça da lista é a versão que está rodando -- a mesma que `versaoAtual`
  // devolve, e pela mesma razão, que está documentada lá. Aqui é desmontada em
  // vez de chamada porque o painel precisa das duas metades: a atual e o resto.
  const [atual, ...anteriores] = VERSOES_PRONTAS;
  if (!atual) return null;

  return (
    // `modal="trap-focus"` e `top-8` no fundo pela mesma razao do dialogo das
    // Configuracoes: a barra da janela mora fora do dialogo, e o modal cheio a
    // deixava borrada e com os botoes mortos.
    <Dialog modal="trap-focus">
      <DialogTrigger
        render={
          <ChromeButton
            label="O que mudou"
            icon={<Sparkles className="size-3.5" />}
          />
        }
      />

      <DialogContent
        className="gap-0 p-0 sm:max-w-[min(36rem,calc(100%-2rem))]"
        overlayClassName="top-8"
      >
        <div className="flex h-[min(32rem,80vh)] min-h-0 flex-col">
          {/* `pr-12`: o X do diálogo mora no canto de cima à direita, por cima
              do cabeçalho, e sem a folga a data ficava embaixo dele. */}
          <header className="flex shrink-0 items-baseline gap-2 border-b py-3 pr-12 pl-5">
            <DialogTitle className="text-sm font-medium">O que mudou</DialogTitle>
            <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
              {atual.data}
            </span>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <section className="border-primary/25 bg-primary/5 flex flex-col gap-2.5 rounded-lg border p-2.5">
              <header className="flex items-baseline gap-2 px-1.5">
                <h3 className="text-base font-semibold tabular-nums">
                  {atual.versao}
                </h3>
                <span className="text-muted-foreground text-xs">
                  esta versão
                </span>
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  {atual.resumo}
                </span>
              </header>

              <MudancasDaVersao versao={atual} />
            </section>

            {anteriores.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                <h3 className="text-muted-foreground px-1.5 text-[0.65rem] tracking-wide uppercase">
                  Antes disso
                </h3>

                {anteriores.map((versao) => (
                  <VersaoAnterior key={versao.versao} versao={versao} />
                ))}
              </div>
            ) : null}
          </div>

          {/* Fora da área que rola, para estar sempre à mão. Abre no navegador
              da máquina, e não numa janela do aplicativo: a página do GitHub
              tem download, discussão e histórico, e é lá que se usa. */}
          <footer className="flex shrink-0 justify-end border-t px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void openUrl(RELEASES_URL).catch(() =>
                  toast.error("Não foi possível abrir o navegador."),
                );
              }}
            >
              <ExternalLink />
              Releases no GitHub
            </Button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Todas as versões, para as Configurações.
 *
 * A lista termina na versão que está rodando, e isso é uma propriedade e não
 * uma falta: ela viaja dentro do pacote. Ver `lib/versoes`.
 *
 * Mesmo desenho da porta, e de propósito: a versão corrente aberta, as
 * anteriores em uma linha cada. Aqui a moldura da porta não vem junto -- o
 * título da seção logo acima já diz qual versão está rodando, e repetir o
 * destaque dentro do diálogo era uma caixa colorida dizendo o que a linha de
 * cima já dizia.
 */
export function HistoricoDeVersoes() {
  const [atual, ...anteriores] = VERSOES_PRONTAS;
  if (!atual) return null;

  return (
    <div className="-mx-1.5 flex flex-col gap-4">
      <section className="flex flex-col gap-2.5">
        <header className="flex items-baseline gap-2 px-1.5">
          <h3 className="text-sm font-medium tabular-nums">{atual.versao}</h3>
          <span className="text-muted-foreground text-xs tabular-nums">
            {atual.data}
          </span>
          <span className="text-muted-foreground ml-auto shrink-0 text-xs">
            {atual.resumo}
          </span>
        </header>

        <MudancasDaVersao versao={atual} />
      </section>

      {anteriores.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <h3 className="text-muted-foreground px-1.5 text-[0.65rem] tracking-wide uppercase">
            Antes disso
          </h3>

          {anteriores.map((versao) => (
            <VersaoAnterior key={versao.versao} versao={versao} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
