-- Nutzung der App (nur für die Reiseleitung sichtbar): Öffnungen und besuchte Bereiche
create table if not exists public.app_events (
  id bigserial primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  kind text not null check (kind in ('open', 'view')),
  area text,
  created_at timestamptz not null default now()
);
create index if not exists app_events_created on public.app_events (created_at);
alter table public.app_events enable row level security;
-- keine direkten Rechte für Nutzer: Schreiben nur über log_event, Lesen nur über app_stats (Admin)

create or replace function public.log_event(p_kind text, p_area text default null)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_member_id();
begin
  if me is null then return; end if;
  if p_kind = 'open' and exists (select 1 from app_events where member_id = me and kind = 'open' and created_at > now() - interval '30 minutes') then return; end if;
  insert into app_events (member_id, kind, area) values (me, p_kind, left(p_area, 40));
end $$;
revoke all on function public.log_event(text, text) from public, anon;
grant execute on function public.log_event(text, text) to authenticated;

create or replace function public.app_stats()
returns json language sql stable security definer set search_path = public as $$
  select case when not public.is_admin() then null else json_build_object(
    'last_seen', (select json_object_agg(member_id, ts) from (select member_id, max(created_at) ts from app_events group by member_id) x),
    'opens', (select json_agg(json_build_object('day', d, 'n', coalesce(n, 0)) order by d) from (
        select g::date d, (select count(*) from app_events e where e.kind = 'open' and (e.created_at at time zone 'Europe/Berlin')::date = g::date) n
        from generate_series((now() at time zone 'Europe/Berlin')::date - 13, (now() at time zone 'Europe/Berlin')::date, interval '1 day') g) y),
    'areas', (select json_agg(json_build_object('area', area, 'n', n) order by n desc) from (
        select area, count(*) n from app_events where kind = 'view' and created_at > now() - interval '30 days' group by area) z)
  ) end
$$;
revoke all on function public.app_stats() from public, anon;
grant execute on function public.app_stats() to authenticated;
