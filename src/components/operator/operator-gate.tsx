"use client";

import { useState } from "react";
import Link from "next/link";
import { FileArchive, FolderOpen, FolderPlus, Loader2, MonitorOff, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCampaignStore } from "@/lib/store/use-campaign-store";

/**
 * Porta do Operador: qual pasta abrir.
 *
 * Substitui as duas etapas de antes — conta de e-mail, depois escolha de mesa
 * — por uma só, e a razão é que o aplicativo de desktop **é** o operador. Não
 * há a quem provar identidade: quem abriu o programa já está na máquina onde
 * as campanhas moram, e uma senha ali só protegeria o disco de si mesmo.
 *
 * O que sobrou é o modelo do Obsidian: uma pasta é uma campanha, e a porta
 * mostra as últimas abertas mais o seletor nativo.
 */
export function OperatorGate() {
  const status = useCampaignStore((state) => state.status);

  if (status === "sem-aplicativo") return <NoApp />;

  return <CampaignDoor />;
}

/**
 * Aberto numa aba de navegador em vez do aplicativo.
 *
 * Acontece de verdade: `pnpm dev` serve as três telas em `localhost:3000`, e o
 * Operador é a única que precisa alcançar o disco. Dizer isso é melhor que uma
 * tela de erro genérica sobre um comando que falhou.
 */
function NoApp() {
  return (
    <Centered>
      <MonitorOff className="text-muted-foreground size-8" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">Abra pelo aplicativo</h1>
      <p className="text-muted-foreground text-sm">
        O Operador lê e grava a campanha numa pasta do computador, e uma aba do navegador não
        alcança o disco. Quem baixou o aplicativo é o mestre; ele abre direto nesta tela.
      </p>

      {/* Para as duas telas que FUNCIONAM aqui: quem caiu neste endereço pelo
          navegador é quase sempre alguém da mesa que digitou o IP. */}
      <Button render={<Link href="/" />} nativeButton={false} variant="outline" size="sm">
        Ver as telas da mesa
      </Button>
    </Centered>
  );
}

function CampaignDoor() {
  const recents = useCampaignStore((state) => state.recents);
  const busy = useCampaignStore((state) => state.busy);
  const error = useCampaignStore((state) => state.error);
  const choose = useCampaignStore((state) => state.choose);
  const openFolder = useCampaignStore((state) => state.openFolder);
  const forget = useCampaignStore((state) => state.forget);
  const importar = useCampaignStore((state) => state.importar);

  const [creating, setCreating] = useState(false);

  if (creating) return <CreateForm onCancel={() => setCreating(false)} />;

  return (
    <Centered>
      <FolderOpen className="text-muted-foreground size-8" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">
        {recents.length > 0 ? "Abrir campanha" : "Comece uma campanha"}
      </h1>
      <p className="text-muted-foreground text-sm">
        Uma campanha é uma pasta no seu computador: cenas em arquivos de texto, imagens e sons ao
        lado deles. Ela cabe num zip, e o zip abre em qualquer outra máquina.
      </p>

      {recents.length > 0 ? (
        <ul className="w-full space-y-1 text-left">
          {recents.map((entry) => (
            <li key={entry.path} className="group flex items-center gap-1">
              <Button
                variant="outline"
                // `min-w-0` porque `truncate` só corta dentro de largura
                // definida — sem ele um caminho longo estica a porta inteira.
                className="min-w-0 flex-1 justify-start"
                // Pasta que não está no disco continua na lista de propósito:
                // o volume externo pode estar desconectado, e esconder a linha
                // fecharia o caminho de volta quando ele voltasse.
                disabled={busy || !entry.existe}
                onClick={() => void choose(entry.path)}
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="block truncate text-sm">{entry.nome}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {entry.existe ? entry.path : `${entry.path} — não encontrada`}
                  </span>
                </span>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Tirar ${entry.nome} da lista`}
                className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                onClick={() => void forget(entry.path)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        variant={recents.length > 0 ? "ghost" : "outline"}
        className="w-full"
        disabled={busy}
        onClick={() => void openFolder()}
      >
        {busy ? <Loader2 className="animate-spin" /> : <FolderOpen />}
        Abrir uma pasta
      </Button>

      <Separator />

      <Button
        variant={recents.length > 0 ? "ghost" : "default"}
        className="w-full"
        disabled={busy}
        onClick={() => setCreating(true)}
      >
        <FolderPlus />
        Criar campanha
      </Button>

      {/* Importar mora aqui, e não atrás da campanha aberta: quem recebeu um
          zip de outro mestre ainda não tem campanha nenhuma, e a porta é a
          primeira tela que ele vê. */}
      <Button variant="ghost" className="w-full" disabled={busy} onClick={() => void importar()}>
        <FileArchive />
        Importar de um zip
      </Button>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </Centered>
  );
}

/**
 * Nome antes da pasta-mãe.
 *
 * Nesta ordem porque o nome é o que decide o nome da pasta: pedir a pasta
 * primeiro e o nome depois deixaria o mestre escolhendo onde criar algo que
 * ele ainda não nomeou.
 */
function CreateForm({ onCancel }: { onCancel: () => void }) {
  const busy = useCampaignStore((state) => state.busy);
  const error = useCampaignStore((state) => state.error);
  const create = useCampaignStore((state) => state.create);

  const [nome, setNome] = useState("");

  return (
    <Centered>
      <FolderPlus className="text-muted-foreground size-8" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">Nova campanha</h1>
      <p className="text-muted-foreground text-sm">
        O próximo passo abre o seletor de pasta. A campanha nasce numa subpasta com o nome que você
        der aqui.
      </p>

      <form
        className="w-full space-y-3 text-left"
        onSubmit={(event) => {
          event.preventDefault();
          void create(nome);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="campaign-name">Nome da campanha</Label>
          <Input
            id="campaign-name"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="A Marca do Javali"
          />
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={nome.trim().length === 0 || busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Escolher a pasta
        </Button>
      </form>

      <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
        Voltar
      </Button>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">{children}</div>
    </div>
  );
}
