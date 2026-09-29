"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useDeclarativo } from "@/components/playground/declarativo";
import { Button } from "@/components/ui/button";
import { iconeDeExtensao } from "@/lib/extensoes/icones";
import { dadosPublicos, enviarAcao } from "@/lib/player/extensoes";
import { lerSecaoPublica, type SecaoPublica } from "@/lib/player/secao-publica";
import { useFichasVersaoStore } from "@/lib/store/use-fichas-versao-store";
import { cn } from "@/lib/utils";

/**
 * As seções que os plugins publicaram para este personagem, no celular.
 *
 * Uma por plugin que escreveu `secao` na metade pública. Lida a cada mudança
 * do elenco (`fichasVersao`): é o que faz o número que o botão gastou
 * aparecer atualizado no aparelho de quem apertou.
 *
 * Só de plugin habilitado no Mestre: o guardado de um plugin desligado ou
 * desinstalado continua no personagem, e o daemon o entrega como qualquer
 * outro. Quem sabe quem está ligado é o declarativo -- ver
 * `Declarativo.plugins`.
 *
 * O botão manda a ação e mais nada. O que ele "fez" o jogador vê no quadro --
 * o medidor que baixou, o dado que caiu ao lado do retrato --, não numa
 * resposta: o Mestre não tem como responder a um celular específico, e a mesa
 * inteira é o retorno.
 */
export function BlocosDePlugin({
  codigo,
  personagemId,
  className,
}: {
  codigo: string;
  personagemId: string;
  /** Para o cartão dizer em que coluna da grade isto cai. */
  className?: string;
}) {
  const versao = useFichasVersaoStore((state) => state.versao);
  const { plugins } = useDeclarativo();
  const [secoes, setSecoes] = useState<Array<{ extensaoId: string; secao: SecaoPublica }>>([]);

  useEffect(() => {
    let ativo = true;

    void dadosPublicos(codigo, personagemId).then(
      (publicos) => {
        if (!ativo) return;
        setSecoes(
          Object.entries(publicos).flatMap(([extensaoId, publico]) => {
            const secao = lerSecaoPublica(publico);
            return secao ? [{ extensaoId, secao }] : [];
          }),
        );
      },
      () => {
        // Falha de rede não vira tela de erro, como o resto da ficha.
      },
    );

    return () => {
      ativo = false;
    };
  }, [codigo, personagemId, versao]);

  // Na hora de desenhar, e não na leitura: ligar o plugin de volta muda o
  // declarativo, não a ficha, e a seção tem de voltar sem nova ida ao daemon.
  const ligadas = secoes.filter(({ extensaoId }) => plugins.includes(extensaoId));

  if (ligadas.length === 0) return null;

  // UM item da grade do cartão, com as seções empilhadas dentro: cada seção
  // como item próprio quebraria a conta de linhas que o retrato atravessa.
  return (
    <div className={cn("space-y-2", className)}>
      {ligadas.map(({ extensaoId, secao }) => (
        <section
          key={extensaoId}
          className="bg-muted/20 space-y-1.5 rounded-lg border p-2"
        >
          <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            {secao.titulo ?? extensaoId}
          </p>

          <div className="flex flex-col gap-1.5">
            {secao.blocos.map((bloco, indice) => {
              if (bloco.tipo === "texto") {
                return (
                  <p key={indice} className="text-sm leading-snug">
                    {bloco.texto}
                  </p>
                );
              }
              if (bloco.tipo === "valor") {
                return (
                  <p key={indice} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{bloco.rotulo}</span>
                    <span className="font-medium tabular-nums">{bloco.valor}</span>
                  </p>
                );
              }

              const Icone = iconeDeExtensao(bloco.icone);
              return (
                <Botao
                  key={indice}
                  rotulo={bloco.rotulo}
                  Icone={Icone}
                  onClick={() =>
                    enviarAcao(codigo, { personagemId, extensaoId, acao: bloco.acao })
                  }
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Um botão que espera a mesa aceitar antes de aceitar outro toque.
 *
 * Desligado enquanto o pedido está no ar: no Wi-Fi da casa dois toques
 * seguidos virariam dois ataques, e o jogador só queria um.
 */
function Botao({
  rotulo,
  Icone,
  onClick,
}: {
  rotulo: string;
  Icone: ReturnType<typeof iconeDeExtensao>;
  onClick: () => Promise<void>;
}) {
  const [enviando, setEnviando] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      className="justify-start"
      disabled={enviando}
      onClick={() => {
        setEnviando(true);
        onClick()
          .catch((causa) => toast.error(causa instanceof Error ? causa.message : "A mesa não recebeu."))
          .finally(() => setEnviando(false));
      }}
    >
      <Icone />
      {rotulo}
    </Button>
  );
}
