"use client";

import { Check, Pencil } from "lucide-react";
import { memo, useState } from "react";

import { IconeD20 } from "@/components/mestre/icone-d20";
import { DadoEstatico } from "@/components/mestre/saquinho-dados";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/lib/i18n/personagens";
import { rolarExpressao } from "@/lib/mestre/dados-actions";
import {
  lerExpressaoDeRolagem,
  textoDaExpressao,
  textoDoModificador,
  type ErroDaExpressao,
  type ExpressaoDeRolagem,
} from "@/lib/mestre/expressao-de-rolagem";
import { cn } from "@/lib/utils";
import { tipoDado } from "@/types/dado";
import { MAX_ROLAGEM, type Detalhe } from "@/types/detalhe";

/** Quantos dados de um termo a ficha desenha. Passando, o resto vira `×N`. */
const DADOS_A_VISTA = 5;

/** O lado do dado pequeno, em px. Da altura da letra do valor. */
const LADO_DO_DADO = 16;

/**
 * A rolagem de um detalhe na ficha: o d20 para escrever, a expressão para
 * rolar, o lápis para trocar.
 *
 * Sem expressão, um d20 em traço: o clique abre o campo. Com ela, os dados
 * desenhados como os da mesa -- dois d20 são dois d20 -- e o modificador ao
 * lado; o clique joga na mesa e anuncia no fio, com `rotulo` ("Dante ·
 * Luta"). Só existe quando o molde liga o d20 do detalhe: quem decide se Luta
 * rola é a campanha, e quanto, a ficha.
 */
export function RolagemDoDetalhe({
  detalhe,
  rotulo,
  onGravar,
  editando: editandoDeFora,
  onEditando,
  semLapis = false,
  className,
}: {
  detalhe: Detalhe;
  /** O que o fio diz da rolagem: "Dante · Luta". */
  rotulo: string;
  onGravar: (rolagem: string) => void;
  /** A edição controlada de fora: o item "Editar rolagem" do menu da linha. */
  editando?: boolean;
  onEditando?: (editando: boolean) => void;
  /** Sem o lápis ao lado: quem edita é o menu da linha. */
  semLapis?: boolean;
  className?: string;
}) {
  const [editandoAqui, setEditandoAqui] = useState(false);
  const editando = editandoDeFora ?? editandoAqui;
  const setEditando = onEditando ?? setEditandoAqui;
  const leitura = detalhe.rolagem ? lerExpressaoDeRolagem(detalhe.rolagem) : null;

  if (editando) {
    return (
      <CampoDaRolagem
        rotulo={detalhe.rotulo}
        valor={detalhe.rolagem ?? ""}
        onGravar={(rolagem) => {
          setEditando(false);
          if (rolagem !== (detalhe.rolagem ?? "")) onGravar(rolagem);
        }}
        onDesistir={() => setEditando(false)}
        className={className}
      />
    );
  }

  if (!leitura) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t.detalhes.escreverRolagem(detalhe.rotulo)}
              onClick={() => setEditando(true)}
              className={cn(
                "text-muted-foreground hover:text-foreground size-5 shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
                className,
              )}
            >
              <IconeD20 />
            </Button>
          }
        />
        <TooltipContent>{t.detalhes.escreverRolagem(detalhe.rotulo)}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={cn("flex min-w-0 shrink-0 items-center gap-0.5", className)}>
      {leitura.ok ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={t.detalhes.rolar(detalhe.rotulo, textoDaExpressao(leitura.expressao))}
                onClick={() => rolarExpressao(leitura.expressao, rotulo)}
                className="hover:bg-accent focus-visible:ring-ring flex min-w-0 items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2"
              >
                <DadosDaExpressao expressao={leitura.expressao} />
                {leitura.expressao.modificador !== 0 ? (
                  <span className="text-xs font-medium tabular-nums">
                    {textoDoModificador(leitura.expressao.modificador)}
                  </span>
                ) : null}
              </button>
            }
          />
          <TooltipContent>
            <p className="font-medium">{t.detalhes.rolar(detalhe.rotulo, textoDaExpressao(leitura.expressao))}</p>
            <p className="text-muted-foreground">{detalhe.rolagem}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        // A expressão gravada que não se lê mais: o arquivo mexido à mão, ou
        // a regra que mudou. Aparece como texto, e o clique abre para
        // corrigir -- rolar outra coisa calado seria pior.
        <button
          type="button"
          onClick={() => setEditando(true)}
          title={mensagemDoErro(leitura.erro)}
          className="text-destructive truncate rounded px-1 text-xs line-through"
        >
          {detalhe.rolagem}
        </button>
      )}
      {semLapis ? null : (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t.detalhes.editarRolagem(detalhe.rotulo)}
          onClick={() => setEditando(true)}
          className="text-muted-foreground hover:text-foreground size-5 shrink-0 [&_svg:not([class*='size-'])]:size-3"
        >
          <Pencil />
        </Button>
      )}
    </div>
  );
}

/** Os dados da expressão, desenhados como os da mesa, na ordem em que foram escritos. */
const DadosDaExpressao = memo(function DadosDaExpressao({ expressao }: { expressao: ExpressaoDeRolagem }) {
  return (
    <span className="flex items-center">
      {expressao.dados.map(({ quantidade, faces }, termo) => (
        <span key={termo} className="flex items-center">
          {Array.from({ length: Math.min(quantidade, DADOS_A_VISTA) }, (_, i) => (
            <DadoEstatico key={i} tipo={tipoDado(faces)} tamanho={LADO_DO_DADO} />
          ))}
          {quantidade > DADOS_A_VISTA ? (
            <span className="text-muted-foreground text-[10px] tabular-nums">×{quantidade}</span>
          ) : null}
        </span>
      ))}
    </span>
  );
});

/**
 * O campo da expressão. Enter grava se a expressão se lê; Esc desiste; sair
 * do campo grava o que se lê e desiste do resto. Vazio apaga a rolagem.
 */
function CampoDaRolagem({
  rotulo,
  valor,
  onGravar,
  onDesistir,
  className,
}: {
  rotulo: string;
  valor: string;
  onGravar: (rolagem: string) => void;
  onDesistir: () => void;
  className?: string;
}) {
  const [texto, setTexto] = useState(valor);
  const [erro, setErro] = useState<ErroDaExpressao | null>(null);

  /** `true` se gravou. Vazio grava: é apagar. */
  function tentar(): boolean {
    const limpo = texto.trim();
    if (limpo === "") {
      onGravar("");
      return true;
    }

    const leitura = lerExpressaoDeRolagem(limpo);
    if (!leitura.ok) {
      setErro(leitura.erro);
      return false;
    }

    onGravar(limpo);
    return true;
  }

  return (
    <div className={cn("relative flex min-w-0 flex-1 items-center gap-0.5", className)}>
      <input
        autoFocus
        value={texto}
        maxLength={MAX_ROLAGEM}
        placeholder={t.detalhes.exemploDeRolagem}
        aria-label={t.detalhes.rolagemDe(rotulo)}
        aria-invalid={erro !== null}
        onChange={(evento) => {
          setTexto(evento.target.value);
          setErro(null);
        }}
        onKeyDown={(evento) => {
          if (evento.key === "Enter") {
            evento.preventDefault();
            tentar();
          } else if (evento.key === "Escape") {
            evento.preventDefault();
            evento.stopPropagation();
            onDesistir();
          }
        }}
        onBlur={() => {
          if (!tentar()) onDesistir();
        }}
        className={cn(
          "border-input bg-background w-full min-w-0 rounded border px-1 py-0.5 font-mono text-xs outline-none",
          erro && "border-destructive",
        )}
      />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t.detalhes.pronto}
        onMouseDown={(evento) => evento.preventDefault()}
        onClick={() => tentar()}
        className="text-muted-foreground hover:text-foreground size-5 shrink-0 [&_svg:not([class*='size-'])]:size-3"
      >
        <Check />
      </Button>
      {erro ? (
        <p role="alert" className="text-destructive absolute top-full left-0 z-10 mt-0.5 text-[10px] leading-tight">
          {mensagemDoErro(erro)}
        </p>
      ) : null}
    </div>
  );
}

function mensagemDoErro(erro: ErroDaExpressao): string {
  return t.detalhes.errosDaRolagem[erro];
}
