"use client";

import { Sparkles, Wrench } from "lucide-react";

import { VERSOES, versaoAtual, type Mudanca, type Versao } from "@/lib/versoes";

/**
 * O que mudou, em dois lugares e com a mesma voz.
 *
 * Na PORTA, só a versão que está rodando: quem abriu o aplicativo quer jogar, e
 * o histórico inteiro ali seria uma parede de texto entre ele e a campanha.
 *
 * Nas CONFIGURAÇÕES, tudo: é onde se vai quando a pergunta é "em que versão
 * entrou aquilo?", e essa pergunta não tem hora marcada.
 *
 * Um arquivo para os dois porque a linha de mudança se desenha igual nos dois
 * lugares — e duas cópias divergem na primeira vez que uma delas ganhar um
 * ícone novo.
 */

/** A data em `AAAA-MM-DD` escrita como quem fala. */
function dataLegivel(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return iso;

  return `${dia}/${mes}/${ano}`;
}

function LinhaDeMudanca({ mudanca }: { mudanca: Mudanca }) {
  // Ícone e não etiqueta de texto: "NOVIDADE" e "CORREÇÃO" repetidos em cada
  // linha viram uma coluna de ruído maiúsculo, e o que se quer distinguir cabe
  // num símbolo.
  const Icone = mudanca.tipo === "novidade" ? Sparkles : Wrench;

  return (
    <li className="flex gap-2.5">
      <Icone
        className={
          mudanca.tipo === "novidade"
            ? "text-primary mt-0.5 size-3.5 shrink-0"
            : "text-muted-foreground mt-0.5 size-3.5 shrink-0"
        }
        aria-hidden
      />
      <span className="min-w-0">
        <span className="text-foreground text-sm">{mudanca.titulo}</span>
        {mudanca.detalhe ? (
          <span className="text-muted-foreground block text-xs leading-relaxed">
            {mudanca.detalhe}
          </span>
        ) : null}
      </span>
    </li>
  );
}

function ListaDeMudancas({ versao }: { versao: Versao }) {
  return (
    <ul className="flex flex-col gap-2">
      {versao.mudancas.map((mudanca) => (
        <LinhaDeMudanca key={mudanca.titulo} mudanca={mudanca} />
      ))}
    </ul>
  );
}

/**
 * As novidades da versão que está rodando, para a porta.
 *
 * Sem estado de "já vi": a escolha foi deixá-la sempre à mostra, e um bloco que
 * some depois da primeira leitura precisaria de uma preferência gravada para
 * uma tela que já é a menos concorrida do aplicativo.
 *
 * Não desenha nada quando a lista está vazia -- o que só acontece se alguém
 * esvaziar `VERSOES`, e aí um espaço em branco é melhor que uma moldura vazia.
 */
export function NovidadesDaVersao() {
  const versao = versaoAtual();
  if (!versao) return null;

  return (
    <section
      aria-label={`Novidades da versão ${versao.versao}`}
      className="bg-muted/30 flex flex-col gap-3 rounded-lg border p-4"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">
          Novidades da versão {versao.versao}
        </h2>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {dataLegivel(versao.data)}
        </span>
      </header>

      <ListaDeMudancas versao={versao} />

      {/* Diz onde está o resto em vez de abrir o histórico aqui: a porta é para
          entrar na mesa, e uma lista que cresce a cada versão empurraria os
          botões para fora da vista em alguns meses. */}
      <p className="text-muted-foreground text-xs">
        O histórico completo fica em Configurações.
      </p>
    </section>
  );
}

/**
 * Todas as versões, para as Configurações.
 *
 * A lista termina na versão que está rodando, e isso é uma propriedade e não
 * uma falta: ela viaja dentro do pacote. Ver `lib/versoes`.
 */
export function HistoricoDeVersoes() {
  return (
    <div className="flex flex-col gap-5">
      {VERSOES.map((versao) => (
        <section key={versao.versao} className="flex flex-col gap-2">
          <header className="flex items-baseline gap-2">
            <h3 className="text-sm font-medium tabular-nums">
              {versao.versao}
            </h3>
            <span className="text-muted-foreground text-xs tabular-nums">
              {dataLegivel(versao.data)}
            </span>
          </header>

          <ListaDeMudancas versao={versao} />
        </section>
      ))}
    </div>
  );
}
