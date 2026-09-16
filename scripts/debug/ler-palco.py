#!/usr/bin/env python3
"""Lê as amostras do modo de depuração do palco no daemon e resume.

Uso: python3 scripts/debug/ler-palco.py [URL] [--todas] [--n 20]
     URL padrão: http://127.0.0.1:20200  (porta fixa do daemon; ver serve.rs)

Ligue o modo na tela com Ctrl+Alt+D. Cada tela (mestre, espectador, jogador)
manda duas amostras por segundo. O resumo aponta:
  - desvio do plano (DOM vs esperado) -- se != 0, a GEOMETRIA nossa esta errada;
  - miras separadas -- se o DOM das duas coincide e a tela mostra separadas,
    e PINTURA do motor (WebKitGTK), nao layout;
  - stall alto -- thread principal presa (raster pesado);
  - modo/raster -- para saber em qual forma de ampliar o sintoma aparece;
  - TRANSBORDO -- um filho passa da caixa do plano. E a causa recorrente do
    "mapa pula / fica preto no zoom" do Mestre; o 'pior' nomeia o culpado.
"""
import json, sys, urllib.request

url = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:20200")
todas = "--todas" in sys.argv
n = int(sys.argv[sys.argv.index("--n") + 1]) if "--n" in sys.argv else 20

try:
    dados = json.load(urllib.request.urlopen(f"{url}/debug/palco", timeout=3))
except Exception as e:
    sys.exit(f"nao li {url}/debug/palco: {e}\n(o app esta aberto? o modo esta ligado com Ctrl+Alt+D?)")

if not dados:
    sys.exit("nenhuma amostra ainda: ligue o modo na tela com Ctrl+Alt+D e mexa na camera")

def linha(a):
    e = a["esperado"]; c = a.get("conteudo") or {}; k = a.get("controles") or {}
    dxc = (c.get("x", e["x"]) - e["x"]); dyc = (c.get("y", e["y"]) - e["y"])
    mg = a["miras"].get("magenta"); cy = a["miras"].get("cyan"); esp = a["miras"]["esperado"]
    sep = ""
    if mg and cy:
        sep = f"miras dom: magenta({mg['x']-esp['x']:+.0f},{mg['y']-esp['y']:+.0f}) cyan({cy['x']-esp['x']:+.0f},{cy['y']-esp['y']:+.0f})"
    alerta = " <-- DESVIO DE GEOMETRIA" if abs(dxc) > 1 or abs(dyc) > 1 else ""
    tb = a.get("transbordo") or {}
    fora = ""
    for nome in ("conteudo", "controles"):
        t = tb.get(nome)
        if t and (t["esquerda"] + t["cima"] + t["direita"] + t["baixo"]) > 0:
            fora += (f"  <-- TRANSBORDO {nome}: E{t['esquerda']} C{t['cima']} "
                     f"D{t['direita']} B{t['baixo']}px pior={t['pior']}")
    return (f"{a['tela']:<10} #{a['n']:<4} zoom={a['zoom']:>4}% {a['modo']:<9} raster={a['raster']:>5}px "
            f"stall={a['stall']:>3}ms  plano dx={dxc:+.1f} dy={dyc:+.1f}  {sep}{alerta}{fora}")

sel = dados if todas else dados[-n:]
print(f"{len(dados)} amostras no daemon; mostrando {len(sel)} (mais nova por ultimo)\n")
for a in sel:
    print(linha(a))
ruins = [a for a in dados if abs((a.get('conteudo') or {}).get('x', a['esperado']['x']) - a['esperado']['x']) > 1]
print(f"\namostras com desvio de geometria: {len(ruins)} de {len(dados)}")
print("Se 0 e a tela mostra o mapa fora do lugar, o problema e de PINTURA (motor), nao de layout.")
com_transbordo = [a for a in dados if any(
    (t or {}).get("esquerda", 0) + (t or {}).get("cima", 0) + (t or {}).get("direita", 0) + (t or {}).get("baixo", 0) > 0
    for t in (a.get("transbordo") or {}).values())]
print(f"amostras com filho fora do plano: {len(com_transbordo)} de {len(dados)}")
print("Se > 0, e a armadilha numero um (debug-do-palco, secao 3): o 'pior' e o culpado. Conserte ele antes de qualquer teoria.")
