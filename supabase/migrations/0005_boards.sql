-- =============================================================
-- Cenas na nuvem
-- =============================================================
--
-- Ate aqui o board -- as cenas, os itens, as areas escondidas, a camera --
-- morava so no IndexedDB do navegador. Consequencia: montar a mesa no
-- trabalho e continuar em casa era impossivel, e a mesa aberta em outra
-- maquina vinha sem cena nenhuma.
--
-- Uma linha por mesa. O board inteiro vai como jsonb, e nao normalizado em
-- tabelas de cena/item: ele e lido e escrito sempre INTEIRO, por um unico
-- cliente (o Operador), e nunca consultado por dentro. Normalizar pagaria
-- joins e migracoes de schema para nenhuma query que existe.
--
-- Tabela propria, e nao coluna em `rooms`: e o dado que muda mais no projeto,
-- e gravar cena a cena numa coluna de `rooms` reescreveria a linha que guarda
-- tambem `operator_code` e `rules`.
--
-- Idempotente: pode rodar de novo sem estragar nada.

create table if not exists public.boards (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  data jsonb not null,
  -- Contador de gravacoes. E o que faz "um operador por vez" ser fato: quem
  -- chega com uma versao velha e recusado em vez de sobrescrever.
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.boards enable row level security;

-- -------------------------------------------------------------
-- RLS: so o mestre da mesa
-- -------------------------------------------------------------
--
-- Jogador e TV NAO leem daqui de proposito: a cena no ar chega neles por
-- broadcast, e o board inteiro entregaria as areas escondidas do mapa -- que
-- existem justamente para eles nao verem.

drop policy if exists "boards_select_master" on public.boards;
create policy "boards_select_master"
on public.boards for select to authenticated
using (public.is_room_master(room_id));

-- Escrita passa pelo RPC (security definer), que confere a versao. As policies
-- de insert/update ficam de fora: sem elas, nao existe caminho que escreva sem
-- a checagem.

-- -------------------------------------------------------------
-- Gravacao com checagem de versao
-- -------------------------------------------------------------
--
-- p_version e a versao que o cliente carregou. Zero significa "nunca vi este
-- board", usado na primeira subida.
--
-- Conflito levanta excecao em vez de devolver null: o cliente precisa
-- distinguir "recusado, decida o que fazer" de "gravou", e um null obrigaria
-- a inventar essa diferenca na tela.
create or replace function public.save_board(
  p_room_id uuid,
  p_data jsonb,
  p_version integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
begin
  if not public.is_room_master(p_room_id) then
    raise exception 'nao e o mestre desta mesa';
  end if;

  select version into v_current from public.boards where room_id = p_room_id;

  if v_current is null then
    insert into public.boards (room_id, data, version, updated_by)
    values (p_room_id, p_data, 1, auth.uid());

    return 1;
  end if;

  if v_current <> p_version then
    raise exception 'board_conflict: servidor esta na versao %, cliente enviou %', v_current, p_version;
  end if;

  update public.boards
  set data = p_data,
      version = v_current + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where room_id = p_room_id;

  return v_current + 1;
end;
$$;

revoke all on function public.save_board(uuid, jsonb, integer) from public, anon;
grant execute on function public.save_board(uuid, jsonb, integer) to authenticated;
