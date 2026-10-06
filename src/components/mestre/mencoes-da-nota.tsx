"use client";

import {
  BookMarked,
  Camera,
  CircleHelp,
  Image as ImageIcon,
  Music,
  Search,
  Unlink,
  VenetianMask,
  type LucideIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";

import type { Vinculos } from "@/components/mestre/postit-texto-view";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { t } from "@/lib/i18n/arquivos";
import { rico } from "@/lib/i18n/rico";
import { mencoesDaNota, type MencaoDaNota } from "@/lib/markdown/mencoes-da-nota";
import type { TipoNoPostit } from "@/lib/mestre/postit-mencoes";
import { MINIATURA } from "@/lib/miniatura";
import { cn } from "@/lib/utils";

/** Quantas linhas uma menção mostra antes de resumir em "+N". */
const LINHAS_A_VISTA = 8;

/** Uma menção já resolvida: o que se mostra, o que o clique faz, e o que se procura. */
type Resolvida = {
  mencao: MencaoDaNota;
  /** O nome da coisa, e não o que foi digitado: `@thalor` mostra "Thalor". */
  nome: string;
  detalhe: string;
  abrir?: () => void;
  /** O que o Ctrl+F procura: o texto que a nota DESENHA para esta menção. */
  termo: string;
  /**
   * A cara da coisa, pelo id no acervo: o retrato, a imagem, o fundo do mapa.
   * Sem ela -- som, página marcada, quadro sem fundo --, vai o `icone`.
   */
  miniatura?: string;
  icone: LucideIcon;
};

type Grupo = { titulo: string; icone: LucideIcon; itens: Resolvida[] };

const GRUPO: Record<TipoNoPostit, { titulo: string; icone: LucideIcon }> = {
  personagem: { titulo: t.mencoesDaNota.grupos.personagem, icone: VenetianMask },
  arquivo: { titulo: t.mencoesDaNota.grupos.arquivo, icone: ImageIcon },
  cena: { titulo: t.mencoesDaNota.grupos.cena, icone: Camera },
  marcador: { titulo: t.mencoesDaNota.grupos.marcador, icone: BookMarked },
};

const NENHUM: Record<TipoNoPostit, string> = t.mencoesDaNota.nenhum;

/** A menção resolvida pelos mesmos vínculos do chip, ou `null` se o nome não existe. */
function resolver(mencao: MencaoDaNota, vinculos: Vinculos): Resolvida | null {
  switch (mencao.tipo) {
    case "personagem": {
      const achado = vinculos.personagem(mencao.nome);
      if (!achado) return null;
      return {
        mencao,
        nome: achado.nome,
        detalhe: achado.dono
          ? t.geral.donoEPresenca(
              achado.dono,
              achado.presente ? t.geral.naMesa : t.geral.ausente,
            )
          : t.geral.semJogador,
        abrir: () => vinculos.abrirJanela({ tipo: "personagem", personagemId: achado.id }),
        termo: achado.nome,
        ...(achado.retrato ? { miniatura: achado.retrato } : {}),
        icone: VenetianMask,
      };
    }
    case "arquivo": {
      const asset = vinculos.arquivo(mencao.nome);
      if (!asset) return null;
      const imagem = asset.kind === "image";
      return {
        mencao,
        nome: asset.name,
        detalhe: imagem ? t.mencoesDaNota.imagem : t.mencoesDaNota.somReferencia,
        // Som não abre nada, como no chip: som na mesa é a trilha.
        abrir: imagem
          ? () => vinculos.abrirJanela({ tipo: "asset", assetId: asset.id, nome: asset.name })
          : undefined,
        termo: asset.name,
        ...(imagem ? { miniatura: asset.id } : {}),
        icone: imagem ? ImageIcon : Music,
      };
    }
    case "cena": {
      const cena = vinculos.cena(mencao.nome);
      if (!cena) return null;
      return {
        mencao,
        nome: cena.name,
        detalhe: cena.tipo === "quadro" ? t.mencoesDaNota.quadro : t.mencoesDaNota.mapa,
        abrir: () => vinculos.irParaCena(cena.id),
        termo: cena.name,
        ...(cena.backgroundAssetId ? { miniatura: cena.backgroundAssetId } : {}),
        icone: Camera,
      };
    }
    case "marcador": {
      const achado = vinculos.marcador(mencao.nome);
      if (!achado) return null;
      const { marcador, livro } = achado;
      return {
        mencao,
        nome: marcador.rotulo,
        detalhe: t.geral.paginaDoLivro(livro.titulo, marcador.pagina),
        abrir: () => vinculos.abrirLivro(livro.id, livro.titulo, marcador.pagina),
        termo: marcador.rotulo,
        icone: BookMarked,
      };
    }
  }
}

/**
 * As menções desta nota, num painel ao lado dela: quem ela cita, o que aponta,
 * e onde.
 *
 * Numa nota de sessenta linhas, "a cena do porão cita o Thalor?" e "onde eu
 * falei da chave?" são perguntas de ler tudo. Aqui cada menção aparece uma
 * vez, com quantas vezes foi escrita e as linhas em que está. O nome abre a
 * coisa, como o chip; a linha leva até ela; a lupa destaca todas na nota, pelo
 * mesmo Ctrl+F.
 *
 * O que não resolve fica num grupo à parte, e é para achar o erro: `@Tahlor`
 * escrito às pressas no meio da sessão é um nome que não existe, e na nota ele
 * só aparece cinza.
 */
export function PainelDeMencoes({
  texto,
  vinculos,
  aoIrParaLinha,
  aoProcurar,
}: {
  texto: string;
  vinculos: Vinculos;
  aoIrParaLinha: (indice: number) => void;
  aoProcurar: (termo: string) => void;
}) {
  const mencoes = useMemo(() => mencoesDaNota(texto), [texto]);

  const { grupos, soltas } = useMemo(() => {
    const porTipo = new Map<TipoNoPostit, Resolvida[]>();
    const semVinculo: MencaoDaNota[] = [];
    for (const mencao of mencoes) {
      const resolvida = resolver(mencao, vinculos);
      if (!resolvida) {
        semVinculo.push(mencao);
        continue;
      }
      porTipo.set(mencao.tipo, [...(porTipo.get(mencao.tipo) ?? []), resolvida]);
    }
    const ordem: TipoNoPostit[] = ["personagem", "arquivo", "cena", "marcador"];
    return {
      grupos: ordem
        .filter((tipo) => porTipo.has(tipo))
        .map((tipo): Grupo => ({ ...GRUPO[tipo], itens: porTipo.get(tipo)! })),
      soltas: semVinculo,
    };
  }, [mencoes, vinculos]);

  return (
    <aside
      aria-label={t.mencoesDaNota.mencoesDaNota}
      className="bg-background/60 flex w-64 shrink-0 flex-col border-l text-xs"
    >
      <div className="flex shrink-0 items-center gap-1 border-b px-3 py-1.5">
        <span className="flex-1 font-medium">{t.mencoesDaNota.mencoes}</span>
        <Convencoes />
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {mencoes.length === 0 ? (
          <p className="text-muted-foreground leading-relaxed">
            {rico(t.mencoesDaNota.nenhumaMencao, {
              arroba: <code>@</code>,
              ajuda: (
                <CircleHelp
                  className="inline size-3.5 align-[-0.15em]"
                  aria-label={t.mencoesDaNota.botaoDeAjuda}
                />
              ),
            })}
          </p>
        ) : null}

        {grupos.map((grupo) => (
          <section key={grupo.titulo} aria-label={grupo.titulo}>
            <Cabecalho icone={grupo.icone} titulo={grupo.titulo} total={grupo.itens.length} />
            <ul className="space-y-2">
              {grupo.itens.map((item) => (
                <Item
                  key={`${item.mencao.tipo}:${item.mencao.nome}`}
                  mencao={item.mencao}
                  nome={item.nome}
                  detalhe={item.detalhe}
                  abrir={item.abrir}
                  miniatura={item.miniatura}
                  icone={item.icone}
                  aoProcurar={() => aoProcurar(item.termo)}
                  aoIrParaLinha={aoIrParaLinha}
                />
              ))}
            </ul>
          </section>
        ))}

        {soltas.length > 0 ? (
          <section aria-label={t.mencoesDaNota.semVinculo}>
            <Cabecalho icone={Unlink} titulo={t.mencoesDaNota.semVinculo} total={soltas.length} />
            <ul className="space-y-2">
              {soltas.map((mencao) => (
                <Item
                  key={`${mencao.tipo}:${mencao.nome}`}
                  mencao={mencao}
                  // O que foi digitado, com o sinal: é assim que a nota o mostra,
                  // e é o que se corrige.
                  nome={mencao.bruto}
                  detalhe={NENHUM[mencao.tipo]}
                  icone={GRUPO[mencao.tipo].icone}
                  apagado
                  aoProcurar={() => aoProcurar(mencao.bruto)}
                  aoIrParaLinha={aoIrParaLinha}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function Cabecalho({
  icone: Icone,
  titulo,
  total,
}: {
  icone: LucideIcon;
  titulo: string;
  total: number;
}) {
  return (
    <h3 className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
      <Icone className="size-3.5" aria-hidden />
      {titulo}
      <span className="tabular-nums">{total}</span>
    </h3>
  );
}

/**
 * A miniatura da menção, do tamanho de duas linhas do painel: a cara do
 * personagem, a imagem, o fundo do mapa. Clicável como o nome, porque é a
 * coisa. Sem imagem, o ícone do tipo na mesma caixa, para a lista não
 * dançar entre uma menção e outra.
 */
function Miniatura({
  assetId,
  icone: Icone,
  nome,
  abrir,
  apagado,
}: {
  assetId?: string;
  icone: LucideIcon;
  nome: string;
  abrir?: () => void;
  apagado?: boolean;
}) {
  const url = useAssetUrl(assetId, "mini");
  const conteudo = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      draggable={false}
      // `cover` pode: o painel está fora do palco, onde o `zoom` não entra --
      // ver `caberEm`.
      className="size-full object-cover"
      {...MINIATURA}
    />
  ) : (
    <Icone className={cn("size-4", apagado ? "opacity-40" : "opacity-70")} aria-hidden />
  );
  const caixa =
    "bg-foreground/10 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md";

  return abrir ? (
    <button
      type="button"
      className={cn(caixa, "hover:ring-foreground/30 cursor-pointer hover:ring-2")}
      title={t.geral.abrirNome(nome)}
      aria-label={t.geral.abrirNome(nome)}
      onClick={abrir}
    >
      {conteudo}
    </button>
  ) : (
    <span className={caixa} aria-hidden>
      {conteudo}
    </span>
  );
}

function Item({
  mencao,
  nome,
  detalhe,
  abrir,
  miniatura,
  icone,
  apagado,
  aoProcurar,
  aoIrParaLinha,
}: {
  mencao: MencaoDaNota;
  nome: string;
  detalhe: string;
  abrir?: () => void;
  miniatura?: string;
  icone: LucideIcon;
  /** O que não resolveu: o ícone mais apagado, que não é a cara de nada. */
  apagado?: boolean;
  aoProcurar: () => void;
  aoIrParaLinha: (indice: number) => void;
}) {
  const aVista = mencao.linhas.slice(0, LINHAS_A_VISTA);
  const resto = mencao.linhas.length - aVista.length;

  return (
    <li className="flex gap-2">
      <Miniatura assetId={miniatura} icone={icone} nome={nome} abrir={abrir} apagado={apagado} />
      <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1">
        {abrir ? (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
            title={t.geral.abrirNome(nome)}
            onClick={abrir}
          >
            {nome}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate font-medium" title={nome}>
            {nome}
          </span>
        )}
        <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums" title={t.mencoesDaNota.vezesNaNota}>
          {mencao.vezes}×
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t.mencoesDaNota.ondeAparece(nome)}
          title={t.mencoesDaNota.destacar}
          onClick={aoProcurar}
        >
          <Search />
        </Button>
      </div>
      <p className="text-muted-foreground truncate text-[10px]">{detalhe}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {aVista.map((indice) => (
          <button
            key={indice}
            type="button"
            className="bg-foreground/5 hover:bg-accent rounded px-1 text-[10px] tabular-nums"
            title={t.mencoesDaNota.irParaLinha(indice + 1)}
            onClick={() => aoIrParaLinha(indice)}
          >
            {t.mencoesDaNota.linhaCurta(indice + 1)}
          </button>
        ))}
        {resto > 0 ? (
          <span className="text-muted-foreground text-[10px]">+{resto}</span>
        ) : null}
      </div>
      </div>
    </li>
  );
}

/** Uma linha da tabela de convenções: o que se escreve, e o que isso faz. */
function Convencao({ escrita, children }: { escrita: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[7.5rem_1fr] items-baseline gap-2">
      <code className="bg-foreground/10 truncate rounded px-1 py-0.5 text-[11px]">{escrita}</code>
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}

/**
 * As convenções das menções, a um clique: quem escreve uma nota nova não
 * sabe que `@` é personagem, e a regra não está escrita em lugar nenhum da
 * tela até alguém a digitar por acaso.
 */
function Convencoes() {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t.mencoesDaNota.convencoesDasMencoes}
            title={t.mencoesDaNota.comoMarcar}
          />
        }
      >
        <CircleHelp />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-80 text-xs">
        <p className="mb-2 font-medium">{t.mencoesDaNota.comoCitar}</p>
        <ul className="space-y-1.5">
          {t.mencoesDaNota.convencoes.map(([escrita, faz]) => (
            <Convencao key={escrita} escrita={escrita}>
              {faz}
            </Convencao>
          ))}
        </ul>
        <p className="mt-3 mb-2 font-medium">{t.mencoesDaNota.naLinha}</p>
        <ul className="space-y-1.5">
          {t.mencoesDaNota.convencoesNaLinha.map(([escrita, faz]) => (
            <Convencao key={escrita} escrita={escrita}>
              {faz}
            </Convencao>
          ))}
        </ul>
        <p className="text-muted-foreground mt-3 leading-relaxed">
          {rico(t.mencoesDaNota.sinalSoVale, {
            email: <code>{t.mencoesDaNota.exemploEmail}</code>,
            fracao: <code>3/4</code>,
          })}
        </p>
      </PopoverContent>
    </Popover>
  );
}
