-- =============================================================
-- Acervo que atravessa maquinas
-- =============================================================
--
-- O binario do acervo ja vivia no bucket, entao a cena aparecia completa em
-- qualquer maquina. O que nao viajava era o METADADO: nome, tipo, medidas e
-- pasta. Sem ele o painel de imagens abria vazio na segunda maquina, e as
-- pastas criadas na primeira nao existiam -- mesmo com os arquivos la.
--
-- Metadado e barato: sao alguns KB por mesa. Quem enche o Storage e o binario,
-- e por isso duas colunas aqui existem so para o bucket poder emagrecer:
--
--   mirrors    ids de APARELHO que ja tem copia local do arquivo. A conta e a
--              mesma nas duas maquinas, entao identidade de usuario nao serve
--              para responder "quem tem o arquivo".
--   in_bucket  se o binario ainda esta no Storage. Depois da faxina, false.
--
-- A regra da faxina, aplicada pelo cliente do mestre: arquivo que NAO esta em
-- uso na mesa (nenhuma cena, nenhum fundo, nenhum retrato, nenhuma trilha) e
-- que ja tem dois espelhos sai do bucket. O que esta em uso nunca sai, porque
-- o bucket e a fonte da TV e do celular do jogador.
--
-- Idempotente: pode rodar de novo sem estragar nada.

create table if not exists public.library_assets (
  room_id uuid not null references public.rooms (id) on delete cascade,
  asset_id text not null,
  kind text not null,
  name text not null,
  mime_type text not null,
  size bigint not null default 0,
  natural_width integer,
  natural_height integer,
  folder_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mirrors text[] not null default '{}',
  in_bucket boolean not null default true,
  primary key (room_id, asset_id)
);

create table if not exists public.library_folders (
  room_id uuid not null references public.rooms (id) on delete cascade,
  id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (room_id, id)
);

-- -------------------------------------------------------------
-- RLS: so o mestre da mesa
-- -------------------------------------------------------------
--
-- Jogador nao le nada disto de proposito. Ele recebe a cena por broadcast e o
-- binario por URL publica; a lista do acervo entregaria o material que o mestre
-- ainda nao mostrou -- nomes de mapas de cenas futuras, inclusive.

alter table public.library_assets enable row level security;
alter table public.library_folders enable row level security;

drop policy if exists "library_assets_master" on public.library_assets;
create policy "library_assets_master"
on public.library_assets for all to authenticated
using (public.is_room_master(room_id))
with check (public.is_room_master(room_id));

drop policy if exists "library_folders_master" on public.library_folders;
create policy "library_folders_master"
on public.library_folders for all to authenticated
using (public.is_room_master(room_id))
with check (public.is_room_master(room_id));

-- -------------------------------------------------------------
-- Registrar que este aparelho tem copia
-- -------------------------------------------------------------
--
-- Vai por RPC e nao por update direto porque duas maquinas podem marcar o
-- mesmo arquivo ao mesmo tempo: ler o array no cliente, acrescentar e gravar
-- perderia a marca de uma delas. Aqui o array cresce dentro da propria
-- instrucao, e `distinct` deixa a chamada idempotente.
create or replace function public.mark_asset_mirror(
  p_room_id uuid,
  p_asset_id text,
  p_device text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_room_master(p_room_id) then
    raise exception 'nao e o mestre desta mesa';
  end if;

  update public.library_assets
  set mirrors = (select array(select distinct unnest(mirrors || array[p_device]))),
      updated_at = now()
  where room_id = p_room_id and asset_id = p_asset_id;
end;
$$;

revoke all on function public.mark_asset_mirror(uuid, text, text) from public, anon;
grant execute on function public.mark_asset_mirror(uuid, text, text) to authenticated;
