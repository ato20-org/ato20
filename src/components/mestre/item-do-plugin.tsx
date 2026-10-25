"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Package, PackagePlus } from "lucide-react";

import { Etiqueta, falhou, ImagemDoPlugin } from "@/components/mestre/compendio-cartao";
import { Button } from "@/components/ui/button";
import { useAura } from "@/lib/extensoes/auras";
import { chaveContribuicao } from "@/lib/extensoes/manifesto";
import { t } from "@/lib/i18n/mestre";
import { avisarDoItemTrazido } from "@/lib/mestre/bestiario";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import { itensMudaram } from "@/lib/store/use-itens-store";
import {
  itemDoPlugin,
  itemDoPluginEmJogo,
  trazerItemDoPlugin,
  type ItemCompletoDoPlugin,
  type QualItem,
} from "@/lib/vault/itens-do-plugin";

const texto = t.compendio;

/**
 * Um item de um plugin, para LER sem trazer: o que o card de Itens abre.
 *
 * Só de leitura pela razão da ficha do plugin (`FichaDoPluginBody`): folhear o
 * arsenal não pode encher o Compêndio da campanha de cópias. Quem quer mexer
 * traz, e quem quer usar põe em jogo -- os dois botões do topo, os mesmos do
 * card. Desenho próprio, e não a janela do item, que lê e grava pelo id de um
 * item da campanha. Ver `itens_do_plugin::item`.
 */
export function ItemDoPluginBody({ extensaoId, colecaoId, itemId }: QualItem) {
  const [lido, setLido] = useState<
    { qual: string; item: ItemCompletoDoPlugin } | { qual: string; erro: string } | null
  >(null);
  // Relê quando a lista de plugins muda: o plugin atualizado traz o item novo,
  // e o desligado fecha a porta.
  const extensoes = useExtensoesStore((estado) => estado.extensoes);
  const qual = `${extensaoId}/${colecaoId}/${itemId}`;

  useEffect(() => {
    let ativo = true;

    void itemDoPlugin({ extensaoId, colecaoId, itemId }).then(
      (item) => {
        if (ativo) setLido({ qual, item });
      },
      (cause) => {
        if (ativo) setLido({ qual, erro: cause instanceof Error ? cause.message : String(cause) });
      },
    );

    return () => {
      ativo = false;
    };
  }, [extensaoId, colecaoId, itemId, qual, extensoes]);

  // A leitura de outro item não vale para este: a janela reaproveitada mostra
  // "lendo" em vez do item anterior.
  if (!lido || lido.qual !== qual) return <p className="text-muted-foreground p-4 text-xs">{texto.lendo}</p>;
  if ("erro" in lido) return <p className="text-destructive p-4 text-xs">{texto.itemNaoAbriu(lido.erro)}</p>;

  return <ItemDoPlugin qual={{ extensaoId, colecaoId, itemId }} completo={lido.item} />;
}

function ItemDoPlugin({ qual, completo }: { qual: QualItem; completo: ItemCompletoDoPlugin }) {
  const { item } = completo;
  const aura = useAura(completo.aura ? chaveContribuicao(qual.extensaoId, completo.aura) : null);
  // A imagem da pasta. A por URL só é baixada ao trazer, como no card.
  const imagem = item.imagem && !item.imagem.includes("://") ? item.imagem : null;

  function porAgora() {
    void itemDoPluginEmJogo(qual).then(({ trazido, item: novo }) => {
      itensMudaram([]);
      toast.success(texto.noCatalogo(novo.nome));
      avisarDoItemTrazido(trazido);
    }, falhou);
  }

  function trazer() {
    void trazerItemDoPlugin(qual).then((trazido) => {
      itensMudaram([]);
      toast.success(
        trazido.jaHavia ? texto.jaNaCampanha(trazido.item.nome) : texto.trazido(trazido.item.nome),
      );
      avisarDoItemTrazido(trazido);
    }, falhou);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      <div className="flex gap-3">
        <span
          className="bg-muted/60 relative flex aspect-square w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border"
          style={aura ? { borderColor: aura.cor } : undefined}
        >
          {imagem ? (
            <ImagemDoPlugin extensaoId={qual.extensaoId} caminho={imagem} />
          ) : (
            <Package className="text-muted-foreground size-8" aria-hidden />
          )}
        </span>

        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-base leading-tight font-semibold">{item.nome}</h2>
          {item.tags.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <Etiqueta key={tag}>{tag}</Etiqueta>
              ))}
            </span>
          ) : null}
          {item.fonte ? <span className="text-muted-foreground text-[10px]">{item.fonte}</span> : null}

          <span className="mt-auto flex flex-wrap gap-1.5">
            <Button size="sm" onClick={porAgora}>
              <PackagePlus />
              {texto.porNoCatalogo}
            </Button>
            <Button size="sm" variant="outline" onClick={trazer}>
              <Download />
              {texto.trazer}
            </Button>
          </span>
        </div>
      </div>

      {item.descricao ? <p className="text-xs whitespace-pre-line">{item.descricao}</p> : null}

      {item.atributos.length > 0 ? (
        <section aria-label={texto.atributosDoItem} className="flex flex-col gap-1.5">
          <h3 className="text-muted-foreground text-xs font-medium">{texto.atributosDoItem}</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {item.atributos.map((atributo, indice) => (
              <div key={`${indice}-${atributo.nome}`} className="contents">
                <dt className="text-muted-foreground">{atributo.nome}</dt>
                <dd className="min-w-0">{atributo.valor || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {item.medidores.length > 0 ? (
        <section aria-label={texto.medidoresDoItem} className="flex flex-col gap-1.5">
          <h3 className="text-muted-foreground text-xs font-medium">{texto.medidoresDoItem}</h3>
          <ul className="flex flex-wrap gap-1.5">
            {item.medidores.map((medidor) => (
              <li
                key={medidor.nome}
                className="bg-muted/40 flex items-baseline gap-1.5 rounded-md border px-2 py-1 text-xs"
                style={medidor.cor ? { borderColor: medidor.cor } : undefined}
              >
                <span className="text-muted-foreground font-medium">{medidor.nome}</span>
                <span className="font-semibold tabular-nums">{medidor.maximo}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
