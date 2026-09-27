alter table public.watchlist_items
  add column dropped_season integer check (dropped_season between 1 and 9999),
  add column dropped_episode integer check (dropped_episode between 1 and 9999),
  add constraint dropped_progress_tv_only check (
    media_type = 'tv' or (dropped_season is null and dropped_episode is null)
  );
