-- Fahrplan der Rätsel (ohne Fragen) für alle Mitglieder, damit Countdown und "Etappe X von 20" stimmen
create or replace function public.riddle_schedule()
returns table (id int, nr int, publish_at timestamptz, resolve_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.nr, r.publish_at, r.resolve_at from public.riddles r
  where public.is_member() order by r.nr;
$$;
revoke all on function public.riddle_schedule() from public, anon;
grant execute on function public.riddle_schedule() to authenticated;
