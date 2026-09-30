import type { Metadata } from "next";
import localFont from "next/font/local";
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

/*
 * A letra de mão do postit.
 *
 * Os arquivos moram no repositório, em `fontes/kalam`, e não num pacote npm
 * como o `geist`: pacote novo muda o `pnpm-lock.yaml`, e lockfile mudado pede
 * `empacotar/flatpak/gerar-fontes.sh` antes da próxima publicação no Flathub.
 * São dois arquivos de 22 KB; o resultado offline é o mesmo.
 *
 * Só o recorte latino, o do Fontsource: cobre U+0000-00FF, onde moram todos
 * os acentos do português, e as aspas e reticências de U+2000-206F. O resto
 * cai na fonte de reserva. Dois pesos porque o postit usa dois: o corpo e o
 * `**negrito**` e os títulos (`font-semibold` e `font-bold` pegam o 700).
 *
 * Quem consome `--font-kalam` é o `--font-postit` do `@theme`.
 */
const Kalam = localFont({
  src: [
    { path: "./fontes/kalam/kalam-latin-400-normal.woff2", weight: "400" },
    { path: "./fontes/kalam/kalam-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-kalam",
});

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
      className={`dark ${GeistSans.variable} ${GeistMono.variable} ${Kalam.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
