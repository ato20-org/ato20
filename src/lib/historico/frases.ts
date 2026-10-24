import { nomeDoAutor, textoDaRolagem } from "@/lib/fio";
import type { Acontecimento, Entrada } from "@/lib/historico/linha-do-tempo";
import { t } from "@/lib/i18n/mestre";

/**
 * A frase de cada acontecimento, como a linha do tempo a escreve.
 *
 * Aqui, e não no componente, porque a busca procura NELA: quem digita "porta"
 * tem de achar a linha que diz porta, no idioma em que ela aparece.
 */
export function fraseDe(entrada: Entrada): string {
  if (entrada.tipo === "fio") {
    const { linha } = entrada;
    const quem = nomeDoAutor(linha.autor);
    const o = linha.rolagem ? textoDaRolagem(linha.rolagem) : (linha.texto ?? "");

    return `${quem}: ${o}`;
  }

  return fraseDoAcontecimento(entrada.registro);
}

export function fraseDoAcontecimento(registro: Acontecimento): string {
  const h = t.historico;

  switch (registro.tipo) {
    case "marco":
      return registro.texto;

    case "cena":
      return registro.cena ? h.cenaNoAr(registro.cena) : h.semCena;

    case "combate":
      switch (registro.fase) {
        case "inicio":
          return h.combateComecou(registro.ordem);
        case "rodada":
          return h.rodada(registro.rodada);
        case "fim":
          return h.combateAcabou(registro.rodadas);
      }
      break;

    case "medidor":
      return h.medidor(
        registro.personagem,
        registro.medidor,
        registro.antes,
        registro.depois,
        registro.maximo,
      );

    case "condicao":
      return registro.ligada
        ? h.condicaoEntrou(registro.condicao, registro.nome)
        : h.condicaoSaiu(registro.condicao, registro.nome);

    case "item":
      switch (registro.acao) {
        case "criado":
          return registro.autor === "jogador"
            ? h.itemCriadoPeloJogador(registro.personagem, registro.item)
            : h.itemCriado(registro.item, registro.personagem);
        case "dado":
          return h.itemDado(registro.personagem, registro.item, registro.quantidade ?? 1);
        case "quantidade":
          return h.itemQuantidade(
            registro.item,
            registro.personagem,
            registro.antes ?? 0,
            registro.depois ?? 0,
          );
        case "passado":
          return h.itemPassado(registro.item, registro.de ?? "", registro.personagem);
        case "tirado":
          return h.itemTirado(registro.item, registro.personagem);
        case "no-mapa":
          return h.itemNoMapa(registro.item, registro.cena);
        case "fora-do-mapa":
          return h.itemForaDoMapa(registro.item, registro.cena);
      }
      break;

    case "disparo":
      if (registro.de && registro.em) return h.disparoDeEm(registro.de, registro.efeito, registro.em);
      if (registro.de) return h.disparoDe(registro.de, registro.efeito);
      if (registro.em) return h.disparoEm(registro.efeito, registro.em);
      return h.disparo(registro.efeito, registro.cena);

    case "mostrado":
      switch (registro.o) {
        case "evidencia":
          return registro.nome ? h.evidencia(registro.nome) : h.evidenciaSemNome;
        case "item":
          return h.itemMostrado(registro.nome ?? "");
        case "retrato":
          return h.retrato(registro.nome ?? "");
        case "nevoa-revelada":
          return h.nevoaRevelada(registro.cena ?? "");
        case "nevoa-escondida":
          return h.nevoaEscondida(registro.cena ?? "");
        case "porta-aberta":
          return h.portaAberta(registro.cena ?? "");
        case "porta-fechada":
          return h.portaFechada(registro.cena ?? "");
      }
  }

  return "";
}
