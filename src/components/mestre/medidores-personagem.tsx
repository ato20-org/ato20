"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  LinhaDeMedidor,
  SeloDoMedidor,
  useArrastoDoAtual,
} from "@/components/mestre/linha-de-medidor";
import { confirmarApagar } from "@/components/mestre/confirmar-apagar";
import { SecaoFicha } from "@/components/mestre/secao-ficha";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useListReorder } from "@/hooks/use-list-reorder";
import { t } from "@/lib/i18n/personagens";
import { textoDoMedidor } from "@/lib/medidor";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import {
  criarMedidor,
  editarMedidor,
  removerMedidor,
  reordenarMedidores,
} from "@/lib/vault/characters";
import {
  MAX_MEDIDORES,
  type Medidor,
  type PatchMedidor,
  type Personagem,
} from "@/types/character";

/** O teto com que um medidor nasce. Dez é a escala da maioria das mesas. */
const MAXIMO_INICIAL = 10;

/**
 * Os medidores do personagem: os números que sobem e descem na sessão.
 *
 * Vida, sanidade, munição, tochas, moral. Quem escreve é só o mestre — o
 * jogador lê os dele no celular e não tem por onde mexer, que é o desenho
 * pedido: a mesa inteira olha para os mesmos números, e uma segunda mão
 * escrevendo neles pediria uma rota de escrita nova numa porta aberta na rede.
 *
 * ## Por que não há diálogo de criação
 *
 * A aparência pede um nome antes de existir porque criá-la é um gesto de
 * preparação, feito uma vez. Medidor se cria no meio da cena — "esse aí tem
 * vinte de vida" — e um diálogo entre o pensamento e a barra é um passo a mais
 * por goblin. Ele nasce com nome e teto plausíveis e se corrige na linha.
 *
 * ## A linha é a mesma da configuração da campanha
 *
 * Ver `LinhaDeMedidor`. A forma de cada linha vai cheia até o valor atual, e a
 * ordem da lista é a ordem da coluna ao lado do retrato — arrastar pela alça é
 * como o mestre a arruma. O olho riscado marca o que a mesa não vê.
 */
export function MedidoresPersonagem({
  personagem,
  onChanged,
}: {
  personagem: Personagem;
  onChanged: () => void;
}) {
  /**
   * A ordem depois de um arrasto, até a ficha relida chegar.
   *
   * Presa à lista de onde saiu: quando o `personagem` relido traz outra, esta
   * perde a validade sozinha, sem efeito para limpar. Sem ela, a linha solta
   * voltava ao lugar antigo pelo tempo da volta do IPC.
   */
  const [arrastada, setArrastada] = useState<{
    de: Medidor[] | undefined;
    lista: Medidor[];
  } | null>(null);

  const lista =
    arrastada && arrastada.de === personagem.medidores
      ? arrastada.lista
      : (personagem.medidores ?? []);
  const cheio = lista.length >= MAX_MEDIDORES;

  const { listRef, dropIndex, startReorder } = useListReorder<string>(
    (medidorId, index) => {
      const de = lista.findIndex((medidor) => medidor.id === medidorId);
      if (de < 0 || de === index) return;

      const arrumada = [...lista];
      const [movido] = arrumada.splice(de, 1);
      arrumada.splice(index, 0, movido!);

      setArrastada({ de: personagem.medidores, lista: arrumada });
      reordenarMedidores(
        personagem.id,
        arrumada.map((medidor) => medidor.id),
      ).then(onChanged, (cause: unknown) => {
        setArrastada(null);
        toast.error(
          cause instanceof Error ? cause.message : t.geral.falhas.reordenar,
        );
      });
    },
  );

  async function criar() {
    try {
      await criarMedidor(
        personagem.id,
        // O primeiro é quase sempre vida, e acertar o nome mais provável
        // economiza o gesto mais comum. Do segundo em diante não há palpite
        // honesto a dar.
        lista.length === 0 ? t.medidores.vida : t.medidores.medidor,
        // Cor diferente da anterior, ciclando a paleta: dois medidores
        // vermelhos ao lado do mesmo rosto se leem como um só partido em dois.
        CORES_LAPIS[lista.length % CORES_LAPIS.length] ?? CORES_LAPIS[0],
        "barra",
        MAXIMO_INICIAL,
      );
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.geral.falhas.criar);
    }
  }

  const novo = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t.medidores.criar}
            disabled={cheio}
            onClick={() => void criar()}
          >
            <Plus />
          </Button>
        }
      />
      <TooltipContent>
        <p className="font-medium">{t.medidores.criar}</p>
        {cheio ? (
          <p className="text-muted-foreground max-w-48">
            {t.medidores.limite(MAX_MEDIDORES)}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <SecaoFicha
      secao="medidores"
      titulo={t.medidores.titulo}
      contagem={lista.length}
      acao={novo}
    >
      {lista.length === 0 ? (
        <p className="text-muted-foreground text-[11px] leading-snug">
          {t.medidores.vazio(personagem.nome)}
        </p>
      ) : (
        <ul ref={listRef} className="space-y-1">
          {lista.map((medidor, index) => (
            <LinhaDaFicha
              key={medidor.id}
              personagemId={personagem.id}
              medidor={medidor}
              dropTarget={dropIndex === index}
              onReorderStart={(event) => startReorder(event, medidor.id)}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </SecaoFicha>
  );
}

/** Um medidor do personagem na linha compartilhada. Ver `LinhaDeMedidor`. */
function LinhaDaFicha({
  personagemId,
  medidor,
  dropTarget,
  onReorderStart,
  onChanged,
}: {
  personagemId: string;
  medidor: Medidor;
  dropTarget: boolean;
  onReorderStart: (event: ReactPointerEvent) => void;
  onChanged: () => void;
}) {
  /** Devolve se gravou: o arrasto da barra desfaz o rascunho quando não. */
  async function editar(patch: PatchMedidor): Promise<boolean> {
    try {
      await editarMedidor(personagemId, medidor.id, patch);
      onChanged();
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.geral.falhas.gravar);
      return false;
    }
  }

  // O que a linha desenha é o `mostrado`: no meio de um arrasto, a forma e o
  // selo andam juntos com o ponteiro, antes de o disco responder.
  const { mostrado, arrasto } = useArrastoDoAtual(medidor, (atual) =>
    editar({ atual }),
  );

  async function apagar() {
    const confirmado = await confirmarApagar({
      titulo: t.medidores.apagarTitulo(medidor.nome),
      itens: t.medidores.apagarItens(medidor.nome),
    });
    if (!confirmado) return;

    try {
      await removerMedidor(personagemId, medidor.id);
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.geral.falhas.apagar);
    }
  }

  return (
    <LinhaDeMedidor
      medidor={mostrado}
      arrasto={arrasto}
      dropTarget={dropTarget}
      onReorderStart={onReorderStart}
      onEditar={(patch) => void editar(patch)}
      onApagar={() => void apagar()}
      dicaDoOlho={{
        titulo: medidor.escondido ? t.geral.soVoceVe : t.geral.aMesaVe,
        texto: t.medidores.escondido,
      }}
      valores={
        // Os passos de um em um, e não uma régua: o dano da mesa é dito em
        // números inteiros ("leva sete"), e o selo aceita o número direto. Os
        // botões existem para o um a mais e o um a menos, que é o gesto
        // repetido — carga gasta, tocha apagada.
        <SeloDoMedidor
          texto={textoDoMedidor(mostrado)}
          dica={{
            titulo: t.medidores.deMaximo(mostrado.atual, mostrado.maximo),
            texto:
              mostrado.estilo === "porcentagem"
                ? t.medidores.porcentagemDica
                : t.medidores.trocarDica,
          }}
          campos={[
            {
              rotulo: t.medidores.valorAtual,
              valor: mostrado.atual,
              onGravar: (atual) => void editar({ atual }),
            },
            {
              rotulo: t.medidores.valorMaximo,
              valor: medidor.maximo,
              onGravar: (maximo) => void editar({ maximo }),
            },
          ]}
          // Pelo mesmo caminho do arrasto, e não direto ao disco: dois
          // cliques mais rápidos que a volta do IPC liam o mesmo `atual`, e o
          // segundo se perdia.
          passos={{
            onMenos: () => arrasto.onSoltar(mostrado.atual - 1),
            onMais: () => arrasto.onSoltar(mostrado.atual + 1),
            podeMenos: mostrado.atual > 0,
            podeMais: mostrado.atual < mostrado.maximo,
          }}
        />
      }
    />
  );
}
