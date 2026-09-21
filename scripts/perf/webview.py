#!/usr/bin/env python3
"""
Corre a matriz de `/perf` DENTRO DE UMA WEBVIEW, e imprime a tabela.

O `medir.mjs` dirige o Chrome. Esta bancada dirige `libwebkit2gtk-4.1.so.0` --
o mesmo arquivo `.so`, na mesma versão, que o binário do Tauri carrega (confira
com `ldd src-tauri/target/debug/ato20 | grep webkit`). É a diferença entre medir
um motor que tem margem de sobra e medir o motor em que o mestre está sentado.

## Por que ela existe, e não basta o Chrome

O Chrome dá 60 fps no palco do mestre com oito câmeras na tela e a coluna
`estilo` quase dobrando. As duas coisas são verdade ao mesmo tempo: o TRABALHO
cresce e a CADÊNCIA não cai, porque sobra máquina. Na webview não sobra -- e a
mesma tabela que no Chrome diz "está tudo bem" é a tela que o mestre descreve
como pesada. Medir a cadência onde ela não cai é medir a folga, não o palco.

## O que ela mede

O mesmo `window.__resultado` que a página já escreve, pelos mesmos cenários e
com os mesmos parâmetros -- a página não sabe quem a está abrindo, e é isso que
torna as duas tabelas comparáveis coluna a coluna. O que muda é quem conta os
quadros: aqui é o `requestAnimationFrame` da WebKit, sujeito ao vsync de
verdade, numa janela de verdade, composta pelo mesmo compositor que compõe o
aplicativo.

O que ela NÃO tem: `script`, `estilo` e `layout`. Essas três vêm do
`Performance.getMetrics` do protocolo do Chrome, e a WebKit não expõe
equivalente. A pergunta "onde o tempo foi" continua sendo do `medir.mjs`; a
pergunta "o mestre sente?" é desta.

Uso:
  # ela mesma sobe o servidor (chama `medir.mjs --servir`) e compila se preciso
  python3 scripts/perf/webview.py --cenario bancada --cameras 1,3,5,7

  python3 scripts/perf/webview.py --pular-build           # reaproveita o out/
  python3 scripts/perf/webview.py --imagens ~/medidas     # bg.*, bg2.*, char.*
  python3 scripts/perf/webview.py --capturas /tmp/tiros   # um PNG por célula
  python3 scripts/perf/webview.py --console               # o console da página

## Medir o `pnpm tauri dev`, que é outro programa

O build de produção não é o que se está usando enquanto se desenvolve: em modo
de desenvolvimento o React não é minificado, monta cada componente duas vezes e
carrega o cliente de recarga. Medido nesta bancada, a mesma célula deu 30 fps
no `out/` e 10,8 fps no `next dev` -- três vezes, e é a diferença entre "pesado"
e "a moldura se teletransporta".

Para medir o dev, aponte a bancada para ele e ponha as imagens em `public/`,
que é de onde o `next dev` serve a raiz -- ele não tem o `/asset/*` desta
bancada nem o daemon:

  mkdir -p public/asset
  cp ~/medidas/bg.jpg   public/asset/perf-fundo
  cp ~/medidas/char.jpg public/asset/perf-token-0
  for i in 0 1 2 3 4 5; do cp ~/medidas/bg2.webp public/asset/perf-fundo-$i; done
  python3 scripts/perf/webview.py --url http://localhost:3000 --cenario bancada
  rm -rf public/asset   # não deixe material de ninguém no repositório

Houve um `--dev` que fazia proxy do `next dev` por dentro desta bancada, para
poupar essa receita. Saiu: o cliente de recarga fala por WebSocket, o túnel não
completava o aperto de mão, e a página ficava em laço de reconexão sem chegar a
hidratar -- tela preta, nenhum erro no console, e a medida saía "sem resultado".
Quatro linhas de `cp` resolvem o mesmo sem um proxy para manter.

Precisa de PyGObject com GTK 3 e WebKit2 4.1 -- em Arch, `python-gobject` e
`webkit2gtk-4.1`, que o próprio Tauri já exige.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib, Gtk, WebKit2  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def argumentos():
    p = argparse.ArgumentParser(add_help=True)
    p.add_argument("--cenario", default="mestre-camera")
    p.add_argument("--n", default="60")
    p.add_argument("--cameras", default="1")
    p.add_argument("--segundos", type=float, default=8.0)
    p.add_argument("--movidos", default="1")
    p.add_argument("--zoom", default="1")
    # `camera-gesto`: lista, porque a pergunta e QUAL dos gestos pesa.
    p.add_argument("--gesto", default="mover")
    # `bancada`: quantas cenas o board tem, e portanto quantas prévias a lista
    # da esquerda desenha. Sete é o que a captura do mestre mostrava.
    p.add_argument("--mapas", default="7")
    # `--sem-no-ar`: a câmera que o robô pega NÃO está transmitindo. É o que
    # separa "o gesto grava no board" de "o gesto fica no `useGestoStore`".
    p.add_argument("--sem-no-ar", action="store_true")
    # Que colunas laterais ficam à vista: ambos, esquerdo, direito, nenhum.
    # Lista, porque a pergunta é quanto cada uma custa no mesmo gesto.
    p.add_argument("--painel", default="ambos")
    # Repassado ao `medir.mjs`: a pasta com bg.*, bg2.* e char.* de verdade.
    p.add_argument("--imagens", default=None)

    # O console da página, pelo mesmo motivo do `--console` do `medir.mjs`: uma
    # exceção engolida pelo React mede um palco vazio, e a tabela não contaria
    # nada. Sem a flag ele fica quieto, porque o dev fala muito.
    p.add_argument("--console", action="store_true")
    # Liga a contagem de `o que muda por quadro`. Custa, e o custo cai dentro
    # da medida: use para achar onde mexer, não para tirar o número final.
    p.add_argument("--sonda", action="store_true")
    p.add_argument("--repetir", type=int, default=1)
    p.add_argument("--url", default=None, help="servidor já de pé")
    p.add_argument("--pular-build", action="store_true")
    # A janela do `tauri.conf.json`. Medir noutro tamanho mede outra área de
    # raster, e é justamente a área que a webview cobra.
    p.add_argument("--largura", type=int, default=1440)
    p.add_argument("--altura", type=int, default=900)
    p.add_argument("--capturas", default=None)
    p.add_argument("--rotulo", default="webview")
    return p.parse_args()


def subir_servidor(
    pular_build: bool, imagens: str | None
) -> tuple[subprocess.Popen, str]:
    """Sobe o `medir.mjs --servir` e espera ele dizer a porta."""
    cmd = ["node", os.path.join(RAIZ, "scripts", "perf", "medir.mjs"), "--servir"]
    if pular_build:
        cmd.append("--pular-build")
    if imagens:
        cmd += ["--imagens", imagens]

    proc = subprocess.Popen(
        cmd, cwd=RAIZ, stdout=subprocess.PIPE, stderr=None, text=True
    )

    # O build do Next pode demorar; a linha que interessa é a única que é uma URL.
    for linha in proc.stdout:
        achado = re.search(r"http://127\.0\.0\.1:\d+", linha)
        if achado:
            return proc, achado.group(0)
        print(linha.rstrip(), file=sys.stderr)

    raise SystemExit("o servidor da medida nao subiu")


class Bancada:
    """
    Uma janela, uma webview, e uma fila de URLs para medir em sequência.

    Uma só janela para a matriz inteira, e não uma por célula: criar e destruir
    webview custa, e o custo cairia dentro da primeira medida de cada célula.
    Entre células a página é recarregada, que é o que o `medir.mjs` também faz.
    """

    def __init__(self, args, urls):
        self.args = args
        self.urls = list(urls)
        self.linhas = []
        self.atual = None
        self.esperando_ate = 0.0

        self.janela = Gtk.Window()
        self.janela.set_default_size(args.largura, args.altura)
        self.janela.set_title("ATO20 — medida na webview")
        self.janela.connect("destroy", Gtk.main_quit)

        ajustes = WebKit2.Settings()
        # O mesmo que o Tauri liga: sem aceleração o raster vai para a CPU e a
        # medida diria respeito a uma webview que ninguém usa.
        ajustes.set_hardware_acceleration_policy(
            WebKit2.HardwareAccelerationPolicy.ALWAYS
        )
        ajustes.set_enable_developer_extras(True)
        ajustes.set_enable_write_console_messages_to_stdout(bool(args.console))

        self.web = WebKit2.WebView()
        self.web.set_settings(ajustes)
        self.janela.add(self.web)
        self.janela.show_all()

        # O console da página, pelo mesmo motivo do `--console` do `medir.mjs`:
        # uma exceção engolida pelo React mede um palco vazio, e a tabela não
        # contaria nada. Aqui ela aparece em vez de sumir.
        inspetor = self.web.get_inspector()
        if inspetor:
            inspetor.connect(
                "bring-to-front", lambda *_: True
            )  # nunca abre sozinho

        GLib.timeout_add(250, self.tick)
        self.proxima()

    def proxima(self):
        if not self.urls:
            self.janela.destroy()
            return False

        self.atual = self.urls.pop(0)
        rotulo, url = self.atual
        print(f"medindo {rotulo}...", end="\r", file=sys.stderr, flush=True)
        # Folga generosa sobre a duração pedida: a webview leva um tempo para
        # montar a árvore do mestre, e cortar antes devolveria "sem resultado"
        # numa célula que estava só lenta -- que é exatamente o que se mede.
        # Contra o `next dev` a folga é muito maior: ele compila a rota sob
        # demanda na primeira visita, e isso passa de um minuto com folga.
        self.esperando_ate = (
            time.time() + self.args.segundos + (180 if self.args.url else 40)
        )
        self.web.load_uri(url)
        return False

    def tick(self):
        if self.atual is None:
            return True

        # Os nós do DOM saem junto do resultado, no mesmo `evaluate`: é a
        # coluna que conta quanto da tela cada câmera acrescenta, e o
        # `medir.mjs` a tira do protocolo do Chrome, que aqui não existe.
        self.web.evaluate_javascript(
            "window.__resultado ? JSON.stringify({...window.__resultado,"
            " nodes: document.getElementsByTagName('*').length,"
            " robo: window.__robo ?? null}) : 'null'",
            -1,
            None,
            None,
            None,
            self.leu,
            None,
        )
        return True

    def leu(self, web, resultado, _dados):
        try:
            valor = web.evaluate_javascript_finish(resultado)
            texto = valor.to_string() if valor else "null"
        except GLib.Error:
            texto = "null"

        if texto in ("null", "", "undefined"):
            if time.time() > self.esperando_ate:
                rotulo, url = self.atual
                print(f"sem resultado em {rotulo}", file=sys.stderr)
                self.atual = None
                GLib.idle_add(self.proxima)
            return

        rotulo, _url = self.atual
        linha = json.loads(texto)
        linha["rotulo_celula"] = rotulo
        self.linhas.append(linha)
        self.atual = None

        if self.args.capturas:
            self.capturar(rotulo, lambda: GLib.idle_add(self.proxima))
        else:
            GLib.idle_add(self.proxima)

    def capturar(self, rotulo, depois):
        """Um PNG por célula: é como se confere que a árvore montou de fato."""
        os.makedirs(self.args.capturas, exist_ok=True)
        alvo = os.path.join(
            self.args.capturas, re.sub(r"[^a-z0-9]+", "-", rotulo.lower()) + ".png"
        )

        def pronto(web, res, _):
            try:
                surface = web.get_snapshot_finish(res)
                surface.write_to_png(alvo)
            except GLib.Error as erro:
                print(f"captura falhou: {erro}", file=sys.stderr)
            depois()

        self.web.get_snapshot(
            WebKit2.SnapshotRegion.VISIBLE,
            WebKit2.SnapshotOptions.NONE,
            None,
            pronto,
            None,
        )


def mediana(valores):
    ordenado = sorted(valores)
    return ordenado[len(ordenado) // 2]


def imprimir(linhas, args):
    cab = ["cenario", "n", "cam", "gesto", "painel", "fps", "p95", "perdidos", "nos", "andou", "mut/palco", "mut/fora"]
    larg = [12, 4, 4, 14, 9, 7, 8, 10, 7, 7, 11, 10]
    fmt = lambda cs: "".join(str(c).rjust(w) for c, w in zip(cs, larg))  # noqa: E731

    # Agrupa as repetições da mesma célula e mostra a mediana, como o `medir.mjs`.
    por_celula = {}
    for l in linhas:
        por_celula.setdefault(l["rotulo_celula"], []).append(l)

    print()
    print(fmt(cab))
    for rotulo, corridas in por_celula.items():
        c = corridas[0]
        cam = re.search(r"cam=(\d+)", rotulo)
        g = re.search(r"gesto=(\w+)", rotulo)
        pnl = re.search(r"painel=(\w+)", rotulo)
        print(
            fmt(
                [
                    c["cenario"],
                    c["n"],
                    cam.group(1) if cam else "",
                    g.group(1) if g else "",
                    pnl.group(1) if pnl else "",
                    mediana([x["fps"] for x in corridas]),
                    f"{mediana([x['p95'] for x in corridas])}ms",
                    f"{mediana([x['perdidosPct'] for x in corridas])}%",
                    mediana([x["nodes"] for x in corridas]),
                    # Zero aqui reprova a célula: o robô despachou e o palco
                    # não se mexeu, então o que foi medido é uma tela parada.
                    round(c.get("robo", {}).get("andou", 0)) if c.get("robo") else "",
                    (c.get("robo") or {}).get("mutacoes", {}).get("palco", ""),
                    (c.get("robo") or {}).get("mutacoes", {}).get("fora", ""),
                ]
            )
        )

    for rotulo, corridas in por_celula.items():
        robo = corridas[0].get("robo")
        if robo and robo.get("andou", 0) < 1:
            print(
                f"\nAVISO -- {rotulo}: o robô despachou "
                f"{robo['movimentos']} movimentos em {robo['gestos']} gestos e a "
                f"câmera não andou. Mirou em `{robo['alvo'] or 'nada'}` "
                f"no ponto {robo.get('ponto') or '?'}, com {robo.get('vista') or '?'}. "
                "A linha mede uma tela parada; não conta."
            )

    for rotulo, corridas in por_celula.items():
        quem = (corridas[0].get("robo") or {}).get("quemMuda") or []
        if not quem:
            continue
        print(f"\no que muda por quadro -- {rotulo}:")
        for linha in quem:
            print(f"  {linha}")

    print(
        f"\n{args.segundos}s por medida. WebKitGTK "
        f"{WebKit2.get_major_version()}.{WebKit2.get_minor_version()}."
        f"{WebKit2.get_micro_version()} -- o motor do aplicativo, "
        f"janela {args.largura}x{args.altura}. "
        + (
            f"Alvo: {args.url}."
            if args.url
            else "Alvo: o build de produção (out/)."
        )
    )


def main():
    args = argumentos()

    servidor = None
    base = args.url
    if not base:
        servidor, base = subir_servidor(args.pular_build, args.imagens)

    urls = []
    for cenario in args.cenario.split(","):
        for n in [int(x) for x in args.n.split(",")]:
            com_camera = cenario in ("mestre-camera", "camera-gesto", "bancada")
            eixo = (
                [int(x) for x in args.cameras.split(",")]
                if com_camera
                else [int(args.cameras.split(",")[0])]
            )
            gestos = (
                args.gesto.split(",")
                if cenario in ("camera-gesto", "bancada")
                else ["mover"]
            )
            paineis = args.painel.split(",") if cenario == "bancada" else ["ambos"]
            for cam in eixo:
                for g in gestos:
                    for painel in paineis:
                        for i in range(args.repetir):
                            url = (
                                f"{base}/perf?cenario={cenario}&n={n}"
                                f"&segundos={args.segundos}&movidos={args.movidos}"
                                f"&zoom={args.zoom}&cameras={cam}&gesto={g}"
                                f"&mapas={args.mapas}&painel={painel}"
                                f"&sonda={'1' if args.sonda else '0'}"
                                f"&noar={'0' if args.sem_no_ar else '1'}"
                                f"&rotulo={args.rotulo}"
                            )
                            rotulo = f"{cenario} n={n} cam={cam}"
                            if cenario in ("camera-gesto", "bancada"):
                                rotulo += f" gesto={g}"
                            if cenario == "bancada":
                                rotulo += f" painel={painel}"
                            urls.append((rotulo, url))

    try:
        bancada = Bancada(args, urls)
        Gtk.main()
        imprimir(bancada.linhas, args)
        if args.capturas:
            print(f"capturas: {args.capturas}")
    finally:
        if servidor:
            servidor.terminate()


if __name__ == "__main__":
    if not os.environ.get("DISPLAY") and not os.environ.get("WAYLAND_DISPLAY"):
        sys.exit("sem tela: esta medida precisa de uma janela de verdade")
    if not shutil.which("node"):
        sys.exit("node nao encontrado")
    main()
