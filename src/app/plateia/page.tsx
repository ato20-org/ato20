import { Suspense } from "react";

import { PlateiaShell } from "@/components/plateia/plateia-shell";

export default function PlateiaPage() {
  // `useSearchParams` exige fronteira de Suspense numa página estática.
  return (
    <Suspense fallback={null}>
      <PlateiaShell />
    </Suspense>
  );
}
