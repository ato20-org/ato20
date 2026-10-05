#!/usr/bin/env python3
"""
Gera a arte do efeito de fabrica "Sangrando" em src/efeitos/sangrando/.

- feridas.png: a textura de DENTRO da figura -- tres talhos de garra, com o
  sangue escorrendo deles. Ja vem na cor do sangue, com o brilho molhado: o
  app a pinta sobre a figura so onde ha figura (`interno`), esticada nela.
- gota.png: o SPRITE das particulas, 4 quadros lado a lado, tocados UMA vez ao
  longo da vida de cada gota (sem `fps`): a conta redonda que se alonga
  enquanto cai. Ja vem vermelha, com a borda escura -- sobre a figura tingida
  de vermelho uma gota chapada sumiria.
- poca-{512,256,128}.webp: o EXTERNO, parado -- a poca aos pes da figura, com
  respingos em volta. Em TONS DE CINZA, como o fogo: a cor sai da rampa da
  condicao (ver `rampaDaCor`). Parada por medida e por regra: sem quadros ela
  e uma imagem so, e o "pulsar" do formato anima `scale`, que a 2.5D nao
  pinta direito em imagem.

Uso: python3 scripts/efeitos/gerar-sangrando.py
"""

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / "src" / "efeitos" / "sangrando"
SEMENTE = 3

ESCURO = (60, 4, 8)
SANGUE = (150, 14, 22)
VIVO = (200, 30, 36)
BRILHO = (255, 150, 150)


def suave(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ----------------------------------------------------------------- as feridas


def feridas(rng: np.random.Generator) -> Image.Image:
    """Tres talhos paralelos, curvos, e o sangue que escorre de cada um."""
    lado = 512
    grande = lado * 2
    s = grande / 512
    forma = Image.new("L", (grande, grande), 0)
    f = ImageDraw.Draw(forma)
    escorridos: list[tuple[float, float, float, float]] = []

    # Os talhos: de cima-direita para baixo-esquerda, no peito. Cada um um
    # arco fino nas pontas e grosso no meio.
    for i in range(3):
        x0, y0 = (300 + i * 34) * s, (150 + i * 22) * s
        x1, y1 = (150 + i * 34) * s, (330 + i * 22) * s
        curva = rng.uniform(18, 30) * s
        passos = 40
        for k in range(passos + 1):
            t = k / passos
            x = x0 + (x1 - x0) * t + curva * math.sin(math.pi * t)
            y = y0 + (y1 - y0) * t + curva * 0.4 * math.sin(math.pi * t)
            r = (2 + 9 * math.sin(math.pi * t) ** 0.8) * s
            f.ellipse([x - r, y - r, x + r, y + r], fill=255)
            # Do meio do talho escorre o sangue, aqui e ali.
            if 0.2 < t < 0.85 and rng.random() < 0.12:
                escorridos.append((x, y + r * 0.5, rng.uniform(40, 150) * s, rng.uniform(3, 6) * s))

    # Os escorridos: descem tremendo um pouco, afinando, e acabam numa gota.
    for x, y, comprimento, largura in escorridos:
        passos = int(comprimento / (3 * s))
        for k in range(passos):
            t = k / passos
            xx = x + math.sin(t * 6 + x) * 2 * s
            yy = y + comprimento * t
            r = largura * (1 - 0.45 * t)
            f.ellipse([xx - r, yy - r, xx + r, yy + r], fill=255)
        r = largura * 1.25
        f.ellipse([x - r, y + comprimento - r, x + r, y + comprimento + r * 1.3], fill=255)

    # Respingos soltos perto dos talhos.
    for _ in range(14):
        x, y = rng.uniform(140, 400) * s, rng.uniform(120, 380) * s
        r = rng.uniform(1.5, 4.5) * s
        f.ellipse([x - r, y - r, x + r, y + r], fill=255)

    forma = forma.filter(ImageFilter.GaussianBlur(0.8 * s))
    a = np.asarray(forma, dtype=np.float32) / 255
    # O miolo mais escuro (o fundo do corte), a borda viva, e um brilho fino
    # no alto de cada forma: o sangue esta molhado.
    miolo = np.asarray(forma.filter(ImageFilter.MinFilter(int(5 * s) | 1)), dtype=np.float32) / 255
    deslocado = np.roll(np.roll(a, int(3 * s), axis=0), int(2 * s), axis=1)
    brilho = np.clip(a - deslocado, 0, 1) * 0.8

    rgb = np.zeros(a.shape + (3,), dtype=np.float32)
    rgb[:] = VIVO
    rgb = rgb * (1 - miolo[..., None]) + np.array(ESCURO, dtype=np.float32) * miolo[..., None] * 0.7 + rgb * miolo[..., None] * 0.3
    rgb = rgb * (1 - brilho[..., None]) + np.array(BRILHO, dtype=np.float32) * brilho[..., None]

    rgba = np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA").resize((lado, lado), Image.LANCZOS)


# ----------------------------------------------------------------- a gota


def gota(quadros: int = 4, lado: int = 96) -> Image.Image:
    """A conta que cai: redonda no primeiro quadro, alongada no ultimo."""
    grande = lado * 4
    s = grande / 100
    folha = Image.new("RGBA", (lado * quadros, lado), (0, 0, 0, 0))

    for k in range(quadros):
        alonga = k / (quadros - 1)  # 0 = conta, 1 = gota em queda
        forma = Image.new("L", (grande, grande), 0)
        f = ImageDraw.Draw(forma)
        r = (26 - 4 * alonga) * s
        cy = (58 + 6 * alonga) * s
        f.ellipse([50 * s - r, cy - r, 50 * s + r, cy + r], fill=255)
        # A ponta de cima, que cresce: e ela que faz a conta virar gota.
        ponta = (cy - r * (1.1 + 1.3 * alonga))
        f.polygon([(50 * s - r * 0.82, cy - r * 0.55), (50 * s, ponta), (50 * s + r * 0.82, cy - r * 0.55)], fill=255)
        forma = forma.filter(ImageFilter.GaussianBlur(0.6 * s))

        contorno = forma.filter(ImageFilter.MaxFilter(int(5 * s) | 1))
        q = Image.new("RGBA", (grande, grande), (0, 0, 0, 0))
        q.paste(ESCURO + (255,), mask=contorno)
        q.paste(SANGUE + (255,), mask=forma)
        d = ImageDraw.Draw(q)
        # A sombra de baixo e o brilho do alto: a gota e redonda e molhada.
        d.chord([50 * s - r * 0.9, cy - r * 0.9, 50 * s + r * 0.9, cy + r * 0.9], 20, 160, fill=(105, 8, 14, 255))
        d.ellipse([40 * s - r * 0.2, cy - r * 0.55, 40 * s + r * 0.15, cy - r * 0.05], fill=BRILHO + (255,))

        folha.paste(q.resize((lado, lado), Image.LANCZOS), (k * lado, 0))

    return folha


# ----------------------------------------------------------------- a poca


def poca(rng: np.random.Generator) -> Image.Image:
    """A poca aos pes: o cinza e a cor na rampa, o alfa a forma."""
    lado = 512
    v, u = np.mgrid[0:lado, 0:lado] / lado  # v = 0 no topo, 1 na base

    # Uma elipse larga e baixa, de borda torta: o raio varia com o angulo por
    # uma soma de senos sorteados.
    cx, cy = 0.5, 0.86
    dx, dy = (u - cx) / 0.42, (v - cy) / 0.1
    angulo = np.arctan2(dy, dx)
    raio = 1 + sum(
        rng.uniform(0.03, 0.09) * np.sin(n * angulo + rng.uniform(0, 2 * np.pi)) for n in (3, 5, 7, 11)
    )
    dist = np.sqrt(dx**2 + dy**2) / raio
    forma = 1 - suave(0.92, 1.0, dist)

    # Os respingos: gotas em volta, mais perto da poca, algumas alongadas na
    # direcao em que voaram.
    respingos = 0
    while respingos < 26:
        a = rng.uniform(0, 2 * np.pi)
        d = rng.uniform(1.1, 1.9)
        x = cx + np.cos(a) * 0.42 * d
        y = cy + np.sin(a) * 0.1 * d * 1.6
        r = rng.uniform(0.006, 0.018) * (2.0 - d * 0.6)
        # Dentro do quadro, com folga: o respingo cortado na borda vira uma
        # reta no mapa.
        if not (0.05 < x < 0.95 and 0.05 < y < 0.95):
            continue
        respingos += 1
        esticada = ((u - x) * np.cos(a) + (v - y) * np.sin(a)) ** 2 / 2.2 + (
            -(u - x) * np.sin(a) + (v - y) * np.cos(a)
        ) ** 2
        forma = np.maximum(forma, 1 - suave(0.7, 1.0, np.sqrt(esticada) / r))

    forma *= 1 - suave(0.97, 1.0, v)

    # O cinza: escuro no fundo da poca, mais vivo na borda, e um reflexo
    # claro deitado no alto -- e o reflexo que diz "liquido".
    cinza = 0.2 + 0.18 * suave(0.5, 1.0, dist)
    reflexo = np.exp(-(((u - 0.42) / 0.12) ** 2) - (((v - 0.83) / 0.012) ** 2))
    cinza = np.clip(cinza + reflexo * 0.45, 0, 1)

    c = (cinza * 255).astype(np.uint8)
    a = (np.clip(forma, 0, 1) * 0.92 * 255).astype(np.uint8)
    return Image.fromarray(np.dstack([c, c, c, a]), "RGBA")


def main() -> None:
    rng = np.random.default_rng(SEMENTE)
    SAIDA.mkdir(parents=True, exist_ok=True)

    feridas(rng).save(SAIDA / "feridas.png", optimize=True)
    gota().save(SAIDA / "gota.png", optimize=True)

    imagem = poca(rng)
    for lado in (512, 256, 128):
        nivel = imagem if lado == 512 else imagem.resize((lado, lado), Image.LANCZOS)
        nivel.save(SAIDA / f"poca-{lado}.webp", quality=90, alpha_quality=95, method=6)

    for arquivo in sorted(SAIDA.glob("*.*")):
        if arquivo.suffix != ".json":
            print(f"{arquivo.relative_to(RAIZ)}  {arquivo.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
