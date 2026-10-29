"use client";

import { Package, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { BotaoDeRolarDoAchado, detalheRola } from "@/components/jogador/detalhes-jogador";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/lib/i18n/jogador";
import { myCharacters } from "@/lib/player/characters";
import { detalhesDoPersonagem, type DetalheDoJogador } from "@/lib/player/detalhes";
import { myInventory } from "@/lib/player/inventory";
import { normaliza } from "@/lib/search";
import { useFocoNoDetalhe } from "@/lib/store/use-foco-no-detalhe";
import { cn } from "@/lib/utils";
import type { AtributoDaConta } from "@/lib/mestre/expressao-de-rolagem";
import { atributosDaConta, textoSemChaves } from "@/lib/mestre/rolagens-no-texto";
import type { Personagem } from "@/types/character";
import type { ItemInventario } from "@/types/inventory";

/** Quantos achados a lista mostra. Mais que isso é digitar mais uma letra. */
const TETO = 60;

/**
 * `conta` é o que as chaves leem da ficha DESTE personagem -- a busca junta
 * vários --: os atributos pela sigla e os detalhes pela menção. Ver
 * `atributosDaConta`.
 */
type Achado = { personagem: Personagem; conta: AtributoDaConta[] } & (
  | { tipo: "detalhe"; detalhe: DetalheDoJogador }
  | { tipo: "item"; item: ItemInventario }
);

/** Tudo em que a busca procura, de todos os personagens do jogador. */
type Acervo = Achado[];

/**
 * A busca da tela deitada: um campo no meio da tela, sobre o fundo escurecido,
 * e a lista do que casou -- os detalhes da ficha e os itens da mochila, de
 * todos os personagens do jogador.
 *
 * No meio, e não presa no alto da barra lateral: deitado, a barra é estreita e
 * baixa, e a busca é de passagem -- "qual era a DT do ritual?" --, então ela
 * aparece quando chamada e some depois, sem gastar uma linha da barra o tempo
 * todo. Altura fixa: o campo não pula enquanto a lista cresce e encolhe.
 *
 * Lê tudo ao abrir, e não a cada letra: são poucos personagens e poucas
 * dezenas de detalhes, e filtrar na mão é instantâneo.
 */
export function BuscaDoJogador({
  codigo,
  aberta,
  onFechar,
}: {
  codigo: string;
  aberta: boolean;
  onFechar: () => void;
}) {
  return (
    <Dialog open={aberta} onOpenChange={(abrir) => !abrir && onFechar()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/60"
        className="flex h-[min(30rem,85dvh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">{t.personagens.buscar}</DialogTitle>
        {aberta ? <ConteudoDaBusca codigo={codigo} onFechar={onFechar} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ConteudoDaBusca({ codigo, onFechar }: { codigo: string; onFechar: () => void }) {
  const [texto, setTexto] = useState("");
  const [acervo, setAcervo] = useState<Acervo | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      const personagens = await myCharacters(codigo).catch(() => [] as Personagem[]);
      const partes = await Promise.all(
        personagens.map(async (personagem): Promise<Achado[]> => {
          const [ficha, itens] = await Promise.all([
            detalhesDoPersonagem(codigo, personagem.id).catch(() => null),
            myInventory(codigo, personagem.id).catch(() => [] as ItemInventario[]),
          ]);
          const conta = atributosDaConta(personagem.atributos, ficha?.detalhes);
          return [
            ...(ficha?.detalhes ?? []).map((detalhe) => ({ tipo: "detalhe" as const, personagem, conta, detalhe })),
            ...itens.map((item) => ({ tipo: "item" as const, personagem, conta, item })),
          ];
        }),
      );
      if (ativo) setAcervo(partes.flat());
    })();

    return () => {
      ativo = false;
    };
  }, [codigo]);

  const termo = normaliza(texto.trim());
  const variosPersonagens = new Set(acervo?.map((achado) => achado.personagem.id)).size > 1;

  const achados = termo
    ? (acervo ?? [])
        .filter((achado) =>
          (achado.tipo === "detalhe"
            ? [
                achado.detalhe.rotulo,
                achado.detalhe.grupo,
                achado.detalhe.valor === undefined ? "" : String(achado.detalhe.valor),
                achado.detalhe.descricao ?? "",
              ]
            : [achado.item.nome, achado.item.descricao]
          ).some((campo) => normaliza(campo).includes(termo)),
        )
        .slice(0, TETO)
    : [];

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b px-3">
        <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <input
          autoFocus
          value={texto}
          onChange={(evento) => {
            setTexto(evento.target.value);
            setAberto(null);
          }}
          enterKeyHint="search"
          placeholder={t.personagens.buscar}
          aria-label={t.personagens.buscar}
          className="placeholder:text-muted-foreground h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <kbd className="text-muted-foreground rounded border px-1.5 py-0.5 text-[10px]">Esc</kbd>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {!termo ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">{t.busca.dica}</p>
        ) : acervo === null ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">{t.personagens.lendo}</p>
        ) : achados.length === 0 ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">
            {t.personagens.nadaEncontrado(texto.trim())}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {achados.map((achado) => {
              const chave = `${achado.personagem.id}/${achado.tipo}/${achado.tipo === "detalhe" ? achado.detalhe.id : achado.item.id}`;
              return (
                <LinhaDoAchado
                  key={chave}
                  codigo={codigo}
                  achado={achado}
                  deQuem={variosPersonagens ? achado.personagem.nome : undefined}
                  aberta={aberto === chave}
                  onAlternar={() => setAberto((atual) => (atual === chave ? null : chave))}
                  onFechar={onFechar}
                />
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * Um achado: o nome e o valor, de onde é (o grupo da ficha, ou a mochila), e a
 * descrição. Tocar no detalhe leva à ficha, no lugar dele, que pisca para o
 * olho pousar -- achar a Luta é para encontrar a Luta. O que rola ganha o botão
 * "rolar" ao lado, que sorteia sem sair da busca. O item abre a descrição no
 * lugar, que é tudo o que a busca sabe dele.
 */
function LinhaDoAchado({
  codigo,
  achado,
  deQuem,
  aberta,
  onAlternar,
  onFechar,
}: {
  codigo: string;
  achado: Achado;
  /** O nome do personagem, quando o jogador tem mais de um. */
  deQuem?: string;
  aberta: boolean;
  onAlternar: () => void;
  /** Fecha a busca depois de mandar a ficha mostrar o detalhe. */
  onFechar: () => void;
}) {
  const focar = useFocoNoDetalhe((state) => state.focar);

  const ehDetalhe = achado.tipo === "detalhe";
  const nome = ehDetalhe ? achado.detalhe.rotulo : achado.item.nome;
  // A ficha DESTE personagem, para a sigla e a menção da conta desenharem o
  // dado certo. Ver `textoSemChaves` e `BotaoDeRolarDoAchado`.
  const atributos = achado.conta;
  const descricao = ehDetalhe ? achado.detalhe.descricao : achado.item.descricao;
  const origem = ehDetalhe ? achado.detalhe.grupo : t.mochila.titulo;

  // O dado do detalhe vira o botão "rolar"; então o valor dele não precisa
  // repetir a conta em texto. Sem dado, o valor é o que a linha tem a mostrar.
  const rola = ehDetalhe && detalheRola(achado.detalhe, atributos);
  const valor = !ehDetalhe
    ? achado.item.quantidade > 1
      ? `×${achado.item.quantidade}`
      : ""
    : rola || achado.detalhe.valor === undefined || achado.detalhe.valor === ""
      ? ""
      : textoSemChaves(String(achado.detalhe.valor), atributos);

  // O detalhe leva à ficha e pisca; o item abre a descrição no lugar.
  const aoTocar = ehDetalhe
    ? () => {
        focar({ personagemId: achado.personagem.id, detalheId: achado.detalhe.id });
        onFechar();
      }
    : onAlternar;

  return (
    <li className="hover:bg-accent/50 rounded-md">
      <div className="flex min-w-0 items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={aoTocar}
          aria-expanded={!ehDetalhe && descricao ? aberta : undefined}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex min-w-0 items-baseline gap-2">
            {ehDetalhe ? null : (
              <Package className="text-muted-foreground size-3.5 shrink-0 self-center" aria-hidden />
            )}
            <span className="min-w-0 truncate text-sm font-medium">{nome}</span>
            {valor ? (
              <span className="text-muted-foreground shrink-0 text-sm tabular-nums">{valor}</span>
            ) : null}
          </span>
          {descricao ? (
            <span
              className={cn(
                "text-muted-foreground mt-0.5 block text-xs leading-snug whitespace-pre-line",
                // O item abre ao tocar; o detalhe não abre aqui -- ele leva à
                // ficha --, então sua descrição fica sempre nas duas linhas.
                (ehDetalhe || !aberta) && "line-clamp-2",
              )}
            >
              {textoSemChaves(descricao, atributos)}
            </span>
          ) : null}
        </button>

        {ehDetalhe ? (
          <BotaoDeRolarDoAchado
            codigo={codigo}
            personagemId={achado.personagem.id}
            detalhe={achado.detalhe}
            atributos={atributos}
          />
        ) : null}

        <span className="text-muted-foreground shrink-0 self-start rounded border px-1.5 py-0.5 text-[10px]">
          {deQuem ? `${deQuem} · ${origem}` : origem}
        </span>
      </div>
    </li>
  );
}
