"use client";

import { createElement, useEffect } from "react";
import { Puzzle } from "lucide-react";

import { garantirCarregada } from "@/lib/extensoes/carregar";
import { chaveContribuicao } from "@/lib/extensoes/manifesto";
import { useContribuicoesStore } from "@/lib/store/use-contribuicoes-store";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";

/**
 * O corpo de um painel que veio de uma extensão.
 *
 * **É aqui que a ativação preguiçosa acontece.** O menu de telas mostra o
 * painel porque o manifesto o DECLARA; o módulo que o implementa só é importado
 * quando alguém o abre — que é este componente montando.
 *
 * Quatro jeitos de não ter o que desenhar, e cada um diz o seu, porque a
 * providência de quem lê é diferente em cada: reinstalar, religar, falar com
 * quem escreveu, ou esperar. Um "não deu" genérico manda o mestre adivinhar.
 */
export function PainelDeExtensao({
  extensaoId,
  painelId,
}: {
  extensaoId: string;
  painelId: string;
}) {
  const extensao = useExtensoesStore((state) =>
    state.extensoes.find((atual) => atual.id === extensaoId),
  );
  const carga = useContribuicoesStore((state) => state.carga[extensaoId]);
  const Corpo = useContribuicoesStore(
    (state) => state.paineis[chaveContribuicao(extensaoId, painelId)],
  );

  useEffect(() => {
    if (extensao?.habilitada) void garantirCarregada(extensao);
  }, [extensao]);

  if (!extensao) {
    return <Aviso>Este plugin não está mais instalado.</Aviso>;
  }

  if (!extensao.habilitada) {
    return <Aviso>{extensao.nome} está desligado. Ligue em Configurações → Plugins.</Aviso>;
  }

  if (carga?.estado === "falhou") {
    return (
      <Aviso>
        {extensao.nome} falhou ao carregar.
        {/* O motivo por extenso, e em monoespaçada: é mensagem de erro de
            JavaScript, e quem vai consertar é quem escreveu o plugin -- essa
            pessoa precisa do texto exato, não de um resumo. */}
        <span className="text-muted-foreground mt-1 block font-mono text-[10px] break-words">
          {carga.erro}
        </span>
      </Aviso>
    );
  }

  if (!Corpo) {
    // Carregado e sem este painel: o manifesto declarou `tabela` e o módulo
    // registrou outro id, ou nenhum. É erro de quem escreveu o plugin, e dizer
    // isso poupa o mestre de procurar defeito na própria máquina.
    if (carga?.estado === "pronta") {
      return (
        <Aviso>
          {extensao.nome} não registrou o painel <code>{painelId}</code>.
        </Aviso>
      );
    }

    return <Aviso>Carregando {extensao.nome}…</Aviso>;
  }

  // `createElement` e não `<Corpo />`: a referência vem do registro, onde foi
  // posta UMA vez quando a extensão ativou, e não é criada a cada render. O
  // compilador do React não tem como saber disso pela forma do JSX, e a regra
  // dele existe para o caso oposto -- componente definido dentro de outro, que
  // perderia o estado a cada quadro.
  return createElement(Corpo);
}

/** A moldura dos quatro casos. Centrada, discreta, sem parecer defeito do app. */
function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground grid h-full place-items-center p-4 text-center text-xs">
      <div>
        <Puzzle className="mx-auto mb-2 size-5 opacity-50" aria-hidden />
        {children}
      </div>
    </div>
  );
}
