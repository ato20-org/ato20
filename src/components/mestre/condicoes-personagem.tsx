"use client";

import { useMemo } from "react";

import {
  AcrescentarCondicao,
  ListaDeCondicoes,
  type DonoDeCondicoes,
} from "@/components/mestre/lista-de-condicoes";
import { SecaoFicha } from "@/components/mestre/secao-ficha";
import { t } from "@/lib/i18n/personagens";
import { useCharactersStore } from "@/lib/store/use-characters-store";
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
  const dono = useDonoDoPersonagem(personagem, onChanged);
  const quantas = personagem.condicoes?.length ?? 0;

  return (
    <SecaoFicha
      secao="condicoes"
      titulo={t.geral.condicoes}
      contagem={quantas}
      acao={<AcrescentarCondicao dono={dono} />}
    >
      {quantas === 0 ? (
        <p className="text-muted-foreground text-[11px] leading-snug">
          {t.condicoesPersonagem.vazio}
        </p>
      ) : (
        <ListaDeCondicoes dono={dono} />
      )}
    </SecaoFicha>
  );
}

/**
 * As condições do personagem no painel do GIZMO do token: a mesma lista da
 * ficha, sem abrir a ficha. É o gesto do meio do combate -- o goblin pegou
 * fogo, e o mestre está com o token na mão, não com a ficha aberta.
 */
export function PainelDeCondicoesDoPersonagem({ personagemId }: { personagemId: string }) {
  const personagem = useCharactersStore((state) =>
    state.personagens?.find((cada) => cada.id === personagemId),
  );
  const recarregar = useCharactersStore((state) => state.recarregar);

  if (!personagem) {
    return (
      <p className="text-muted-foreground w-64 text-[11px]">
        {t.condicoesPersonagem.lendo}
      </p>
    );
  }

  return <PainelDoPersonagem personagem={personagem} onChanged={recarregar} />;
}

function PainelDoPersonagem({
  personagem,
  onChanged,
}: {
  personagem: Personagem;
  onChanged: () => void;
}) {
  const dono = useDonoDoPersonagem(personagem, onChanged);

  return (
    <div className="w-64 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium">
          {t.condicoesPersonagem.de(personagem.nome)}
        </p>
        <AcrescentarCondicao dono={dono} />
      </div>

      {personagem.condicoes?.length ? (
        <ListaDeCondicoes dono={dono} />
      ) : (
        <p className="text-muted-foreground text-[11px] leading-snug">
          {t.condicoesPersonagem.painelVazio}
        </p>
      )}
    </div>
  );
}

/** O endereço das condições do personagem: o índice, pelo Rust. Ver `DonoDeCondicoes`. */
function useDonoDoPersonagem(personagem: Personagem, onChanged: () => void): DonoDeCondicoes {
  return useMemo<DonoDeCondicoes>(
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
        titulo: escondido ? t.geral.soVoceVe : t.geral.aMesaVe,
        texto: t.condicoesPersonagem.escondida,
      }),
    }),
    [personagem, onChanged],
  );
}
