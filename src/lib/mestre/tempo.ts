/**
 * `mm:ss`.
 *
 * Faixa de RPG não passa de uma hora, e `1:04:20` só ocuparia espaço numa
 * coluna que já é estreita. O que não é número vira `--:--`: a duração é 0 até
 * os metadados chegarem, e `0:00` ali seria uma mentira curta mas visível.
 */
export function mmss(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return "--:--";

  const total = Math.floor(segundos);
  const minutos = Math.floor(total / 60);

  return `${minutos}:${String(total % 60).padStart(2, "0")}`;
}
