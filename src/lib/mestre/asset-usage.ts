import type {
  Ambiente,
  Pad,
  Portrait,
  Scene,
  SessionTrack,
} from "@/types/scene";

/**
 * O som da sessão, do ponto de vista da faxina: tudo que aponta para um asset.
 *
 * Os disparos não entram. Eles duram segundos e não são guardados em lugar
 * nenhum, então apagar um arquivo enquanto o tiro dele soa dá no máximo um som
 * cortado — e não um pad apontando para o nada na próxima sessão.
 */
export type SomEmUso = {
  track?: SessionTrack | null;
  ambientes?: Ambiente[];
  ambientesPorCena?: Record<string, Ambiente[]>;
  pads?: Pad[];
};

/**
 * Em quantos lugares o asset é usado: cenas onde aparece, mais o som da sessão.
 *
 * Serve para barrar a exclusão de um arquivo em uso: apagar deixaria a cena
 * apontando para um `assetId` inexistente, renderizando um retângulo vazio
 * que o mestre não entende de onde veio — ou a trilha apontando para o nada.
 *
 * O som passou a ter camadas, e cada uma é um lugar a mais: a chuva acesa, a
 * chuva que a taverna LEMBRA mesmo apagada, e o pad do numpad. O pior dos três
 * é o pad: ele não está tocando, ninguém o vê, e o mestre só descobre que o
 * arquivo sumiu ao apertar o 7 no meio da cena.
 */
export function countAssetUsage(
  scenes: Scene[],
  assetId: string,
  som?: SomEmUso,
): number {
  const inScenes = scenes.filter(
    (scene) =>
      scene.backgroundAssetId === assetId ||
      scene.items.some((item) => item.assetId === assetId),
  ).length;

  return inScenes + noSom(som, assetId);
}

/** Quantos lugares do som apontam para este asset. */
function noSom(som: SomEmUso | undefined, assetId: string): number {
  if (!som) return 0;

  const lembrados = Object.values(som.ambientesPorCena ?? {}).flat();

  return (
    (som.track?.assetId === assetId ? 1 : 0) +
    (som.ambientes ?? []).filter((a) => a.assetId === assetId).length +
    lembrados.filter((a) => a.assetId === assetId).length +
    (som.pads ?? []).filter((pad) => pad?.assetId === assetId).length
  );
}

/**
 * Todo `assetId` que a mesa depende — cenas, fundos, retratos e som.
 *
 * É o que a faxina do bucket nunca apaga: o binário no Storage é a fonte da TV
 * e do celular do jogador, e tirá-lo de lá deixaria a mesa com retângulos
 * vazios no meio da sessão — ou com o pad 7 mudo.
 */
export function collectUsedAssetIds(
  scenes: Scene[],
  portraits: Portrait[],
  som: SomEmUso,
): Set<string> {
  const used = new Set<string>();

  for (const scene of scenes) {
    if (scene.backgroundAssetId) used.add(scene.backgroundAssetId);
    for (const item of scene.items) used.add(item.assetId);
  }

  for (const portrait of portraits) used.add(portrait.assetId);

  if (som.track) used.add(som.track.assetId);
  for (const ambiente of som.ambientes ?? []) used.add(ambiente.assetId);
  for (const lembrados of Object.values(som.ambientesPorCena ?? {}))
    for (const ambiente of lembrados) used.add(ambiente.assetId);
  for (const pad of som.pads ?? []) if (pad) used.add(pad.assetId);

  return used;
}
