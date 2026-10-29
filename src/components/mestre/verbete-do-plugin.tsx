"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Gift } from "lucide-react";

import { Etiqueta, falhou, ImagemDoPlugin } from "@/components/mestre/compendio-cartao";
import { TextoComRolagens } from "@/components/mestre/texto-com-rolagens";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { KIT_TRES_PONTOS, type Kit } from "@/components/ui/menu-kit";
import { useCharacters } from "@/hooks/use-characters";
import { useAura } from "@/lib/extensoes/auras";
import { chaveContribuicao } from "@/lib/extensoes/manifesto";
import { t } from "@/lib/i18n/mestre";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import { useMoldeDeDetalhesStore } from "@/lib/store/use-molde-de-detalhes-store";
import {
  darVerbete,
  verbeteDoPlugin,
  type QualVerbete,
  type VerbeteCompletoDoPlugin,
} from "@/lib/vault/abas-do-plugin";
import type { Personagem } from "@/types/character";

const texto = t.compendio;

/**
 * Dá o verbete a um personagem, e avisa quem precisa saber.
 *
 * O verbete vira DETALHE da ficha, no grupo que a aba declara -- "Rituais", em
 * lista --, e as telas abertas releem: a ficha ao lado mostra o ritual sem
 * fechar e abrir. Dar de novo não duplica, e o aviso diz que ele já tinha.
 */
export async function darVerbeteA(
  qual: QualVerbete,
  nome: string,
  personagem: Pick<Personagem, "id" | "nome">,
) {
  try {
    const dado = await darVerbete(qual, personagem.id);

    useMoldeDeDetalhesStore.getState().avisarFichas();
    useCharactersStore.getState().recarregar();

    if (!dado.entrou) toast.info(texto.verbeteJaNaFicha(nome, personagem.nome));
    else toast.success(texto.verbeteDado(nome, personagem.nome));
    if (dado.grupoDeFora) toast.warning(texto.grupoDoVerbeteDeFora(dado.grupo));
  } catch (cause) {
    falhou(cause);
  }
}

/**
 * As linhas do "Dar a": os personagens em jogo, nos dois menus do card e no
 * botão da janela. Recebe a linha do `Kit`, como `OpcoesDeDar` dos itens.
 */
export function OpcoesDeDarVerbete({
  qual,
  nome,
  Item: Linha,
}: {
  qual: QualVerbete;
  nome: string;
  Item: Kit["Item"];
}) {
  const { personagens } = useCharacters();

  if (!personagens?.length) {
    return <Linha disabled>{texto.ninguemEmJogo}</Linha>;
  }

  return (
    <>
      {personagens.map((personagem) => (
        <Linha key={personagem.id} onClick={() => void darVerbeteA(qual, nome, personagem)}>
          <span className="truncate">{personagem.nome}</span>
        </Linha>
      ))}
    </>
  );
}

/**
 * Um verbete de uma aba de plugin -- um ritual --, para LER: o que o card abre.
 *
 * Só de leitura pela razão da ficha do plugin (`FichaDoPluginBody`): o verbete
 * é do plugin, e o que a campanha guarda é o que foi DADO a um personagem, na
 * ficha dele. Os dados entre chaves rolam daqui mesmo, na mesa. Ver
 * `abas_do_plugin::verbete`.
 */
export function VerbeteDoPluginBody({ extensaoId, abaId, colecaoId, verbeteId }: QualVerbete) {
  const [lido, setLido] = useState<
    { qual: string; verbete: VerbeteCompletoDoPlugin } | { qual: string; erro: string } | null
  >(null);
  // Relê quando a lista de plugins muda: o plugin atualizado traz o texto
  // novo, e o desligado fecha a porta.
  const extensoes = useExtensoesStore((estado) => estado.extensoes);
  const qual = `${extensaoId}/${abaId}/${colecaoId}/${verbeteId}`;

  useEffect(() => {
    let ativo = true;

    void verbeteDoPlugin({ extensaoId, abaId, colecaoId, verbeteId }).then(
      (verbete) => {
        if (ativo) setLido({ qual, verbete });
      },
      (cause) => {
        if (ativo) setLido({ qual, erro: cause instanceof Error ? cause.message : String(cause) });
      },
    );

    return () => {
      ativo = false;
    };
  }, [extensaoId, abaId, colecaoId, verbeteId, qual, extensoes]);

  // A leitura de outro verbete não vale para este: a janela reaproveitada
  // mostra "lendo" em vez do anterior.
  if (!lido || lido.qual !== qual) return <p className="text-muted-foreground p-4 text-xs">{texto.lendo}</p>;
  if ("erro" in lido) return <p className="text-destructive p-4 text-xs">{texto.verbeteNaoAbriu(lido.erro)}</p>;

  return <Verbete qual={{ extensaoId, abaId, colecaoId, verbeteId }} completo={lido.verbete} />;
}

function Verbete({ qual, completo }: { qual: QualVerbete; completo: VerbeteCompletoDoPlugin }) {
  const { verbete } = completo;
  const aura = useAura(completo.aura ? chaveContribuicao(qual.extensaoId, completo.aura) : null);
  // A imagem da pasta. A por URL não se baixa para ler, como no card.
  const imagem = verbete.imagem && !verbete.imagem.includes("://") ? verbete.imagem : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      <div className="flex gap-3">
        <span
          className="bg-muted/60 relative flex aspect-square w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border p-2"
          style={aura ? { borderColor: aura.cor } : undefined}
        >
          {imagem ? (
            <ImagemDoPlugin extensaoId={qual.extensaoId} caminho={imagem} />
          ) : (
            <BookOpen className="text-muted-foreground size-8" aria-hidden />
          )}
        </span>

        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-base leading-tight font-semibold">{verbete.nome}</h2>
          {verbete.tags.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {verbete.tags.map((tag) => (
                <Etiqueta key={tag}>{tag}</Etiqueta>
              ))}
            </span>
          ) : null}
          {verbete.fonte ? <span className="text-muted-foreground text-[10px]">{verbete.fonte}</span> : null}

          <span className="mt-auto flex flex-wrap gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="sm">
                    <Gift />
                    {texto.darA}
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="max-h-72 w-48">
                <OpcoesDeDarVerbete qual={qual} nome={verbete.nome} Item={KIT_TRES_PONTOS.Item} />
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </div>
      </div>

      {verbete.campos.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          {verbete.campos.map((campo, indice) => (
            <div key={`${indice}-${campo.rotulo}`} className="contents">
              <dt className="text-muted-foreground">{campo.rotulo}</dt>
              <dd className="min-w-0 whitespace-pre-line">
                <TextoComRolagens texto={campo.valor} rotulo={`${verbete.nome} · ${campo.rotulo}`} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {verbete.descricao ? (
        <p className="text-xs leading-relaxed whitespace-pre-line">
          <TextoComRolagens texto={verbete.descricao} rotulo={verbete.nome} />
        </p>
      ) : null}
    </div>
  );
}
