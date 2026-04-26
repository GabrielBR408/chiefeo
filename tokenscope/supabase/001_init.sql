-- TokenScope — initial schema
-- Run in Supabase SQL editor. Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

create table if not exists usage_logs (
  id                 uuid default gen_random_uuid() primary key,
  created_at         timestamptz default now() not null,
  user_id            uuid references auth.users(id) on delete cascade,

  tag                text not null,
  model              text not null,
  stop_reason        text,

  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,

  cost_usd           numeric(12,6) not null default 0,

  duration_ms        integer,

  metadata           jsonb
);

create index if not exists idx_usage_logs_user_created on usage_logs(user_id, created_at desc);
create index if not exists idx_usage_logs_tag          on usage_logs(user_id, tag, created_at desc);
create index if not exists idx_usage_logs_model        on usage_logs(user_id, model, created_at desc);

alter table usage_logs enable row level security;

drop policy if exists "Users see own logs"   on usage_logs;
drop policy if exists "Users insert own logs" on usage_logs;

create policy "Users see own logs"
  on usage_logs for select
  using (auth.uid() = user_id);

create policy "Users insert own logs"
  on usage_logs for insert
  with check (auth.uid() = user_id);

-- Optional tag dictionary (Phase 2 — UI not yet built)
create table if not exists tags (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  name        text not null,
  color       text,
  description text,
  created_at  timestamptz default now(),
  unique(user_id, name)
);

alter table tags enable row level security;

drop policy if exists "Users see own tags"   on tags;
drop policy if exists "Users write own tags" on tags;

create policy "Users see own tags"
  on tags for select
  using (auth.uid() = user_id);

create policy "Users write own tags"
  on tags for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
