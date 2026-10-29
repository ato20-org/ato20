"use client";

import { useEffect } from "react";

import { publicarSegurados } from "@/hooks/use-scene-broadcast";
import { useGestoStore } from "@/lib/store/use-gesto-store";
import { useSceneStore } from "@/lib/store/use-scene-store";

/**
 * Conta à mesa quais tokens estão na mão do mestre, para o celular não
 * disputá-los. Ver `LiveState.seguradosPeloMestre`.
 *
 * Assina o store do gesto, e não cada caminho que começa ou termina um
 * arrasto: são muitos -- o item, o grupo, o gizmo, o cancelar --, e todos
 * passam por ele. O store muda a cada quadro do arrasto, mas a LISTA só muda
 * ao pegar e ao soltar, e é só então que alguma coisa sai: a comparação pela
 * chave segura o resto.
 *
 * Só a cena no ar conta. A que o mestre está preparando ninguém vê, e um
 * token dela com o mesmo id não pode travar o celular de ninguém.
 */
export function useSeguradosDoMestre(): void {
  useEffect(() => {
    let publicados = "";

    function conferir() {
      const { sceneId, patches } = useGestoStore.getState();
      const noAr = useSceneStore.getState().board?.liveSceneId;
      const ids =
        patches && sceneId !== null && sceneId === noAr
          ? patches.map((patch) => patch.id).sort()
          : [];

      const chave = ids.join(",");
      if (chave === publicados) return;

      publicados = chave;
      publicarSegurados(ids);
    }

    const parar = useGestoStore.subscribe(conferir);

    return () => {
      parar();
      // A janela fechando com a mão fechada não pode deixar o token preso no
      // celular de ninguém.
      publicarSegurados([]);
    };
  }, []);
}
