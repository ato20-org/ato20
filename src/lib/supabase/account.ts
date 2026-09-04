"use client";

import { getSupabase } from "@/lib/supabase/client";

/** A conta do mestre. Jogador e TV não têm conta — seguem anônimos. */
export type Account = { id: string; email: string };

/**
 * A conta logada neste navegador.
 *
 * Sessão anônima devolve `null` de propósito: ela existe em quase todo
 * navegador que já abriu a Plateia, e tratá-la como conta faria a porta do
 * Operador sumir para quem nunca se cadastrou.
 */
export async function currentAccount(): Promise<Account | null> {
  const { data } = await getSupabase().auth.getSession();
  const user = data.session?.user;

  if (!user || user.is_anonymous) return null;

  return { id: user.id, email: user.email ?? "" };
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) throw error;
}

/**
 * Cria a conta do mestre.
 *
 * Quando este navegador já tem sessão anônima, promove **ela** a conta em vez
 * de abrir outra: o `auth.uid()` continua o mesmo, e é ele que `rooms.master_id`
 * guarda. Cadastrar num usuário novo deixaria as mesas, os anexos e os
 * jogadores daquele navegador órfãos no mesmo instante.
 *
 * Exige "Confirm email" desligado no painel do Supabase — e verifica isso no
 * fim, em vez de confiar. Com a confirmação ligada, a promoção grava a senha
 * mas deixa o e-mail pendente: a sessão continua anônima, `auth.users.email`
 * fica vazio, e a tela diria "conta criada" sobre uma conta que não existe.
 */
export async function signUp(email: string, password: string): Promise<void> {
  const supabase = getSupabase();
  const { data: existing } = await supabase.auth.getSession();

  if (existing.session?.user?.is_anonymous) {
    await promote(email.trim(), password);
  } else {
    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) throw error;
  }

  // `getUser` e não `getSession`: o token em mãos é anterior à promoção, e só
  // o servidor sabe se o e-mail entrou ou ficou pendente.
  const { data: after } = await supabase.auth.getUser();

  if (!after.user || after.user.is_anonymous || !after.user.email) {
    throw new Error(
      'E-mail pendente de confirmação. Desligue "Confirm email" em Authentication → Sign In / Providers → Email no painel do Supabase e tente de novo.',
    );
  }
}

/**
 * Promove a sessão anônima a conta.
 *
 * A retentativa existe porque a promoção não é atômica do lado do servidor:
 * uma tentativa anterior barrada pela confirmação de e-mail já deixou a senha
 * gravada, e repeti-la volta `same_password` — erro que aqui significa "só
 * falta o e-mail", não "deu errado".
 */
async function promote(email: string, password: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.updateUser({ email, password });

  if (!error) return;

  const samePassword =
    error.code === "same_password" || /different from the old password/i.test(error.message);

  if (!samePassword) throw error;

  const { error: emailOnly } = await supabase.auth.updateUser({ email });
  if (emailOnly) throw emailOnly;
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}
