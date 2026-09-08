-- =============================================================
-- Volume da sessao, fora da faixa
-- =============================================================
--
-- O ganho morava dentro do jsonb `track`, ou seja, era do arquivo escolhido.
-- Trocar de musica trocava o volume junto: a faixa nova entrava com o ganho de
-- quando foi escolhida, e o mestre reajustava o slider a cada troca. Agora o
-- volume e da sessao -- uma barra so, e toda musica obedece a ela.
--
-- Coluna propria, e nao um campo no jsonb: a barra continua valendo quando
-- nenhuma faixa esta escolhida, e dentro de `track` ela desapareceria junto com
-- a musica removida.
--
-- Idempotente: pode rodar de novo sem estragar nada.

alter table public.room_session
  add column if not exists volume double precision not null default 0.8;

-- Aproveita o ganho que ja estava gravado dentro da faixa, para a mesa nao ver
-- o som saltar para o padrao na primeira vez que abrir esta versao.
update public.room_session
set volume = least(greatest((track ->> 'volume')::double precision, 0), 1)
where track ? 'volume'
  and volume = 0.8;
