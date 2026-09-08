use std::collections::HashSet;

/// Nome de arquivo legivel a partir de um nome digitado.
///
/// O vault existe para ser aberto no explorador e versionado no git, e um
/// diretorio de UUIDs mata as duas coisas. "A Taverna do Javali" vira
/// `a-taverna-do-javali.json`, que e o que faz `cenas/` valer alguma coisa
/// para quem olha de fora do aplicativo.
pub fn slugify(name: &str) -> String {
    let mut out = String::new();
    let mut last_dash = true;

    for ch in name.trim().chars() {
        let mapped = deaccent(ch);

        for c in mapped.chars() {
            if c.is_ascii_alphanumeric() {
                out.push(c.to_ascii_lowercase());
                last_dash = false;
            } else if !last_dash {
                out.push('-');
                last_dash = true;
            }
        }
    }

    let trimmed = out.trim_matches('-');

    // Nome inteiro fora do ASCII, ou vazio, viraria arquivo sem nome.
    if trimmed.is_empty() {
        return "cena".to_string();
    }

    // Teto de 60: alguns sistemas de arquivos param em 255 bytes no componente,
    // e um nome de cena longo somado ao sufixo de colisao chegaria perto.
    trimmed.chars().take(60).collect::<String>().trim_matches('-').to_string()
}

/// Tira o acento mantendo a letra: "ação" vira "acao", nao "a--o".
///
/// Tabela a mao em vez de normalizacao Unicode completa: o alfabeto que
/// aparece em nome de cena em portugues cabe aqui, e um crate de normalizacao
/// custaria mais do que resolve.
fn deaccent(ch: char) -> String {
    match ch {
        'á' | 'à' | 'ã' | 'â' | 'ä' => "a".into(),
        'é' | 'è' | 'ê' | 'ë' => "e".into(),
        'í' | 'ì' | 'î' | 'ï' => "i".into(),
        'ó' | 'ò' | 'õ' | 'ô' | 'ö' => "o".into(),
        'ú' | 'ù' | 'û' | 'ü' => "u".into(),
        'ç' => "c".into(),
        'ñ' => "n".into(),
        'Á' | 'À' | 'Ã' | 'Â' | 'Ä' => "A".into(),
        'É' | 'È' | 'Ê' | 'Ë' => "E".into(),
        'Í' | 'Ì' | 'Î' | 'Ï' => "I".into(),
        'Ó' | 'Ò' | 'Õ' | 'Ô' | 'Ö' => "O".into(),
        'Ú' | 'Ù' | 'Û' | 'Ü' => "U".into(),
        'Ç' => "C".into(),
        'Ñ' => "N".into(),
        other => other.to_string(),
    }
}

/// Nome de arquivo unico dentro de um conjunto ja usado.
///
/// Duas cenas podem se chamar igual -- duplicar uma cena e um gesto comum, e
/// "Floresta (copia)" nem sempre e renomeada. Sem o sufixo, a segunda
/// sobrescreveria a primeira no disco.
pub fn unique_file(base: &str, extension: &str, taken: &HashSet<String>) -> String {
    let candidate = format!("{base}.{extension}");
    if !taken.contains(&candidate) {
        return candidate;
    }

    for n in 2..1000 {
        let candidate = format!("{base}-{n}.{extension}");
        if !taken.contains(&candidate) {
            return candidate;
        }
    }

    format!("{base}-{}.{extension}", uuid::Uuid::new_v4().simple())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_legivel_em_portugues() {
        assert_eq!(slugify("A Taverna do Javali"), "a-taverna-do-javali");
        assert_eq!(slugify("Ação na Ponte"), "acao-na-ponte");
        assert_eq!(slugify("  Cena 1  "), "cena-1");
    }

    #[test]
    fn slug_nunca_vazio() {
        // Nome inteiro fora do ASCII nao pode virar arquivo sem nome.
        assert_eq!(slugify("???"), "cena");
        assert_eq!(slugify(""), "cena");
    }

    #[test]
    fn colisao_ganha_sufixo() {
        let mut taken = HashSet::new();
        taken.insert("floresta.json".to_string());

        assert_eq!(unique_file("floresta", "json", &taken), "floresta-2.json");
        assert_eq!(unique_file("taverna", "json", &taken), "taverna.json");
    }
}
