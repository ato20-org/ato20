"use client";

import { Backpack, Package, Plus, X } from "lucide-react";
import { useState } from "react";

import { BolinhaFlutuante } from "@/components/jogador/bolinha-flutuante";
import { EscolhaDePersonagem } from "@/components/jogador/escolha-de-personagem";
import {
  criarItem,
  ItemForm,
  ItemTile,
  NovoItemForm,
  useItensDoPersonagem,
} from "@/components/jogador/inventario-jogador";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { usePersonagensDoJogador } from "@/hooks/use-personagens-do-jogador";
import { comum } from "@/lib/i18n/comum";
import { t } from "@/lib/i18n/jogador";
import type { NovoItem } from "@/types/inventory";

/** Em pé: o que a barra de baixo ocupa, com a folga dela; a bolinha não desce dali. */
const RESERVA_EMBAIXO = 96;
/** Em pé: o topo mais alto, abaixo do cabeçalho com o nome da mesa. */
const RESERVA_EMCIMA = 64;

/**
 * A mochila do jogador: a bolinha arrastável e o painel colado nela, com de
 * quem é, a grade e o item escolhido. Ver `BolinhaFlutuante`.
 *
 * Bolinha, e não aba: o inventário é consulta de passagem -- "tenho corda?" --,
 * e uma aba a mais espremia a barra.
 */
export function MochilaFlutuante({
  codigo,
  reservaEmcima = RESERVA_EMCIMA,
  reservaEmbaixo = RESERVA_EMBAIXO,
}: {
  codigo: string;
  /** A faixa livre, que muda deitado: lá não há barra embaixo nem faixa em cima. */
  reservaEmcima?: number;
  reservaEmbaixo?: number;
}) {
  // Sem personagem não há mochila: a bolinha só abriria um "nenhum personagem".
  const personagens = usePersonagensDoJogador(codigo);
  if (!personagens?.length) return null;

  return (
    <BolinhaFlutuante
      chave="ato20:jogador:bolinha-da-mochila"
      padrao={{ x: 1, y: 1 }}
      reservas={{ emcima: reservaEmcima, embaixo: reservaEmbaixo }}
      rotulo={() => t.mochila.abrir}
      bolinha={() => <Backpack className="size-5" aria-hidden />}
      classeDaBolinha={(aberta) =>
        aberta ? "bg-accent text-accent-foreground" : "bg-card text-foreground"
      }
      // Toque fora NÃO fecha: a mochila fica aberta enquanto se consulta a
      // ficha ou o mapa ao lado dela. Fecha no X de dentro, na bolinha e no Esc.
      fecharAoTocarFora={false}
      painel={(fechar) => <ConteudoDaMochila codigo={codigo} onFechar={fechar} />}
    />
  );
}

/**
 * O que a mochila mostra: de quem é, a grade e o item escolhido. Mora no painel
 * da bolinha (em pé) e no painel encaixado da barra (deitado).
 */
export function ConteudoDaMochila({
  codigo,
  onFechar,
}: {
  codigo: string;
  /**
   * Sem ela, a mochila mora numa ABA (a barra lateral da tela deitada): o nome
   * "Mochila" já está na aba e não há o que fechar, então o cabeçalho fica só
   * com de quem é e o "+".
   */
  onFechar?: () => void;
}) {
  // Relê quando o Mestre mexe no elenco, como a aba Personagem.
  const personagens = usePersonagensDoJogador(codigo);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  /** O diálogo de item novo. Aqui, e não na grade: o "+" mora no cabeçalho. */
  const [novo, setNovo] = useState(false);

  const personagem =
    personagens?.find((atual) => atual.id === escolhido) ?? personagens?.[0];

  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b py-1.5 pr-1.5 pl-3">
        {onFechar ? (
          <>
            <Backpack className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <h2 className="text-xs font-semibold tracking-wide uppercase">{t.mochila.titulo}</h2>
          </>
        ) : null}
        {personagem ? (
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
            {personagem.nome}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        {/* O "+" como ação do cabeçalho, e não como um quadro da grade do
            tamanho de um item: ele não é item, e ocupava o lugar de um. */}
        {personagem ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.inventario.adicionar}
            onClick={() => setNovo(true)}
            className="shrink-0"
          >
            <Plus />
          </Button>
        ) : null}
        {onFechar ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={comum.fechar}
            onClick={onFechar}
            className="shrink-0"
          >
            <X />
          </Button>
        ) : null}
      </header>

      <EscolhaDePersonagem
        personagens={personagens ?? []}
        escolhido={personagem?.id}
        onEscolher={setEscolhido}
        className="border-b px-3 py-2"
      />

      {personagens === null ? (
        <p className="text-muted-foreground p-3 text-xs">{t.personagens.lendo}</p>
      ) : personagem ? (
        <MochilaDoPersonagem
          key={personagem.id}
          codigo={codigo}
          personagemId={personagem.id}
          novo={novo}
          onNovo={setNovo}
        />
      ) : (
        <p className="text-muted-foreground p-3 text-xs leading-snug">{t.personagens.nenhum}</p>
      )}
    </>
  );
}

/**
 * A grade de um personagem e o item escolhido dela, lido, com "Editar" a um
 * toque -- como a mochila de um jogo. Trocar de item é tocar em outro quadro.
 */
function MochilaDoPersonagem({
  codigo,
  personagemId,
  novo,
  onNovo: setNovo,
}: {
  codigo: string;
  personagemId: string;
  /** O diálogo de item novo, aberto pelo "+" do cabeçalho. */
  novo: boolean;
  onNovo: (aberto: boolean) => void;
}) {
  const { itens, recarregar } = useItensDoPersonagem(codigo, personagemId);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const item = itens?.find((atual) => atual.id === selecionado) ?? null;

  async function criar(novoItem: NovoItem, foto: File | null) {
    const feito = await criarItem(codigo, personagemId, novoItem, foto);
    if (!feito) return;
    recarregar();
    setNovo(false);
    // O item novo já aparece escolhido: é o que o jogador acabou de pôr ali.
    setSelecionado(feito.criado.id);
  }

  return (
    <>
      {/* O item escolhido EM CIMA, com todo o espaço que sobra, e a grade
          compacta SEMPRE no pé -- como a mochila de um jogo: o que se está
          olhando ocupa a tela, e o resto fica à mão para trocar. Sem escolha,
          o lugar do item fica marcado por um quadro tracejado do mesmo tamanho:
          a grade não muda de lugar ao escolher e ao desescolher. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {item ? (
          <ItemForm
            key={item.id}
            codigo={codigo}
            personagemId={personagemId}
            item={item}
            moldura="painel"
            onFechar={() => setSelecionado(null)}
            onChanged={recarregar}
          />
        ) : itens !== null ? (
          <div className="text-muted-foreground flex h-full min-h-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed p-4 text-center text-xs">
            <Package className="size-6 opacity-60" aria-hidden />
            {itens.length === 0 ? t.mochila.vazia : t.mochila.escolha}
          </div>
        ) : null}
      </div>

      {/* A grade: uma faixa no pé, com teto, que rola sozinha com muitos itens. */}
      <div className="max-h-48 shrink-0 overflow-y-auto border-t p-3">
        {itens === null ? null : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-1.5">
            {itens.map((atual) => (
              <ItemTile
                key={atual.id}
                codigo={codigo}
                personagemId={personagemId}
                item={atual}
                selecionado={atual.id === selecionado}
                onAbrir={() => setSelecionado(atual.id === selecionado ? null : atual.id)}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={novo} onOpenChange={setNovo}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          {novo ? <NovoItemForm onCriar={criar} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
