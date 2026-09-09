"use client";

import { useEffect, useState } from "react";

import { AttachmentBody } from "@/components/attachments/attachment-body";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { imageMimeByName } from "@/lib/attachments/kind";
import { characterAttachmentUrl } from "@/lib/vault/characters";
import type { AnexoPersonagem } from "@/types/character";

/**
 * Um arquivo do personagem, aberto em janela.
 *
 * Janela, e não o `AttachmentViewer` modal, porque o mestre abre isto PARA
 * comparar: o retrato ao lado da ficha, a ficha ao lado do mapa. O modal
 * cobria justamente o que se queria olhar junto. Corpo sem moldura: quem
 * desenha cabeçalho e arrasto é `InnerWindow` ou a tira de abas do grupo.
 *
 * O `AttachmentViewer` continua existindo e continua modal — é o que serve a
 * Plateia e a ficha do jogador, onde a tela é de celular e uma janela
 * flutuante seria pior que um modal. As duas molduras compartilham o
 * `AttachmentBody`.
 */
export function AnexoBody({
  personagemId,
  anexo,
}: {
  personagemId: string;
  anexo: AnexoPersonagem;
}) {
  const url = useAnexoUrl(personagemId, anexo);

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <AttachmentBody attachment={anexo} url={url} />
    </div>
  );
}

/**
 * Uma imagem do acervo, aberta em janela.
 *
 * Componente à parte do de anexo porque a origem do endereço é outra: asset
 * tem rota no daemon e resolve por `useAssetUrl`, anexo fica atrás do token e
 * chega por IPC como bytes. Um componente só, com um `if` no meio, teria de
 * chamar um hook condicionalmente.
 */
export function AssetBody({ assetId, nome }: { assetId: string; nome: string }) {
  const url = useAssetUrl(assetId);

  // Asset do acervo é sempre imagem ou som, e o que abre em janela é imagem —
  // são os campos de retrato e miniatura. Pelo nome quando ele tem extensão,
  // e `image/*` quando não: o acervo aceita o arquivo por tipo, então o palpite
  // aqui não é arriscado.
  const mimeType = imageMimeByName(nome) ?? "image/*";

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <AttachmentBody attachment={{ arquivo: nome, mimeType, tamanho: 0 }} url={url} />
    </div>
  );
}

/**
 * O endereço de um anexo, como blob, revogado ao fechar a janela.
 *
 * Mesma razão do `AnexoThumb`: os bytes vêm por IPC e não há rota pública para
 * eles. Sem revogar, abrir a ficha de cinco personagens numa sessão deixa
 * cinco arquivos presos na memória da webview até a janela do aplicativo
 * fechar.
 */
function useAnexoUrl(personagemId: string, anexo: AnexoPersonagem): string | null {
  const { autor, arquivo, mimeType, tamanho } = anexo;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    let criada: string | null = null;

    void characterAttachmentUrl(personagemId, { autor, arquivo, mimeType, tamanho }).then(
      (endereco) => {
        if (!ativo) {
          URL.revokeObjectURL(endereco);
          return;
        }

        criada = endereco;
        setUrl(endereco);
      },
      () => {
        // O corpo fica no estado de carregando, que é honesto: o arquivo pode
        // ter saído do disco entre abrir a lista e clicar. Um aviso aqui
        // duplicaria o que a linha da lista já vai mostrar ao reler.
      },
    );

    return () => {
      ativo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [personagemId, autor, arquivo, mimeType, tamanho]);

  return url;
}
