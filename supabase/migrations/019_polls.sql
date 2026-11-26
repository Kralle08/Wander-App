-- Abstimmungen (wie in WhatsApp): Ralle legt an, alle Mitglieder stimmen ab, jeder sieht, wer was gewählt hat
create table public.polls (
  id serial primary key,
  question text not null check (length(question) between 3 and 200),
  multi boolean not null default false,
  closes_at timestamptz,
  closed boolean not null default false,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now()
);
create table public.poll_options (
  id serial primary key,
  poll_id int not null references public.polls(id) on delete cascade,
  label text not null check (length(label) between 1 and 120),
  sort int not null default 0
);
create table public.poll_votes (
  poll_id int not null references public.polls(id) on delete cascade,
  option_id int not null references public.poll_options(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, member_id)
);
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

create policy polls_select on public.polls for select to authenticated using (public.is_member());
create policy polls_admin_ins on public.polls for insert to authenticated with check (public.is_admin());
create policy polls_admin_upd on public.polls for update to authenticated using (public.is_admin());
create policy polls_admin_del on public.polls for delete to authenticated using (public.is_admin());
create policy popt_select on public.poll_options for select to authenticated using (public.is_member());
create policy popt_admin_ins on public.poll_options for insert to authenticated with check (public.is_admin());
create policy popt_admin_del on public.poll_options for delete to authenticated using (public.is_admin());
create policy pvote_select on public.poll_votes for select to authenticated using (public.is_member());

grant select, insert, update, delete on public.polls to authenticated;
grant select, insert, delete on public.poll_options to authenticated;
grant select on public.poll_votes to authenticated;
grant usage, select on sequence public.polls_id_seq, public.poll_options_id_seq to authenticated;
grant select on public.polls to service_role;

-- Abstimmen: ersetzt die eigenen Stimmen dieser Abstimmung (leere Liste = Stimme zurückziehen)
create or replace function public.vote_poll(p_poll int, p_options int[])
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_member_id(); p public.polls;
begin
  if me is null then raise exception 'not a member'; end if;
  select * into p from public.polls where id = p_poll;
  if not found then raise exception 'Abstimmung nicht gefunden'; end if;
  if p.closed or (p.closes_at is not null and p.closes_at <= now()) then raise exception 'Die Abstimmung ist beendet.'; end if;
  if not p.multi and coalesce(array_length(p_options, 1), 0) > 1 then raise exception 'Nur eine Antwort möglich.'; end if;
  if exists (select 1 from unnest(p_options) o where o not in (select id from public.poll_options where poll_id = p_poll)) then raise exception 'Ungültige Option'; end if;
  delete from public.poll_votes where poll_id = p_poll and member_id = me;
  insert into public.poll_votes (poll_id, option_id, member_id) select p_poll, o, me from unnest(p_options) o;
end $$;
revoke all on function public.vote_poll(int, int[]) from public, anon;
grant execute on function public.vote_poll(int, int[]) to authenticated;
