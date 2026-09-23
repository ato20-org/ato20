"use client";

import { useMemo } from "react";
import { Eraser, Trash2, X } from "lucide-react";

import { DadoParado } from "@/components/playground/dado-parado";
import { DadoRolando } from "@/components/playground/dado-rolando";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DURACAO_DA_CHEGADA,
  instanteDaQueda,
  useQuedaDasRolagens,
} from "@/hooks/use-queda-das-rolagens";
import { useRolagensStore } from "@/lib/store/use-rolagens-store";
import { textoDoResultado, tipoDado, type RolagemDaMesa } from "@/types/dado";

/**
 * O que a mesa tirou, como janela da bancada.
 *
 * Era uma FILEIRA flutuante sobre o mapa — sem moldura, arrastável, com alça de
 * escala própria e posição guardada em `localStorage`. Ela resolvia o problema
 * de ser vista e criava três outros: cobria o mapa justamente no canto em que o
 * mestre estava montando a cena, tinha teto de seis linhas (o resto só existia
 * dentro de um popover, noutro canto da tela), e carregava um sistema de
 * janelas paralelo ao que a bancada já tem — arrastar, redimensionar, lembrar
 * onde ficou, tudo escrito de novo.
 *
 * Como janela, ela ganha de graça o que aquilo custava a manter: atracar numa
 * coluna, virar aba ao lado de Personagens, recolher no pé do palco, lembrar
 * tamanho e lugar. E o mapa fica inteiro para o mapa.
 *
 * O dado CAI aqui, como caía na fileira: o número só aparece quando ele pousa.
 * Antes a linha nascia pronta no instante do arremesso, que é um ou dois
 * segundos ANTES de o dado pousar no aparelho de quem rolou — o mestre lia o
 * número em voz alta enquanto o jogador ainda olhava o dado dele girando. Ver
 * `DadoRolando`.
 *
 * Duas listas, e a divisão é a mesma do chip que abre esta janela: o que está
 * NA MESA agora (e sai sozinho em trinta segundos, ver `PRAZO_DO_DADO_MS`) e o
 * que já passou. Uma lista só faria a jogada da rodada se perder entre as vinte
 * anteriores.
 */
export function RolagensBody() {
  const bandeja = useRolagensStore((state) => state.bandeja);
  const historico = useRolagensStore((state) => state.historico);
  const apagar = useRolagensStore((state) => state.apagar);
  const limpar = useRolagensStore((state) => state.limpar);
  const esquecer = useRolagensStore((state) => state.esquecer);

  const { chegada, agora } = useQuedaDasRolagens(bandeja);

  /**
   * O histórico sem o que ainda está na mesa.
   *
   * A mesma rolagem está nas duas listas — a bandeja é um recorte do histórico
   * —, e mostrá-la em cima e embaixo faria o mestre contar dois dados onde caiu
   * um. Some daqui quando expira lá.
   */
  const passado = useMemo(() => {
    const naMesa = new Set(bandeja.map((rolagem) => rolagem.id));

    return historico.filter((rolagem) => !naMesa.has(rolagem.id));
  }, [bandeja, historico]);

  if (historico.length === 0) {
    return (
      <PainelVazio conteudo={{ tipo: "rolagens" }}>
        Nenhum dado rolado ainda
      </PainelVazio>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-xs font-medium">Na mesa</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-xs"
          disabled={bandeja.length === 0}
          onClick={limpar}
        >
          <Trash2 className="size-3" />
          Limpar tudo
        </Button>
      </div>

      {bandeja.length === 0 ? (
        <p className="text-muted-foreground px-3 py-2 text-xs">
          Nada na mesa agora.
        </p>
      ) : (
        <ul className="divide-y">
          {bandeja.map((rolagem) => {
            const t = instanteDaQueda(chegada.get(rolagem.id), agora);

            return (
              <NaMesa
                key={rolagem.id}
                rolagem={rolagem}
                t={t}
                onTirar={() => apagar(rolagem.id)}
              />
            );
          })}
        </ul>
      )}

      {passado.length > 0 ? (
        <>
          <div className="flex items-center justify-between gap-2 border-y px-3 py-2">
            <p className="text-muted-foreground text-xs font-medium">Antes</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-xs"
              onClick={esquecer}
            >
              <Eraser className="size-3" />
              Esquecer
            </Button>
          </div>

          {/* Rolagem é a coisa que mais acontece numa sessão, e a lista cresce o
              tempo todo. A rolagem fica AQUI, e não na janela inteira: o que
              está na mesa não pode sair de vista por causa do que já passou. */}
          <ScrollArea className="min-h-0 flex-1">
            <ul className="divide-y opacity-70">
              {passado.map((rolagem) => (
                <li
                  key={rolagem.id}
                  className="flex items-center gap-2 px-3 py-1.5"
                >
                  <DadoParado
                    faces={rolagem.faces}
                    valor={rolagem.valor}
                    tamanho={22}
                  />
                  <Nome rolagem={rolagem} />
                  <Resultado rolagem={rolagem} />
                </li>
              ))}
            </ul>
          </ScrollArea>
        </>
      ) : null}
    </div>
  );
}

/**
 * Uma rolagem que ainda está na mesa: o dado caindo, e o botão que a tira.
 *
 * O botão é explícito, e não a linha inteira como era na fileira: ali a linha
 * não tinha mais nada para fazer, aqui ela convive com uma lista que se lê e se
 * rola, e uma jogada que some porque o dedo encostou nela é jogada perdida.
 */
function NaMesa({
  rolagem,
  t,
  onTirar,
}: {
  rolagem: RolagemDaMesa;
  /** Idade da queda, em milissegundos. Ver `instanteDaQueda`. */
  t: number;
  onTirar: () => void;
}) {
  const assentou = t >= DURACAO_DA_CHEGADA;

  return (
    <li className="group/rolagem flex items-center gap-2 px-3 py-1.5">
      <DadoRolando
        id={rolagem.id}
        faces={rolagem.faces}
        valor={rolagem.valor}
        tamanho={22}
        t={t}
      />

      <Nome rolagem={rolagem} />

      {/* Os dois estados na MESMA célula, empilhados: "Rolando…" enquanto o
          dado tomba, o resultado quando ele pousa. Trocar um pelo outro faria a
          linha escorregar para o lado justo quando a mesa está olhando para
          ela. */}
      <span className="grid w-14 place-items-end">
        <span
          className="text-sm leading-tight font-semibold tabular-nums transition-opacity duration-200 [grid-area:1/1]"
          style={{ opacity: assentou ? 1 : 0 }}
        >
          {textoDoResultado(rolagem.faces, rolagem.valor)}
        </span>

        <span
          aria-hidden
          className="text-muted-foreground text-[10px] leading-tight transition-opacity duration-200 [grid-area:1/1] self-center"
          style={{ opacity: assentou ? 0 : 1 }}
        >
          Rolando…
        </span>
      </span>

      <Button
        variant="ghost"
        size="icon-xs"
        // Aparece no foco também, e não só no hover: quem chega por teclado
        // precisa alcançar o mesmo gesto.
        className="opacity-0 transition-opacity group-hover/rolagem:opacity-100 group-focus-within/rolagem:opacity-100"
        // O nome inteiro no rótulo: a linha o trunca quando o jogador escolheu
        // um nome comprido, e quem lê por voz precisa do todo.
        aria-label={`Tirar da mesa: ${rolagem.jogador} tirou ${textoDoResultado(
          rolagem.faces,
          rolagem.valor,
        )} no ${tipoDado(rolagem.faces).nome}`}
        onClick={onTirar}
      >
        <X />
      </Button>
    </li>
  );
}

function Nome({ rolagem }: { rolagem: RolagemDaMesa }) {
  return (
    <>
      <span className="min-w-0 flex-1 truncate text-xs">{rolagem.jogador}</span>
      <span className="text-muted-foreground text-[10px] tabular-nums">
        {tipoDado(rolagem.faces).nome}
      </span>
    </>
  );
}

function Resultado({ rolagem }: { rolagem: RolagemDaMesa }) {
  return (
    <span className="min-w-6 text-right text-sm font-semibold tabular-nums">
      {textoDoResultado(rolagem.faces, rolagem.valor)}
    </span>
  );
}
