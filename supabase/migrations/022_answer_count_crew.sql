-- „x von y haben getippt“ zählt nur, wer bei der aktuellen Tour mit Ja oder Vielleicht geantwortet hat (falls noch niemand zugesagt hat: alle)
create or replace function public.riddle_answer_count(rid integer)
returns integer language sql stable security definer set search_path = public as $$
  with tour as (select id from tours order by year desc limit 1),
  crew as (select r.member_id from rsvps r join tour t on t.id = r.tour_id where r.status in ('ja','vielleicht'))
  select case when public.is_member() then (
    select count(*)::int from riddle_answers a join members m on m.id = a.member_id
    where a.riddle_id = rid and not m.is_guest and not m.is_quizmaster
      and (not exists (select 1 from crew) or a.member_id in (select member_id from crew))
  ) else 0 end
$$;
