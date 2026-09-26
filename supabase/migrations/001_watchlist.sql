create extension if not exists pgcrypto;

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_id bigint not null,
  media_type text not null check (media_type in ('movie','tv')),
  title text not null,
  year integer,
  poster_url text,
  overview text,
  genres text[] not null default '{}',
  countries text[] not null default '{}',
  seasons integer,
  episodes integer,
  runtime integer,
  category text not null check (category in ('movie','series','anime','drama','cartoon','bl')),
  status text not null default 'queue' check (status in ('queue','watching','watched','dropped')),
  rating smallint check (rating between 1 and 10),
  watched_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);

alter table public.watchlist_items enable row level security;

create policy "Users can read own watchlist"
on public.watchlist_items for select
using (auth.uid() = user_id);

create policy "Users can insert own watchlist"
on public.watchlist_items for insert
with check (auth.uid() = user_id);

create policy "Users can update own watchlist"
on public.watchlist_items for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own watchlist"
on public.watchlist_items for delete
using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists watchlist_items_set_updated_at on public.watchlist_items;
create trigger watchlist_items_set_updated_at
before update on public.watchlist_items
for each row execute function public.set_updated_at();

create index if not exists watchlist_items_user_status_idx
on public.watchlist_items(user_id, status);

create index if not exists watchlist_items_user_category_idx
on public.watchlist_items(user_id, category);
