"use client";

import { useEffect, useState } from "react";
import { Loader2, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlayerStore } from "@/lib/store/use-player-store";

/**
 * Entra na mesa como JOGADOR — o que é diferente de acompanhar a cena.
 *
 * Separado da porta do código de propósito. A TV entra na mesa e nunca vira
 * jogador; um jogador que só quer ver o mapa também não precisa de ficha. Se as
 * duas coisas fossem uma, cada aparelho que abrisse a Plateia criaria uma linha
 * na campanha do mestre, e a lista dele encheria de fantasmas.
 *
 * Por isso o nome é pedido aqui, dentro da aba Personagem, e não na entrada.
 */
export function PlayerGate({
  codigo,
  children,
}: {
  codigo: string;
  children: React.ReactNode;
}) {
  const status = usePlayerStore((state) => state.status);
  const erro = usePlayerStore((state) => state.erro);
  const boot = usePlayerStore((state) => state.boot);
  const entrar = usePlayerStore((state) => state.entrar);

  const [nome, setNome] = useState("");

  useEffect(() => {
    void boot(codigo);
  }, [boot, codigo]);

  if (status === "dentro") return <>{children}</>;

  if (status === "idle") {
    return <Loader2 className="text-muted-foreground mx-auto size-4 animate-spin" />;
  }

  if (status === "erro") {
    return (
      <div className="space-y-2 text-center">
        <p className="text-destructive text-sm">{erro}</p>
        <Button variant="outline" size="sm" onClick={() => void boot(codigo)}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <section className="space-y-3 text-center">
      <UserRound className="text-muted-foreground mx-auto size-7" aria-hidden />
      <h2 className="text-lg font-medium">Quem está jogando?</h2>
      <p className="text-muted-foreground text-sm">
        O nome é só para o mestre saber quem é quem. Não há cadastro: este aparelho guarda a
        credencial, e é ela que mantém a tua ficha separada da dos outros.
      </p>

      <form
        className="space-y-3 text-left"
        onSubmit={(event) => {
          event.preventDefault();
          void entrar(codigo, nome);
        }}
      >
        <Label htmlFor="player-name">Teu nome</Label>
        <Input
          id="player-name"
          value={nome}
          onChange={(event) => setNome(event.target.value)}
          autoComplete="name"
          spellCheck={false}
          placeholder="Edgar"
          maxLength={60}
        />

        {erro ? <p className="text-destructive text-sm">{erro}</p> : null}

        <Button
          type="submit"
          className="w-full"
          disabled={nome.trim().length === 0 || status === "entrando"}
        >
          {status === "entrando" ? <Loader2 className="animate-spin" /> : null}
          Entrar na mesa
        </Button>
      </form>
    </section>
  );
}
