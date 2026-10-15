"use client";

import { useState } from "react";
import { Compass, Grid3x3, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/lib/i18n/cenas";
import { importarUVTT } from "@/lib/mestre/importar-uvtt";
import { escolherFundoDaCena, useFundoEmVoo } from "@/lib/mestre/scene-background";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { cn } from "@/lib/utils";
import { DEFAULT_GRID, SCENE_WIDTH } from "@/types/scene";

/** Quantos quadrados cabem na largura do plano, nas opções do "sem mapa". */
const LADOS = [10, 20, 30, 40] as const;

/**
 * O passo seguinte a "Novo mapa": de onde vem o chão.
 *
 * Um mapa novo nascia preto e vazio, e o fundo ficava escondido no menu de
 * três pontos da lista -- o mestre criava, procurava, achava. Agora o mapa
 * pergunta na hora: uma imagem, ou um tabuleiro preto com grade. Fechar sem
 * escolher também vale: fica o plano preto, sem grade, como sempre foi.
 *
 * O plano é sempre 1920 por 1080 -- é a geometria que a TV, o celular e a
 * câmera compartilham --, então "o tamanho" do tabuleiro é quantos quadrados
 * cabem na largura: 20 dá o quadrado de 96 que a grade padrão já usa.
 *
 * O mapa Universal VTT é a imagem com o resto já pronto: as paredes, as portas,
 * as luzes e a grade do próprio desenho. Ver `importarUVTT`.
 */
export function NovoMapaDialog({
  sceneId,
  onFechar,
}: {
  /** O mapa recém-criado. `null` = diálogo fechado. */
  sceneId: string | null;
  onFechar: () => void;
}) {
  const [lado, setLado] = useState<(typeof LADOS)[number]>(20);
  const setSceneGrid = useSceneStore((state) => state.setSceneGrid);
  const importando = useFundoEmVoo((state) =>
    sceneId ? state.cenas.includes(sceneId) : false,
  );

  // Os dois cartões usam a trava do fundo; este diz em qual o giro aparece.
  const [uvttEmCurso, setUvttEmCurso] = useState(false);

  function comImagem() {
    if (!sceneId) return;
    void escolherFundoDaCena(sceneId)
      .then((trocou) => {
        // Cancelou o seletor: o diálogo fica, a pergunta continua de pé.
        if (trocou) onFechar();
      })
      .catch((cause: unknown) =>
        toast.error(cause instanceof Error ? cause.message : t.geral.falhaAoImportar),
      );
  }

  function comUVTT() {
    if (!sceneId) return;

    setUvttEmCurso(true);
    void importarUVTT(sceneId)
      .then((resumo) => {
        // Cancelou o seletor: o diálogo fica, como no cartão da imagem.
        if (!resumo) return;

        toast.success(
          t.novoMapaDialog.uvttImportado(resumo.paredes, resumo.portas, resumo.luzes),
        );
        if (resumo.semFundo) toast.warning(t.novoMapaDialog.uvttSemFundo);
        onFechar();
      })
      // Um texto só para o arquivo que não é mapa e para o que não abriu: para
      // quem escolheu o arquivo, a resposta é a mesma -- este não deu.
      .catch(() => toast.error(t.novoMapaDialog.uvttFalhou))
      .finally(() => setUvttEmCurso(false));
  }

  function semMapa() {
    if (!sceneId) return;
    setSceneGrid(sceneId, {
      ...DEFAULT_GRID,
      size: Math.round(SCENE_WIDTH / lado),
      offsetX: 0,
      offsetY: 0,
    });
    onFechar();
  }

  return (
    <Dialog open={sceneId !== null} onOpenChange={(aberto) => !aberto && onFechar()}>
      {/* O teto na variante `sm:`, e com `min`: a base do diálogo traz
          `sm:max-w-sm`, que vence um `max-w-*` solto a partir de 640px -- as
          três colunas ficavam espremidas em 384px. Ver `ConfiguracoesDialog`. */}
      <DialogContent className="sm:max-w-[min(44rem,calc(100%-2rem))]">
        <DialogTitle>{t.novoMapaDialog.titulo}</DialogTitle>
        <DialogDescription>{t.novoMapaDialog.descricao}</DialogDescription>

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            disabled={importando}
            onClick={comImagem}
            className="hover:bg-accent flex flex-col items-center gap-2 rounded-lg border p-4 text-center disabled:opacity-60"
          >
            {importando && !uvttEmCurso ? (
              <Loader2 className="size-8 animate-spin" />
            ) : (
              <ImageIcon className="size-8" />
            )}
            <span className="font-medium">{t.novoMapaDialog.umaImagem}</span>
            <span className="text-muted-foreground text-xs">
              {t.novoMapaDialog.umaImagemDica}
            </span>
          </button>

          <button
            type="button"
            disabled={importando}
            onClick={comUVTT}
            className="hover:bg-accent flex flex-col items-center gap-2 rounded-lg border p-4 text-center disabled:opacity-60"
          >
            {uvttEmCurso ? (
              <Loader2 className="size-8 animate-spin" />
            ) : (
              <Compass className="size-8" />
            )}
            <span className="font-medium">{t.novoMapaDialog.uvtt}</span>
            <span className="text-muted-foreground text-xs">
              {t.novoMapaDialog.uvttDica}
            </span>
          </button>

          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <Grid3x3 className="size-8" />
              <span className="font-medium">{t.novoMapaDialog.semMapa}</span>
              <span className="text-muted-foreground text-xs">
                {t.novoMapaDialog.semMapaDica}
              </span>
            </div>
            <div
              className="grid grid-cols-4 gap-1"
              role="radiogroup"
              aria-label={t.novoMapaDialog.quadradosNaLargura}
            >
              {LADOS.map((opcao) => (
                <button
                  key={opcao}
                  type="button"
                  role="radio"
                  aria-checked={lado === opcao}
                  onClick={() => setLado(opcao)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-sm tabular-nums",
                    lado === opcao
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-accent",
                  )}
                >
                  {opcao}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={semMapa}>
              {t.novoMapaDialog.criarTabuleiro}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
