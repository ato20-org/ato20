import { ViewerStage } from "@/components/playground/viewer-stage";

/**
 * A porta que pedia o código da mesa saiu junto com o Supabase.
 *
 * Enquanto o transporte é o `BroadcastChannel`, o Assistir só alcança a cena
 * sendo outra aba da máquina do Operador — não há mesa remota a encontrar, e
 * então não há código a digitar. A porta volta com o SSE do daemon, e aí o
 * código passa a valer de novo: é ele que solta a TV desta máquina.
 *
 * Sem `Suspense`: era exigência do `useSearchParams`, que saiu com a porta.
 */
export default function AssistirPage() {
  return <ViewerStage />;
}
