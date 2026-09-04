import { Suspense } from "react";

import { Operator } from "@/components/operator/operator";

export default function OperadorPage() {
  // `useSearchParams` exige fronteira de Suspense numa página estática.
  return (
    <Suspense fallback={null}>
      <Operator />
    </Suspense>
  );
}
