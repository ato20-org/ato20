"use client";

const STORAGE_KEY = "ato20:device";

/**
 * Id deste aparelho.
 *
 * Identifica a MAQUINA, não a pessoa: as duas máquinas do mestre usam a mesma
 * conta, e a pergunta que este id responde é "quem já tem cópia local deste
 * arquivo?" — que o `auth.uid()` não distingue.
 *
 * Vive no `localStorage`, então limpar os dados do site cria um aparelho novo.
 * A consequência é uma marca de espelho a mais, não perda de arquivo.
 */
export function deviceId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;

    const fresh = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, fresh);

    return fresh;
  } catch {
    // Modo privado ou cota cheia: um id efêmero ainda serve para a sessão.
    return crypto.randomUUID();
  }
}
