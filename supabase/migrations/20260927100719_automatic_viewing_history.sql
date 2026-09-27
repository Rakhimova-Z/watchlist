alter table public.watchlist_entries
 alter column watched_on drop not null,
 add column event_kind text not null default 'completed' check(event_kind in ('completed','status','added','rewatch')),
 add column status_value text,
 add column source text not null default 'manual' check(source in ('manual','automatic','imported'));
-- Existing diary events take precedence. Unknown dates stay unknown.
insert into public.watchlist_entries(user_id,item_id,watched_on,rating,source)
 select i.user_id,i.id,i.watched_at,i.rating,'imported' from public.watchlist_items i
 where i.status='watched' and not exists(select 1 from public.watchlist_entries e where e.item_id=i.id and e.user_id=i.user_id and e.event_kind='completed');
create function public.record_watchlist_activity() returns trigger language plpgsql security invoker set search_path='' as $$
declare completed boolean := false; repeat_view boolean := false;
begin
 if TG_OP='INSERT' then
   completed := NEW.status='watched';
   insert into public.watchlist_entries(user_id,item_id,watched_on,event_kind,status_value,source,rating)
    values(NEW.user_id,NEW.id,case when completed then coalesce(NEW.watched_at,current_date) else current_date end,case when completed then 'completed' else 'added' end,NEW.status,'automatic',case when completed then NEW.rating else null end);
   return NEW;
 end if;
 repeat_view := OLD.rewatch_status='rewatching' and NEW.rewatch_status='none' and NEW.status='watched';
 completed := repeat_view or (NEW.status='watched' and OLD.status<>'watched' and not exists(select 1 from public.watchlist_entries where user_id=NEW.user_id and item_id=NEW.id and event_kind='completed'));
 if completed or NEW.status is distinct from OLD.status or NEW.rewatch_status is distinct from OLD.rewatch_status then
   insert into public.watchlist_entries(user_id,item_id,watched_on,event_kind,status_value,source,is_rewatch,rating)
    values(NEW.user_id,NEW.id,case when completed and NEW.watched_at is distinct from OLD.watched_at then coalesce(NEW.watched_at,current_date) else current_date end,
     case when completed then 'completed' when NEW.status is distinct from OLD.status then 'status' else 'rewatch' end,
     case when NEW.status is distinct from OLD.status then NEW.status else NEW.rewatch_status end,'automatic',repeat_view,case when completed then NEW.rating else null end);
 end if;
 return NEW;
end $$;
create trigger watchlist_activity after insert or update on public.watchlist_items for each row execute function public.record_watchlist_activity();
