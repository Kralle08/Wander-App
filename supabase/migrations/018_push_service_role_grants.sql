-- Die Edge Function (service_role) braucht Leserechte, sonst sieht sie weder Geräte noch Rätsel/Enthüllungen
grant select, delete on public.push_subscriptions to service_role;
grant select, insert, update on public.push_log to service_role;
grant select on public.riddles, public.reveals to service_role;
