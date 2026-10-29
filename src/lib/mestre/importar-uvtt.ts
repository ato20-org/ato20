import { open } from "@tauri-apps/plugin-dialog";

import { t } from "@/lib/i18n/cenas";
import { converterUVTT, lerUVTT } from "@/lib/importacao/uvtt";
import { porFundoImportado, useFundoEmVoo } from "@/lib/mestre/scene-background";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { call } from "@/lib/vault/bridge";
import type { AssetMeta } from "@/types/scene";

/** O que `uvtt_ler` devolve. Espelho de `commands::UvttLido`. */
type UvttLido = {
  json: string;
  fundo: AssetMeta | null;
  recusados: string[];
};

export type ResumoDoUVTT = {
  paredes: number;
  portas: number;
  luzes: number;
  /** O mapa entrou sem a imagem: ela não se lia, ou o acervo a recusou. */
  semFundo: boolean;
};

/**
 * Importa um mapa Universal VTT para a cena: a imagem vira o fundo, e as
 * paredes, as portas, as luzes e a grade entram por cima.
 *
 * Pelo seletor NATIVO, e não por um `<input type="file">`: o Rust lê o arquivo
 * pelo caminho, e a imagem -- dezenas de megabytes num mapa grande -- vai do
 * disco para o acervo sem passar pela tela. Ver `uvtt.rs`.
 *
 * A cena muda num passo só do histórico: um Ctrl+Z desfaz a importação
 * inteira, e não a grade aqui e as paredes ali. O fundo fica de fora, como em
 * toda troca de fundo -- ver `setBackground`.
 *
 * Usa a mesma trava do fundo (`useFundoEmVoo`): é um fundo chegando, e a lista
 * de cenas já mostra o giro e segura o menu enquanto ele chega.
 *
 * Devolve `null` quando o mestre fechou o seletor, que não é erro. Arquivo que
 * não é mapa lança `ErroDeUVTT`; o resto lança como veio.
 */
export async function importarUVTT(sceneId: string): Promise<ResumoDoUVTT | null> {
  const caminho = await open({
    multiple: false,
    title: t.novoMapaDialog.escolhaUVTT,
    filters: [
      {
        name: t.novoMapaDialog.uvtt,
        extensions: ["dd2vtt", "df2vtt", "uvtt", "json"],
      },
    ],
  });
  if (typeof caminho !== "string") return null;

  useFundoEmVoo.getState().entrou(sceneId);

  try {
    const lido = await call<UvttLido>("uvtt_ler", { caminho });
    const conversao = converterUVTT(lerUVTT(lido.json));

    if (lido.fundo) await porFundoImportado(sceneId, lido.fundo.id);

    useSceneStore.getState().updateScene(sceneId, (scene) => ({
      ...scene,
      grid: conversao.grid,
      paredes: [...(scene.paredes ?? []), ...conversao.paredes],
      portas: [...(scene.portas ?? []), ...conversao.portas],
      luzes: [...(scene.luzes ?? []), ...conversao.luzes],
      ...(conversao.escuridao !== undefined ? { escuridao: conversao.escuridao } : {}),
    }));

    return {
      paredes: conversao.paredes.length,
      portas: conversao.portas.length,
      luzes: conversao.luzes.length,
      semFundo: !lido.fundo,
    };
  } finally {
    useFundoEmVoo.getState().saiu(sceneId);
  }
}
