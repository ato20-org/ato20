-- =============================================================
-- Codigo de operacao
-- =============================================================
--
-- Duas senhas por mesa, com publicos diferentes:
--
--   code           o jogador digita para entrar na Plateia
--   operator_code  o mestre digita para assumir a tela do Operador
--
-- Sem isso, qualquer pessoa que passe pelo portao de acesso do site abre
-- /operador. Hoje ela nao consegue mexer na mesa alheia (a RLS amarra tudo em
-- master_id = auth.uid()), mas ganha uma mesa vazia e confusa -- e o mestre que
-- limpa os dados do navegador perde a mesa dele sem forma de voltar.
--
-- Idempotente: pode rodar de novo sem estragar nada.

-- -------------------------------------------------------------
-- Gerador
-- -------------------------------------------------------------

-- Mesmo alfabeto sem I, O, 0 e 1 do codigo de sala: e ditado e digitado do
-- mesmo jeito, e esses quatro se confundem entre si.
--
-- Oito caracteres, nao seis: 32^8 da 1,1 trilhao de combinacoes, e o tamanho
-- diferente ja distingue os dois codigos a olho.
create or replace function public.generate_operator_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() * 31)::int + 1, 1),
    ''
  )
  from generate_series(1, 8);
$$;

-- -------------------------------------------------------------
-- Coluna
-- -------------------------------------------------------------

-- Em tres passos de proposito. Adicionar direto como NOT NULL DEFAULT
-- dependeria de o Postgres reavaliar a funcao volatil por linha para as salas
-- que ja existem; o backfill explicito garante um codigo distinto por sala sem
-- depender desse detalhe.
alter table public.rooms
  add column if not exists operator_code text;

update public.rooms
   set operator_code = public.generate_operator_code()
 where operator_code is null;

alter table public.rooms
  alter column operator_code set default public.generate_operator_code();

alter table public.rooms
  alter column operator_code set not null;

create unique index if not exists rooms_operator_code_key
  on public.rooms (operator_code);

comment on column public.rooms.operator_code is
  'Senha que o mestre digita para assumir a tela do Operador. Nao legivel pelos jogadores.';

-- -------------------------------------------------------------
-- Privilegio de coluna: e isto que faz o codigo ser segredo
-- -------------------------------------------------------------
--
-- A policy `rooms_select_member` deixa qualquer membro da mesa ler a linha da
-- sala. Com o SELECT em bloco que o `authenticated` tem por padrao, um jogador
-- faria `select operator_code` e teria a senha do mestre. RLS decide QUAIS
-- linhas; privilegio de coluna decide QUAIS COLUNAS -- sao coisas separadas, e
-- so a segunda resolve este caso.
revoke select on public.rooms from authenticated;
grant select (id, code, master_id, rules, created_at) on public.rooms to authenticated;

-- O mestre tambem nao escreve na coluna direto: trocar a senha passaria a
-- valer sem ninguem ver, e nao existe tela para isso.
revoke update on public.rooms from authenticated;
grant update (rules) on public.rooms to authenticated;

-- INSERT tambem sai: uma sala criada direto na tabela nasceria com uma senha
-- que ninguem consegue ler, e portanto impossivel de operar em outro aparelho.
-- Criar mesa passa a ser so por `create_room`.
revoke insert on public.rooms from authenticated;

-- -------------------------------------------------------------
-- Criar mesa
-- -------------------------------------------------------------
--
-- Vai por RPC porque o INSERT direto nao consegue mais ler `operator_code` de
-- volta, e o mestre precisa ve-lo uma vez para guardar.
create or replace function public.create_room()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'nao autenticado';
  end if;

  insert into public.rooms (master_id)
  values (auth.uid())
  returning * into v_room;

  return json_build_object(
    'id', v_room.id,
    'code', v_room.code,
    'operator_code', v_room.operator_code
  );
end;
$$;

revoke all on function public.create_room() from public, anon;
grant execute on function public.create_room() to authenticated;

-- -------------------------------------------------------------
-- Assumir a mesa pelo codigo de operacao
-- -------------------------------------------------------------
--
-- Verificar no servidor, e nao na tela: uma comparacao em JavaScript seria
-- enfeite, porque quem manda na capacidade real e a RLS, que olha master_id.
-- Aqui o codigo certo passa a ser o que MOVE master_id -- e por isso vale algo.
create or replace function public.unlock_room(p_operator_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'nao autenticado';
  end if;

  -- Aceita como o mestre escreveu: minusculas, hifen de agrupamento, espaco
  -- colado pelo gerenciador de senhas.
  v_code := upper(regexp_replace(coalesce(p_operator_code, ''), '[^A-Za-z0-9]', '', 'g'));

  if length(v_code) = 0 then
    raise exception 'codigo de operacao vazio';
  end if;

  select * into v_room
    from public.rooms
   where operator_code = v_code;

  if v_room.id is null then
    raise exception 'codigo de operacao invalido';
  end if;

  -- Assumir a mesa neste navegador. A sessao anonima muda a cada limpeza de
  -- dados, entao o codigo e o unico fio que liga o mestre a mesa dele.
  if v_room.master_id is distinct from auth.uid() then
    update public.rooms
       set master_id = auth.uid()
     where id = v_room.id;
  end if;

  return json_build_object('id', v_room.id, 'code', v_room.code);
end;
$$;

revoke all on function public.unlock_room(text) from public, anon;
grant execute on function public.unlock_room(text) to authenticated;

-- -------------------------------------------------------------
-- Reler o proprio codigo
-- -------------------------------------------------------------
--
-- O mestre precisa consultar a senha depois, para abrir o Operador em outra
-- maquina. So devolve para quem ja e o mestre daquela sala.
create or replace function public.my_operator_code(p_room_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'nao autenticado';
  end if;

  select operator_code into v_code
    from public.rooms
   where id = p_room_id
     and master_id = auth.uid();

  if v_code is null then
    raise exception 'nao autorizado';
  end if;

  return v_code;
end;
$$;

revoke all on function public.my_operator_code(uuid) from public, anon;
grant execute on function public.my_operator_code(uuid) to authenticated;
