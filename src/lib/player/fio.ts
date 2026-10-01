"use client";

import { authorized, fail } from "@/lib/player/session";
import type { LinhaDoFio, RegistroDoFio } from "@/types/fio";

/**
 * O fio da campanha, do celular.
 *
 * Escrever é um `POST` como os outros de `/eu`. Ler é o detalhe: o fio tem
 * sussurro, então a leitura é do JOGADOR (token) e não da mesa (código) — e o
 * `EventSource` não manda cabeçalho. As saídas seriam o token na URL, onde ele
 * vaza para histórico e log (a mesma recusa de `attachmentUrl`), ou um cookie,
 * que traria CSRF para uma porta que não tem. Ficou o `fetch` lendo o corpo
 * aos pedaços, com a reconexão escrita aqui.
 */

/** Escreve no fio. `soParaOMestre` é o sussurro do jogador. */
export async function falarNoFio(
  codigo: string,
  texto: string,
  soParaOMestre: boolean,
): Promise<LinhaDoFio> {
  const response = await fetch("/eu/mensagens", {
    method: "POST",
    headers: { "content-type": "application/json", ...authorized(codigo) },
    body: JSON.stringify({ texto, soParaOMestre }),
  });

  if (!response.ok) throw await fail(response, "A mesa não recebeu a mensagem.");

  return (await response.json()) as LinhaDoFio;
}

/** A espera antes de reconectar: dobra a cada queda, até este teto. */
const ESPERA_MAXIMA_MS = 15_000;
const ESPERA_INICIAL_MS = 1_000;

/**
 * Assina o fio e entrega cada registro. Devolve a função que desliga.
 *
 * Reconecta sozinho, como o `EventSource` faria, e avisa `aoCair` antes de
 * cada nova tentativa — quem assina sabe então que o que vier até o próximo
 * `pronto` é replay. Desiste no 401: credencial que não vale mais é o Mestre
 * tendo tirado o jogador da mesa, e insistir não a traz de volta.
 */
export function assinarFio(
  codigo: string,
  aoRegistro: (registro: RegistroDoFio) => void,
  aoCair: () => void,
): () => void {
  const controle = new AbortController();
  let espera = ESPERA_INICIAL_MS;

  async function ler(): Promise<"caiu" | "recusado"> {
    const response = await fetch("/eu/mensagens", {
      headers: { accept: "text/event-stream", ...authorized(codigo) },
      signal: controle.signal,
    });

    if (response.status === 401) return "recusado";
    if (!response.ok || !response.body) return "caiu";

    const leitor = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let resto = "";

    for (;;) {
      const { done, value } = await leitor.read();
      if (done) return "caiu";

      resto += value;

      // Um evento SSE termina numa linha em branco. O que sobra depois do
      // último separador é o começo do próximo, e espera o pedaço seguinte.
      const eventos = resto.split("\n\n");
      resto = eventos.pop() ?? "";

      for (const evento of eventos) {
        const dados = evento
          .split("\n")
          .filter((linha) => linha.startsWith("data:"))
          .map((linha) => linha.slice(5).replace(/^ /, ""))
          .join("\n");

        // O keep-alive do daemon é um comentário (`:`), sem `data`.
        if (!dados) continue;

        try {
          const registro = JSON.parse(dados) as RegistroDoFio;
          // Conectou de verdade: a próxima queda volta a esperar pouco.
          if (registro.tipo === "pronto") espera = ESPERA_INICIAL_MS;
          aoRegistro(registro);
        } catch {
          // Evento truncado. A reconexão traz o que faltou.
        }
      }
    }
  }

  void (async () => {
    while (!controle.signal.aborted) {
      let fim: "caiu" | "recusado" = "caiu";

      try {
        fim = await ler();
      } catch {
        // Rede caiu, ou foi o `abort` de quem desligou.
      }

      if (controle.signal.aborted || fim === "recusado") return;

      aoCair();

      await new Promise((resolver) => setTimeout(resolver, espera));
      espera = Math.min(espera * 2, ESPERA_MAXIMA_MS);
    }
  })();

  return () => controle.abort();
}
