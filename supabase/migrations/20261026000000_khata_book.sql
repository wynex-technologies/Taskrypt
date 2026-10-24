-- =============================================================================
-- Khata Book: a personal ledger of money spent, given and received.
--
--   kind = 'bought'  money spent on something   (description required)
--          'gave'    money paid to someone      (party required)
--          'got'     money received from someone (party required)
--
-- Amounts are whole paise (bigint) so sums never drift. Rows sync like every
-- other entity and are guarded by the same owner-only RLS.
-- =============================================================================

create table if not exists public.khata_entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bought', 'gave', 'got')),
  party text check (party is null or char_length(btrim(party)) between 1 and 80),
  description text check (description is null or char_length(btrim(description)) between 1 and 200),
  amount_paise bigint not null check (amount_paise between 1 and 99999999999),
  entry_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  last_modified_by text not null check (char_length(last_modified_by) <= 64),
  deleted_at timestamptz,
  version integer not null default 1,
  unique (id, user_id),
  constraint khata_entries_party_or_description check (
    (kind = 'bought' and description is not null) or (kind in ('gave', 'got') and party is not null)
  )
);

create index if not exists khata_entries_user_updated on public.khata_entries (user_id, updated_at);

drop trigger if exists khata_entries_sync_row on public.khata_entries;
create trigger khata_entries_sync_row before insert or update on public.khata_entries
  for each row execute function public.tg_sync_row();

alter table public.khata_entries enable row level security;
revoke all on public.khata_entries from anon;
grant select, insert, update, delete on public.khata_entries to authenticated;
create policy "khata_entries: owner select" on public.khata_entries for select to authenticated using (user_id = (select auth.uid()));
create policy "khata_entries: owner insert" on public.khata_entries for insert to authenticated with check (user_id = (select auth.uid()));
create policy "khata_entries: owner update" on public.khata_entries for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "khata_entries: owner delete" on public.khata_entries for delete to authenticated using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- sync_push and housekeeping now know about khata_entries (otherwise unchanged).
-- -----------------------------------------------------------------------------

create or replace function public.sync_push(p_device_id text, p_ops jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_op jsonb;
  v_op_id uuid;
  v_entity text;
  v_row jsonb;
  v_entity_id uuid;
  v_cols text;
  v_result jsonb;
  v_current jsonb;
  v_status text;
  v_results jsonb := '[]'::jsonb;
  v_recent int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_device_id is null or char_length(p_device_id) > 64 then
    raise exception 'invalid device id' using errcode = '22023';
  end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 200 then
    raise exception 'ops must be an array of at most 200 items' using errcode = '22023';
  end if;

  -- Abuse protection: at most 3000 operations per user per minute.
  select count(*) into v_recent from public.sync_operations
   where user_id = v_uid and created_at > now() - interval '1 minute';
  if v_recent + jsonb_array_length(p_ops) > 3000 then
    raise exception 'sync rate limit exceeded' using errcode = '54000';
  end if;

  for v_op in select value from jsonb_array_elements(p_ops)
  loop
    v_result := null;
    v_current := null;
    begin
      v_op_id := (v_op ->> 'op_id')::uuid;
      v_entity := v_op ->> 'entity';
      v_row := v_op -> 'row';
      v_entity_id := (v_row ->> 'id')::uuid;

      v_cols := case v_entity
        when 'task_lists' then 'name, color, icon, position'
        when 'task_categories' then 'name, color'
        when 'task_tags' then 'name, color'
        when 'tasks' then 'list_id, category_id, title, description, due_at, all_day, priority, status, completed_at, recurrence, recurrence_parent_id, reminder_offset_minutes, position'
        when 'task_tag_assignments' then 'task_id, tag_id'
        when 'document_folders' then 'parent_id, name, color'
        when 'documents' then 'folder_id, name, storage_key, mime_type, size_bytes, checksum_sha256, is_favorite, encryption_mode, upload_status'
        when 'khata_entries' then 'kind, party, description, amount_paise, entry_date'
        else null
      end;
      if v_cols is null then
        raise exception 'unknown entity' using errcode = '22023';
      end if;
      v_cols := v_cols || ', client_updated_at, last_modified_by, deleted_at';

      -- Idempotent replay.
      if exists (select 1 from public.sync_operations where op_id = v_op_id and user_id = v_uid) then
        execute format('select to_jsonb(t) from public.%I t where id = $1', v_entity) into v_current using v_entity_id;
        v_results := v_results || jsonb_build_object('op_id', v_op_id, 'status', 'duplicate', 'row', v_current);
        continue;
      end if;

      -- Ownership is forced server-side regardless of what the client sent.
      v_row := v_row || jsonb_build_object('user_id', v_uid, 'last_modified_by', left(coalesce(v_row ->> 'last_modified_by', p_device_id), 64));

      execute format(
        $sql$
        insert into public.%1$I as t
        select * from jsonb_populate_record(null::public.%1$I, $1)
        on conflict (id) do update
          set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1))
          where t.user_id = $2
            and (t.client_updated_at, t.last_modified_by) < (excluded.client_updated_at, excluded.last_modified_by)
        returning to_jsonb(t.*)
        $sql$,
        v_entity, v_cols
      ) into v_result using v_row, v_uid;

      if v_result is not null then
        v_status := 'applied';
      else
        v_status := 'stale';
        execute format('select to_jsonb(t) from public.%I t where id = $1', v_entity) into v_current using v_entity_id;
        v_result := v_current;
        if v_result is null then
          v_status := 'rejected';
        end if;
      end if;

      insert into public.sync_operations (op_id, user_id, device_id, entity, entity_id, status)
      values (v_op_id, v_uid, p_device_id, v_entity, v_entity_id, v_status);

      v_results := v_results || jsonb_build_object('op_id', v_op_id, 'status', v_status, 'row', v_result);
    exception when others then
      -- The sub-transaction is rolled back; report and continue with the batch.
      v_results := v_results || jsonb_build_object(
        'op_id', v_op ->> 'op_id',
        'status', 'rejected',
        'error', sqlerrm,
        'code', sqlstate
      );
    end;
  end loop;

  insert into public.device_sync_state (user_id, device_id, last_pushed_at)
  values (v_uid, p_device_id, now())
  on conflict (user_id, device_id) do update set last_pushed_at = excluded.last_pushed_at;

  return v_results;
end;
$$;

revoke all on function public.sync_push(text, jsonb) from public, anon;
grant execute on function public.sync_push(text, jsonb) to authenticated;

create or replace function public.taskora_housekeeping()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.sync_operations where created_at < now() - interval '30 days';
  delete from public.task_tag_assignments where deleted_at < now() - interval '60 days';
  delete from public.tasks where deleted_at < now() - interval '60 days';
  delete from public.task_tags where deleted_at < now() - interval '60 days';
  delete from public.task_categories where deleted_at < now() - interval '60 days';
  delete from public.task_lists where deleted_at < now() - interval '60 days';
  delete from public.documents where deleted_at < now() - interval '60 days';
  delete from public.document_folders where deleted_at < now() - interval '60 days';
  delete from public.khata_entries where deleted_at < now() - interval '60 days';
end;
$$;
revoke all on function public.taskora_housekeeping() from public, anon, authenticated;
