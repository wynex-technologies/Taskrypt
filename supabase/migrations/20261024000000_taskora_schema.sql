-- =============================================================================
-- TASKRYPT — core schema, Row Level Security, sync RPC and private storage.
--
-- Security model
--   * Every user-owned row carries user_id and is guarded by owner-only RLS
--     policies for SELECT / INSERT / UPDATE / DELETE.
--   * Cross-table references use COMPOSITE foreign keys (id, user_id) so a row
--     can never point at another user's list, tag, folder or task.
--   * Server-managed columns (updated_at, version) are set by triggers, so
--     clients cannot forge the sync cursor.
--   * Document binaries live in the PRIVATE bucket `vault` under
--     <user_id>/<document_id>/<object_uuid>; storage policies check the prefix.
--   * Only the anon/publishable key is shipped in the app. No function here is
--     SECURITY DEFINER except the narrowly-scoped profile bootstrap trigger.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.tg_sync_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Ownership and identity are immutable.
    if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
      raise exception 'user_id and id are immutable' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
    new.version := old.version + 1;
  else
    new.version := 1;
    new.created_at := coalesce(new.created_at, now());
    if new.created_at > now() + interval '5 minutes' then
      new.created_at := now();
    end if;
  end if;
  -- Server clock is the pull cursor; clients cannot set it.
  new.updated_at := clock_timestamp();
  -- Clamp the conflict clock so a device with a wrong clock cannot win forever.
  new.client_updated_at := least(coalesce(new.client_updated_at, now()), now() + interval '5 minutes');
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  avatar_color text not null default '#B9502B' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  daily_goal smallint not null default 5 check (daily_goal between 1 and 50),
  timezone text check (timezone is null or char_length(timezone) <= 64),
  e2ee_enabled boolean not null default false,
  e2ee_salt text check (e2ee_salt is null or char_length(e2ee_salt) <= 64),
  e2ee_wrapped_key text check (e2ee_wrapped_key is null or char_length(e2ee_wrapped_key) <= 256),
  e2ee_kdf text check (e2ee_kdf is null or char_length(e2ee_kdf) <= 128),
  storage_quota_bytes bigint not null default 1073741824, -- 1 GiB, changed only by operators
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner can read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: owner can update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Column-level privileges: users may not raise their own storage quota.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_color, daily_goal, timezone, e2ee_enabled, e2ee_salt, e2ee_wrapped_key, e2ee_kdf)
  on public.profiles to authenticated;

create or replace function public.tg_profiles_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.tg_profiles_touch();

-- Bootstrap a profile for every new auth user. SECURITY DEFINER is required
-- because the signing-up user has no INSERT privilege on profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Synchronized, user-owned tables
-- -----------------------------------------------------------------------------

create table if not exists public.task_lists (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text not null default 'list' check (icon ~ '^[a-z0-9-]{1,32}$'),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  last_modified_by text not null check (char_length(last_modified_by) <= 64),
  deleted_at timestamptz,
  version integer not null default 1,
  unique (id, user_id)
);

create table if not exists public.task_categories (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  last_modified_by text not null check (char_length(last_modified_by) <= 64),
  deleted_at timestamptz,
  version integer not null default 1,
  unique (id, user_id)
);

create table if not exists public.task_tags (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 32),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  last_modified_by text not null check (char_length(last_modified_by) <= 64),
  deleted_at timestamptz,
  version integer not null default 1,
  unique (id, user_id)
);

create table if not exists public.tasks (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  list_id uuid,
  category_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 5000),
  due_at timestamptz,
  all_day boolean not null default false,
  priority smallint not null default 1 check (priority between 0 and 3),
  status text not null default 'todo' check (status in ('todo', 'done')),
  completed_at timestamptz,
  recurrence jsonb check (
    recurrence is null or (
      jsonb_typeof(recurrence) = 'object'
      and recurrence ->> 'freq' in ('daily', 'weekly', 'monthly', 'custom')
      and (recurrence ->> 'interval')::int between 1 and 365
      and pg_column_size(recurrence) < 1024
    )
  ),
  recurrence_parent_id uuid,
  reminder_offset_minutes integer check (reminder_offset_minutes is null or reminder_offset_minutes between 0 and 10080),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  last_modified_by text not null check (char_length(last_modified_by) <= 64),
  deleted_at timestamptz,
  version integer not null default 1,
  unique (id, user_id),
  constraint tasks_list_fk foreign key (list_id, user_id)
    references public.task_lists (id, user_id) on delete set null (list_id),
  constraint tasks_category_fk foreign key (category_id, user_id)
    references public.task_categories (id, user_id) on delete set null (category_id),
  constraint tasks_completed_consistent check ((status = 'done') = (completed_at is not null))
);

create table if not exists public.task_tag_assignments (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  last_modified_by text not null check (char_length(last_modified_by) <= 64),
  deleted_at timestamptz,
  version integer not null default 1,
  unique (id, user_id),
  constraint tta_task_fk foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  constraint tta_tag_fk foreign key (tag_id, user_id) references public.task_tags (id, user_id) on delete cascade
);
-- One live assignment per (task, tag) even if ids were ever generated differently.
create unique index if not exists tta_unique_live on public.task_tag_assignments (task_id, tag_id) where deleted_at is null;

create table if not exists public.document_folders (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid,
  name text not null check (
    char_length(btrim(name)) between 1 and 80
    and name !~ '[/\\[:cntrl:]]'
    and name not in ('.', '..')
  ),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  last_modified_by text not null check (char_length(last_modified_by) <= 64),
  deleted_at timestamptz,
  version integer not null default 1,
  unique (id, user_id),
  constraint folders_parent_fk foreign key (parent_id, user_id)
    references public.document_folders (id, user_id) on delete cascade,
  constraint folders_not_self check (parent_id is distinct from id)
);

create table if not exists public.documents (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  folder_id uuid,
  name text not null check (
    char_length(btrim(name)) between 1 and 255
    and name !~ '[/\\[:cntrl:]]'
    and name not in ('.', '..')
  ),
  -- Opaque object key: <user_id>/<document_id>/<object uuid>. Never derived from the filename.
  storage_key text not null,
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/webp',
    'application/rtf',
    'application/zip'
  )),
  size_bytes bigint not null check (size_bytes between 0 and 524288000),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  is_favorite boolean not null default false,
  encryption_mode text not null default 'standard' check (encryption_mode in ('standard', 'e2ee')),
  upload_status text not null default 'uploaded' check (upload_status in ('pending', 'uploading', 'uploaded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  last_modified_by text not null check (char_length(last_modified_by) <= 64),
  deleted_at timestamptz,
  version integer not null default 1,
  unique (id, user_id),
  constraint documents_folder_fk foreign key (folder_id, user_id)
    references public.document_folders (id, user_id) on delete set null (folder_id),
  constraint documents_storage_key_shape check (
    storage_key ~ ('^' || user_id::text || '/' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  )
);

-- Device bookkeeping and idempotency log.
create table if not exists public.device_sync_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null check (char_length(device_id) <= 64),
  platform text check (platform is null or platform in ('ios', 'android', 'web')),
  app_version text check (app_version is null or char_length(app_version) <= 32),
  last_pushed_at timestamptz,
  last_pulled_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

create table if not exists public.sync_operations (
  op_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  entity text not null,
  entity_id uuid not null,
  status text not null check (status in ('applied', 'stale', 'rejected')),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Indexes (owner + cursor scans dominate)
-- -----------------------------------------------------------------------------

create index if not exists task_lists_user_updated on public.task_lists (user_id, updated_at);
create index if not exists task_categories_user_updated on public.task_categories (user_id, updated_at);
create index if not exists task_tags_user_updated on public.task_tags (user_id, updated_at);
create index if not exists tasks_user_updated on public.tasks (user_id, updated_at);
create index if not exists tasks_user_due on public.tasks (user_id, due_at) where deleted_at is null and status = 'todo';
create index if not exists tasks_list on public.tasks (list_id) where list_id is not null;
create index if not exists tasks_category on public.tasks (category_id) where category_id is not null;
create index if not exists tta_user_updated on public.task_tag_assignments (user_id, updated_at);
create index if not exists tta_tag on public.task_tag_assignments (tag_id);
create index if not exists folders_user_updated on public.document_folders (user_id, updated_at);
create index if not exists folders_parent on public.document_folders (parent_id);
create index if not exists documents_user_updated on public.documents (user_id, updated_at);
create index if not exists documents_folder on public.documents (folder_id);
create index if not exists documents_user_live on public.documents (user_id) where deleted_at is null;
create index if not exists sync_ops_user_created on public.sync_operations (user_id, created_at);

-- -----------------------------------------------------------------------------
-- Triggers: server clock/version, document quota, folder cycles
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['task_lists', 'task_categories', 'task_tags', 'tasks', 'task_tag_assignments', 'document_folders', 'documents']
  loop
    execute format('drop trigger if exists %1$s_sync_row on public.%1$I', t);
    execute format('create trigger %1$s_sync_row before insert or update on public.%1$I for each row execute function public.tg_sync_row()', t);
  end loop;
end;
$$;

create or replace function public.tg_documents_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_used bigint;
  v_quota bigint;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is null and new.size_bytes <= old.size_bytes then
    return new;
  end if;
  select coalesce(sum(size_bytes), 0) into v_used
    from public.documents
   where user_id = new.user_id and deleted_at is null and id <> new.id;
  select storage_quota_bytes into v_quota from public.profiles where id = new.user_id;
  if v_used + new.size_bytes > coalesce(v_quota, 1073741824) then
    raise exception 'storage quota exceeded' using errcode = '53400';
  end if;
  return new;
end;
$$;
create trigger documents_quota before insert or update on public.documents
  for each row execute function public.tg_documents_quota();

create or replace function public.tg_folders_no_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cursor uuid := new.parent_id;
  v_depth int := 0;
begin
  while v_cursor is not null loop
    if v_cursor = new.id then
      raise exception 'folder cannot be moved inside itself' using errcode = '23514';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 32 then
      raise exception 'folders are nested too deeply' using errcode = '23514';
    end if;
    select parent_id into v_cursor from public.document_folders where id = v_cursor and user_id = new.user_id;
  end loop;
  return new;
end;
$$;
create trigger folders_no_cycle before insert or update of parent_id on public.document_folders
  for each row execute function public.tg_folders_no_cycle();

-- -----------------------------------------------------------------------------
-- Row Level Security — owner only, every operation, every table
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['task_lists', 'task_categories', 'task_tags', 'tasks', 'task_tag_assignments', 'document_folders', 'documents', 'device_sync_state', 'sync_operations']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy "%1$s: owner select" on public.%1$I for select to authenticated using (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "%1$s: owner insert" on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "%1$s: owner update" on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "%1$s: owner delete" on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))$p$, t);
  end loop;
end;
$$;

-- The idempotency log is append-only from the client's perspective.
revoke update, delete on public.sync_operations from authenticated;

-- -----------------------------------------------------------------------------
-- sync_push — batched, idempotent, last-writer-wins upsert
--
-- Each op: { op_id, entity, row }. Result per op:
--   applied    the row was written; `row` is the authoritative server row
--   stale      the server already has a newer version; `row` is that version
--   duplicate  op_id was processed before (safe retry); `row` is current
--   rejected   validation / authorization failed; `error` explains
--
-- Conflict rule (deterministic on every device):
--   incoming wins iff (client_updated_at, last_modified_by) is strictly greater
--   than the stored pair. Deletes are tombstones and follow the same rule.
-- SECURITY INVOKER: every statement still runs under the caller's RLS.
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

-- Storage usage summary for the signed-in user.
create or replace function public.get_storage_usage()
returns table (used_bytes bigint, quota_bytes bigint, document_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce((select sum(size_bytes) from public.documents where user_id = auth.uid() and deleted_at is null), 0)::bigint,
    coalesce((select storage_quota_bytes from public.profiles where id = auth.uid()), 1073741824)::bigint,
    (select count(*) from public.documents where user_id = auth.uid() and deleted_at is null)::bigint;
$$;
revoke all on function public.get_storage_usage() from public, anon;
grant execute on function public.get_storage_usage() to authenticated;

-- Housekeeping (schedule with pg_cron, see README): prune the idempotency log
-- and hard-delete tombstones every device has had 60 days to observe.
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
end;
$$;
revoke all on function public.taskora_housekeeping() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Private storage bucket + ownership-aware policies
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vault',
  'vault',
  false,
  52428800, -- 50 MiB; keep EXPO_PUBLIC_MAX_UPLOAD_MB <= this
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/webp',
    'application/rtf',
    'application/zip',
    'application/octet-stream' -- end-to-end encrypted ciphertext
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object names must be exactly <auth.uid()>/<uuid>/<uuid>.
create policy "vault: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "vault: owner upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
  );

create policy "vault: owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "vault: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);
