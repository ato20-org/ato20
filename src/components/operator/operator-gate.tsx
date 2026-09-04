"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, KeyRound, Loader2, LogOut, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useRoomStore } from "@/lib/store/use-room-store";

/** Oito caracteres, contra os seis do código da mesa. */
const OPERATOR_CODE_LENGTH = 8;

/** O mínimo do Supabase. Exigir mais aqui só criaria erro que a tela não prevê. */
const MIN_PASSWORD = 6;

/** Tira hífen de agrupamento e espaço colado por gerenciador de senha. */
function normalizeCode(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, OPERATOR_CODE_LENGTH);
}

/**
 * Porta do Operador, em duas etapas: a conta, e depois a mesa.
 *
 * A conta existe porque a identidade do mestre precisa sobreviver ao aparelho.
 * Enquanto ela era a sessão anônima do navegador, limpar os dados do site ou
 * trocar de máquina significava não conseguir nem ver que a mesa existe — e
 * "qual das mesas é a minha?" não tinha resposta.
 *
 * A mesa é etapa separada porque um mestre acumula mesas, e abrir a errada no
 * meio de uma sessão é pior que um clique a mais.
 */
export function OperatorGate() {
  const account = useRoomStore((state) => state.account);
  const [fresh, setFresh] = useState<string | null>(null);

  // A senha da mesa recém-criada. Aparece uma vez e some da tela junto com a
  // porta, então o aviso tem de ser mais forte que a vontade de seguir.
  if (fresh) return <FreshCode operatorCode={fresh} />;
  if (!account) return <AccountDoor />;

  return <RoomDoor onCreated={setFresh} />;
}

/** Entrar ou criar a conta do mestre. */
function AccountDoor() {
  const busy = useRoomStore((state) => state.busy);
  const error = useRoomStore((state) => state.error);
  const signIn = useRoomStore((state) => state.signIn);
  const signUp = useRoomStore((state) => state.signUp);

  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const incomplete = !email.includes("@") || password.length < MIN_PASSWORD;

  return (
    <Centered>
      <UserRound className="text-muted-foreground size-8" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">
        {creating ? "Criar conta de mestre" : "Entrar como mestre"}
      </h1>
      <p className="text-muted-foreground text-sm">
        {creating
          ? "A conta é o que amarra as mesas a você em qualquer aparelho. Jogador não cria conta: o celular dele entra só com o código da mesa."
          : "Só o mestre tem conta. Para acompanhar a cena, use Assistir ou Plateia."}
      </p>

      <form
        className="w-full space-y-3 text-left"
        onSubmit={(event) => {
          event.preventDefault();
          void (creating ? signUp(email, password) : signIn(email, password));
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="account-email">E-mail</Label>
          <Input
            id="account-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            spellCheck={false}
            placeholder="mestre@exemplo.com"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="account-password">Senha</Label>
          <Input
            id="account-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            // `new-password` no cadastro faz o gerenciador oferecer uma senha
            // forte em vez de tentar preencher com uma antiga.
            autoComplete={creating ? "new-password" : "current-password"}
            placeholder={creating ? `Mínimo de ${MIN_PASSWORD} caracteres` : undefined}
          />
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={incomplete || busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {creating ? "Criar conta" : "Entrar"}
        </Button>
      </form>

      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setCreating(!creating)}>
        {creating ? "Já tenho conta" : "Criar uma conta"}
      </Button>

      <Button render={<Link href="/mesa" />} nativeButton={false} variant="ghost" size="sm">
        Voltar
      </Button>
    </Centered>
  );
}

/** Escolher a mesa, criar a primeira, ou assumir uma com o código de operação. */
function RoomDoor({ onCreated }: { onCreated: (operatorCode: string) => void }) {
  const account = useRoomStore((state) => state.account);
  const masterRooms = useRoomStore((state) => state.masterRooms);
  const busy = useRoomStore((state) => state.busy);
  const error = useRoomStore((state) => state.error);
  const chooseRoom = useRoomStore((state) => state.chooseRoom);
  const openRoom = useRoomStore((state) => state.openRoom);
  const signOut = useRoomStore((state) => state.signOut);

  const [code, setCode] = useState("");

  return (
    <Centered>
      <KeyRound className="text-muted-foreground size-8" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">
        {masterRooms.length > 0 ? "Escolha a mesa" : "Abra a primeira mesa"}
      </h1>
      <p className="text-muted-foreground text-sm">
        {masterRooms.length > 0
          ? "Todas as mesas desta conta. As cenas moram no navegador, não na mesa: abrir esta mesa em outro computador mostra o acervo de imagens, mas nenhuma cena montada."
          : "Esta conta ainda não tem mesa. Crie uma, ou assuma uma existente com o código de operação."}
      </p>

      {masterRooms.length > 0 ? (
        <ul className="w-full space-y-2">
          {masterRooms.map((room) => (
            <li key={room.id}>
              <Button variant="outline" className="w-full" onClick={() => chooseRoom(room)}>
                <span className="tracking-widest">{room.code}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        variant={masterRooms.length > 0 ? "ghost" : "default"}
        className="w-full"
        disabled={busy}
        onClick={() => {
          void openRoom().then(onCreated, () => {
            // O store já guardou o motivo e manteve a porta.
          });
        }}
      >
        Criar mesa
      </Button>

      <Separator />

      <AssumeForm code={code} onCode={setCode} />

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="text-muted-foreground flex w-full items-center justify-between gap-2 border-t pt-4 text-xs">
        <span className="truncate">{account?.email}</span>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void signOut()}>
          <LogOut />
          Sair
        </Button>
      </div>
    </Centered>
  );
}

/**
 * Assumir uma mesa que esta conta ainda não comanda.
 *
 * É o caminho de quem criou a mesa antes de existir conta, e de quem quer
 * mover o comando para outra máquina: o RPC `unlock_room` troca o `master_id`
 * da sala para esta sessão, e é a RLS que olha esse campo.
 */
function AssumeForm({ code, onCode }: { code: string; onCode: (code: string) => void }) {
  const busy = useRoomStore((state) => state.busy);
  const unlock = useRoomStore((state) => state.unlock);

  return (
    <form
      className="w-full space-y-2 text-left"
      onSubmit={(event) => {
        event.preventDefault();
        void unlock(code);
      }}
    >
      <Label htmlFor="operator-code">Assumir com o código de operação</Label>
      <Input
        id="operator-code"
        value={code}
        onChange={(event) => onCode(normalizeCode(event.target.value))}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        placeholder="ABCD2345"
        className="text-center text-lg tracking-[0.3em]"
      />
      <Button
        type="submit"
        variant="outline"
        className="w-full"
        disabled={code.length !== OPERATOR_CODE_LENGTH || busy}
      >
        {busy ? <Loader2 className="animate-spin" /> : null}
        Assumir a mesa
      </Button>
    </form>
  );
}

/**
 * A senha da mesa aparecendo pela única vez.
 *
 * Sem "continuar" automático: o mestre precisa de um instante para copiar isto
 * para onde ele guarda senhas. Ela é o que move a mesa para outra conta ou
 * outra máquina depois.
 */
function FreshCode({ operatorCode }: { operatorCode: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Centered>
      <KeyRound className="size-8 text-amber-500" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">Guarde este código</h1>
      <p className="text-muted-foreground text-sm">
        É a senha desta mesa. Ela move o comando para outro aparelho ou outra conta — e é o único
        jeito de reassumir a mesa se a conta mudar.
      </p>

      <code className="bg-muted w-full rounded-md py-3 text-center text-2xl font-medium tracking-[0.3em]">
        {operatorCode}
      </code>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          void navigator.clipboard.writeText(operatorCode).then(
            () => setCopied(true),
            // `clipboard` exige contexto seguro; em HTTP na rede local falha, e
            // o código continua legível na tela.
            () => setCopied(false),
          );
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copiado" : "Copiar código"}
      </Button>

      <p className="text-muted-foreground text-xs">
        Não mostre este código aos jogadores: quem o digita assume a mesa.
      </p>
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
