-- Punkte je Rätsel und Mitglied (nur aufgelöste Rätsel) – Grundlage für den Rückblick nach jeder Etappe
create or replace function public.riddle_points()
returns table (riddle_id int, member_id uuid, points int)
language sql stable security definer set search_path = public as $$
  with resolved as (
    select r.id, r.points, r.kind, s.correct_option, s.numeric_answer, s.winner_ids
    from riddles r join riddle_solutions s on s.riddle_id = r.id
    where r.resolve_at <= now()
  ),
  est as (
    select a.riddle_id, a.member_id, res.points,
           abs(a.numeric_value - res.numeric_answer) as dist,
           min(abs(a.numeric_value - res.numeric_answer)) over (partition by res.id) as best
    from riddle_answers a join resolved res on res.id = a.riddle_id
    where res.kind = 'schaetzen' and a.numeric_value is not null
  )
  select a.riddle_id, a.member_id,
    (case
      when res.kind in ('archiv','mallorca') and a.option_index = res.correct_option then res.points
      when res.kind = 'frei' and a.member_id = any(res.winner_ids) then res.points
      when res.kind = 'schaetzen' and exists (select 1 from est e where e.riddle_id = a.riddle_id and e.member_id = a.member_id and e.dist = e.best) then res.points
      else 0 end)::int
  from riddle_answers a join resolved res on res.id = a.riddle_id
  join members m on m.id = a.member_id
  where public.is_member() and not m.is_guest and not m.is_quizmaster;
$$;
revoke all on function public.riddle_points() from public, anon;
grant execute on function public.riddle_points() to authenticated;
