import type { Scene } from "@/types/scene";

/**
 * A cena como a mesa pode vê-la.
 *
 * Existe por uma razão de segurança, não de tamanho. O que o Operador publica
 * é o objeto `Scene` inteiro; o daemon o guarda e o reemite por SSE para
 * qualquer um que tenha o código da mesa. Com os pontos de anotação dentro da
 * cena — e é onde eles têm de estar, porque são coordenadas nela —, a nota do
 * mestre, a descrição do que está atrás da porta e a lista de anexos chegariam
 * ao celular do jogador. Não faria diferença nenhuma que a tela não os
 * desenhasse: o dado está no quadro, e ler o quadro é abrir o inspetor do
 * navegador.
 *
 * Então a remoção acontece aqui, e é chamada de dentro do `usePublisher` — não
 * de quem o chama. A diferença importa: no chamador, um caminho de publicação
 * novo que alguém escrever amanhã vaza por esquecimento; dentro do publicador,
 * todo caminho passa por aqui por construção.
 *
 * A segunda barreira é estrutural e mora noutro arquivo: quem desenha os
 * alfinetes é uma camada do `OperatorStage`, e não o `SceneLayer` que o
 * Assistir e a Plateia usam. Uma das duas barreiras bastaria; as duas juntas
 * significam que vazar exigiria dois erros independentes.
 *
 * A regra para campo novo em `Scene` é uma pergunta: se um jogador ler isto,
 * estraga a surpresa? Se sim, ele entra na lista abaixo.
 */
export function sceneForTable(scene: Scene | null): Scene | null {
  if (!scene) return null;

  // Cena sem pontos devolve a MESMA referência, e não uma cópia.
  //
  // Não é economia de memória: o `usePublisher` compara a cena por
  // identidade para decidir se publica. Uma cópia nova a cada render faria o
  // Operador publicar 60 vezes por segundo enquanto ninguém mexe em nada.
  if (!scene.pins) return scene;

  // Cópia e `delete`, e não desestruturação com um descarte: um descarte
  // nomeado só para ser ignorado é variável não usada, e a regra que a proíbe
  // está ligada aqui.
  const paraMesa = { ...scene };
  delete paraMesa.pins;

  return paraMesa;
}
