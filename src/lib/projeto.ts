/**
 * Os endereços do ATO20 fora do aplicativo: o site, o código, o apoio e os
 * contatos.
 *
 * Num lugar só porque aparecem em vários -- a porta, o "O que mudou", o Sobre
 * das Configurações e o cartão do Discord --, e um endereço trocado numa cópia
 * e esquecido na outra só se descobre quando alguém clica. Os que abrem no
 * navegador precisam estar também no escopo do `opener`, em
 * `src-tauri/capabilities/default.json`.
 */

export const SITE_DO_ATO20 = "https://ato20.valbmig.com.br";
export const REPOSITORIO_DO_ATO20 = "https://github.com/ato20-org/ato20";
export const KOFI_DO_ATO20 = "https://ko-fi.com/valbmig";
export const INSTAGRAM_DO_ATO20 = "https://www.instagram.com/ato20.vtt/";
export const X_DO_AUTOR = "https://x.com/valbmig";
export const EMAIL_DO_ATO20 = "ato20.vtt@gmail.com";

/** O endereço como se lê: sem `https://`, sem `www.` e sem a barra do fim. */
export function enderecoCurto(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}
