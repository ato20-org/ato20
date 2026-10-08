"use client";

import { useState } from "react";
import { Hash, ListChecks, ListCollapse, ListTree, Plus, Rows3, Type, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import {
  Alca,
  CampoDeTexto,
  DescricaoDoDetalhe,
  Lixeira,
  ValorDoDetalhe,
} from "@/components/mestre/detalhes-personagem";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCharacters } from "@/hooks/use-characters";
import { useListReorder } from "@/hooks/use-list-reorder";
import { comum } from "@/lib/i18n/comum";
import { t } from "@/lib/i18n/mestre";
import { useMoldeDeDetalhes, useMoldeDeDetalhesStore } from "@/lib/store/use-molde-de-detalhes-store";
import { cn } from "@/lib/utils";
import {
  aplicarDetalhesEmTodos,
  criarGrupoDeDetalhes,
  criarModeloDeDetalhe,
  editarGrupoDeDetalhes,
  editarModeloDeDetalhe,
  removerGrupoDeDetalhes,
  removerModeloDeDetalhe,
  reordenarGruposDeDetalhes,
  reordenarModelosDeDetalhe,
} from "@/lib/vault/detalhes";
import {
  chaveDoNome,
  MAX_DETALHES,
  MAX_GRUPOS,
  MAX_NOME_DO_GRUPO,
  MAX_ROTULO,
  tipoDoNovo,
  type ExibicaoDeGrupo,
  type GrupoDeDetalhes,
  type ModeloDeDetalhe,
  type TipoDeDetalhe,
} from "@/types/detalhe";

/**
 * O molde da ficha: os grupos (Identidade, Perícias, Poderes, o que o sistema
 * da mesa pedir) e os detalhes com que todo personagem NOVO nasce.
 *
 * Criar um detalhe aqui não mexe nas fichas que já existem, ao contrário dos
 * medidores e atributos da campanha: o mestre monta o molde inteiro e só
 * então o põe na mesa, pela varinha. Duas coisas alcançam as fichas, porque
 * são a FORMA delas e não o valor de alguém: renomear um grupo, e as opções
 * de uma escolha.
 */
export function DetalhesDaCampanha() {
  const molde = useMoldeDeDetalhes();
  const { personagens, recarregar: relerPersonagens } = useCharacters();
  const quantos = personagens?.length ?? 0;
  const [ocupado, setOcupado] = useState(false);
  /** A ordem dos grupos depois de um arrasto, até o molde relido chegar. */
  const [arrastada, setArrastada] = useState<{ de: GrupoDeDetalhes[]; lista: GrupoDeDetalhes[] } | null>(null);

  /**
   * Roda a chamada e relê o molde. `fichas` também avisa as fichas abertas,
   * quando a chamada alcançou alguma.
   */
  async function mexer(acao: () => Promise<boolean | void>, erro: string) {
    setOcupado(true);
    try {
      const fichas = await acao();
      if (fichas) {
        useMoldeDeDetalhesStore.getState().avisarFichas();
        relerPersonagens();
      } else {
        useMoldeDeDetalhesStore.getState().recarregar();
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : erro);
    } finally {
      setOcupado(false);
    }
  }

  const grupos =
    molde && arrastada && arrastada.de === molde.grupos ? arrastada.lista : (molde?.grupos ?? []);

  const { listRef, dropIndex, startReorder } = useListReorder<string>((grupoId, index) => {
    if (!molde) return;
    const de = grupos.findIndex((grupo) => grupo.id === grupoId);
    if (de < 0 || de === index) return;

    const arrumada = [...grupos];
    const [movido] = arrumada.splice(de, 1);
    arrumada.splice(index, 0, movido!);
    setArrastada({ de: molde.grupos, lista: arrumada });
    void mexer(async () => {
      await reordenarGruposDeDetalhes(arrumada.map((grupo) => grupo.id));
    }, t.configuracao.falhaAoGravar);
  });

  async function criarGrupo() {
    await mexer(async () => {
      await criarGrupoDeDetalhes({ nome: t.configuracao.detalhes.grupoNovo });
    }, t.configuracao.falhaAoGravar);
  }

  async function aplicar() {
    await mexer(async () => {
      const { alcancados } = await aplicarDetalhesEmTodos();
      toast.success(t.configuracao.aplicadoEm(alcancados, quantos));
      return alcancados > 0;
    }, t.configuracao.falhaAoAplicar);
  }

  const modelos = molde?.modelos ?? [];
  const cheioDeGrupos = grupos.length >= MAX_GRUPOS;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">{t.configuracao.detalhes.titulo}</h3>
          <p className="text-muted-foreground text-[11px] leading-snug">{t.configuracao.detalhes.nota}</p>
        </div>

        {modelos.length > 0 ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.configuracao.detalhes.aplicarEmTodos}
                  disabled={ocupado || quantos === 0}
                  onClick={() => void aplicar()}
                >
                  <Wand2 />
                </Button>
              }
            />
            <TooltipContent>
              <p className="font-medium">{t.configuracao.detalhes.aplicarEmTodos}</p>
              <p className="text-muted-foreground max-w-56">{t.configuracao.detalhes.aplicarEmTodosNota}</p>
            </TooltipContent>
          </Tooltip>
        ) : null}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.configuracao.detalhes.novoGrupo}
                disabled={ocupado || cheioDeGrupos}
                onClick={() => void criarGrupo()}
              >
                <Plus />
              </Button>
            }
          />
          <TooltipContent>
            <p className="font-medium">{t.configuracao.detalhes.novoGrupo}</p>
            {cheioDeGrupos ? (
              <p className="text-muted-foreground max-w-48">{t.configuracao.detalhes.limiteDeGrupos(MAX_GRUPOS)}</p>
            ) : null}
          </TooltipContent>
        </Tooltip>
      </div>

      {molde === null ? (
        <p className="text-muted-foreground text-[11px]">{t.configuracao.lendo}</p>
      ) : grupos.length === 0 ? (
        <PainelVazio icone={ListTree}>{t.configuracao.detalhes.nenhumGrupo}</PainelVazio>
      ) : (
        <ul ref={listRef} className="space-y-2">
          {grupos.map((grupo, index) => (
            <CartaoDeGrupo
              key={grupo.id}
              grupo={grupo}
              modelos={modelos.filter((modelo) => chaveDoNome(modelo.grupo) === chaveDoNome(grupo.nome))}
              todosOsModelos={modelos.length}
              ocupado={ocupado}
              dropTarget={dropIndex === index}
              onReorderStart={(evento) => startReorder(evento, grupo.id)}
              mexer={mexer}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

type Mexer = (acao: () => Promise<boolean | void>, erro: string) => Promise<void>;

function CartaoDeGrupo({
  grupo,
  modelos,
  todosOsModelos,
  ocupado,
  dropTarget,
  onReorderStart,
  mexer,
}: {
  grupo: GrupoDeDetalhes;
  modelos: ModeloDeDetalhe[];
  todosOsModelos: number;
  ocupado: boolean;
  dropTarget: boolean;
  onReorderStart: (evento: React.PointerEvent) => void;
  mexer: Mexer;
}) {
  const [apagando, setApagando] = useState(false);
  const [arrastada, setArrastada] = useState<{ de: ModeloDeDetalhe[]; lista: ModeloDeDetalhe[] } | null>(null);
  const lista = arrastada && arrastada.de === modelos ? arrastada.lista : modelos;
  const texto = t.configuracao.detalhes;

  const { listRef, dropIndex, startReorder } = useListReorder<string>((modeloId, index) => {
    const de = lista.findIndex((modelo) => modelo.id === modeloId);
    if (de < 0 || de === index) return;

    const arrumada = [...lista];
    const [movido] = arrumada.splice(de, 1);
    arrumada.splice(index, 0, movido!);
    setArrastada({ de: modelos, lista: arrumada });
    void mexer(async () => {
      await reordenarModelosDeDetalhe(arrumada.map((modelo) => modelo.id));
    }, t.configuracao.falhaAoGravar);
  });

  const trocar = (patch: Parameters<typeof editarGrupoDeDetalhes>[1]) =>
    void mexer(async () => {
      const { fichas } = await editarGrupoDeDetalhes(grupo.id, patch);
      if (fichas > 0) toast.success(texto.grupoRenomeadoEm(fichas));
      return fichas > 0;
    }, t.configuracao.falhaAoGravar);

  return (
    <li className={cn("group/detalhe bg-muted/20 space-y-1.5 rounded-lg border p-2", dropTarget && "ring-primary ring-1")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Alca onReorderStart={onReorderStart} />
        <CampoDeTexto
          valor={grupo.nome}
          maximo={MAX_NOME_DO_GRUPO}
          rotulo={texto.nomeDoGrupo(grupo.nome)}
          obrigatorio
          onGravar={(nome) => trocar({ nome })}
          className="min-w-24 flex-1 text-sm font-medium"
        />

        <ExibicaoDoGrupo valor={grupo.exibicao} onEscolher={(exibicao) => trocar({ exibicao })} />

        <Lixeira rotulo={grupo.nome} onApagar={() => setApagando(true)} />
      </div>

      {lista.length === 0 ? (
        <p className="text-muted-foreground px-1 text-[11px]">{texto.nenhumDetalhe}</p>
      ) : (
        <>
        {/* O cabeçalho da tabela, nas mesmas colunas das linhas: quem monta o
            molde sabe o que cada coluna é sem adivinhar pelo conteúdo. */}
        <div
          aria-hidden
          className={cn(COLUNAS, "text-muted-foreground border-b px-0.5 pb-1 text-[10px] font-medium tracking-wide uppercase")}
        >
          <span>{texto.colunas.tipo}</span>
          <span>{texto.colunas.nome}</span>
          <span>{texto.colunas.campo}</span>
          <span className="text-right">{texto.colunas.acoes}</span>
        </div>
        <ul ref={listRef} className="space-y-0.5">
          {lista.map((modelo, index) => (
            <LinhaDeModelo
              key={modelo.id}
              modelo={modelo}
              dropTarget={dropIndex === index}
              onReorderStart={(evento) => startReorder(evento, modelo.id)}
              mexer={mexer}
            />
          ))}
        </ul>
        </>
      )}

      <NovoModelo
        grupo={grupo}
        modelos={lista}
        cheio={todosOsModelos >= MAX_DETALHES}
        ocupado={ocupado}
        mexer={mexer}
      />

      <AlertDialog open={apagando} onOpenChange={setApagando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{texto.apagarGrupoTitulo(grupo.nome)}</AlertDialogTitle>
            <AlertDialogDescription>{texto.apagarGrupoTexto}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{comum.cancelar}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void mexer(async () => {
                  await removerGrupoDeDetalhes(grupo.id);
                }, t.configuracao.falhaAoGravar)
              }
            >
              {texto.apagar}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/**
 * Linhas ou Lista, em dois ícones lado a lado: é uma escolha de duas, e o
 * desenho do ícone já diz como o grupo vai aparecer na ficha.
 */
function ExibicaoDoGrupo({
  valor,
  onEscolher,
}: {
  valor: ExibicaoDeGrupo;
  onEscolher: (exibicao: ExibicaoDeGrupo) => void;
}) {
  const texto = t.configuracao.detalhes;
  const opcoes: Array<{ id: ExibicaoDeGrupo; icone: typeof Rows3; rotulo: string; nota: string }> = [
    { id: "linhas", icone: Rows3, rotulo: texto.exibicoes.linhas, nota: texto.exibicoesNota.linhas },
    { id: "lista", icone: ListCollapse, rotulo: texto.exibicoes.lista, nota: texto.exibicoesNota.lista },
  ];

  return (
    <div role="radiogroup" aria-label={texto.exibicao} className="bg-muted/40 flex rounded-md border p-0.5">
      {opcoes.map(({ id, icone: Icone, rotulo, nota }) => (
        <Tooltip key={id}>
          <TooltipTrigger
            render={
              <Button
                role="radio"
                aria-checked={valor === id}
                aria-label={rotulo}
                variant={valor === id ? "secondary" : "ghost"}
                size="icon-xs"
                onClick={() => {
                  if (valor !== id) onEscolher(id);
                }}
              >
                <Icone />
              </Button>
            }
          />
          <TooltipContent>
            <p className="font-medium">{rotulo}</p>
            <p className="text-muted-foreground max-w-48">{nota}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/** Um seletor pequeno: o tipo de um detalhe. */
function Escolha<T extends string>({
  rotulo,
  valor,
  opcoes,
  onEscolher,
}: {
  rotulo: string;
  valor: T;
  opcoes: Record<T, string>;
  onEscolher: (valor: T) => void;
}) {
  return (
    <Select<T>
      items={opcoes}
      value={valor}
      onValueChange={(novo) => {
        if (novo && novo !== valor) onEscolher(novo);
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <SelectTrigger size="sm" className="h-6 text-xs" aria-label={rotulo}>
              <SelectValue />
            </SelectTrigger>
          }
        />
        <TooltipContent>{rotulo}</TooltipContent>
      </Tooltip>
      <SelectContent>
        {(Object.keys(opcoes) as T[]).map((opcao) => (
          <SelectItem key={opcao} value={opcao} className="text-xs">
            {opcoes[opcao]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** As colunas da tabela do molde: Tipo, Nome, Campo, Ações. */
const COLUNAS = "grid grid-cols-[2.75rem_minmax(0,11rem)_minmax(0,1fr)_3.5rem] items-center gap-2";

const ICONE_DO_TIPO: Record<TipoDeDetalhe, typeof Type> = {
  texto: Type,
  escolha: ListChecks,
  numero: Hash,
};

/** Um detalhe de fábrica, numa linha da tabela. */
function LinhaDeModelo({
  modelo,
  dropTarget,
  onReorderStart,
  mexer,
}: {
  modelo: ModeloDeDetalhe;
  dropTarget: boolean;
  onReorderStart: (evento: React.PointerEvent) => void;
  mexer: Mexer;
}) {
  const texto = t.configuracao.detalhes;
  const gravar = (patch: Parameters<typeof editarModeloDeDetalhe>[1]) =>
    void mexer(async () => {
      const { fichas } = await editarModeloDeDetalhe(modelo.id, patch);
      if (fichas > 0) toast.success(texto.opcoesEm(fichas));
      return fichas > 0;
    }, t.configuracao.falhaAoGravar);

  return (
    <li className={cn(COLUNAS, "group/detalhe rounded px-0.5 py-0.5", dropTarget && "ring-primary ring-1")}>
      <div className="flex items-center gap-0.5">
        <Alca onReorderStart={onReorderStart} />
        <TipoDoModelo tipo={modelo.tipo} onTrocar={(tipo) => gravar({ tipo })} />
      </div>

      <CampoDeTexto
        valor={modelo.rotulo}
        maximo={MAX_ROTULO}
        rotulo={texto.rotuloDoDetalhe}
        obrigatorio
        onGravar={(rotulo) => gravar({ rotulo })}
        className="border-input w-full min-w-0 border text-xs"
      />

      <div className="min-w-0">
        {modelo.tipo === "escolha" ? (
          <OpcoesDaEscolha opcoes={modelo.opcoes ?? []} onTrocar={(opcoes) => gravar({ opcoes })} />
        ) : (
          <div className="border-input flex min-w-0 items-center rounded border">
            <ValorDoDetalhe detalhe={modelo} onGravar={(valor) => gravar({ valor })} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-0.5">
        <DescricaoDoDetalhe
          rotulo={modelo.rotulo}
          descricao={modelo.descricao}
          sempre
          onGravar={(descricao) => gravar({ descricao })}
        />
        <Lixeira
          rotulo={modelo.rotulo}
          sempre
          onApagar={() =>
            void mexer(async () => {
              await removerModeloDeDetalhe(modelo.id);
            }, t.configuracao.falhaAoGravar)
          }
        />
      </div>
    </li>
  );
}

/** O ícone do tipo; o clique abre o menu para trocá-lo. */
function TipoDoModelo({ tipo, onTrocar }: { tipo: TipoDeDetalhe; onTrocar: (tipo: TipoDeDetalhe) => void }) {
  const texto = t.configuracao.detalhes;
  const Icone = ICONE_DO_TIPO[tipo];

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-xs" aria-label={`${texto.tipoDoDetalhe}: ${texto.tipos[tipo]}`}>
                  <Icone />
                </Button>
              }
            />
          }
        />
        <TooltipContent>{texto.tipos[tipo]}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-36">
        <DropdownMenuRadioGroup
          value={tipo}
          onValueChange={(novo) => {
            if (novo !== tipo) onTrocar(novo as TipoDeDetalhe);
          }}
        >
          {(Object.keys(ICONE_DO_TIPO) as TipoDeDetalhe[]).map((opcao) => {
            const IconeDaOpcao = ICONE_DO_TIPO[opcao];
            return (
              <DropdownMenuRadioItem key={opcao} value={opcao}>
                <IconeDaOpcao />
                {texto.tipos[opcao]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * As opções de uma escolha, como etiquetas: o × tira uma, e o campo do fim
 * acrescenta com Enter. Cada mudança grava a lista inteira, e ela chega às
 * fichas -- ver `editar_modelo`.
 */
function OpcoesDaEscolha({ opcoes, onTrocar }: { opcoes: string[]; onTrocar: (opcoes: string[]) => void }) {
  const texto = t.configuracao.detalhes;
  const [nova, setNova] = useState("");

  function acrescentar() {
    const opcao = nova.trim();
    setNova("");
    if (!opcao || opcoes.some((atual) => chaveDoNome(atual) === chaveDoNome(opcao))) return;
    onTrocar([...opcoes, opcao]);
  }

  return (
    <div className="border-input flex min-h-7 flex-wrap items-center gap-1 rounded border px-1 py-0.5">
      {opcoes.map((opcao) => (
        <span key={opcao} className="bg-muted flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px]">
          {opcao}
          <button
            type="button"
            aria-label={texto.tirarOpcao(opcao)}
            onClick={() => onTrocar(opcoes.filter((atual) => atual !== opcao))}
            className="text-muted-foreground hover:text-foreground rounded"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={nova}
        aria-label={texto.novaOpcao}
        placeholder={opcoes.length === 0 ? texto.exemploDeOpcoes : texto.novaOpcao}
        onChange={(evento) => setNova(evento.target.value)}
        onKeyDown={(evento) => {
          if (evento.key === "Enter" || evento.key === ",") {
            evento.preventDefault();
            acrescentar();
          }
        }}
        onBlur={acrescentar}
        className="placeholder:text-muted-foreground/60 min-w-20 flex-1 bg-transparent px-0.5 text-[11px] outline-none"
      />
    </div>
  );
}

/**
 * O "+ Detalhe" do grupo: nome e tipo (e as opções, se for escolha) num
 * popover, e só então o detalhe existe. Fica no molde: as fichas que já
 * existem o ganham pela varinha.
 */
function NovoModelo({
  grupo,
  modelos,
  cheio,
  ocupado,
  mexer,
}: {
  grupo: GrupoDeDetalhes;
  modelos: ModeloDeDetalhe[];
  cheio: boolean;
  ocupado: boolean;
  mexer: Mexer;
}) {
  const texto = t.configuracao.detalhes;
  const [aberto, setAberto] = useState(false);
  const [rotulo, setRotulo] = useState("");
  const [tipo, setTipo] = useState<TipoDeDetalhe>(() => tipoDoNovo(modelos));
  const [opcoes, setOpcoes] = useState<string[]>([]);

  function criar() {
    const nome = rotulo.trim();
    if (!nome) return;

    setAberto(false);
    void mexer(async () => {
      await criarModeloDeDetalhe({
        grupo: grupo.nome,
        rotulo: nome,
        tipo,
        opcoes: tipo === "escolha" ? opcoes : undefined,
      });
      toast.success(texto.detalheCriado);
      setRotulo("");
      setOpcoes([]);
    }, t.configuracao.falhaAoGravar);
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" className="h-6 text-xs" disabled={ocupado || cheio}>
            <Plus />
            {texto.novoDetalhe}
          </Button>
        }
      />
      <PopoverContent side="bottom" align="start" className="w-72 space-y-2">
        <form
          className="space-y-2"
          onSubmit={(evento) => {
            evento.preventDefault();
            criar();
          }}
        >
          <label className="block space-y-1 text-xs">
            <span className="font-medium">{texto.rotuloDoDetalhe}</span>
            <Input
              autoFocus
              value={rotulo}
              maxLength={MAX_ROTULO}
              placeholder={texto.exemploDeRotulo}
              onChange={(evento) => setRotulo(evento.target.value)}
              className="h-7 text-xs"
            />
          </label>
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium">{texto.tipoDoDetalhe}</span>
            <Escolha<TipoDeDetalhe> rotulo={texto.tipoDoDetalhe} valor={tipo} opcoes={texto.tipos} onEscolher={setTipo} />
          </div>
          {tipo === "escolha" ? (
            <div className="space-y-1 text-xs">
              <span className="font-medium">{texto.opcoes}</span>
              <OpcoesDaEscolha opcoes={opcoes} onTrocar={setOpcoes} />
              <span className="text-muted-foreground">{texto.opcoesNota}</span>
            </div>
          ) : null}
          <Button type="submit" size="sm" className="w-full" disabled={!rotulo.trim()}>
            {texto.criar}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
