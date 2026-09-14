"use client";

import { useState } from "react";
import { Loader2, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlayerStore } from "@/lib/store/use-player-store";

/**
 * A primeira tela de quem abre o Jogador sem ficha neste aparelho.
 *
 * Era um bloco dentro da aba Personagem, e agora ocupa a tela inteira. O
 * jogador que chega não tem o que fazer antes de dizer quem é: cena, dados e
 * ficha dependem todos disso, e mostrá-los atrás de um campo de nome só dava a
 * impressão de que o aplicativo não tinha carregado. Quem só quer ver o mapa
 * sem virar jogador tem a porta do lado — `/espectador`, a TV, que nunca cria
 * linha na campanha do mestre.
 */
export function PlayerEntrada({ codigo }: { codigo: string }) {
  const status = usePlayerStore((state) => state.status);
  const erro = usePlayerStore((state) => state.erro);
  const boot = usePlayerStore((state) => state.boot);
  const entrar = usePlayerStore((state) => state.entrar);

  const [nome, setNome] = useState("");

  if (status === "idle") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }

  if (status === "erro") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-destructive text-sm">{erro}</p>
        <Button variant="outline" onClick={() => void boot(codigo)}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    // Centralizado na vertical, mas com o conteúdo colado no topo do miolo
    // quando o teclado do celular sobe: `justify-center` num contêiner que
    // rola mantém o campo visível em vez de empurrá-lo para fora.
    <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto p-6">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <UserRound
            className="text-muted-foreground mx-auto size-8"
            aria-hidden
          />
          <h1 className="text-xl font-medium">Quem está jogando?</h1>
          <p className="text-muted-foreground text-sm text-balance">
            O nome é só para o mestre saber quem é quem. Não há cadastro: este
            aparelho guarda a credencial, e é ela que mantém a tua ficha
            separada da dos outros.
          </p>
        </div>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void entrar(codigo, nome);
          }}
        >
          <Input
            id="player-name"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            autoComplete="name"
            autoFocus
            spellCheck={false}
            placeholder="Teu nome"
            maxLength={60}
            // Alvo de dedo, não de cursor: `h-11` e texto de 16px, que é o
            // tamanho abaixo do qual o iOS dá zoom sozinho ao focar o campo.
            className="h-11 text-center text-base"
          />

          {erro ? (
            <p className="text-destructive text-center text-sm">{erro}</p>
          ) : null}

          <Button
            type="submit"
            className="h-11 w-full text-base"
            disabled={nome.trim().length === 0 || status === "entrando"}
          >
            {status === "entrando" ? (
              <Loader2 className="animate-spin" />
            ) : null}
            Entrar na mesa
          </Button>
        </form>
      </div>
    </div>
  );
}
