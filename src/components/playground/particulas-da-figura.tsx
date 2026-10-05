"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { QuadrosAnimados } from "@/components/playground/quadros-animados";
import { faseDaFigura } from "@/lib/condicao";
import type { CaixaNoPlano } from "@/lib/efeitos";
import { assarParticulas, type PedidoDeParticulasAssadas } from "@/lib/externo-assado";
import { sementeDaLuz } from "@/lib/geometry/luz";
import {
  extensaoNoPlano,
  planoDaFolha,
  trajetorias,
  varianteDaFigura,
  type ParticulasResolvidas,
} from "@/lib/particulas";

/**
 * As partículas de uma figura: a fagulha que sobe do fogo.
 *
 * ASSADAS numa folha de quadros, como o fogo (ver `particulas.ts`, que tem a
 * medida): o forno desenha o voo uma vez por configuração, cor e variante, e
 * aqui a folha só toca -- um recorte e os mesmos dois invólucros do externo,
 * seja uma fagulha ou vinte e quatro.
 *
 * Cada figura pega uma das variantes pela semente, com a fase dela e, uma sim
 * outra não, espelhada quando o voo é vertical: a horda não solta as mesmas
 * fagulhas juntas.
 *
 * Por cima da figura, depois do externo da frente: a fagulha voa na frente de
 * tudo o que a figura é.
 */
export function ParticulasDaFigura({
  particulas,
  semente,
  alcance,
}: {
  particulas: ParticulasResolvidas;
  semente: string;
  /** A caixa no plano, para não passar dele; `livre` é a peça de pé do 2.5D. */
  alcance: CaixaNoPlano | { livre: true; largura: number };
}) {
  const variante = varianteDaFigura(semente);
  const pedido = useMemo<PedidoDeParticulasAssadas>(() => {
    const caminhos = trajetorias(`particulas-${variante}`, particulas, particulas.quantidade);
    return {
      folha: planoDaFolha(caminhos, particulas.vida),
      caminhos,
      cor: particulas.cor,
      pintar: particulas.pintar,
      ...(particulas.quadros ? { quadros: particulas.quadros } : {}),
      ...(particulas.imagem ? { imagem: particulas.imagem } : {}),
    };
  }, [particulas, variante]);
  const fonte = useFolhaDeParticulas(pedido);

  if (!fonte) return null;

  const { folha } = pedido;
  const { regiao } = folha;

  // Quanto da folha passa da figura, de cada lado -- e quanto disso cabe no
  // plano. Perto da borda do mapa a revoada encolhe para dentro dele, pela
  // regra do externo (`tamanhoNoPlano`).
  const extensao = {
    esquerda: Math.max(0, -regiao.x),
    direita: Math.max(0, regiao.x + regiao.largura - 1),
    cima: Math.max(0, -regiao.y),
    baixo: Math.max(0, regiao.y + regiao.altura - 1),
  };
  const fator = "livre" in alcance ? 1 : extensaoNoPlano(alcance, extensao);
  if (fator <= 0) return null;

  const esquerda = -extensao.esquerda * fator;
  const cima = -extensao.cima * fator;
  const largura = 1 + (extensao.esquerda + extensao.direita) * fator;
  const altura = 1 + (extensao.cima + extensao.baixo) * fator;
  // Espelhar só o voo simétrico -- o que sobe ou desce: o vento que sopra
  // para a direita sopraria para a esquerda em metade da horda.
  const direcao = ((particulas.direcao % 360) + 360) % 360;
  const vertical = Math.abs(direcao - 270) < 1 || Math.abs(direcao - 90) < 1;
  const espelhada = vertical && (sementeDaLuz(semente) >>> 3) % 2 === 1;

  const caixa: CSSProperties = {
    left: `${esquerda * 100}%`,
    top: `${cima * 100}%`,
    width: `${largura * 100}%`,
    height: `${altura * 100}%`,
    transform: espelhada ? "scaleX(-1)" : undefined,
  };

  return (
    <div aria-hidden className="pointer-events-none absolute overflow-hidden select-none" style={caixa}>
      <QuadrosAnimados
        fonte={fonte}
        colunas={folha.colunas}
        linhas={folha.linhas}
        fps={folha.fps}
        fase={faseDaFigura(semente, folha.total / folha.fps)}
      />
    </div>
  );
}

/** A folha assada, e a anterior enquanto a nova não sai. Ver `useExternoAssado`. */
function useFolhaDeParticulas(pedido: PedidoDeParticulasAssadas): string | null {
  const chave = JSON.stringify(pedido);
  const [pronta, setPronta] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void assarParticulas(pedido).then((url) => {
      if (ativo && url) setPronta(url);
    });

    return () => {
      ativo = false;
    };
    // A chave diz tudo o que o forno recebe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return pronta;
}
