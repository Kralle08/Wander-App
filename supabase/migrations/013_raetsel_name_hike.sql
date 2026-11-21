-- Neuer Auftakt: Etappe 1 fragt nach der Bedeutung des neuen Truppennamens HIKE!
-- Die bisherigen Etappen 1–11 rücken je einen Termin nach hinten.
-- Die UNESCO-Frage (bisher Nr. 12) wandert in die Reserve, damit es bei 20 Etappen bleibt
-- und die letzte Auflösung vor der Tour liegt.
begin;

create temp table slots on commit drop as
  select nr, publish_at, resolve_at from public.riddles;

delete from public.riddles where nr = 12;  -- UNESCO-Welterbe → Reserve

update public.riddles set nr = nr + 100 where nr between 1 and 11;
update public.riddles r
   set nr = s.nr, publish_at = s.publish_at, resolve_at = s.resolve_at
  from slots s
 where r.nr between 101 and 111 and s.nr = r.nr - 100 + 1;

with ins as (
  insert into public.riddles (nr, kind, question, options, points, publish_at, resolve_at)
  select 1, 'archiv',
         'Ab sofort hat unsere Truppe einen Namen: HIKE! · Crew Hessen · est. 2018. Was steckt hinter dem Wort mit dem Ausrufezeichen?',
         '["Einfach das englische Wort für Wandern","Das Kommando beim Football-Snap – und Wandern zugleich","Hessische Interessengemeinschaft Kultivierter Einkehr","Hessisch für den Schluckauf nach dem dritten Starterschnaps"]'::jsonb,
         1, s.publish_at, s.resolve_at
    from slots s where s.nr = 1
  returning id)
insert into public.riddle_solutions (riddle_id, correct_option, numeric_answer, explanation)
select id, 1, null,
  'Beides! „Hike“ heißt auf Englisch Wandern – und „Hike!“ ruft der Quarterback, wenn der Ball gesnappt wird und der Spielzug losgeht. Wer sonntags Football schaut und einmal im Jahr wandert, braucht genau dieses Wort. Ab sofort unser Schlachtruf am Start jeder Etappe: Hut, hut … HIKE!'
from ins;

commit;
