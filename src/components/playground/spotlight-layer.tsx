"use client";

import { useState } from "react";
import { Eye, EyeOff, Package } from "lucide-react";

import { ImageZoom } from "@/components/attachments/image-zoom";
import { DescricaoDoItem } from "@/components/playground/descricao-do-item";
import { MedidoresDoItem } from "@/components/playground/medidores-do-item";
import { useSpotlightUrl } from "@/hooks/use-spotlight-url";
import { t } from "@/lib/i18n/palco";
import { cn } from "@/lib/utils";
import type { Spotlight } from "@/types/scene";

/**
 * A imagem que o mestre mandou a mesa olhar, na frente de tudo.
 *
 * Cobre a tela inteira, e não um canto: o nome do gesto é "em evidência", e uma
 * miniatura sobre o mapa seria o oposto — a mesa continuaria olhando o mapa e
 * perguntando o que era aquilo no canto. Um documento, um retrato ou uma carta
 * precisam ser lidos, e ler exige o espaço.
 *
 * `dismissable` é a diferença entre a TV e o celular, e vale para os dois
 * controles desta tela — esconder e ampliar. Na TV não há ninguém operando:
 * botão ali só corre o risco de alguém encostar, e ninguém vai fazer zoom numa
 * tela sem cursor nem dono. No celular há uma mão. O jogador tem também a
 * própria ficha e o mapa, e uma imagem que ele não pode encostar de lado o
 * deixaria preso enquanto o mestre não lembrasse de tirar; e uma carta ou uma
 * ficha caberem na tela não é o mesmo que poderem ser lidas nela — sem zoom, a
 * mesa recebe a imagem e não alcança o que está escrito. Encostar de lado não é
 * tirar do ar: a imagem continua no ar para todo mundo, e volta com um toque.
 */
export function SpotlightLayer({
  spotlight,
  dismissable = false,
}: {
  spotlight: Spotlight | null;
  dismissable?: boolean;
}) {
  // Pelo `useSpotlightUrl`, e não pelo id do acervo: a evidência também pode
  // ser o anexo de um jogador, que não é asset e sai por `/evidencia/{id}`.
  const url = useSpotlightUrl(spotlight);

  /**
   * QUAL transmissão o jogador encostou de lado — o `since` dela, não um
   * booleano.
   *
   * Guardar o instante em vez de um sim/não resolve dois casos sem nenhum
   * efeito para limpar estado. Uma transmissão nova tem `since` diferente e
   * portanto nasce visível, mesmo para quem escondeu a anterior: o mestre
   * chamar a atenção outra vez vence um "esconder" que era sobre outra imagem.
   * E um valor que ficou aqui depois de o mestre tirar tudo do ar é inofensivo,
   * porque a comparação é sempre contra o `since` atual.
   */
  const [escondido, setEscondido] = useState<number | null>(null);

  if (!spotlight) return null;

  const oculto = escondido === spotlight.since;

  if (oculto) {
    return (
      // No ALTO, e não mais no rodapé. Embaixo ela caía exatamente sobre a
      // bolinha do saquinho, que passou a morar no meio da barra: o aviso de
      // que há uma imagem no ar cobria o botão mais usado da tela, e tocar num
      // era tocar no outro. Em cima não disputa com nada fixo — a cena fica
      // logo abaixo do cabeçalho, e o que a faixa cobre é imagem, não controle.
      <button
        type="button"
        className="fixed top-2 left-1/2 z-60 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/80 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur"
        onClick={() => setEscondido(null)}
      >
        <Eye className="size-3.5" aria-hidden />
        {t.evidencia.ver}
      </button>
    );
  }

  return (
    // `fixed` e `z-60`: cobre a viewport inteira e vence a tela cheia da
    // Jogador, que é `fixed inset-0 z-50`. Um jogador com o mapa expandido
    // veria, por baixo de um retângulo preto, justamente a imagem que o mestre
    // acabou de mandar olhar.
    <div
      className={cn(
        "fixed inset-0 z-60 flex flex-col items-center justify-center gap-3 bg-black/92 p-4 backdrop-blur-sm",
        // `key` na transmissão faz a entrada em fade repetir a cada imagem
        // nova, o que é o sinal de que algo mudou numa tela que ninguém opera.
        "scene-fade-in",
      )}
      key={spotlight.since}
    >
      {spotlight.item ? (
        <CartaoDoItem item={spotlight.item} url={url} />
      ) : url ? (
        dismissable ? (
          // O mesmo gesto que o jogador já tem nos próprios arquivos: roda,
          // pinça, arrasto e duplo toque. O `key` do contêiner é o `since`, e
          // é isso que faz cada transmissão nova nascer encaixada em vez de
          // herdar o recorte da anterior.
          <ImageZoom
            src={url}
            alt={t.evidencia.imagem}
            className="min-h-0 w-full flex-1"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={t.evidencia.imagem}
            draggable={false}
            // `object-contain` com teto de altura: documento em pé e mapa
            // deitado passam pelo mesmo caminho, e cortar qualquer um dos dois
            // esconderia justamente o que se mandou olhar.
            // O `SpotlightLayer` e sobreposicao de tela inteira, montada
            // fora do `SceneStage`: nao ha `zoom` no caminho dele.
            // eslint-disable-next-line no-restricted-syntax
            className="max-h-full min-h-0 w-auto max-w-full flex-1 object-contain select-none"
          />
        )
      ) : null}

      {dismissable ? (
        <button
          type="button"
          className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/90 backdrop-blur"
          onClick={() => setEscondido(spotlight.since)}
        >
          <EyeOff className="size-3.5" aria-hidden />
          {t.evidencia.esconder}
        </button>
      ) : null}
    </div>
  );
}

/**
 * O cartão de um item da campanha: a imagem, quando há, e o nome e a descrição.
 *
 * A única evidência com texto, e o porquê está em `Spotlight.item`: o nome e a
 * descrição de um item são o próprio item, e não anotação do mestre.
 *
 * Lado a lado quando a tela é deitada — a TV —, e um embaixo do outro em pé — o
 * celular. A letra cresce com a tela, porque a TV é lida do sofá: o mesmo
 * `text-sm` que serve ao celular seria uma linha cinza ilegível a três metros.
 *
 * Sem o zoom da imagem do `dismissable`: o cartão é para LER, e o texto ao lado
 * já diz o que a imagem mostra. Quem precisa ver o detalhe da gravura na
 * lâmina recebe a imagem sozinha se o mestre a transmitir pelo acervo.
 */
function CartaoDoItem({
  item,
  url,
}: {
  item: NonNullable<Spotlight["item"]>;
  url: string | null;
}) {
  return (
    <div className="flex max-h-full min-h-0 w-full max-w-6xl flex-1 flex-col items-center justify-center gap-6 landscape:flex-row">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={item.nome}
          draggable={false}
          // O `SpotlightLayer` e sobreposicao de tela inteira, montada fora do
          // `SceneStage`: nao ha `zoom` no caminho dele.
          // eslint-disable-next-line no-restricted-syntax
          className="max-h-[55%] min-h-0 max-w-full object-contain select-none landscape:max-h-full landscape:max-w-[55%]"
        />
      ) : (
        <Package className="size-24 shrink-0 text-white/30" aria-hidden />
      )}

      {/* Rola por dentro quando o texto é longo: cortar o fim da descrição
          seria cortar justamente o que o mestre escreveu por último -- o "mas
          cuidado com a lâmina". */}
      <div className="flex max-h-full min-h-0 w-full max-w-2xl min-w-0 flex-col gap-4 overflow-y-auto text-white">
        <h2 className="text-[clamp(1.5rem,4vw,3.5rem)] leading-tight font-semibold text-balance">
          {item.nome}
        </h2>

        {/* Os atributos em pílulas, o nome apagado e o valor claro: é o que se
            lê do sofá -- "Dano 1d8+2 cortante" --, e um quadro por atributo
            ocuparia a TV inteira com bordas. */}
        {item.atributos?.length ? (
          <dl className="flex flex-wrap gap-2">
            {item.atributos.map((atributo, indice) => (
              <div
                key={indice}
                className="flex items-baseline gap-2 rounded-full bg-white/10 px-[0.9em] py-[0.35em] text-[clamp(0.9rem,1.6vw,1.4rem)]"
              >
                <dt className="text-white/55">{atributo.nome}</dt>
                <dd className="font-medium">{atributo.valor}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {item.medidores?.length ? <MedidoresDoItem medidores={item.medidores} /> : null}

        {item.descricao ? (
          <DescricaoDoItem
            texto={item.descricao}
            className="text-[clamp(1rem,2vw,1.75rem)] leading-snug text-white/80"
          />
        ) : null}
      </div>
    </div>
  );
}
