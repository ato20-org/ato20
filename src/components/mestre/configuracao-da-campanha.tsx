"use client";

import {
  useCallback,
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Gauge, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { LayoutDoRetratoPainel } from "@/components/mestre/layout-do-retrato";
import {
  LinhaDeMedidor,
  SeloDoMedidor,
} from "@/components/mestre/linha-de-medidor";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { PosicaoDosRetratos } from "@/components/mestre/posicao-dos-retratos";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCharacters } from "@/hooks/use-characters";
import { useListReorder } from "@/hooks/use-list-reorder";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import {
  aplicarModelosEmTodos,
  criarModelo,
  editarModelo,
  listarModelos,
  removerModelo,
  reordenarModelos,
} from "@/lib/vault/characters";
import {
  MAX_MODELOS,
  type ModeloDeMedidor,
  type PatchModelo,
} from "@/types/character";

/** O teto com que um modelo nasce. Dez é a escala da maioria das mesas. */
const MAXIMO_INICIAL = 10;

/**
 * O que vale para a campanha inteira.
 *
 * Uma janela e não um diálogo, como Personagens e Estante: o mestre monta o
 * sistema da mesa aqui e vai conferindo o resultado nas fichas abertas ao lado.
 * Um modal cobriria justamente o que ele quer olhar enquanto ajusta.
 *
 * O que decide se algo mora aqui é uma pergunta só: isto vale para a CAMPANHA,
 * ou para uma cena ou um personagem? Sol e grade são da cena e ficam no palco.
 * O layout e a posição dos retratos valem para a mesa inteira e são gravados
 * por campanha, então moram aqui; a janela de Retratos fica com o elenco.
 */
export function ConfiguracaoDaCampanhaBody() {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-4 p-3">
        <MedidoresDaCampanha />

        <Separator />

        <Secao
          titulo="Layout dos retratos"
          descricao="O que cada retrato mostra na mesa, e onde."
        >
          <LayoutDoRetratoPainel selecionado={null} />
        </Secao>

        <Separator />

        <Secao
          titulo="Posição dos retratos"
          descricao="Apertar arruma os retratos soltos e faz os novos nascerem ali."
        >
          <PosicaoDosRetratos />
        </Secao>
      </div>
    </ScrollArea>
  );
}

/** Uma seção com título e uma linha de descrição, como a dos medidores. */
function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-medium">{titulo}</h3>
        <p className="text-muted-foreground text-[11px] leading-snug">
          {descricao}
        </p>
      </div>
      {children}
    </section>
  );
}

/**
 * Os medidores de fábrica: o que toda ficha desta campanha começa tendo.
 *
 * MOLDE, e não vínculo. Criar um aqui materializa um medidor de verdade em cada
 * personagem, e dali em diante o medidor é dele — o mestre renomeia, troca a
 * cor, apaga. Editar o modelo depois não empurra nada; para isso existe
 * "Aplicar em todos", que é um gesto com nome. Ver `ModeloDeMedidor`.
 */
function MedidoresDaCampanha() {
  const [modelos, setModelos] = useState<ModeloDeMedidor[] | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // As fichas abertas releem: materializar um modelo mexe no índice de
  // personagens, e sem isto elas seguiriam mostrando a lista de medidores de
  // antes até alguém tocar nelas.
  const { personagens, recarregar } = useCharacters();
  const quantos = personagens?.length ?? 0;

  const reler = useCallback(() => {
    listarModelos().then(setModelos, (cause: unknown) => {
      setModelos([]);
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao ler os medidores.",
      );
    });
  }, []);

  useEffect(reler, [reler]);

  /** Roda a chamada, relê os dois lados e destrava. Toda ação passa por aqui. */
  async function mexer(acao: () => Promise<unknown>, erro: string) {
    setOcupado(true);
    try {
      await acao();
      reler();
      recarregar();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : erro);
    } finally {
      setOcupado(false);
    }
  }

  const lista = modelos ?? [];
  const cheio = lista.length >= MAX_MODELOS;

  /**
   * Arrastar pela alça reordena. A ordem é a que a ficha NOVA recebe; as que já
   * existem não se mexem, porque o medidor é delas. Ver `reordenar` no Rust.
   */
  const { listRef, dropIndex, startReorder } = useListReorder<string>(
    (modeloId, index) => {
      const de = lista.findIndex((modelo) => modelo.id === modeloId);
      if (de < 0 || de === index) return;

      const arrumada = [...lista];
      const [movido] = arrumada.splice(de, 1);
      arrumada.splice(index, 0, movido!);

      // A linha fica onde foi solta já, sem esperar o disco: a volta do IPC
      // deixaria um quadro com ela no lugar antigo. O `reler` confirma depois.
      setModelos(arrumada);
      void mexer(
        () => reordenarModelos(arrumada.map((modelo) => modelo.id)),
        "Falha ao reordenar.",
      );
    },
  );

  async function criar() {
    await mexer(async () => {
      const { alcancados } = await criarModelo(
        lista.length === 0 ? "Vida" : "Medidor",
        CORES_LAPIS[lista.length % CORES_LAPIS.length] ?? CORES_LAPIS[0],
        "barra",
        MAXIMO_INICIAL,
      );

      toast.success(
        alcancados === 0
          ? "Medidor criado."
          : `Medidor criado em ${alcancados} ${alcancados === 1 ? "personagem" : "personagens"}.`,
      );
    }, "Falha ao criar o medidor.");
  }

  async function aplicar() {
    await mexer(async () => {
      const { alcancados } = await aplicarModelosEmTodos();

      toast.success(
        `Aplicado em ${alcancados} de ${quantos} ${quantos === 1 ? "personagem" : "personagens"}.`,
      );
    }, "Falha ao aplicar.");
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">Medidores da campanha</h3>
          <p className="text-muted-foreground text-[11px] leading-snug">
            Todo personagem começa com estes.
          </p>
        </div>

        {/* O gesto que falta ao molde por ele não ser um vínculo vivo. Ícone no
            cabeçalho, ao lado do criar, e não um botão da largura da seção: é
            um gesto de vez em quando, e o botão largo pesava mais que a lista
            que ele aplica. O aviso fica no tooltip -- ele é a exceção, e quem
            já entendeu não precisa relê-lo a cada abertura. */}
        {lista.length > 0 ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Aplicar em todos os personagens"
                  disabled={ocupado || quantos === 0}
                  onClick={() => void aplicar()}
                >
                  <Wand2 />
                </Button>
              }
            />
            <TooltipContent>
              <p className="font-medium">Aplicar em todos os personagens</p>
              <p className="text-muted-foreground max-w-56">
                Quem já tem um medidor com o mesmo nome não ganha outro.
              </p>
            </TooltipContent>
          </Tooltip>
        ) : null}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Criar medidor da campanha"
                disabled={cheio || ocupado}
                onClick={() => void criar()}
              >
                <Plus />
              </Button>
            }
          />
          <TooltipContent>
            <p className="font-medium">Criar medidor da campanha</p>
            {cheio ? (
              <p className="text-muted-foreground max-w-48">
                Limite de {MAX_MODELOS} medidores.
              </p>
            ) : null}
          </TooltipContent>
        </Tooltip>
      </div>

      {modelos === null ? (
        <p className="text-muted-foreground text-[11px]">Lendo…</p>
      ) : lista.length === 0 ? (
        <PainelVazio icone={Gauge}>Nenhum medidor registrado</PainelVazio>
      ) : (
        <ul ref={listRef} className="space-y-1">
          {lista.map((modelo, index) => (
            <LinhaDeModelo
              key={modelo.id}
              modelo={modelo}
              ocupado={ocupado}
              dropTarget={dropIndex === index}
              onReorderStart={(event) => startReorder(event, modelo.id)}
              onEditar={(patch) =>
                void mexer(
                  () => editarModelo(modelo.id, patch),
                  "Falha ao gravar.",
                )
              }
              onApagar={() =>
                void mexer(
                  () => removerModelo(modelo.id),
                  "Falha ao apagar o medidor.",
                )
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Um modelo na linha compartilhada com a ficha. Ver `LinhaDeMedidor`.
 *
 * Entra cheio, que é como ele nasce numa ficha.
 */
function LinhaDeModelo({
  modelo,
  ocupado,
  dropTarget,
  onReorderStart,
  onEditar,
  onApagar,
}: {
  modelo: ModeloDeMedidor;
  ocupado: boolean;
  dropTarget: boolean;
  onReorderStart: (event: ReactPointerEvent) => void;
  onEditar: (patch: PatchModelo) => void;
  onApagar: () => void;
}) {
  const porcentagem = modelo.estilo === "porcentagem";

  return (
    <LinhaDeMedidor
      medidor={{ ...modelo, atual: modelo.maximo }}
      ocupado={ocupado}
      dropTarget={dropTarget}
      onReorderStart={onReorderStart}
      onEditar={onEditar}
      onApagar={onApagar}
      dicaDoOlho={{
        titulo: modelo.escondido ? "Começa escondido" : "Começa à vista",
        texto: "Não muda as fichas que já têm este medidor.",
      }}
      valores={
        // Só o MÁXIMO, sem valor atual. O atual é do personagem -- é o que
        // distingue o goblin com três de vida do goblin com vinte --, e um
        // campo aqui pediria ao mestre uma escolha que não quer dizer nada.
        // Ver `ModeloDeMedidor`.
        <SeloDoMedidor
          ocupado={ocupado}
          // A porcentagem mostra o que a mesa verá com ele cheio. O máximo
          // ainda existe, e é a escala da conta: o campo abre com ele.
          texto={porcentagem ? "100%" : modelo.maximo}
          dica={{
            titulo: `Máximo: ${modelo.maximo}`,
            texto: porcentagem
              ? "A porcentagem é contada sobre ele. Clique para trocar."
              : "Começa cheio. Clique para trocar.",
          }}
          campos={[
            {
              rotulo: "Valor máximo",
              valor: modelo.maximo,
              onGravar: (maximo) => onEditar({ maximo }),
            },
          ]}
        />
      }
    />
  );
}
