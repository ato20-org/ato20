-- =============================================================
-- ATO20 - Fase 2
--
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute
-- uma vez. E idempotente: rodar de novo nao quebra nada.
--
-- Antes de rodar, habilite Anonymous sign-ins em
-- Authentication > Providers > Anonymous.
-- =============================================================

-- -------------------------------------------------------------
-- Codigo de sala
-- -------------------------------------------------------------

-- Alfabeto sem I, O, 0 e 1: o jogador digita esse codigo olhando
-- a tela do mestre, e esses quatro se confundem entre si.
create or replace function public.generate_room_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() * 31)::int + 1, 1),
    ''
  )
  from generate_series(1, 6);
$$;

-- -------------------------------------------------------------
-- Tabelas
-- -------------------------------------------------------------

create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique default public.generate_room_code(),
  master_id  uuid not null references auth.users (id) on delete cascade,
  rules      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.rooms is 'Uma mesa. Permanente: o jogador salva o link uma vez.';
comment on column public.rooms.code is 'Codigo curto que o jogador digita para entrar.';
comment on column public.rooms.rules is 'Lista de {label, url} com o material de regras.';

create index if not exists rooms_master_id_idx on public.rooms (master_id);

create table if not exists public.players (
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null default '',
  notes      text not null default '',
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

comment on column public.players.notes is 'Campo livre. Nenhuma estrutura imposta ao jogador.';

create index if not exists players_user_id_idx on public.players (user_id);

-- -------------------------------------------------------------
-- Predicados de acesso
--
-- Sao SECURITY DEFINER de proposito. Uma policy em `players` que
-- consultasse `rooms` direto acionaria a policy de `rooms`, que
-- consulta `players`, e o Postgres aborta com recursao infinita.
-- Rodando como owner, estas funcoes ignoram RLS e cortam o ciclo.
-- -------------------------------------------------------------

create or replace function public.is_room_master(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.rooms
    where id = p_room_id and master_id = auth.uid()
  );
$$;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.players
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

-- Primeira pasta do caminho no Storage e o id da sala. Cast tolerante:
-- num caminho malformado devolve null em vez de abortar a listagem.
create or replace function public.storage_room_id(p_name text)
returns uuid
language plpgsql
stable
as $$
declare
  v_id uuid;
begin
  begin
    v_id := ((storage.foldername(p_name))[1])::uuid;
  exception
    when others then return null;
  end;

  return v_id;
end;
$$;

-- -------------------------------------------------------------
-- Entrar na sala
--
-- RPC em vez de SELECT direto em `rooms`: sem isso, procurar a
-- sala pelo codigo exigiria permissao de leitura em todas as
-- salas, expondo codigo e mestre de mesas alheias.
-- -------------------------------------------------------------

create or replace function public.join_room(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
begin
  if auth.uid() is null then
    raise exception 'nao autenticado';
  end if;

  select id into v_room_id
  from public.rooms
  where code = upper(trim(p_code));

  if v_room_id is null then
    raise exception 'sala nao encontrada';
  end if;

  insert into public.players (room_id, user_id)
  values (v_room_id, auth.uid())
  on conflict (room_id, user_id) do nothing;

  return v_room_id;
end;
$$;

revoke all on function public.join_room(text) from public, anon;
grant execute on function public.join_room(text) to authenticated;

-- -------------------------------------------------------------
-- RLS: rooms
-- -------------------------------------------------------------

alter table public.rooms enable row level security;

drop policy if exists "rooms_select_member" on public.rooms;
create policy "rooms_select_member"
on public.rooms for select to authenticated
using (master_id = auth.uid() or public.is_room_member(id));

drop policy if exists "rooms_insert_own" on public.rooms;
create policy "rooms_insert_own"
on public.rooms for insert to authenticated
with check (master_id = auth.uid());

drop policy if exists "rooms_update_master" on public.rooms;
create policy "rooms_update_master"
on public.rooms for update to authenticated
using (master_id = auth.uid())
with check (master_id = auth.uid());

drop policy if exists "rooms_delete_master" on public.rooms;
create policy "rooms_delete_master"
on public.rooms for delete to authenticated
using (master_id = auth.uid());

-- -------------------------------------------------------------
-- RLS: players
--
-- Anexos e notas: o dono ve os seus, o mestre ve de todos.
-- Um jogador nao ve a ficha do outro.
-- -------------------------------------------------------------

alter table public.players enable row level security;

drop policy if exists "players_select_own_or_master" on public.players;
create policy "players_select_own_or_master"
on public.players for select to authenticated
using (user_id = auth.uid() or public.is_room_master(room_id));

drop policy if exists "players_insert_own" on public.players;
create policy "players_insert_own"
on public.players for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "players_update_own" on public.players;
create policy "players_update_own"
on public.players for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "players_delete_own_or_master" on public.players;
create policy "players_delete_own_or_master"
on public.players for delete to authenticated
using (user_id = auth.uid() or public.is_room_master(room_id));

-- -------------------------------------------------------------
-- Storage
--
-- `assets` e publico: todo espectador busca o mesmo mapa a cada
-- troca de cena, e URL publica deixa o browser e a CDN cachearem.
--
-- `attachments` e privado: e a ficha do jogador. Acesso sai por
-- URL assinada, gerada na hora de abrir a aba do personagem.
-- -------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do update set public = false;

-- assets: caminho {room_id}/{asset_id}
drop policy if exists "assets_read" on storage.objects;
create policy "assets_read"
on storage.objects for select to authenticated
using (bucket_id = 'assets');

drop policy if exists "assets_write_master" on storage.objects;
create policy "assets_write_master"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'assets'
  and public.is_room_master(public.storage_room_id(name))
);

drop policy if exists "assets_delete_master" on storage.objects;
create policy "assets_delete_master"
on storage.objects for delete to authenticated
using (
  bucket_id = 'assets'
  and public.is_room_master(public.storage_room_id(name))
);

-- attachments: caminho {room_id}/{user_id}/{arquivo}
drop policy if exists "attachments_read_own_or_master" on storage.objects;
create policy "attachments_read_own_or_master"
on storage.objects for select to authenticated
using (
  bucket_id = 'attachments'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or public.is_room_master(public.storage_room_id(name))
  )
);

drop policy if exists "attachments_write_own" on storage.objects;
create policy "attachments_write_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.is_room_member(public.storage_room_id(name))
);

drop policy if exists "attachments_delete_own_or_master" on storage.objects;
create policy "attachments_delete_own_or_master"
on storage.objects for delete to authenticated
using (
  bucket_id = 'attachments'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or public.is_room_master(public.storage_room_id(name))
  )
);
