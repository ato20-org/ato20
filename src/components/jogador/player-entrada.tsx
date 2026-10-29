"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { escolherIdiomaDoJogador } from "@/lib/i18n/escolha-do-jogador";
import { IDIOMAS, NOME_DO_IDIOMA, idioma } from "@/lib/i18n/idioma";
import { t } from "@/lib/i18n/jogador";
import { cn } from "@/lib/utils";
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
export function PlayerEntrada({
  codigo,
  nomeDaMesa,
}: {
  codigo: string;
  nomeDaMesa: string;
}) {
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
          {t.entrada.tentarDeNovo}
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
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void entrar(codigo, nome);
          }}
        >
          {/* O nome da mesa no título, e não um ícone de pessoa: quem chega
              pelo link ou pelo QR quer saber, antes de tudo, se é a mesa
              certa. A pergunta vira o rótulo do campo -- antes ele só tinha o
              texto de dentro, que some ao digitar e o leitor de tela não lê
              como nome do campo. */}
          <div className="space-y-1.5 pb-3 text-center">
            <h1 className="text-2xl font-semibold break-words text-balance">
              {nomeDaMesa}
            </h1>
            <label htmlFor="player-name" className="block font-medium">
              {t.entrada.quemJoga}
            </label>
            {/* O que mais confunde quem chega: escrever o nome do personagem,
                que é o mestre quem entrega. "Credencial" saiu: o que o jogador
                precisa saber é que não há senha e o aparelho se lembra dele. */}
            <p className="text-muted-foreground text-sm text-balance">
              {t.entrada.explicacao}
            </p>
          </div>

          <Input
            id="player-name"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            autoComplete="name"
            autoFocus
            spellCheck={false}
            placeholder={t.entrada.seuNome}
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
            {t.entrada.entrar}
          </Button>
        </form>

        {/* A troca de idioma também aqui, e não só no menu: o menu só existe
            depois de entrar, e quem não lê o idioma do mestre precisa dela
            justamente para entender esta tela. Cada idioma escrito nele
            mesmo. */}
        <nav
          aria-label={t.menu.idioma}
          className="text-muted-foreground flex items-center justify-center gap-3 text-xs"
        >
          {IDIOMAS.map((cada) => (
            <button
              key={cada}
              type="button"
              lang={cada}
              aria-current={cada === idioma ? "true" : undefined}
              disabled={cada === idioma}
              onClick={() => escolherIdiomaDoJogador(cada)}
              className={cn(
                "underline-offset-4 hover:underline",
                cada === idioma && "text-foreground no-underline",
              )}
            >
              {NOME_DO_IDIOMA[cada]}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
