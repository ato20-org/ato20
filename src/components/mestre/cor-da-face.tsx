"use client";

import { Pipette } from "lucide-react";

import { CorLivre } from "@/components/mestre/seletor-de-cor";
import { t } from "@/lib/i18n/ferramentas";
import { cn } from "@/lib/utils";

/**
 * Os tons que a face da parede oferece de cara, no mapa de esguelha.
 *
 * Materiais, e não cores: a pedra, a pedra clara da cal, a pedra escura, a
 * madeira e a hera. O primeiro botão, antes deles, é "Do mapa" -- a cor lida
 * do desenho, que acerta na maioria das vezes. O tom exato vem da cor livre.
 */
export const CORES_DA_FACE = [
  "#78716c",
  "#d6d3d1",
  "#44403c",
  "#92400e",
  "#3f6212",
] as const;

/** Uma bolinha de cor da fileira. */
function Bolinha({
  cor,
  marcada,
  rotulo,
  onClick,
}: {
  cor: string;
  marcada: boolean;
  rotulo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      aria-pressed={marcada}
      className={cn(
        "size-5 shrink-0 rounded-full border transition-transform",
        marcada ? "border-foreground scale-110" : "border-white/20 hover:scale-105",
      )}
      style={{ background: cor }}
      onClick={onClick}
    />
  );
}

/**
 * A cor da face de uma parede: "Do mapa", as sugestões, a paleta, a cor livre
 * e o conta-gotas.
 *
 * Mora em dois lugares: o painel de Elementos, para a PRÓXIMA parede, e o gizmo
 * da parede no 2.5D, para a que já está no mapa -- que é onde a face se vê, e
 * onde dá para conferir a escolha. `undefined` é "Do mapa": a cor lida do
 * desenho, e o campo ausente na cena. Ver `Parede.cor`.
 *
 * As sugestões e o conta-gotas só existem no gizmo: os dois leem o mapa em
 * volta de uma parede que já existe, e a próxima ainda não tem lugar.
 */
export function CorDaFace({
  cor,
  onCor,
  sugestoes = [],
  contaGotas,
}: {
  cor: string | undefined;
  onCor: (cor: string | undefined) => void;
  /**
   * As cores do pedaço de mapa que a parede cobre, da mais presente para a
   * menos. Ver `paletaDaArea`.
   */
  sugestoes?: readonly string[];
  /** O conta-gotas: pegar a cor de qualquer lugar do mapa. */
  contaGotas?: { ativo: boolean; onAlternar: () => void };
}) {
  return (
    <div className="flex items-center gap-1.5">
      {/* Do mapa na frente: é o padrão, e é o que se escolhe de volta. */}
      <button
        type="button"
        aria-pressed={cor === undefined}
        className={cn(
          "h-5 shrink-0 rounded-full border px-2 text-[10px] transition-transform",
          cor === undefined
            ? "border-foreground"
            : "text-muted-foreground border-white/20 hover:scale-105",
        )}
        onClick={() => onCor(undefined)}
      >
        {t.elementos.doMapa}
      </button>
      {sugestoes.map((opcao) => (
        <Bolinha
          key={`s-${opcao}`}
          cor={opcao}
          marcada={opcao === cor}
          rotulo={t.elementos.sugestaoDaArea(opcao)}
          onClick={() => onCor(opcao)}
        />
      ))}
      {sugestoes.length > 0 ? (
        <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-white/15" />
      ) : null}
      {CORES_DA_FACE.map((opcao) => (
        <Bolinha
          key={opcao}
          cor={opcao}
          marcada={opcao === cor}
          rotulo={t.elementos.corDaFaceOpcao(opcao)}
          onClick={() => onCor(opcao)}
        />
      ))}
      <CorLivre
        cor={cor}
        // As sugestões também: a cor tirada delas é delas, e não livre.
        paleta={[...CORES_DA_FACE, ...sugestoes]}
        rotulo={t.elementos.outraCor}
        onCor={onCor}
      />
      {contaGotas ? (
        <button
          type="button"
          aria-label={t.elementos.contaGotas}
          title={t.elementos.contaGotas}
          aria-pressed={contaGotas.ativo}
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
            contaGotas.ativo
              ? "bg-primary text-primary-foreground border-transparent"
              : "text-muted-foreground hover:text-foreground border-white/20",
          )}
          onClick={contaGotas.onAlternar}
        >
          <Pipette className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
