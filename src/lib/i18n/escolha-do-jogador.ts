import { CHAVE_DO_JOGADOR, type Idioma } from "@/lib/i18n/idioma";

/**
 * O jogador escolheu o idioma do celular dele.
 *
 * Gravado no aparelho e recarregado: a escolha vence a URL do convite e o
 * idioma que o Mestre publica, e o `code` que segue no endereço faz a porta
 * entrar sozinha de novo. Ver `decidir` em `idioma.ts`.
 */
export function escolherIdiomaDoJogador(escolha: Idioma): void {
  try {
    localStorage.setItem(CHAVE_DO_JOGADOR, escolha);
  } catch {
    // Sem armazenamento a escolha não sobrevive à recarga. Recarregar mesmo
    // assim seria trocar nada por uma tela piscando.
    return;
  }

  location.reload();
}
