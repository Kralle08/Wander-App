-- Anzahl der abgegebenen Tipps zu einem Rätsel, ohne die Antworten selbst preiszugeben
create or replace function public.riddle_answer_count(rid int)
returns int language sql stable security definer set search_path = public as $$
  select case when public.is_member() then (select count(*)::int from riddle_answers where riddle_id = rid) else 0 end
$$;
revoke execute on function public.riddle_answer_count(int) from public, anon;
grant execute on function public.riddle_answer_count(int) to authenticated;
