"use client";

import { Camera, Image as ImageIcon, Music, Radio, RadioTower, VenetianMask } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { MINIATURA } from "@/lib/miniatura";
import { parsePostit, type Token } from "@/lib/operator/postit-texto";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { cn } from "@/lib/utils";
import type { AssetMeta } from "@/types/scene";

/**
 * Quem resolve nome em coisa.
 *
 * Vem de fora, e é o que mantém este arquivo sem hook de dado: os mapas de
 * personagem, arquivo e cena são montados UMA vez na camada, não uma por
 * postit — oito postits com `@` não podem virar oito leituras da lista de
 * personagens.
 *
 * Cada função devolve `null` quando o nome não existe. Não é erro: o mestre
 * digita `@Tha` a caminho de `@Thalor`, e durante essas três teclas o nome não
 * resolve nada.
 */
/**
 * O ícone que abre cada referência: máscara para personagem, imagem ou nota
 * musical para arquivo, câmera para cena.
 *
 * Existe porque as três referências eram três cores de sublinhado, e cor não
 * diz o que a coisa É — ela diz "isto é diferente daquilo". Num papel com
 * "@Edgar levou /Edgar.png para >Porão", os três nomes podem ser o mesmo nome,
 * e o ícone é o que responde qual é qual antes de o mestre passar o mouse.
 *
 * `1em` e não um tamanho fixo: o texto do postit está em unidades de cena e
 * escala com o zoom, então o ícone tem de escalar com ele. Em pixel fixo, ele
 * viraria uma mancha do tamanho da linha a 40% e um selo a 300%.
 *
 * `translate-y` de um décimo: alinhado pela linha de base, um ícone quadrado
 * assenta alto demais em relação às letras minúsculas, porque não tem descida.
 */
const ICONE = "inline-block size-[1em] shrink-0 translate-y-[0.1em]";

export type Vinculos = {
  /**
   * Um personagem, pelo nome dele.
   *
   * `dono` é o nome de quem joga, e `presente` diz se essa pessoa está na mesa
   * agora. Os dois vêm do personagem e não são o personagem: o vínculo pode não
   * existir — PNJ, ou personagem que ainda não foi entregue a ninguém —, e aí a
   * menção continua valendo com o nome sozinho.
   */
  personagem: (nome: string) => { nome: string; dono?: string; presente: boolean } | null;
  arquivo: (nome: string) => AssetMeta | null;
  cena: (nome: string) => { id: string; name: string } | null;
  /** Abre a cena na bancada do mestre. Não põe nada no ar para a mesa. */
  irParaCena: (sceneId: string) => void;
};

/**
 * O texto de um postit, com os marcadores já pintados.
 *
 * Só de leitura: enquanto o mestre digita, quem está na tela é o `<textarea>`
 * do postit, com o texto cru e os sinais à vista. Trocar de um para o outro no
 * foco é deliberado — um editor que formata enquanto se digita esconderia
 * justamente os caracteres que o mestre precisa ver para saber se escreveu
 * `@Thalor` ou `@ Thalor`.
 */
export function PostitTextoView({
  texto,
  vinculos,
  className,
}: {
  texto: string;
  vinculos: Vinculos;
  className?: string;
}) {
  const tokens = parsePostit(texto);

  return (
    <div className={cn("break-words whitespace-pre-wrap", className)}>
      {tokens.map((token, indice) => (
        // Índice como chave: a lista é derivada do texto e inteira refeita a
        // cada tecla, então não há identidade estável para preservar — e não há
        // estado dentro de um token que uma remontagem perderia.
        <TokenView key={indice} token={token} vinculos={vinculos} />
      ))}
    </div>
  );
}

function TokenView({ token, vinculos }: { token: Token; vinculos: Vinculos }) {
  if (token.tipo === "texto") return <>{token.valor}</>;
  if (token.tipo === "quebra") return <br />;
  if (token.tipo === "bold") return <strong className="font-semibold">{token.valor}</strong>;

  if (token.tipo === "personagem") {
    const achado = vinculos.personagem(token.valor);
    if (!achado) return <NaoResolvido bruto={token.bruto} tipo="personagem" />;

    return (
      // Não é clicável de propósito: mencionar um personagem na preparação do
      // mestre não é um gesto sobre ele. Não há o que abrir — a ficha vive na
      // janela de personagens, e mandar recado para o celular de quem o joga é
      // outra feature que não existe.
      <span
        className="inline-flex items-baseline gap-[0.2em] font-medium text-sky-900 underline decoration-sky-900/40"
        // Quem joga fica no title, e não escrito ao lado: dentro do papel o que
        // importa é o personagem, e o nome da pessoa em cada menção gastaria
        // duas palavras de um espaço que tem quatro linhas.
        title={achado.dono ? `${achado.nome} — ${achado.dono}` : achado.nome}
      >
        <VenetianMask
          className={cn(
            ICONE,
            // A COR do ícone é a presença, e ela substituiu a bolinha que ficava
            // aqui antes. Dois glifos na frente de cada nome — bolinha e máscara
            // — encheriam de cromo uma linha de texto de quinze unidades; e o
            // que a bolinha dizia cabe na cor de um ícone que já tem de estar
            // ali.
            //
            // Verde é quem joga este personagem na mesa AGORA, e é a informação
            // que muda o que o mestre faz com a menção: "@Thalor sabe do
            // alçapão" não serve de nada se quem joga o Thalor não está na
            // sessão de hoje.
            //
            // Personagem sem dono — PNJ, ou ficha que ainda não foi entregue —
            // fica na cor do texto: "ausente" mentiria sobre uma pessoa que não
            // existe.
            achado.dono ? (achado.presente ? "text-emerald-700" : "text-neutral-500") : undefined,
          )}
        />
        {achado.nome}
      </span>
    );
  }

  if (token.tipo === "arquivo") {
    const asset = vinculos.arquivo(token.valor);
    if (!asset) return <NaoResolvido bruto={token.bruto} tipo="arquivo" />;

    return <ArquivoChip asset={asset} />;
  }

  const cena = vinculos.cena(token.valor);
  if (!cena) return <NaoResolvido bruto={token.bruto} tipo="cena" />;

  return (
    <button
      type="button"
      title={`Abrir a cena ${cena.name} na bancada`}
      className="inline-flex items-baseline gap-[0.2em] font-medium text-violet-900 underline decoration-violet-900/40 hover:decoration-violet-900"
      onClick={(event) => {
        // O papel está sobre o mapa e o mapa reage a clique: sem isto, abrir a
        // cena vinculada também contaria como clique no vazio do palco.
        event.stopPropagation();
        vinculos.irParaCena(cena.id);
      }}
    >
      <Camera className={ICONE} />
      {cena.name}
    </button>
  );
}

/**
 * Marcador escrito, mas sem nada com esse nome.
 *
 * Mostra o texto CRU, com o sinal e as aspas. É a diferença entre "não achei" e
 * "não entendi": vendo `>Porao` de volta na tela o mestre corrige o acento;
 * vendo só `Porao` sem o sinal, ele acharia que escreveu errado o marcador.
 *
 * Acontece toda hora e é normal — cada tecla de um nome sendo digitado passa
 * por aqui —, então não pinta de vermelho nem avisa nada. Só não promete
 * vínculo.
 */
function NaoResolvido({
  bruto,
  tipo,
}: {
  bruto: string;
  tipo: "personagem" | "arquivo" | "cena";
}) {
  const alvo = tipo === "personagem" ? "personagem" : tipo === "arquivo" ? "arquivo" : "cena";

  return (
    <span
      className="text-neutral-600/80 underline decoration-dotted"
      title={`Nenhum ${alvo} com esse nome na campanha`}
    >
      {bruto}
    </span>
  );
}

/**
 * Um `/arquivo` que existe: mostra o nome e abre a miniatura no clique.
 *
 * O clique NÃO transmite. Pôr uma imagem na frente de tudo na TV e nos
 * celulares é o gesto mais visível que o aplicativo tem, e num postit ele
 * estaria a um clique de distância do gesto vizinho — arrastar o papel. O
 * caminho é o mesmo do anexo do ponto de anotação: abre, confere qual imagem é,
 * e transmite num botão só para isso.
 *
 * Áudio resolve o nome e mostra o arquivo, mas não tem botão: som na mesa é a
 * trilha, com faixa, volume e continuidade, e não um disparo de dentro de uma
 * anotação.
 */
function ArquivoChip({ asset }: { asset: AssetMeta }) {
  const url = useAssetUrl(asset.kind === "image" ? asset.id : undefined, "mini");

  const spotlight = useSpotlightStore((state) => state.spotlight);
  const transmit = useSpotlightStore((state) => state.transmit);
  const clear = useSpotlightStore((state) => state.clear);

  const noAr = spotlight?.assetId === asset.id;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            title={asset.name}
            className={cn(
              "inline-flex items-baseline gap-[0.2em] font-medium underline decoration-dotted",
              noAr ? "text-emerald-800 decoration-emerald-800" : "text-teal-900 decoration-teal-900/40",
            )}
            onClick={(event) => event.stopPropagation()}
          >
            {/* Imagem e som têm ícones diferentes, e não um "arquivo" genérico:
                o tipo é o que decide o que dá para fazer com ele — imagem
                transmite para a mesa, som não —, e é a pergunta que o mestre
                faz ao ver a referência. O dado já está na mão em `kind`. */}
            {asset.kind === "image" ? (
              <ImageIcon className={ICONE} />
            ) : (
              <Music className={ICONE} />
            )}
            {asset.name}
          </button>
        }
      />

      {/* Fora do palco, em portal: o conteúdo do postit escala com o zoom, e
          este painel tem botão para clicar — a 40% ele seria um alvo de sete
          pixels. */}
      <PopoverContent align="start" className="w-56 space-y-2 p-2" side="top">
        {url ? (
          <span className="bg-muted block h-24 w-full overflow-hidden rounded">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              draggable={false}
              className="size-full object-cover"
              {...MINIATURA}
            />
          </span>
        ) : null}

        <p className="truncate text-xs font-medium" title={asset.name}>
          {asset.name}
        </p>

        {asset.kind === "image" ? (
          <Button
            variant={noAr ? "default" : "secondary"}
            size="sm"
            className="w-full"
            aria-pressed={noAr}
            // Clicar de novo no que já está no ar TIRA, como no anexo do ponto:
            // o botão é o mesmo alvo, e procurar onde desligar com a imagem
            // cobrindo a TV é o pior momento para procurar um botão.
            onClick={() => (noAr ? clear() : transmit(asset.id))}
          >
            {noAr ? <RadioTower /> : <Radio />}
            {noAr ? "No ar — clique para tirar" : "Transmitir para a mesa"}
          </Button>
        ) : (
          <p className="text-muted-foreground text-[10px] leading-snug">
            Som é da trilha. Este arquivo está aqui como referência.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
