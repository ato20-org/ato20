"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Check,
  ChevronRight,
  GripVertical,
  MessageSquareText,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { aoTeclar, useMarcarAoFocar } from "@/components/mestre/atributos-personagem";
import { IconeD20 } from "@/components/mestre/icone-d20";
import { RolagemDoDetalhe } from "@/components/mestre/rolagem-do-detalhe";
import { SecaoFicha } from "@/components/mestre/secao-ficha";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useListReorder } from "@/hooks/use-list-reorder";
import { t } from "@/lib/i18n/personagens";
import { useMoldeDeDetalhes, useMoldeDeDetalhesStore } from "@/lib/store/use-molde-de-detalhes-store";
import { cn } from "@/lib/utils";
import {
  criarDetalhe,
  editarDetalhe,
  listarDetalhes,
  removerDetalhe,
  reordenarDetalhes,
} from "@/lib/vault/detalhes";
import {
  chaveDoNome,
  grupoAvulso,
  MAX_DESCRICAO_DETALHE,
  MAX_DETALHES,
  MAX_NUMERO_DETALHE,
  MAX_ROTULO,
  MAX_TEXTO,
  type Detalhe,
  tipoDoNovo,
  type GrupoDeDetalhes,
  type ModeloDeDetalhe,
  type PatchDetalhe,
} from "@/types/detalhe";

/** Os detalhes de uma ficha aberta, e o gesto de reler. */
export type DetalhesDaFicha = {
  lista: Detalhe[] | null;
  recarregar: () => void;
};

/**
 * Lê os detalhes do personagem, e relê quando uma ação do molde mexeu nas
 * fichas (aplicar em todos, grupo renomeado). Um hook só para os dois lugares
 * da aba -- topo e embaixo -- não lerem o mesmo arquivo duas vezes.
 */
export function useDetalhesDaFicha(personagemId: string): DetalhesDaFicha {
  const [lista, setLista] = useState<Detalhe[] | null>(null);
  const fichasMudaram = useMoldeDeDetalhesStore((state) => state.fichasMudaram);

  const recarregar = useCallback(() => {
    listarDetalhes(personagemId).then(setLista, (cause: unknown) => {
      toast.error(cause instanceof Error ? cause.message : t.detalhes.falhaAoLer);
      setLista([]);
    });
  }, [personagemId]);

  useEffect(recarregar, [recarregar, fichasMudaram]);

  return { lista, recarregar };
}

/**
 * Os grupos de detalhes da aba Ficha, na ordem do molde.
 *
 * Os do molde aparecem mesmo vazios: o grupo Poderes vazio ainda é onde o "+"
 * mora. Os que só a ficha conhece (veio de outra campanha, ou o grupo saiu do
 * molde) aparecem no fim, em linhas.
 */
export function GruposDeDetalhes({
  personagemId,
  personagemNome,
  detalhes,
}: {
  personagemId: string;
  /** Para o fio dizer de quem é a rolagem: "Dante · Luta". */
  personagemNome: string;
  detalhes: DetalhesDaFicha;
}) {
  const molde = useMoldeDeDetalhes();
  if (!molde || !detalhes.lista) return null;

  const lista = detalhes.lista;
  const conhecidos = new Set(molde.grupos.map((grupo) => chaveDoNome(grupo.nome)));
  const avulsos = [...new Set(lista.map((detalhe) => detalhe.grupo))]
    .filter((nome) => !conhecidos.has(chaveDoNome(nome)))
    .map(grupoAvulso);

  const grupos = [...molde.grupos, ...avulsos];
  if (grupos.length === 0) return null;

  return (
    <>
      {grupos.map((grupo) => (
        <GrupoDaFicha
          key={grupo.id}
          personagemId={personagemId}
          personagemNome={personagemNome}
          grupo={grupo}
          todos={lista}
          detalhes={lista.filter((detalhe) => chaveDoNome(detalhe.grupo) === chaveDoNome(grupo.nome))}
          modelos={molde.modelos.filter((modelo) => chaveDoNome(modelo.grupo) === chaveDoNome(grupo.nome))}
          onChanged={detalhes.recarregar}
        />
      ))}
    </>
  );
}

function GrupoDaFicha({
  personagemId,
  personagemNome,
  grupo,
  todos,
  detalhes,
  modelos,
  onChanged,
}: {
  personagemId: string;
  personagemNome: string;
  grupo: GrupoDeDetalhes;
  todos: Detalhe[];
  detalhes: Detalhe[];
  modelos: ModeloDeDetalhe[];
  onChanged: () => void;
}) {
  /** O recém-criado: o rótulo dele nasce em edição, como a sigla do atributo. */
  const [novo, setNovo] = useState<string | null>(null);
  /** A ordem depois de um arrasto, até a releitura chegar. Ver `MedidoresPersonagem`. */
  const [arrastada, setArrastada] = useState<{ de: Detalhe[]; lista: Detalhe[] } | null>(null);

  const lista = arrastada && arrastada.de === todos ? arrastada.lista : detalhes;
  const cheio = todos.length >= MAX_DETALHES;

  // Quem rola é o molde, lido aqui, ao vivo: ligar o d20 na configuração
  // aparece nesta ficha sem reescrevê-la. Ver `ModeloDeDetalhe.rolavel`.
  const rolaveis = new Set(
    modelos.filter((modelo) => modelo.rolavel).map((modelo) => chaveDoNome(modelo.rotulo)),
  );

  const { listRef, dropIndex, startReorder } = useListReorder<string>((detalheId, index) => {
    const de = lista.findIndex((detalhe) => detalhe.id === detalheId);
    if (de < 0 || de === index) return;

    const arrumada = [...lista];
    const [movido] = arrumada.splice(de, 1);
    arrumada.splice(index, 0, movido!);

    setArrastada({ de: todos, lista: arrumada });
    reordenarDetalhes(
      personagemId,
      arrumada.map((detalhe) => detalhe.id),
    ).then(onChanged, (cause: unknown) => {
      setArrastada(null);
      toast.error(cause instanceof Error ? cause.message : t.geral.falhas.reordenar);
    });
  });

  async function criar() {
    try {
      const detalhe = await criarDetalhe(personagemId, {
        grupo: grupo.nome,
        rotulo: t.detalhes.novo,
        // O tipo do grupo é o dos que ele já tem: o "+" das perícias cria
        // número, o dos poderes cria texto. Ver `tipoDoNovo`.
        tipo: tipoDoNovo(lista, modelos),
      });
      setNovo(detalhe.id);
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.geral.falhas.criar);
    }
  }

  async function gravar(detalheId: string, patch: PatchDetalhe) {
    try {
      await editarDetalhe(personagemId, detalheId, patch);
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.geral.falhas.gravar);
    }
  }

  async function apagar(detalheId: string) {
    try {
      await removerDetalhe(personagemId, detalheId);
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
            aria-label={t.detalhes.criar(grupo.nome)}
            disabled={cheio}
            onClick={() => void criar()}
          >
            <Plus />
          </Button>
        }
      />
      <TooltipContent>
        <p className="font-medium">{t.detalhes.criar(grupo.nome)}</p>
        {cheio ? <p className="text-muted-foreground max-w-48">{t.detalhes.limite(MAX_DETALHES)}</p> : null}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <SecaoFicha secao={`det:${chaveDoNome(grupo.nome)}`} titulo={grupo.nome} contagem={lista.length} acao={acao}>
      {lista.length === 0 ? (
        <p className="text-muted-foreground text-[11px] leading-snug">{t.detalhes.vazio}</p>
      ) : (
        <ul
          ref={listRef}
          className={
            grupo.exibicao === "lista"
              ? "space-y-1"
              : "grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-1.5"
          }
        >
          {lista.map((detalhe, index) => {
            const comum = {
              detalhe,
              editarRotulo: detalhe.id === novo,
              dropTarget: dropIndex === index,
              onReorderStart: (evento: ReactPointerEvent) => {
                if (pegaOCartao(evento)) startReorder(evento, detalhe.id, LIMIAR_DO_ARRASTO);
              },
              onGravar: (patch: PatchDetalhe) => {
                if (patch.rotulo !== undefined) setNovo(null);
                void gravar(detalhe.id, patch);
              },
              onApagar: () => void apagar(detalhe.id),
              rolavel: rolaveis.has(chaveDoNome(detalhe.rotulo)),
              rotuloDaRolagem: `${personagemNome} · ${detalhe.rotulo}`,
            };
            return grupo.exibicao === "lista" ? (
              <EntradaDeLista key={detalhe.id} {...comum} />
            ) : (
              <LinhaDeDetalhe key={detalhe.id} {...comum} />
            );
          })}
        </ul>
      )}
    </SecaoFicha>
  );
}

/**
 * A mãozinha de arrastar no cartão, e o cursor de sempre no que ele não
 * arrasta -- o mesmo conjunto de `pegaOCartao`. O cursor é HERDADO: sem
 * devolver o de texto ao campo e o de botão aos botões, a mão apareceria em
 * cima do valor e dos dados, prometendo um arrasto que eles não fazem.
 */
const CURSOR_DO_CARTAO =
  "cursor-grab active:cursor-grabbing [&_input]:cursor-text [&_textarea]:cursor-text [&_[role='combobox']]:cursor-default [&_button:not([data-arrasta])]:cursor-default";

/**
 * Quantos pixels o ponteiro anda antes de o cartão virar arrasto. Abaixo
 * disso é clique: o cartão inteiro é pegável, e o toque continua tocando.
 */
const LIMIAR_DO_ARRASTO = 4;

/**
 * Pegar o cartão em qualquer lugar arrasta, menos no que é de digitar ou de
 * apertar: o campo do valor (selecionar o texto não pode levar o cartão
 * junto), os dados, o menu. O botão que é o próprio cartão -- o nome da
 * entrada de lista, que abre e fecha -- se marca com `data-arrasta`.
 */
function pegaOCartao(evento: ReactPointerEvent): boolean {
  return !(evento.target as Element).closest(
    "input, textarea, select, [contenteditable='true'], [role='combobox'], button:not([data-arrasta])",
  );
}

type PropsDaLinha = {
  detalhe: Detalhe;
  editarRotulo: boolean;
  dropTarget: boolean;
  onReorderStart: (evento: ReactPointerEvent) => void;
  onGravar: (patch: PatchDetalhe) => void;
  onApagar: () => void;
  /** O molde liga o d20 deste detalhe. */
  rolavel: boolean;
  rotuloDaRolagem: string;
};

/** Some até o cursor entrar na linha; fica enquanto o popover dela está aberto. */
const SO_NA_LINHA =
  "opacity-0 transition-opacity group-hover/detalhe:opacity-100 group-focus-within/detalhe:opacity-100 data-[popup-open]:opacity-100 motion-reduce:transition-none";

export function Alca({ onReorderStart }: { onReorderStart: (evento: ReactPointerEvent) => void }) {
  return (
    <span
      className={cn("text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none", SO_NA_LINHA)}
      aria-hidden
      onPointerDown={onReorderStart}
    >
      <GripVertical className="size-3.5" />
    </span>
  );
}

export function Lixeira({
  rotulo,
  onApagar,
  sempre = false,
}: {
  rotulo: string;
  onApagar: () => void;
  /** Sempre à vista, e não só sob o cursor: a tabela da configuração. */
  sempre?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={t.detalhes.apagar(rotulo)}
      onClick={onApagar}
      className={cn(
        "text-muted-foreground hover:text-destructive size-5 shrink-0 [&_svg:not([class*='size-'])]:size-3",
        !sempre && SO_NA_LINHA,
      )}
    >
      <Trash2 />
    </Button>
  );
}

/**
 * Solta o campo em que o foco está: o `blur` dele grava. É o que o ✓ faz
 * antes de fechar a edição.
 */
function soltarFoco() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

/**
 * O lápis: sempre à vista, como a lixeira. `ativo` vira ✓, o "pronto".
 *
 * Não rouba o foco no `mousedown`: se roubasse, o campo em edição perderia o
 * foco antes do clique, a edição fecharia pelo `blur` e o clique a reabriria.
 */
function Lapis({ rotulo, ativo = false, onClick }: { rotulo: string; ativo?: boolean; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={ativo ? t.detalhes.pronto : rotulo}
      aria-pressed={ativo}
      onMouseDown={(evento) => evento.preventDefault()}
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground size-5 shrink-0 [&_svg:not([class*='size-'])]:size-3"
    >
      {ativo ? <Check /> : <Pencil />}
    </Button>
  );
}

/**
 * Um detalhe de Identidade ou de Perícias, num cartão como o do atributo: o
 * nome pequeno em cima e o valor embaixo. Cartão, e não linha na largura
 * toda: com o nome numa ponta e o número na outra, a coluna virava nomes e
 * números soltos, sem dizer qual número é de quem. A alça, o balão e a
 * lixeira aparecem sob o cursor, nos cantos.
 */
function LinhaDeDetalhe({
  detalhe,
  editarRotulo,
  dropTarget,
  onReorderStart,
  onGravar,
  onApagar,
  rolavel,
  rotuloDaRolagem,
}: PropsDaLinha) {
  /** O nome em edição: pelo menu, ou porque o detalhe acabou de nascer. */
  const [editando, setEditando] = useState(editarRotulo);
  const [descricaoAberta, setDescricaoAberta] = useState(false);
  const [editandoRolagem, setEditandoRolagem] = useState(false);
  const menu = useDepoisDoMenu();

  return (
    <li
      onPointerDown={onReorderStart}
      className={cn(
        "group/detalhe bg-muted/40 focus-within:border-ring flex min-w-0 flex-col rounded-md border px-1.5 pt-1 pb-1",
        CURSOR_DO_CARTAO,
        dropTarget && "ring-primary ring-1",
      )}
    >
      <div className="flex min-w-0 items-center gap-0.5">
        {editando ? (
          <CampoDeTexto
            valor={detalhe.rotulo}
            maximo={MAX_ROTULO}
            rotulo={t.detalhes.rotulo(detalhe.rotulo)}
            autoFocus
            obrigatorio
            onGravar={(rotulo) => onGravar({ rotulo })}
            onFim={() => setEditando(false)}
            className="border-input w-full min-w-0 border px-0.5 text-[11px]"
          />
        ) : (
          // A descrição no `title` do nome: o balão que a mostrava saiu do
          // cartão (está no ⋮), e quem passa o mouse ainda a lê.
          <span
            className="text-muted-foreground min-w-0 flex-1 truncate px-0.5 text-[11px]"
            title={detalhe.descricao ? `${detalhe.rotulo}\n${detalhe.descricao}` : detalhe.rotulo}
          >
            {detalhe.rotulo}
          </span>
        )}
        <DescricaoDoDetalhe
          rotulo={detalhe.rotulo}
          descricao={detalhe.descricao}
          soAncora
          aberto={descricaoAberta}
          onAberto={setDescricaoAberta}
          onGravar={(descricao) => onGravar({ descricao })}
        />
        <MenuDoDetalhe rotulo={detalhe.rotulo} aoFechar={menu.aoFechar}>
          <DropdownMenuItem onClick={menu.depois(() => setEditando(true))}>
            <Pencil />
            {t.detalhes.menu.renomear}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={menu.depois(() => setDescricaoAberta(true))}>
            <MessageSquareText />
            {t.detalhes.menu.descricao}
          </DropdownMenuItem>
          {rolavel ? (
            <DropdownMenuItem onClick={menu.depois(() => setEditandoRolagem(true))}>
              <IconeD20 />
              {detalhe.rolagem ? t.detalhes.menu.editarRolagem : t.detalhes.menu.escreverRolagem}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={menu.depois(onApagar)}>
            <Trash2 />
            {t.detalhes.menu.apagar}
          </DropdownMenuItem>
        </MenuDoDetalhe>
      </div>
      <div className="flex min-w-0 items-center gap-0.5">
        <ValorDoDetalhe detalhe={detalhe} onGravar={(valor) => onGravar({ valor })} />
        {rolavel ? (
          <RolagemDoDetalhe
            detalhe={detalhe}
            rotulo={rotuloDaRolagem}
            onGravar={(rolagem) => onGravar({ rolagem })}
            editando={editandoRolagem}
            onEditando={setEditandoRolagem}
            semLapis
          />
        ) : null}
      </div>
    </li>
  );
}

/**
 * Os três pontinhos do detalhe: renomear, descrever, a rolagem e apagar.
 *
 * Num menu, e não em quatro botões à vista: o cartão é pequeno, e o lápis,
 * o balão, a lixeira e o lápis da rolagem disputavam o lugar com o valor, que
 * é o que se lê. Aparece sob o cursor, como a alça.
 */
function MenuDoDetalhe({
  rotulo,
  aoFechar,
  children,
}: {
  rotulo: string;
  aoFechar: (aberto: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu onOpenChangeComplete={aoFechar}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t.detalhes.opcoes(rotulo)}
            className={cn(
              "text-muted-foreground hover:text-foreground size-5 shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
              SO_NA_LINHA,
            )}
          >
            <MoreVertical />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * O que um item do menu pede, feito DEPOIS de o menu fechar.
 *
 * O menu devolve o foco ao botão quando fecha, e o campo que o item abriu --
 * o nome, a rolagem, a descrição -- nasceria e perderia o foco no mesmo
 * quadro. É o `useRenomearPeloMenu`, para mais de um item.
 */
function useDepoisDoMenu() {
  const pendente = useRef<(() => void) | null>(null);

  return {
    depois: (acao: () => void) => () => {
      pendente.current = acao;
    },
    aoFechar: (aberto: boolean) => {
      if (aberto || !pendente.current) return;

      const acao = pendente.current;
      pendente.current = null;
      acao();
    },
  };
}

/**
 * Uma entrada de Poderes ou Magias: o nome e, aberta, o texto dela.
 *
 * Aberta, ela LÊ: o resumo e a descrição que o mestre escreveu, como texto. O
 * lápis abre a edição desta ficha só -- o mesmo poder em outra ficha não muda.
 * Uma caixa de digitar sempre aberta fazia a entrada parecer um formulário
 * vazio, mesmo quando o texto já estava lá.
 */
function EntradaDeLista({
  detalhe,
  editarRotulo,
  dropTarget,
  onReorderStart,
  onGravar,
  onApagar,
  rolavel,
  rotuloDaRolagem,
}: PropsDaLinha) {
  const [aberta, setAberta] = useState(editarRotulo);
  /** Nome, resumo e descrição em edição, pelo menu do cabeçalho. */
  const [editando, setEditando] = useState(editarRotulo);
  const [editandoRolagem, setEditandoRolagem] = useState(false);
  const menu = useDepoisDoMenu();
  const resumo = detalhe.valor === undefined ? "" : String(detalhe.valor);

  return (
    <li
      onPointerDown={onReorderStart}
      className={cn(
        "group/detalhe bg-muted/30 rounded-md border px-1.5 py-1",
        CURSOR_DO_CARTAO,
        dropTarget && "ring-primary ring-1",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          data-arrasta
          aria-expanded={aberta}
          aria-label={aberta ? t.detalhes.fechar(detalhe.rotulo) : t.detalhes.abrir(detalhe.rotulo)}
          onClick={() => {
            setAberta((antes) => !antes);
            setEditando(false);
          }}
          className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1.5 rounded text-left"
        >
          <ChevronRight
            className={cn("size-3.5 shrink-0 transition-transform motion-reduce:transition-none", aberta && "rotate-90")}
          />
          {editando ? null : (
            <span className="text-foreground min-w-0 truncate text-xs font-medium">{detalhe.rotulo}</span>
          )}
        </button>
        {editando ? (
          <CampoDeTexto
            valor={detalhe.rotulo}
            maximo={MAX_ROTULO}
            rotulo={t.detalhes.rotulo(detalhe.rotulo)}
            autoFocus
            obrigatorio
            onGravar={(rotulo) => onGravar({ rotulo })}
            className="border-input min-w-0 flex-[3] border text-xs font-medium"
          />
        ) : null}
        {rolavel && !editando ? (
          <RolagemDoDetalhe
            detalhe={detalhe}
            rotulo={rotuloDaRolagem}
            onGravar={(rolagem) => onGravar({ rolagem })}
            editando={editandoRolagem}
            onEditando={setEditandoRolagem}
            semLapis
          />
        ) : null}
        {/* O ✓ só enquanto edita: é o "pronto" de quem escreveu o resumo e
            a descrição. Fora disso, o que se faz com a entrada está no menu. */}
        {editando ? (
          <Lapis
            rotulo={t.detalhes.editarTexto(detalhe.rotulo)}
            ativo
            onClick={() => {
              soltarFoco();
              setEditando(false);
            }}
          />
        ) : (
          <MenuDoDetalhe rotulo={detalhe.rotulo} aoFechar={menu.aoFechar}>
            <DropdownMenuItem
              onClick={menu.depois(() => {
                setEditando(true);
                setAberta(true);
              })}
            >
              <Pencil />
              {t.detalhes.menu.editar}
            </DropdownMenuItem>
            {rolavel ? (
              <DropdownMenuItem onClick={menu.depois(() => setEditandoRolagem(true))}>
                <IconeD20 />
                {detalhe.rolagem ? t.detalhes.menu.editarRolagem : t.detalhes.menu.escreverRolagem}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={menu.depois(onApagar)}>
              <Trash2 />
              {t.detalhes.menu.apagar}
            </DropdownMenuItem>
          </MenuDoDetalhe>
        )}
      </div>

      {aberta ? (
        <div className="mt-1 pl-5">
          {editando ? (
            <div className="space-y-1.5">
              <label className="block space-y-0.5">
                <span className="text-muted-foreground text-[10px]">{t.detalhes.resumo}</span>
                <CampoDeTexto
                  valor={resumo}
                  maximo={MAX_TEXTO}
                  rotulo={t.detalhes.resumo}
                  placeholder={t.detalhes.exemploDeResumo}
                  onGravar={(valor) => onGravar({ valor })}
                  className="border-input w-full border text-xs"
                />
              </label>
              <label className="block space-y-0.5">
                <span className="text-muted-foreground text-[10px]">{t.detalhes.descricao(detalhe.rotulo)}</span>
                <Textarea
                  defaultValue={detalhe.descricao ?? ""}
                  maxLength={MAX_DESCRICAO_DETALHE}
                  placeholder={t.detalhes.exemploDeDescricao}
                  className="min-h-16 resize-y text-xs"
                  onBlur={(evento) => {
                    const texto = evento.target.value.trim();
                    if (texto === (detalhe.descricao ?? "")) return;
                    onGravar({ descricao: texto });
                  }}
                />
              </label>
            </div>
          ) : resumo || detalhe.descricao ? (
            <div className="space-y-0.5 text-xs">
              {resumo ? <p className="font-medium">{resumo}</p> : null}
              {detalhe.descricao ? (
                <p className="text-muted-foreground whitespace-pre-line">{detalhe.descricao}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-[11px]">{t.detalhes.semTexto}</p>
          )}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Um campo de texto que grava ao sair, como a sigla do atributo: Enter grava,
 * Esc desiste. `obrigatorio` não deixa gravar vazio (o rótulo); sem ele, vazio
 * apaga (o valor de texto).
 */
export function CampoDeTexto({
  valor,
  maximo,
  rotulo,
  placeholder,
  autoFocus = false,
  obrigatorio = false,
  onGravar,
  onFim,
  className,
}: {
  valor: string;
  maximo: number;
  rotulo: string;
  placeholder?: string;
  autoFocus?: boolean;
  obrigatorio?: boolean;
  onGravar: (valor: string) => void;
  /** Chamado ao sair do campo, gravando ou não: o nome volta a ser texto. */
  onFim?: () => void;
  className?: string;
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const desistiu = useRef(false);
  const marcar = useMarcarAoFocar();

  return (
    <input
      aria-label={rotulo}
      value={rascunho ?? valor}
      maxLength={maximo}
      placeholder={placeholder}
      autoFocus={autoFocus}
      {...marcar}
      onChange={(evento) => setRascunho(evento.target.value)}
      onKeyDown={(evento) => aoTeclar(evento, desistiu)}
      onBlur={() => {
        const lido = rascunho?.trim();
        setRascunho(null);
        onFim?.();

        if (desistiu.current) {
          desistiu.current = false;
          return;
        }
        if (lido === undefined || lido === valor) return;
        if (obrigatorio && !lido) return;

        onGravar(lido);
      }}
      className={cn(
        "focus:bg-background placeholder:text-muted-foreground/50 truncate rounded bg-transparent px-1 py-0.5 outline-none focus:text-foreground",
        className,
      )}
    />
  );
}

/** O valor no controle do tipo. */
export function ValorDoDetalhe({ detalhe, onGravar }: { detalhe: Detalhe; onGravar: (valor: string | number) => void }) {
  if (detalhe.tipo === "numero") {
    return <CampoDeNumero detalhe={detalhe} onGravar={onGravar} />;
  }

  if (detalhe.tipo === "escolha") {
    const vazio = t.detalhes.vazioDaEscolha;
    const opcoes = detalhe.opcoes ?? [];
    return (
      <Select<string>
        items={{ "": vazio, ...Object.fromEntries(opcoes.map((opcao) => [opcao, opcao])) }}
        value={typeof detalhe.valor === "string" ? detalhe.valor : ""}
        onValueChange={(novo) => onGravar(novo ?? "")}
      >
        <SelectTrigger size="sm" className="h-6 min-w-0 flex-1 text-xs" aria-label={t.detalhes.valor(detalhe.rotulo)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="" className="text-xs">
            {vazio}
          </SelectItem>
          {opcoes.map((opcao) => (
            <SelectItem key={opcao} value={opcao} className="text-xs">
              {opcao}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <CampoDeTexto
      valor={typeof detalhe.valor === "string" ? detalhe.valor : detalhe.valor === undefined ? "" : String(detalhe.valor)}
      maximo={MAX_TEXTO}
      rotulo={t.detalhes.valor(detalhe.rotulo)}
      placeholder={t.detalhes.vazioDoTexto}
      onGravar={onGravar}
      className="min-w-0 flex-1 text-xs"
    />
  );
}

/** Número com setas, como o valor do atributo. O que não é número sai sem gravar. */
function CampoDeNumero({ detalhe, onGravar }: { detalhe: Detalhe; onGravar: (valor: number) => void }) {
  const valor = typeof detalhe.valor === "number" ? detalhe.valor : 0;
  const [rascunho, setRascunho] = useState<string | null>(null);
  const desistiu = useRef(false);
  const marcar = useMarcarAoFocar();
  const mostrado = rascunho ?? String(valor);

  function passo(delta: number) {
    const atual = Number.parseInt(mostrado, 10);
    const base = Number.isNaN(atual) ? valor : atual;
    setRascunho(String(Math.max(-MAX_NUMERO_DETALHE, Math.min(MAX_NUMERO_DETALHE, base + delta))));
  }

  return (
    <input
      aria-label={t.detalhes.valor(detalhe.rotulo)}
      inputMode="numeric"
      value={mostrado}
      {...marcar}
      onChange={(evento) => setRascunho(evento.target.value)}
      onKeyDown={(evento) => {
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
      className="focus:bg-background min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm font-medium tabular-nums outline-none"
    />
  );
}

/** O ⓘ da linha: o hover mostra a descrição, o clique a escreve. Ver `DescricaoDoAtributo`. */
export function DescricaoDoDetalhe({
  rotulo,
  descricao,
  onGravar,
  sempre = false,
  soAncora = false,
  aberto,
  onAberto,
}: {
  rotulo: string;
  descricao: string | undefined;
  onGravar: (descricao: string) => void;
  /** Sempre à vista, e não só sob o cursor quando vazia: a tabela da configuração. */
  sempre?: boolean;
  /**
   * Sem botão à vista: quem abre é o menu da linha (`aberto`), e o botão fica
   * só de âncora do balão, invisível. O cartão da ficha, que já tem o ⋮.
   */
  soAncora?: boolean;
  aberto?: boolean;
  onAberto?: (aberto: boolean) => void;
}) {
  const ancora = soAncora;

  return (
    <Popover open={aberto} onOpenChange={onAberto}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t.detalhes.descricao(rotulo)}
                  tabIndex={ancora ? -1 : undefined}
                  className={cn(
                    "size-5 shrink-0 [&_svg:not([class*='size-'])]:size-3",
                    descricao ? "text-foreground" : "text-muted-foreground",
                    ancora ? "pointer-events-none opacity-0" : !descricao && !sempre && SO_NA_LINHA,
                  )}
                >
                  <MessageSquareText />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          {descricao ? (
            <>
              <p className="max-w-56 whitespace-pre-line">{descricao}</p>
              <p className="text-muted-foreground">{t.detalhes.editarDescricao}</p>
            </>
          ) : (
            <p className="max-w-48">{t.detalhes.semDescricao}</p>
          )}
        </TooltipContent>
      </Tooltip>

      <PopoverContent side="bottom" align="end" className="w-72 space-y-1.5">
        <p className="text-xs font-medium">{t.detalhes.descricao(rotulo)}</p>
        <Textarea
          autoFocus
          defaultValue={descricao ?? ""}
          maxLength={MAX_DESCRICAO_DETALHE}
          placeholder={t.detalhes.exemploDeDescricao}
          aria-label={t.detalhes.descricao(rotulo)}
          className="min-h-20 resize-y text-xs"
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
