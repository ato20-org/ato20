"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  DadosNoEspaco,
  type EspacoDoDado,
  type Jogada,
} from "@/components/mestre/dado-layer";
import { rolarDado } from "@/lib/player/rolagens";
import { useDadosStore } from "@/lib/store/use-dados-store";

/**
 * A largura do espaço, na unidade em que os dados vivem aqui.
 *
 * A tela não é medida em pixel para o dado, e isso não é capricho: um raio fixo
 * em pixel daria um dado gigante num celular estreito e um dado de brinquedo num
 * tablet. Com o espaço sempre com esta largura e a altura saindo da proporção
 * real do aparelho, o dado ocupa a mesma FRAÇÃO da tela em qualquer um.
 *
 * Novecentas, e o número é o que decide se a jogada PARECE uma jogada. O dado
 * tem sempre 92 unidades de ponta a ponta — `RAIO_DADO` é o mesmo nos dois
 * espaços —, então esta largura é, na prática, quantos dados cabem na tela.
 *
 * Foram 600 por um tempo, e ficou errado de um jeito que só aparece em
 * movimento: o dado ocupava 15% da mesa e o arremesso cheio o levava por menos
 * de dois dados de distância. Ele não rolava, plantava. Medido na mesa de
 * verdade, a caixa dele andava oito pixels do lançamento ao repouso.
 *
 * Com 900 o dado fica em torno de um décimo da tela e o arremesso cheio —
 * `IMPULSO_CHEIO × ATRITO`, 480 unidades — atravessa metade dela. É o mesmo
 * gesto do mestre, e o mesmo resultado na vista.
 */
const LARGURA = 900;

/**
 * Os dados sobre a TELA do jogador.
 *
 * O celular na mão é a mesa. O dado não cai dentro da moldura da cena — ele cai
 * sobre a página inteira, por cima da ficha, dos arquivos e do mapa, como um
 * dado jogado sobre a mesa cai sobre o que estiver nela.
 *
 * É a diferença entre as duas telas, e ela é do lugar e não do código: no palco
 * do mestre o dado pertence ao MAPA, e por isso vive em unidades de cena e fica
 * onde caiu mesmo que ele percorra a cena. Aqui ele pertence ao VIDRO. Ver
 * `EspacoDoDado`.
 *
 * A queda, a semente, o tato do arremesso e o desenho são os mesmos do mestre,
 * pelo mesmo componente. O que muda é o espaço, e quem sorteia.
 */
export function DadosNaTela({ codigo }: { codigo: string }) {
  const lancar = useDadosStore((state) => state.lancar);
  const guardar = useDadosStore((state) => state.guardar);

  const [janela, setJanela] = useState({ largura: 0, altura: 0 });

  // A tela do celular muda de tamanho mais do que a de um computador: girar o
  // aparelho troca as duas medidas, e a barra do navegador aparece e some na
  // rolagem. O espaço acompanha; os dados já lançados ficam onde estão, em
  // unidades que continuam valendo.
  useEffect(() => {
    const medir = () =>
      setJanela({ largura: window.innerWidth, altura: window.innerHeight });

    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("orientationchange", medir);

    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("orientationchange", medir);
    };
  }, []);

  const escala = janela.largura > 0 ? janela.largura / LARGURA : 0;

  const espaco = useMemo<EspacoDoDado>(
    () => ({
      largura: LARGURA,
      altura: escala > 0 ? janela.altura / escala : 0,
      escala,
      // A camada cobre a viewport inteira e está ancorada no canto dela, então
      // o ponto do dedo já É o ponto do espaço -- só falta a escala.
      paraEspaco: (clientX, clientY) => ({
        x: clientX / escala,
        y: clientY / escala,
      }),
    }),
    [escala, janela.altura],
  );

  /**
   * O arremesso vira jogada — pelo daemon, e não aqui.
   *
   * É o que separa este saquinho do outro. O mestre sorteia na própria máquina
   * porque o dado dele não sai dela; o jogador pede o número a quem a mesa
   * inteira confia. Ver `rolarDado`.
   *
   * A consequência é que a jogada é ASSÍNCRONA: entre soltar o dedo e o dado
   * aparecer há uma ida à rede. Na rede local são milissegundos.
   *
   * O dado que veio da mesa sai ANTES da ida: quem arremessou já viu o dado
   * deixar o lugar, e mantê-lo pousado até a resposta chegar mostraria por um
   * instante dois dados onde a mão só tinha um.
   */
  const aoArremessar = useMemo(
    () => (jogada: Jogada) => {
      if (jogada.daMesa) guardar(jogada.daMesa);

      void rolarDado(codigo, jogada.faces)
        .then((rolagem) => {
          lancar(
            jogada.faces,
            jogada.x,
            jogada.y,
            jogada.impulso,
            jogada.semente,
            rolagem.valor,
          );
        })
        // `.catch` ENCADEADO, e não o segundo argumento do `then`.
        //
        // A diferença não é estilo. Com dois argumentos, o tratador cobre só
        // a ida à rede: uma exceção DENTRO do `then` -- no lançamento -- vira
        // rejeição não tratada e some. Foi exatamente o que aconteceu quando
        // `lancar` quebrou no celular por causa do `crypto.randomUUID`: o
        // pedido tinha ido, a mesa via a rolagem, o jogador não via dado
        // nenhum, e não havia um aviso em lugar nenhum dizendo por quê.
        //
        // Encadeado, qualquer falha das duas pontas chega aqui e vira aviso.
        .catch((cause: unknown) => {
          // O dado NÃO cai quando a mesa não recebeu. Animar mesmo assim
          // mostraria um número que ninguém mais viu -- e ele seria cantado
          // em voz alta como se valesse.
          toast.error(
            cause instanceof Error
              ? cause.message
              : "A mesa não recebeu o dado",
          );
        });
    },
    [codigo, lancar, guardar],
  );

  if (escala === 0) return null;

  return (
    // `fixed` e não `absolute`: a mesa é a tela, e não o pedaço dela que rolou
    // para dentro da vista. Um dado que subisse junto com a página ao rolar a
    // ficha deixaria de ser um objeto sobre a mesa.
    //
    // `pointer-events-none` na moldura, e os alvos dos dados os reativam: fora
    // deles, o dedo continua alcançando a ficha e os arquivos embaixo.
    //
    // ACIMA do saquinho, e isto custou uma tarde. O `PopoverContent` é `z-50`
    // num portal na raiz do documento, e o painel aberto cobre metade de um
    // celular. Com a camada em `z-40` o dado era arremessado, caía atrás do
    // painel e o jogador via o dado sumir e o resultado aparecer no retrato --
    // a queda acontecia inteira, escondida. O dado é objeto sobre o vidro; a
    // interface está embaixo dele.
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <div
        className="absolute top-0 left-0"
        style={{
          width: espaco.largura,
          height: espaco.altura,
          transform: `scale(${escala})`,
          transformOrigin: "0 0",
        }}
      >
        <DadosNoEspaco espaco={espaco} aoArremessar={aoArremessar} />
      </div>
    </div>
  );
}
