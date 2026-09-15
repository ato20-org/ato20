"use client";

import { Sparkles, Wrench } from "lucide-react";

import { VERSOES, type Mudanca, type Versao } from "@/lib/versoes";

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
 * As novidades, no painel da direita da porta.
 *
 * Colado na borda da janela e de altura cheia, com a divisa à esquerda -- e não
 * um cartão flutuando no meio do vão. Flutuando ele ficava ancorado na vertical
 * pelo tamanho da lista de campanhas ao lado, o que deixava um vazio grande em
 * cima e outro embaixo e não lia como painel nenhum.
 *
 * A versão que está rodando ganha moldura e a lista completa; as anteriores vêm
 * abaixo, menores e apagadas. Sem essa diferença a coluna era uma pilha de
 * números em que a versão instalada não se distinguia das que já passaram.
 *
 * O `aside` é DAQUI, e não de quem chama: quando `VERSOES` está vazia isto
 * devolve `null` e o painel não existe -- a porta volta a ser uma coluna só. Um
 * `aside` montado do lado de fora continuaria reservando a largura dele para
 * receber nada.
 *
 * Sem estado de "já vi": a escolha foi deixá-lo sempre à mostra, e um painel que
 * some depois da primeira leitura precisaria de uma preferência gravada. Ao
 * lado, e não no meio da coluna, ele não custa nada a quem só veio abrir a
 * campanha.
 */
export function NovidadesLaterais() {
  // A cabeça da lista é a versão que está rodando -- a mesma que `versaoAtual`
  // devolve, e pela mesma razão, que está documentada lá. Aqui é desmontada em
  // vez de chamada porque o painel precisa das duas metades: a atual e o resto.
  const [atual, ...anteriores] = VERSOES;
  if (!atual) return null;

  return (
    <aside
      aria-label="Novidades das versões"
      // `border-t` embaixo de `lg` e `border-l` a partir dele: nessa faixa o
      // painel deixa de ser coluna e vira o rodapé da porta, e a divisa tem de
      // acompanhar o lado por onde ele encosta.
      //
      // Fundo próprio, e não só a divisa: encostado na borda da janela, um
      // painel da mesma cor do fundo lê como um traço solto com texto ao lado.
      className="bg-muted/20 flex shrink-0 flex-col border-t lg:w-80 lg:overflow-hidden lg:border-t-0 lg:border-l"
    >
      {/* O cabeçalho fica FORA da área que rola, e não `sticky` dentro dela:
          grudado por dentro ele precisaria de fundo próprio para tapar o texto
          que passa por baixo, e dois fundos translúcidos empilhados nunca dão a
          mesma cor do painel. Assim o título simplesmente não se move. */}
      <header className="shrink-0 border-b px-5 py-3">
        <h2 className="text-sm font-medium">Novidades</h2>
      </header>

      {/* A rolagem só existe a partir de `lg`, junto com o corte no `aside`:
          empilhado, o painel é o fim da página e rola com ela. */}
      <div className="flex flex-col gap-5 px-5 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <section className="border-primary/25 bg-primary/5 flex flex-col gap-2.5 rounded-lg border p-3">
          <header className="flex items-baseline gap-2">
            <h3 className="text-base font-semibold tabular-nums">
              {atual.versao}
            </h3>
            <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-[0.65rem] font-medium">
              atual
            </span>
            <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
              {dataLegivel(atual.data)}
            </span>
          </header>

          <ListaDeMudancas versao={atual} />
        </section>

        {anteriores.length > 0 ? (
          <div className="flex flex-col gap-4">
            <h3 className="text-muted-foreground text-[0.65rem] tracking-wide uppercase">
              Antes disso
            </h3>

            {anteriores.map((versao) => (
              <section key={versao.versao} className="flex flex-col gap-2">
                <header className="flex items-baseline gap-2">
                  <h4 className="text-muted-foreground text-xs font-medium tabular-nums">
                    {versao.versao}
                  </h4>
                  <span className="text-muted-foreground/70 ml-auto shrink-0 text-[0.65rem] tabular-nums">
                    {dataLegivel(versao.data)}
                  </span>
                </header>

                <ListaDeMudancas versao={versao} />
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
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
