/// Tipo declarado a partir da extensao do arquivo.
///
/// Tabela a mao, e nao um crate de mime nem sniff de bytes. Duas razoes:
///
/// O caminho no disco tem de ser DERIVAVEL do metadado -- servir `/asset/{id}`
/// exigiria varrer o diretorio a cada requisicao se o tipo e a extensao nao se
/// correspondessem.
///
/// E o `Content-Type` decide se o celular abre a imagem na tela ou baixa o
/// arquivo. O que a extensao diz e o que quem enviou quis; um sniff acertaria
/// mais vezes o formato real e erraria mais vezes a intencao.
///
/// Tipo desconhecido cai em `application/octet-stream`, que continua sendo uma
/// resposta deterministica.
pub fn from_name(name: &str) -> &'static str {
    let extensao = name
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();

    match extensao.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "avif" => "image/avif",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "pdf" => "application/pdf",
        "txt" | "md" => "text/plain; charset=utf-8",
        // Os tres que uma EXTENSAO serve, e o tipo aqui nao e cosmetico: CSS
        // com o tipo errado e recusado como folha de estilo, e modulo ESM com
        // o tipo errado e recusado pelo `import`. Ver `extensoes.rs`.
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        // As fontes que um tema traz junto.
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "mp3" => "audio/mpeg",
        "ogg" | "oga" => "audio/ogg",
        "m4a" | "aac" => "audio/mp4",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "opus" => "audio/opus",
        "weba" => "audio/webm",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
}

/// Extensao a partir do tipo. O inverso de `from_name`, para nomear no disco.
///
/// Nao e bijetivo de proposito: `audio/mp3` e `audio/mpeg` viram os dois `mp3`,
/// porque o que importa aqui e o caminho ser deterministico e legivel, nao
/// reconstruir o tipo exato que veio.
pub fn extension_for(mime: &str) -> &'static str {
    // Parametro do `Content-Type` (`; charset=utf-8`) nao entra na decisao.
    let mime = mime.split(';').next().unwrap_or(mime).trim();

    match mime {
        "image/webp" => "webp",
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/avif" => "avif",
        "image/svg+xml" => "svg",
        "image/bmp" => "bmp",
        "audio/mpeg" | "audio/mp3" => "mp3",
        "audio/ogg" => "ogg",
        "audio/wav" | "audio/x-wav" => "wav",
        "audio/flac" | "audio/x-flac" => "flac",
        "audio/mp4" | "audio/aac" | "audio/x-m4a" => "m4a",
        "audio/opus" => "opus",
        "audio/webm" => "weba",
        _ => "bin",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ida_e_volta_nas_extensoes_que_importam() {
        // O que o acervo aceita tem de sobreviver a viagem: o nome no disco sai
        // do tipo, e o tipo servido sai do nome.
        for nome in ["mapa.webp", "mapa.png", "retrato.jpg", "trilha.ogg", "trilha.mp3"] {
            let mime = from_name(nome);
            let ext = extension_for(mime);

            assert_eq!(from_name(&format!("x.{ext}")), mime, "{nome} -> {mime} -> {ext}");
        }
    }

    #[test]
    fn extensao_em_maiuscula_conta() {
        // Camera de celular grava `.JPG`, e Windows manda `.PNG`.
        assert_eq!(from_name("FOTO.JPG"), "image/jpeg");
        assert_eq!(from_name("Mapa.WEBP"), "image/webp");
    }

    #[test]
    fn charset_nao_confunde_a_extensao() {
        assert_eq!(extension_for("text/plain; charset=utf-8"), "bin");
        assert_eq!(extension_for("image/png"), "png");
    }

    #[test]
    fn desconhecido_e_deterministico() {
        assert_eq!(from_name("ficha"), "application/octet-stream");
        assert_eq!(from_name("coisa.xyz"), "application/octet-stream");
        assert_eq!(extension_for("application/x-inventado"), "bin");
    }
}
