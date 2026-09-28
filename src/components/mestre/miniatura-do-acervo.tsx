"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { useAssetUrl } from "@/hooks/use-asset-url";
import { useAssetsStore } from "@/lib/store/use-assets-store";
import { MINIATURA } from "@/lib/miniatura";
import { cn } from "@/lib/utils";

/**
 * A miniatura de um arquivo do acervo numa lista do mestre: o primeiro quadro,
 * e a animação inteira enquanto o mouse está em cima.
 *
 * Parada por padrão, e não animando: a miniatura é a redução de 160px, e a
 * redução é um quadro só -- ver `vault/animacao.rs`. Animar a lista inteira
 * pediria o ORIGINAL de cada GIF, e uma biblioteca com sessenta deles
 * decodificaria sessenta animações que ninguém está olhando. O selo diz que o
 * arquivo se mexe; o hover mostra como.
 *
 * O original entra POR CIMA da miniatura, e não no lugar dela: enquanto ele
 * chega, o primeiro quadro continua ali, e o quadrado não pisca vazio.
 *
 * Quem sabe se o mouse está em cima é a LINHA, e não este quadrado: numa linha
 * de 40px o mestre passa o mouse pelo nome, e esperar que ele mire o polegar
 * seria esconder a animação. A linha é o `<li>` mais próximo, e o componente a
 * escuta sozinho: as listas montam as linhas em `map` dentro de componentes
 * grandes, e pedir um hook de hover por linha a cada uma delas seria espalhar
 * o mesmo manipulador por sete arquivos.
 *
 * Tem de morar num contêiner `relative` e com `overflow-hidden`: o original e o
 * selo são posicionados sobre ele.
 */
export function MiniaturaDoAcervo({
  assetId,
  animada,
  animaNoHover = true,
  selo = true,
  alt = "",
  className,
  style,
}: {
  assetId: string | undefined;
  /** O arquivo se mexe. Ver `AssetMeta.animada` e `useAnimada`. */
  animada?: boolean;
  /**
   * Desligado em quem desenha DENTRO do palco, como o cartão do alfinete: ali
   * o `object-cover` erra sob `zoom` quando a imagem é grande, e o original do
   * hover é -- a miniatura de 160px passa. Ver `caberEm`. O selo continua.
   */
  animaNoHover?: boolean;
  /**
   * O selo de "se mexe". Desligado nos quadrados pequenos demais para ele --
   * num rosto de 28px o selo cobriria o rosto.
   */
  selo?: boolean;
  alt?: string;
  className?: string;
  /** O espelho do item, na lista de camadas. Vale para os dois quadros. */
  style?: CSSProperties;
}) {
  const ancora = useRef<HTMLSpanElement>(null);
  const [animar, setAnimar] = useState(false);

  useEffect(() => {
    const aqui = ancora.current;
    // Parada não escuta nada: é o caso de quase toda linha de toda lista.
    if (!animada || !animaNoHover || !aqui) return;

    const linha = aqui.closest("li") ?? aqui.parentElement;
    if (!linha) return;

    // Ponteiro, e não `mouse`: a caneta de mesa digitalizadora também passa
    // por cima. O toque não tem "por cima", e fica com o primeiro quadro.
    const entrar = () => setAnimar(true);
    const sair = () => setAnimar(false);
    linha.addEventListener("pointerenter", entrar);
    linha.addEventListener("pointerleave", sair);

    return () => {
      linha.removeEventListener("pointerenter", entrar);
      linha.removeEventListener("pointerleave", sair);
      setAnimar(false);
    };
  }, [animada, animaNoHover]);

  const mini = useAssetUrl(assetId, "mini");
  const original = useAssetUrl(animada && animar ? assetId : undefined);

  return (
    // `contents`: a âncora não desenha caixa nenhuma, e os dois quadros e o
    // selo continuam posicionados pelo contêiner de quem chama.
    <span ref={ancora} className="contents">
      {mini ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mini}
          alt={alt}
          className={cn("size-full object-cover", className)}
          style={style}
          draggable={false}
          {...MINIATURA}
        />
      ) : null}

      {original ? (
        // Sem `loading="lazy"`: ela só existe porque está sendo olhada.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={original}
          alt=""
          aria-hidden
          className={cn("absolute inset-0 size-full object-cover", className)}
          style={style}
          draggable={false}
          decoding="async"
        />
      ) : null}

      {animada && selo && !animar ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-0.5 bottom-0.5 grid size-3.5 place-items-center rounded-sm bg-black/60 text-white"
        >
          <Play className="size-2 fill-current" />
        </span>
      ) : null}
    </span>
  );
}

/**
 * O arquivo se mexe? Pelo acervo que o mestre já leu -- ver `useAssetsStore`.
 *
 * Um booleano, e não o metadado: a lista de camadas redesenharia toda linha a
 * cada leitura nova do acervo se o seletor devolvesse um objeto.
 */
export function useAnimada(assetId: string | undefined): boolean {
  return useAssetsStore((state) =>
    Boolean(
      assetId &&
      state.image.assets?.some(
        (asset) => asset.id === assetId && asset.animada,
      ),
    ),
  );
}
