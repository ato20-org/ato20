"use client";

import { useCallback, useEffect, useState } from "react";
import { Hash, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";

import {
  CartaoDeAtributo,
  GradeDeAtributos,
} from "@/components/mestre/atributos-personagem";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCharacters } from "@/hooks/use-characters";
import { t } from "@/lib/i18n/mestre";
import {
  aplicarAtributosEmTodos,
  criarAtributoDaCampanha,
  editarAtributoDaCampanha,
  listarAtributosDaCampanha,
  removerAtributoDaCampanha,
} from "@/lib/vault/characters";
import {
  MAX_ATRIBUTOS,
  MAX_DESCRICAO_ATRIBUTO,
  MAX_SIGLA,
  MAX_VALOR_ATRIBUTO,
  type ModeloDeAtributo,
} from "@/types/character";

export type AtributosDaCampanhaLidos = {
  /** `null` enquanto a primeira leitura não voltou. */
  modelos: ModeloDeAtributo[] | null;
  reler: () => void;
};

/**
 * Os atributos da campanha, lidos pela janela e não pelo tópico, como os
 * medidores: a busca acha "FOR" com o tópico fechado.
 */
export function useAtributosDaCampanha(): AtributosDaCampanhaLidos {
  const [modelos, setModelos] = useState<ModeloDeAtributo[] | null>(null);

  const reler = useCallback(() => {
    listarAtributosDaCampanha().then(setModelos, (cause: unknown) => {
      setModelos([]);
      toast.error(
        cause instanceof Error ? cause.message : t.configuracao.falhaAoLerAtributos,
      );
    });
  }, []);

  useEffect(reler, [reler]);

  return { modelos, reler };
}

/**
 * Os atributos de fábrica: a sigla e o valor com que toda ficha nasce.
 *
 * MOLDE, como os medidores da campanha: criar um aqui o põe em cada
 * personagem que já existe, e dali em diante ele é da ficha. Editar o valor
 * aqui muda o de PARTIDA das fichas novas, e não o FOR que o Edgar já tem.
 * "Aplicar em todos" é o gesto com nome para quem ficou sem: põe o que falta e
 * pula a sigla que a ficha já tem.
 *
 * Os mesmos cartões da ficha, para o mestre montar o sistema vendo o que a
 * ficha vai mostrar.
 *
 * Aqui o atributo pede a sigla ANTES de existir, ao contrário da ficha: criar
 * já o põe em todo personagem, e por ser molde, renomear o modelo depois não
 * renomeia as fichas. Um "ATR" de passagem viraria um "ATR" em cada ficha da
 * mesa, para trocar de uma em uma.
 */
export function AtributosDaCampanha({ modelos, reler }: AtributosDaCampanhaLidos) {
  const [ocupado, setOcupado] = useState(false);

  // As fichas abertas releem: criar um atributo aqui mexe no índice de
  // personagens, e sem isto elas seguiriam sem ele até alguém tocar nelas.
  const { personagens, recarregar } = useCharacters();
  const quantos = personagens?.length ?? 0;

  /** Roda a chamada, relê os dois lados e destrava. */
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
  const cheio = lista.length >= MAX_ATRIBUTOS;

  async function criar(sigla: string, valor: number, descricao: string) {
    await mexer(async () => {
      const { alcancados } = await criarAtributoDaCampanha(
        sigla,
        valor,
        descricao || null,
      );

      toast.success(
        alcancados === 0
          ? t.configuracao.atributoCriado
          : t.configuracao.atributoCriadoEm(alcancados),
      );
    }, t.configuracao.falhaAoCriarAtributo);
  }

  async function aplicar() {
    await mexer(async () => {
      const { alcancados } = await aplicarAtributosEmTodos();

      toast.success(t.configuracao.aplicadoEm(alcancados, quantos));
    }, t.configuracao.falhaAoAplicar);
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">
            {t.configuracao.atributosDaCampanha}
          </h3>
          <p className="text-muted-foreground text-[11px] leading-snug">
            {t.configuracao.atributosDaCampanhaNota}
          </p>
        </div>

        {/* O mesmo par de ícones dos medidores da campanha: aplicar, e criar.
            O aviso de quem não ganha outro fica no tooltip. */}
        {lista.length > 0 ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.configuracao.aplicarAtributosEmTodos}
                  disabled={ocupado || quantos === 0}
                  onClick={() => void aplicar()}
                >
                  <Wand2 />
                </Button>
              }
            />
            <TooltipContent>
              <p className="font-medium">
                {t.configuracao.aplicarAtributosEmTodos}
              </p>
              <p className="text-muted-foreground max-w-56">
                {t.configuracao.aplicarAtributosEmTodosNota}
              </p>
            </TooltipContent>
          </Tooltip>
        ) : null}

        <NovoAtributo
          cheio={cheio}
          ocupado={ocupado}
          onCriar={(sigla, valor, descricao) => void criar(sigla, valor, descricao)}
        />
      </div>

      {modelos === null ? (
        <p className="text-muted-foreground text-[11px]">
          {t.configuracao.lendo}
        </p>
      ) : lista.length === 0 ? (
        <PainelVazio icone={Hash}>{t.configuracao.nenhumAtributo}</PainelVazio>
      ) : (
        <GradeDeAtributos>
          {lista.map((modelo) => (
            <CartaoDeAtributo
              key={modelo.id}
              sigla={modelo.sigla}
              valor={modelo.valor}
              descricao={modelo.descricao}
              onSigla={(sigla) =>
                void mexer(
                  () => editarAtributoDaCampanha(modelo.id, { sigla }),
                  t.configuracao.falhaAoGravar,
                )
              }
              onValor={(valor) =>
                void mexer(
                  () => editarAtributoDaCampanha(modelo.id, { valor }),
                  t.configuracao.falhaAoGravar,
                )
              }
              onDescricao={(descricao) =>
                void mexer(
                  () => editarAtributoDaCampanha(modelo.id, { descricao }),
                  t.configuracao.falhaAoGravar,
                )
              }
              onApagar={() =>
                void mexer(
                  () => removerAtributoDaCampanha(modelo.id),
                  t.configuracao.falhaAoApagarAtributo,
                )
              }
            />
          ))}
        </GradeDeAtributos>
      )}
    </section>
  );
}

/**
 * O "+" dos atributos da campanha: sigla e valor inicial num popover, e só
 * então o atributo existe. Ver a nota de `AtributosDaCampanha`.
 */
function NovoAtributo({
  cheio,
  ocupado,
  onCriar,
}: {
  cheio: boolean;
  ocupado: boolean;
  onCriar: (sigla: string, valor: number, descricao: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [sigla, setSigla] = useState("");
  const [valor, setValor] = useState("0");
  const [descricao, setDescricao] = useState("");

  const numero = Number.parseInt(valor, 10);
  const pronto = sigla.trim() !== "" && !Number.isNaN(numero);

  function criar() {
    if (!pronto) return;

    onCriar(
      sigla.trim(),
      Math.max(-MAX_VALOR_ATRIBUTO, Math.min(MAX_VALOR_ATRIBUTO, numero)),
      descricao.trim(),
    );
    setAberto(false);
    setSigla("");
    setValor("0");
    setDescricao("");
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.configuracao.criarAtributo}
                  disabled={cheio || ocupado}
                >
                  <Plus />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          <p className="font-medium">{t.configuracao.criarAtributo}</p>
          {cheio ? (
            <p className="text-muted-foreground max-w-48">
              {t.configuracao.limiteDeAtributos(MAX_ATRIBUTOS)}
            </p>
          ) : null}
        </TooltipContent>
      </Tooltip>

      <PopoverContent side="bottom" align="end" className="w-60">
        {/* Formulário, para o Enter de qualquer um dos dois campos criar. */}
        <form
          className="space-y-2"
          onSubmit={(evento) => {
            evento.preventDefault();
            criar();
          }}
        >
          <div className="flex gap-2">
            <label className="min-w-0 flex-1 space-y-1">
              <span className="text-muted-foreground text-[11px]">
                {t.configuracao.siglaDoAtributo}
              </span>
              <Input
                autoFocus
                value={sigla}
                maxLength={MAX_SIGLA}
                placeholder={t.configuracao.exemploDeSigla}
                onChange={(evento) => setSigla(evento.target.value)}
                className="h-8 text-sm uppercase"
              />
            </label>

            <label className="w-24 space-y-1">
              <span className="text-muted-foreground text-[11px]">
                {t.configuracao.valorInicial}
              </span>
              <Input
                inputMode="numeric"
                value={valor}
                onFocus={(evento) => evento.currentTarget.select()}
                onChange={(evento) => setValor(evento.target.value)}
                className="h-8 text-sm tabular-nums"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-muted-foreground text-[11px]">
              {t.configuracao.descricaoDoAtributo}
            </span>
            {/* Enter aqui cria, como nos outros dois campos: a descrição é uma
                frase de balão, e uma quebra de linha nela é raridade. Shift
                quebra. */}
            <Textarea
              value={descricao}
              maxLength={MAX_DESCRICAO_ATRIBUTO}
              onChange={(evento) => setDescricao(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === "Enter" && !evento.shiftKey) {
                  evento.preventDefault();
                  criar();
                }
              }}
              className="min-h-14 resize-none text-xs"
            />
          </label>

          <Button type="submit" size="sm" className="w-full" disabled={!pronto}>
            {t.configuracao.criar}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
