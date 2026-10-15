//! Ajustes do WebKitGTK que valem para o processo inteiro.
//!
//! O WebKit le estas variaveis UMA vez, quando sobe -- o processo da janela e
//! o `WebKitWebProcess`, que herda o ambiente dele. Por isso elas vao para o
//! ambiente antes de existir janela.

/// O que o app liga, e com que valor.
///
/// O WebKitGTK 2.54 trocou quem junta as camadas na tela: o TextureMapper deu
/// lugar a um compositor em Skia, e as texturas passaram a dividir um atlas de
/// DMABUF. Com os dois, o que entra e sai com animacao -- balao, menu, popover,
/// select, os icones que aparecem no hover -- PISCA no primeiro e no ultimo
/// quadro: a opacidade animada vira camada propria, e o compositor novo pinta
/// um quadro errado quando ela nasce e quando morre. Visto no Linux com Intel
/// UHD 630, X11, mesa 26.2.
///
/// As duas juntas sao o caminho do 2.52, onde o app foi medido. Num WebKit que
/// nao conhece uma delas, ela e so uma variavel a mais no ambiente.
///
/// Sai daqui quando um WebKit que nao pisque chegar as distribuicoes.
#[cfg(target_os = "linux")]
const VARIAVEIS: [(&str, &str); 2] = [
    ("WEBKIT_USE_SKIA_FOR_COMPOSITION", "0"),
    ("WEBKIT_DISABLE_DMABUF_ATLAS", "1"),
];

/// Liga as variaveis de [`VARIAVEIS`] que ninguem definiu.
///
/// A que ja esta no ambiente fica como esta: quem a exportou quer outra coisa,
/// e e por ela que se testa um WebKit novo sem recompilar o app.
///
/// Chamar no comeco do `run`, depois do `appimage::corrigir_wayland` e antes
/// do `Builder`: mexe no ambiente do processo inteiro, e ai ainda so existe a
/// thread principal.
#[cfg(target_os = "linux")]
pub fn compor_como_o_252() {
    for (nome, valor) in VARIAVEIS {
        if std::env::var_os(nome).is_none() {
            std::env::set_var(nome, valor);
        }
    }
}

#[cfg(not(target_os = "linux"))]
pub fn compor_como_o_252() {}
