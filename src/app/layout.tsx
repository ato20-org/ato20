import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import "./globals.css";

/*
 * As fontes vêm do pacote `geist`, e não de `next/font/google`.
 *
 * `next/font/google` BAIXA o arquivo da fonte durante o `next build`. Isso é
 * invisível aqui — a máquina de quem desenvolve tem rede — e fatal em duas
 * situações que este projeto tem: o build do Flatpak roda numa sandbox sem
 * rede nenhuma, e um build sem internet numa máquina qualquer falha por um
 * motivo que não tem nada a ver com o código.
 *
 * O pacote traz os mesmos arquivos dentro do `node_modules`, que já está
 * instalado quando o build começa. As variáveis são `--font-geist-sans` e
 * `--font-geist-mono`, fixadas pelo pacote; quem as consome é o `@theme` do
 * `globals.css`.
 */

export const metadata: Metadata = {
  title: "ATO20",
  description:
    "Mesa virtual para mestrar RPG: cenas, imagens, áreas escondidas e trilha.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Tema travado no escuro: a ferramenta roda em mesa de jogo com luz baixa e
  // projetada em TV, onde fundo claro ofusca.
  return (
    <html
      lang="pt-BR"
      className={`dark ${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
