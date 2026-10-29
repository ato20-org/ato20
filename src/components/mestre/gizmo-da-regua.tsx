"use client";

import { EscolhaDaForma, FORMAS_DA_REGUA } from "@/components/mestre/painel-da-regua";
import { TransformHandles } from "@/components/playground/transform-handles";
import { boundsToBox } from "@/lib/geometry/bounds";
import { caixaDaRegua, trocarFormaDaRegua } from "@/lib/geometry/regua";
import { t } from "@/lib/i18n/ferramentas";
import { removeMedidorSelection } from "@/lib/mestre/item-actions";
import { useSceneStore } from "@/lib/store/use-scene-store";
import type { Regua } from "@/types/scene";

/**
 * O gizmo da régua selecionada: a fileira de botões em cima dela -- a forma,
 * o cadeado da medida e a lixeira --, como a dos outros elementos do mapa.
 *
 * Só a fileira, como na porta: sem caixa, alças nem giro. As alças da régua
 * são as duas pontas, que a `ReguaLayer` já desenha, e a caixa é só onde a
 * fileira se apoia -- a que cerca o desenho, para a do círculo não cair no
 * meio da área. Ver `caixaDaRegua`.
 *
 * O cadeado trava a MEDIDA, e não o lugar: travada, a ponta gira e a régua
 * anda, e a lixeira continua. Ver `Regua.travada`.
 *
 * A forma está aqui E no painel do canto, que também tem a cor: aqui é o
 * gesto de quem está olhando para a régua, lá é onde se ajusta com calma.
 */
export function GizmoDaRegua({ sceneId, regua }: { sceneId: string; regua: Regua }) {
  const updateMedidor = useSceneStore((state) => state.updateMedidor);
  const forma = FORMAS_DA_REGUA[regua.forma];

  return (
    <TransformHandles
      key={regua.id}
      box={{ ...boundsToBox(caixaDaRegua(regua)), rotation: 0 }}
      handles={[]}
      rotatable={false}
      outline={false}
      onChange={() => {}}
      condicoes={
        <EscolhaDaForma
          forma={regua.forma}
          comRotulo={false}
          onEscolher={(nova) => updateMedidor(sceneId, regua.id, trocarFormaDaRegua(regua, nova))}
        />
      }
      botaoDoPainel={{ rotulo: `${t.regua.forma}: ${forma.rotulo}`, icone: forma.icone }}
      trava={{
        travada: Boolean(regua.travada),
        soOTamanho: true,
        onToggle: () =>
          updateMedidor(sceneId, regua.id, { travada: regua.travada ? undefined : true }),
      }}
      onDelete={removeMedidorSelection}
    />
  );
}
