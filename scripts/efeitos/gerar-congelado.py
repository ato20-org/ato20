#!/usr/bin/env python3
"""
Gera a arte do efeito de fabrica "Congelado" em src/efeitos/congelado/.

- rachaduras.png: a textura de DENTRO da figura -- fissuras de gelo, claras
  com a borda escura, transparente no resto. O app a pinta sobre a figura so
  onde ha figura (`interno`), esticada nela inteira.
- cristal.png: o SPRITE das particulas, 4 quadros lado a lado -- um estilhaco
  de gelo com o brilho correndo por ele. Ja vem na cor do gelo: o cristal nao
  e pintado na cor da condicao, quem fica azul e a figura.

Uso: python3 scripts/efeitos/gerar-congelado.py
"""

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / "src" / "efeitos" / "congelado"
SEMENTE = 11


def rachaduras(rng: np.random.Generator) -> Image.Image:
    """Fissuras que nascem de alguns pontos e se ramificam, como gelo trincado."""
    lado = 512
    linhas = Image.new("L", (lado, lado), 0)
    d = ImageDraw.Draw(linhas)

    def fissura(x: float, y: float, angulo: float, comprimento: float, largura: float, nivel: int) -> None:
        passos = int(comprimento / 6)
        for _ in range(passos):
            angulo += rng.normal(0, 0.35)
            nx = x + math.cos(angulo) * 6
            ny = y + math.sin(angulo) * 6
            d.line([(x, y), (nx, ny)], fill=255, width=max(1, int(round(largura))))
            x, y = nx, ny
            largura *= 0.985
            if nivel < 3 and rng.random() < 0.07:
                fissura(x, y, angulo + rng.choice([-1, 1]) * rng.uniform(0.5, 1.1), comprimento * 0.5, largura * 0.7, nivel + 1)

    for _ in range(7):
        x, y = rng.uniform(80, 432), rng.uniform(80, 432)
        for _ in range(3):
            fissura(x, y, rng.uniform(0, 2 * math.pi), rng.uniform(120, 260), rng.uniform(3, 5), 0)

    nucleo = np.asarray(linhas, dtype=np.float32) / 255
    borda = np.asarray(linhas.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.6)), dtype=np.float32) / 255

    # O miolo da fissura claro (gelo que reflete), a borda escura (a sombra
    # da trinca). O resto, transparente.
    rgba = np.zeros((lado, lado, 4), dtype=np.float32)
    claro = np.array([235, 248, 255], dtype=np.float32)
    escuro = np.array([20, 40, 70], dtype=np.float32)
    mistura = np.clip(nucleo * 1.2, 0, 1)[..., None]
    rgba[..., :3] = escuro * (1 - mistura) + claro * mistura
    rgba[..., 3] = np.clip(np.maximum(nucleo, borda * 0.75), 0, 1) * 255
    return Image.fromarray(rgba.astype(np.uint8), "RGBA")


def cristal(quadros: int = 4, lado: int = 96) -> Image.Image:
    """Um estilhaco de gelo alongado, com o brilho correndo de ponta a ponta."""
    folha = Image.new("RGBA", (lado * quadros, lado), (0, 0, 0, 0))
    v, u = np.mgrid[0:lado, 0:lado] / lado

    for k in range(quadros):
        q = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
        d = ImageDraw.Draw(q)
        c = lado / 2
        # Um losango alongado com uma lasca ao lado: estilhaco, nao floco.
        corpo = [(c, lado * 0.06), (c + lado * 0.17, c), (c, lado * 0.94), (c - lado * 0.17, c)]
        lasca = [(c + lado * 0.05, c - lado * 0.05), (c + lado * 0.32, c - lado * 0.22), (c + lado * 0.14, c + lado * 0.12)]
        d.polygon(corpo, fill=(170, 220, 255, 230))
        d.polygon(lasca, fill=(140, 200, 245, 210))
        d.line([corpo[0], corpo[2]], fill=(240, 252, 255, 255), width=2)

        # O brilho: uma faixa clara que desce ao longo do cristal, um quadro
        # por vez -- e o laco volta ao comeco.
        a = np.asarray(q, dtype=np.float32)
        faixa = np.exp(-(((v - (0.15 + 0.7 * k / quadros)) / 0.08) ** 2))
        a[..., :3] = np.clip(a[..., :3] + (faixa[..., None] * 120) * (a[..., 3:4] > 0), 0, 255)
        q = Image.fromarray(a.astype(np.uint8), "RGBA").filter(ImageFilter.SMOOTH)

        brilho = q.filter(ImageFilter.GaussianBlur(4))
        base = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
        base.alpha_composite(Image.eval(brilho, lambda p: int(p * 0.55)))
        base.alpha_composite(q)
        folha.paste(base, (k * lado, 0))

    return folha


def main() -> None:
    rng = np.random.default_rng(SEMENTE)
    SAIDA.mkdir(parents=True, exist_ok=True)
    rachaduras(rng).save(SAIDA / "rachaduras.png", optimize=True)
    cristal().save(SAIDA / "cristal.png", optimize=True)
    for arquivo in sorted(SAIDA.glob("*.png")):
        print(f"{arquivo.relative_to(RAIZ)}  {arquivo.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
