-- =============================================================
-- ATO20 - Correcoes nas policies de Storage
--
-- Cole no SQL Editor e execute. Idempotente.
-- Depende de 0001_fase2.sql.
--
-- Dois defeitos encontrados testando contra o Storage real:
--
-- 1) `upsert: true` era negado. Sobrescrever um objeto existente
--    e um UPDATE em storage.objects, e 0001 so criou policies de
--    INSERT, SELECT e DELETE. Sem UPDATE, retomar um upload
--    interrompido falhava para sempre - o arquivo ficava travado
--    e os celulares nunca o veriam.
--
-- 2) O mestre nao conseguia escrever em `attachments`. A policy
--    exigia `is_room_member`, e o mestre nao tem linha em
--    `players` - ele e dono da sala, nao jogador dela.
-- =============================================================

-- -------------------------------------------------------------
-- assets: falta o UPDATE (usado pelo upsert)
-- -------------------------------------------------------------

drop policy if exists "assets_update_master" on storage.objects;
create policy "assets_update_master"
on storage.objects for update to authenticated
using (
  bucket_id = 'assets'
  and public.is_room_master(public.storage_room_id(name))
)
with check (
  bucket_id = 'assets'
  and public.is_room_master(public.storage_room_id(name))
);

-- -------------------------------------------------------------
-- attachments: dono da pasta e o uid do caminho; quem pode
-- escrever ali e membro OU mestre da sala
-- -------------------------------------------------------------

drop policy if exists "attachments_write_own" on storage.objects;
create policy "attachments_write_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
  and (
    public.is_room_member(public.storage_room_id(name))
    or public.is_room_master(public.storage_room_id(name))
  )
);

drop policy if exists "attachments_update_own" on storage.objects;
create policy "attachments_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
);
