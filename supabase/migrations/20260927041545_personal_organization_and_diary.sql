alter table public.watchlist_profiles
  drop constraint complete_section_order,
  add constraint section_order_size check (cardinality(section_order)<=200),
  add column custom_types jsonb not null default '{}' check (jsonb_typeof(custom_types)='object'),
  add column hidden_types text[] not null default '{}' check (hidden_types <@ array['movie','series','anime','drama','cartoon','bl']),
  add column custom_lists jsonb not null default '{}' check (jsonb_typeof(custom_lists)='object');
alter table public.watchlist_items
  add column custom_type text check (length(custom_type)<=80),
  add column list_ids text[] not null default '{}' check (cardinality(list_ids)<=100),
  add column tags text[] not null default '{}' check (cardinality(tags)<=30),
  add constraint watchlist_items_owner_id unique (user_id,id);
create table public.watchlist_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  watched_on date not null,
  is_rewatch boolean not null default false,
  rating smallint check (rating between 1 and 10),
  notes text check (length(notes)<=5000),
  created_at timestamptz not null default now(),
  foreign key (user_id,item_id) references public.watchlist_items(user_id,id) on delete cascade
);
alter table public.watchlist_entries enable row level security;
revoke all on public.watchlist_entries from anon,authenticated;
grant select,insert,update,delete on public.watchlist_entries to authenticated;
grant all on public.watchlist_entries to service_role;
create policy own_entries_read on public.watchlist_entries for select to authenticated using ((select auth.uid())=user_id);
create policy own_entries_insert on public.watchlist_entries for insert to authenticated with check ((select auth.uid())=user_id);
create policy own_entries_update on public.watchlist_entries for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_entries_delete on public.watchlist_entries for delete to authenticated using ((select auth.uid())=user_id);
create index watchlist_entries_user_date on public.watchlist_entries(user_id,watched_on desc);
create index watchlist_entries_owner_item on public.watchlist_entries(user_id,item_id);
