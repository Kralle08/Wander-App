-- Zugriff über die Data API nur für angemeldete Nutzer; RLS entscheidet über die einzelnen Zeilen
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;
