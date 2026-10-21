//! A expressao de rolagem, do lado do daemon: `2d20+5`, `(3+1)*2+1d6`.
//!
//! Espelho de `lerExpressaoDeRolagem` (`src/lib/mestre/expressao-de-rolagem.ts`),
//! e existe porque o celular rola o detalhe da ficha PELO DAEMON: o aparelho
//! manda so qual detalhe quer, e quem le a expressao gravada na ficha e sorteia
//! e esta maquina. Um celular que mandasse a expressao pronta poderia rolar
//! `1d20+50` com o rotulo da Luta do personagem.
//!
//! As contas sao em `f64`, como o `Number` do JS, e nao em inteiro: e o que faz
//! os dois leitores concordarem ate no absurdo -- `99999999999999999999*0` e
//! zero nos dois, em vez de estourar so de um lado. Os casos de teste sao um
//! JSON so, lido pelos dois (`expressao-de-rolagem.casos.json`).
//!
//! As siglas dos atributos (`{1d20+FOR}`, `{AGId20>+5}`) so valem em
//! `ler_com`: e a conta escrita entre chaves no texto da ficha, que o celular
//! rola por `serve::roll_in_text`. A `rolagem` do detalhe e do atributo le sem
//! elas, como o campo do Mestre a le.

use crate::vault::detalhes::MAX_ROLAGEM;

/// Os solidos que existem. Espelha `TIPOS_DADO`.
const FACES: [u32; 8] = [20, 12, 10, 8, 6, 4, 100, 2];

/// Mais que isto de uma vez e recusado. Espelha `MAX_DADOS_POR_JOGADA`.
pub const MAX_DADOS: u32 = 20;

/// O teto do modificador. Espelha `MAX_MODIFICADOR` e `fio::MODIFICADOR_MAX`.
const MAX_MODIFICADOR: f64 = 10_000.0;

/// Um termo de dados: `2d6` sao dois d6.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Jogada {
    pub quantidade: u32,
    pub faces: u32,
    /// Quais dados contam: todos (a soma, `None`), ou so o maior ou o menor.
    /// Espelha `Manter` do TS.
    pub manter: Option<Manter>,
}

/// `6d20>` fica com o MAIOR dos seis -- o teste do Ordem --; `2d20<`, com o
/// MENOR. Num dado so nao muda nada, e some na leitura.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Manter {
    Maior,
    Menor,
}

/// Quais dados de um termo ficam FORA da soma: todos menos o maior, ou todos
/// menos o menor. Espelha `descartadosDe` em `types/dado.ts`: pelo valor, com
/// o zero do d10 valendo dez, e no empate fica o primeiro.
pub fn descartados(faces: u32, gravados: &[u32], manter: Option<Manter>) -> Vec<bool> {
    let valor = |gravado: u32| if faces == 10 && gravado == 0 { 10 } else { gravado };
    let fica = match manter {
        _ if gravados.len() < 2 => None,
        None => None,
        Some(Manter::Maior) => gravados.iter().map(|&g| valor(g)).max(),
        Some(Manter::Menor) => gravados.iter().map(|&g| valor(g)).min(),
    }
    .and_then(|alvo| gravados.iter().position(|&g| valor(g) == alvo));

    (0..gravados.len()).map(|i| fica.is_some_and(|fica| i != fica)).collect()
}

/// Um atributo que a conta le pela sigla: `{1d20+FOR}`, `{AGId20>+5}`.
/// Espelha `AtributoDaConta` do TS.
#[derive(Debug, Clone, Copy)]
pub struct AtributoDaConta<'a> {
    pub sigla: &'a str,
    pub valor: i64,
    /// O atributo que E um dado (a AGI d8): a sigla na conta rola ele, e
    /// `{AGI+2}` e 1d8+2.
    pub rolagem: Option<&'a str>,
}

/// Os dados que caem, e o que se soma a eles.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Expressao {
    pub dados: Vec<Jogada>,
    pub modificador: i64,
}

/// Por que a expressao nao serve. Os nomes sao os do TS (`ErroDaExpressao`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Erro {
    Vazia,
    Sintaxe,
    SemDado,
    DadoForaDaSoma,
    Faces,
    MuitosDados,
    DivisaoPorZero,
    ModificadorGrande,
}

impl Erro {
    /// O nome com que o TS o chama.
    #[cfg(test)]
    fn nome(self) -> &'static str {
        match self {
            Erro::Vazia => "vazia",
            Erro::Sintaxe => "sintaxe",
            Erro::SemDado => "sem-dado",
            Erro::DadoForaDaSoma => "dado-fora-da-soma",
            Erro::Faces => "faces",
            Erro::MuitosDados => "muitos-dados",
            Erro::DivisaoPorZero => "divisao-por-zero",
            Erro::ModificadorGrande => "modificador-grande",
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum Operador {
    Mais,
    Menos,
    Vezes,
    Dividido,
}

#[derive(Debug, Clone, Copy)]
enum Simbolo {
    Numero(f64),
    Dado {
        quantidade: f64,
        faces: f64,
        manter: Option<Manter>,
    },
    Operador(Operador),
    Abre,
    Fecha,
}

#[derive(Debug)]
enum No {
    Numero(f64),
    Dado {
        quantidade: f64,
        faces: f64,
        manter: Option<Manter>,
    },
    Negativo(Box<No>),
    Conta(Operador, Box<No>, Box<No>),
}

/// Le uma expressao como `1d20+5`, `2d4` ou `(3+1)*2+1d6`.
///
/// Os dados se SOMAM, e o resto e conta: `+ - * /` com a precedencia de
/// sempre, e parenteses. A divisao arredonda para baixo. `×`, `÷` e `−` valem
/// como `*`, `/` e `-`.
pub fn ler(texto: &str) -> Result<Expressao, Erro> {
    ler_com(texto, &[])
}

/// `ler`, com a sigla de cada atributo valendo o numero dele: como parcela
/// (`1d20+FOR`) e como quantidade de dados (`AGId20>+5`). O atributo que E um
/// dado entra como a expressao dele. Espelha `lerExpressaoDeRolagem` com
/// `atributos`.
pub fn ler_com(texto: &str, atributos: &[AtributoDaConta]) -> Result<Expressao, Erro> {
    if texto.trim().is_empty() {
        return Err(Erro::Vazia);
    }

    let simbolos = simbolos_de(texto, &siglas_da_conta(atributos))?;
    let mut leitor = Leitor {
        simbolos: &simbolos,
        posicao: 0,
    };
    let arvore = leitor.soma()?;
    if leitor.posicao < simbolos.len() {
        return Err(Erro::Sintaxe);
    }

    let mut dados = Vec::new();
    let mut modificador = 0.0;
    somar(&arvore, 1.0, &mut dados, &mut modificador)?;

    if dados.is_empty() {
        return Err(Erro::SemDado);
    }
    let total: u32 = dados.iter().map(|jogada: &Jogada| jogada.quantidade).sum();
    if total > MAX_DADOS {
        return Err(Erro::MuitosDados);
    }
    // `!(<=)` e nao `>`: um NaN tambem sai por aqui, e nao vira modificador.
    if !(modificador.abs() <= MAX_MODIFICADOR) {
        return Err(Erro::ModificadorGrande);
    }

    Ok(Expressao {
        dados,
        modificador: modificador as i64,
    })
}

/// Espalha a arvore numa soma de termos com sinal. Dado so entra com sinal
/// positivo e direto na soma; dentro de conta, ou negativo, e recusado.
fn somar(no: &No, sinal: f64, dados: &mut Vec<Jogada>, modificador: &mut f64) -> Result<(), Erro> {
    match no {
        No::Conta(Operador::Mais, a, b) => {
            somar(a, sinal, dados, modificador)?;
            somar(b, sinal, dados, modificador)
        }
        No::Conta(Operador::Menos, a, b) => {
            somar(a, sinal, dados, modificador)?;
            somar(b, -sinal, dados, modificador)
        }
        No::Negativo(de) => somar(de, -sinal, dados, modificador),
        No::Dado {
            quantidade,
            faces,
            manter,
        } => {
            if sinal < 0.0 {
                return Err(Erro::DadoForaDaSoma);
            }
            dados.push(jogada_de(*quantidade, *faces, *manter)?);
            Ok(())
        }
        outro => {
            *modificador += sinal * avaliar(outro)?;
            Ok(())
        }
    }
}

fn jogada_de(quantidade: f64, faces: f64, manter: Option<Manter>) -> Result<Jogada, Erro> {
    let faces = FACES
        .into_iter()
        .find(|&f| f64::from(f) == faces)
        .ok_or(Erro::Faces)?;
    if quantidade < 1.0 {
        return Err(Erro::Sintaxe);
    }
    if quantidade > f64::from(MAX_DADOS) {
        return Err(Erro::MuitosDados);
    }

    // Num dado so, o maior e o menor sao ele: a leitura e a mesma de `1d20`.
    Ok(Jogada {
        quantidade: quantidade as u32,
        faces,
        manter: manter.filter(|_| quantidade > 1.0),
    })
}

/// A conta de um pedaco sem dado. Dado aqui dentro e o que a soma nao aceita.
fn avaliar(no: &No) -> Result<f64, Erro> {
    match no {
        No::Numero(valor) => Ok(*valor),
        No::Dado { .. } => Err(Erro::DadoForaDaSoma),
        No::Negativo(de) => Ok(-avaliar(de)?),
        No::Conta(operador, a, b) => {
            let a = avaliar(a)?;
            let b = avaliar(b)?;
            match operador {
                Operador::Mais => Ok(a + b),
                Operador::Menos => Ok(a - b),
                Operador::Vezes => Ok(a * b),
                Operador::Dividido if b == 0.0 => Err(Erro::DivisaoPorZero),
                Operador::Dividido => Ok((a / b).floor()),
            }
        }
    }
}

/// Uma sigla que a conta procura, ja em maiuscula, e o que ela vale.
struct Sigla<'a> {
    letras: Vec<char>,
    valor: i64,
    rolagem: Option<&'a str>,
}

/// As siglas que a conta procura, da mais comprida para a mais curta: com AG e
/// AGI na ficha, "AGI" e a AGI, e nao a AG seguida de um I. Espelha
/// `siglasDaConta`.
fn siglas_da_conta<'a>(atributos: &[AtributoDaConta<'a>]) -> Vec<Sigla<'a>> {
    let mut siglas: Vec<Sigla> = atributos
        .iter()
        .filter(|atributo| !atributo.sigla.trim().is_empty())
        .map(|atributo| Sigla {
            letras: atributo.sigla.trim().to_uppercase().chars().collect(),
            valor: atributo.valor,
            // A `rolagem` vazia e numero, como no TS, onde `""` e falso.
            rolagem: atributo.rolagem.filter(|rolagem| !rolagem.is_empty()),
        })
        .collect();
    // Estavel, como o `sort` do JS: entre as do mesmo tamanho, a ordem da ficha.
    siglas.sort_by(|a, b| b.letras.len().cmp(&a.letras.len()));
    siglas
}

/// A sigla que comeca em `i`, sem diferenciar maiuscula: o livro escreve FOR,
/// e quem digita depressa escreve for.
fn sigla_em<'s, 'a>(entrada: &[char], i: usize, siglas: &'s [Sigla<'a>]) -> Option<&'s Sigla<'a>> {
    siglas.iter().find(|sigla| {
        let fim = i + sigla.letras.len();
        fim <= entrada.len()
            && entrada[i..fim]
                .iter()
                .collect::<String>()
                .to_uppercase()
                .chars()
                .eq(sigla.letras.iter().copied())
    })
}

fn simbolos_de(texto: &str, siglas: &[Sigla]) -> Result<Vec<Simbolo>, Erro> {
    let entrada: Vec<char> = texto
        .chars()
        .map(|letra| match letra {
            '×' => '*',
            '÷' => '/',
            '−' => '-',
            outra => outra,
        })
        .collect();
    let mut simbolos = Vec::new();
    let mut i = 0;

    while i < entrada.len() {
        let letra = entrada[i];

        if letra.is_whitespace() {
            i += 1;
            continue;
        }
        let operador = match letra {
            '+' => Some(Operador::Mais),
            '-' => Some(Operador::Menos),
            '*' => Some(Operador::Vezes),
            '/' => Some(Operador::Dividido),
            _ => None,
        };
        if let Some(operador) = operador {
            simbolos.push(Simbolo::Operador(operador));
            i += 1;
            continue;
        }
        if letra == '(' || letra == ')' {
            simbolos.push(if letra == '(' {
                Simbolo::Abre
            } else {
                Simbolo::Fecha
            });
            i += 1;
            continue;
        }

        // Numero, ou dado: `20`, `d20`, `2d6`, `2 d 6`. O mesmo que a regex do
        // TS, `^(\d*)\s*([dD])\s*(\d+)|^(\d+)`, tentando o dado primeiro.
        let lido = dado_em(&entrada, i)
            .or_else(|| numero_em(&entrada, i).map(|(valor, fim)| (Simbolo::Numero(valor), fim)));
        if let Some((simbolo, fim)) = lido {
            simbolos.push(simbolo);
            i = fim;
            continue;
        }

        // A sigla de um atributo, DEPOIS do dado: onde as duas leituras
        // servem -- uma sigla "D" diante de `d20` --, o dado vence.
        let sigla = sigla_em(&entrada, i, siglas).ok_or(Erro::Sintaxe)?;
        i += sigla.letras.len();

        // Colada no dado, ela e a QUANTIDADE: `AGId20>` sao tantos d20 quanto
        // a AGI. Zero ou menos nao rola -- `jogada_de` recusa.
        let dado = faces_em(&entrada, i);

        // O atributo que E um dado entra como a expressao dele entre
        // parenteses, e a expressao gravada nao le sigla. Dado nao conta
        // dados: `AGId20` com a AGI d8 nao diz nada.
        if let Some(rolagem) = sigla.rolagem {
            if dado.is_some() {
                return Err(Erro::Sintaxe);
            }
            simbolos.push(Simbolo::Abre);
            simbolos.extend(simbolos_de(rolagem, &[])?);
            simbolos.push(Simbolo::Fecha);
            continue;
        }

        match dado {
            Some((faces, manter, fim)) => {
                simbolos.push(Simbolo::Dado {
                    quantidade: sigla.valor as f64,
                    faces,
                    manter,
                });
                i = fim;
            }
            None => simbolos.push(Simbolo::Numero(sigla.valor as f64)),
        }
    }

    Ok(simbolos)
}

/// As contas escritas entre chaves num texto da ficha, sem as chaves: "Dano:
/// {2d10+50} Sangue" da `2d10+50`. Espelha `ENTRE_CHAVES`, em
/// `rolagens-no-texto.ts`: numa linha so, sem chave dentro, e do tamanho de
/// uma `rolagem` de detalhe. Se a conta LE e outra pergunta -- ver `ler_com`.
pub fn entre_chaves(texto: &str) -> Vec<&str> {
    let mut contas = Vec::new();
    let mut resto = texto;

    while let Some(abre) = resto.find('{') {
        let depois = &resto[abre + 1..];
        match depois.find(['{', '}', '\n']) {
            Some(fim)
                if depois[fim..].starts_with('}')
                    && fim > 0
                    && depois[..fim].chars().count() <= MAX_ROLAGEM =>
            {
                contas.push(&depois[..fim]);
                resto = &depois[fim + 1..];
            }
            // Esta chave nao fecha uma conta; a regex tentaria a proxima.
            _ => resto = depois,
        }
    }

    contas
}

/// Os digitos a partir de `i`, como numero, e onde acabaram. Nenhum = `None`.
fn numero_em(entrada: &[char], i: usize) -> Option<(f64, usize)> {
    let fim = i + entrada[i..]
        .iter()
        .take_while(|letra| letra.is_ascii_digit())
        .count();
    if fim == i {
        return None;
    }
    let texto: String = entrada[i..fim].iter().collect();
    texto.parse::<f64>().ok().map(|valor| (valor, fim))
}

/// `2d6`, `d20` ou `2 D 10` a partir de `i`.
fn dado_em(entrada: &[char], i: usize) -> Option<(Simbolo, usize)> {
    let (quantidade, j) = match numero_em(entrada, i) {
        Some((valor, fim)) => (valor, fim),
        None => (1.0, i),
    };
    let (faces, manter, fim) = faces_em(entrada, j)?;

    Some((
        Simbolo::Dado {
            quantidade,
            faces,
            manter,
        },
        fim,
    ))
}

/// O `d20` de um dado, a partir de `j`: as faces, o que fica do termo, e onde
/// acabou. E o que vem depois da quantidade -- o numero em `2d6`, a sigla em
/// `AGId20>`. O mesmo que `^\s*[dD]\s*(\d+)(?:\s*([<>]))?` no TS.
fn faces_em(entrada: &[char], mut j: usize) -> Option<(f64, Option<Manter>, usize)> {
    while j < entrada.len() && entrada[j].is_whitespace() {
        j += 1;
    }
    if !matches!(entrada.get(j), Some('d' | 'D')) {
        return None;
    }
    j += 1;
    while j < entrada.len() && entrada[j].is_whitespace() {
        j += 1;
    }
    let (faces, mut fim) = numero_em(entrada, j)?;

    // O que fica do termo, logo depois: `6d20>`, `2d20 <`.
    let mut k = fim;
    while k < entrada.len() && entrada[k].is_whitespace() {
        k += 1;
    }
    let manter = match entrada.get(k) {
        Some('>') => Some(Manter::Maior),
        Some('<') => Some(Manter::Menor),
        _ => None,
    };
    if manter.is_some() {
        fim = k + 1;
    }

    Some((faces, manter, fim))
}

/// Descida recursiva: soma > produto > unario > atomo.
struct Leitor<'a> {
    simbolos: &'a [Simbolo],
    posicao: usize,
}

impl Leitor<'_> {
    fn olhar(&self) -> Option<Simbolo> {
        self.simbolos.get(self.posicao).copied()
    }

    fn soma(&mut self) -> Result<No, Erro> {
        let mut no = self.produto()?;
        while let Some(Simbolo::Operador(operador @ (Operador::Mais | Operador::Menos))) =
            self.olhar()
        {
            self.posicao += 1;
            no = No::Conta(operador, Box::new(no), Box::new(self.produto()?));
        }
        Ok(no)
    }

    fn produto(&mut self) -> Result<No, Erro> {
        let mut no = self.unario()?;
        while let Some(Simbolo::Operador(operador @ (Operador::Vezes | Operador::Dividido))) =
            self.olhar()
        {
            self.posicao += 1;
            no = No::Conta(operador, Box::new(no), Box::new(self.unario()?));
        }
        Ok(no)
    }

    fn unario(&mut self) -> Result<No, Erro> {
        match self.olhar() {
            Some(Simbolo::Operador(Operador::Mais)) => {
                self.posicao += 1;
                self.unario()
            }
            Some(Simbolo::Operador(Operador::Menos)) => {
                self.posicao += 1;
                Ok(No::Negativo(Box::new(self.unario()?)))
            }
            _ => self.atomo(),
        }
    }

    fn atomo(&mut self) -> Result<No, Erro> {
        let simbolo = self.olhar().ok_or(Erro::Sintaxe)?;
        self.posicao += 1;

        match simbolo {
            Simbolo::Numero(valor) => Ok(No::Numero(valor)),
            Simbolo::Dado {
                quantidade,
                faces,
                manter,
            } => Ok(No::Dado {
                quantidade,
                faces,
                manter,
            }),
            Simbolo::Abre => {
                let dentro = self.soma()?;
                if !matches!(self.olhar(), Some(Simbolo::Fecha)) {
                    return Err(Erro::Sintaxe);
                }
                self.posicao += 1;
                Ok(dentro)
            }
            Simbolo::Operador(_) | Simbolo::Fecha => Err(Erro::Sintaxe),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    /// Os mesmos casos do vitest. Mudar um lado sem o outro quebra aqui.
    const CASOS: &str = include_str!("../../../src/lib/mestre/expressao-de-rolagem.casos.json");

    /// A expressao que o caso espera: `dados` como `[quantidade, faces]`, e o
    /// terceiro, quando ha, e o que fica do termo -- `>` o maior, `<` o menor.
    fn esperada(caso: &Value) -> Expressao {
        Expressao {
            dados: caso["dados"]
                .as_array()
                .unwrap()
                .iter()
                .map(|par| Jogada {
                    quantidade: par[0].as_u64().unwrap() as u32,
                    faces: par[1].as_u64().unwrap() as u32,
                    manter: par.get(2).and_then(Value::as_str).map(|sinal| {
                        if sinal == ">" {
                            Manter::Maior
                        } else {
                            Manter::Menor
                        }
                    }),
                })
                .collect(),
            modificador: caso["modificador"].as_i64().unwrap(),
        }
    }

    #[test]
    fn aceita_o_que_o_ts_aceita() {
        let casos: Value = serde_json::from_str(CASOS).unwrap();
        for caso in casos["aceitas"].as_array().unwrap() {
            let texto = caso["texto"].as_str().unwrap();
            assert_eq!(ler(texto), Ok(esperada(caso)), "{texto:?}");
        }
    }

    #[test]
    fn recusa_o_que_o_ts_recusa() {
        let casos: Value = serde_json::from_str(CASOS).unwrap();
        for caso in casos["recusadas"].as_array().unwrap() {
            let texto = caso["texto"].as_str().unwrap();
            let erro = ler(texto).map(|_| ()).map_err(Erro::nome);
            assert_eq!(erro, Err(caso["erro"].as_str().unwrap()), "{texto:?}");
        }
    }

    #[test]
    fn le_as_siglas_como_o_ts() {
        let casos: Value = serde_json::from_str(CASOS).unwrap();
        let casos = &casos["comAtributos"];
        let ficha: Vec<AtributoDaConta> = casos["ficha"]
            .as_array()
            .unwrap()
            .iter()
            .map(|atributo| AtributoDaConta {
                sigla: atributo["sigla"].as_str().unwrap(),
                valor: atributo["valor"].as_i64().unwrap(),
                rolagem: atributo.get("rolagem").and_then(Value::as_str),
            })
            .collect();

        for caso in casos["aceitas"].as_array().unwrap() {
            let texto = caso["texto"].as_str().unwrap();
            assert_eq!(ler_com(texto, &ficha), Ok(esperada(caso)), "{texto:?}");
        }
        for caso in casos["recusadas"].as_array().unwrap() {
            let texto = caso["texto"].as_str().unwrap();
            let erro = ler_com(texto, &ficha).map(|_| ()).map_err(Erro::nome);
            assert_eq!(erro, Err(caso["erro"].as_str().unwrap()), "{texto:?}");
        }
        // Sem a ficha, a sigla e letra solta, como sempre foi.
        assert_eq!(ler("1d20+FOR"), Err(Erro::Sintaxe));
    }

    #[test]
    fn acha_as_contas_entre_chaves_como_a_regex_do_ts() {
        assert_eq!(entre_chaves("Soco com mao livre {1d4}"), ["1d4"]);
        assert_eq!(
            entre_chaves("Dano: {2d10+50} Sangue, e { AGId20>+5 }"),
            ["2d10+50", " AGId20>+5 "]
        );
        // Chave vazia, aberta numa linha e fechada na outra, ou com chave
        // dentro: nao e conta, e a busca segue para a proxima.
        assert_eq!(entre_chaves("{} {1d6\n} {a{1d8}"), ["1d8"]);
        assert!(entre_chaves(&format!("{{{}}}", "1".repeat(MAX_ROLAGEM + 1))).is_empty());
        assert_eq!(entre_chaves(&format!("{{{}}}", "1".repeat(MAX_ROLAGEM))).len(), 1);
        assert!(entre_chaves("sem conta nenhuma").is_empty());
    }

    #[test]
    fn descarta_todos_menos_o_que_fica() {
        assert_eq!(descartados(20, &[3, 17, 9], Some(Manter::Maior)), [true, false, true]);
        assert_eq!(descartados(20, &[3, 17, 9], Some(Manter::Menor)), [false, true, true]);
        // No empate, fica o primeiro.
        assert_eq!(descartados(20, &[17, 17], Some(Manter::Maior)), [false, true]);
        // O zero do d10 vale dez: e o maior.
        assert_eq!(descartados(10, &[9, 0], Some(Manter::Maior)), [true, false]);
        // Sem regra, ou um dado so, nenhum sai.
        assert_eq!(descartados(20, &[3, 17], None), [false, false]);
        assert_eq!(descartados(20, &[3], Some(Manter::Maior)), [false]);
    }

    #[test]
    fn nan_nao_vira_modificador() {
        // 1e308 * 10 e infinito, e infinito menos infinito e NaN.
        let grande = format!("1{}", "0".repeat(308));
        assert_eq!(
            ler(&format!("1d20+{grande}*10-{grande}*10")),
            Err(Erro::ModificadorGrande)
        );
    }
}
