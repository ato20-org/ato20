#!/usr/bin/env bash
# Grava SO a regiao do palco a 60 fps, sem derrubar quadro.
#
# Uso: scripts/debug/gravar-palco.sh X Y W H [saida.mp4]
#   X Y W H em pixels da tela (X11). Ache-os com um print: o palco e a area
#   preta com o mapa, sem a barra de zoom embaixo.
# Pare com `q` no terminal. Depois: python3 scripts/debug/detectar-pulo.py saida.mp4
#
# Gravar a tela inteira derruba quadros (medido: 2820x1600 a 60 fps caiu para
# ~35 fps efetivos), e um quadro errado dura UM quadro -- some na queda.
set -euo pipefail
X=${1:?X}; Y=${2:?Y}; W=${3:?W}; H=${4:?H}; OUT=${5:-$HOME/palco.mp4}
exec ffmpeg -f x11grab -framerate 60 -video_size "${W}x${H}" -i "${DISPLAY:-:0.0}+${X},${Y}" \
  -c:v libx264 -preset ultrafast -crf 18 -pix_fmt yuv420p "$OUT"
