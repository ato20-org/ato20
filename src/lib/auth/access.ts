/**
 * Portão de acesso da instância.
 *
 * Um segredo único e compartilhado, não contas de usuário: quem tem o segredo
 * tem acesso total. É o modelo certo para uma instância pessoal, e o modelo
 * errado para qualquer coisa multiusuário.
 */

export const ACCESS_COOKIE = "ato20_access";

/** Um ano. O segredo é longo e não expira sozinho; trocar é redeploy. */
export const ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Rotas que exigem o segredo. Tudo o mais é público. */
export const PROTECTED_PREFIXES = ["/mesa", "/operador", "/assistir", "/plateia"] as const;

/**
 * Comparação de tempo constante.
 *
 * O `===` de string sai no primeiro byte diferente, e o tempo de resposta
 * revelaria quantos caracteres iniciais estão certos. A saída antecipada por
 * tamanho é aceitável: o tamanho do segredo não é o segredo.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;

  let diff = 0;
  for (let index = 0; index < provided.length; index += 1) {
    diff |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return diff === 0;
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
