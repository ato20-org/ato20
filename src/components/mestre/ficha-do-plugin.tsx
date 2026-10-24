"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Skull, UserPlus } from "lucide-react";

import { AtributosDasRolagens } from "@/components/atributos-das-rolagens";
import { GradeDeAtributos } from "@/components/mestre/atributos-personagem";
import { Etiqueta, falhou, ImagemDoPlugin } from "@/components/mestre/compendio-cartao";
import { TextoComRolagens } from "@/components/mestre/texto-com-rolagens";
import {
  AtributosEmImagem,
  CAIXA_DO_LUGAR,
  estiloDoLugar,
  useEstiloDosAtributos,
} from "@/components/playground/atributos-em-imagem";
import { Button } from "@/components/ui/button";
import { useCharacters } from "@/hooks/use-characters";
import { repartirAtributos } from "@/lib/atributos-em-imagem";
import { useAura } from "@/lib/extensoes/auras";
import { chaveContribuicao } from "@/lib/extensoes/manifesto";
import { t } from "@/lib/i18n/mestre";
import { avisarDoTrazido } from "@/lib/mestre/bestiario";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import type { EstiloDeAtributosPublicado } from "@/lib/sync/declarativo";
import {
  fichaDoBestiario,
  porEmJogoDoBestiario,
  trazerDoBestiario,
  type DetalheDaFichaDoPlugin,
  type FichaCompletaDoPlugin,
  type QualFicha,
} from "@/lib/vault/bestiario";

const texto = t.compendio;

/**
 * A ficha de um plugin, para LER sem trazer: o que o card do bestiário abre.
 *
 * Só de leitura, e de propósito: folhear as ameaças não pode encher o
 * Compêndio da campanha de cópias. Quem quer mexer traz, e quem quer usar põe
 * em jogo -- os dois botões do topo, os mesmos do card. Ver
 * `bestiario::ficha`.
 *
 * Desenho próprio, e não a ficha de sempre: aquela lê e grava pelo id de um
 * personagem da campanha, e esta ficha ainda não é de campanha nenhuma. Os
 * grupos vêm do arquivo do plugin, na ordem dele, com a exibição de cada um.
 */
export function FichaDoPluginBody({ extensaoId, colecaoId, moldeId }: QualFicha) {
  const [lida, setLida] = useState<
    { qual: string; ficha: FichaCompletaDoPlugin } | { qual: string; erro: string } | null
  >(null);
  // Relê quando a lista de plugins muda: o plugin atualizado traz a ficha nova,
  // e o desligado fecha a porta.
  const extensoes = useExtensoesStore((estado) => estado.extensoes);
  const qual = `${extensaoId}/${colecaoId}/${moldeId}`;

  useEffect(() => {
    let ativo = true;

    void fichaDoBestiario({ extensaoId, colecaoId, moldeId }).then(
      (ficha) => {
        if (ativo) setLida({ qual, ficha });
      },
      (cause) => {
        if (ativo) setLida({ qual, erro: cause instanceof Error ? cause.message : String(cause) });
      },
    );

    return () => {
      ativo = false;
    };
  }, [extensaoId, colecaoId, moldeId, qual, extensoes]);

  // A leitura de outra ficha não vale para esta: a janela reaproveitada mostra
  // "lendo" em vez da ameaça anterior.
  if (!lida || lida.qual !== qual) return <p className="text-muted-foreground p-4 text-xs">{texto.lendo}</p>;
  if ("erro" in lida)
    return <p className="text-destructive p-4 text-xs">{texto.fichaNaoAbriu(lida.erro)}</p>;

  return <Ficha qual={{ extensaoId, colecaoId, moldeId }} ficha={lida.ficha} />;
}

function Ficha({ qual, ficha }: { qual: QualFicha; ficha: FichaCompletaDoPlugin }) {
  const { recarregar } = useCharacters();
  const { molde, grupos } = ficha;
  const aura = useAura(ficha.aura ? chaveContribuicao(qual.extensaoId, ficha.aura) : null);
  // O desenho dos atributos que a campanha escolheu (o ritual do Ordem): as
  // siglas com lugar na imagem vão para ela, o resto fica na grade. Sem estilo,
  // ou numa campanha de outro sistema, cai na grade de sempre.
  const estilo = useEstiloDosAtributos();
  // O retrato, ou a peça: o que for arquivo da pasta. A imagem por URL só é
  // baixada ao trazer, como no card.
  const imagem = [molde.retrato, molde.miniatura].find((valor) => valor && !valor.includes("://"));

  function porAgora() {
    void porEmJogoDoBestiario(qual).then(({ trazido, personagem }) => {
      recarregar();
      toast.success(texto.emJogo(personagem.nome));
      avisarDoTrazido(trazido);
    }, falhou);
  }

  function trazer() {
    void trazerDoBestiario(qual).then((trazido) => {
      recarregar();
      toast.success(
        trazido.jaHavia ? texto.jaNaCampanha(trazido.molde.nome) : texto.trazido(trazido.molde.nome),
      );
      avisarDoTrazido(trazido);
    }, falhou);
  }

  // Os grupos na ordem do arquivo, só os que a ficha usa.
  const porGrupo = grupos
    .map((grupo) => ({ grupo, detalhes: molde.detalhes.filter((detalhe) => detalhe.grupo === grupo.nome) }))
    .filter(({ detalhes }) => detalhes.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      <div className="flex gap-3">
        <span
          className="bg-muted/60 relative flex aspect-[4/5] w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border"
          style={aura ? { borderColor: aura.cor } : undefined}
        >
          {imagem ? (
            <ImagemDoPlugin extensaoId={qual.extensaoId} caminho={imagem} />
          ) : (
            <Skull className="text-muted-foreground size-8" aria-hidden />
          )}
        </span>

        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-base leading-tight font-semibold">{molde.nome}</h2>
          {molde.tags.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {molde.tags.map((tag) => (
                <Etiqueta key={tag}>{tag}</Etiqueta>
              ))}
            </span>
          ) : null}
          {molde.fonte ? <span className="text-muted-foreground text-[10px]">{molde.fonte}</span> : null}

          <span className="mt-auto flex flex-wrap gap-1.5">
            <Button size="sm" onClick={porAgora}>
              <UserPlus />
              {texto.porEmJogo}
            </Button>
            <Button size="sm" variant="outline" onClick={trazer}>
              <Download />
              {texto.trazer}
            </Button>
          </span>
        </div>
      </div>

      {molde.medidores.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {molde.medidores.map((medidor) => (
            <li
              key={medidor.nome}
              className="bg-muted/40 flex items-baseline gap-1.5 rounded-md border px-2 py-1 text-xs"
            >
              <span className="text-muted-foreground font-medium">{medidor.nome}</span>
              <span className="font-semibold tabular-nums">{medidor.maximo}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {molde.atributos.length > 0 ? (
        <AtributosDoMolde atributos={molde.atributos} estilo={estilo} />
      ) : null}

      {/* As siglas entre chaves leem os atributos desta ameaça, e a menção
          os detalhes dela: o bestiário escreve a regra uma vez, e cada ficha
          rola com os dela. */}
      <AtributosDasRolagens atributos={molde.atributos} detalhes={molde.detalhes}>
        {porGrupo.map(({ grupo, detalhes }) => (
          <section key={grupo.nome} aria-label={grupo.nome} className="flex flex-col gap-1.5">
            <h3 className="text-muted-foreground text-xs font-medium">{grupo.nome}</h3>
            {grupo.exibicao === "lista" ? (
              <ul className="flex flex-col gap-2">
                {detalhes.map((detalhe) => (
                  <ItemDaLista key={detalhe.rotulo} detalhe={detalhe} rotulo={`${molde.nome} · ${detalhe.rotulo}`} />
                ))}
              </ul>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {detalhes.map((detalhe) => (
                  <Linha key={detalhe.rotulo} detalhe={detalhe} rotulo={`${molde.nome} · ${detalhe.rotulo}`} />
                ))}
              </dl>
            )}
          </section>
        ))}
      </AtributosDasRolagens>
    </div>
  );
}

/**
 * Os atributos do molde na prévia, só de leitura. Com o estilo que a campanha
 * escolheu (o ritual do Ordem), as siglas com lugar vão para a imagem e o resto
 * para a grade embaixo; sem estilo, ou com a imagem que não carrega, fica só a
 * grade. O número é texto, e não campo: a prévia não grava. Ver
 * `AtributosEmImagem` e `AtributosPersonagem`.
 */
function AtributosDoMolde({
  atributos,
  estilo,
}: {
  atributos: FichaCompletaDoPlugin["molde"]["atributos"];
  estilo: EstiloDeAtributosPublicado | null;
}) {
  const grade = (lista: FichaCompletaDoPlugin["molde"]["atributos"]) => (
    <GradeDeAtributos>
      {lista.map((atributo) => (
        <li
          key={atributo.sigla}
          className="bg-muted/40 flex flex-col items-center rounded-md border px-1 pt-1.5 pb-1"
          title={atributo.descricao ?? undefined}
        >
          <span className="text-muted-foreground text-[10px] font-medium uppercase">{atributo.sigla}</span>
          <span className="text-lg leading-tight font-semibold tabular-nums">{atributo.valor}</span>
        </li>
      ))}
    </GradeDeAtributos>
  );

  if (!estilo) return grade(atributos);

  const { noLugar, fora } = repartirAtributos(atributos, estilo.lugares);

  return (
    <div className="space-y-2">
      <AtributosEmImagem
        estilo={estilo}
        reserva={noLugar.length > 0 ? grade(noLugar.map(({ atributo }) => atributo)) : null}
      >
        {noLugar.map(({ atributo, lugar }) => (
          <span
            key={atributo.sigla}
            className={CAIXA_DO_LUGAR}
            style={estiloDoLugar(lugar, estilo)}
            title={atributo.descricao ?? undefined}
          >
            {atributo.valor}
          </span>
        ))}
      </AtributosEmImagem>

      {fora.length > 0 ? grade(fora) : null}
    </div>
  );
}

/** O valor como a ficha o mostra: o número, o texto, a opção escolhida. */
function valorDe(detalhe: DetalheDaFichaDoPlugin): string | null {
  return detalhe.valor === null || detalhe.valor === undefined || detalhe.valor === ""
    ? null
    : String(detalhe.valor);
}

/**
 * Uma linha de grupo em linhas: o rótulo e o valor, e a descrição embaixo. As
 * rolagens entre chaves rolam daqui mesmo, com o nome da ameaça no fio: dá
 * para jogar a Percepção do Diabo sem trazê-lo. Ver `TextoComRolagens`.
 */
function Linha({ detalhe, rotulo }: { detalhe: DetalheDaFichaDoPlugin; rotulo: string }) {
  const valor = valorDe(detalhe);

  return (
    <>
      <dt className="text-muted-foreground">{detalhe.rotulo}</dt>
      <dd className="min-w-0">
        {valor ? <TextoComRolagens texto={valor} rotulo={rotulo} /> : "—"}
        {detalhe.descricao ? (
          <p className="text-muted-foreground mt-0.5 whitespace-pre-line">
            <TextoComRolagens texto={detalhe.descricao} rotulo={rotulo} />
          </p>
        ) : null}
      </dd>
    </>
  );
}

/** Um item de grupo em lista: a ação, o poder. O nome, o tipo dela e o texto. */
function ItemDaLista({ detalhe, rotulo }: { detalhe: DetalheDaFichaDoPlugin; rotulo: string }) {
  const valor = valorDe(detalhe);

  return (
    <li className="bg-muted/30 rounded-md border px-2 py-1.5 text-xs">
      <span className="flex flex-wrap items-baseline gap-1.5">
        <span className="font-medium">{detalhe.rotulo}</span>
        {valor ? <Etiqueta>{valor}</Etiqueta> : null}
      </span>
      {detalhe.descricao ? (
        <p className="text-muted-foreground mt-1 whitespace-pre-line">
          <TextoComRolagens texto={detalhe.descricao} rotulo={rotulo} />
        </p>
      ) : null}
    </li>
  );
}
