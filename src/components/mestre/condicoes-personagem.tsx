"use client";

import { useMemo } from "react";

import {
  AcrescentarCondicao,
  ListaDeCondicoes,
  type DonoDeCondicoes,
} from "@/components/mestre/lista-de-condicoes";
import { SecaoFicha } from "@/components/mestre/secao-ficha";
import {
  alternarCondicao,
  criarCondicao,
  editarCondicao,
  removerCondicao,
  reordenarCondicoes,
} from "@/lib/vault/characters";
import type { Personagem } from "@/types/character";

/**
 * As condições do personagem: os selos que a mesa vê sobre ele.
 *
 * Envenenado, caído, abençoado. Quem marca é o mestre -- aqui, ou no botão
 * direito do token, que é o gesto do meio do combate. O jogador lê as dele no
 * celular.
 *
 * ## O mais abre o cardápio, e não cria direto
 *
 * O medidor nasce com um clique porque "Vida" é quase sempre o primeiro. A
 * condição não tem palpite honesto: quem marca "Envenenado" quer o veneno que
 * a campanha já tem, com a cor e o efeito que o mestre acertou uma vez. O
 * cardápio vem primeiro, e a condição avulsa -- a maldição que só este
 * personagem tem -- fica logo abaixo dele.
 *
 * A lista e o mais são os mesmos do objeto do mapa; o que é do personagem é o
 * endereço -- o índice, pelo Rust. Ver `DonoDeCondicoes`.
 */
export function CondicoesPersonagem({
  personagem,
  onChanged,
}: {
  personagem: Personagem;
  onChanged: () => void;
}) {
  const dono = useMemo<DonoDeCondicoes>(
    () => ({
      nome: personagem.nome,
      condicoes: personagem.condicoes,
      editar: (condicaoId, patch) =>
        editarCondicao(personagem.id, condicaoId, patch).then(onChanged),
      remover: (condicaoId) => removerCondicao(personagem.id, condicaoId).then(onChanged),
      reordenar: (ordem) => reordenarCondicoes(personagem.id, ordem).then(onChanged),
      alternar: async (modelo, ligar) => {
        const mudaram = await alternarCondicao([personagem.id], modelo.id, ligar);
        onChanged();
        return mudaram;
      },
      criarAvulsa: (condicao) =>
        criarCondicao(
          personagem.id,
          condicao.nome,
          condicao.cor,
          condicao.icone,
          condicao.efeito ?? null,
        ).then(onChanged),
      dicaDoOlho: (escondido) => ({
        titulo: escondido ? "Só você vê" : "A mesa vê",
        texto:
          "Escondida, nem o selo nem o efeito saem do aplicativo — nem para o celular do dono do personagem.",
      }),
    }),
    [personagem, onChanged],
  );
  const quantas = personagem.condicoes?.length ?? 0;

  return (
    <SecaoFicha
      secao="condicoes"
      titulo="Condições"
      contagem={quantas}
      acao={<AcrescentarCondicao dono={dono} />}
    >
      {quantas === 0 ? (
        <p className="text-muted-foreground text-[11px] leading-snug">
          Um selo sobre o token e o retrato: envenenado, caído, abençoado. Pode
          mudar a figura também, com uma aura ou uma cor. Marca-se aqui ou no
          botão direito do token.
        </p>
      ) : (
        <ListaDeCondicoes dono={dono} />
      )}
    </SecaoFicha>
  );
}
