"use client";

import { useCallback, useEffect, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";

/**
 * Troca a pasta pessoal por `~` no começo do caminho.
 *
 * A porta do Mestre mostra o caminho de cada campanha, e ele é a única coisa
 * que distingue duas pastas de mesmo nome. Só que a metade inicial é sempre a
 * mesma — `/home/valb/` em toda linha —, e é justamente ela que empurra a parte
 * que importa para fora da largura disponível. `~` devolve esse espaço.
 *
 * Vem do sistema e não de um palpite: `C:\Users\valb` é tão pasta pessoal
 * quanto `/home/valb`, e recortar por prefixo conhecido acertaria num sistema
 * e erraria no outro.
 *
 * Enquanto a resposta não chega — e se ela nunca chegar, que é o caso de quem
 * abriu isto numa aba de navegador — o caminho sai inteiro. O pior caso é o
 * texto de antes.
 */
export function useCaminhoCurto(): (caminho: string) => string {
  const [casa, setCasa] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;

    void homeDir().then(
      (caminho) => {
        // Com ou sem barra no fim conforme a versão do plugin, e a diferença
        // decidiria entre `~/Documentos` e `~Documentos`.
        if (vivo) setCasa(caminho.replace(/[/\\]+$/, ""));
      },
      () => {
        // Sem aplicativo não há pasta pessoal a perguntar. Não é erro: é o
        // caminho inteiro, como era antes disto existir.
      },
    );

    return () => {
      vivo = false;
    };
  }, []);

  return useCallback(
    (caminho: string) => {
      if (!casa || !caminho.startsWith(casa)) return caminho;

      const resto = caminho.slice(casa.length);

      // A pasta pessoal EM SI vira `~`, e não `~` seguido de nada. E um
      // caminho que só começa igual -- `/home/valber` para uma casa em
      // `/home/valb` -- não é dentro dela, então fica inteiro.
      if (resto === "") return "~";
      if (resto[0] !== "/" && resto[0] !== "\\") return caminho;

      return `~${resto}`;
    },
    [casa],
  );
}
