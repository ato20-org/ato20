"use client";

import { useState } from "react";
import { ChevronDown, Languages, Loader2, LogOut, UserRound } from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { comum } from "@/lib/i18n/comum";
import { escolherIdiomaDoJogador } from "@/lib/i18n/escolha-do-jogador";
import { IDIOMAS, NOME_DO_IDIOMA, idioma, normalizar } from "@/lib/i18n/idioma";
import { t } from "@/lib/i18n/jogador";
import { useCadernoStore } from "@/lib/store/use-caderno-store";
import { usePlayerStore } from "@/lib/store/use-player-store";

/**
 * Quem está jogando, na faixa de cima.
 *
 * O nome saiu do corpo da tela. Um campo "Teu nome" com botão de salvar ocupava
 * a primeira dobra do celular para uma informação que se escreve uma vez por
 * campanha — e que, depois de escrita, é só identidade. Identidade mora no
 * canto da faixa, como em qualquer aplicativo de celular: o ícone diz quem é, e
 * o toque abre o que se faz com isso — trocar de nome, ou sair.
 */
export function PlayerMenu({ codigo }: { codigo: string }) {
  const status = usePlayerStore((state) => state.status);
  const sheet = usePlayerStore((state) => state.sheet);
  const sair = usePlayerStore((state) => state.sair);
  const limparCaderno = useCadernoStore((state) => state.limpar);

  const [renomeando, setRenomeando] = useState(false);

  // Antes de entrar não há o que mostrar: a tela inteira já é o campo do nome.
  if (status !== "dentro" || !sheet) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 min-w-0 max-w-40 gap-1 px-1.5 font-normal"
              aria-label={t.menu.conta}
            >
              <UserRound className="shrink-0 opacity-70" />
              <span className="truncate">{sheet.nome}</span>
              <ChevronDown className="size-3 shrink-0 opacity-60" />
            </Button>
          }
        />

        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setRenomeando(true)}>
            <UserRound />
            {t.menu.mudarNome}
          </DropdownMenuItem>

          {/* O idioma DESTE celular. O do mestre chega pelo convite e pelo
              quadro; um jogador de fora numa mesa brasileira troca aqui uma
              vez, e o aparelho lembra. Cada idioma escrito nele mesmo, para
              achar o seu sem ler o da tela. */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Languages />
              {t.menu.idioma}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={idioma}
                onValueChange={(valor) => {
                  const escolha = normalizar(valor);
                  if (escolha && escolha !== idioma) escolherIdiomaDoJogador(escolha);
                }}
              >
                {IDIOMAS.map((cada) => (
                  <DropdownMenuRadioItem key={cada} value={cada} lang={cada}>
                    {NOME_DO_IDIOMA[cada]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <SairItem
            onSair={() => {
              sair(codigo);
              // O caderno vai junto: ele está em memória, e quem entrar em
              // seguida neste aparelho veria as notas de quem saiu piscando na
              // tela até a leitura nova voltar.
              limparCaderno();
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Controlado de fora do menu: o item que abre o diálogo desmonta junto
          com o menu, e um gatilho desmontado leva o diálogo embora com ele. */}
      <RenomearDialog
        codigo={codigo}
        aberto={renomeando}
        onFechar={() => setRenomeando(false)}
      />
    </>
  );
}

/**
 * Sair — com aviso, porque o que some é a credencial deste aparelho.
 *
 * A ficha continua na mesa do mestre; quem volta com o mesmo nome ganha uma
 * linha nova, não a antiga. Vale dizer isso antes, não depois.
 */
function SairItem({ onSair }: { onSair: () => void }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <DropdownMenuItem variant="destructive" onClick={() => setAberto(true)}>
        <LogOut />
        {t.menu.sair}
      </DropdownMenuItem>

      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.menu.sairTitulo}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.menu.sairExplicacao}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>{comum.cancelar}</AlertDialogCancel>
            <AlertDialogAction onClick={onSair}>
              {t.menu.sairConfirmar}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** O mesmo campo de antes, agora só quando se quer mudar o nome. */
function RenomearDialog({
  codigo,
  aberto,
  onFechar,
}: {
  codigo: string;
  aberto: boolean;
  onFechar: () => void;
}) {
  const sheet = usePlayerStore((state) => state.sheet);

  // `key` no formulário: reabrir depois de desistir volta ao nome em vigor, e
  // não ao rascunho abandonado da vez anterior.
  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="sm:max-w-sm">
        {sheet ? (
          <RenomearForm
            key={sheet.nome}
            codigo={codigo}
            nomeAtual={sheet.nome}
            onPronto={onFechar}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RenomearForm({
  codigo,
  nomeAtual,
  onPronto,
}: {
  codigo: string;
  nomeAtual: string;
  onPronto: () => void;
}) {
  const atualizar = usePlayerStore((state) => state.atualizar);

  const [nome, setNome] = useState(nomeAtual);
  const [salvando, setSalvando] = useState(false);

  const inalterado = nome.trim() === nomeAtual || nome.trim().length === 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setSalvando(true);
        // Fecha na resposta, e não no envio: a gravação é otimista no store, e
        // fechar antes esconderia o erro que só chega depois.
        void atualizar(codigo, { nome: nome.trim() }).then(onPronto);
      }}
    >
      <DialogHeader>
        <DialogTitle>{t.menu.mudarNome}</DialogTitle>
        <DialogDescription>{t.menu.renomearExplicacao}</DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="player-nome">{t.menu.teuNome}</Label>
        <Input
          id="player-nome"
          value={nome}
          onChange={(event) => setNome(event.target.value)}
          maxLength={60}
          spellCheck={false}
          autoFocus
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onPronto}>
          {comum.cancelar}
        </Button>
        <Button type="submit" disabled={inalterado || salvando}>
          {salvando ? <Loader2 className="animate-spin" /> : null}
          {t.menu.salvar}
        </Button>
      </DialogFooter>
    </form>
  );
}
