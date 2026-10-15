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
    Dado { quantidade: f64, faces: f64 },
    Operador(Operador),
    Abre,
    Fecha,
}

#[derive(Debug)]
enum No {
    Numero(f64),
    Dado { quantidade: f64, faces: f64 },
    Negativo(Box<No>),
    Conta(Operador, Box<No>, Box<No>),
}

/// Le uma expressao como `1d20+5`, `2d4` ou `(3+1)*2+1d6`.
///
/// Os dados se SOMAM, e o resto e conta: `+ - * /` com a precedencia de
/// sempre, e parenteses. A divisao arredonda para baixo. `×`, `÷` e `−` valem
/// como `*`, `/` e `-`.
pub fn ler(texto: &str) -> Result<Expressao, Erro> {
    if texto.trim().is_empty() {
        return Err(Erro::Vazia);
    }

    let simbolos = simbolos_de(texto)?;
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
        No::Dado { quantidade, faces } => {
            if sinal < 0.0 {
                return Err(Erro::DadoForaDaSoma);
            }
            dados.push(jogada_de(*quantidade, *faces)?);
            Ok(())
        }
        outro => {
            *modificador += sinal * avaliar(outro)?;
            Ok(())
        }
    }
}

fn jogada_de(quantidade: f64, faces: f64) -> Result<Jogada, Erro> {
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

    Ok(Jogada {
        quantidade: quantidade as u32,
        faces,
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

fn simbolos_de(texto: &str) -> Result<Vec<Simbolo>, Erro> {
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
        let (simbolo, fim) = dado_em(&entrada, i)
            .or_else(|| numero_em(&entrada, i).map(|(valor, fim)| (Simbolo::Numero(valor), fim)))
            .ok_or(Erro::Sintaxe)?;
        simbolos.push(simbolo);
        i = fim;
    }

    Ok(simbolos)
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
    let (quantidade, mut j) = match numero_em(entrada, i) {
        Some((valor, fim)) => (valor, fim),
        None => (1.0, i),
    };
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
    let (faces, fim) = numero_em(entrada, j)?;

    Some((Simbolo::Dado { quantidade, faces }, fim))
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
            Simbolo::Dado { quantidade, faces } => Ok(No::Dado { quantidade, faces }),
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

    #[test]
    fn aceita_o_que_o_ts_aceita() {
        let casos: Value = serde_json::from_str(CASOS).unwrap();
        for caso in casos["aceitas"].as_array().unwrap() {
            let texto = caso["texto"].as_str().unwrap();
            let esperado = Expressao {
                dados: caso["dados"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|par| Jogada {
                        quantidade: par[0].as_u64().unwrap() as u32,
                        faces: par[1].as_u64().unwrap() as u32,
                    })
                    .collect(),
                modificador: caso["modificador"].as_i64().unwrap(),
            };
            assert_eq!(ler(texto), Ok(esperado), "{texto:?}");
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
    fn nan_nao_vira_modificador() {
        // 1e308 * 10 e infinito, e infinito menos infinito e NaN.
        let grande = format!("1{}", "0".repeat(308));
        assert_eq!(
            ler(&format!("1d20+{grande}*10-{grande}*10")),
            Err(Erro::ModificadorGrande)
        );
    }
}
