import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { WindowChrome } from "@/components/desktop/window-chrome";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

// `--font-sans` é o nome que `globals.css` consome no @theme.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ATO20",
  description: "Mesa virtual para mestrar RPG: cenas, imagens, áreas escondidas e trilha.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Tema travado no escuro: a ferramenta roda em mesa de jogo com luz baixa e
  // projetada em TV, onde fundo claro ofusca.
  return (
    <html
      lang="pt-BR"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {/* No layout, e não na página do Operador: ela é a única que roda no
            aplicativo hoje, mas a barra pertence à JANELA e não a uma tela. No
            navegador o componente não desenha nada — não há janela a
            controlar. */}
        <WindowChrome />
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
