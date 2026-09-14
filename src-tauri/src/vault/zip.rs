use std::collections::BTreeMap;
use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Seek, Write};
use std::path::{Component, Path};

use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use super::atomic::write_json;
use super::{characters, players, Vault};
use crate::error::{AppError, AppResult};

/// O que uma campanha exportada carrega de cada jogador.
///
/// Materializado no export, e nao gravado a cada mudanca: nome e notas moram no
/// SQLite porque as notas gravam a cada 800ms de digitacao, e reescrever um JSON
/// inteiro nesse ritmo, com varios celulares ao mesmo tempo, e a receita para
/// escrita perdida. Aqui a foto e tirada uma vez.
///
/// O `tokenHash` VIAJA, e isso e deliberado: e um hash SHA-256 de 32 bytes
/// aleatorios, entao quem tem o zip nao consegue derivar o token -- so
/// verificar um que ja tenha. Levando-o, o celular de cada jogador continua
/// valendo depois de importar noutra maquina, que e o ponto do zip. Sem ele,
/// toda a mesa teria de entrar de novo e o mestre ficaria com fichas duplicadas.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerMeta {
    pub id: String,
    pub nome: String,
    /// O caderno dele, inteiro.
    ///
    /// Materializado aqui pela mesma razao das notas de personagem: ele vive no
    /// banco, o banco nao viaja no zip, e sem esta copia uma campanha importada
    /// chegaria com os anexos de cada jogador intactos e sem uma linha do que
    /// eles anotaram na mesa.
    ///
    /// `default` porque zip antigo nao tem o campo: ali as notas eram uma
    /// coluna de texto na ficha, que a v4 do schema derrubou. Esse texto nao
    /// volta -- ver a migracao --, e o import de um zip antigo traz o jogador
    /// com o caderno vazio em vez de recusar o arquivo.
    #[serde(default)]
    pub caderno: Vec<players::Nota>,
    pub entrou_em: i64,
    pub token_hash: String,
}

/// Nome do arquivo que descreve um jogador dentro de `jogadores/{id}/`.
const PLAYER_META: &str = "_meta.json";

/// As notas de um personagem, dentro de `personagens/{id}/`.
///
/// Arquivo proprio, e nao um campo do `personagens.json`: o indice e reescrito
/// inteiro a cada renomeacao e a cada troca de miniatura, e carregar dentro
/// dele o texto de todos os jogadores faria cada um desses gestos regravar
/// paginas de nota.
const CHARACTER_NOTES: &str = "_notas.json";

/// Diretorio que NAO viaja.
///
/// O `.ato20/` guarda o banco da sessao. Ele nao vai no zip porque e derivado
/// -- o `_meta.json` de cada jogador o reconstroi -- e porque um WAL aberto no
/// meio de uma sessao nao e um arquivo que se copie e depois se abra.
const STATE_DIR: &str = ".ato20";

/// Teto do que se aceita descompactar.
///
/// Um zip de 2 MB pode virar 100 GB no disco: e a bomba classica, e a defesa
/// nao e confiar no cabecalho e sim contar o que sai. Cinco gigabytes cobrem
/// qualquer campanha real com folga.
const MAX_TOTAL_BYTES: u64 = 5 * 1024 * 1024 * 1024;

/// Teto de entradas, pela mesma razao: um zip com um milhao de arquivos vazios
/// nao passa do teto de bytes e ainda assim trava o disco.
const MAX_ENTRIES: usize = 50_000;

// --- exportar ---------------------------------------------------------------

/// Zipa a campanha inteira.
///
/// Tudo, sem escolha. Houve uma versao com duas opcoes -- com e sem
/// `jogadores/` --, pensada para quem manda a campanha a outro mestre e nao quer
/// repassar a ficha em PDF de quem joga na casa dele. Saiu porque cobrava uma
/// decisao em TODO export por um caso raro: quem exporta esta quase sempre
/// levando a campanha para outra maquina ou guardando copia, e ali "tudo" e a
/// unica resposta certa.
///
/// A consequencia fica registrada: o zip carrega nome, apelido, notas e anexos
/// de cada jogador. Compartilhar a campanha compartilha isso.
pub fn export(vault: &Vault, dest: &Path) -> AppResult<()> {
    // Materializa a foto dos jogadores ANTES de varrer o diretorio, para que o
    // `_meta.json` de cada um entre no mesmo zip.
    //
    // Falha aqui NAO aborta o export, e isso foi um teste que ensinou: um
    // `estado.db` ilegivel derrubava a exportacao inteira, quando as cenas, o
    // acervo e os anexos estao intactos em arquivos ao lado -- e quem exporta
    // costuma estar exportando justamente porque algo deu errado. Perde-se o
    // texto dos jogadores, que e o que estava ilegivel de todo jeito.
    if let Err(cause) = write_player_meta(vault) {
        log::warn!("export sem o texto dos jogadores: {cause}");
    }

    // As notas de personagem, pelo mesmo motivo e com a mesma tolerancia: elas
    // vivem no banco, que nao viaja, e um banco ilegivel nao pode custar o
    // export das cenas e dos anexos.
    if let Err(cause) = write_character_notes(vault) {
        log::warn!("export sem as notas de personagem: {cause}");
    }

    let file = File::create(dest)?;
    let mut zip = ZipWriter::new(BufWriter::new(file));

    // Deflate no JSON e no que ainda nao esta comprimido. Imagem e audio ja
    // vem comprimidos e o deflate neles gasta CPU para nao ganhar nada -- mas
    // separar por extensao aqui trocaria uma decisao simples por uma tabela a
    // manter, e o custo de comprimir um webp uma vez e segundos.
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    let mut entradas = 0usize;
    walk(&vault.root, &vault.root, &mut |relativo, caminho| {
        entradas += 1;

        zip.start_file(relativo.to_string_lossy().replace('\\', "/"), options)
            .map_err(zip_error)?;

        let mut origem = BufReader::new(File::open(caminho)?);
        std::io::copy(&mut origem, &mut zip)?;

        Ok(())
    })?;

    if entradas == 0 {
        return Err(AppError::Malformed {
            file: "campanha".into(),
            cause: "nada para exportar".into(),
        });
    }

    zip.finish().map_err(zip_error)?;

    Ok(())
}

/// Percorre o vault, pulando o que nao viaja.
fn walk(
    root: &Path,
    dir: &Path,
    visitar: &mut impl FnMut(&Path, &Path) -> AppResult<()>,
) -> AppResult<()> {
    for entrada in std::fs::read_dir(dir)? {
        let entrada = entrada?;
        let caminho = entrada.path();
        let nome = entrada.file_name().to_string_lossy().to_string();

        // O estado da sessao e derivado, e um temporario de envio em curso nao
        // e conteudo. Os dois comecam com ponto.
        if nome.starts_with('.') {
            continue;
        }

        if caminho.is_dir() {
            walk(root, &caminho, visitar)?;
            continue;
        }

        let relativo = caminho.strip_prefix(root).map_err(|_| AppError::Malformed {
            file: caminho.display().to_string(),
            cause: "fora da campanha".into(),
        })?;

        visitar(relativo, &caminho)?;
    }

    Ok(())
}

/// Grava `jogadores/{id}/_meta.json` para cada jogador do banco.
fn write_player_meta(vault: &Vault) -> AppResult<()> {
    for player in players::list(vault)? {
        let hash = players::token_hash_of(vault, &player.id)?;

        let dir = players::attachments_dir(vault, &player.id);
        std::fs::create_dir_all(&dir)?;

        write_json(
            &dir.join(PLAYER_META),
            &PlayerMeta {
                caderno: players::notes(vault, &player.id)?,
                id: player.id,
                nome: player.nome,
                entrou_em: player.entrou_em,
                token_hash: hash.unwrap_or_default(),
            },
        )?;
    }

    Ok(())
}

/// Grava `personagens/{id}/_notas.json` para cada personagem do indice.
fn write_character_notes(vault: &Vault) -> AppResult<()> {
    for personagem in characters::load(vault)? {
        let notas = players::notes_of_character(vault, &personagem.id)?;

        // Personagem sem nota nenhuma nao ganha arquivo: um `{}` por
        // personagem seria sujeira no zip e no diretorio de quem importa.
        if notas.is_empty() {
            continue;
        }

        let dir = characters::dir(vault, &personagem.id);
        std::fs::create_dir_all(&dir)?;

        write_json(
            &dir.join(CHARACTER_NOTES),
            &notas.into_iter().collect::<BTreeMap<String, String>>(),
        )?;
    }

    Ok(())
}

// --- importar ---------------------------------------------------------------

/// Extrai um zip como campanha nova dentro de `parent`.
///
/// Devolve o vault aberto. NAO sobrescreve: se a pasta de destino ja existe com
/// um `config.json`, recusa -- importar por cima de uma campanha viva apagaria
/// trabalho, e o gesto ("importar") nao anuncia isso.
pub fn import(zip_path: &Path, parent: &Path) -> AppResult<Vault> {
    let file = File::open(zip_path)?;
    let mut arquivo = ZipArchive::new(BufReader::new(file)).map_err(zip_error)?;

    if arquivo.len() > MAX_ENTRIES {
        return Err(AppError::Malformed {
            file: zip_path.display().to_string(),
            cause: format!("zip com {} entradas", arquivo.len()),
        });
    }

    // Le a identidade antes de escrever qualquer coisa: e ela que decide o nome
    // da pasta, e um zip que nao e campanha tem de ser recusado sem deixar
    // diretorio pela metade no disco de quem tentou.
    let config = read_config(&mut arquivo)?;

    let destino = parent.join(super::slug::slugify(&config.nome));

    if Vault::config_path(&destino).exists() {
        return Err(AppError::NotACampaign(format!(
            "{} ja tem uma campanha. Mova ou renomeie antes de importar",
            destino.display()
        )));
    }

    std::fs::create_dir_all(&destino)?;

    let mut total = 0u64;

    for i in 0..arquivo.len() {
        let mut entrada = arquivo.by_index(i).map_err(zip_error)?;

        // `enclosed_name` devolve `None` para nome absoluto, com `..` ou fora do
        // arquivo -- e a defesa contra zip-slip, e e ela que impede um zip
        // preparado de escrever em `~/.ssh/authorized_keys` ao ser importado.
        // Ela vem do crate de proposito: reimplementar essa checagem a mao e
        // exatamente onde esse tipo de bug nasce.
        let Some(relativo) = entrada.enclosed_name() else {
            log::warn!("import: entrada {i} com nome inseguro, ignorada");
            continue;
        };

        // Cinto e suspensorio: mesmo com `enclosed_name`, nada de componente
        // estranho passa daqui.
        if relativo
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
        {
            log::warn!("import: {} tem componente estranho, ignorada", relativo.display());
            continue;
        }

        // O estado da sessao e reconstruido do `_meta.json`; um `.ato20` dentro
        // do zip so poderia ser de um export de versao antiga ou de um zip
        // montado a mao.
        if relativo.starts_with(STATE_DIR) {
            continue;
        }

        let alvo = destino.join(&relativo);

        if entrada.is_dir() {
            std::fs::create_dir_all(&alvo)?;
            continue;
        }

        if let Some(pai) = alvo.parent() {
            std::fs::create_dir_all(pai)?;
        }

        // Copia com limite, contando o que SAI -- e nao o que o cabecalho do
        // zip promete, que e o numero que uma bomba mente.
        let mut saida = BufWriter::new(File::create(&alvo)?);
        let mut buffer = [0u8; 64 * 1024];

        loop {
            let lidos = entrada.read(&mut buffer)?;
            if lidos == 0 {
                break;
            }

            total += lidos as u64;

            if total > MAX_TOTAL_BYTES {
                drop(saida);
                // Nao deixa metade de uma campanha no disco de quem importou.
                let _ = std::fs::remove_dir_all(&destino);

                return Err(AppError::Malformed {
                    file: zip_path.display().to_string(),
                    cause: "conteudo acima do teto de 5 GB".into(),
                });
            }

            saida.write_all(&buffer[..lidos])?;
        }

        saida.flush()?;
    }

    let vault = Vault::open(&destino)?;

    // Reconstroi o banco da sessao a partir do que veio no zip.
    //
    // Jogadores primeiro: as notas sao chaveadas por id de jogador, e restaurar
    // na ordem inversa gravaria nota de gente que o banco ainda nao conhece.
    restore_players(&vault)?;
    restore_character_notes(&vault)?;

    Ok(vault)
}

/// Le o `config.json` de dentro do zip, sem extrair nada.
fn read_config<R: Read + Seek>(arquivo: &mut ZipArchive<R>) -> AppResult<super::Config> {
    let mut entrada = arquivo.by_name("config.json").map_err(|_| {
        AppError::NotACampaign("o zip nao tem config.json na raiz".into())
    })?;

    let mut texto = String::new();
    entrada.read_to_string(&mut texto)?;

    let config: super::Config =
        serde_json::from_str(&texto).map_err(|cause| AppError::Malformed {
            file: "config.json".into(),
            cause: cause.to_string(),
        })?;

    if config.versao > super::VAULT_VERSION {
        return Err(AppError::NotACampaign(format!(
            "o zip foi criado por uma versao mais nova do ATO20 (formato {}, este entende {})",
            config.versao,
            super::VAULT_VERSION
        )));
    }

    Ok(config)
}

/// Recria as linhas de jogador a partir dos `_meta.json` importados.
///
/// Levando o hash junto, o celular de cada jogador continua valendo -- e por
/// isso a mesa nao precisa entrar de novo depois de o mestre trocar de maquina.
/// Le de volta as notas de personagem que o zip trouxe.
///
/// Silencioso quando nao ha nada: campanha exportada por uma versao anterior
/// nao tem `_notas.json`, e isso e estado valido, nao erro de importacao.
fn restore_character_notes(vault: &Vault) -> AppResult<()> {
    for personagem in characters::load(vault)? {
        let caminho = characters::dir(vault, &personagem.id).join(CHARACTER_NOTES);

        let Some(notas): Option<BTreeMap<String, String>> = super::atomic::read_json(&caminho)?
        else {
            continue;
        };

        for (jogador_id, texto) in notas {
            players::set_note(vault, &personagem.id, &jogador_id, &texto)?;
        }
    }

    Ok(())
}

fn restore_players(vault: &Vault) -> AppResult<()> {
    let dir = vault.root.join("jogadores");

    let Ok(entradas) = std::fs::read_dir(&dir) else {
        // Export sem jogadores, ou campanha nova. Estado valido.
        return Ok(());
    };

    for entrada in entradas.filter_map(Result::ok) {
        let meta_path = entrada.path().join(PLAYER_META);

        let Some(meta) = super::atomic::read_json::<PlayerMeta>(&meta_path)? else {
            continue;
        };

        // O id da pasta manda, e nao o do arquivo: e ele que os anexos ao lado
        // usam, e um `_meta.json` editado a mao com id diferente deixaria a
        // linha apontando para uma pasta vazia.
        let id = entrada.file_name().to_string_lossy().to_string();

        players::restore(vault, &id, &meta)?;
    }

    Ok(())
}

fn zip_error(cause: zip::result::ZipError) -> AppError {
    AppError::Malformed {
        file: "zip".into(),
        cause: cause.to_string(),
    }
}

/// Nome sugerido para o arquivo exportado.
pub fn suggested_name(vault: &Vault) -> String {
    format!("{}.ato20.zip", super::slug::slugify(&vault.config.nome))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn campanha(dir: &Path, nome: &str) -> Vault {
        let vault = Vault::create(dir.join("origem"), nome).expect("create");

        std::fs::create_dir_all(vault.scenes_dir()).expect("cenas");
        std::fs::write(
            vault.scenes_dir().join("a-taverna.json"),
            r#"{"id":"s1","name":"A Taverna","items":[],"fog":[],"createdAt":1,"updatedAt":1}"#,
        )
        .expect("cena");
        write_json(
            &vault.order_path(),
            &serde_json::json!({
                "versao": 1,
                "cenas": [{ "id": "s1", "arquivo": "a-taverna.json" }],
                "editando": "s1",
                "noAr": "s1",
            }),
        )
        .expect("ordem");
        std::fs::create_dir_all(vault.assets_dir()).expect("assets");
        std::fs::write(vault.assets_dir().join("a1.webp"), b"bytes do mapa").expect("asset");

        vault
    }

    /// O personagem sobrevive ao zip, com os anexos dos dois autores.
    ///
    /// E a afirmacao central da segmentacao: o que dura deixou de estar
    /// pendurado na identidade do jogador, que nem viaja. Se este teste
    /// quebrar, `personagens/` parou de ser conteudo de campanha e a ficha
    /// voltou a existir so na maquina onde foi anexada.
    #[test]
    fn personagem_viaja_no_zip() {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = campanha(dir.path(), "A Marca do Javali");

        let personagem = super::super::characters::create(&vault, "Corvo").expect("personagem");
        super::super::characters::write_anexo(&vault, &personagem.id, "ficha.pdf", b"do jogador")
            .expect("anexo");
        super::super::characters::set_campo(
            &vault,
            &personagem.id,
            super::super::characters::Campo::Miniatura,
            Some("a1"),
        )
        .expect("miniatura");

        let zip_path = dir.path().join("saida.ato20.zip");
        export(&vault, &zip_path).expect("export");

        let importada =
            import(&zip_path, &dir.path().join("importadas")).expect("import");

        let lista = super::super::characters::load(&importada).expect("personagens");
        assert_eq!(lista.len(), 1);
        assert_eq!(lista[0].nome, "Corvo");
        // A miniatura viaja como id do acervo, e o asset viaja junto no mesmo
        // zip: e o que faz o vinculo continuar valendo do outro lado.
        assert_eq!(lista[0].miniatura.as_deref(), Some("a1"));

        let anexos = super::super::characters::list_anexos(&importada, &personagem.id)
            .expect("anexos");
        assert_eq!(anexos.len(), 1);
        assert_eq!(anexos[0].arquivo, "ficha.pdf");
        assert_eq!(
            super::super::characters::read_anexo(
                &importada,
                &personagem.id,
                super::super::characters::Autor::Jogador,
                "ficha.pdf",
            )
            .expect("bytes"),
            b"do jogador"
        );
    }

    /// A nota do jogador sobre o personagem sobrevive ao zip.
    ///
    /// Ela vive no SQLite, que NAO viaja: sem materializar, a campanha chegaria
    /// do outro lado com personagem e anexos intactos e sem uma linha do que os
    /// jogadores escreveram.
    #[test]
    fn nota_de_personagem_viaja_no_zip() {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = campanha(dir.path(), "A Marca do Javali");

        let personagem = characters::create(&vault, "Corvo").expect("personagem");
        // `join` devolve o jogador e o token em claro; aqui basta o id dele.
        let (edgar, _token) = players::join(&vault, "Edgar").expect("entrar");
        let jogador = edgar.id;

        players::link(&vault, &jogador, &personagem.id).expect("vinculo");
        players::set_note(&vault, &personagem.id, &jogador, "o alcapao range").expect("nota");

        let zip_path = dir.path().join("saida.ato20.zip");
        export(&vault, &zip_path).expect("export");

        let importada = import(&zip_path, &dir.path().join("importadas")).expect("import");

        // O id do jogador tambem viaja, no `_meta.json` dele: e o que faz a
        // nota reencontrar o dono do outro lado.
        assert_eq!(
            players::note(&importada, &personagem.id, &jogador).expect("nota"),
            "o alcapao range"
        );
        // E o vinculo NAO viaja, de proposito: quem senta na mesa e da maquina,
        // nao da campanha. O mestre revincula ao importar.
        assert!(players::characters_of(&importada, &jogador)
            .expect("vinculos")
            .is_empty());
    }

    #[test]
    fn ida_e_volta_preserva_a_campanha() {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = campanha(dir.path(), "A Marca do Javali");

        let zip_path = dir.path().join("saida.ato20.zip");
        export(&vault, &zip_path).expect("export");
        assert!(zip_path.is_file());

        let destino = dir.path().join("importadas");
        let importada = import(&zip_path, &destino).expect("import");

        assert_eq!(importada.config.nome, "A Marca do Javali");
        // O codigo viaja: e o mesmo que os celulares da mesa conhecem, e
        // trocá-lo obrigaria todo jogador a reconfigurar o aparelho.
        assert_eq!(importada.config.codigo, vault.config.codigo);
        assert_eq!(
            std::fs::read(importada.assets_dir().join("a1.webp")).expect("asset"),
            b"bytes do mapa"
        );

        let board = super::super::board::load(&importada).expect("load").expect("board");
        assert_eq!(board.scenes.len(), 1);
        assert_eq!(board.scenes[0]["name"], "A Taverna");
    }

    #[test]
    fn o_estado_da_sessao_nao_viaja() {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = campanha(dir.path(), "Campanha");

        // Um jogador de verdade, para o banco existir de verdade.
        players::join(&vault, "Ana").expect("join");
        assert!(vault.state_dir().join("estado.db").is_file());

        let zip_path = dir.path().join("saida.zip");
        export(&vault, &zip_path).expect("export");

        let arquivo = File::open(&zip_path).expect("open");
        let mut zip = ZipArchive::new(BufReader::new(arquivo)).expect("archive");

        let nomes: Vec<String> = (0..zip.len())
            .map(|i| zip.by_index(i).expect("entrada").name().to_string())
            .collect();

        assert!(
            !nomes.iter().any(|n| n.contains(STATE_DIR)),
            "o banco da sessao entrou no zip: {nomes:?}"
        );
        assert!(nomes.iter().any(|n| n == "config.json"), "{nomes:?}");
    }

    #[test]
    fn banco_ilegivel_nao_derruba_o_export() {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = campanha(dir.path(), "Campanha");

        std::fs::create_dir_all(vault.state_dir()).expect("state");
        std::fs::write(vault.state_dir().join("estado.db"), b"isto nao e sqlite").expect("db");

        let zip_path = dir.path().join("saida.zip");

        // As cenas e o acervo estao intactos em arquivos: perder o texto dos
        // jogadores nao pode custar a exportacao da campanha.
        export(&vault, &zip_path).expect("export");

        let arquivo = File::open(&zip_path).expect("open");
        let mut zip = ZipArchive::new(BufReader::new(arquivo)).expect("archive");
        let nomes: Vec<String> = (0..zip.len())
            .map(|i| zip.by_index(i).expect("entrada").name().to_string())
            .collect();

        assert!(nomes.iter().any(|n| n == "cenas/a-taverna.json"), "{nomes:?}");
        assert!(nomes.iter().any(|n| n == "assets/a1.webp"), "{nomes:?}");
    }

    #[test]
    fn a_mesa_continua_valendo_depois_de_importar() {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = campanha(dir.path(), "Campanha");

        let (player, token) = players::join(&vault, "Ana").expect("join");
        players::create_note(
            &vault,
            &player.id,
            "O poco",
            "a chave esta no poco",
            &["pista".into()],
        )
        .expect("nota");

        let pasta = players::attachments_dir(&vault, &player.id);
        std::fs::create_dir_all(&pasta).expect("dir");
        std::fs::write(pasta.join("ficha.pdf"), b"ficha da Ana").expect("ficha");

        let zip_path = dir.path().join("saida.zip");
        export(&vault, &zip_path).expect("export");

        let importada = import(&zip_path, &dir.path().join("destino")).expect("import");

        // O hash viaja, entao o celular da Ana continua valendo. Sem isso, toda
        // a mesa teria de entrar de novo e o mestre ficaria com fichas
        // duplicadas depois de cada troca de maquina.
        let achada = players::by_token(&importada, &token)
            .expect("by_token")
            .expect("a Ana perdeu o acesso depois do import");

        assert_eq!(achada.id, player.id);
        assert_eq!(achada.nome, "Ana");

        // O caderno viaja no `_meta.json`: ele mora no banco, e o banco nao vai
        // no zip. Sem esta copia, a campanha importada chegaria com os anexos
        // da Ana intactos e sem uma linha do que ela anotou.
        let caderno = players::notes(&importada, &player.id).expect("caderno");
        assert_eq!(caderno.len(), 1, "{caderno:?}");
        assert_eq!(caderno[0].texto, "a chave esta no poco");
        assert_eq!(caderno[0].tags, vec!["pista".to_string()]);
        assert_eq!(
            std::fs::read(players::attachments_dir(&importada, &player.id).join("ficha.pdf"))
                .expect("anexo"),
            b"ficha da Ana"
        );
    }

    #[test]
    fn import_nao_sobrescreve_campanha_existente() {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = campanha(dir.path(), "Campanha");

        let zip_path = dir.path().join("saida.zip");
        export(&vault, &zip_path).expect("export");

        let destino = dir.path().join("destino");
        import(&zip_path, &destino).expect("primeiro import");

        // Importar por cima apagaria trabalho, e o gesto nao anuncia isso.
        assert!(import(&zip_path, &destino).is_err());
    }

    #[test]
    fn zip_que_nao_e_campanha_e_recusado_sem_sujar_o_disco() {
        let dir = tempfile::tempdir().expect("tempdir");
        let zip_path = dir.path().join("qualquer.zip");

        {
            let mut zip = ZipWriter::new(File::create(&zip_path).expect("create"));
            zip.start_file("leiame.txt", SimpleFileOptions::default()).expect("start");
            zip.write_all(b"nao sou campanha").expect("write");
            zip.finish().expect("finish");
        }

        let destino = dir.path().join("destino");
        assert!(import(&zip_path, &destino).is_err());
        // A identidade e lida antes de escrever: recusar nao pode deixar
        // diretorio pela metade.
        assert!(!destino.exists() || std::fs::read_dir(&destino).expect("dir").count() == 0);
    }

    #[test]
    fn zip_slip_nao_escreve_fora_do_destino() {
        let dir = tempfile::tempdir().expect("tempdir");
        let zip_path = dir.path().join("hostil.zip");
        let alvo = dir.path().join("vitima.txt");

        {
            let mut zip = ZipWriter::new(File::create(&zip_path).expect("create"));
            let options = SimpleFileOptions::default();

            // Um zip preparado. Sem a checagem, `../vitima.txt` escreveria fora
            // da pasta de destino -- e com `..` suficientes, em qualquer lugar
            // que o usuario possa escrever.
            zip.start_file("config.json", options).expect("start");
            zip.write_all(
                br#"{"versao":1,"nome":"Hostil","codigo":"AAAAAA","criadaEm":1}"#,
            )
            .expect("write");

            zip.start_file("../vitima.txt", options).expect("start");
            zip.write_all(b"escapei").expect("write");

            zip.start_file("../../../../../../tmp/ato20-escapou.txt", options).expect("start");
            zip.write_all(b"escapei mais").expect("write");

            zip.finish().expect("finish");
        }

        let destino = dir.path().join("destino");
        import(&zip_path, &destino).expect("import");

        assert!(!alvo.exists(), "o zip escreveu fora do destino");
        assert!(!Path::new("/tmp/ato20-escapou.txt").exists(), "o zip escapou para /tmp");
    }

    #[test]
    fn nome_do_arquivo_sugerido_e_legivel() {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = campanha(dir.path(), "A Marca do Javali");

        assert_eq!(suggested_name(&vault), "a-marca-do-javali.ato20.zip");
    }
}
