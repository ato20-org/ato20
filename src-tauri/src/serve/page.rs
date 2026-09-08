use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};

/// Uma pagina de erro que o daemon desenha sozinho.
///
/// HTML e CSS embutidos aqui, sem tocar o bundle, e a razao e direta: em dois
/// dos tres casos o que falta E o bundle. Uma pagina de erro que depende do
/// que quebrou nao aparece.
///
/// Existe porque a versao anterior devolvia `text/plain`: "tela nao encontrada"
/// em fonte monoespacada no canto superior esquerdo de uma tela branca. Isso e
/// aceitavel numa rota de API, que so um `fetch` le -- mas estas rotas sao
/// abertas por uma pessoa, muitas vezes numa TV do outro lado da sala, e a
/// mensagem tem de dizer o que fazer e nao so o que houve.
pub struct ErrorPage {
    pub status: StatusCode,
    pub titulo: &'static str,
    pub explicacao: &'static str,
    /// O que fazer. Vazio quando nao ha nada a fazer do lado de quem le.
    ///
    /// Aceita marcacao -- e um literal escrito aqui, nunca entrada de fora.
    pub saida: Option<&'static str>,
    /// Oferece os links das duas telas de espectador.
    pub com_telas: bool,
}

impl ErrorPage {
    /// A rota nao existe no bundle.
    ///
    /// Nao recebe o caminho pedido, e isso e deliberado: ecoar no HTML algo que
    /// veio da URL seria XSS refletido numa porta que esta na rede local. Quem
    /// precisa do caminho ja o tem na barra de endereco.
    pub fn tela_desconhecida() -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            titulo: "Essa tela não existe",
            explicacao: "O endereço está diferente do que a mesa usa. Só duas telas acompanham \
                         a sessão: a TV e o celular de cada jogador.",
            saida: Some("Confira o endereço, ou escaneie de novo o QR que o mestre está mostrando."),
            com_telas: true,
        }
    }

    /// O `out/` nao foi encontrado no disco.
    pub fn sem_bundle() -> Self {
        Self {
            status: StatusCode::SERVICE_UNAVAILABLE,
            titulo: "As telas não foram construídas",
            explicacao: "O aplicativo está no ar, mas não encontrou os arquivos das telas de \
                         espectador. Isso é problema da instalação, não da tua rede.",
            saida: Some(
                "Na máquina do mestre: rode <code>pnpm build</code> e abra o aplicativo de novo.",
            ),
            com_telas: false,
        }
    }
}

impl IntoResponse for ErrorPage {
    fn into_response(self) -> Response {
        let telas = if self.com_telas {
            r#"<nav>
              <a href="/assistir">Assistir <small>a TV da mesa</small></a>
              <a href="/plateia">Plateia <small>o teu celular</small></a>
            </nav>"#
        } else {
            ""
        };

        let saida = self
            .saida
            .map(|texto| format!("<p class=\"saida\">{texto}</p>"))
            .unwrap_or_default();

        // Fonte do sistema, e nao a do bundle: a fonte tambem mora no `out/`.
        // Escuro porque as tres telas sao escuras e esta pode aparecer numa TV
        // com a luz baixa -- branco estourado no meio da sessao ofusca a mesa.
        let html = format!(
            r#"<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ATO20</title>
<!-- Existe quando o bundle existe; num 404 de rota, sim. No caso de bundle
     ausente ele falha em silencio, que e melhor que nao ter icone nenhum
     quando da para ter. -->
<link rel="icon" href="/favicon.ico">
<style>
  :root {{ color-scheme: dark; }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 2rem 1.5rem;
    background: #0a0a0a;
    color: #ededed;
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }}
  main {{ max-width: 40rem; }}
  /* Cresce com a tela: esta pagina aparece numa TV do outro lado da sala com a
     mesma frequencia que num celular na mao, e 1.5rem lidos a tres metros nao
     se leem. */
  h1 {{
    margin: 0 0 .75rem;
    font-size: clamp(1.5rem, 1.1rem + 1.6vw, 2.5rem);
    line-height: 1.2;
    font-weight: 600;
    letter-spacing: -0.01em;
  }}
  p {{
    margin: 0 0 1rem;
    font-size: clamp(1rem, .95rem + .3vw, 1.25rem);
    color: #a1a1a1;
    text-wrap: pretty;
  }}
  .saida {{
    border-left: 2px solid #3f3f3f;
    padding-left: 1rem;
    color: #ededed;
  }}
  code {{
    background: #1c1c1c;
    border-radius: .25rem;
    padding: .1em .4em;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: .9em;
  }}
  nav {{ display: grid; gap: .5rem; margin-top: 1.5rem; }}
  a {{
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.15rem;
    font-size: clamp(1rem, .95rem + .3vw, 1.25rem);
    border: 1px solid #2a2a2a;
    border-radius: .5rem;
    color: #ededed;
    text-decoration: none;
    font-weight: 500;
  }}
  a:hover, a:focus-visible {{ border-color: #6b6b6b; background: #141414; }}
  a small {{ color: #a1a1a1; font-weight: 400; }}
  footer {{ margin-top: 2rem; color: #6b6b6b; font-size: .8rem; }}
</style>
</head>
<body>
  <main>
    <h1>{titulo}</h1>
    <p>{explicacao}</p>
    {saida}
    {telas}
    <footer>ATO20</footer>
  </main>
</body>
</html>
"#,
            titulo = self.titulo,
            explicacao = self.explicacao,
        );

        (
            self.status,
            [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
            html,
        )
            .into_response()
    }
}
