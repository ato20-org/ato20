"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRoomStore } from "@/lib/store/use-room-store";

/** Oito caracteres, contra os seis do código da mesa. */
const OPERATOR_CODE_LENGTH = 8;

/** Tira hífen de agrupamento e espaço colado por gerenciador de senha. */
function normalize(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, OPERATOR_CODE_LENGTH);
}

/**
 * Porta do Operador.
 *
 * Só aparece para quem não comanda mesa nenhuma neste navegador — quem já é o
 * mestre entra direto. É essa a regra que faz a senha proteger sem virar
 * pedágio: ela barra o celular do jogador que abre /operador, e não a máquina
 * do mestre a cada F5.
 */
export function OperatorGate() {
  const busy = useRoomStore((state) => state.busy);
  const error = useRoomStore((state) => state.error);
  const unlock = useRoomStore((state) => state.unlock);
  const openRoom = useRoomStore((state) => state.openRoom);

  const [code, setCode] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);

  // A senha da mesa recém-criada. Aparece uma vez e some da tela junto com a
  // porta, então o aviso tem de ser mais forte que a vontade de seguir.
  if (fresh) return <FreshCode operatorCode={fresh} />;

  return (
    <Centered>
      <KeyRound className="text-muted-foreground size-8" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">Assumir a mesa</h1>
      <p className="text-muted-foreground text-sm">
        O código de operação é a senha do mestre. Não é o código que os jogadores digitam.
      </p>

      <form
        className="w-full space-y-3 text-left"
        onSubmit={(event) => {
          event.preventDefault();
          void unlock(code);
        }}
      >
        <Label htmlFor="operator-code">Código de operação</Label>
        <Input
          id="operator-code"
          value={code}
          onChange={(event) => setCode(normalize(event.target.value))}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCD2345"
          className="text-center text-lg tracking-[0.3em]"
        />

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <Button
          type="submit"
          className="w-full"
          disabled={code.length !== OPERATOR_CODE_LENGTH || busy}
        >
          {busy ? <Loader2 className="animate-spin" /> : null}
          Entrar como mestre
        </Button>
      </form>

      <div className="w-full space-y-2 border-t pt-4">
        <p className="text-muted-foreground text-xs">Primeira vez? Abra uma mesa nova.</p>
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => {
            void openRoom().then(setFresh, () => {
              // O store já guardou o motivo e voltou para `locked`.
            });
          }}
        >
          Criar mesa
        </Button>
      </div>

      <Button render={<Link href="/mesa" />} nativeButton={false} variant="ghost" size="sm">
        Voltar
      </Button>
    </Centered>
  );
}

/**
 * A senha aparecendo pela única vez.
 *
 * Sem "continuar" automático: o mestre precisa de um instante para copiar isto
 * para onde ele guarda senhas. Perder a senha significa não conseguir abrir o
 * Operador em outra máquina nem depois de limpar os dados do navegador — a
 * mesa continua funcionando aqui, mas fica presa a este navegador.
 */
function FreshCode({ operatorCode }: { operatorCode: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Centered>
      <KeyRound className="size-8 text-amber-500" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">Guarde este código</h1>
      <p className="text-muted-foreground text-sm">
        É a senha da sua mesa. Ela abre o Operador em qualquer aparelho — e é a única forma de
        voltar se você limpar os dados deste navegador.
      </p>

      <code className="bg-muted w-full rounded-md py-3 text-center text-2xl font-medium tracking-[0.3em]">
        {operatorCode}
      </code>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          void navigator.clipboard.writeText(operatorCode).then(
            () => setCopied(true),
            // `clipboard` exige contexto seguro; em HTTP na rede local falha, e
            // o código continua legível na tela.
            () => setCopied(false),
          );
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copiado" : "Copiar código"}
      </Button>

      <p className="text-muted-foreground text-xs">
        Não mostre este código aos jogadores: quem o digita assume a mesa.
      </p>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">{children}</div>
    </div>
  );
}
