#!/usr/bin/env python3
"""
Conta o peso de cada tweet do jeito que o X conta (twitter-text v3).

Por que este arquivo existe: modelo de linguagem nao conta caractere. Ele
estima, e erra justamente perto do limite, que e onde o erro custa a thread
inteira. O conserto nao e pedir mais atencao ao modelo, e sim fazer a conta.

As tres regras que fazem o peso divergir de `len(texto)`:

  - URL pesa 23, sempre. O X reescreve toda URL em t.co antes de contar, entao
    um link de 12 caracteres e um de 120 pesam igual. Encurtar link nao ganha
    espaco nenhum.
  - Emoji pesa 2. Inclusive os compostos (👨‍💻, ✌🏽, 🇧🇷), que pesam 2 no
    total e nao 2 por pedaco.
  - Acento pesa 1. "c-cedilha", "a-til" e "e-agudo" cabem como qualquer letra.
    Isso nao e obvio, e faz muita gente escrever thread sem acento a toa.

Uso:
    python3 contar.py rascunho.txt     # tweets separados por uma linha ---
    cat rascunho.txt | python3 contar.py

Saida: uma linha por tweet com o peso, e o que sobrou de espaco. Codigo de
saida 1 se algum tweet estourou, para dar pra encadear com &&.
"""

import re
import sys

LIMITE = 280
PESO_URL = 23

# Faixas de peso 1 do twitter-text v3. Todo o resto pesa 2.
FAIXAS_LEVES = (
    (0x0000, 0x10FF),  # latim, acentos, pontuacao comum
    (0x2000, 0x200D),
    (0x2010, 0x201F),
    (0x2032, 0x2037),
)

URL = re.compile(
    r"""https?://[^\s<>"']+"""
    r"""|(?<![@\w.])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+"""
    r"""(?:com|org|net|dev|app|io|br|gg|xyz|me|sh|ai|tv|co)"""
    r"""(?:\.br)?(?:/[^\s<>"']*)?""",
    re.IGNORECASE,
)

# Emoji como grupo unico: o par de bandeira e o teclado vem antes porque
# senao a faixa geral morde metade deles.
BASE = "\U0001F000-\U0001FAFF☀-➿⬀-⯿←-⇿⌀-⏿Ⓜ▪-◾"
MOD = "[\U0001F3FB-\U0001F3FF️⃣]*"
EMOJI = re.compile(
    "[0-9#*]️?⃣"
    "|[\U0001F1E6-\U0001F1FF]{2}"
    f"|[{BASE}]{MOD}(?:‍[{BASE}]{MOD})*"
)


def _leve(cp: int) -> bool:
    return any(ini <= cp <= fim for ini, fim in FAIXAS_LEVES)


def _fatiar(texto: str, padrao: re.Pattern) -> tuple[list[str], list[str]]:
    """Separa o texto no que o padrao pegou e no que sobrou."""
    achados, sobra, pos = [], [], 0
    for m in padrao.finditer(texto):
        sobra.append(texto[pos : m.start()])
        achados.append(m.group())
        pos = m.end()
    sobra.append(texto[pos:])
    return achados, "".join(sobra)


def pesar(tweet: str) -> tuple[int, list[str], list[str]]:
    """Devolve (peso, urls encontradas, emojis encontrados)."""
    urls, resto = _fatiar(tweet, URL)
    emojis, resto = _fatiar(resto, EMOJI)
    peso = len(urls) * PESO_URL + len(emojis) * 2
    peso += sum(1 if _leve(ord(ch)) else 2 for ch in resto)
    return peso, urls, emojis


def main() -> int:
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            bruto = f.read()
    else:
        bruto = sys.stdin.read()

    tweets = [t.strip("\n") for t in re.split(r"^-{3,}\s*$", bruto, flags=re.M)]
    tweets = [t for t in tweets if t.strip()]

    if not tweets:
        print("nada para contar: separe os tweets com uma linha ---")
        return 1

    estourou = False
    for i, tweet in enumerate(tweets, 1):
        peso, urls, emojis = pesar(tweet)
        if peso > LIMITE:
            estourou = True
            veredito = f"ESTOUROU em {peso - LIMITE}"
        else:
            veredito = f"sobra {LIMITE - peso}"
        print(f"tweet {i}  {peso:>3}/{LIMITE}  {veredito}")
        if urls:
            print(f"          urls contadas como {PESO_URL}: {', '.join(urls)}")
        if emojis:
            print(f"          emojis contados como 2: {' '.join(emojis)}")

    print(f"\n{len(tweets)} tweet(s).", "corrija antes de entregar." if estourou else "todos cabem.")
    return 1 if estourou else 0


if __name__ == "__main__":
    sys.exit(main())
