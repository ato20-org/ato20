"use client";

import { useState } from "react";
import { Eye, EyeOff, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DesenhoDoMedidor } from "@/components/playground/desenho-do-medidor";
import { CorEForma } from "@/components/mestre/cor-e-forma";
import { SecaoFicha } from "@/components/mestre/secao-ficha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCampoDeNome } from "@/hooks/use-campo-de-nome";
import { medidoresVisiveis } from "@/lib/medidor";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import {
  criarMedidor,
  editarMedidor,
  removerMedidor,
} from "@/lib/vault/characters";
import {
  MAX_MEDIDORES,
  type Medidor,
  type PatchMedidor,
  type Personagem,
} from "@/types/character";

/** O teto com que um medidor nasce. Dez é a escala da maioria das mesas. */
const MAXIMO_INICIAL = 10;

/** A largura da prévia, em pixels. Aproxima a coluna ao lado de um retrato. */
const LARGURA_DA_PREVIA = 150;

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
 * ## A prévia é uma só, no fim
 *
 * Não uma por linha. A pergunta que ela responde é "como isto fica na mesa", e
 * a mesa mostra os medidores empilhados numa coluna, um sob o outro — uma
 * prévia por linha responderia sobre cada um isolado, que é a única forma em
 * que eles nunca aparecem. E ela mostra só o que a mesa vê: é ali que o mestre
 * confere que o relógio da desgraça não está no ar.
 */
export function MedidoresPersonagem({
  personagem,
  onChanged,
}: {
  personagem: Personagem;
  onChanged: () => void;
}) {
  const lista = personagem.medidores ?? [];
  const naMesa = medidoresVisiveis(lista);
  const cheio = lista.length >= MAX_MEDIDORES;

  async function criar() {
    try {
      await criarMedidor(
        personagem.id,
        // O primeiro é quase sempre vida, e acertar o nome mais provável
        // economiza o gesto mais comum. Do segundo em diante não há palpite
        // honesto a dar.
        lista.length === 0 ? "Vida" : "Medidor",
        // Cor diferente da anterior, ciclando a paleta: dois medidores
        // vermelhos ao lado do mesmo rosto se leem como um só partido em dois.
        CORES_LAPIS[lista.length % CORES_LAPIS.length] ?? CORES_LAPIS[0],
        "barra",
        MAXIMO_INICIAL,
      );
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao criar.");
    }
  }

  const novo = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Criar medidor"
            disabled={cheio}
            onClick={() => void criar()}
          >
            <Plus />
          </Button>
        }
      />
      <TooltipContent>
        <p className="font-medium">Criar medidor</p>
        {cheio ? (
          <p className="text-muted-foreground max-w-48">
            {MAX_MEDIDORES} é o limite: mais que isso, a coluna fica mais alta
            que o retrato ao lado dela.
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <SecaoFicha
      secao="medidores"
      titulo="Medidores"
      contagem={lista.length}
      acao={novo}
    >
      {lista.length === 0 ? (
        <p className="text-muted-foreground text-[11px] leading-snug">
          Um número que sobe e desce: vida, sanidade, munição, tochas. Aparece
          ao lado do retrato de {personagem.nome} na mesa.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {lista.map((medidor) => (
            <LinhaDeMedidor
              key={medidor.id}
              personagemId={personagem.id}
              medidor={medidor}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}

      {naMesa.length > 0 ? (
        <div className="space-y-1.5 pt-1">
          <Label className="text-muted-foreground text-[10px] font-normal">
            Na mesa
          </Label>
          {/* Fundo escuro, e não o do painel: a coluna desenha sobre o MAPA, e
              o branco e o preto do texto foram escolhidos para isso. Numa
              prévia clara, a mesma peça pareceria ilegível sem ser. */}
          <div className="w-fit space-y-1.5 rounded bg-neutral-900 p-2">
            {naMesa.map((medidor) => (
              <DesenhoDoMedidor
                key={medidor.id}
                medidor={medidor}
                largura={LARGURA_DA_PREVIA}
                corpo={11}
              />
            ))}
          </div>
        </div>
      ) : null}
    </SecaoFicha>
  );
}

function LinhaDeMedidor({
  personagemId,
  medidor,
  onChanged,
}: {
  personagemId: string;
  medidor: Medidor;
  onChanged: () => void;
}) {
  async function editar(patch: PatchMedidor) {
    try {
      await editarMedidor(personagemId, medidor.id, patch);
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao gravar.");
    }
  }

  async function apagar() {
    try {
      await removerMedidor(personagemId, medidor.id);
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao apagar.");
    }
  }

  const nome = useCampoDeNome({
    nome: medidor.nome,
    aoGravar: (valor) => void editar({ nome: valor }),
  });

  return (
    <li className="space-y-1">
      <div className="flex items-center gap-1">
        <CorEForma
          cor={medidor.cor}
          estilo={medidor.estilo}
          onCor={(cor) => void editar({ cor })}
          onEstilo={(estilo) => void editar({ estilo })}
        />

        {/* Campo sempre aberto, e não um modo de renome atrás do menu: esta
            seção é um formulário, e a lista de aparências ao lado é uma lista
            de escolhas. Num formulário, um clique para poder digitar é um
            clique a mais em toda linha. */}
        <Input
          {...nome}
          aria-label="Nome do medidor"
          className="h-7 min-w-0 flex-1 px-2 text-xs"
        />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={
                  medidor.escondido ? "Mostrar para a mesa" : "Esconder da mesa"
                }
                aria-pressed={medidor.escondido}
                onClick={() => void editar({ escondido: !medidor.escondido })}
              >
                {medidor.escondido ? <EyeOff /> : <Eye />}
              </Button>
            }
          />
          <TooltipContent>
            <p className="font-medium">
              {medidor.escondido ? "Só você vê" : "A mesa vê"}
            </p>
            <p className="text-muted-foreground max-w-48">
              Escondido não sai do aplicativo — nem para o celular do dono do
              personagem.
            </p>
          </TooltipContent>
        </Tooltip>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Apagar medidor"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => void apagar()}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="flex items-center gap-1 pl-7">
        {/* Os passos de um em um, e não uma régua: o dano da mesa é dito em
            números inteiros ("leva sete"), e o campo aceita o número direto.
            Os botões existem para o um a mais e o um a menos, que é o gesto
            repetido — carga gasta, tocha apagada. */}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Menos um"
          disabled={medidor.atual <= 0}
          onClick={() => void editar({ atual: medidor.atual - 1 })}
        >
          <Minus />
        </Button>

        <CampoNumero
          rotulo="Valor atual"
          valor={medidor.atual}
          onGravar={(atual) => void editar({ atual })}
        />

        <span className="text-muted-foreground text-xs">/</span>

        <CampoNumero
          rotulo="Valor máximo"
          valor={medidor.maximo}
          onGravar={(maximo) => void editar({ maximo })}
        />

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Mais um"
          disabled={medidor.atual >= medidor.maximo}
          onClick={() => void editar({ atual: medidor.atual + 1 })}
        >
          <Plus />
        </Button>
      </div>
    </li>
  );
}

/**
 * Um número que grava ao sair do campo.
 *
 * Rascunho local porque o campo passa por estados que não são número: apagar
 * "20" para digitar "8" passa pelo vazio, e gravar a cada tecla mandaria um
 * zero ao disco no meio da digitação — com o clamp do Rust puxando o `atual`
 * junto, o que some com o valor que estava lá.
 *
 * O que não é número sai sem gravar, como o nome vazio em `useCampoDeNome`: um
 * campo limpo por engano não é um pedido.
 */
function CampoNumero({
  rotulo,
  valor,
  onGravar,
}: {
  rotulo: string;
  valor: number;
  onGravar: (valor: number) => void;
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);

  function terminar() {
    const atual = rascunho;
    setRascunho(null);
    if (atual === null) return;

    const numero = Number.parseInt(atual, 10);
    if (Number.isNaN(numero) || numero === valor) return;

    onGravar(numero);
  }

  return (
    <Input
      aria-label={rotulo}
      inputMode="numeric"
      value={rascunho ?? String(valor)}
      className="h-7 w-14 px-2 text-center text-xs tabular-nums"
      onChange={(evento) => setRascunho(evento.target.value)}
      onBlur={terminar}
      onKeyDown={(evento) => {
        if (evento.key === "Enter") evento.currentTarget.blur();
        if (evento.key === "Escape") {
          setRascunho(null);
          evento.currentTarget.blur();
        }
      }}
    />
  );
}
