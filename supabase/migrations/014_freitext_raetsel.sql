-- Freitext-Rätsel: jeder schreibt frei, die Reiseleitung kürt die beste Antwort
alter table public.riddles drop constraint if exists riddles_kind_check;
alter table public.riddles add constraint riddles_kind_check check (kind in ('archiv','mallorca','schaetzen','frei'));

alter table public.riddle_answers add column if not exists text_value text check (char_length(text_value) <= 300);
alter table public.riddle_solutions add column if not exists winner_ids uuid[] not null default '{}';

-- Die Reiseleitung muss die Antworten vor der Auflösung lesen können, um zu küren
drop policy if exists answers_select on public.riddle_answers;
create policy answers_select on public.riddle_answers for select to authenticated
  using (public.is_member() and (member_id = public.current_member_id() or public.is_admin() or exists (
    select 1 from public.riddles r where r.id = riddle_id and r.resolve_at <= now())));

-- Rangliste: Gekürte bei Freitext-Rätseln bekommen die Punkte
create or replace function public.riddle_leaderboard()
returns table (member_id uuid, nickname text, points int, answered int)
language sql stable security definer set search_path = public as $$
  with resolved as (
    select r.id, r.points, r.kind, s.correct_option, s.numeric_answer, s.winner_ids
    from riddles r join riddle_solutions s on s.riddle_id = r.id
    where r.resolve_at <= now()
  ),
  choice_pts as (
    select a.member_id, res.points
    from riddle_answers a join resolved res on res.id = a.riddle_id
    where res.kind in ('archiv','mallorca') and a.option_index = res.correct_option
  ),
  est as (
    select a.member_id, res.points, res.id,
           abs(a.numeric_value - res.numeric_answer) as dist,
           min(abs(a.numeric_value - res.numeric_answer)) over (partition by res.id) as best
    from riddle_answers a join resolved res on res.id = a.riddle_id
    where res.kind = 'schaetzen' and a.numeric_value is not null
  ),
  est_pts as (select member_id, points from est where dist = best),
  free_pts as (
    select a.member_id, res.points
    from riddle_answers a join resolved res on res.id = a.riddle_id
    where res.kind = 'frei' and a.member_id = any(res.winner_ids)
  ),
  all_pts as (select * from choice_pts union all select * from est_pts union all select * from free_pts),
  answered as (
    select a.member_id, count(*)::int as n from riddle_answers a join resolved res on res.id = a.riddle_id group by a.member_id
  )
  select m.id, m.nickname, coalesce(sum(p.points), 0)::int, coalesce(max(an.n), 0)::int
  from members m
  left join all_pts p on p.member_id = m.id
  left join answered an on an.member_id = m.id
  where public.is_member() and not m.is_guest and not m.is_quizmaster
  group by m.id, m.nickname
  order by 3 desc, 2
$$;
revoke all on function public.riddle_leaderboard() from anon;

-- Etappe 1 (der neue Name) wird zur offenen Frage: beste Erklärung gewinnt, 2 Punkte
update public.riddles
   set kind = 'frei', options = null, points = 2,
       question = 'Ab sofort hat unsere Truppe einen Namen: HIKE! · Crew Hessen · est. 2018. Was steckt hinter dem Wort mit dem Ausrufezeichen? Schreib deine Erklärung – die beste (oder lustigste) kürt die Reiseleitung.'
 where nr = 1;
update public.riddle_solutions s
   set correct_option = null
  from public.riddles r where r.id = s.riddle_id and r.nr = 1;
