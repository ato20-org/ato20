-- =============================================================
-- Fim do material de regras
-- =============================================================
--
-- A mesa tinha uma lista de "regras": PDF do livro subido para o bucket ou
-- link externo, que o jogador abria na Plateia. Sai do projeto.
--
-- O motivo e custo: PDF de livro de RPG pesa dezenas de MB, o plano gratuito
-- do Supabase aperta primeiro no Storage, e a mesa tem o livro na mao ou o
-- proprio jogador tem o PDF no celular dele. Guardar o livro na ferramenta
-- pagava a parte mais cara em troca da conveniencia menor.
--
-- A coluna sai junto: deixa-la vazia manteria uma capacidade que nao existe
-- mais e que a RLS ainda teria de proteger.
--
-- Idempotente: pode rodar de novo sem estragar nada.

alter table public.rooms drop column if exists rules;

-- O privilegio de coluna da 0004 mencionava `rules`; refeito sem ela.
-- Continua sendo privilegio de coluna, e nao policy, porque e ele que esconde
-- `operator_code` de quem le a linha da sala.
revoke select on public.rooms from authenticated;
grant select (id, code, master_id, created_at) on public.rooms to authenticated;

-- O update existia SO para `rules`. Sem coluna atualizavel pelo cliente, o
-- privilegio e a policy viram enfeite -- e enfeite em RLS e o tipo de coisa
-- que engana quem le depois.
revoke update on public.rooms from authenticated;
drop policy if exists "rooms_update_master" on public.rooms;
