import { PlateiaShell } from "@/components/plateia/plateia-shell";

/**
 * Sem `Suspense`: era exigência do `useSearchParams`, que existia para a porta
 * do código da mesa. A porta volta com o daemon.
 */
export default function PlateiaPage() {
  return <PlateiaShell />;
}
