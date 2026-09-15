#!/usr/bin/env python3
"""Acha quadros ERRADOS numa gravacao do palco: muda muito e o seguinte desfaz.

Uso: python3 scripts/debug/detectar-pulo.py video.mp4 [X Y W H]
     X Y W H = recorte do palco em pixels da tela (omitir = quadro inteiro).

Grave com scripts/debug/gravar-palco.sh (60 fps, so a regiao do palco).
Precisa de ffmpeg, numpy e Pillow.

Le a diferenca media entre quadros consecutivos (d1) e entre quadro i-1 e i+1
(liquido). Um notch da roda e uma mudanca que ASSENTA: d1 alto, liquido igual.
Um quadro errado e uma mudanca que o proximo desfaz: d1 alto duas vezes e
liquido bem menor. Imprime tambem quantos notches assentaram, para dar taxa.
"""
import glob, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image

if len(sys.argv) < 2:
    sys.exit(__doc__)
video = sys.argv[1]
crop = ""
if len(sys.argv) >= 6:
    x, y, w, h = map(int, sys.argv[2:6]); crop = f"crop={w}:{h}:{x}:{y},"
d = tempfile.mkdtemp(prefix="palco-")
# passthrough: sem duplicar quadro, para o indice bater com o do video.
subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-fps_mode", "passthrough",
                "-vf", f"{crop}scale=iw/2:ih/2", f"{d}/f%05d.png"], check=True)
imgs = [np.asarray(Image.open(f).convert("L"), dtype=np.int16) for f in sorted(glob.glob(f"{d}/f*.png"))]
N = len(imgs)
dd = lambda a, b: float(np.abs(imgs[a] - imgs[b]).mean())
d1 = [0.0] + [dd(i, i - 1) for i in range(1, N)]
assentam = sum(1 for i in range(1, N - 1) if d1[i] > 1.0 and d1[i + 1] <= 1.0)
errados = [(i, d1[i], d1[i + 1], dd(i - 1, i + 1)) for i in range(1, N - 1)
           if d1[i] > 5 and d1[i + 1] > 5 and dd(i - 1, i + 1) < 0.75 * d1[i]]
print(f"quadros={N}  mudancas que assentam (notches)={assentam}  quadros errados={len(errados)}")
for i, a, b, l in errados:
    print(f"  i={i} t={i/60:.2f}s ida={a:.1f} volta={b:.1f} liquido={l:.1f}  antes={d}/f{i:05d}.png errado={d}/f{i+1:05d}.png depois={d}/f{i+2:05d}.png")
print(f"quadros extraidos em {d}")
