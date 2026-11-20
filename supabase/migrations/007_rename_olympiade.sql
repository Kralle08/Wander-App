-- Umbenennung: Pool-Olympiade → Jubiläums-Olympiade
update public.reveals set teaser = 'Die Disziplinen der Jubiläums-Olympiade' where teaser = 'Die Disziplinen der Pool-Olympiade';
