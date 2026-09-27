alter table public.watchlist_items drop constraint watchlist_items_status_check,
 add constraint watchlist_items_status_check check(status in ('queue','watching','paused','watched','dropped')),
 add column paused_seconds integer check(paused_seconds between 0 and 3599999);
alter table public.watchlist_profiles
 add column gender text not null default 'unspecified' check(gender in ('unspecified','female','male')),
 alter column section_order set default array['movie','series','anime','drama','cartoon'];
-- Preserve existing BL collections as personal types, without adding them for new users.
insert into public.watchlist_profiles(user_id)
 select distinct user_id from public.watchlist_items where category='bl'
 on conflict(user_id) do nothing;
update public.watchlist_profiles p set custom_types=custom_types || '{"bl":"BL / лакорны"}'::jsonb
 where not ('bl'=any(hidden_types)) and exists(select 1 from public.watchlist_items i where i.user_id=p.user_id and i.category='bl');
