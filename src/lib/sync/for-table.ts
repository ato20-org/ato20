import type { Scene } from "@/types/scene";

/**
 * A cena como a mesa pode vê-la.
 *
 * Existe por uma razão de segurança, não de tamanho. O que o Mestre publica
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
 * O mesmo vale para os POSTITS, e por eles o vazamento seria pior: a nota de um
 * alfinete está fechada até alguém clicar nele, mas o postit existe para ter o
 * texto à vista — o que se escreve nele é a fala que o PNJ vai dar, o número
 * que o teste pede, quem na mesa está mentindo. E o `@personagem` ali dentro é
 * o personagem de quem está lendo.
 *
 * A segunda barreira é estrutural e mora noutro arquivo: quem desenha os
 * alfinetes e os postits são camadas do `MestreStage`, e não o `SceneLayer`
 * que o Espectador e o Jogador usam. Uma das duas barreiras bastaria; as duas
 * juntas significam que vazar exigiria dois erros independentes.
 *
 * O guardado das EXTENSÕES entra pela mesma porta, e por um motivo a mais: o
 * formato é do plugin e o aplicativo não sabe o que tem dentro. Publicar o que
 * não se consegue ler seria apostar que nenhum autor de plugin vai guardar ali
 * a nota do mestre — e o padrão tem de ser o seguro, não o otimista.
 *
 * O NOME da cena sai pela mesma pergunta, e é o caso em que ela se responde
 * sozinha: o mestre batiza a cena para ele mesmo achá-la na lista, e batiza
 * pelo que ela é — "Emboscada no Porão", "O traidor se revela". O nome chega
 * antes da cena e conta o final dela. Aqui ele vira string vazia em vez de
 * sumir do objeto porque `name` é obrigatório no tipo `Scene`, e a mesa não
 * desenha nome nenhum.
 *
 * A regra para campo novo em `Scene` é uma pergunta: se um jogador ler isto,
 * estraga a surpresa? Se sim, ele entra na lista abaixo.
 */
export function sceneForTable(scene: Scene | null): Scene | null {
  if (!scene) return null;

  // Cena sem nada do mestre devolve a MESMA referência, e não uma cópia.
  //
  // Não é economia de memória: o `usePublisher` compara a cena por
  // identidade para decidir se publica. Uma cópia nova a cada render faria o
  // Mestre publicar 60 vezes por segundo enquanto ninguém mexe em nada.
  //
  // A condição precisa cobrir TODOS os campos apagados abaixo. Um campo novo
  // aqui esquecido não vaza — o `delete` continua acontecendo —, mas um campo
  // apagado embaixo e esquecido nesta linha faz o Mestre publicar por frame.
  if (
    !scene.name &&
    !scene.pins &&
    !scene.postits &&
    !scene.extensoes &&
    !scene.cameras
  )
    return scene;

  // Cópia e `delete`, e não desestruturação com um descarte: um descarte
  // nomeado só para ser ignorado é variável não usada, e a regra que a proíbe
  // está ligada aqui.
  const paraMesa = { ...scene, name: "" };
  delete paraMesa.pins;
  delete paraMesa.postits;
  delete paraMesa.extensoes;
  // `cameraNoArId` FICA: é um id só, e é o que deixa a TV distinguir a mesma
  // câmera andando (interpola) de uma câmera trocada (corta). Ver
  // `useCorteDeCamera`.
  delete paraMesa.cameras;

  return paraMesa;
}
