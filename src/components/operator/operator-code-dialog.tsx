"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchOperatorCode, type Room } from "@/lib/supabase/rooms";

/**
 * Relê o código de operação.
 *
 * Fica atrás de um clique e escondido por padrão, ao contrário do código da
 * mesa. Os dois vivem no mesmo cabeçalho e o mestre compartilha a tela na
 * sessão inteira — deixar a senha à vista seria entregá-la aos jogadores por
 * acidente, e quem a digita assume a mesa.
 */
export function OperatorCodeDialog({ room }: { room: Room }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  function load(open: boolean) {
    if (!open) {
      // Fechar volta ao escondido: reabrir não deve revelar o que a última
      // sessão revelou.
      setShown(false);
      setCopied(false);
      return;
    }

    setError(null);
    void fetchOperatorCode(room.id).then(setCode, () =>
      setError("Não foi possível ler o código desta mesa."),
    );
  }

  return (
    <Dialog onOpenChange={load}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              render={
                <Button variant="ghost" size="icon-xs" aria-label="Ver código de operação">
                  <KeyRound />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          <p className="max-w-52">A senha do mestre. Não é o código dos jogadores.</p>
        </TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Código de operação</DialogTitle>
          <DialogDescription>
            Abre o Operador em outro aparelho e recupera a mesa se você limpar os dados deste
            navegador. Quem digita este código assume a mesa.
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        {!code && !error ? (
          <Loader2 className="text-muted-foreground mx-auto size-4 animate-spin" />
        ) : null}

        {code ? (
          <div className="space-y-2">
            <code className="bg-muted block w-full rounded-md py-3 text-center text-xl font-medium tracking-[0.3em]">
              {shown ? code : "••••••••"}
            </code>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setShown(!shown)}
              >
                {shown ? <EyeOff /> : <Eye />}
                {shown ? "Esconder" : "Mostrar"}
              </Button>

              {/* Copiar sem revelar: passar a senha para outro aparelho não
                  exige exibi-la numa tela que pode estar sendo espelhada. */}
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  void navigator.clipboard.writeText(code).then(
                    () => setCopied(true),
                    () => setShown(true),
                  );
                }}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
