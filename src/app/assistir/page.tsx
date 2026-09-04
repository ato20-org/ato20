import { Suspense } from "react";

import { ViewerShell } from "@/components/playground/viewer-shell";

export default function AssistirPage() {
  // `useSearchParams` exige fronteira de Suspense numa página estática.
  return (
    <Suspense fallback={null}>
      <ViewerShell />
    </Suspense>
  );
}
