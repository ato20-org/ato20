#!/usr/bin/env bash
# Constroi o Flatpak a partir da ARVORE DE TRABALHO, e nao da tag publicada.
#
# O manifesto de verdade (`io.github.ato20_org.ato20.yml`) busca o codigo por `type: git`
# numa tag -- que e o que o Flathub precisa, e o que torna impossivel testar
# aqui uma mudanca que ainda nao foi empurrada. Este script deriva um manifesto
# gemeo trocando so a fonte, e constroi com ele.
#
# As exclusoes nao sao economia: `src-tauri/target` sozinho passa de 15 GB, e o
# `flatpak-builder` COPIA a pasta inteira antes de comecar.
#
# Uso:  ./empacotar/flatpak/construir-local.sh [--executar]
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
aqui="$raiz/empacotar/flatpak"
# NAO em /tmp: dentro do sandbox do `org.flatpak.Builder` o /tmp e um tmpfs
# privado, e o `--filesystem=host` dele nao alcanca o /tmp do hospedeiro. O
# manifesto derivado ficaria invisivel para quem vai le-lo.
trabalho="${XDG_CACHE_HOME:-$HOME/.cache}/ato20-flatpak-local"

command -v flatpak >/dev/null || { echo "falta o flatpak"; exit 1; }
flatpak info org.flatpak.Builder >/dev/null 2>&1 \
  || { echo "falta: flatpak install -y flathub org.flatpak.Builder"; exit 1; }

mkdir -p "$trabalho"
cp "$aqui"/*.json "$aqui"/*.metainfo.xml "$aqui"/*.desktop "$trabalho/"

python3 - "$aqui/io.github.ato20_org.ato20.yml" "$trabalho/io.github.ato20_org.ato20.yml" "$raiz" <<'PY'
import sys, yaml

entrada, saida, raiz = sys.argv[1:4]
with open(entrada) as f:
    d = yaml.safe_load(f)

fontes = d["modules"][0]["sources"]
for i, fonte in enumerate(fontes):
    if isinstance(fonte, dict) and fonte.get("type") == "git":
        fontes[i] = {
            "type": "dir",
            "path": raiz,
            # `flatpak-builder` copia a pasta antes de construir. Sem estas
            # linhas ele copia 16 GB para so depois apagar quase tudo.
            "skip": [
                "node_modules",
                "src-tauri/target",
                ".next",
                "out",
                ".git",
            ],
        }
        break
else:
    raise SystemExit("nao achei a fonte git no manifesto")

# Trava contra um erro que ja custou dois builds de uma hora: um comando com
# `: ` dentro e sem aspas vira um MAPA no YAML, e o flatpak-builder o PULA sem
# reclamar. O build segue e falha muito depois, por um motivo que nao aponta
# para a causa.
for i, c in enumerate(d["modules"][0].get("build-commands", [])):
    if not isinstance(c, str):
        raise SystemExit(
            f"build-commands[{i}] nao e uma string: {c!r}\n"
            "Ponha o comando inteiro entre aspas no manifesto."
        )

with open(saida, "w") as f:
    yaml.safe_dump(d, f, sort_keys=False, allow_unicode=True, width=200)
print(f"manifesto local -> {saida}")
PY

# `--cwd`: `flatpak run` NAO herda o diretorio atual -- ele comeca no $HOME, e
# sem isto o builder procura o manifesto lá, e escreve `build/` e
# `.flatpak-builder/` lá também.
# `tee`: o build passa de meia hora e o `flatpak-builder` nao diz porcentagem
# nenhuma -- so a linha do passo em que esta. Sem o arquivo, quem acompanha de
# fora (ou por um pipe que faz buffer) fica sem saber se travou ou se esta
# compilando a milesima crate.
registro="$trabalho/build.log"
echo "log: $registro"
flatpak run --cwd="$trabalho" org.flatpak.Builder --force-clean --user --install \
  --install-deps-from=flathub build io.github.ato20_org.ato20.yml 2>&1 | tee "$registro"

echo
echo "Construido. Para rodar:"
echo "  flatpak run io.github.ato20_org.ato20"
echo
echo "Para passar o linter do Flathub no que saiu:"
echo "  flatpak run --command=flatpak-builder-lint org.flatpak.Builder \\"
echo "    manifest $trabalho/io.github.ato20_org.ato20.yml"
