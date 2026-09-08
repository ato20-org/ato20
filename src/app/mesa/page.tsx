import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Smartphone, Tv, Wand2 } from "lucide-react";

import logo from "@/assets/logo-white.png";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ViewLink = {
  href: string;
  title: string;
  description: string;
  icon: typeof Wand2;
  hint: string;
  available: boolean;
};

const views: ViewLink[] = [
  {
    href: "/operador",
    title: "Operador",
    description: "Monta as cenas, arrasta as imagens e decide o que a mesa vê.",
    icon: Wand2,
    hint: "Tela do mestre",
    available: true,
  },
  {
    href: "/assistir",
    title: "Assistir",
    description: "Só o playground, sem controle nenhum. Para a TV atrás do mestre.",
    icon: Tv,
    hint: "Segundo monitor",
    available: true,
  },
  {
    href: "/plateia",
    title: "Plateia",
    description: "Cada jogador no próprio celular, com os anexos do personagem.",
    icon: Smartphone,
    hint: "Celular do jogador",
    available: true,
  },
];

export default function MesaPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-3">
        {/* O `alt` é o nome acessível da página: leitor de tela e busca leem
            "ATO20" mesmo sem enxergar a marca. `priority` porque é o maior
            elemento acima da dobra. */}
        <h1>
          <Image src={logo} alt="ATO20" priority className="h-14 w-auto" />
        </h1>
        <p className="text-muted-foreground max-w-prose text-balance">
          Escolha por onde entrar. O Operador é a tua tela; Assistir vai na TV; Plateia é o celular
          de cada jogador.
        </p>
      </header>

      <nav aria-label="Escolha uma visão">
        <ul className="grid gap-4 sm:grid-cols-3">
          {views.map(({ href, title, description, icon: Icon, hint, available }) => (
            <li key={href}>
              <Card
                className="relative h-full transition-colors data-[available=true]:hover:border-primary/60 data-[available=false]:opacity-55"
                data-available={available}
              >
                <CardHeader>
                  <Icon className="text-muted-foreground size-5" aria-hidden />
                  <CardTitle className="flex items-center justify-between gap-2">
                    {title}
                    {available ? <ArrowRight className="size-4" aria-hidden /> : null}
                  </CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent className="text-muted-foreground mt-auto text-xs uppercase tracking-wide">
                  {available ? (
                    <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
                      <span className="sr-only">Abrir {title}</span>
                      {hint}
                    </Link>
                  ) : (
                    hint
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
