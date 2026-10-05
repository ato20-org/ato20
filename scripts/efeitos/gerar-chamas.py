#!/usr/bin/env python3
"""
Gera a arte do efeito de fabrica "Em chamas" em public/efeitos/chamas/.

A arte e em TONS DE CINZA: o cinza e o CALOR (0 = borda fria, 1 = miolo) e o
alfa e a forma. Quem da a cor e o app, pelo mapa de cores -- a rampa sai da
cor da condicao, e o mesmo fogo vira azul ou verde. Ver `assarExterno`.

Saidas, todas WebP -- os quadros COM perda (qualidade 88): fogo e ruido, e a
versao sem perda pesava 1,6 MB no nivel maior. Profundidade e mascara sem
perda, porque sao suaves e minusculas.

- chamas-{512,256,128}.webp: 16 quadros numa grade 4x4, os mipmaps. O lado do
  QUADRO e o numero do nome; a tela escolhe o menor que cobre o tamanho em que
  o fogo aparece.
- profundidade.webp: claro = na FRENTE da figura, escuro = ATRAS. Aqui, as
  chamas dos pes passam na frente e o resto sobe por tras do corpo.
- mascara.webp: onde o fogo pode aparecer -- apaga a borda quadrada do quadro.

O laco fecha sem emenda: o ruido e periodico (sai de uma FFT) e o quadro k o
le deslocado k/16 de uma volta inteira, entao o quadro 16 e o quadro 0.

Uso: python3 scripts/efeitos/gerar-chamas.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / "public" / "efeitos" / "chamas"

LADO = 512
QUADROS = 16
COLUNAS = 4
SEMENTE = 20  # trocar a semente troca o fogo; o resto do formato fica


def ruido_periodico(n: int, beta: float, alongar: float, rng: np.random.Generator) -> np.ndarray:
    """Ruido 1/f^beta periodico nos dois eixos, de 0 a 1.

    `alongar` > 1 tira energia das frequencias VERTICAIS altas: as manchas
    ficam altas e finas, que e o desenho de uma lingua de fogo.
    """
    fy = np.fft.fftfreq(n)[:, None] * alongar
    fx = np.fft.fftfreq(n)[None, :]
    f = np.sqrt(fx**2 + fy**2)
    f[0, 0] = 1.0
    espectro = (rng.normal(size=(n, n)) + 1j * rng.normal(size=(n, n))) / f**beta
    # Sem as frequencias mais baixas: uma mancha do tamanho do quadro esfria um
    # lado inteiro, e o fogo sai torto.
    espectro[f < 3.0 / n] = 0
    campo = np.real(np.fft.ifft2(espectro))
    campo -= campo.min()
    return campo / campo.max()


def amostrar(campo: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Le o campo periodico em coordenadas fracionarias (bilinear, com volta)."""
    n = campo.shape[0]
    x = np.mod(x, n)
    y = np.mod(y, n)
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    x1 = (x0 + 1) % n
    y1 = (y0 + 1) % n
    tx = x - x0
    ty = y - y0
    a = campo[y0, x0] * (1 - tx) + campo[y0, x1] * tx
    b = campo[y1, x0] * (1 - tx) + campo[y1, x1] * tx
    return a * (1 - ty) + b * ty


def suave(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def quadro(k: int, grande: np.ndarray, fino: np.ndarray, desvio: np.ndarray, fagulhas) -> np.ndarray:
    """O calor do quadro k, de 0 a 1, LADO x LADO."""
    t = k / QUADROS
    v, u = np.mgrid[0:LADO, 0:LADO] / LADO  # v = 0 no topo, 1 na base
    n = grande.shape[0]

    # O fogo sobe: o ruido e lido descendo uma volta inteira por laco. O
    # desvio lateral balanca as linguas, e tambem fecha o laco.
    dx = (amostrar(desvio, u * n, (v + t) * n) - 0.5) * 0.10
    g = amostrar(grande, (u + dx) * n, (v * 0.8 + t) * n)
    f = amostrar(fino, (u + dx) * n * 2, (v * 1.6 + 2 * t) * n)
    ruido = 0.65 * g + 0.35 * f

    # Mais quente embaixo, frio nas bordas do quadro. As laterais sobem mais
    # alto que o meio -- passam da cabeca da figura --, e o meio fica mais
    # baixo, onde o corpo dela tem de aparecer: o fogo a envolve.
    altura = (
        0.62
        + 0.30 * np.exp(-(((u - 0.24) / 0.12) ** 2))
        + 0.30 * np.exp(-(((u - 0.76) / 0.12) ** 2))
        - 0.12 * np.exp(-(((u - 0.5) / 0.14) ** 2))
    )
    subida = np.clip((v - (1 - altura)) / altura, 0, 1) ** 0.55
    lados = 1 - np.clip(np.abs(u - 0.5) / 0.5, 0, 1) ** 4
    calor = (ruido - 0.25) * 2.2 * subida * lados + subida**3 * 0.12
    calor = suave(0.14, 1.0, calor)

    # As fagulhas: pontos que sobem e somem, cada um na sua fase. Tambem fecham
    # o laco -- a posicao e a fase mais t, com volta.
    for x0, fase, tamanho, balanco in fagulhas:
        p = (fase + t) % 1.0
        y = 0.92 - p * 0.85
        x = x0 + 0.03 * np.sin(2 * np.pi * (p * 2 + balanco))
        brilho = (1 - p) ** 1.5
        d2 = ((u - x) ** 2 + (v - y) ** 2) * LADO**2
        calor = np.maximum(calor, brilho * np.exp(-d2 / (2 * tamanho**2)))

    return np.clip(calor, 0, 1)


def para_rgba(calor: np.ndarray) -> np.ndarray:
    cinza = (calor * 255).astype(np.uint8)
    alfa = (suave(0.02, 0.32, calor) * 255).astype(np.uint8)
    return np.dstack([cinza, cinza, cinza, alfa])


def main() -> None:
    rng = np.random.default_rng(SEMENTE)
    grande = ruido_periodico(256, 1.9, 1.7, rng)
    fino = ruido_periodico(256, 1.5, 2.0, rng)
    desvio = ruido_periodico(256, 2.2, 1.0, rng)
    fagulhas = [
        (rng.uniform(0.18, 0.82), rng.uniform(0, 1), rng.uniform(2.0, 3.5), rng.uniform(0, 1))
        for _ in range(12)
    ]

    linhas = QUADROS // COLUNAS
    folha = np.zeros((LADO * linhas, LADO * COLUNAS, 4), dtype=np.uint8)
    for k in range(QUADROS):
        lin, col = divmod(k, COLUNAS)
        folha[lin * LADO : (lin + 1) * LADO, col * LADO : (col + 1) * LADO] = para_rgba(
            quadro(k, grande, fino, desvio, fagulhas)
        )

    SAIDA.mkdir(parents=True, exist_ok=True)
    imagem = Image.fromarray(folha, "RGBA")
    for lado in (512, 256, 128):
        escala = lado / LADO
        nivel = imagem.resize(
            (round(imagem.width * escala), round(imagem.height * escala)), Image.LANCZOS
        )
        nivel.save(SAIDA / f"chamas-{lado}.webp", quality=88, alpha_quality=90, method=6)

    # Profundidade e mascara: um quadro so, valem para todos. Pequenas -- sao
    # suaves, e o app as estica para o tamanho do quadro.
    v, u = np.mgrid[0:128, 0:128] / 128
    frente = suave(0.84, 0.96, v)  # so as chamas dos pes passam na frente
    Image.fromarray((frente * 255).astype(np.uint8), "L").save(SAIDA / "profundidade.webp", lossless=True)

    borda = (1 - suave(0.40, 0.50, np.abs(u - 0.5))) * (1 - suave(0.88, 1.0, v)) * suave(0.0, 0.10, v)
    Image.fromarray((borda * 255).astype(np.uint8), "L").save(SAIDA / "mascara.webp", lossless=True)

    for arquivo in sorted(SAIDA.glob("*.webp")):
        print(f"{arquivo.relative_to(RAIZ)}  {arquivo.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
