alter table public.runs add column if not exists character_id text not null default 'eric'
  check (character_id in ('eric', 'harvey', 'eber'));
create index if not exists runs_character_leaderboard_idx
  on public.runs (user_id, character_id, score desc, created_at asc, id asc);

create schema if not exists runericrun_private;
revoke all on schema runericrun_private from public, anon;
grant usage on schema runericrun_private to authenticated;

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  watch_user_id uuid unique references auth.users(id) on delete set null,
  selected_character text not null default 'eric' check (selected_character in ('eric','harvey','eber')),
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.game_sessions enable row level security;
revoke all on public.game_sessions from anon, authenticated;
grant select on public.game_sessions to authenticated;
grant update (selected_character) on public.game_sessions to authenticated;
create policy "paired devices read session" on public.game_sessions for select to authenticated
  using ((select auth.uid()) = owner_id or (select auth.uid()) = watch_user_id);
create policy "paired devices select character" on public.game_sessions for update to authenticated
  using ((select auth.uid()) = owner_id or (select auth.uid()) = watch_user_id)
  with check ((select auth.uid()) = owner_id or (select auth.uid()) = watch_user_id);

create table runericrun_private.pair_codes (
  session_id uuid primary key references public.game_sessions(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null
);
create table runericrun_private.pair_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null
);
alter table runericrun_private.pair_codes enable row level security;
alter table runericrun_private.pair_attempts enable row level security;
revoke all on runericrun_private.pair_codes, runericrun_private.pair_attempts from public, anon, authenticated;

create function runericrun_private.touch_game_session() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function runericrun_private.touch_game_session() from public, anon, authenticated;
create trigger game_session_revision before update on public.game_sessions
for each row execute function runericrun_private.touch_game_session();

create function runericrun_private.ensure_game_session() returns setof public.game_sessions
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Authentication required'; end if;
  insert into public.game_sessions(owner_id) values (caller) on conflict (owner_id) do nothing;
  return query select s.* from public.game_sessions s where s.owner_id = caller;
end;
$$;

create function runericrun_private.issue_pair_code() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); target public.game_sessions; code text; expiry timestamptz;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  select * into target from runericrun_private.ensure_game_session();
  perform 1 from public.game_sessions s where s.id = target.id for update;
  delete from runericrun_private.pair_codes c where c.expires_at < now() or c.session_id = target.id;
  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  expiry := now() + interval '10 minutes';
  insert into runericrun_private.pair_codes(session_id, code_hash, expires_at)
    values (target.id, encode(sha256(convert_to(code, 'UTF8')), 'hex'), expiry);
  return jsonb_build_object('code', substr(code,1,4) || '-' || substr(code,5,4),
    'expires_at', expiry, 'session_id', target.id);
end;
$$;

create function runericrun_private.pair_watch(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); normalized text; tries integer;
  target_id uuid; target public.game_sessions;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  insert into runericrun_private.pair_attempts as a(user_id, window_start, attempts)
    values (caller, now(), 1)
    on conflict (user_id) do update set
      attempts = case when a.window_start < now() - interval '5 minutes' then 1 else a.attempts + 1 end,
      window_start = case when a.window_start < now() - interval '5 minutes' then now() else a.window_start end
    returning attempts into tries;
  if tries > 5 then return jsonb_build_object('ok', false, 'error', 'Espera 5 minutos antes de reintentar.'); end if;
  if length(coalesce(p_code,'')) > 32 then
    return jsonb_build_object('ok',false,'error','Código inválido o vencido.');
  end if;
  normalized := replace(replace(upper(trim(coalesce(p_code,''))), '-', ''), ' ', '');
  if normalized !~ '^[0-9A-F]{8}$' then
    return jsonb_build_object('ok',false,'error','Código inválido o vencido.');
  end if;
  select c.session_id into target_id from runericrun_private.pair_codes c
    where c.code_hash = encode(sha256(convert_to(normalized, 'UTF8')), 'hex')
      and c.expires_at > now() for update;
  if target_id is null then return jsonb_build_object('ok',false,'error','Código inválido o vencido.'); end if;
  select s.* into target from public.game_sessions s where s.id = target_id for update;
  if target.owner_id = caller then
    return jsonb_build_object('ok',false,'error','Usa este código desde el otro dispositivo.');
  end if;
  update public.game_sessions set watch_user_id = null where watch_user_id = caller and id <> target_id;
  update public.game_sessions set watch_user_id = caller where id = target_id returning * into target;
  delete from runericrun_private.pair_codes where session_id = target_id;
  return jsonb_build_object('ok',true,'session',to_jsonb(target));
end;
$$;

create function runericrun_private.unlink_watch() returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Authentication required'; end if;
  update public.game_sessions set watch_user_id = null where owner_id = caller;
  delete from runericrun_private.pair_codes c using public.game_sessions s
    where c.session_id = s.id and s.owner_id = caller;
end;
$$;
revoke all on function runericrun_private.ensure_game_session(),
  runericrun_private.issue_pair_code(), runericrun_private.pair_watch(text),
  runericrun_private.unlink_watch() from public, anon, authenticated;
grant execute on function runericrun_private.ensure_game_session(),
  runericrun_private.issue_pair_code(), runericrun_private.pair_watch(text),
  runericrun_private.unlink_watch() to authenticated;

create function public.get_game_session() returns setof public.game_sessions
language sql security invoker set search_path = ''
as $$ select * from runericrun_private.ensure_game_session(); $$;
create function public.create_pair_code() returns jsonb
language sql security invoker set search_path = ''
as $$ select runericrun_private.issue_pair_code(); $$;
create function public.pair_watch(p_code text) returns jsonb
language sql security invoker set search_path = ''
as $$ select runericrun_private.pair_watch(p_code); $$;
create function public.unlink_watch() returns void
language sql security invoker set search_path = ''
as $$ select runericrun_private.unlink_watch(); $$;
revoke all on function public.get_game_session(), public.create_pair_code(),
  public.pair_watch(text), public.unlink_watch() from public, anon, authenticated;
grant execute on function public.get_game_session(), public.create_pair_code(),
  public.pair_watch(text), public.unlink_watch() to authenticated;

alter publication supabase_realtime add table public.game_sessions;

