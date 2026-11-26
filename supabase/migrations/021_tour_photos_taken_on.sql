-- Aufnahmedatum der Fotos (aus dem Dateinamen) – für "Heute vor X Jahren"
alter table public.tour_photos add column if not exists taken_on date;
