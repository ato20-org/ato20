-- =============================================================
-- Estado de sessao da mesa
-- =============================================================
--
-- Retratos e trilha nao pertencem a cena: eles atravessam a troca de mapa, e
-- por isso vivem fora do board. A consequencia era que tambem ficavam fora da
-- nuvem: os ARQUIVOS passaram a atravessar de maquina para maquina, mas o
-- arranjo -- quem esta no ar, em que canto, de que tamanho, que musica esta
-- escolhida -- nao. Abrir a mesa na outra maquina trazia as cenas completas e
-- o palco sem elenco.
--
-- Uma linha por mesa, com os dois jsonb. Sem contador de versao, ao contrario
-- do board: aqui a regra e "quem esta na maquina agora ganha". Retrato
-- reposicionado custa um arrasto para refazer, e um conflito na tela cobraria
-- uma decisao mais caro que o dano que evita.
--
-- Idempotente: pode rodar de novo sem estragar nada.

create table if not exists public.room_session (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  portraits jsonb not null default '[]'::jsonb,
  track jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.room_session enable row level security;

-- So o mestre. O jogador e a TV recebem retrato e trilha por broadcast, junto
-- da cena -- ler daqui nao adicionaria nada e entregaria o que ainda nao foi
-- posto no ar.
drop policy if exists "room_session_master" on public.room_session;
create policy "room_session_master"
on public.room_session for all to authenticated
using (public.is_room_master(room_id))
with check (public.is_room_master(room_id));
