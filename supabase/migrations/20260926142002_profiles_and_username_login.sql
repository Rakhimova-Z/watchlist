create table public.watchlist_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique check (username is null or username ~ '^[a-z0-9_]{3,24}$'),
  section_order text[] not null default array['movie','series','anime','drama','cartoon','bl'],
  constraint complete_section_order check (cardinality(section_order)=6 and section_order @> array['movie','series','anime','drama','cartoon','bl'])
);
alter table public.watchlist_profiles enable row level security;
revoke all on public.watchlist_profiles from anon, authenticated;
grant select,insert,update on public.watchlist_profiles to authenticated;
grant all on public.watchlist_profiles to service_role;
create policy own_profile_read on public.watchlist_profiles for select to authenticated using ((select auth.uid())=user_id);
create policy own_profile_insert on public.watchlist_profiles for insert to authenticated with check ((select auth.uid())=user_id);
create policy own_profile_update on public.watchlist_profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

-- Only the login function's server-side client may consume these counters.
create table public.username_login_limits (
  bucket text primary key,
  expires_at timestamptz not null,
  attempts integer not null
);
alter table public.username_login_limits enable row level security;
revoke all on public.username_login_limits from anon,authenticated;
grant all on public.username_login_limits to service_role;
create policy server_only_login_limits on public.username_login_limits to service_role using (true) with check (true);
create function public.consume_username_login(login_name text) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare n integer; global_n integer;
begin
  if login_name !~ '^[a-z0-9_]{3,24}$' then return false; end if;
  delete from public.username_login_limits where expires_at < now()-interval '1 hour';
  insert into public.username_login_limits values ('global',now()+interval '15 minutes',1)
  on conflict (bucket) do update set
    attempts=case when username_login_limits.expires_at<=now() then 1 else username_login_limits.attempts+1 end,
    expires_at=case when username_login_limits.expires_at<=now() then now()+interval '15 minutes' else username_login_limits.expires_at end
  returning attempts into global_n;
  if global_n>300 then return false; end if;
  insert into public.username_login_limits values ('name:'||login_name,now()+interval '15 minutes',1)
  on conflict (bucket) do update set
    attempts=case when username_login_limits.expires_at<=now() then 1 else username_login_limits.attempts+1 end,
    expires_at=case when username_login_limits.expires_at<=now() then now()+interval '15 minutes' else username_login_limits.expires_at end
  returning attempts into n;
  return n<=15;
end;
$$;
revoke all on function public.consume_username_login(text) from public,anon,authenticated;
grant execute on function public.consume_username_login(text) to service_role;
