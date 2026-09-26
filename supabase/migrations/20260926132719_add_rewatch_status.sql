-- Independent of viewing status: preserve the previous rating and watched date.
alter table public.watchlist_items
  add column rewatch_status text not null default 'none'
  constraint watchlist_items_rewatch_status_check
  check (rewatch_status in ('none', 'planned', 'rewatching'));
