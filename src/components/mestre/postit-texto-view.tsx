"use client";

import { Camera, Image as ImageIcon, Music, VenetianMask } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { ScenePreview } from "@/components/playground/scene-preview";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { MINIATURA } from "@/lib/miniatura";
import type { Token } from "@/lib/mencoes/texto";
import { parsePostit, type TipoNoPostit } from "@/lib/mestre/postit-mencoes";
import type { ConteudoJanela } from "@/lib/store/use-window-store";
import { cn } from "@/lib/utils";
import type { AssetMeta, Scene } from "@/types/scene";

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
   *
   * `retrato` é o id no acervo do retrato ou, na falta dele, da miniatura: é o
   * que a prévia mostra ao passar o mouse.
   */
  personagem: (nome: string) => {
    id: string;
    nome: string;
    dono?: string;
    presente: boolean;
    retrato?: string;
  } | null;
  arquivo: (nome: string) => AssetMeta | null;
  /** A cena inteira, e não só nome e id: a prévia desenha o mapa dela. */
  cena: (nome: string) => Scene | null;
  /** Abre a cena na bancada do mestre. Não põe nada no ar para a mesa. */
  irParaCena: (sceneId: string) => void;
  /** Abre uma janela da bancada: a ficha do personagem, a imagem do acervo. */
  abrirJanela: (conteudo: ConteudoJanela) => void;
};

/**
 * O texto de um postit, com os marcadores já pintados.
 *
 * Só de leitura: enquanto o mestre digita, quem está na tela é o `<textarea>`
 * do postit, com o texto cru e os sinais à vista. Trocar de um para o outro no
 * foco é deliberado — um editor que formata enquanto se digita esconderia
 * justamente os caracteres que o mestre precisa ver para saber se escreveu
 * `@Thalor` ou `@ Thalor`.
 *
 * ## Clique abre, mouse em cima mostra
 *
 * Cada referência resolvida é um botão que abre a coisa referida onde ela
 * mora: a ficha do personagem e a imagem numa janela da bancada, a cena na
 * própria bancada. E cada uma tem uma prévia ao passar o mouse — o retrato, a
 * miniatura, o mapa — porque num postit com três nomes a pergunta antes de
 * clicar é "qual destes é o que eu quero?", e responder abrindo três janelas é
 * o gesto errado.
 *
 * A prévia é `Tooltip`, e não `Popover`: abre no hover, some ao sair, não tem
 * botão dentro. Sai do palco por portal, como a lista de sugestões, porque o
 * conteúdo do postit escala com o zoom e uma prévia a 40% seria um selo.
 *
 * Nenhum clique aqui TRANSMITE. Pôr uma imagem na frente de tudo na TV é o
 * gesto mais visível que o aplicativo tem, e num papel que se arrasta ele
 * estaria a um clique acidental de distância. Transmitir continua no acervo.
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

function TokenView({
  token,
  vinculos,
}: {
  token: Token<TipoNoPostit>;
  vinculos: Vinculos;
}) {
  if (token.tipo === "texto") return <>{token.valor}</>;
  if (token.tipo === "quebra") return <br />;
  if (token.tipo === "bold")
    return <strong className="font-semibold">{token.valor}</strong>;

  if (token.tipo === "personagem") {
    const achado = vinculos.personagem(token.valor);
    if (!achado) return <NaoResolvido bruto={token.bruto} tipo="personagem" />;

    return <PersonagemChip achado={achado} abrirJanela={vinculos.abrirJanela} />;
  }

  if (token.tipo === "arquivo") {
    const asset = vinculos.arquivo(token.valor);
    if (!asset) return <NaoResolvido bruto={token.bruto} tipo="arquivo" />;

    return <ArquivoChip asset={asset} abrirJanela={vinculos.abrirJanela} />;
  }

  const cena = vinculos.cena(token.valor);
  if (!cena) return <NaoResolvido bruto={token.bruto} tipo="cena" />;

  return <CenaChip cena={cena} irParaCena={vinculos.irParaCena} />;
}

/**
 * O botão que toda referência resolvida usa.
 *
 * Um só desenho para três tipos, com a cor por tipo: a forma diz "isto abre",
 * a cor diz o que. O `stopPropagation` é obrigatório: o papel está sobre o
 * mapa e o mapa reage a clique — sem ele, abrir a ficha também contaria como
 * clique no vazio do palco, e o próprio postit leria o gesto como "editar".
 */
function Referencia({
  className,
  title,
  aoClicar,
  children,
  ...resto
}: ComponentProps<"button"> & {
  className: string;
  title: string;
  /** `aoClicar` e não `onClick`: o `onClick` chega do `TooltipTrigger`. */
  aoClicar?: () => void;
  children: ReactNode;
}) {
  return (
    // `...resto` primeiro, e é obrigatório: o `TooltipTrigger` entrega por
    // `render` a `ref` e os ouvintes de mouse e foco que abrem a prévia, e um
    // botão que não os repassasse teria a prévia declarada e nunca aberta.
    <button
      {...resto}
      type="button"
      title={title}
      className={cn(
        "inline-flex items-baseline gap-[0.2em] font-medium underline decoration-dotted",
        aoClicar ? "cursor-pointer hover:decoration-solid" : "cursor-default",
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        resto.onClick?.(event);
        aoClicar?.();
      }}
    >
      {children}
    </button>
  );
}

/** A caixa da prévia: fundo escuro do tooltip, conteúdo em coluna. */
const PREVIA = "flex-col items-stretch gap-1.5 p-1.5";

function PersonagemChip({
  achado,
  abrirJanela,
}: {
  achado: NonNullable<ReturnType<Vinculos["personagem"]>>;
  abrirJanela: Vinculos["abrirJanela"];
}) {
  const url = useAssetUrl(achado.retrato, "mini");

  // Quem joga, e se está na mesa. Personagem sem dono — PNJ, ou ficha que ainda
  // não foi entregue — não ganha "ausente": mentiria sobre uma pessoa que não
  // existe.
  const legenda = achado.dono
    ? `${achado.dono} · ${achado.presente ? "na mesa" : "ausente"}`
    : "Sem jogador";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Referencia
            title={`Abrir a ficha de ${achado.nome}`}
            className="text-sky-900 decoration-sky-900/40"
            aoClicar={() =>
              abrirJanela({ tipo: "personagem", personagemId: achado.id })
            }
          >
            <VenetianMask
              className={cn(
                ICONE,
                // A COR do ícone é a presença. Verde é quem joga este personagem
                // na mesa AGORA, e é a informação que muda o que o mestre faz
                // com a menção: "@Thalor sabe do alçapão" não serve de nada se
                // quem joga o Thalor não está na sessão de hoje.
                achado.dono
                  ? achado.presente
                    ? "text-emerald-700"
                    : "text-neutral-500"
                  : undefined,
              )}
            />
            {achado.nome}
          </Referencia>
        }
      />
      <TooltipContent className={PREVIA}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            draggable={false}
            // Fora do palco, por portal: a miniatura tem 160px de qualquer
            // forma, e não passa por `caberEm`.
            // eslint-disable-next-line no-restricted-syntax
            className="size-24 rounded object-cover"
            {...MINIATURA}
          />
        ) : null}
        <p className="font-medium">{achado.nome}</p>
        <p className="opacity-70">{legenda}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Um `/arquivo` que existe: imagem abre numa janela da bancada, som só mostra.
 *
 * Som não abre nada porque não há onde: som na mesa é a trilha, com faixa,
 * volume e continuidade, e não um disparo de dentro de uma anotação. O nome
 * resolvido já diz que o arquivo existe, e é isso que a referência promete.
 */
function ArquivoChip({
  asset,
  abrirJanela,
}: {
  asset: AssetMeta;
  abrirJanela: Vinculos["abrirJanela"];
}) {
  const imagem = asset.kind === "image";
  const url = useAssetUrl(imagem ? asset.id : undefined, "mini");

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Referencia
            title={imagem ? `Abrir ${asset.name}` : asset.name}
            className="text-teal-900 decoration-teal-900/40"
            aoClicar={
              imagem
                ? () =>
                    abrirJanela({
                      tipo: "asset",
                      assetId: asset.id,
                      nome: asset.name,
                    })
                : undefined
            }
          >
            {/* Imagem e som têm ícones diferentes, e não um "arquivo" genérico:
                o tipo é o que decide o que dá para fazer com ele — imagem abre,
                som não —, e é a pergunta que o mestre faz ao ver a referência. */}
            {imagem ? (
              <ImageIcon className={ICONE} />
            ) : (
              <Music className={ICONE} />
            )}
            {asset.name}
          </Referencia>
        }
      />
      <TooltipContent className={PREVIA}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            draggable={false}
            // eslint-disable-next-line no-restricted-syntax
            className="h-24 w-40 rounded object-cover"
            {...MINIATURA}
          />
        ) : null}
        <p className="max-w-40 truncate font-medium">{asset.name}</p>
        {imagem ? null : (
          <p className="opacity-70">Som é da trilha. Aqui é referência.</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function CenaChip({
  cena,
  irParaCena,
}: {
  cena: Scene;
  irParaCena: Vinculos["irParaCena"];
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Referencia
            title={`Abrir a cena ${cena.name} na bancada`}
            className="text-violet-900 decoration-violet-900/40"
            aoClicar={() => irParaCena(cena.id)}
          >
            <Camera className={ICONE} />
            {cena.name}
          </Referencia>
        }
      />
      <TooltipContent className={PREVIA}>
        {/* O mapa da cena em miniatura, o mesmo desenho da lista de cenas. Só
            monta com a prévia aberta: é um palco inteiro, e um por referência
            em cada postit da cena seria caro à toa. */}
        <ScenePreview scene={cena} className="aspect-video w-40" />
        <p className="max-w-40 truncate font-medium">{cena.name}</p>
      </TooltipContent>
    </Tooltip>
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
  return (
    <span
      className="text-neutral-600/80 underline decoration-dotted"
      title={`Nenhum ${tipo} com esse nome na campanha`}
    >
      {bruto}
    </span>
  );
}
