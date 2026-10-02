#!/usr/bin/env python3
"""
Abre a bancada do relevo (`/bancada25d`) numa janela WebKitGTK.

É a janela do APLICATIVO, e não o Chrome: carrega `libwebkit2gtk-4.1.so.0`, o
mesmo arquivo `.so` que o binário do Tauri carrega (confira com
`ldd src-tauri/target/debug/ato20 | grep webkit`). A pergunta desta bancada é
visual -- "o mapa 2.5D é bom numa mesa?" --, e responder no Chrome seria
responder sobre um motor em que o mestre não está sentado: o borrão que o
`zoom` conserta, o custo de compor uma camada grande e o teto de textura são
todos dele.

Mesma receita do `scripts/perf/webview.py`, sem a matriz de medida: aqui não se
mede, se olha.

## Antes de abrir

O material não vem no repositório (ver `.gitignore`). Ponha o seu:

    mkdir -p public/bancada
    cp ~/mapa.jpg  public/bancada/mapa.jpg
    cp ~/token.png public/bancada/token.png

E deixe o `next dev` rodando noutro terminal:

    pnpm dev

## Uso

    python3 scripts/debug/bancada-25d.py
    python3 scripts/debug/bancada-25d.py --console          # o console da pagina
    python3 scripts/debug/bancada-25d.py --url http://localhost:3001
    python3 scripts/debug/bancada-25d.py --largura 1920 --altura 1080

Dentro da janela: roda amplia, espaço + arraste navega, e `Ctrl+Alt+D` acende o
HUD do palco -- que é onde se lê `transbordo`, o número que diz se a camada
nova cabe no plano. Ver a skill `debug-do-palco` §3.

Precisa de PyGObject com GTK 3 e WebKit2 4.1 -- em Arch, `python-gobject` e
`webkit2gtk-4.1`, que o próprio Tauri já exige.
"""

import argparse
import sys
import urllib.error
import urllib.request

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib, Gtk, WebKit2  # noqa: E402


def de_pe(url: str) -> bool:
    """
    O servidor responde? Sem isto a janela abre num erro de conexão.

    A sonda vai na PRÓPRIA rota, e com folga de tempo. Na raiz ela derrubava a
    bancada por engano: `/` é o Mestre inteiro, e o Turbopack leva mais de dois
    segundos para compilá-lo na primeira visita -- o servidor estava de pé e a
    sonda dizia que não. A rota da bancada é pequena, e é ela que precisa
    responder de qualquer forma.
    """
    try:
        with urllib.request.urlopen(url, timeout=30):
            return True
    except urllib.error.HTTPError:
        # Respondeu, ainda que com erro: o servidor está de pé, e o que a
        # página tem de errado se vê melhor na janela do que aqui.
        return True
    except (urllib.error.URLError, OSError):
        return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--url", default="http://localhost:3000")
    ap.add_argument("--rota", default="/bancada25d")
    ap.add_argument("--largura", type=int, default=1600)
    ap.add_argument("--altura", type=int, default=1000)
    ap.add_argument(
        "--tiro",
        metavar="ARQUIVO.png",
        help="salva um PNG do CONTEUDO da webview e fecha; nada do resto da "
        "tela entra, que e a diferenca para um `import -window root`",
    )
    ap.add_argument(
        "--espera",
        type=float,
        default=6.0,
        help="segundos ate o tiro, para o mapa decodificar (padrao 6)",
    )
    ap.add_argument(
        "--console",
        action="store_true",
        help="imprime o console da pagina; uma excecao engolida pelo React "
        "desenha um palco vazio e sem isto ela some",
    )
    args = ap.parse_args()

    alvo = args.url.rstrip("/") + args.rota

    print(f"esperando {alvo} compilar...")
    if not de_pe(alvo):
        print(
            f"nada respondendo em {alvo} -- suba o `pnpm dev` noutro terminal",
            file=sys.stderr,
        )
        return 1

    janela = Gtk.Window()
    janela.set_default_size(args.largura, args.altura)
    janela.set_title("ATO20 — bancada do relevo (2.5D)")
    janela.connect("destroy", Gtk.main_quit)

    ajustes = WebKit2.Settings()
    # O mesmo que o Tauri liga. Sem aceleração o raster vai para a CPU, e o que
    # se veria aqui não seria o palco que o mestre vê.
    ajustes.set_hardware_acceleration_policy(WebKit2.HardwareAccelerationPolicy.ALWAYS)
    ajustes.set_enable_developer_extras(True)
    ajustes.set_enable_write_console_messages_to_stdout(bool(args.console))

    web = WebKit2.WebView()
    web.set_settings(ajustes)
    janela.add(web)
    janela.show_all()

    print(
        f"WebKit {WebKit2.get_major_version()}.{WebKit2.get_minor_version()}."
        f"{WebKit2.get_micro_version()} — o motor do aplicativo"
    )
    print(f"abrindo {alvo}")

    web.load_uri(alvo)

    if args.tiro:
        # Só o conteúdo da webview, e não a tela: a bancada abre sobre a área de
        # trabalho de alguém, e uma captura de tela inteira leva junto o que
        # estiver aberto ao lado. Esta pega o que a página desenhou, e mais nada.
        def tirar():
            def pronto(web, res, _):
                try:
                    web.get_snapshot_finish(res).write_to_png(args.tiro)
                    print(f"capturado em {args.tiro}")
                except GLib.Error as erro:
                    print(f"captura falhou: {erro}", file=sys.stderr)
                Gtk.main_quit()

            web.get_snapshot(
                WebKit2.SnapshotRegion.VISIBLE,
                WebKit2.SnapshotOptions.NONE,
                None,
                pronto,
                None,
            )
            return False

        GLib.timeout_add(int(args.espera * 1000), tirar)

    Gtk.main()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
