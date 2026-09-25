import { temAnotacao, type Scene } from "@/types/scene";

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
 * A LETRA SOLTA e a FORMA são o caso do meio, e o único: num mapa elas nascem
 * fechadas como o postit, mas o mestre pode abrir uma delas para a mesa pelo
 * olho do gizmo -- é o que deixa um rótulo ("Taverna") e um círculo em volta
 * da emboscada valerem para quem assiste. Aqui isso vira um FILTRO em vez de
 * um `delete`: passa o que foi aberto, some o que não foi. Num quadro nem
 * chega a esta altura -- ele volta inteiro lá em cima.
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

  // O quadro vai INTEIRO: ele é o que o mestre quer mostrar -- a rede de
  // PNJs, a linha do tempo --, e postit, texto e seta são o conteúdo dele, não
  // anotação sobre ele. Cena de mapa continua filtrando abaixo.
  if (!temAnotacao(scene)) return semCamera(scene);

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
    !scene.handout &&
    !scene.extensoes &&
    !scene.cameras &&
    !scene.grupos &&
    !scene.textos &&
    !scene.formas &&
    !scene.ligacoes &&
    !scene.documentos
  )
    return scene;

  // Cópia e `delete`, e não desestruturação com um descarte: um descarte
  // nomeado só para ser ignorado é variável não usada, e a regra que a proíbe
  // está ligada aqui.
  const paraMesa = { ...scene, name: "" };
  delete paraMesa.pins;
  delete paraMesa.postits;
  delete paraMesa.handout;
  delete paraMesa.extensoes;
  // `cameraNoArId` FICA: é um id só, e é o que deixa a TV distinguir a mesma
  // câmera andando (interpola) de uma câmera trocada (corta). Ver
  // `useCorteDeCamera`.
  delete paraMesa.cameras;
  delete paraMesa.grupos;
  // A letra solta e a forma são as DUAS que o mestre abre uma a uma: num mapa
  // elas nascem fechadas e o olho do gizmo é o que manda cada uma para a mesa.
  // Filtradas, então, e não apagadas -- ver `naMesa` em `Texto`.
  //
  // O campo SOME quando nada foi aberto, e não fica como lista vazia: é a
  // ausência que o resto do aplicativo lê como "não tem", e uma lista vazia
  // ainda seria um campo novo no objeto publicado a cada render.
  paraMesa.textos = scene.textos?.filter((texto) => texto.naMesa);
  if (!paraMesa.textos?.length) delete paraMesa.textos;

  paraMesa.formas = scene.formas?.filter((forma) => forma.naMesa);
  if (!paraMesa.formas?.length) delete paraMesa.formas;

  // A seta continua sendo só do quadro: ela amarra postit a postit, e os dois
  // nunca chegam à mesa a partir de um mapa.
  delete paraMesa.ligacoes;
  delete paraMesa.documentos;

  return paraMesa;
}

/**
 * O quadro sem recorte de câmera: a mesa vê a folha inteira.
 *
 * O quadro não tem mais câmera (ver `lerCena` em `camera-actions`), mas um
 * quadro criado antes disso tem o recorte gravado no arquivo -- e ele
 * continuaria mandando na TV, sem nenhum controle no Mestre para mudá-lo. O
 * campo sai na saída em vez de ser apagado do arquivo: apagar reescreveria a
 * cena de quem só abriu o aplicativo, e o dado não atrapalha onde está.
 *
 * O resultado é MEMORIZADO por cena, e não é detalhe: o `usePublisher` decide
 * publicar comparando a identidade da cena, e uma cópia nova por render faria
 * o Mestre publicar sessenta vezes por segundo com ninguém mexendo em nada.
 */
const quadrosSemCamera = new WeakMap<Scene, Scene>();

function semCamera(scene: Scene): Scene {
  if (!scene.camera && !scene.cameras && !scene.cameraNoArId) return scene;

  const guardado = quadrosSemCamera.get(scene);
  if (guardado) return guardado;

  const paraMesa = { ...scene };
  delete paraMesa.camera;
  delete paraMesa.cameras;
  delete paraMesa.cameraNoArId;

  quadrosSemCamera.set(scene, paraMesa);

  return paraMesa;
}
