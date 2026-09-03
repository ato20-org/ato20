-- =============================================================
-- ATO20 - Apelido do jogador dado pelo mestre
--
-- Cole no SQL Editor e execute. Idempotente.
-- Depende de 0001_fase2.sql.
-- =============================================================

alter table public.players
  add column if not exists master_label text not null default '';

comment on column public.players.name is 'Nome que o proprio jogador escolhe.';
comment on column public.players.master_label is
  'Apelido que o mestre da a esse jogador. Serve para o mestre saber quem e quem.';

-- -------------------------------------------------------------
-- O jogador escreve so o que e dele
--
-- RLS e por linha, nao por coluna: a policy `players_update_own`
-- ja limita a linha do proprio usuario, mas nada impediria ele
-- de reescrever o apelido que o mestre lhe deu. O privilegio de
-- coluna resolve isso, e o RPC abaixo (SECURITY DEFINER, roda
-- como owner) e a unica porta para `master_label`.
-- -------------------------------------------------------------

revoke update on public.players from authenticated;
grant update (name, notes) on public.players to authenticated;

create or replace function public.set_player_label(
  p_room_id uuid,
  p_user_id uuid,
  p_label   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_room_master(p_room_id) then
    raise exception 'apenas o mestre da sala pode apelidar jogadores';
  end if;

  update public.players
  set master_label = coalesce(btrim(p_label), '')
  where room_id = p_room_id and user_id = p_user_id;
end;
$$;

revoke all on function public.set_player_label(uuid, uuid, text) from public, anon;
grant execute on function public.set_player_label(uuid, uuid, text) to authenticated;

-- -------------------------------------------------------------
-- `updated_at` honesto
--
-- Em trigger e nao no cliente: o privilegio de coluna acima nao
-- deixa o jogador escrever `updated_at`, e um BEFORE trigger
-- alterando NEW nao passa por essa verificacao.
-- -------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists players_touch_updated_at on public.players;
create trigger players_touch_updated_at
before update on public.players
for each row
execute function public.touch_updated_at();

-- -------------------------------------------------------------
-- Realtime na tabela de jogadores
--
-- Assim o painel da mesa no Operador ve o jogador aparecer no
-- momento em que ele digita o codigo, sem o mestre recarregar.
-- -------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;
end
$$;
