"use client";

import { ChevronRight, Circle, Info, Ruler } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AtributosDasRolagens,
  useAtributosDasRolagens,
} from "@/components/atributos-das-rolagens";
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
  nomesDoDadoDoAtributo,
  textoDaExpressao,
  textoDoModificador,
  type AtributoDaConta,
  type ExpressaoDeRolagem,
} from "@/lib/mestre/expressao-de-rolagem";
import {
  detalhesDoPersonagem,
  rolarAtributo,
  rolarDetalhe,
  rolarNoTexto,
  type DetalheDoJogador,
  type FichaDeDetalhes,
  type RolagemDoDetalhe,
} from "@/lib/player/detalhes";
import { useFichasVersaoStore } from "@/lib/store/use-fichas-versao-store";
import { useFocoNoDetalhe } from "@/lib/store/use-foco-no-detalhe";
import { cn } from "@/lib/utils";
import { numeroDaRegua, pedacosComRolagens, temRolagemNoTexto } from "@/lib/mestre/rolagens-no-texto";
import { facesParaDesenhar } from "@/lib/mestre/valor-do-atributo";
import { rotulosDoDado } from "@/types/dado";
import { doGrupo, gruposDaFicha, type GrupoDeDetalhes } from "@/types/detalhe";
import type { Atributo } from "@/types/character";

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
  atributos,
  ficha,
}: {
  codigo: string;
  personagemId: string;
  /** Lida por quem chama, que a divide com os atributos. Ver `useFichaDoJogador`. */
  ficha: FichaDeDetalhes | null;
  /**
   * Os atributos do personagem, para a conta com sigla virar o botão de rolar
   * como as outras: "Ataque: {AGId20>+5}" mostra tantos d20 quanto a AGI. A
   * menção aos detalhes ("{1d20+@Luta}") lê a própria ficha. Ver
   * `TextoDoDetalhe`.
   */
  atributos?: ReadonlyArray<AtributoDaConta>;
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
  /** O grupo da aba escolhida, pelo id. `null` = o primeiro. */
  const [ativo, setAtivo] = useState<string | null>(null);

  // A busca pede que a ficha mostre um detalhe: abre o grupo dele, rola até ele
  // e o faz piscar. Ver `useFocoNoDetalhe`. Só o personagem do alvo atende, e o
  // `consumir` apaga o pedido para não reacender ao voltar para a aba.
  const alvo = useFocoNoDetalhe((estado) => estado.alvo);
  const consumir = useFocoNoDetalhe((estado) => estado.consumir);

  useEffect(() => {
    if (!ficha || !alvo || alvo.personagemId !== personagemId) return;

    const grupos = gruposDaFicha(ficha.grupos, ficha.detalhes).filter(
      (grupo) => doGrupo(ficha.detalhes, grupo).length > 0,
    );
    const grupoDoAlvo = grupos.find((grupo) =>
      doGrupo(ficha.detalhes, grupo).some((detalhe) => detalhe.id === alvo.detalheId),
    );
    // O Mestre apagou o detalhe entre a busca e o toque: nada a mostrar.
    if (!grupoDoAlvo) {
      consumir();
      return;
    }

    const detalheId = alvo.detalheId;
    const grupoId = grupoDoAlvo.id;
    let tentativas = 0;
    // Nas abas, abre a do grupo (na pilha ele já está) e, quando o detalhe
    // entra no DOM, rola até ele e o acende. O `setAtivo` troca a aba num
    // render à parte, então tenta por alguns quadros. Dentro do quadro, e não
    // no corpo do efeito, para não encadear renders.
    const rolarEAcender = () => {
      if (abas && tentativas === 0) setAtivo(grupoId);
      const noDom = document.querySelector(`[data-detalhe-id="${detalheId}"]`);
      if (noDom instanceof HTMLElement) {
        noDom.scrollIntoView({ block: "center", behavior: "smooth" });
        // Reinicia a animação se ele já tinha piscado numa busca anterior.
        noDom.classList.remove("detalhe-em-destaque");
        void noDom.offsetWidth;
        noDom.classList.add("detalhe-em-destaque");
        return;
      }
      if (tentativas++ < 10) requestAnimationFrame(rolarEAcender);
    };
    requestAnimationFrame(rolarEAcender);
    consumir();
  }, [alvo, ficha, personagemId, abas, consumir]);

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
      <AtributosDasRolagens atributos={atributos} detalhes={ficha.detalhes}>
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
      </AtributosDasRolagens>
    );
  }

  return (
    <AtributosDasRolagens atributos={atributos} detalhes={ficha.detalhes}>
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
    </AtributosDasRolagens>
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
  // A conta entre chaves no texto do detalhe, pelo daemon. Ver `TextoDoDetalhe`.
  const pedirNoTexto = (detalhe: DetalheDoJogador) => (conta: string) =>
    rolarNoTexto(codigo, personagemId, detalhe.id, conta);

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
              pedir={pedirNoTexto(detalhe)}
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
              data-detalhe-id={detalhe.id}
              className="bg-background/40 flex min-w-0 flex-col rounded-md border px-2 py-1"
            >
              <div className="flex min-w-0 items-center gap-1">
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px]">
                  {detalhe.rotulo}
                </span>
                {detalhe.descricao ? (
                  <Descricao
                    rotulo={detalhe.rotulo}
                    descricao={detalhe.descricao}
                    pedir={pedirNoTexto(detalhe)}
                  />
                ) : null}
              </div>
              <div className="flex min-w-0 items-center justify-between gap-1">
                <Valor detalhe={detalhe} pedir={pedirNoTexto(detalhe)} />
                {rolar(detalhe)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Pede ao daemon uma conta do texto do detalhe, como ela está escrita. */
type PedirNoTexto = (conta: string) => Promise<RolagemDoDetalhe>;

/** O valor, ou as reticências do vazio. Número em algarismos de mesma largura. */
function Valor({ detalhe, pedir }: { detalhe: DetalheDoJogador; pedir: PedirNoTexto }) {
  const vazio = detalhe.valor === undefined || detalhe.valor === "";

  return (
    <span
      className={cn(
        "min-w-0 text-sm leading-snug font-medium break-words",
        detalhe.tipo === "numero" && "tabular-nums",
        vazio && "text-muted-foreground",
      )}
    >
      {vazio ? (
        t.personagens.detalheVazio
      ) : (
        <TextoDoDetalhe texto={String(detalhe.valor)} rotulo={detalhe.rotulo} pedir={pedir} />
      )}
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
function Descricao({
  rotulo,
  descricao,
  pedir,
}: {
  rotulo: string;
  descricao: string;
  pedir: PedirNoTexto;
}) {
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
          <TextoDoDetalhe texto={descricao} rotulo={rotulo} pedir={pedir} />
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
  pedir,
  abrir,
}: {
  detalhe: DetalheDoJogador;
  rolar: React.ReactNode;
  pedir: PedirNoTexto;
  /** Aberta de saída, enquanto o toque não decidir o contrário. */
  abrir: boolean;
}) {
  // `null` = o toque ainda não decidiu, e vale o `abrir` da busca.
  const [escolha, setEscolha] = useState<boolean | null>(null);
  const aberta = escolha ?? abrir;
  const atributos = useAtributosDasRolagens();
  const valor = detalhe.valor === undefined ? "" : String(detalhe.valor);
  const resumo = valor ? (
    <span className="text-muted-foreground min-w-0 truncate text-xs">
      <TextoDoDetalhe texto={valor} rotulo={detalhe.rotulo} pedir={pedir} />
    </span>
  ) : null;
  // O resumo com conta sai do botão de abrir: botão dentro de botão não é
  // HTML, e o toque no dado abriria a descrição em vez de rolar.
  const resumoFora = Boolean(detalhe.descricao) && temRolagemNoTexto(valor, atributos);

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
      {resumoFora ? null : resumo}
    </>
  );

  return (
    <li data-detalhe-id={detalhe.id} className="min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        {detalhe.descricao ? (
          <button
            type="button"
            aria-expanded={aberta}
            onClick={() => setEscolha(!aberta)}
            className={cn(
              "flex min-w-0 items-center gap-1.5 py-1 text-left",
              !resumoFora && "flex-1",
            )}
          >
            {cabeca}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 py-1">{cabeca}</div>
        )}
        {resumoFora ? <span className="flex min-w-0 flex-1">{resumo}</span> : null}
        {rolar}
      </div>

      {aberta && detalhe.descricao ? (
        <p className="text-muted-foreground pb-1 pl-5 text-xs leading-snug whitespace-pre-line">
          <TextoDoDetalhe texto={detalhe.descricao} rotulo={detalhe.rotulo} pedir={pedir} />
        </p>
      ) : null}
    </li>
  );
}

/**
 * Um texto do detalhe com as contas entre chaves viradas no botão de rolar,
 * como na ficha do Mestre (`TextoComRolagens`): "Soco com mão livre {1d4}"
 * mostra o d4 no lugar das chaves, e o toque rola pelo daemon. O resto é
 * texto, como o mestre escreveu; a chave que não lê fica com as chaves.
 *
 * O toque manda só QUAL conta, como está escrita, e quem a confere na ficha e
 * sorteia é o daemon -- ver `rolarNoTexto`. As siglas leem os atributos do
 * personagem, e a menção os detalhes (`AtributosDasRolagens`), e o desenho é
 * só para mostrar: quem rola relê a AGI e a Luta de agora.
 *
 * A régua entre chaves ("{9m}") aparece como a medida, sem botão: quem põe
 * régua no mapa é o Mestre, e o celular não mexe na cena.
 */
export function TextoDoDetalhe({
  texto,
  rotulo,
  pedir,
}: {
  texto: string;
  rotulo: string;
  pedir: PedirNoTexto;
}) {
  const atributos = useAtributosDasRolagens();
  const pedacos = useMemo(() => pedacosComRolagens(texto, atributos), [texto, atributos]);

  return pedacos.map((pedaco, i) => {
    switch (pedaco.tipo) {
      case "texto":
        return <Fragment key={i}>{pedaco.texto}</Fragment>;
      case "rolagem":
        return (
          <BotaoDaExpressao
            key={i}
            expressao={pedaco.expressao}
            rotulo={rotulo}
            pedir={() => pedir(pedaco.texto)}
            // Na linha da frase, e não como bloco: uma frase com três contas não
            // pode virar três linhas.
            className="text-foreground inline-flex align-middle"
          />
        );
      case "regua": {
        const numero = numeroDaRegua(pedaco);
        const Icone = pedaco.forma === "linha" ? Ruler : Circle;

        return (
          <span
            key={i}
            title={(pedaco.forma === "linha" ? t.personagens.reguaLinha : t.personagens.reguaCirculo)(numero)}
            className="text-foreground inline-flex items-center gap-0.5 align-middle tabular-nums"
          >
            <Icone aria-hidden className="size-3.5 shrink-0" />
            {t.personagens.medida(numero)}
          </span>
        );
      }
    }
  });
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
  if (!detalhe.rolagem) return null;
  const leitura = lerExpressaoDeRolagem(detalhe.rolagem);
  if (!leitura.ok) return null;

  return (
    <BotaoDaExpressao
      expressao={leitura.expressao}
      rotulo={detalhe.rotulo}
      pedir={() => rolarDetalhe(codigo, personagemId, detalhe.id)}
    />
  );
}

/**
 * O que um detalhe rola, quando rola: a `rolagem` que o Mestre atribuiu, ou,
 * na falta dela, a primeira conta escrita entre chaves no valor. `null` quando
 * não há dado -- um número, um texto sem conta. É o mesmo que o `BotaoDeRolar`
 * e a busca perguntam, num lugar só.
 */
function rolagemDoAchado(
  detalhe: DetalheDoJogador,
  atributos: ReadonlyArray<AtributoDaConta> | undefined,
): { expressao: ExpressaoDeRolagem; conta: string | null } | null {
  if (detalhe.rolagem) {
    const leitura = lerExpressaoDeRolagem(detalhe.rolagem);
    // `conta` nula: quem rola é `rolarDetalhe`, que relê a `rolagem` da ficha.
    if (leitura.ok) return { expressao: leitura.expressao, conta: null };
  }
  const valor = detalhe.valor === undefined || detalhe.valor === "" ? "" : String(detalhe.valor);
  const pedaco = pedacosComRolagens(valor, atributos).find((p) => p.tipo === "rolagem");
  if (pedaco?.tipo === "rolagem") return { expressao: pedaco.expressao, conta: pedaco.texto };
  return null;
}

/** Esse detalhe tem o que rolar? Ver `rolagemDoAchado`. */
export function detalheRola(
  detalhe: DetalheDoJogador,
  atributos?: ReadonlyArray<AtributoDaConta>,
): boolean {
  return rolagemDoAchado(detalhe, atributos) !== null;
}

/**
 * O botão de rolar do achado da busca: o dado DESTE detalhe com a palavra
 * "rolar" ao lado, para o toque na lista ser óbvio -- o resto do item leva à
 * ficha. Rola o que o detalhe tem (ver `rolagemDoAchado`), e `null` quando não
 * há dado. O dado é só para mostrar; quem sorteia relê a ficha, no daemon.
 */
export function BotaoDeRolarDoAchado({
  codigo,
  personagemId,
  detalhe,
  atributos,
}: {
  codigo: string;
  personagemId: string;
  detalhe: DetalheDoJogador;
  atributos?: ReadonlyArray<AtributoDaConta>;
}) {
  const rolagem = rolagemDoAchado(detalhe, atributos);
  if (!rolagem) return null;
  const { expressao, conta } = rolagem;

  return (
    <BotaoDaExpressao
      expressao={expressao}
      rotulo={detalhe.rotulo}
      pedir={() =>
        conta === null
          ? rolarDetalhe(codigo, personagemId, detalhe.id)
          : rolarNoTexto(codigo, personagemId, detalhe.id, conta)
      }
      className="gap-1.5"
    >
      <DadosDaExpressao expressao={expressao} />
      {expressao.modificador !== 0 ? (
        <span className="text-xs font-medium tabular-nums">
          {textoDoModificador(expressao.modificador)}
        </span>
      ) : null}
      <span className="text-xs font-medium">{t.personagens.rolar}</span>
    </BotaoDaExpressao>
  );
}

/**
 * Os detalhes do personagem, lidos do daemon, e relidos quando o Mestre mexe
 * no elenco. Um hook, e não a leitura dentro de `DetalhesDoJogador`: o dado
 * dos atributos ("d20-@NEX") lê a mesma ficha, e o cartão a lê uma vez só.
 */
export function useFichaDoJogador(codigo: string, personagemId: string): FichaDeDetalhes | null {
  const [ficha, setFicha] = useState<FichaDeDetalhes | null>(null);
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

  return ficha;
}

/**
 * O que o dado de um atributo lê da ficha em volta: os números, para
 * "d20-@NEX". Ver `nomesDoDadoDoAtributo`.
 */
function useNomesDoDado(): ReadonlyArray<AtributoDaConta> {
  const nomes = useAtributosDasRolagens();
  return useMemo(() => nomesDoDadoDoAtributo(nomes), [nomes]);
}

/**
 * O atributo que é um dado -- a AGI d8 --, rolado pelo daemon como o detalhe.
 * O número não tem botão: não há o que sortear. Desenha um dado por TIPO, e
 * não um por dado (ver `DesenhoDoDadoNoCelular`). Com `children`, o botão é o
 * que vem dentro -- o dado e o "d8" no círculo do ritual.
 */
export function BotaoDoAtributo({
  codigo,
  personagemId,
  atributo,
  className,
  style,
  children,
}: {
  codigo: string;
  personagemId: string;
  atributo: Atributo;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  // A menção ("d20-@NEX") lê a ficha do cartão em volta; quem rola relê a de
  // agora, no daemon.
  const nomes = useNomesDoDado();
  if (!atributo.rolagem) return null;
  const leitura = lerExpressaoDeRolagem(atributo.rolagem, nomes);
  if (!leitura.ok) return null;

  return (
    <BotaoDaExpressao
      expressao={leitura.expressao}
      rotulo={atributo.sigla}
      pedir={() => rolarAtributo(codigo, personagemId, atributo.id)}
      className={className}
      style={style}
    >
      {children ?? <DesenhoDoDadoNoCelular rolagem={atributo.rolagem} lado="18px" />}
    </BotaoDaExpressao>
  );
}

/**
 * O botão de uma expressão que o daemon sorteia: o detalhe, o atributo, ou a
 * conta do texto. A expressão é só para mostrar, já lida por quem chama -- a
 * que não se lê não ganha botão, porque o daemon a recusaria do mesmo jeito.
 */
function BotaoDaExpressao({
  expressao,
  rotulo,
  pedir,
  className,
  style,
  children,
}: {
  expressao: ExpressaoDeRolagem;
  rotulo: string;
  pedir: () => Promise<RolagemDoDetalhe>;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const [rolando, setRolando] = useState(false);

  function rolar() {
    // ANTES de pedir, pela razão de `aoArremessar`: a mesa registra a rolagem
    // assim que o daemon sorteia, e um resultado que não coube na tela de quem
    // rolou seria cantado sem ter sido visto.
    if (recusaPorMesaCheia()) return;

    setRolando(true);
    pedir()
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
      aria-label={t.personagens.rolarDetalhe(rotulo, textoDaExpressao(expressao))}
      onClick={rolar}
      className={cn(
        "hover:bg-accent active:bg-accent focus-visible:ring-ring flex shrink-0 items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 disabled:opacity-60",
        className,
      )}
      style={style}
    >
      {children ?? (
        <>
          <DadosDaExpressao expressao={expressao} />
          {expressao.modificador !== 0 ? (
            <span className="text-xs font-medium tabular-nums">
              {textoDoModificador(expressao.modificador)}
            </span>
          ) : null}
        </>
      )}
    </button>
  );
}

/**
 * O dado de um atributo, parado na face mais alta: UM por tipo de dado, como no
 * Mestre -- "8d4" é um d4, e o oito está no texto. `lado` é CSS, para o círculo
 * do ritual medi-lo em `em`. Ver `facesParaDesenhar`.
 */
export function DesenhoDoDadoNoCelular({ rolagem, lado }: { rolagem: string; lado: string }) {
  const nomes = useNomesDoDado();

  return (
    <span className="flex shrink-0 items-center justify-center gap-[0.1em]" style={{ height: lado }}>
      {facesParaDesenhar(rolagem, nomes).map((faces) => (
        <span key={faces} className="block [&>svg]:size-full" style={{ width: lado, height: lado }}>
          <DadoParado faces={faces} valor={Math.max(...rotulosDoDado(faces))} tamanho={18} />
        </span>
      ))}
    </span>
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
