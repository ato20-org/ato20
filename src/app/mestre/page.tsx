import { Suspense } from "react";

import { Mestre } from "@/components/mestre/mestre";

export default function MestrePage() {
  // `useSearchParams` exige fronteira de Suspense numa página estática.
  return (
    <Suspense fallback={null}>
      <Mestre />
    </Suspense>
  );
}
