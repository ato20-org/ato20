#!/usr/bin/env bash
# Regera as listas de dependencia que o build do Flatpak consome.
#
# POR QUE isto existe: a sandbox de build do Flathub nao tem rede. Nem o cargo
# nem o pnpm podem buscar nada la, entao cada dependencia entra no manifesto
# como uma URL com hash, resolvida AQUI, com rede, antes de submeter.
#
# QUANDO rodar: sempre que `pnpm-lock.yaml` ou `src-tauri/Cargo.lock` mudar.
# Esquecer nao quebra nenhum outro build -- so o da loja, e so quando alguem
# tentar publicar. Por isso vale rodar junto com a release.
#
# Uso:  ./empacotar/flatpak/gerar-fontes.sh
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
aqui="$raiz/empacotar/flatpak"
tmp="${TMPDIR:-/tmp}/ato20-flatpak-fontes"

cd "$raiz"

if [[ ! -d "$tmp/flatpak-builder-tools" ]]; then
  mkdir -p "$tmp"
  git clone --depth 1 https://github.com/flatpak/flatpak-builder-tools.git \
    "$tmp/flatpak-builder-tools"
fi

# Um venv proprio: os geradores pedem aiohttp, pyyaml e tomlkit, e nenhum deles
# tem por que entrar no Python do sistema por causa disto.
if [[ ! -d "$tmp/venv" ]]; then
  python3 -m venv "$tmp/venv"
  "$tmp/venv/bin/pip" install -q aiohttp pyyaml tomlkit
fi

echo "==> Rust (Cargo.lock -> cargo-sources.json)"
"$tmp/venv/bin/python" \
  "$tmp/flatpak-builder-tools/cargo/flatpak-cargo-generator.py" \
  src-tauri/Cargo.lock -o "$aqui/cargo-sources.json"

# SEM `--no-devel`: `next build` precisa de typescript, tailwind e eslint, que
# sao devDependencies. Gerar so as de producao produz um build que falha pedindo
# um modulo que ninguem lembra ser de desenvolvimento.
echo "==> Node (pnpm-lock.yaml -> node-sources.json)"
#
# `--pnpm-store-version v11` NAO e detalhe: o padrao do gerador para lockfile v9
# e `v10`, e o pnpm 11 usa `v11`. Com a versao errada o pnpm abre um store
# VAZIO, ignora o `--offline` e tenta baixar os 765 pacotes da rede -- que no
# sandbox nao existe. O build entao fica uma hora em `EAI_AGAIN` antes de morrer.
# Conferir contra o `packageManager` do package.json ao subir de pnpm.
PYTHONPATH="$tmp/flatpak-builder-tools/node" "$tmp/venv/bin/python" \
  -m flatpak_node_generator --pnpm-store-version v11 \
  -o "$aqui/node-sources.json" pnpm pnpm-lock.yaml

echo
echo "Pronto. Confira tambem, no manifesto:"
echo "  - a versao do pnpm em 'pnpm.tgz' contra o 'packageManager' do package.json"
echo "  - a tag e o commit da source git, contra a release que se quer publicar"
