"use client";

import Image from "next/image";
import { Check, Loader2 } from "lucide-react";

import logo from "@/assets/logo-white.png";
import { cn } from "@/lib/utils";

export type BootStepState = "espera" | "fazendo" | "pronto";

export type BootStep = { chave: string; rotulo: string; estado: BootStepState };

/**
 * A tela de abertura, enquanto a campanha é lida do disco.
 *
 * Existe porque o que vem depois não aparece de uma vez: o board, os retratos,
 * a trilha e o acervo são arquivos separados, e a versão anterior mostrava a
 * mesa montando aos pedaços — painéis vazios que se preenchiam, palco sem cena
 * por um instante, trilha que aparecia depois. Um estado só, e nomeado, é mais
 * honesto que quatro estados parciais.
 *
 * Serve dois momentos, e são o mesmo trabalho: entrar numa campanha pela porta
 * e trocar de campanha já dentro de uma. Nomear as duas separadas daria duas
 * telas para manter.
 *
 * E serve um terceiro que não é trabalho de campanha nenhuma: o instante entre
 * montar o Mestre e a porta aparecer, enquanto a lista de campanhas é lida do
 * banco da máquina. Os passos são dados por quem chama, então esse caso diz o
 * que ele faz de verdade -- ver `Conteudo`, e a nota lá sobre o rótulo que
 * mentia.
 */
export function CampaignSplash({
  nome,
  passos,
  erro,
}: {
  /** Nome da campanha, quando já se sabe qual. */
  nome?: string;
  passos: BootStep[];
  erro?: string | null;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-3">
        <Image src={logo} alt="ATO20" priority className="h-12 w-auto" />
        {nome ? <p className="text-muted-foreground text-sm">{nome}</p> : null}
      </div>

      {/* Os passos com nome, e não uma barra de progresso.
          Uma barra precisa de um total confiável, e aqui os tempos são
          desiguais — ler o board é instantâneo, medir a onda de uma trilha
          longa não. Uma barra andando a saltos mente mais que uma lista que
          diz onde está. */}
      <ul className="w-full max-w-64 space-y-2">
        {passos.map(({ chave, rotulo, estado }) => (
          <li key={chave} className="flex items-center gap-2 text-sm">
            <span className="grid size-4 shrink-0 place-items-center">
              {estado === "pronto" ? (
                <Check className="text-muted-foreground size-3.5" aria-hidden />
              ) : estado === "fazendo" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : null}
            </span>
            <span
              className={cn(
                estado === "espera" && "text-muted-foreground/40",
                estado === "pronto" && "text-muted-foreground",
              )}
            >
              {rotulo}
            </span>
          </li>
        ))}
      </ul>

      {erro ? (
        <p className="text-destructive max-w-sm text-center text-sm">{erro}</p>
      ) : null}
    </div>
  );
}
