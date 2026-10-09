import type { SVGProps } from "react";

/**
 * Um d20 em traço, do tamanho e do jeito dos ícones do lucide -- que não tem
 * um. É o ícone do "rola": o liga-desliga do molde e o botão de escrever a
 * rolagem na ficha. O dado sombreado, igual ao da mesa, é o `DadoEstatico`:
 * aquele mostra a expressão; este diz que ela existe.
 */
export function IconeD20(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M12 2 21 7v10l-9 5-9-5V7z" />
      <path d="M12 7l5 8.5H7z" />
      <path d="M3 7l4 8.5M21 7l-4 8.5M12 2v5M12 22l-5-6.5M12 22l5-6.5" />
    </svg>
  );
}
