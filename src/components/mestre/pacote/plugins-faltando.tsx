"use client";

import { useState } from "react";
import { Check, Download, Loader2, Undo2, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { buscarCatalogo, lerManifestoDoRepositorio } from "@/lib/extensoes/catalogo";
import { comum } from "@/lib/i18n/comum";
import { t as textoDoDesktop } from "@/lib/i18n/desktop";
import { t } from "@/lib/i18n/mestre";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import type { PluginDoPacote } from "@/lib/vault/pacote";

/** Um pedido de instalação esperando o mestre confirmar. */
type Pedido = { plugin: PluginDoPacote; repositorio: string; autor: string | null };

/**
 * Os plugins que o que vai entrar cita e esta máquina não tem.
 *
 * **Baixar** instala pelo mesmo caminho do Catálogo (o Rust baixa o zip do
 * repositório, ver `catalogo.rs`), achando o repositório no catálogo do site
 * ou, fora dele, no que o pacote anotou. Plugin que executa código pede
 * confirmação antes, como no Catálogo.
 *
 * **Remover** tira o plugin do que entra: estilo de medidor volta ao padrão,
 * efeito dele sai, e os dados e configurações dele ficam de fora. Ver
 * `tirar_plugins` em `vault/pacote.rs`.
 *
 * Sem nenhum dos dois, a referência entra igual, e o ATO20 desenha o de
 * fábrica até o plugin chegar.
 */
export function PluginsFaltando({
  plugins,
  removidos,
  onRemover,
}: {
  plugins: PluginDoPacote[];
  removidos: ReadonlySet<string>;
  onRemover: (id: string, remover: boolean) => void;
}) {
  const instalados = useExtensoesStore((state) => state.extensoes);
  const instalando = useExtensoesStore((state) => state.instalando);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [procurando, setProcurando] = useState<string | null>(null);

  if (plugins.length === 0) return null;

  const jaTem = new Set(instalados.map((extensao) => extensao.id));
  const nomeDe = (plugin: PluginDoPacote) => plugin.nome ?? plugin.id;

  async function instalar({ plugin, repositorio }: Pedido) {
    const erro = await useExtensoesStore.getState().instalar(plugin.id, repositorio);
    if (erro) {
      toast.error(textoDoDesktop.configuracoes.plugins.catalogo.falhou(nomeDe(plugin)), {
        description: erro,
      });
      return;
    }
    toast.success(textoDoDesktop.configuracoes.plugins.catalogo.instaladoAgora(nomeDe(plugin)));
  }

  async function baixar(plugin: PluginDoPacote) {
    setProcurando(plugin.id);
    try {
      const catalogo = await buscarCatalogo().catch(() => null);
      const doCatalogo =
        catalogo?.tipo === "lista"
          ? catalogo.plugins.find((item) => item.id === plugin.id)
          : undefined;
      const repositorio = doCatalogo?.repositorio ?? plugin.repositorio;
      if (!repositorio) {
        toast.error(t.pacote.semRepositorio(nomeDe(plugin)));
        return;
      }

      // Confirma quando o catálogo diz que executa código, quando o manifesto
      // do repositório tem `principal`, e quando não dá para saber.
      const real = await lerManifestoDoRepositorio(repositorio);
      const pedidoAgora = { plugin, repositorio, autor: doCatalogo?.autor ?? null };
      if (doCatalogo?.executaCodigo || real?.executaCodigo || real === null) {
        setPedido(pedidoAgora);
        return;
      }
      await instalar(pedidoAgora);
    } finally {
      setProcurando(null);
    }
  }

  return (
    <section className="flex flex-col gap-1.5">
      <div className="text-sm font-medium">{t.pacote.pluginsFaltando}</div>
      <p className="text-muted-foreground text-xs">{t.pacote.pluginsFaltandoNota}</p>

      <ul className="flex flex-col gap-1">
        {plugins.map((plugin) => {
          const instalado = jaTem.has(plugin.id);
          const removido = removidos.has(plugin.id);
          const ocupado = instalando === plugin.id || procurando === plugin.id;

          return (
            <li
              key={plugin.id}
              className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm"
            >
              <span className={removido ? "text-muted-foreground min-w-0 flex-1 truncate line-through" : "min-w-0 flex-1 truncate"}>
                {nomeDe(plugin)}
                {plugin.versao ? (
                  <span className="text-muted-foreground ml-1.5 text-xs">{plugin.versao}</span>
                ) : null}
              </span>

              {instalado ? (
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Check className="size-3" />
                  {t.pacote.instalado}
                </span>
              ) : removido ? (
                <Button variant="ghost" size="sm" onClick={() => onRemover(plugin.id, false)}>
                  <Undo2 />
                  {t.pacote.desfazer}
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    disabled={instalando !== null || procurando !== null}
                    onClick={() => void baixar(plugin)}
                  >
                    {ocupado ? <Loader2 className="animate-spin" /> : <Download />}
                    {ocupado ? t.pacote.baixando : t.pacote.baixar}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ocupado}
                    onClick={() => onRemover(plugin.id, true)}
                  >
                    <X />
                    {t.pacote.remover}
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog open={pedido !== null} onOpenChange={(aberto) => !aberto && setPedido(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pedido
                ? textoDoDesktop.configuracoes.plugins.catalogo.confirmarInstalar(nomeDe(pedido.plugin))
                : null}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {textoDoDesktop.configuracoes.plugins.catalogo.confirmarTexto}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pedido ? (
            <p className="text-muted-foreground text-xs">
              {pedido.autor ? (
                <>
                  {textoDoDesktop.configuracoes.plugins.catalogo.por(pedido.autor)}
                  <br />
                </>
              ) : null}
              <span className="font-mono break-all">{pedido.repositorio}</span>
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{comum.cancelar}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pedido) void instalar(pedido);
              }}
            >
              {textoDoDesktop.configuracoes.plugins.catalogo.instalar}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
