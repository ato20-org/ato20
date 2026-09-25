"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { CorEForma } from "@/components/mestre/cor-e-forma";
import { DesenhoDoMedidor } from "@/components/playground/desenho-do-medidor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCharacters } from "@/hooks/use-characters";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import {
  aplicarModelosEmTodos,
  criarModelo,
  editarModelo,
  listarModelos,
  removerModelo,
} from "@/lib/vault/characters";
import {
  MAX_MODELOS,
  type ModeloDeMedidor,
  type PatchModelo,
} from "@/types/character";

/** O teto com que um modelo nasce. Dez é a escala da maioria das mesas. */
const MAXIMO_INICIAL = 10;

/** A largura da prévia, em pixels. Aproxima a coluna ao lado de um retrato. */
const LARGURA_DA_PREVIA = 150;

/**
 * O que vale para a campanha inteira.
 *
 * Uma janela e não um diálogo, como Personagens e Estante: o mestre monta o
 * sistema da mesa aqui e vai conferindo o resultado nas fichas abertas ao lado.
 * Um modal cobriria justamente o que ele quer olhar enquanto ajusta.
 *
 * Nasce com uma seção só. Ela é o lugar do que vier depois — o que decide se
 * algo mora aqui é uma pergunta só: isto vale para a CAMPANHA, ou para uma cena
 * ou um personagem? Sol e grade são da cena e ficam no palco; retrato é da
 * sessão e fica no painel dele.
 */
export function ConfiguracaoDaCampanhaBody() {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-4 p-3">
        <MedidoresDaCampanha />
      </div>
    </ScrollArea>
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
        cause instanceof Error ? cause.message : "Falha ao ler os modelos.",
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
          ? "Modelo criado."
          : `Modelo criado e posto em ${alcancados} ${alcancados === 1 ? "personagem" : "personagens"}.`,
      );
    }, "Falha ao criar o modelo.");
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
            Todo personagem novo nasce com estes. Criar um agora põe em quem já
            existe também.
          </p>
        </div>

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
                {MAX_MODELOS} é o limite — é o mesmo teto de medidores de uma
                ficha, e passar dele criaria personagem que nasce já recusando
                parte deles.
              </p>
            ) : null}
          </TooltipContent>
        </Tooltip>
      </div>

      {modelos === null ? (
        <p className="text-muted-foreground text-[11px]">Lendo…</p>
      ) : lista.length === 0 ? (
        <p className="text-muted-foreground text-[11px] leading-snug">
          Nenhum ainda. O que se põe aqui é o que a mesa inteira tem — vida,
          sanidade, munição —, para não recriar os mesmos três campos em cada
          goblin.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {lista.map((modelo) => (
            <LinhaDeModelo
              key={modelo.id}
              modelo={modelo}
              ocupado={ocupado}
              onEditar={(patch) =>
                void mexer(
                  () => editarModelo(modelo.id, patch),
                  "Falha ao gravar.",
                )
              }
              onApagar={() =>
                void mexer(
                  () => removerModelo(modelo.id),
                  "Falha ao apagar o modelo.",
                )
              }
            />
          ))}
        </ul>
      )}

      {lista.length > 0 ? (
        <>
          <div className="space-y-1.5 pt-1">
            <Label className="text-muted-foreground text-[10px] font-normal">
              Na mesa
            </Label>
            {/* Fundo escuro, e não o do painel: a coluna desenha sobre o MAPA,
                e o branco e o preto do texto foram escolhidos para isso. */}
            <div className="w-fit space-y-1.5 rounded bg-neutral-900 p-2">
              {lista
                .filter((modelo) => !modelo.escondido)
                .map((modelo) => (
                  <DesenhoDoMedidor
                    key={modelo.id}
                    // Cheio, que é como ele nasce numa ficha.
                    medidor={{ ...modelo, atual: modelo.maximo }}
                    largura={LARGURA_DA_PREVIA}
                    corpo={11}
                  />
                ))}
            </div>
          </div>

          {/* O gesto que falta ao molde por ele não ser um vínculo vivo. O
              aviso está no tooltip e não numa linha de texto: ele é a exceção,
              e quem já entendeu não precisa relê-lo a cada abertura. */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={ocupado || quantos === 0}
                  className="h-7 w-full px-2 text-xs"
                  onClick={() => void aplicar()}
                >
                  <Wand2 className="size-3" />
                  Aplicar em todos os personagens
                </Button>
              }
            />
            <TooltipContent>
              <p className="font-medium">Põe estes medidores em toda a mesa</p>
              <p className="text-muted-foreground max-w-56">
                Quem já tem um medidor com o mesmo nome não ganha outro. Serve
                para alcançar os personagens que ficaram de fora — e pode ser
                apertado quantas vezes quiser.
              </p>
            </TooltipContent>
          </Tooltip>
        </>
      ) : null}
    </section>
  );
}

function LinhaDeModelo({
  modelo,
  ocupado,
  onEditar,
  onApagar,
}: {
  modelo: ModeloDeMedidor;
  ocupado: boolean;
  onEditar: (patch: PatchModelo) => void;
  onApagar: () => void;
}) {
  /**
   * O nome, com rascunho local.
   *
   * Sem `useCampoDeNome` aqui: aquele grava no `blur` e é o certo numa lista de
   * escolhas. Este campo vive numa janela que relê a lista inteira a cada
   * gravação, e o remonte no meio da digitação devolveria o cursor ao fim da
   * palavra. Gravar no Enter e no sair resolve os dois.
   */
  const [nome, setNome] = useState<string | null>(null);
  const [maximo, setMaximo] = useState<string | null>(null);

  function gravarNome() {
    const valor = nome;
    setNome(null);
    if (valor === null) return;

    const limpo = valor.trim();
    if (!limpo || limpo === modelo.nome) return;

    onEditar({ nome: limpo });
  }

  function gravarMaximo() {
    const valor = maximo;
    setMaximo(null);
    if (valor === null) return;

    const numero = Number.parseInt(valor, 10);
    if (Number.isNaN(numero) || numero === modelo.maximo) return;

    onEditar({ maximo: numero });
  }

  return (
    <li className="space-y-1">
      <div className="flex items-center gap-1">
        <CorEForma
          cor={modelo.cor}
          estilo={modelo.estilo}
          onCor={(cor) => onEditar({ cor })}
          onEstilo={(estilo) => onEditar({ estilo })}
        />

        <Input
          aria-label="Nome do medidor"
          value={nome ?? modelo.nome}
          disabled={ocupado}
          className="h-7 min-w-0 flex-1 px-2 text-xs"
          onChange={(evento) => setNome(evento.target.value)}
          onBlur={gravarNome}
          onKeyDown={(evento) => {
            if (evento.key === "Enter") evento.currentTarget.blur();
            if (evento.key === "Escape") {
              setNome(null);
              evento.currentTarget.blur();
            }
          }}
        />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={
                  modelo.escondido ? "Mostrar para a mesa" : "Esconder da mesa"
                }
                aria-pressed={modelo.escondido}
                disabled={ocupado}
                onClick={() => onEditar({ escondido: !modelo.escondido })}
              >
                {modelo.escondido ? <EyeOff /> : <Eye />}
              </Button>
            }
          />
          <TooltipContent>
            <p className="font-medium">
              {modelo.escondido ? "Nasce escondido" : "Nasce à vista"}
            </p>
            <p className="text-muted-foreground max-w-48">
              Vale para os medidores que este modelo criar. Nos que já existem,
              quem manda é a ficha.
            </p>
          </TooltipContent>
        </Tooltip>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Apagar modelo"
          disabled={ocupado}
          className="text-muted-foreground hover:text-destructive"
          onClick={onApagar}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="flex items-center gap-1 pl-7">
        <Label className="text-muted-foreground text-[10px] font-normal">
          Máximo
        </Label>
        <Input
          aria-label="Valor máximo"
          inputMode="numeric"
          value={maximo ?? String(modelo.maximo)}
          disabled={ocupado}
          className="h-7 w-16 px-2 text-center text-xs tabular-nums"
          onChange={(evento) => setMaximo(evento.target.value)}
          onBlur={gravarMaximo}
          onKeyDown={(evento) => {
            if (evento.key === "Enter") evento.currentTarget.blur();
            if (evento.key === "Escape") {
              setMaximo(null);
              evento.currentTarget.blur();
            }
          }}
        />
        {/* Sem valor ATUAL. Ele é do personagem -- é o que distingue o goblin
            com três de vida do goblin com vinte --, e um campo aqui pediria ao
            mestre uma escolha que não quer dizer nada. Ver `ModeloDeMedidor`. */}
        <span className="text-muted-foreground text-[10px] leading-snug">
          nasce cheio em cada ficha
        </span>
      </div>
    </li>
  );
}
