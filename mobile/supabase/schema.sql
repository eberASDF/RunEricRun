create table if not exists public.runs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  score integer not null check (score >= 0),
  created_at timestamptz not null default now()
);

alter table public.runs enable row level security;

revoke all on public.runs from anon, authenticated;
grant select, insert on public.runs to authenticated;

create policy "read own runs" on public.runs
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "insert own runs" on public.runs
for insert to authenticated
with check ((select auth.uid()) = user_id);

create index runs_leaderboard_idx on public.runs (user_id, score desc, created_at asc);
