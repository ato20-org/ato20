import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Smartphone, Tv } from "lucide-react";

import logo from "@/assets/logo-white.png";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "ATO20",
  description: "Acompanhe a mesa: a TV ou o teu celular.",
};

/**
 * A porta de quem chegou pelo navegador.
 *
 * Só as duas telas de espectador. O Operador não está aqui de propósito: ele
 * precisa alcançar o disco, e só existe dentro do aplicativo — que abre direto
 * nele, sem passar por esta tela.
 *
 * Substituiu duas coisas: a landing que descrevia o projeto, escrita quando
 * havia um site com endereço público, e o `/mesa` que escolhia entre as três
 * visões. Nenhuma das duas tem público num servidor que só existe na rede local
 * da casa: quem chega aqui digitou o IP do notebook do mestre, e o que ele quer
 * é entrar na mesa.
 *
 * Normalmente ninguém vê esta página: o QR do Operador leva direto para
 * `/assistir` ou `/plateia`, já com o código.
 */
export default function EntrarPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-4">
        <Image src={logo} alt="ATO20" priority className="h-14 w-auto" />
        <p className="text-muted-foreground text-balance">
          Acompanhe a mesa. O mestre dita o código da campanha no começo da sessão.
        </p>
      </header>

      <nav>
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            {
              href: "/assistir",
              title: "Assistir",
              description: "Só o palco, sem controle nenhum. Para a TV atrás do mestre.",
              icon: Tv,
              hint: "TV ou segundo monitor",
            },
            {
              href: "/plateia",
              title: "Plateia",
              description: "A cena e a ficha do teu personagem, no teu celular.",
              icon: Smartphone,
              hint: "Celular do jogador",
            },
          ].map(({ href, title, description, icon: Icon, hint }) => (
            <li key={href}>
              <Link href={href} className="group block h-full">
                <Card className="hover:border-primary/60 h-full transition-colors">
                  <CardHeader>
                    <Icon className="text-muted-foreground size-5" aria-hidden />
                    <CardTitle className="flex items-center justify-between gap-2">
                      {title}
                      <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                    </CardTitle>
                    <CardDescription>{description}</CardDescription>
                    <p className="text-muted-foreground mt-2 text-xs uppercase">{hint}</p>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <footer className="text-muted-foreground border-t pt-6 text-xs">
        ATO20 · projeto pessoal · aplicativo de desktop
      </footer>
    </main>
  );
}
