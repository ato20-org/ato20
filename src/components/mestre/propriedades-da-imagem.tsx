"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Copy, FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { idioma } from "@/lib/i18n/idioma";
import { t } from "@/lib/i18n/mestre";
import {
  alvoDaImagem,
  medidaDaImagem,
  usosDaImagem,
  type ImagemDaGaleria,
} from "@/lib/mestre/galeria";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useItensStore } from "@/lib/store/use-itens-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { characterAttachmentUrl } from "@/lib/vault/characters";
import { caminhoNaGaleria, mostrarNaPasta } from "@/lib/vault/galeria";

const texto = t.galeria.propriedades;

/**
 * O que se sabe de uma imagem: o "Propriedades" do botão direito, como no
 * gerenciador de arquivos.
 *
 * Diálogo, e não janela da bancada: é consulta de um instante -- ver o tamanho,
 * copiar o caminho, descobrir em que cena o mapa está --, e não algo que fica
 * aberto ao lado da mesa. Só leitura: renomear e mover são de Arquivos, e a
 * Galeria não edita nada.
 *
 * A imagem chega mesmo com o diálogo fechado: quem chama a mantém enquanto a
 * saída anima, e o conteúdo não pode sumir no meio dela.
 */
export function PropriedadesDaImagem({
  imagem,
  aberto,
  onAberto,
}: {
  imagem: ImagemDaGaleria | null;
  aberto: boolean;
  onAberto: (aberto: boolean) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onAberto}>
      <DialogContent className="sm:max-w-md">
        {imagem ? <Conteudo key={imagem.chave} imagem={imagem} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Conteudo({ imagem }: { imagem: ImagemDaGaleria }) {
  const alvo = useMemo(() => alvoDaImagem(imagem), [imagem]);
  const caminho = useCaminho(alvo);
  const medida = medidaDaImagem(imagem);

  // Lidos ao abrir, e não assinados: é a foto do momento em que o mestre
  // pediu, e um diálogo que redesenhasse a cada commit da cena tremeria na mão
  // de quem está lendo.
  const usos = useMemo(
    () =>
      usosDaImagem(imagem, {
        cenas: useSceneStore.getState().board?.scenes ?? [],
        personagens: useCharactersStore.getState().personagens ?? [],
        itens: useItensStore.getState().itens ?? [],
      }),
    [imagem],
  );

  const numero = new Intl.NumberFormat(idioma, { maximumFractionDigits: 1 });
  const exato = new Intl.NumberFormat(idioma);
  const data = new Intl.DateTimeFormat(idioma, { dateStyle: "long", timeStyle: "short" });

  const [mime, tamanho, quando] =
    imagem.origem === "acervo"
      ? [imagem.asset.mimeType, imagem.asset.size, imagem.asset.createdAt]
      : [imagem.anexo.mimeType, imagem.anexo.tamanho, imagem.anexo.modificadoEm];

  const origem =
    imagem.origem === "acervo"
      ? texto.doAcervo
      : texto.anexoDe(
          imagem.anexo.personagem,
          imagem.anexo.autor === "jogador" ? texto.jogador : texto.mestre,
        );

  const lugares = [
    [texto.cenas, usos.cenas],
    [texto.personagens, usos.personagens],
    [texto.itens, usos.itens],
  ] as const;
  const emUso = lugares.filter(([, nomes]) => nomes.length > 0);

  function copiar() {
    if (typeof caminho !== "string") return;

    void navigator.clipboard.writeText(caminho).then(
      () => toast.success(texto.caminhoCopiado),
      () => {},
    );
  }

  return (
    <>
      <DialogHeader className="pr-8">
        {/* Quebra em vez de cortar: o nome é a primeira coisa que se quer ler
            inteira aqui, e é justamente o que a grade corta. */}
        <DialogTitle className="leading-snug break-words">{imagem.nome}</DialogTitle>
        <DialogDescription>{origem}</DialogDescription>
      </DialogHeader>

      <Previa imagem={imagem} />

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
        <Linha rotulo={texto.tipo}>{mime}</Linha>

        {medida ? (
          <Linha rotulo={texto.dimensoes}>
            {texto.medida(
              exato.format(medida.largura),
              exato.format(medida.altura),
              numero.format((medida.largura * medida.altura) / 1_000_000),
            )}
          </Linha>
        ) : null}

        <Linha rotulo={texto.tamanho}>
          {texto.bytes(tamanhoCurto(tamanho, numero), exato.format(tamanho))}
        </Linha>

        {imagem.origem === "acervo" && imagem.asset.animada !== undefined ? (
          <Linha rotulo={texto.animada}>{imagem.asset.animada ? texto.sim : texto.nao}</Linha>
        ) : null}

        {imagem.origem === "acervo" ? (
          <Linha rotulo={texto.dono}>
            {imagem.asset.escopo ? t.galeria.escopo[imagem.asset.escopo] : texto.solta}
          </Linha>
        ) : (
          <Linha rotulo={texto.personagem}>{imagem.anexo.personagem}</Linha>
        )}

        <Linha rotulo={texto.usadaEm}>
          {emUso.length === 0 ? (
            <span className="text-muted-foreground">{texto.emNenhumLugar}</span>
          ) : (
            <span className="flex flex-col gap-0.5">
              {emUso.map(([rotulo, nomes]) => (
                <span key={rotulo}>
                  <span className="text-muted-foreground">{rotulo}: </span>
                  {nomes.join(", ")}
                </span>
              ))}
            </span>
          )}
        </Linha>

        {quando ? (
          <Linha rotulo={imagem.origem === "acervo" ? texto.importadaEm : texto.modificadaEm}>
            {data.format(quando)}
          </Linha>
        ) : null}

        <Linha rotulo={texto.caminho}>
          {caminho === null ? (
            <span className="text-muted-foreground">{texto.lendo}</span>
          ) : caminho === false ? (
            <span className="text-destructive">{texto.caminhoSumiu}</span>
          ) : (
            <span className="font-mono break-all select-text">{caminho}</span>
          )}
        </Linha>

        {imagem.origem === "acervo" ? (
          <Linha rotulo={texto.id}>
            <span className="text-muted-foreground font-mono break-all select-text">
              {imagem.asset.id}
            </span>
          </Linha>
        ) : null}
      </dl>

      <DialogFooter>
        <Button variant="outline" disabled={typeof caminho !== "string"} onClick={copiar}>
          <Copy />
          {texto.copiarCaminho}
        </Button>
        <Button
          disabled={typeof caminho !== "string"}
          onClick={() =>
            void mostrarNaPasta(alvo).catch((cause: unknown) =>
              toast.error(cause instanceof Error ? cause.message : t.galeria.menu.naoAbriu),
            )
          }
        >
          <FolderOpen />
          {t.galeria.menu.mostrarNaPasta}
        </Button>
      </DialogFooter>
    </>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/**
 * Onde o arquivo está. `null` enquanto pergunta, `false` quando sumiu.
 *
 * Perguntado ao Rust, e não montado aqui: é ele quem sabe a pasta da campanha
 * e a extensão com que o acervo gravou o arquivo.
 */
function useCaminho(alvo: ReturnType<typeof alvoDaImagem>): string | false | null {
  const [caminho, setCaminho] = useState<string | false | null>(null);

  useEffect(() => {
    let ativo = true;

    void caminhoNaGaleria(alvo).then(
      (resposta) => {
        if (ativo) setCaminho(resposta);
      },
      () => {
        if (ativo) setCaminho(false);
      },
    );

    return () => {
      ativo = false;
    };
  }, [alvo]);

  return caminho;
}

/**
 * A imagem, maior que na grade e inteira -- `contain`, e não o recorte
 * quadrado do cartão.
 *
 * Do acervo, a redução de tela (1920px): o original de um mapa de treze
 * megapixels para um quadro de 200 pixels de altura seria decodificar 50 MB
 * para nada. Do anexo, o arquivo, pelo IPC: ele não tem redução de tela para o
 * mestre, e é um só por vez.
 */
function Previa({ imagem }: { imagem: ImagemDaGaleria }) {
  return (
    <div className="bg-muted/60 flex h-48 items-center justify-center overflow-hidden rounded-md">
      {imagem.origem === "acervo" ? (
        <PreviaDoAcervo assetId={imagem.asset.id} nome={imagem.nome} />
      ) : (
        <PreviaDoAnexo imagem={imagem} />
      )}
    </div>
  );
}

function PreviaDoAcervo({ assetId, nome }: { assetId: string; nome: string }) {
  const url = useAssetUrl(assetId, "tela");

  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={nome} className="max-h-full max-w-full object-contain" draggable={false} />
  ) : null;
}

function PreviaDoAnexo({ imagem }: { imagem: Extract<ImagemDaGaleria, { origem: "anexo" }> }) {
  const { personagemId, arquivo, tamanho, mimeType, autor } = imagem.anexo;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    let criada: string | null = null;

    void characterAttachmentUrl(personagemId, { arquivo, tamanho, mimeType, autor }).then(
      (endereco) => {
        if (!ativo) {
          URL.revokeObjectURL(endereco);
          return;
        }

        criada = endereco;
        setUrl(endereco);
      },
      () => {},
    );

    return () => {
      ativo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [personagemId, arquivo, tamanho, mimeType, autor]);

  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={arquivo} className="max-h-full max-w-full object-contain" draggable={false} />
  ) : null;
}

/** "2,4 MB", "512 KB", "87 B". O exato vai ao lado, entre parênteses. */
function tamanhoCurto(bytes: number, numero: Intl.NumberFormat): string {
  if (bytes >= 1024 * 1024) return `${numero.format(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${numero.format(bytes / 1024)} KB`;
  return `${bytes} B`;
}
