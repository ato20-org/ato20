"use client";

import { Dices } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useCharacters } from "@/hooks/use-characters";
import { chaveDoSistema, sistemasDosPlugins, type SistemaDePlugin } from "@/lib/extensoes/sistemas";
import { t } from "@/lib/i18n/mestre";
import { useCondicoesStore } from "@/lib/store/use-condicoes-store";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import { useMoldeDeDetalhesStore } from "@/lib/store/use-molde-de-detalhes-store";
import { aplicarSistema, type Juntados, type SistemaAplicado } from "@/lib/vault/sistema";

const T = t.sistemaDaCampanha;

/** "5 atributos, 3 medidores, ...", sem o que for zero. */
function partes(contagens: Array<[number, (n: number) => string]>): string {
  return contagens
    .filter(([n]) => n > 0)
    .map(([n, texto]) => texto(n))
    .join(", ");
}

/** O aviso depois de aplicar: o que entrou, o que já havia, o que não coube. */
export function resumoDoAplicado(aplicado: SistemaAplicado): string {
  const listas: Juntados[] = [
    aplicado.atributos,
    aplicado.medidores,
    aplicado.grupos,
    aplicado.detalhes,
    aplicado.condicoes,
  ];
  const entraram = partes([
    [aplicado.atributos.entraram, T.atributos],
    [aplicado.medidores.entraram, T.medidores],
    [aplicado.grupos.entraram, T.grupos],
    [aplicado.detalhes.entraram, T.detalhes],
    [aplicado.condicoes.entraram, T.condicoes],
  ]);
  const jaHavia = listas.reduce((total, lista) => total + lista.jaHavia, 0);
  const naoCouberam = listas.flatMap((lista) => lista.naoCouberam);

  return [
    entraram ? T.entraram(entraram) : T.nadaNovo,
    jaHavia > 0 ? T.jaHavia(jaHavia) : "",
    naoCouberam.length > 0 ? T.naoCouberam(naoCouberam.join(", ")) : "",
    aplicado.alcancados > 0 ? T.alcancados(aplicado.alcancados) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * O tópico Sistema da Configuração da campanha: os sistemas que os plugins
 * ligados trazem, e o botão de aplicar cada um.
 *
 * `aoAplicar` relê o que a janela leu no alto -- os medidores e os atributos
 * da campanha, que a busca usa. O molde, as condições e as fichas abertas
 * releem pelos stores deles, aqui.
 */
export function SistemaDaCampanha({ aoAplicar }: { aoAplicar: () => void }) {
  const extensoes = useExtensoesStore((state) => state.extensoes);
  const carregar = useExtensoesStore((state) => state.carregar);
  const { personagens, recarregar } = useCharacters();
  const quantos = personagens?.length ?? 0;

  const [nosPersonagens, setNosPersonagens] = useState(true);
  const [aplicando, setAplicando] = useState<string | null>(null);

  // A lista do disco ao abrir o tópico: o plugin instalado agora tem de
  // aparecer sem reabrir a janela.
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const sistemas = sistemasDosPlugins(extensoes);

  async function aplicar(item: SistemaDePlugin) {
    const chave = chaveDoSistema(item);
    setAplicando(chave);
    try {
      const aplicado = await aplicarSistema(
        item.extensaoId,
        item.sistema.id,
        nosPersonagens && quantos > 0,
      );

      aoAplicar();
      useMoldeDeDetalhesStore.getState().avisarFichas();
      useCondicoesStore.getState().recarregar();
      recarregar();

      toast.success(T.aplicado(item.sistema.titulo), { description: resumoDoAplicado(aplicado) });
    } catch (causa) {
      toast.error(causa instanceof Error ? causa.message : T.falhou);
    } finally {
      setAplicando(null);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">{T.titulo}</h3>
        <p className="text-muted-foreground text-xs">{T.descricao}</p>
      </div>

      {sistemas.length === 0 ? (
        <div className="text-muted-foreground space-y-1 rounded-md border border-dashed p-3 text-xs">
          <p className="text-foreground font-medium">{T.nenhum}</p>
          <p>{T.nenhumDica}</p>
        </div>
      ) : (
        <>
          {quantos > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="sistema-nos-personagens"
                checked={nosPersonagens}
                onCheckedChange={(marcado) => setNosPersonagens(marcado === true)}
              />
              <Label htmlFor="sistema-nos-personagens" className="text-xs font-normal">
                {T.nosPersonagens(quantos)}
              </Label>
            </div>
          )}

          <ul className="space-y-2">
            {sistemas.map((item) => {
              const { sistema } = item;
              const chave = chaveDoSistema(item);
              const traz = partes([
                [sistema.atributos.length, T.atributos],
                [sistema.medidores.length, T.medidores],
                [sistema.detalhes.grupos.length, T.grupos],
                [sistema.detalhes.modelos.length, T.detalhes],
                [sistema.condicoes.length, T.condicoes],
              ]);

              return (
                <li key={chave} className="flex items-start gap-3 rounded-md border p-3">
                  <Dices className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-medium">{sistema.titulo}</p>
                    <p className="text-muted-foreground text-xs">{T.doPlugin(item.extensaoNome)}</p>
                    {traz && <p className="text-muted-foreground text-xs">{T.traz(traz)}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={aplicando !== null}
                    onClick={() => void aplicar(item)}
                  >
                    {T.aplicar}
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
