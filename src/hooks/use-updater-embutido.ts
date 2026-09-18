"use client";

import { useEffect, useState } from "react";

import { updaterEmbutido } from "@/lib/vault/bridge";

/**
 * Se este pacote sabe se atualizar sozinho.
 *
 * `null` enquanto a resposta não chegou. Quem mostra interface por causa dela
 * deve esperar esse `null` passar em vez de assumir um lado: assumir `true`
 * pisca uma chave que vai sumir no pacote de loja, e assumir `false` pisca um
 * aviso de loja em quem baixou o AppImage. Um quadro sem nada é mais barato que
 * um quadro com a coisa errada.
 *
 * Nas versões de loja — Flathub, Snap — é `false`: lá o binário vive num
 * diretório somente-leitura e quem atualiza é a loja.
 */
export function useUpdaterEmbutido(): boolean | null {
  const [embutido, setEmbutido] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;

    void updaterEmbutido().then((tem) => {
      if (vivo) setEmbutido(tem);
    });

    return () => {
      vivo = false;
    };
  }, []);

  return embutido;
}
