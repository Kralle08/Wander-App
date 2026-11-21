-- Antwortfenster: 3 Tage (Sonntag 20:00 bis Mittwoch 20:00), Rhythmus bleibt 14 Tage
update public.riddles
   set resolve_at = ((publish_at at time zone 'Europe/Berlin') + interval '3 days') at time zone 'Europe/Berlin';
