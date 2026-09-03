import Image from "next/image";
import Link from "next/link";
import { KeyRound, TriangleAlert } from "lucide-react";

import logo from "@/assets/logo-white.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MESSAGES: Record<string, string> = {
  "sem-acesso": "Esta instância é fechada. Cole a chave de acesso para continuar.",
  invalido: "Chave incorreta.",
  "nao-configurado":
    "Esta instalação não tem chave de acesso definida, então nada foi liberado. Quem administra precisa configurar ATO20_ACCESS_TOKEN.",
};

export const metadata = { title: "Entrar · ATO20" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const reason = typeof params.motivo === "string" ? params.motivo : null;
  const from = typeof params.de === "string" ? params.de : "/mesa";

  const message = reason ? MESSAGES[reason] : null;
  const misconfigured = reason === "nao-configurado";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-12">
      <Link href="/" className="self-start">
        <Image src={logo} alt="ATO20" className="h-10 w-auto" />
      </Link>

      <div className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <KeyRound className="size-5" aria-hidden />
          Acesso
        </h1>
        {message ? (
          <p
            className={
              misconfigured
                ? "text-destructive flex gap-2 text-sm"
                : "text-muted-foreground text-sm"
            }
          >
            {misconfigured ? <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
            {message}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Cole a chave de acesso desta mesa.
          </p>
        )}
      </div>

      {/* Formulário nativo com POST: o segredo vai no corpo, não na URL, e a
          página não precisa de JavaScript nenhum para funcionar. */}
      <form action="/api/entrar" method="post" className="space-y-3">
        <input type="hidden" name="de" value={from} />

        <Label htmlFor="token">Chave</Label>
        <Input
          id="token"
          name="token"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          spellCheck={false}
          placeholder="••••••••••••"
        />

        <Button type="submit" className="w-full" disabled={misconfigured}>
          Entrar
        </Button>
      </form>

      <p className="text-muted-foreground text-xs">
        Não há cadastro nem recuperação: é uma chave única, guardada por quem administra a
        instância. Cada aparelho precisa dela uma vez.
      </p>
    </main>
  );
}
