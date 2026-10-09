"use client";

import { ChevronRight, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { lancarNoVidro } from "@/components/jogador/dados-na-tela";
import { DadoParado } from "@/components/playground/dado-parado";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { achadosNosDetalhes } from "@/lib/busca-nos-detalhes";
import { t } from "@/lib/i18n/jogador";
import { recusaPorMesaCheia } from "@/lib/mesa-cheia";
import { normaliza } from "@/lib/search";
import {
  lerExpressaoDeRolagem,
  textoDaExpressao,
  textoDoModificador,
  type ExpressaoDeRolagem,
} from "@/lib/mestre/expressao-de-rolagem";
import {
  detalhesDoPersonagem,
  rolarDetalhe,
  type DetalheDoJogador,
  type FichaDeDetalhes,
} from "@/lib/player/detalhes";
import { useFichasVersaoStore } from "@/lib/store/use-fichas-versao-store";
import { cn } from "@/lib/utils";
import { rotulosDoDado } from "@/types/dado";
import { doGrupo, gruposDaFicha, type GrupoDeDetalhes } from "@/types/detalhe";

/** Quantos dados de um termo se desenham antes do "×N". Como na ficha do Mestre. */
const DADOS_A_VISTA = 5;

/**
 * Os detalhes da ficha no celular: Identidade, Combate, Poderes.
 *
 * Um grupo por seção, na ordem da ficha do Mestre (`gruposDaFicha`), e só os
 * que têm o que mostrar: o grupo vazio do molde é onde o "+" do Mestre mora, e
 * aqui não há "+". Devolve as seções SOLTAS, sem embrulho, para cada uma ser um
 * item da pilha do cartão e ganhar a linha entre ela e a vizinha.
 *
 * Só leitura, como os medidores: quem escreve a ficha é o mestre. O que o
 * jogador faz aqui é ROLAR o detalhe que o molde liga -- e quem sorteia é o
 * daemon. Ver `rolarDetalhe`.
 */
export function DetalhesDoJogador({
  codigo,
  personagemId,
  busca = "",
  abas = false,
  topoDasAbas = 53,
}: {
  codigo: string;
  personagemId: string;
  /**
   * O que o jogador procura, já sem acento nem caixa (`normaliza`). Vazio =
   * tudo. Casa no rótulo, no valor e na descrição -- e no nome do grupo, que é
   * como "perícias" traz a lista inteira.
   */
  busca?: string;
  /**
   * Em ABAS: uma por grupo, presas logo abaixo da busca, e só o grupo da aba
   * escolhida embaixo. É o cartão da aba Personagem e do painel da ficha: com
   * trinta perícias numa coluna, o Combate ficava a três rolagens do topo. Com
   * busca, as abas saem e os achados de todos os grupos aparecem juntos.
   */
  abas?: boolean;
  /**
   * Onde as abas prendem, em px do topo da rolagem: logo abaixo da busca do
   * cartão (53px), ou no topo mesmo quando o cartão vem sem ela.
   */
  topoDasAbas?: number;
}) {
  const [ficha, setFicha] = useState<FichaDeDetalhes | null>(null);
  /** O grupo da aba escolhida, pelo id. `null` = o primeiro. */
  const [ativo, setAtivo] = useState<string | null>(null);
  // Relê quando o Mestre mexe no elenco: gravar um detalhe sobe essa versão.
  const versao = useFichasVersaoStore((state) => state.versao);

  useEffect(() => {
    let ativo = true;

    void detalhesDoPersonagem(codigo, personagemId).then(
      (lida) => {
        if (ativo) setFicha(lida);
      },
      () => {
        // Sem a ficha os detalhes somem, e o resto do cartão continua: o
        // celular no Wi-Fi da casa volta ao recarregar.
        if (ativo) setFicha(null);
      },
    );

    return () => {
      ativo = false;
    };
  }, [codigo, personagemId, versao]);

  if (!ficha) return null;

  if (abas && !busca) {
    // Só os grupos com o que mostrar viram aba; o vazio do molde é onde o "+"
    // do Mestre mora, e aqui não há "+".
    const grupos = gruposDaFicha(ficha.grupos, ficha.detalhes).filter(
      (grupo) => doGrupo(ficha.detalhes, grupo).length > 0,
    );
    const grupo = grupos.find((atual) => atual.id === ativo) ?? grupos[0];
    if (!grupo) return null;

    return (
      <section className="space-y-2">
        {/* Presas logo abaixo da busca (`topoDasAbas`), com o fundo de quem
            embrulha o cartão -- ver `--fundo-da-busca`. */}
        <div
          role="tablist"
          aria-label={t.personagens.gruposDaFicha}
          style={{ top: topoDasAbas }}
          className="sticky z-[5] -mx-3 flex gap-1.5 overflow-x-auto border-b bg-[var(--fundo-da-busca,var(--color-background))] px-3 py-2"
        >
          {grupos.map((atual) => (
            <button
              key={atual.id}
              type="button"
              role="tab"
              aria-selected={atual.id === grupo.id}
              onClick={() => setAtivo(atual.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
                atual.id === grupo.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground",
              )}
            >
              {atual.nome}
            </button>
          ))}
        </div>

        <GrupoDoJogador
          key={grupo.id}
          codigo={codigo}
          personagemId={personagemId}
          grupo={grupo}
          detalhes={doGrupo(ficha.detalhes, grupo)}
          busca=""
          semTitulo
        />
      </section>
    );
  }

  return (
    <>
      {achadosNosDetalhes(gruposDaFicha(ficha.grupos, ficha.detalhes), ficha.detalhes, busca).map(
        ({ grupo, detalhes }) => (
          <GrupoDoJogador
            key={grupo.id}
            codigo={codigo}
            personagemId={personagemId}
            grupo={grupo}
            detalhes={detalhes}
            busca={busca}
          />
        ),
      )}
    </>
  );
}

function GrupoDoJogador({
  codigo,
  personagemId,
  grupo,
  detalhes,
  busca,
  semTitulo = false,
}: {
  codigo: string;
  personagemId: string;
  grupo: GrupoDeDetalhes;
  detalhes: DetalheDoJogador[];
  busca: string;
  /** Nas abas: o nome do grupo já está na aba escolhida. */
  semTitulo?: boolean;
}) {
  const rolar = (detalhe: DetalheDoJogador) => (
    <BotaoDeRolar codigo={codigo} personagemId={personagemId} detalhe={detalhe} />
  );

  return (
    <section className="space-y-1.5">
      {semTitulo ? null : (
        <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          {grupo.nome}
        </p>
      )}

      {grupo.exibicao === "lista" ? (
        <ul className="space-y-1">
          {detalhes.map((detalhe) => (
            <EntradaDoJogador
              key={detalhe.id}
              detalhe={detalhe}
              rolar={rolar(detalhe)}
              // Achado pela descrição: ela já abre, que é onde está o que se
              // procurou. O nome sozinho não abre -- "golpe" quer a lista.
              abrir={Boolean(busca && detalhe.descricao && normaliza(detalhe.descricao).includes(busca))}
            />
          ))}
        </ul>
      ) : (
        // Em cartões, como os atributos logo acima: o rótulo pequeno em cima e
        // o valor embaixo, e o dado do lado do valor. Os cartões crescem até a
        // largura do texto, e não cortam "Colete leve" em "Colete…".
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5">
          {detalhes.map((detalhe) => (
            <li
              key={detalhe.id}
              className="bg-background/40 flex min-w-0 flex-col rounded-md border px-2 py-1"
            >
              <div className="flex min-w-0 items-center gap-1">
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px]">
                  {detalhe.rotulo}
                </span>
                {detalhe.descricao ? (
                  <Descricao rotulo={detalhe.rotulo} descricao={detalhe.descricao} />
                ) : null}
              </div>
              <div className="flex min-w-0 items-center justify-between gap-1">
                <Valor detalhe={detalhe} />
                {rolar(detalhe)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** O valor, ou as reticências do vazio. Número em algarismos de mesma largura. */
function Valor({ detalhe }: { detalhe: DetalheDoJogador }) {
  const vazio = detalhe.valor === undefined || detalhe.valor === "";

  return (
    <span
      className={cn(
        "min-w-0 text-sm leading-snug font-medium break-words",
        detalhe.tipo === "numero" && "tabular-nums",
        vazio && "text-muted-foreground",
      )}
    >
      {vazio ? t.personagens.detalheVazio : String(detalhe.valor)}
    </span>
  );
}

/**
 * A descrição do cartão, num balão ao tocar.
 *
 * O ⓘ só existe quando há o que ler: um ícone em cada cartão era o mesmo
 * excesso que a ficha do Mestre acabou de perder. Toque, e não passar o mouse:
 * no celular não há "passar".
 */
function Descricao({ rotulo, descricao }: { rotulo: string; descricao: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t.personagens.descricaoDe(rotulo)}
            className="text-muted-foreground size-5 shrink-0 [&_svg:not([class*='size-'])]:size-3"
          >
            <Info />
          </Button>
        }
      />
      <PopoverContent side="bottom" align="end" className="w-64 space-y-1">
        <p className="text-xs font-medium">{rotulo}</p>
        <p className="text-muted-foreground text-xs leading-snug whitespace-pre-line">
          {descricao}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Uma entrada de Poderes ou Magias: o nome, o valor curto ao lado, e a
 * descrição que abre embaixo ao tocar. Sem descrição não há o que abrir, e a
 * linha não finge ser botão.
 */
function EntradaDoJogador({
  detalhe,
  rolar,
  abrir,
}: {
  detalhe: DetalheDoJogador;
  rolar: React.ReactNode;
  /** Aberta de saída, enquanto o toque não decidir o contrário. */
  abrir: boolean;
}) {
  // `null` = o toque ainda não decidiu, e vale o `abrir` da busca.
  const [escolha, setEscolha] = useState<boolean | null>(null);
  const aberta = escolha ?? abrir;
  const resumo = detalhe.valor === undefined ? "" : String(detalhe.valor);

  const cabeca = (
    <>
      {detalhe.descricao ? (
        <ChevronRight
          className={cn(
            "text-muted-foreground size-3.5 shrink-0 transition-transform motion-reduce:transition-none",
            aberta && "rotate-90",
          )}
          aria-hidden
        />
      ) : null}
      <span className="min-w-0 truncate text-sm font-medium">{detalhe.rotulo}</span>
      {resumo ? (
        <span className="text-muted-foreground min-w-0 truncate text-xs">{resumo}</span>
      ) : null}
    </>
  );

  return (
    <li className="min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        {detalhe.descricao ? (
          <button
            type="button"
            aria-expanded={aberta}
            onClick={() => setEscolha(!aberta)}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
          >
            {cabeca}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 py-1">{cabeca}</div>
        )}
        {rolar}
      </div>

      {aberta && detalhe.descricao ? (
        <p className="text-muted-foreground pb-1 pl-5 text-xs leading-snug whitespace-pre-line">
          {detalhe.descricao}
        </p>
      ) : null}
    </li>
  );
}

/**
 * O dado do detalhe: os dados da expressão desenhados como os da mesa, e o
 * modificador ao lado. Tocar rola.
 *
 * A expressão que chega é só para MOSTRAR. Quem rola relê a da ficha, no
 * daemon -- o toque manda só qual detalhe. A que não se lê aqui não ganha
 * botão: o daemon a recusaria do mesmo jeito.
 */
export function BotaoDeRolar({
  codigo,
  personagemId,
  detalhe,
}: {
  codigo: string;
  personagemId: string;
  detalhe: DetalheDoJogador;
}) {
  const [rolando, setRolando] = useState(false);

  if (!detalhe.rolagem) return null;
  const leitura = lerExpressaoDeRolagem(detalhe.rolagem);
  if (!leitura.ok) return null;
  const { expressao } = leitura;

  function rolar() {
    // ANTES de pedir, pela razão de `aoArremessar`: a mesa registra a rolagem
    // assim que o daemon sorteia, e um resultado que não coube na tela de quem
    // rolou seria cantado sem ter sido visto.
    if (recusaPorMesaCheia()) return;

    setRolando(true);
    rolarDetalhe(codigo, personagemId, detalhe.id)
      .then(({ lance, rolagens }) => lancarNoVidro(rolagens, lance))
      .catch((cause: unknown) => {
        toast.error(cause instanceof Error ? cause.message : t.erros.dadoNaoChegou);
      })
      .finally(() => setRolando(false));
  }

  return (
    <button
      type="button"
      disabled={rolando}
      aria-label={t.personagens.rolarDetalhe(detalhe.rotulo, textoDaExpressao(expressao))}
      onClick={rolar}
      className="hover:bg-accent active:bg-accent focus-visible:ring-ring flex shrink-0 items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 disabled:opacity-60"
    >
      <DadosDaExpressao expressao={expressao} />
      {expressao.modificador !== 0 ? (
        <span className="text-xs font-medium tabular-nums">
          {textoDoModificador(expressao.modificador)}
        </span>
      ) : null}
    </button>
  );
}

/** Os dados da expressão, parados na face mais alta, na ordem escrita. */
function DadosDaExpressao({ expressao }: { expressao: ExpressaoDeRolagem }) {
  return (
    <span className="flex items-center">
      {expressao.dados.map(({ quantidade, faces }, termo) => (
        <span key={termo} className="flex items-center">
          {Array.from({ length: Math.min(quantidade, DADOS_A_VISTA) }, (_, i) => (
            <DadoParado
              key={i}
              faces={faces}
              valor={Math.max(...rotulosDoDado(faces))}
              tamanho={18}
            />
          ))}
          {quantidade > DADOS_A_VISTA ? (
            <span className="text-muted-foreground text-[10px] tabular-nums">
              ×{quantidade}
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}
