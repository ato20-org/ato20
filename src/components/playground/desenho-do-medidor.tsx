"use client";

import { useEffect, type CSSProperties } from "react";

import { DesenhoSvg, useDeclarativo } from "@/components/playground/declarativo";
import type {
  ConteudoDoMedidor,
  EncaixeDoMedidor,
  TextoDoMedidor,
} from "@/lib/extensoes/manifesto";
import {
  ENCAIXE_INTEIRO,
  quadroDaSequencia,
  recorteDaBarra,
  urlDaImagemDoEstilo,
} from "@/lib/extensoes/medidor-em-camadas";
import { preencher } from "@/lib/extensoes/svg-modelo";
import {
  fracaoDoMedidor,
  legendaDoMedidor,
  pontosDoMedidor,
  textoDoMedidor,
} from "@/lib/medidor";
import type { EstiloDeMedidorPublicado } from "@/lib/sync/declarativo";
import { cn } from "@/lib/utils";
import type { Medidor } from "@/types/character";

/**
 * A altura da FORMA de um medidor, na unidade de quem chama.
 *
 * Exportada porque a caixa sobre o token é medida antes de a forma desenhar
 * (ver `InfoDoToken`), e um estilo de plugin tem a altura que declarou -- não
 * a da barra. Sem isto a caixa seria calculada para uma barra e o SVG do
 * plugin transbordaria o plano, que é a armadilha que derruba o palco.
 */
export function alturaDaForma(
  medidor: Medidor,
  largura: number,
  corpo: number,
  estilos: Record<string, EstiloDeMedidorPublicado>,
): number {
  const estilo = medidor.estiloExtensao ? estilos[medidor.estiloExtensao] : undefined;
  if (estilo) return largura * estilo.altura;

  if (medidor.estilo === "porcentagem") return corpo * 1.5 * 1.1;

  return corpo * 0.85;
}

/**
 * A altura da linha de nome e valor, na mesma unidade. Zero quando a legenda
 * não mostra nem um nem outro -- a caixa sobre o token encolhe junto, e não
 * fica um vão onde ela estaria. Ver `legendaDoMedidor`.
 */
export function alturaDoRotulo(
  medidor: Medidor,
  corpo: number,
  estilos: Record<string, EstiloDeMedidorPublicado>,
): number {
  const estilo = medidor.estiloExtensao ? estilos[medidor.estiloExtensao] : undefined;
  const { nome, valor } = legendaDoMedidor(medidor, estilo);

  return nome || valor ? corpo * 1.2 : 0;
}

/**
 * Um medidor desenhado, sem saber onde está.
 *
 * A mesma peça na ficha do mestre e na coluna ao lado do retrato, e isso não é
 * economia de linhas: "como é uma barra" é uma pergunta que precisa de UMA
 * resposta. Com dois desenhos, o mestre ajusta a vida num painel que não se
 * parece com o que a mesa vê, e a diferença só aparece na sessão.
 *
 * Nenhum número fixo: tudo sai de `largura` e `corpo`. É o que `RolagensDoRetrato`
 * já faz, e pela mesma razão — a coluna do retrato se mede em unidade de cena no
 * palco do Mestre e em pixel de tela no overlay da mesa, e uma espessura cravada
 * sumiria numa e cobriria o rosto na outra.
 *
 * Quem decide a unidade é quem chama. Aqui só se sabe que o desenho tem essa
 * largura e que o texto tem esse corpo.
 */
export function DesenhoDoMedidor({
  medidor,
  largura,
  corpo,
  sombra = false,
}: {
  medidor: Medidor;
  /** A largura do desenho, na unidade de quem chama. */
  largura: number;
  /** O tamanho do texto, na mesma unidade. A forma se mede por ele. */
  corpo: number;
  /**
   * Contorno escuro no texto e na forma.
   *
   * Ligado sobre o mapa, desligado num painel. Mapa é imagem: o claro e o
   * escuro existem os dois, e qualquer cor de fundo acerta uns e erra outros —
   * é a mesma escolha que a fileira de dados do retrato fez. Num painel a
   * sombra só sujaria um texto que já tem contraste.
   */
  sombra?: boolean;
}) {
  const { estilos } = useDeclarativo();
  const doPlugin = medidor.estiloExtensao ? estilos[medidor.estiloExtensao] : undefined;
  const legenda = legendaDoMedidor(medidor, doPlugin);

  const risco = sombra
    ? `0 ${corpo * 0.06}px ${corpo * 0.25}px rgba(0,0,0,0.95)`
    : undefined;
  // Sem relevo nas camadas: a moldura é a imagem que o autor desenhou, com o
  // contraste que ele quis, e um `drop-shadow` sobre um GIF refaria o filtro a
  // cada quadro da animação, em cada medidor da mesa.
  const relevo =
    sombra && doPlugin?.tipo !== "camadas"
      ? `drop-shadow(0 ${corpo * 0.06}px ${corpo * 0.2}px rgba(0,0,0,0.8))`
      : undefined;

  return (
    <div style={{ width: largura, filter: relevo }}>
      {/* O nome e o valor na MESMA linha, acima da forma. Empilhados, dois
          medidores ocupariam seis linhas ao lado de um rosto; lado a lado, o
          olho lê "Vida 14/20" de uma vez e desce para a barra só se quiser a
          proporção.

          A porcentagem não repete o valor aqui: nela a forma JÁ é o número, e
          escrever "70%" duas vezes na mesma peça é ruído. */}
      {!legenda.nome && !legenda.valor ? null : (
        <div
          className={cn(
            "flex items-baseline gap-1 overflow-hidden",
            // Só o valor fica onde sempre esteve, à direita: o olho que já
            // sabe onde o número mora não o procura do outro lado.
            legenda.nome ? "justify-between" : "justify-end",
          )}
          style={{ fontSize: corpo, lineHeight: 1.2 }}
        >
          {legenda.nome ? (
            <span
              className="truncate font-medium text-white/85"
              style={{ textShadow: risco }}
            >
              {medidor.nome}
            </span>
          ) : null}

          {legenda.valor ? (
            <span
              className="shrink-0 text-white/70 tabular-nums"
              style={{ textShadow: risco }}
            >
              {textoDoMedidor(medidor)}
            </span>
          ) : null}
        </div>
      )}

      <Forma
        medidor={medidor}
        doPlugin={doPlugin}
        largura={largura}
        corpo={corpo}
        risco={risco}
      />
    </div>
  );
}

/**
 * A forma de um estilo de plugin sozinha, meio cheia, para o seletor do
 * Mestre mostrar o que cada estilo desenha antes do clique.
 *
 * Recebe o estilo pronto, e não a chave: o seletor vive em painéis fora do
 * contexto do palco, e lê os estilos direto do store do Mestre.
 */
export function AmostraDoEstilo({
  estilo,
  cor,
  largura,
}: {
  estilo: EstiloDeMedidorPublicado;
  cor: string;
  largura: number;
}) {
  // Três de cinco: na barra é a fração que se lê como medidor, nos pontos
  // mostra cheio e vazio lado a lado, e na sequência cai num quadro do meio.
  const medidor: Medidor = {
    id: "amostra",
    nome: "",
    cor,
    estilo: "barra",
    atual: 3,
    maximo: 5,
    escondido: false,
  };

  return <Forma medidor={medidor} doPlugin={estilo} largura={largura} corpo={largura * 0.12} />;
}

function Forma({
  medidor,
  doPlugin,
  largura,
  corpo,
  risco,
}: {
  medidor: Medidor;
  /**
   * O estilo de um PLUGIN, quando o medidor pede um e a mesa o tem. Sem os
   * dois, cai no de fábrica -- é a reserva que faz o campo poder existir.
   */
  doPlugin?: EstiloDeMedidorPublicado;
  largura: number;
  corpo: number;
  risco?: string;
}) {
  if (doPlugin?.tipo === "camadas") {
    return <FormaEmCamadas medidor={medidor} estilo={doPlugin} largura={largura} />;
  }

  if (doPlugin) {
    const altura = largura * doPlugin.altura;
    const cheio = preencher(doPlugin.modelo, {
      fracao: fracaoDoMedidor(medidor),
      atual: Math.max(0, Math.trunc(medidor.atual)),
      maximo: Math.max(1, Math.trunc(medidor.maximo)),
      cor: medidor.cor,
      largura,
      altura,
    });

    // O `svg` de fora é NOSSO: largura e altura vêm daqui, e o `viewBox` do
    // modelo -- ou o plano da largura declarada -- diz como o desenho cabe.
    return (
      <svg
        width={largura}
        height={altura}
        viewBox={cheio.atributos.viewbox ?? `0 0 ${largura} ${altura}`}
        preserveAspectRatio={cheio.atributos.preserveaspectratio ?? "none"}
        className="block overflow-visible"
        aria-hidden
      >
        {cheio.filhos.map((filho, indice) =>
          typeof filho === "string" ? null : (
            <DesenhoSvg key={indice} no={filho} chave={`${medidor.id}.${indice}`} />
          ),
        )}
      </svg>
    );
  }

  if (medidor.estilo === "porcentagem") {
    // Sem forma nenhuma: o número É a leitura. É o estilo de quem quer moral e
    // progresso na tela sem a mesa contando quantos golpes faltam, e uma barra
    // atrás dele devolveria justamente a escala que ele existe para omitir.
    return (
      <span
        className="block font-semibold tabular-nums"
        style={{
          fontSize: corpo * 1.5,
          lineHeight: 1.1,
          color: medidor.cor,
          textShadow: risco,
        }}
      >
        {textoDoMedidor(medidor)}
      </span>
    );
  }

  if (medidor.estilo === "pontos") {
    return <Pontos medidor={medidor} largura={largura} corpo={corpo} />;
  }

  const fracao = fracaoDoMedidor(medidor);

  return (
    <div
      className="w-full overflow-hidden rounded-full bg-black/45"
      style={{ height: corpo * 0.85 }}
    >
      {/* Transição na LARGURA, e não na posição: a barra é a única coisa desta
          peça que muda no meio de uma cena, e o golpe lido como um salto
          instantâneo passa despercebido na TV do outro lado da sala. */}
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${fracao * 100}%`, background: medidor.cor }}
      />
    </div>
  );
}

/**
 * As bolinhas, sempre numa linha só.
 *
 * Elas ENCOLHEM para caber em vez de quebrarem em duas fileiras: a altura desta
 * peça entra na conta da coluna ao lado do retrato, e uma linha que às vezes
 * vale o dobro faria o medidor de baixo andar sozinho quando o de cima ganhasse
 * um ponto.
 *
 * Sem teto para o `maximo`. Vinte cargas viram vinte bolinhas minúsculas, e
 * isso é uma escolha de agora: o corte para barra acima de N só faz sentido
 * depois de ver a coluna montada na tela, e um número chutado aqui viraria um
 * limite que ninguém mediu. Ver `pontosDoMedidor`.
 */
function Pontos({
  medidor,
  largura,
  corpo,
}: {
  medidor: Medidor;
  largura: number;
  corpo: number;
}) {
  const { total, cheios } = pontosDoMedidor(medidor);

  const vao = corpo * 0.18;
  const cabe = (largura - vao * (total - 1)) / total;
  const lado = Math.max(0, Math.min(corpo * 0.85, cabe));

  return (
    <div className="flex items-center" style={{ gap: vao }}>
      {Array.from({ length: total }, (_, indice) => (
        <span
          key={indice}
          className="shrink-0 rounded-full"
          style={{
            width: lado,
            height: lado,
            // Cheio pinta; vazio fica o buraco escuro na mesma posição. Um
            // ponto vazio que sumisse faria a fileira encurtar a cada golpe, e
            // o olho perderia a referência de quantos eram no começo.
            background: indice < cheios ? medidor.cor : "rgba(0,0,0,0.45)",
          }}
        />
      ))}
    </div>
  );
}

type EstiloEmCamadas = Extract<EstiloDeMedidorPublicado, { tipo: "camadas" }>;

/**
 * Um medidor feito das imagens de um plugin: o conteúdo embaixo, a moldura
 * por cima. Ver `extensoes::Camadas` para o JSON.
 *
 * Tudo dentro de uma caixa de `largura × altura`, e nada sai dela: a altura é
 * a que o estilo declarou e a que `alturaDaForma` reservou na caixa sobre o
 * token -- a regra de transbordo que derruba o palco. O encaixe é em FRAÇÃO
 * dela, por isso a peça escala com a coluna sem conta nenhuma aqui.
 *
 * A máscara recorta a camada do conteúdo INTEIRA, e não só o encaixe: o autor
 * a desenha na mesma tela da moldura, que é o jeito natural num editor de
 * imagem -- a silhueta do coração sobre o desenho do coração.
 */
function FormaEmCamadas({
  medidor,
  estilo,
  largura,
}: {
  medidor: Medidor;
  estilo: EstiloEmCamadas;
  largura: number;
}) {
  const altura = largura * estilo.altura;
  const { moldura, mascara, conteudo } = estilo.camadas;
  const encaixe = estilo.camadas.encaixe ?? ENCAIXE_INTEIRO;
  const url = (arquivo: string) => urlDaImagemDoEstilo(estilo.plugin, arquivo, estilo.versao);

  const recorte: CSSProperties | undefined = mascara
    ? {
        WebkitMaskImage: `url("${url(mascara)}")`,
        maskImage: `url("${url(mascara)}")`,
        WebkitMaskSize: "100% 100%",
        maskSize: "100% 100%",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
      }
    : undefined;

  return (
    <div
      className="relative overflow-hidden"
      style={{ width: largura, height: altura }}
      aria-hidden
    >
      <div className="absolute inset-0" style={recorte}>
        <div
          className="absolute"
          style={{
            left: `${encaixe.x * 100}%`,
            top: `${encaixe.y * 100}%`,
            width: `${encaixe.largura * 100}%`,
            height: `${encaixe.altura * 100}%`,
          }}
        >
          <ConteudoEmCamadas
            medidor={medidor}
            conteudo={conteudo}
            url={url}
            largura={largura * encaixe.largura}
            altura={altura * encaixe.altura}
          />
        </div>
      </div>

      {moldura ? <Imagem src={url(moldura)} className="absolute inset-0" /> : null}

      {estilo.camadas.texto ? (
        <TextoEmCamadas
          medidor={medidor}
          texto={estilo.camadas.texto}
          encaixe={estilo.camadas.texto.encaixe ?? encaixe}
          altura={altura}
        />
      ) : null}
    </div>
  );
}

/**
 * O valor dentro da forma, por cima da moldura -- o `11/13` no meio da tinta.
 *
 * Contorno por `text-shadow` em quatro direções, e não `-webkit-text-stroke`:
 * o traço come o miolo da letra para dentro e afina o número justamente no
 * tamanho pequeno da coluna do retrato. As sombras saem só para fora.
 */
function TextoEmCamadas({
  medidor,
  texto,
  encaixe,
  altura,
}: {
  medidor: Medidor;
  texto: TextoDoMedidor;
  encaixe: EncaixeDoMedidor;
  /** A altura da forma inteira; o corpo é fração da altura do encaixe. */
  altura: number;
}) {
  const corpo = altura * encaixe.altura * (texto.tamanho ?? 0.7);
  const contorno = texto.contorno ?? "#0d0808";
  const d = Math.max(0.5, corpo * 0.07);

  return (
    <span
      className="absolute flex items-center justify-center font-semibold whitespace-nowrap tabular-nums"
      style={{
        left: `${encaixe.x * 100}%`,
        top: `${encaixe.y * 100}%`,
        width: `${encaixe.largura * 100}%`,
        height: `${encaixe.altura * 100}%`,
        fontSize: corpo,
        lineHeight: 1,
        color: texto.cor ?? "#ffffff",
        textShadow: `${-d}px ${-d}px 0 ${contorno}, ${d}px ${-d}px 0 ${contorno}, ${-d}px ${d}px 0 ${contorno}, ${d}px ${d}px 0 ${contorno}`,
      }}
    >
      {textoDoMedidor(medidor)}
    </span>
  );
}

function ConteudoEmCamadas({
  medidor,
  conteudo,
  url,
  largura,
  altura,
}: {
  medidor: Medidor;
  conteudo: ConteudoDoMedidor;
  url: (arquivo: string) => string;
  /** O tamanho do encaixe, para os pontos saberem quanto cabe. */
  largura: number;
  altura: number;
}) {
  const fracao = fracaoDoMedidor(medidor);

  if (conteudo.modo === "sequencia") {
    return <Sequencia quadros={conteudo.quadros.map(url)} fracao={fracao} />;
  }

  if (conteudo.modo === "pontos") {
    const { total, cheios } = pontosDoMedidor(medidor);
    // Encolhe para caber numa linha só, como os pontos de fábrica -- e pela
    // mesma razão: a altura da peça não pode mudar com o valor.
    const vao = altura * 0.15;
    const lado = Math.max(0, Math.min(altura, (largura - vao * (total - 1)) / total));
    const cheio = conteudo.cheio ? url(conteudo.cheio) : null;
    const vazio = conteudo.vazio ? url(conteudo.vazio) : null;

    return (
      <div className="flex h-full items-center justify-center" style={{ gap: vao }}>
        {Array.from({ length: total }, (_, indice) => {
          const pinta = indice < cheios;
          const tamanho = { width: lado, height: lado };

          if (pinta && cheio) return <Imagem key={indice} src={cheio} className="shrink-0" style={tamanho} />;
          if (!pinta && vazio) return <Imagem key={indice} src={vazio} className="shrink-0" style={tamanho} />;
          // Sem a imagem de vazio, a de cheio apagada: o buraco fica com a
          // forma do ponto, e a fileira não perde a referência de quantos eram.
          if (!pinta && cheio)
            return <Imagem key={indice} src={cheio} className="shrink-0 opacity-25 grayscale" style={tamanho} />;

          return (
            <span
              key={indice}
              className="shrink-0 rounded-full"
              style={{ ...tamanho, background: pinta ? medidor.cor : "rgba(0,0,0,0.45)" }}
            />
          );
        })}
      </div>
    );
  }

  const imagem = conteudo.imagem ? url(conteudo.imagem) : null;

  return (
    <>
      {/* O vazio inteiro embaixo, e o cheio o cobre: é o trecho de tinta mais
          clara que sobra à direita quando a vida desce. */}
      {conteudo.vazio ? <Imagem src={url(conteudo.vazio)} className="absolute inset-0" /> : null}
      <span
        className="absolute inset-0 transition-[clip-path] duration-300 ease-out motion-reduce:transition-none"
        style={{
          clipPath: recorteDaBarra(fracao, conteudo.direcao),
          background: imagem ? `url("${imagem}") center / 100% 100% no-repeat` : medidor.cor,
        }}
      />
    </>
  );
}

/**
 * Um quadro por vez, e os outros já baixados.
 *
 * Só o atual no DOM: um GIF escondido com `opacity: 0` continua animando, e
 * dezesseis por medidor seriam dezesseis animações por token. Os outros vão
 * para o cache do navegador antes de serem pedidos, para o golpe não mostrar
 * o encaixe vazio enquanto o quadro novo chega pela rede da TV.
 */
function Sequencia({ quadros, fracao }: { quadros: string[]; fracao: number }) {
  const chave = quadros.join("|");

  useEffect(() => {
    for (const src of quadros) {
      const imagem = new Image();
      imagem.decoding = "async";
      imagem.src = src;
    }
    // `chave` e não `quadros`: a lista é refeita a cada desenho do pai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  const src = quadros[quadroDaSequencia(fracao, quadros.length)];

  return src ? <Imagem src={src} className="absolute inset-0" /> : null;
}

function Imagem({
  src,
  className,
  style,
}: {
  src: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      draggable={false}
      decoding="async"
      className={cn("pointer-events-none block h-full w-full select-none", className)}
      style={style}
    />
  );
}
