create policy "paired devices receive jump broadcast"
on realtime.messages for select to authenticated
using (
 extension = 'broadcast' and exists (
  select 1 from public.game_sessions s
  where s.watch_user_id is not null
    and ((select auth.uid()) = s.owner_id or (select auth.uid()) = s.watch_user_id)
    and (select realtime.topic()) = 'runericrun:control:' || s.id::text || ':' || s.watch_user_id::text
 )
);
create policy "paired devices send jump broadcast"
on realtime.messages for insert to authenticated
with check (
 extension = 'broadcast' and exists (
  select 1 from public.game_sessions s
  where s.watch_user_id is not null
    and ((select auth.uid()) = s.owner_id or (select auth.uid()) = s.watch_user_id)
    and (select realtime.topic()) = 'runericrun:control:' || s.id::text || ':' || s.watch_user_id::text
 )
);
