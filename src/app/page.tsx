import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  EyeOff,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Monitor,
  Music,
  ScanSearch,
  Smartphone,
  UserSquare,
  Wand2,
} from "lucide-react";

import logo from "@/assets/logo-white.png";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const views = [
  {
    title: "Operador",
    description:
      "A tela do mestre. Monta as cenas, arrasta as imagens, esconde regiões do mapa e decide o que entra no ar.",
    icon: Wand2,
  },
  {
    title: "Assistir",
    description:
      "Só o palco, sem controle nenhum. Vai na TV atrás do mestre, para a mesa toda olhar.",
    icon: Monitor,
  },
  {
    title: "Plateia",
    description:
      "O celular de cada jogador. Vê a cena, guarda os arquivos do personagem e consulta as regras.",
    icon: Smartphone,
  },
];

const features = [
  { icon: Layers, label: "Cenas separadas, com miniatura ao vivo" },
  { icon: EyeOff, label: "Áreas escondidas que só o mestre atravessa" },
  { icon: ScanSearch, label: "Enquadramento controlado pelo mestre" },
  { icon: ImageIcon, label: "Imagens livres: mover, girar, espelhar, empilhar" },
  { icon: Music, label: "Trilha por cena e efeitos avulsos" },
  { icon: UserSquare, label: "Retratos de personagem presos à câmera" },
  { icon: BookOpen, label: "Anexos de personagem e material de regras" },
];

export const metadata = {
  title: "ATO20 · Cenas de RPG de mesa",
  description:
    "Ferramenta open source para organizar e exibir cenas de RPG de mesa. Uso local ou pessoal.",
};

export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-16 px-6 py-16">
      <header className="space-y-6">
        <h1>
          <Image src={logo} alt="ATO20" priority className="h-20 w-auto" />
        </h1>

        <p className="max-w-2xl text-xl text-balance">
          Ferramenta para organizar e exibir cenas de RPG de mesa.
        </p>

        <p className="text-muted-foreground max-w-2xl text-balance">
          Feita para jogo presencial: o mestre monta a próxima cena no notebook enquanto a mesa
          continua vendo a atual na TV, e cada jogador acompanha pelo próprio celular.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button render={<Link href="/entrar" />} nativeButton={false}>
            <KeyRound />
            Entrar na instância
          </Button>
        </div>
      </header>

      {/* Dito de frente, não em letra miúda: quem chega precisa saber que não
          vai criar uma conta aqui. */}
      <section className="border-primary/40 space-y-3 rounded-lg border-l-2 pl-5">
        <h2 className="text-lg font-medium">Projeto pessoal, instância fechada</h2>
        <p className="text-muted-foreground max-w-2xl text-sm text-balance">
          Não é um serviço: não existe cadastro, plano nem inscrição. Esta instância pertence a uma
          mesa específica, e o acesso à ferramenta exige uma chave — só esta apresentação fica
          aberta.
        </p>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">Três telas, uma mesa</h2>

        <ul className="grid gap-4 sm:grid-cols-3">
          {views.map(({ title, description, icon: Icon }) => (
            <li key={title}>
              <Card className="h-full">
                <CardHeader>
                  <Icon className="text-muted-foreground size-5" aria-hidden />
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">O que faz</h2>

        <ul className="grid gap-3 sm:grid-cols-2">
          {features.map(({ icon: Icon, label }) => (
            <li key={label} className="text-muted-foreground flex items-start gap-2.5 text-sm">
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Como funciona</h2>

        <p className="text-muted-foreground max-w-2xl text-sm text-balance">
          Roda inteira no navegador: cenas, imagens e sons ficam no próprio aparelho, e o Operador
          fala com a TV sem servidor nenhum no meio — o que também significa que funciona com a
          internet caída. A nuvem entra para levar a cena aos celulares dos jogadores e para
          guardar as cenas da mesa, que assim continuam de onde pararam em outro computador.
        </p>
      </section>

      <footer className="text-muted-foreground border-t pt-6 text-xs">
        ATO20 · projeto pessoal · instância fechada
      </footer>
    </main>
  );
}
