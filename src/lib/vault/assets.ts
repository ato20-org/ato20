"use client";

import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import {
  AvisoDeImportacao,
  type ProgressoImportacao,
} from "@/lib/vault/aviso-de-importacao";
import { call, daemonAddr, isDesktop } from "@/lib/vault/bridge";
import type {
  AssetKind,
  AssetMeta,
  EscopoAsset,
  TipoDeSom,
} from "@/types/scene";

/**
 * Endereço de um arquivo do acervo.
 *
 * Um caminho só, para as três telas. No Mestre é o loopback do próprio
 * daemon; no celular do jogador é o mesmo daemon pela rede, e aí a página já
 * foi servida por ele — relativo resolve para o lugar certo sozinho.
 *
 * Isto substituiu o par blob-URL-ou-Storage de antes, e com ele foram embora o
 * cache de object URLs, o `revokeAssetUrl` e a classe de vazamento de memória
 * que os dois existiam para conter: quem guarda cópia agora é o cache HTTP do
 * browser, por ETag.
 */
/**
 * Qual tamanho do arquivo se pede.
 *
 * O acervo guarda o ORIGINAL, e ele é quem vai para o zip — e quem o palco
 * volta a pedir quando o mestre amplia. As três reduções existem para quem não
 * precisa dele:
 *
 * - `mini` (160px) para LISTA. Apontar um quadrado de 40px para um mapa de
 *   treze megapixels fazia a webview decodificar 51 MB de bitmap por linha.
 * - `tela` (1920px, JPEG) para o CELULAR do jogador. Ele recebe a mesma cena
 *   que a TV numa tela de 400px, e baixava os 8 MB do arquivo. Medido no mapa
 *   real: 0,44 MB e 13 MB decodificado.
 * - `palco` (4096px, JPEG) para o PALCO do mestre e para a TV, enquanto o plano
 *   está afastado. Com o mapa inteiro na tela, o original de 8192x6144 derrubava
 *   o palco a 19,4 fps e um quadro de 772 ms — ver `useVarianteDoFundo`, que é
 *   quem escolhe entre esta e o original, e `vault/variantes.rs` para as
 *   medidas.
 *
 * Quando a redução não é possível — som, arquivo ilegível, recorte com
 * transparência na variante JPEG, disco cheio — o daemon responde o ORIGINAL
 * nesta mesma rota. Quem chama nunca precisa de plano B.
 *
 * Ver `vault/variantes.rs` no Rust, que gera e guarda em `.ato20/{variante}/`.
 */
export type Variante = "mini" | "tela" | "palco";

export async function assetUrl(
  assetId: string,
  variante?: Variante,
): Promise<string> {
  const caminho = variante
    ? `/asset/${assetId}/${variante}`
    : `/asset/${assetId}`;

  if (!isDesktop()) return caminho;

  const { url } = await daemonAddr();

  return `${url}${caminho}`;
}

export function listAssets(kind?: AssetKind): Promise<AssetMeta[]> {
  return call<AssetMeta[]>("asset_list", { kind: kind ?? null });
}

export function deleteAsset(id: string): Promise<void> {
  return call("asset_delete", { id });
}

/**
 * Guarda a forma da onda de um som.
 *
 * Chamada uma vez por arquivo, depois de a tela decodificar o áudio. O Rust
 * recusa em silêncio um id que não existe ou que não é som — é otimização de
 * desenho, e falhar aqui não pode custar a sessão.
 */
export function setAssetPeaks(id: string, peaks: number[]): Promise<void> {
  return call("asset_set_peaks", { id, peaks });
}

/**
 * Define como um som toca. `undefined` tira o tipo.
 *
 * O Rust recusa em silêncio um id que não existe, um arquivo que não é som e um
 * valor fora dos três: é organização de acervo, e falhar aqui custaria mais do
 * que ela vale.
 */
export function setAssetTipoDeSom(
  id: string,
  tipo: TipoDeSom | undefined,
): Promise<void> {
  return call("asset_set_tipo_de_som", { id, tipo: tipo ?? null });
}

/**
 * Troca o nome de exibição de um arquivo.
 *
 * Só metadado: o binário no disco é nomeado pelo id, e o tipo foi medido na
 * importação. O nome não precisa manter extensão — o Rust recusa em silêncio
 * um nome vazio ou um id que não existe.
 */
export function renameAsset(id: string, name: string): Promise<void> {
  return call("asset_rename", { id, name });
}

/** Move para uma pasta. `undefined` devolve à raiz. */
export function setAssetFolder(
  id: string,
  folderId: string | undefined,
): Promise<void> {
  return call("asset_set_folder", { id, folderId: folderId ?? null });
}

/**
 * Marca ou desmarca o dono de um arquivo.
 *
 * Serve a dois casos: um campo passar a apontar para arquivo que entrou solto,
 * e o acerto dos arquivos que já existiam antes de o escopo existir — ver
 * `useEscopoDosAssets`.
 */
export function setAssetEscopo(
  id: string,
  escopo: EscopoAsset | undefined,
): Promise<void> {
  return call("asset_set_escopo", { id, escopo: escopo ?? null });
}

/**
 * O que a importação devolve.
 *
 * Recusados vem como um motivo por arquivo, e não uma contagem: quem escolheu
 * doze mapas e teve um recusado quer os onze e quer saber qual.
 */
export type ImportResult = {
  aceitos: AssetMeta[];
  recusados: string[];
  /** O mestre parou no meio. O que já entrou está em `aceitos`. */
  cancelado: boolean;
};

/**
 * Traz arquivos de fora para o acervo.
 *
 * Abre o seletor nativo e manda os CAMINHOS ao Rust, que copia do disco para
 * `assets/`. O arquivo não passa pela webview nem por HTTP — era o contrário
 * antes, e além de três travessias para o que o sistema de arquivos faz numa, o
 * limite de corpo do axum (2 MB por padrão) cortava o envio de um mapa grande
 * no meio: o cliente via "load failed" e o log dizia "Error parsing
 * multipart/form-data", nenhum dos dois apontando para o limite.
 *
 * `escopo` marca o dono do arquivo, e com ele a biblioteca deixa de listá-lo:
 * fundo de cena e os dois arquivos de personagem entram por aqui com dono. Sem
 * escopo, o arquivo entra solto e aparece na lista.
 *
 * `null` = o mestre fechou o diálogo, que não é erro.
 */
export async function importAssets(
  kind: AssetKind,
  escopo?: EscopoAsset,
  aoEntrar?: (asset: AssetMeta) => void,
): Promise<ImportResult | null> {
  // `file` é a Biblioteca: qualquer arquivo, sem filtro. O Rust classifica
  // pelo tipo -- imagem vira imagem, som vira som, o resto vira arquivo.
  const escolhidos = await open({
    multiple: true,
    title:
      kind === "image"
        ? "Escolha as imagens"
        : kind === "audio"
          ? "Escolha os sons"
          : "Escolha os arquivos",
    filters:
      kind === "image"
        ? [
            {
              name: "Imagens",
              extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"],
            },
          ]
        : kind === "audio"
          ? [
              {
                name: "Sons",
                extensions: ["mp3", "ogg", "oga", "opus", "wav", "flac", "m4a", "aac"],
              },
            ]
          : undefined,
  });

  if (!escolhidos) return null;

  const paths = Array.isArray(escolhidos) ? escolhidos : [escolhidos];
  if (paths.length === 0) return null;

  return importarCaminhos(paths, escopo, aoEntrar);
}

/**
 * O mesmo que `importAssets`, mas com os caminhos já escolhidos.
 *
 * Quem já os tem é o arrasto vindo do sistema operacional: o Tauri entrega os
 * caminhos do que foi largado sobre a janela, e abrir um seletor de arquivos
 * depois disso seria pedir de novo o que a mão acabou de dar.
 *
 * Quem recusa o que não é imagem nem som é o Rust, um motivo por arquivo — aqui
 * não há filtro de extensão a repetir. Ver `assets::import`.
 */
/**
 * Um arquivo por ida ao Rust, em sequência, e não o lote inteiro numa chamada.
 *
 * O Rust aceita lote, e chamar uma vez seria menos IPC. Mas o lote só responde
 * quando o ÚLTIMO arquivo terminou de copiar e ganhar miniatura, e até lá a
 * lista não muda: três mapas escolhidos de uma vez ficavam três cópias em
 * silêncio e apareciam juntos. Um por chamada, `aoEntrar` acorda a lista a cada
 * aceito, e o primeiro aparece enquanto o segundo ainda copia.
 *
 * Em sequência, e não em paralelo: a cópia é do mesmo disco, e o vault tem uma
 * tranca só. Disparar as três juntas só faria as três brigarem por ela.
 */
/**
 * Traz para o acervo bytes que esta tela tem na mão.
 *
 * É a colagem, e é a única importação em que o arquivo ATRAVESSA a ponte: um
 * print de tela ou uma imagem copiada do navegador nunca existiu no disco, então
 * não há caminho para mandar. As outras mandam o endereço justamente para o
 * arquivo não passar por aqui — ver a nota em `importAssets`.
 *
 * Sem progresso e sem cancelar, ao contrário de `importarCaminhos`: é um arquivo
 * só, e os bytes já estão na memória quando a chamada começa. O que sobra de
 * espera é a gravação em disco, que não dá tempo de mostrar barra.
 */
export function importarBytes(
  nome: string,
  bytes: Uint8Array,
  escopo?: EscopoAsset,
): Promise<ImportResult> {
  return call<ImportResult>("asset_import_bytes", {
    nome,
    // Array comum e não o `Uint8Array`: o que atravessa a ponte é JSON, e o
    // tipado sairia daqui como um objeto de índices — `{"0":137,"1":80,…}` —,
    // que o Rust recusa ao desserializar um `Vec<u8>`.
    bytes: Array.from(bytes),
    escopo: escopo ?? null,
  });
}

export async function importarCaminhos(
  paths: string[],
  escopo?: EscopoAsset,
  aoEntrar?: (asset: AssetMeta) => void,
): Promise<ImportResult> {
  const aceitos: AssetMeta[] = [];
  const recusados: string[] = [];
  let cancelado = false;

  // O id que amarra as três pontas: o comando de importar, o evento de
  // progresso e o comando de cancelar. Escolhido aqui, e não no Rust, para o
  // ouvinte já estar no lugar antes do primeiro bloco copiar.
  const importacao = crypto.randomUUID();

  const aviso = new AvisoDeImportacao(paths, () => {
    void call("asset_import_cancelar", { importacao });
  });

  const parar = await listen<ProgressoImportacao>(
    "importacao-progresso",
    (evento) => {
      if (evento.payload.importacao === importacao)
        aviso.progresso(evento.payload);
    },
  );

  try {
    for (const [indice, path] of paths.entries()) {
      aviso.copiando(indice);

      const parcial = await call<ImportResult>("asset_import", {
        paths: [path],
        escopo: escopo ?? null,
        importacao,
      });

      aceitos.push(...parcial.aceitos);
      recusados.push(...parcial.recusados);

      for (const asset of parcial.aceitos) aoEntrar?.(asset);

      // Cancelado neste arquivo: os seguintes nem vão ao Rust.
      if (parcial.cancelado) {
        cancelado = true;
        break;
      }
    }
  } catch (cause) {
    // O IPC caiu no meio: o que entrou até aqui fica, e o aviso diz onde parou
    // antes de o erro subir para quem chamou.
    aviso.morreu(aceitos.length);
    throw cause;
  } finally {
    parar();
  }

  aviso.terminou(aceitos.length, recusados, cancelado);

  return { aceitos, recusados, cancelado };
}
