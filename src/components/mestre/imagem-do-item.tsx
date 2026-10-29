"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Package } from "lucide-react";

import { MINIATURA } from "@/lib/miniatura";
import { cn } from "@/lib/utils";
import { assetUrl, type Variante } from "@/lib/vault/assets";
import { characterAttachmentUrl } from "@/lib/vault/characters";
import type { ImagemItem } from "@/types/inventory";
import { chaveDaImagem } from "@/types/inventory";

/**
 * A imagem de um item, venha ela de onde vier.
 *
 * Os dois braços da união têm transportes diferentes, e esconder isso aqui é o
 * que deixa o resto da tela tratar item como item: `asset` é o acervo, que a
 * janela alcança pelo endereço do daemon; `anexo` é a foto do jogador, atrás do
 * token, e o mestre chega a ela pelo IPC, como blob — mesma razão de
 * `AnexoThumb` em `character-window`.
 *
 * Saiu da ficha quando o item ganhou outros lugares onde aparecer: a janela de
 * Itens, o cartão do ponto, o handout e o diálogo do item desenham a mesma
 * imagem, e cada um com a sua cópia deste componente seria um jeito diferente
 * de a foto do jogador falhar.
 *
 * Sem imagem, ou com a imagem que não abriu, a caixa: é o desenho de "item" em
 * todo o aplicativo, e o ícone da janela de Itens.
 *
 * A `key` com `chaveDaImagem` fica por conta deste componente: trocar a imagem
 * remonta o miolo, e é isso que zera o endereço antigo sem um efeito que chama
 * `setState` para limpar.
 */
export function ImagemDoItem({
  imagem,
  variante = "mini",
  className,
  classeDoIcone,
  cobrir = false,
}: {
  imagem: ImagemItem | undefined;
  /** Só vale para o acervo. A foto do jogador vem inteira, pelo IPC. */
  variante?: Variante;
  /** Classes da `<img>`. */
  className?: string;
  /** Classes da caixa que aparece no lugar. */
  classeDoIcone?: string;
  /**
   * Cobre um contêiner QUADRADO com a conta feita aqui, e não com
   * `object-cover`.
   *
   * Para quem desenha dentro do palco, como o cartão do ponto: lá o plano troca
   * `transform` por `zoom` quando a câmera para, e sob `zoom` o WebKitGTK erra o
   * `object-cover` de arquivo grande — e a foto do jogador vem inteira, sem a
   * redução de 160px que salva a miniatura do acervo. Ver `caberEm`.
   */
  cobrir?: boolean;
}) {
  return (
    <Miolo
      key={chaveDaImagem(imagem)}
      imagem={imagem}
      variante={variante}
      className={className}
      classeDoIcone={classeDoIcone}
      cobrir={cobrir}
    />
  );
}

function Miolo({
  imagem,
  variante,
  className,
  classeDoIcone,
  cobrir,
}: {
  imagem: ImagemItem | undefined;
  variante: Variante;
  className?: string;
  classeDoIcone?: string;
  cobrir: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  /** Largura sobre altura, lida do arquivo quando ele abre. Só no `cobrir`. */
  const [proporcao, setProporcao] = useState<number | null>(null);

  useEffect(() => {
    if (!imagem) return;

    let ativo = true;
    let criada: string | null = null;

    const pedido =
      imagem.tipo === "asset"
        ? assetUrl(imagem.id, variante)
        : characterAttachmentUrl(imagem.personagem, {
            autor: imagem.autor,
            arquivo: imagem.arquivo,
            mimeType: mimeDaImagem(imagem.arquivo),
            tamanho: 0,
          });

    void pedido.then(
      (endereco) => {
        if (!ativo) {
          // Trocou a imagem enquanto os bytes vinham. A blob nova não serve
          // mais a ninguém, e guardá-la seria vazamento. O endereço do acervo
          // não é blob e não precisa disso.
          if (endereco.startsWith("blob:")) URL.revokeObjectURL(endereco);
          return;
        }

        if (endereco.startsWith("blob:")) criada = endereco;
        setUrl(endereco);
      },
      () => {
        if (ativo) setFalhou(true);
      },
    );

    return () => {
      ativo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [imagem, variante]);

  if (!imagem || falhou || !url) {
    return (
      <Package
        className={cn("text-muted-foreground/40 size-6 shrink-0", classeDoIcone)}
        aria-hidden
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      draggable={false}
      className={cobrir ? cn("absolute max-w-none object-fill", className) : className}
      style={cobrir ? cobrirQuadrado(proporcao) : undefined}
      onLoad={
        cobrir
          ? (event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0)
                setProporcao(naturalWidth / naturalHeight);
            }
          : undefined
      }
      onError={() => setFalhou(true)}
      {...MINIATURA}
    />
  );
}

/**
 * O recorte de `object-cover` num quadrado, em porcentagem do quadrado.
 *
 * A imagem estica (`object-fill`, que o `zoom` não erra) para uma caixa maior
 * que o quadrado no lado que sobra, centrada: é exatamente o que o `cover`
 * desenharia. Porcentagem, e não pixel, para não precisar medir o contêiner.
 * Antes de o arquivo abrir não há proporção, e a imagem ocupa o quadrado.
 */
function cobrirQuadrado(proporcao: number | null): CSSProperties {
  if (!proporcao) return { inset: 0, width: "100%", height: "100%" };

  if (proporcao >= 1) {
    return {
      top: 0,
      height: "100%",
      width: `${proporcao * 100}%`,
      left: `${((1 - proporcao) / 2) * 100}%`,
    };
  }

  return {
    left: 0,
    width: "100%",
    height: `${(1 / proporcao) * 100}%`,
    top: `${((1 - 1 / proporcao) / 2) * 100}%`,
  };
}

/**
 * O tipo do arquivo, pela extensão.
 *
 * A blob precisa de um tipo declarado para o `<img>` a desenhar, e o item guarda
 * só o NOME do anexo — o tamanho e o mime que `AnexoPersonagem` carrega vêm da
 * listagem de arquivos, que aqui não foi feita. Imagem é o único caso que chega
 * como imagem de item, e `image/png` é o palpite que o navegador corrige
 * sozinho quando erra o subtipo.
 */
function mimeDaImagem(arquivo: string): string {
  const extensao = arquivo.toLowerCase().split(".").pop() ?? "";

  const conhecidos: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    svg: "image/svg+xml",
  };

  return conhecidos[extensao] ?? "image/png";
}

/**
 * O que o gesto de arrastar precisa da imagem que está na tela: o endereço e a
 * medida.
 *
 * Lido do `<img>` já desenhado dentro do elemento, e não pedido de novo ao
 * disco: o `pointerdown` é síncrono e não espera IPC. Item cuja imagem ainda
 * não carregou não leva endereço — ele ainda vai a personagens, pontos e
 * handouts, só não ao mapa.
 */
export function imagemDesenhada(
  dentro: Element,
): { url: string; largura: number; altura: number } | null {
  const img = dentro.querySelector("img");
  const url = img?.currentSrc || img?.src;
  if (!img || !url) return null;

  return { url, largura: img.naturalWidth, altura: img.naturalHeight };
}
