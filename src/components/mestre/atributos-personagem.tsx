"use client";

import {
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import { Info, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SecaoFicha } from "@/components/mestre/secao-ficha";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { t } from "@/lib/i18n/personagens";
import { cn } from "@/lib/utils";
import {
  criarAtributo,
  editarAtributo,
  removerAtributo,
} from "@/lib/vault/characters";
import {
  MAX_ATRIBUTOS,
  MAX_DESCRICAO_ATRIBUTO,
  MAX_SIGLA,
  MAX_VALOR_ATRIBUTO,
  type PatchAtributo,
  type Personagem,
} from "@/types/character";

/**
 * Os atributos do personagem: FOR 4, AGI 2, INT 1.
 *
 * Cartões, e não linhas como os medidores: o atributo é um número para ler de
 * relance e comparar com o do lado, e numa fileira de cartões o olho acha o
 * FOR sem ler a lista. Quatro por fileira na coluna larga da ficha.
 *
 * Sem diálogo de criação, pela mesma razão dos medidores: ele nasce com a
 * sigla marcada para escrever por cima, e o valor se corrige no próprio
 * cartão. Para pôr os mesmos em todo personagem, o caminho é a configuração
 * da campanha -- ver `AtributosDaCampanha`.
 */
export function AtributosPersonagem({
  personagem,
  onChanged,
}: {
  personagem: Personagem;
  onChanged: () => void;
}) {
  const lista = personagem.atributos ?? [];
  const cheio = lista.length >= MAX_ATRIBUTOS;

  /** O recém-criado, para o cartão dele nascer com a sigla em edição. */
  const [novo, setNovo] = useState<string | null>(null);

  async function criar() {
    try {
      const atributo = await criarAtributo(
        personagem.id,
        t.atributos.siglaNova,
        0,
      );
      setNovo(atributo.id);
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.geral.falhas.criar);
    }
  }

  async function gravar(atributoId: string, patch: PatchAtributo) {
    try {
      await editarAtributo(personagem.id, atributoId, patch);
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.geral.falhas.gravar);
    }
  }

  async function apagar(atributoId: string) {
    try {
      await removerAtributo(personagem.id, atributoId);
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.geral.falhas.apagar);
    }
  }

  const acao = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t.atributos.criar}
            disabled={cheio}
            onClick={() => void criar()}
          >
            <Plus />
          </Button>
        }
      />
      <TooltipContent>
        <p className="font-medium">{t.atributos.criar}</p>
        {cheio ? (
          <p className="text-muted-foreground max-w-48">
            {t.atributos.limite(MAX_ATRIBUTOS)}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <SecaoFicha
      secao="atributos"
      titulo={t.atributos.titulo}
      contagem={lista.length}
      acao={acao}
    >
      {lista.length === 0 ? (
        <p className="text-muted-foreground text-[11px] leading-snug">
          {t.atributos.vazio}
        </p>
      ) : (
        <GradeDeAtributos>
          {lista.map((atributo) => (
            <CartaoDeAtributo
              key={atributo.id}
              sigla={atributo.sigla}
              valor={atributo.valor}
              descricao={atributo.descricao}
              editarSigla={atributo.id === novo}
              onSigla={(sigla) => {
                setNovo(null);
                void gravar(atributo.id, { sigla });
              }}
              onValor={(valor) => void gravar(atributo.id, { valor })}
              onDescricao={(descricao) => void gravar(atributo.id, { descricao })}
              onApagar={() => void apagar(atributo.id)}
            />
          ))}
        </GradeDeAtributos>
      )}
    </SecaoFicha>
  );
}

/**
 * A fileira de cartões. `auto-fill` com piso de 3,5rem: quatro na coluna larga
 * da ficha, e quantos couberem numa coluna estreita ou na configuração.
 */
export function GradeDeAtributos({ children }: { children: React.ReactNode }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1.5">
      {children}
    </ul>
  );
}

/**
 * Um atributo: a sigla em cima, o número grande embaixo.
 *
 * Os dois são campos o tempo todo, desenhados como texto até o foco. Um clique
 * no número já é o cursor nele, sem um "editar" no meio, porque mudar o valor
 * é o gesto inteiro deste cartão. As setas sobem e descem de um em um.
 *
 * Serve à ficha e aos atributos da campanha: o cartão não sabe onde grava.
 */
export function CartaoDeAtributo({
  sigla,
  valor,
  descricao,
  editarSigla = false,
  onSigla,
  onValor,
  onDescricao,
  onApagar,
}: {
  sigla: string;
  valor: number;
  descricao: string | undefined;
  /** Nasce com o foco na sigla e o texto marcado -- o recém-criado. */
  editarSigla?: boolean;
  onSigla: (sigla: string) => void;
  onValor: (valor: number) => void;
  /** `""` apaga. */
  onDescricao: (descricao: string) => void;
  onApagar: () => void;
}) {
  return (
    <li className="group/atributo bg-muted/40 focus-within:border-ring relative flex flex-col items-center rounded-md border px-1 pt-1.5 pb-1">
      <CampoDaSigla
        sigla={sigla}
        autoFocus={editarSigla}
        onGravar={onSigla}
      />
      <CampoDoValor sigla={sigla} valor={valor} onGravar={onValor} />

      <DescricaoDoAtributo
        sigla={sigla}
        descricao={descricao}
        onGravar={onDescricao}
      />

      {/* Lixeira, e não X: apaga o atributo, e não o tira de uma lista. Sob o
          cursor e no foco, como o apagar do medidor; `opacity` e não `hidden`
          para ele continuar na ordem do teclado. */}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t.atributos.apagar(sigla)}
        onClick={onApagar}
        className={cn(
          "text-muted-foreground hover:text-destructive absolute top-0 right-0 size-5 [&_svg:not([class*='size-'])]:size-3",
          SO_NO_CARTAO,
        )}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

/** Some até o cursor entrar no cartão; fica enquanto o popover dele está aberto. */
const SO_NO_CARTAO =
  "opacity-0 transition-opacity group-hover/atributo:opacity-100 group-focus-within/atributo:opacity-100 data-[popup-open]:opacity-100 motion-reduce:transition-none";

/**
 * O ⓘ do canto: o hover mostra a descrição, o clique a escreve.
 *
 * No canto e só sob o cursor, como a lixeira do outro lado: o cartão é um
 * número para ler de relance, e um ícone fixo em cada um dos doze disputaria
 * o olho com o número. Quem quer saber o que é VIG passa o mouse.
 *
 * Grava ao sair do campo, e não a cada tecla: a descrição vai para o índice
 * de personagens, e cada letra seria uma reescrita dele.
 */
function DescricaoDoAtributo({
  sigla,
  descricao,
  onGravar,
}: {
  sigla: string;
  descricao: string | undefined;
  onGravar: (descricao: string) => void;
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t.atributos.descricao(sigla)}
                  className={cn(
                    "text-muted-foreground hover:text-foreground absolute top-0 left-0 size-5 [&_svg:not([class*='size-'])]:size-3",
                    SO_NO_CARTAO,
                  )}
                >
                  <Info />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          {descricao ? (
            <>
              <p className="max-w-56 whitespace-pre-line">{descricao}</p>
              <p className="text-muted-foreground">{t.atributos.editarDescricao}</p>
            </>
          ) : (
            <p className="max-w-48">{t.atributos.semDescricao}</p>
          )}
        </TooltipContent>
      </Tooltip>

      <PopoverContent side="bottom" align="start" className="w-64 space-y-1.5">
        <p className="text-xs font-medium">{t.atributos.descricao(sigla)}</p>
        <Textarea
          autoFocus
          defaultValue={descricao ?? ""}
          maxLength={MAX_DESCRICAO_ATRIBUTO}
          placeholder={t.atributos.exemploDeDescricao}
          aria-label={t.atributos.descricao(sigla)}
          className="min-h-16 resize-y text-xs"
          onBlur={(evento) => {
            const texto = evento.target.value.trim();
            if (texto === (descricao ?? "")) return;

            onGravar(texto);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * O campo nasce com o texto todo marcado, também quando o foco veio do mouse.
 *
 * `select()` no `focus` só não basta para o clique: o `mouseup` do mesmo gesto
 * chega depois e põe o cursor onde o ponteiro estava, desmarcando. Clicar à
 * esquerda do 0 e digitar 4 dava 40. Segurar aquele `mouseup` -- só o do
 * clique que TROUXE o foco -- mantém a marcação; num campo já focado, o clique
 * posiciona o cursor como sempre.
 */
export function useMarcarAoFocar() {
  /** O `mousedown` que está trazendo o foco para cá, e não um num campo já focado. */
  const focandoPeloMouse = useRef(false);

  return {
    onMouseDown: (evento: MouseEvent<HTMLInputElement>) => {
      focandoPeloMouse.current = document.activeElement !== evento.currentTarget;
    },
    onFocus: (evento: FocusEvent<HTMLInputElement>) => {
      evento.currentTarget.select();
    },
    onMouseUp: (evento: MouseEvent<HTMLInputElement>) => {
      if (!focandoPeloMouse.current) return;

      focandoPeloMouse.current = false;
      evento.preventDefault();
    },
  };
}

/**
 * Esc desiste e Enter grava, pelo mesmo `blur`: uma escrita só, num lugar só.
 * A marca de desistência é um `ref` porque ela é lida no `blur` do mesmo gesto.
 */
export function aoTeclar(
  evento: KeyboardEvent<HTMLInputElement>,
  desistiu: RefObject<boolean>,
) {
  if (evento.key === "Enter") evento.currentTarget.blur();

  if (evento.key === "Escape") {
    desistiu.current = true;
    evento.currentTarget.blur();
  }
}

function CampoDaSigla({
  sigla,
  autoFocus,
  onGravar,
}: {
  sigla: string;
  autoFocus: boolean;
  onGravar: (sigla: string) => void;
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const desistiu = useRef(false);
  const marcar = useMarcarAoFocar();

  return (
    <input
      aria-label={t.atributos.sigla(sigla)}
      value={rascunho ?? sigla}
      maxLength={MAX_SIGLA}
      autoFocus={autoFocus}
      {...marcar}
      onChange={(evento) => setRascunho(evento.target.value)}
      onKeyDown={(evento) => aoTeclar(evento, desistiu)}
      onBlur={() => {
        const lido = rascunho?.trim();
        setRascunho(null);

        if (desistiu.current) {
          desistiu.current = false;
          return;
        }
        // Vazio não é pedido: um campo limpo por engano volta ao que era.
        if (!lido || lido === sigla) return;

        onGravar(lido);
      }}
      className="text-muted-foreground focus:text-foreground focus:bg-background w-full min-w-0 rounded bg-transparent text-center text-[11px] font-medium tracking-wide uppercase outline-none"
    />
  );
}

/**
 * O número. Rascunho local pelo mesmo motivo do campo do medidor: trocar "4"
 * por "12" passa pelo vazio, e gravar a cada tecla mandaria esse vazio ao
 * disco. O que não é número sai sem gravar.
 */
function CampoDoValor({
  sigla,
  valor,
  onGravar,
}: {
  sigla: string;
  valor: number;
  onGravar: (valor: number) => void;
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const desistiu = useRef(false);
  const marcar = useMarcarAoFocar();

  const mostrado = rascunho ?? String(valor);

  function passo(delta: number) {
    const atual = Number.parseInt(mostrado, 10);
    const base = Number.isNaN(atual) ? valor : atual;
    const proximo = Math.max(
      -MAX_VALOR_ATRIBUTO,
      Math.min(MAX_VALOR_ATRIBUTO, base + delta),
    );

    setRascunho(String(proximo));
  }

  return (
    <input
      aria-label={t.atributos.valor(sigla)}
      inputMode="numeric"
      value={mostrado}
      {...marcar}
      onChange={(evento) => setRascunho(evento.target.value)}
      onKeyDown={(evento) => {
        // As setas preparam o número e só o `blur` grava: segurar a seta de
        // 4 a 12 seriam oito escritas no índice, cada uma relendo a ficha.
        if (evento.key === "ArrowUp" || evento.key === "ArrowDown") {
          evento.preventDefault();
          passo(evento.key === "ArrowUp" ? 1 : -1);
          return;
        }

        aoTeclar(evento, desistiu);
      }}
      onBlur={() => {
        const lido = rascunho;
        setRascunho(null);

        if (desistiu.current) {
          desistiu.current = false;
          return;
        }
        if (lido === null) return;

        const numero = Number.parseInt(lido, 10);
        if (Number.isNaN(numero) || numero === valor) return;

        onGravar(numero);
      }}
      className="focus:bg-background w-full min-w-0 rounded bg-transparent text-center text-2xl leading-tight font-medium tabular-nums outline-none"
    />
  );
}
