"use client";

import { MiniaturaDoAcervo } from "@/components/mestre/miniatura-do-acervo";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { cn } from "@/lib/utils";

/**
 * O retrato do personagem como COR: a miniatura ampliada e desfocada, com um
 * véu escuro por cima. O par de `ImagemDesfocada`, da janela do item.
 *
 * A miniatura de 160 pixels, e não o retrato inteiro: desfocadas, as duas
 * ficam iguais, e a pequena custa alguns KB. Contido, como o do item -- é a
 * cor do personagem que tem de aparecer, e não o retrato competindo com o
 * nome. `forte` é o do cabeçalho da janela, uma faixa de 40 pixels que,
 * recolhida, é tudo o que sobra: ali a cor é o que diz de quem é a ficha.
 *
 * Mora num contêiner posicionado: as duas camadas são `absolute inset-0`.
 */
export function RetratoDesfocado({
  assetId,
  forte = false,
}: {
  assetId: string;
  forte?: boolean;
}) {
  return (
    <>
      <MiniaturaDoAcervo
        assetId={assetId}
        selo={false}
        animaNoHover={false}
        className={cn(
          "absolute inset-0 size-full scale-125 object-cover blur-2xl",
          forte ? "opacity-80 saturate-150" : "opacity-50 saturate-125",
        )}
      />
      <div className={cn("absolute inset-0", forte ? "bg-black/25" : "bg-black/30")} />
    </>
  );
}

/**
 * O retrato desfocado atrás do cabeçalho da janela da ficha. Ver
 * `FundoDaJanela`.
 *
 * O retrato, e o token quando não há retrato: é a imagem que diz quem ele é.
 * O molde do Compêndio também -- a ficha dele é a mesma janela.
 */
export function FundoDoPersonagem({ personagemId }: { personagemId: string }) {
  const personagem = useCharactersStore(
    (state) =>
      state.personagens?.find((atual) => atual.id === personagemId) ??
      state.moldes?.find((atual) => atual.id === personagemId),
  );
  const imagem = personagem?.retrato ?? personagem?.miniatura;

  if (!imagem) return null;

  return <RetratoDesfocado assetId={imagem} forte />;
}
