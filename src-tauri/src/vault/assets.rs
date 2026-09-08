use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::atomic::{read_json, write_json};
use super::{now_ms, Vault};
use crate::error::{AppError, AppResult};

/// Metadado de um arquivo do acervo. O binario fica em `assets/`.
///
/// `remoteAt` e `remoteRoomId` sairam junto com o Supabase: eles respondiam
/// "este arquivo ja subiu, e para qual sala", pergunta que nao existe mais
/// quando o arquivo mora no disco de quem opera.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetMeta {
    pub id: String,
    /// `image` ou `audio`.
    pub kind: String,
    pub name: String,
    pub mime_type: String,
    pub size: u64,
    pub created_at: i64,
    /// Medidas naturais. So existem para imagem, e sao medidas na webview --
    /// o browser ja tem o arquivo decodificado no upload, e decodificar de
    /// novo no Rust exigiria um crate de imagem para reproduzir o que ja foi
    /// feito.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub natural_width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub natural_height: Option<u32>,
    /// Pasta em que o mestre guardou. Ausente = raiz.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
}

/// Pasta do acervo. So raiz, sem aninhamento.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetFolder {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

/// Extensao a partir do tipo declarado.
///
/// Tabela e nao um crate de mime: o caminho no disco tem de ser DERIVAVEL do
/// metadado, senao servir `/asset/{id}` exigiria varrer o diretorio a cada
/// requisicao. Tipo desconhecido cai em `bin`, que continua sendo um caminho
/// deterministico.
fn extension_for(mime: &str) -> &'static str {
    match mime {
        "image/webp" => "webp",
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/avif" => "avif",
        "image/svg+xml" => "svg",
        "audio/mpeg" | "audio/mp3" => "mp3",
        "audio/ogg" => "ogg",
        "audio/wav" | "audio/x-wav" => "wav",
        "audio/flac" | "audio/x-flac" => "flac",
        "audio/mp4" | "audio/aac" | "audio/x-m4a" => "m4a",
        "audio/webm" => "weba",
        _ => "bin",
    }
}

fn kind_for(mime: &str) -> AppResult<&'static str> {
    if mime.starts_with("image/") {
        Ok("image")
    } else if mime.starts_with("audio/") {
        Ok("audio")
    } else {
        Err(AppError::UnsupportedKind(mime.to_string()))
    }
}

/// Caminho do binario. Derivado do id e do tipo, nunca do nome que o usuario
/// deu -- nome de arquivo vindo de fora nao toca caminho.
pub fn asset_path(vault: &Vault, meta: &AssetMeta) -> PathBuf {
    vault
        .assets_dir()
        .join(format!("{}.{}", meta.id, extension_for(&meta.mime_type)))
}

pub fn index(vault: &Vault) -> AppResult<Vec<AssetMeta>> {
    Ok(read_json(&vault.assets_index_path())?.unwrap_or_default())
}

fn write_index(vault: &Vault, assets: &[AssetMeta]) -> AppResult<()> {
    write_json(&vault.assets_index_path(), &assets)
}

/// O acervo, do mais novo para o mais velho.
pub fn list(vault: &Vault, kind: Option<&str>) -> AppResult<Vec<AssetMeta>> {
    let mut assets = index(vault)?;

    if let Some(kind) = kind {
        assets.retain(|asset| asset.kind == kind);
    }

    assets.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(assets)
}

pub fn find(vault: &Vault, id: &str) -> AppResult<Option<AssetMeta>> {
    Ok(index(vault)?.into_iter().find(|asset| asset.id == id))
}

/// Nome do temporario que um upload em curso ocupa.
///
/// Dentro de `assets/` de proposito, e nao em `/tmp`: `rename` entre pontos de
/// montagem nao e atomico, e `/tmp` costuma ser outro. O ponto na frente o
/// esconde do explorador enquanto sobe.
pub fn upload_temp(vault: &Vault) -> PathBuf {
    vault
        .assets_dir()
        .join(format!(".upload-{}", uuid::Uuid::new_v4().simple()))
}

/// Adota um arquivo que ja esta no disco, movendo-o para o lugar definitivo.
///
/// Existe por causa do upload: um mapa de 80MB lido inteiro para um `Vec`
/// antes de gravar cobra 80MB de RAM por arquivo em voo, e o daemon aceita
/// varios de uma vez quando o mestre arrasta uma pasta. Escrevendo em
/// streaming para o temporario, a memoria fica no tamanho do buffer.
pub fn adopt(
    vault: &Vault,
    temp: &Path,
    name: &str,
    mime_type: &str,
    natural_width: Option<u32>,
    natural_height: Option<u32>,
) -> AppResult<AssetMeta> {
    let kind = match kind_for(mime_type) {
        Ok(kind) => kind,
        Err(cause) => {
            // O temporario nao pode ficar para tras num tipo recusado: ele nao
            // esta no indice, ninguem o apagaria depois.
            let _ = std::fs::remove_file(temp);
            return Err(cause);
        }
    };

    let size = std::fs::metadata(temp)?.len();

    let meta = AssetMeta {
        id: uuid::Uuid::new_v4().to_string(),
        kind: kind.to_string(),
        name: name.trim().to_string(),
        mime_type: mime_type.to_string(),
        size,
        created_at: now_ms(),
        natural_width,
        natural_height,
        folder_id: None,
    };

    std::fs::rename(temp, asset_path(vault, &meta))?;

    let mut assets = index(vault)?;
    assets.push(meta.clone());
    write_index(vault, &assets)?;

    Ok(meta)
}

pub fn delete(vault: &Vault, id: &str) -> AppResult<()> {
    let mut assets = index(vault)?;

    let Some(position) = assets.iter().position(|asset| asset.id == id) else {
        return Ok(());
    };

    let meta = assets.remove(position);

    // Indice primeiro: se o `remove_file` falhar, o arquivo ja saiu da lista e
    // o mestre nao ve mais nada quebrado. O contrario deixaria uma linha
    // apontando para um binario que nao existe.
    write_index(vault, &assets)?;

    if let Err(cause) = std::fs::remove_file(asset_path(vault, &meta)) {
        if cause.kind() != std::io::ErrorKind::NotFound {
            log::warn!("acervo: {} saiu do indice mas o binario ficou: {cause}", meta.id);
        }
    }

    Ok(())
}

/// Move para uma pasta. `None` devolve a raiz. So metadado: o binario nao anda.
pub fn set_folder(vault: &Vault, id: &str, folder_id: Option<String>) -> AppResult<()> {
    let mut assets = index(vault)?;

    let Some(asset) = assets.iter_mut().find(|asset| asset.id == id) else {
        return Ok(());
    };

    asset.folder_id = folder_id;

    write_index(vault, &assets)
}

// --- pastas -----------------------------------------------------------------

/// Em ordem alfabetica: a lista e navegada com o olho, nao por recencia.
pub fn folders(vault: &Vault) -> AppResult<Vec<AssetFolder>> {
    let mut folders: Vec<AssetFolder> =
        read_json(&vault.folders_path())?.unwrap_or_default();

    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(folders)
}

pub fn create_folder(vault: &Vault, name: &str) -> AppResult<AssetFolder> {
    let folder = AssetFolder {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.trim().to_string(),
        created_at: now_ms(),
    };

    let mut all = folders(vault)?;
    all.push(folder.clone());
    write_json(&vault.folders_path(), &all)?;

    Ok(folder)
}

pub fn rename_folder(vault: &Vault, id: &str, name: &str) -> AppResult<()> {
    let mut all = folders(vault)?;

    let Some(folder) = all.iter_mut().find(|folder| folder.id == id) else {
        return Ok(());
    };

    folder.name = name.trim().to_string();

    write_json(&vault.folders_path(), &all)
}

/// Apaga a pasta e devolve o conteudo a raiz.
///
/// Nunca apaga arquivo: perder um mapa por um clique em "apagar pasta" seria
/// dano desproporcional ao gesto, e o arquivo e o que custou trabalho.
pub fn delete_folder(vault: &Vault, id: &str) -> AppResult<()> {
    let mut all = folders(vault)?;
    all.retain(|folder| folder.id != id);
    write_json(&vault.folders_path(), &all)?;

    let mut assets = index(vault)?;
    let mut touched = false;

    for asset in assets.iter_mut() {
        if asset.folder_id.as_deref() == Some(id) {
            asset.folder_id = None;
            touched = true;
        }
    }

    if touched {
        write_index(vault, &assets)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn campanha() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");

        (dir, vault)
    }

    /// Simula o que o daemon faz: escreve o temporario e manda adotar.
    fn enviar(vault: &Vault, name: &str, mime: &str, bytes: &[u8]) -> AppResult<AssetMeta> {
        let temp = upload_temp(vault);
        std::fs::write(&temp, bytes).expect("temp");

        adopt(vault, &temp, name, mime, None, None)
    }

    #[test]
    fn envio_grava_binario_e_indice() {
        let (_dir, vault) = campanha();

        let meta = enviar(&vault, "mapa.webp", "image/webp", b"bytes").expect("adopt");

        assert_eq!(meta.kind, "image");
        assert_eq!(meta.size, 5);
        assert!(asset_path(&vault, &meta).exists());
        assert_eq!(list(&vault, None).expect("list").len(), 1);
    }

    #[test]
    fn caminho_vem_do_id_e_nao_do_nome_enviado() {
        let (_dir, vault) = campanha();

        // Nome vindo de fora nao escolhe onde nada e gravado. Se escolhesse,
        // um `../../` no nome do arquivo sairia da campanha.
        let meta = enviar(&vault, "../../fora.webp", "image/webp", b"x").expect("adopt");
        let path = asset_path(&vault, &meta);

        assert_eq!(path.parent(), Some(vault.assets_dir().as_path()));
        assert!(path.file_name().expect("nome").to_string_lossy().starts_with(&meta.id));
    }

    #[test]
    fn tipo_recusado_nao_deixa_temporario_para_tras() {
        let (_dir, vault) = campanha();

        let temp = upload_temp(&vault);
        std::fs::write(&temp, b"pdf").expect("temp");

        assert!(adopt(&vault, &temp, "livro.pdf", "application/pdf", None, None).is_err());
        // Um temporario de tipo recusado nao entra no indice, entao ninguem o
        // apagaria depois.
        assert!(!temp.exists());
        assert!(list(&vault, None).expect("list").is_empty());
    }

    #[test]
    fn lista_filtra_por_tipo_e_ordena_do_mais_novo() {
        let (_dir, vault) = campanha();

        let primeiro = enviar(&vault, "a.webp", "image/webp", b"a").expect("a");
        std::thread::sleep(std::time::Duration::from_millis(5));
        let segundo = enviar(&vault, "b.webp", "image/webp", b"b").expect("b");
        enviar(&vault, "t.ogg", "audio/ogg", b"t").expect("t");

        let imagens = list(&vault, Some("image")).expect("list");
        assert_eq!(imagens.len(), 2);
        assert_eq!(imagens[0].id, segundo.id, "o mais novo vem primeiro");
        assert_eq!(imagens[1].id, primeiro.id);
        assert_eq!(list(&vault, Some("audio")).expect("list").len(), 1);
    }

    #[test]
    fn apagar_tira_do_indice_e_do_disco() {
        let (_dir, vault) = campanha();

        let meta = enviar(&vault, "mapa.webp", "image/webp", b"x").expect("adopt");
        delete(&vault, &meta.id).expect("delete");

        assert!(list(&vault, None).expect("list").is_empty());
        assert!(!asset_path(&vault, &meta).exists());
    }

    #[test]
    fn apagar_pasta_devolve_o_conteudo_a_raiz() {
        let (_dir, vault) = campanha();

        let pasta = create_folder(&vault, "Mapas").expect("folder");
        let meta = enviar(&vault, "mapa.webp", "image/webp", b"x").expect("adopt");
        set_folder(&vault, &meta.id, Some(pasta.id.clone())).expect("move");

        assert_eq!(find(&vault, &meta.id).expect("find").expect("meta").folder_id, Some(pasta.id.clone()));

        delete_folder(&vault, &pasta.id).expect("delete folder");

        // Nunca apaga arquivo: perder um mapa por um clique em "apagar pasta"
        // seria dano desproporcional ao gesto.
        let ainda = find(&vault, &meta.id).expect("find").expect("meta");
        assert_eq!(ainda.folder_id, None);
        assert!(asset_path(&vault, &ainda).exists());
        assert!(folders(&vault).expect("folders").is_empty());
    }

    #[test]
    fn pastas_saem_em_ordem_alfabetica() {
        let (_dir, vault) = campanha();

        create_folder(&vault, "Retratos").expect("f");
        create_folder(&vault, "mapas").expect("f");
        create_folder(&vault, "Fichas").expect("f");

        let nomes: Vec<String> = folders(&vault).expect("folders").into_iter().map(|f| f.name).collect();
        assert_eq!(nomes, vec!["Fichas", "mapas", "Retratos"]);
    }
}
