-- Tagesablauf je Etappe. Sichtbar nur, wenn die Etappe selbst sichtbar ist (geheime Etappen bleiben geheim).
create table public.stage_schedule (
  id serial primary key,
  stage_id int not null references public.stages(id) on delete cascade,
  at_time text not null,          -- z. B. '08:30'
  title text not null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.stage_schedule enable row level security;
create policy schedule_select on public.stage_schedule for select to authenticated
  using (public.is_member() and exists (select 1 from public.stages s where s.id = stage_id));
create policy schedule_admin on public.stage_schedule for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.stage_schedule to authenticated;
grant usage, select on sequence public.stage_schedule_id_seq to authenticated;
