#!/usr/bin/env python3
"""
Gera a arte do efeito de fabrica "Envenenado" em src/efeitos/envenenado/.

- caveira.png: o SPRITE das particulas, 4 quadros lado a lado -- uma caveirinha
  que bate o queixo, como quem ri. Ja vem VERDE, com o contorno e os olhos
  escuros: pintada na cor da condicao ela sairia verde chapado em cima do corpo
  verde, e sumiria. O contorno e o que a separa da figura.
- nevoa-{256,128}.webp: o EXTERNO, 24 quadros numa grade 4x6 -- a nevoa toxica
  que sobe dos pes, com bolhas que sobem e estouram. Em TONS DE CINZA, como o
  fogo: a cor sai da rampa da condicao (ver `rampaDaCor`), e a nevoa do veneno
  roxo sai roxa. Sem o nivel 512: nevoa e borrada, e o 256 esticado nao perde
  nada que se veja.

A nevoa fica toda ATRAS da figura, sem mapa de profundidade, por medida: a
profundidade parte o externo em duas camadas, e com 40 figuras envenenadas
isso custava 6 a 7 quadros por segundo (38 contra 45, Xvfb). O tamanho da
nevoa nao pesava -- 1,5 e 1,7 mediram igual.

O laco da nevoa fecha sem emenda pela mesma regra do fogo: o ruido e periodico
e o quadro k o le deslocado k/24 de uma volta inteira. Vinte e quatro, e nao
dezesseis como o fogo: a 8 por segundo o laco dura tres, e a nevoa sobe
devagar.

Uso: python3 scripts/efeitos/gerar-envenenado.py
"""

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / "src" / "efeitos" / "envenenado"
SEMENTE = 7

LADO = 256
QUADROS = 24
COLUNAS = 4


def ruido_periodico(n: int, beta: float, rng: np.random.Generator) -> np.ndarray:
    """Ruido 1/f^beta periodico nos dois eixos, de 0 a 1. Ver `gerar-chamas.py`."""
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.fftfreq(n)[None, :]
    f = np.sqrt(fx**2 + fy**2)
    f[0, 0] = 1.0
    espectro = (rng.normal(size=(n, n)) + 1j * rng.normal(size=(n, n))) / f**beta
    espectro[f < 2.0 / n] = 0
    campo = np.real(np.fft.ifft2(espectro))
    campo -= campo.min()
    return campo / campo.max()


def amostrar(campo: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Le o campo periodico em coordenadas fracionarias (bilinear, com volta)."""
    n = campo.shape[0]
    x = np.mod(x, n)
    y = np.mod(y, n)
    # O `mod` de um negativo minusculo da `n` exato, e nao 0.
    x0 = np.floor(x).astype(int) % n
    y0 = np.floor(y).astype(int) % n
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


# ----------------------------------------------------------------- a nevoa


def nevoa(k: int, grande: np.ndarray, fino: np.ndarray, bolhas) -> tuple[np.ndarray, np.ndarray]:
    """O cinza (a cor na rampa) e a densidade (o alfa) do quadro k."""
    t = k / QUADROS
    v, u = np.mgrid[0:LADO, 0:LADO] / LADO  # v = 0 no topo, 1 na base
    n = grande.shape[0]

    # A nevoa sobe devagar -- uma altura de quadro por laco -- e revira no
    # lugar: o fino anda num circulo, que tambem fecha o laco.
    g = amostrar(grande, u * n, (v + t) * n)
    giro = 2 * np.pi * t
    f = amostrar(fino, (u * 2 + 0.15 * np.cos(giro)) * n, (v * 2 + 2 * t + 0.15 * np.sin(giro)) * n)
    ruido = 0.6 * g + 0.4 * f

    # O POCO dos pes, largo e baixo, e os fiapos que sobem pelos lados ate o
    # alto da figura. O meio fica ralo: a figura tem de aparecer.
    poco = suave(0.6, 0.86, v) * (1 - suave(0.28, 0.5, np.abs(u - 0.5)))
    lados = (
        np.exp(-(((u - 0.15) / 0.1) ** 2)) + np.exp(-(((u - 0.85) / 0.1) ** 2))
    ) * suave(0.12, 0.9, v) ** 1.3
    forma = np.clip(poco + 0.9 * lados, 0, 1) * (1 - suave(0.92, 1.0, v))

    densidade = suave(0.1, 0.7, (ruido - 0.12) * 1.9 * forma)
    cinza = 0.16 + 0.42 * ruido  # do escuro a cor: a nevoa nao brilha

    # As bolhas: aneis que sobem do poco e estouram. Cada uma na sua fase, com
    # volta -- o laco fecha.
    for x0, fase, raio in bolhas:
        p = (fase + t) % 1.0
        if p > 0.8:  # estourou; renasce no fim do laco
            continue
        y = 0.86 - p * 0.55
        x = x0 + 0.015 * np.sin(2 * np.pi * (p * 2 + x0 * 7))
        r = raio * (0.6 + 0.6 * p)
        d = np.sqrt((u - x) ** 2 + (v - y) ** 2) * LADO
        anel = np.exp(-(((d - r) / 1.1) ** 2)) + 0.25 * (d < r)
        brilho = suave(0.0, 0.1, np.array(p)) * (1 - suave(0.65, 0.8, np.array(p)))
        densidade = np.maximum(densidade, anel * brilho * 0.95)
        cinza = np.where(anel * brilho > 0.3, np.maximum(cinza, 0.82), cinza)

    return np.clip(cinza, 0, 1), np.clip(densidade, 0, 1)


def folha_da_nevoa(rng: np.random.Generator) -> Image.Image:
    grande = ruido_periodico(256, 2.0, rng)
    fino = ruido_periodico(256, 1.6, rng)
    bolhas = [
        (rng.choice([rng.uniform(0.08, 0.2), rng.uniform(0.8, 0.92), rng.uniform(0.3, 0.7)]), rng.uniform(0, 1), rng.uniform(3.0, 5.5))
        for _ in range(6)
    ]

    linhas = QUADROS // COLUNAS
    folha = np.zeros((LADO * linhas, LADO * COLUNAS, 4), dtype=np.uint8)
    for k in range(QUADROS):
        lin, col = divmod(k, COLUNAS)
        cinza, densidade = nevoa(k, grande, fino, bolhas)
        c = (cinza * 255).astype(np.uint8)
        a = (densidade * 0.85 * 255).astype(np.uint8)
        folha[lin * LADO : (lin + 1) * LADO, col * LADO : (col + 1) * LADO] = np.dstack([c, c, c, a])

    return Image.fromarray(folha, "RGBA")


# ----------------------------------------------------------------- a caveira


def caveira(quadros: int = 4, lado: int = 96) -> Image.Image:
    """A caveirinha que ri: o queixo desce e sobe ao longo dos quadros.

    Desenhada quatro vezes maior e reduzida, para a borda sair lisa. Formas
    GROSSAS: na mesa ela aparece com uns vinte pixels.
    """
    grande = lado * 4
    abertura = [0, 0.05, 0.10, 0.05]  # o queixo, em fracao do quadro
    folha = Image.new("RGBA", (lado * quadros, lado), (0, 0, 0, 0))

    verde = (150, 240, 110, 255)
    sombra = (70, 170, 60, 255)
    escuro = (10, 40, 18, 255)

    for k in range(quadros):
        s = grande / 100  # desenho em centesimos do quadro
        queixo = abertura[k % len(abertura)] * 100

        forma = Image.new("L", (grande, grande), 0)
        f = ImageDraw.Draw(forma)
        f.ellipse([18 * s, 8 * s, 82 * s, 66 * s], fill=255)  # o cranio
        f.rounded_rectangle([28 * s, 46 * s, 72 * s, 72 * s], radius=8 * s, fill=255)  # as macas
        f.rounded_rectangle(  # a mandibula
            [32 * s, (70 + queixo) * s, 68 * s, (86 + queixo) * s], radius=7 * s, fill=255
        )

        # O contorno: a forma engordada, escura, por baixo de tudo.
        contorno = forma.filter(ImageFilter.MaxFilter(int(7 * s) | 1))

        q = Image.new("RGBA", (grande, grande), (0, 0, 0, 0))
        q.paste(escuro, mask=contorno)
        q.paste(verde, mask=forma)

        d = ImageDraw.Draw(q)
        # A sombra de baixo do cranio, para ele ter volume.
        d.chord([18 * s, 8 * s, 82 * s, 66 * s], 20, 160, fill=sombra)
        d.rounded_rectangle([28 * s, 52 * s, 72 * s, 72 * s], radius=8 * s, fill=sombra)
        d.rounded_rectangle([32 * s, (74 + queixo) * s, 68 * s, (86 + queixo) * s], radius=7 * s, fill=sombra)
        # O brilho no alto da testa.
        d.ellipse([30 * s, 14 * s, 50 * s, 26 * s], fill=(210, 255, 180, 255))

        # Os olhos, o nariz e os dentes: buracos escuros.
        d.ellipse([27 * s, 34 * s, 47 * s, 54 * s], fill=escuro)
        d.ellipse([53 * s, 34 * s, 73 * s, 54 * s], fill=escuro)
        d.polygon([(50 * s, 54 * s), (45 * s, 63 * s), (55 * s, 63 * s)], fill=escuro)
        for x in (40, 50, 60):
            d.line([(x * s, 66 * s), (x * s, 72 * s)], fill=escuro, width=int(3 * s))
            d.line([(x * s, (70 + queixo) * s), (x * s, (77 + queixo) * s)], fill=escuro, width=int(3 * s))
        # O brilho venenoso no fundo de cada olho.
        d.ellipse([34 * s, 41 * s, 40 * s, 47 * s], fill=(190, 255, 120, 255))
        d.ellipse([60 * s, 41 * s, 66 * s, 47 * s], fill=(190, 255, 120, 255))

        # Um halo verde fraco em volta: sobre o mapa escuro ela ainda brilha.
        brilho = Image.new("RGBA", (grande, grande), (120, 255, 90, 0))
        brilho.putalpha(contorno.filter(ImageFilter.GaussianBlur(5 * s)).point(lambda p: int(p * 0.45)))
        base = Image.new("RGBA", (grande, grande), (0, 0, 0, 0))
        base.alpha_composite(brilho)
        base.alpha_composite(q)

        folha.paste(base.resize((lado, lado), Image.LANCZOS), (k * lado, 0))

    return folha


def main() -> None:
    rng = np.random.default_rng(SEMENTE)
    SAIDA.mkdir(parents=True, exist_ok=True)

    caveira().save(SAIDA / "caveira.png", optimize=True)

    imagem = folha_da_nevoa(rng)
    for lado in (256, 128):
        escala = lado / LADO
        nivel = imagem.resize((round(imagem.width * escala), round(imagem.height * escala)), Image.LANCZOS)
        nivel.save(SAIDA / f"nevoa-{lado}.webp", quality=85, alpha_quality=90, method=6)

    for arquivo in sorted(SAIDA.glob("*.*")):
        if arquivo.suffix != ".json":
            print(f"{arquivo.relative_to(RAIZ)}  {arquivo.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
