import {
  CHAVE_DO_JOGADOR,
  PARAMETRO_DE_IDIOMA,
  idioma,
  normalizar,
  telaDe,
} from "@/lib/i18n/idioma";

/**
 * O idioma que o Mestre publicou no quadro chegou a uma tela que só recebe.
 *
 * A janela do espectador obedece sempre: ela é a mesa do mestre na parede. O
 * celular obedece enquanto o jogador não escolheu o dele -- escolhido, o
 * celular fica onde o jogador o pôs, e a troca do mestre não o alcança.
 *
 * Obedecer é recarregar com o idioma na URL, que é o mesmo caminho do link do
 * convite: o `code` continua no endereço, e a porta entra sozinha de novo.
 * Recarga e não troca no lugar pela regra do `idioma.ts`: o texto é constante
 * enquanto a tela vive.
 */
export function seguirIdiomaDaMesa(daMesa: unknown): void {
  if (typeof window === "undefined") return;

  const publicado = normalizar(daMesa);
  if (!publicado || publicado === idioma) return;

  const tela = telaDe(location.pathname);
  if (tela === "mestre") return;
  if (tela === "jogador" && jogadorEscolheu()) return;

  const url = new URL(location.href);
  url.searchParams.set(PARAMETRO_DE_IDIOMA, publicado);
  location.replace(url);
}

function jogadorEscolheu(): boolean {
  try {
    return normalizar(localStorage.getItem(CHAVE_DO_JOGADOR)) !== null;
  } catch {
    return false;
  }
}
