//! O que so importa quando o processo saiu de um AppImage.
//!
//! O `.deb` e o `.rpm` tem um gerenciador de pacotes atras deles: ele instala o
//! atalho no menu e resolve as bibliotecas do sistema. O AppImage nao tem nada
//! disso -- e um arquivo solto que o usuario baixou --, e as duas coisas que
//! faltam sobram para o aplicativo fazer sozinho, na abertura.
//!
//! Nada aqui derruba a abertura: um atalho que nao foi escrito custa um atalho,
//! e um aplicativo que nao abriu custa a sessao.

use std::fs;
use std::path::{Path, PathBuf};

/// O nome do arquivo de atalho. O identificador em vez de `ato20` porque o
/// diretorio e compartilhado com tudo que o usuario instalou, e `ato20.desktop`
/// e um nome que outra coisa pode querer.
const ARQUIVO: &str = "show.rpg.ato20.desktop";

/// Onde cada familia de distribuicao guarda a `libwayland-client`.
const WAYLAND: [&str; 3] = [
    "/usr/lib/x86_64-linux-gnu/libwayland-client.so.0",
    "/usr/lib64/libwayland-client.so.0",
    "/usr/lib/libwayland-client.so.0",
];

/// Faz o WebKit usar a `libwayland-client` DA MAQUINA, e nao a empacotada.
///
/// O `linuxdeploy` traz para dentro do AppImage a `libwayland-client` da
/// distribuicao onde o pacote foi compilado, e essa copia passa na frente da
/// que a maquina tem. A lista de exclusao dele ja deixa de fora `libdrm`,
/// `libgbm`, `libglapi` e `libxcb` -- exatamente as bibliotecas de video que
/// TEM de vir do host. A de wayland e o mesmo caso e ficou fora da lista.
///
/// O estrago aparece no EGL: o `libEGL` da maquina e os drivers que ele carrega
/// foram compilados contra a wayland do host, e com a antiga na frente a
/// inicializacao falha. O WebKit imprime `Could not create surfaceless EGL
/// display: EGL_BAD_ALLOC. Aborting...`, o `WebKitWebProcess` aborta, e o que a
/// pessoa ve e uma janela BRANCA, sem mensagem nenhuma -- porque quem
/// desenharia a mensagem e o processo que morreu.
///
/// `LD_PRELOAD` e o menor conserto que resolve: poe UMA biblioteca na frente
/// sem tocar no `LD_LIBRARY_PATH`, que e o que mantem todo o resto do bundle em
/// uso. Este processo ja resolveu as suas bibliotecas e nao muda; quem herda a
/// variavel e o `WebKitWebProcess`, que e justamente quem faz EGL.
///
/// Some daqui quando o `linuxdeploy` corrigir a lista de exclusao, ou quando o
/// Tauri expuser o `--exclude-library` que o `linuxdeploy` ja aceita.
///
/// Chamar ANTES de subir qualquer thread: `set_var` mexe no ambiente do
/// processo inteiro, e ai ainda so existe a thread principal.
pub fn corrigir_wayland() {
    if std::env::var_os("APPIMAGE").is_none() {
        return;
    }

    let Some(lib) = WAYLAND.iter().find(|caminho| Path::new(caminho).exists()) else {
        return;
    };

    // Nao substitui um `LD_PRELOAD` que ja existia: quem o exportou tinha
    // motivo, e sobrescrever seria trocar um problema silencioso por outro.
    let valor = match std::env::var_os("LD_PRELOAD") {
        Some(anterior) if !anterior.is_empty() => {
            format!("{lib}:{}", anterior.to_string_lossy())
        }
        _ => (*lib).to_owned(),
    };

    std::env::set_var("LD_PRELOAD", valor);
}

/// Escreve ou corrige o atalho do menu.
///
/// Sem ele o AppImage nao aparece no rofi, no wofi nem no menu do ambiente:
/// nada varre a pasta de downloads atras de executavel. Isto substitui pedir ao
/// usuario que instale o AppImageLauncher -- uma segunda ferramenta para
/// resolver o que sao dois arquivos.
///
/// Roda a cada abertura, e nao so na primeira: o AppImage e um arquivo que o
/// usuario MOVE, da pasta de downloads para `~/Aplicativos`. Um atalho escrito
/// uma vez so apontaria para o caminho velho, e o que se ve e o icone certo
/// abrindo nada.
pub fn atalho(dados: &Path) {
    let Some(appimage) = std::env::var_os("APPIMAGE").map(PathBuf::from) else {
        return;
    };

    if let Err(causa) = escrever_atalho(&appimage, dados) {
        log::warn!("atalho do menu nao pode ser escrito: {causa}");
    }
}

fn escrever_atalho(appimage: &Path, dados: &Path) -> std::io::Result<()> {
    let icone = instalar_icone(dados)?;
    let conteudo = conteudo(appimage, icone.as_deref());
    let destino = data_home()?.join("applications").join(ARQUIVO);

    // Ler antes de gravar. Sem isto toda abertura reescreveria o arquivo e
    // mudaria o mtime, o que poe o menu de alguns ambientes a reindexar a toa.
    if fs::read_to_string(&destino).is_ok_and(|atual| atual == conteudo) {
        return Ok(());
    }

    if let Some(pai) = destino.parent() {
        fs::create_dir_all(pai)?;
    }

    fs::write(&destino, conteudo)?;
    log::info!("atalho do menu em {}", destino.display());

    Ok(())
}

fn data_home() -> std::io::Result<PathBuf> {
    // `XDG_DATA_HOME` vazio conta como ausente -- e o que a especificacao diz, e
    // e o caso real de quem exporta a variavel num script sem preencher.
    if let Some(xdg) = std::env::var_os("XDG_DATA_HOME") {
        if !xdg.is_empty() {
            return Ok(PathBuf::from(xdg));
        }
    }

    let home = std::env::var_os("HOME").ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::NotFound, "HOME nao esta no ambiente")
    })?;

    Ok(PathBuf::from(home).join(".local").join("share"))
}

/// Copia o icone de dentro do AppImage para o disco, e devolve onde ficou.
///
/// Precisa copiar porque o atalho sobrevive ao processo e o AppImage e
/// DESMONTADO quando ele termina: um `Icon=` apontando para dentro do
/// `/tmp/.mount_ato20_XXXX` seria um caminho morto no segundo seguinte.
///
/// Vai para o diretorio de dados do aplicativo, com caminho absoluto no
/// `Icon=`, em vez de entrar no tema `hicolor` do usuario: o tema exigiria
/// `gtk-update-icon-cache` para alguns ambientes enxergarem, e e mais um
/// binario que precisaria existir na maquina de quem baixou.
fn instalar_icone(dados: &Path) -> std::io::Result<Option<PathBuf>> {
    let Some(appdir) = std::env::var_os("APPDIR").map(PathBuf::from) else {
        return Ok(None);
    };

    // Do maior para o menor: o menu pede o icone entre 24 e 128 pixels, e
    // reduzir um grande sai melhor do que ampliar um de 32. O ultimo e o que o
    // `linuxdeploy` deixa na raiz do AppDir, que existe mesmo quando a arvore
    // de temas nao foi montada.
    let candidatos = [
        "usr/share/icons/hicolor/256x256@2/apps/ato20.png",
        "usr/share/icons/hicolor/128x128/apps/ato20.png",
        "usr/share/icons/hicolor/32x32/apps/ato20.png",
        "ato20.png",
    ];

    let Some(origem) = candidatos
        .iter()
        .map(|relativo| appdir.join(relativo))
        .find(|caminho| caminho.is_file())
    else {
        return Ok(None);
    };

    let destino = dados.join("ato20.png");

    fs::create_dir_all(dados)?;
    fs::copy(&origem, &destino)?;

    Ok(Some(destino))
}

/// O texto do `.desktop`.
///
/// Separado de quem grava para ser comparavel com o que ja esta no disco, e
/// para o teste ler o resultado sem tocar no `HOME` de ninguem.
fn conteudo(appimage: &Path, icone: Option<&Path>) -> String {
    let caminho = citar(&appimage.to_string_lossy());

    // `Icon` ausente e melhor do que `Icon` apontando para arquivo que nao
    // existe: o primeiro cai no icone generico, o segundo faz parte dos menus
    // desenhar um quadrado vazio.
    let icone = match icone {
        Some(caminho) => format!("Icon={}\n", caminho.display()),
        None => String::new(),
    };

    // `TryExec` e o que faz o menu ESCONDER a entrada se o AppImage foi
    // apagado, em vez de oferecer um atalho que nao abre nada.
    //
    // Uma categoria principal so. `Utility;Game;` passaria no validador como
    // aviso e poria a entrada DUAS VEZES no menu de ambientes que agrupam por
    // categoria. `RolePlaying` e categoria adicional e pede `Game` junto; quem
    // procura mesa de RPG procura ali. O resto da busca vem das `Keywords`, que
    // e o que o rofi e o wofi casam enquanto se digita.
    format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=ATO20\n\
         GenericName=Mesa de RPG\n\
         Comment=Monta e exibe as cenas da mesa de RPG presencial\n\
         Exec={caminho}\n\
         TryExec={caminho}\n\
         {icone}\
         Terminal=false\n\
         Categories=Game;RolePlaying;\n\
         Keywords=rpg;mesa;cena;mestre;campanha;ato20;\n\
         StartupNotify=true\n\
         StartupWMClass=ato20\n\
         X-AppImage-Version={versao}\n",
        versao = env!("CARGO_PKG_VERSION"),
    )
}

/// Aspas no caminho, como o `.desktop` pede.
///
/// O AppImage costuma parar em `~/Downloads`, mas nada impede `~/Meus
/// Aplicativos`: sem aspas o espaco viraria um segundo argumento e o menu
/// abriria nada. A especificacao manda escapar `"` e `\` dentro das aspas.
fn citar(caminho: &str) -> String {
    let escapado = caminho.replace('\\', r"\\").replace('"', r#"\""#);

    format!("\"{escapado}\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caminho_com_espaco_vai_entre_aspas() {
        let texto = conteudo(Path::new("/home/eu/Meus Apps/ato20.AppImage"), None);

        assert!(texto.contains("Exec=\"/home/eu/Meus Apps/ato20.AppImage\"\n"));
        assert!(texto.contains("TryExec=\"/home/eu/Meus Apps/ato20.AppImage\"\n"));
    }

    #[test]
    fn sem_icone_a_linha_nao_aparece() {
        let texto = conteudo(Path::new("/tmp/ato20.AppImage"), None);

        assert!(!texto.contains("Icon="));
    }

    #[test]
    fn com_icone_a_linha_e_absoluta() {
        let texto = conteudo(
            Path::new("/tmp/ato20.AppImage"),
            Some(Path::new("/home/eu/.local/share/show.rpg.ato20/ato20.png")),
        );

        assert!(texto.contains("Icon=/home/eu/.local/share/show.rpg.ato20/ato20.png\n"));
    }

    #[test]
    fn as_aspas_do_proprio_caminho_sao_escapadas() {
        assert_eq!(citar(r#"/tmp/a"b"#), r#""/tmp/a\"b""#);
        assert_eq!(citar(r"/tmp/a\b"), r#""/tmp/a\\b""#);
    }

    /// Mais de uma categoria PRINCIPAL faz a entrada aparecer duas vezes no
    /// menu de quem agrupa por categoria -- e o `desktop-file-validate` avisa.
    #[test]
    fn ha_uma_categoria_principal_so() {
        let texto = conteudo(Path::new("/tmp/ato20.AppImage"), None);

        let linha = texto
            .lines()
            .find(|linha| linha.starts_with("Categories="))
            .expect("sem Categories");

        let principais = ["AudioVideo", "Audio", "Video", "Development", "Education",
                          "Game", "Graphics", "Network", "Office", "Science",
                          "Settings", "System", "Utility"];

        let quantas = linha
            .trim_start_matches("Categories=")
            .split(';')
            .filter(|categoria| principais.contains(categoria))
            .count();

        assert_eq!(quantas, 1, "em {linha}");
    }

    /// O rofi e o wofi leem `Name`; sem ele a entrada nao e listada.
    #[test]
    fn o_atalho_tem_o_minimo_que_um_menu_le() {
        let texto = conteudo(Path::new("/tmp/ato20.AppImage"), None);

        assert!(texto.starts_with("[Desktop Entry]\n"));
        assert!(texto.contains("Type=Application\n"));
        assert!(texto.contains("Name=ATO20\n"));
        assert!(texto.ends_with('\n'));
    }
}
