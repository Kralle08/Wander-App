-- Wander-App: Grundschema mit Row Level Security
-- Nur eingetragene Mitglieder sehen Daten. Admins (Reiseleitung) dürfen verwalten.

create extension if not exists pgcrypto;

-- ===================== Mitglieder =====================
create table public.members (
  id uuid primary key default gen_random_uuid(),
  nickname text not null unique,
  full_name text,
  email text unique,
  user_id uuid unique references auth.users(id) on delete set null,
  is_admin boolean not null default false,
  is_guest boolean not null default false,
  is_quizmaster boolean not null default false,
  created_at timestamptz not null default now(),
  constraint email_lower check (email is null or email = lower(email))
);

-- Hilfsfunktionen (security definer, damit RLS-Prüfungen nicht rekursiv werden)
create or replace function public.current_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.members
  where user_id = auth.uid()
     or (email is not null and email = lower(coalesce(auth.jwt() ->> 'email', '')))
  order by (user_id = auth.uid()) desc nulls last
  limit 1
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_member_id() is not null
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.members where id = public.current_member_id()), false)
$$;

-- Beim ersten Login verknüpft die App den Login mit dem Mitgliedseintrag
create or replace function public.claim_member()
returns uuid language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  update public.members set user_id = auth.uid()
  where user_id is null and email = lower(coalesce(auth.jwt() ->> 'email', ''))
  returning id into mid;
  if mid is null then
    select id into mid from public.members where user_id = auth.uid();
  end if;
  return mid;
end $$;

-- ===================== Touren & Etappen =====================
create table public.tours (
  id serial primary key,
  year int not null unique,
  title text not null,
  region text,
  date_from date,
  date_to date,
  motto text,
  summary text,
  created_at timestamptz not null default now()
);

create table public.tour_organizers (
  tour_id int not null references public.tours(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  primary key (tour_id, member_id)
);

create table public.stages (
  id serial primary key,
  tour_id int not null references public.tours(id) on delete cascade,
  sort int not null default 0,
  day_label text not null,
  title text not null,
  meta text,
  description text,
  km numeric(5,1),
  hm int,
  stay text,
  is_secret boolean not null default false,
  reveal_at timestamptz
);

create table public.tour_photos (
  id serial primary key,
  tour_id int not null references public.tours(id) on delete cascade,
  storage_path text not null,
  caption text,
  sort int not null default 0
);

-- ===================== Teilnahme =====================
create table public.rsvps (
  tour_id int not null references public.tours(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  status text not null check (status in ('ja','vielleicht','nein')),
  set_by uuid references public.members(id),
  updated_at timestamptz not null default now(),
  primary key (tour_id, member_id)
);

-- ===================== Reveals =====================
create table public.reveals (
  id serial primary key,
  tour_id int not null references public.tours(id) on delete cascade,
  sort int not null,
  teaser text not null,
  reveal_at timestamptz not null,
  is_joke boolean not null default false
);

create table public.reveal_contents (
  reveal_id int primary key references public.reveals(id) on delete cascade,
  title text,
  body text,
  image_path text
);

-- ===================== Rätsel =====================
create table public.riddles (
  id serial primary key,
  nr int not null unique,
  kind text not null check (kind in ('archiv','mallorca','schaetzen')),
  question text not null,
  options jsonb,               -- Liste von Antworttexten; null bei Schätzfragen
  points int not null default 1,
  publish_at timestamptz not null,
  resolve_at timestamptz not null,
  check (resolve_at > publish_at)
);

create table public.riddle_solutions (
  riddle_id int primary key references public.riddles(id) on delete cascade,
  correct_option int,          -- Index in options (ab 0)
  numeric_answer numeric,      -- bei Schätzfragen
  explanation text
);

create table public.riddle_answers (
  riddle_id int not null references public.riddles(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  option_index int,
  numeric_value numeric,
  created_at timestamptz not null default now(),
  primary key (riddle_id, member_id)
);

-- ===================== Kasse =====================
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  tour_id int not null references public.tours(id) on delete cascade,
  title text not null,
  amount numeric(10,2) not null check (amount > 0),
  paid_by uuid not null references public.members(id),
  created_by uuid not null references public.members(id),
  created_at timestamptz not null default now()
);

create table public.expense_shares (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  primary key (expense_id, member_id)
);

-- ===================== Tagebuch =====================
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  tour_id int not null references public.tours(id) on delete cascade,
  author_id uuid not null references public.members(id) on delete cascade,
  body text,
  photo_path text,
  is_checkin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  primary key (post_id, member_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.members(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- ===================== Bewertungen =====================
create table public.stage_ratings (
  stage_id int not null references public.stages(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  scores jsonb not null,
  created_at timestamptz not null default now(),
  primary key (stage_id, member_id)
);

create table public.orga_ratings (
  tour_id int not null references public.tours(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  scores jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tour_id, member_id)
);

-- ===================== Orga-Kalender =====================
create table public.orga_slots (
  year int not null check (year >= 2028),
  slot smallint not null check (slot in (1,2)),
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (year, slot)
);

-- ===================== Packliste =====================
create table public.packing_checks (
  member_id uuid not null references public.members(id) on delete cascade,
  item_key text not null,
  checked boolean not null default true,
  primary key (member_id, item_key)
);

-- ===================== Row Level Security =====================
alter table public.members enable row level security;
alter table public.tours enable row level security;
alter table public.tour_organizers enable row level security;
alter table public.stages enable row level security;
alter table public.tour_photos enable row level security;
alter table public.rsvps enable row level security;
alter table public.reveals enable row level security;
alter table public.reveal_contents enable row level security;
alter table public.riddles enable row level security;
alter table public.riddle_solutions enable row level security;
alter table public.riddle_answers enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.comments enable row level security;
alter table public.stage_ratings enable row level security;
alter table public.orga_ratings enable row level security;
alter table public.orga_slots enable row level security;
alter table public.packing_checks enable row level security;

-- Mitglieder: alle Mitglieder sehen die Liste (ohne dass Fremde etwas sehen); Admins verwalten
create policy members_select on public.members for select to authenticated using (public.is_member());
create policy members_admin_write on public.members for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Stammdaten: lesen für Mitglieder, schreiben für Admins
create policy tours_select on public.tours for select to authenticated using (public.is_member());
create policy tours_admin on public.tours for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy tour_org_select on public.tour_organizers for select to authenticated using (public.is_member());
create policy tour_org_admin on public.tour_organizers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy photos_select on public.tour_photos for select to authenticated using (public.is_member());
create policy photos_admin on public.tour_photos for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Etappen: geheime Etappen erst nach Enthüllung sichtbar (Admins sehen alles)
create policy stages_select on public.stages for select to authenticated
  using (public.is_member() and (not is_secret or (reveal_at is not null and reveal_at <= now()) or public.is_admin()));
create policy stages_admin on public.stages for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Teilnahme: jeder setzt seinen eigenen Status, Admins jeden
create policy rsvps_select on public.rsvps for select to authenticated using (public.is_member());
create policy rsvps_own_insert on public.rsvps for insert to authenticated
  with check (member_id = public.current_member_id() or public.is_admin());
create policy rsvps_own_update on public.rsvps for update to authenticated
  using (member_id = public.current_member_id() or public.is_admin())
  with check (member_id = public.current_member_id() or public.is_admin());
create policy rsvps_admin_delete on public.rsvps for delete to authenticated using (public.is_admin());

-- Reveals: Teaser und Termin sichtbar, Inhalt erst ab Enthüllung
create policy reveals_select on public.reveals for select to authenticated using (public.is_member());
create policy reveals_admin on public.reveals for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy reveal_contents_select on public.reveal_contents for select to authenticated
  using (public.is_member() and (public.is_admin() or exists (
    select 1 from public.reveals r where r.id = reveal_id and r.reveal_at <= now())));
create policy reveal_contents_admin on public.reveal_contents for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Rätsel: erst ab Veröffentlichung sichtbar, Lösung erst ab Auflösung
create policy riddles_select on public.riddles for select to authenticated
  using (public.is_member() and (publish_at <= now() or public.is_admin()));
create policy riddles_admin on public.riddles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy solutions_select on public.riddle_solutions for select to authenticated
  using (public.is_member() and (public.is_admin() or exists (
    select 1 from public.riddles r where r.id = riddle_id and r.resolve_at <= now())));
create policy solutions_admin on public.riddle_solutions for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Antworten: eigene Antwort jederzeit lesbar, fremde erst nach Auflösung; abgeben nur im offenen Zeitraum
create policy answers_select on public.riddle_answers for select to authenticated
  using (public.is_member() and (member_id = public.current_member_id() or exists (
    select 1 from public.riddles r where r.id = riddle_id and r.resolve_at <= now())));
create policy answers_insert on public.riddle_answers for insert to authenticated
  with check (member_id = public.current_member_id() and exists (
    select 1 from public.riddles r where r.id = riddle_id and r.publish_at <= now() and r.resolve_at > now()));
create policy answers_update on public.riddle_answers for update to authenticated
  using (member_id = public.current_member_id())
  with check (member_id = public.current_member_id() and exists (
    select 1 from public.riddles r where r.id = riddle_id and r.publish_at <= now() and r.resolve_at > now()));

-- Kasse: alle Mitglieder lesen; eintragen darf jeder, ändern/löschen der Ersteller oder Admins
create policy expenses_select on public.expenses for select to authenticated using (public.is_member());
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.is_member() and created_by = public.current_member_id());
create policy expenses_update on public.expenses for update to authenticated
  using (created_by = public.current_member_id() or public.is_admin())
  with check (created_by = public.current_member_id() or public.is_admin());
create policy expenses_delete on public.expenses for delete to authenticated
  using (created_by = public.current_member_id() or public.is_admin());
create policy shares_select on public.expense_shares for select to authenticated using (public.is_member());
create policy shares_write on public.expense_shares for all to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and (e.created_by = public.current_member_id() or public.is_admin())))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and (e.created_by = public.current_member_id() or public.is_admin())));

-- Tagebuch
create policy posts_select on public.posts for select to authenticated using (public.is_member());
create policy posts_insert on public.posts for insert to authenticated with check (author_id = public.current_member_id());
create policy posts_update on public.posts for update to authenticated using (author_id = public.current_member_id()) with check (author_id = public.current_member_id());
create policy posts_delete on public.posts for delete to authenticated using (author_id = public.current_member_id() or public.is_admin());
create policy likes_select on public.post_likes for select to authenticated using (public.is_member());
create policy likes_insert on public.post_likes for insert to authenticated with check (member_id = public.current_member_id());
create policy likes_delete on public.post_likes for delete to authenticated using (member_id = public.current_member_id());
create policy comments_select on public.comments for select to authenticated using (public.is_member());
create policy comments_insert on public.comments for insert to authenticated with check (author_id = public.current_member_id());
create policy comments_delete on public.comments for delete to authenticated using (author_id = public.current_member_id() or public.is_admin());

-- Bewertungen: eigene schreiben, alle lesen
create policy stage_ratings_select on public.stage_ratings for select to authenticated using (public.is_member());
create policy stage_ratings_write on public.stage_ratings for all to authenticated
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());
create policy orga_ratings_select on public.orga_ratings for select to authenticated using (public.is_member());
create policy orga_ratings_write on public.orga_ratings for all to authenticated
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());

-- Orga-Kalender: selbst eintragen/austragen, Admins alles
create policy orga_slots_select on public.orga_slots for select to authenticated using (public.is_member());
create policy orga_slots_insert on public.orga_slots for insert to authenticated
  with check (member_id = public.current_member_id() or public.is_admin());
create policy orga_slots_delete on public.orga_slots for delete to authenticated
  using (member_id = public.current_member_id() or public.is_admin());

-- Packliste: privat pro Person
create policy packing_own on public.packing_checks for all to authenticated
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());

-- ===================== Rätsel-Rangliste =====================
-- Zählt nur aufgelöste Rätsel. Schätzfragen: die nächstliegende Antwort bekommt die Punkte.
create or replace function public.riddle_leaderboard()
returns table (member_id uuid, nickname text, points int, answered int)
language sql stable security definer set search_path = public as $$
  with resolved as (
    select r.id, r.points, r.kind, s.correct_option, s.numeric_answer
    from riddles r join riddle_solutions s on s.riddle_id = r.id
    where r.resolve_at <= now()
  ),
  choice_pts as (
    select a.member_id, res.points
    from riddle_answers a join resolved res on res.id = a.riddle_id
    where res.kind <> 'schaetzen' and a.option_index = res.correct_option
  ),
  est as (
    select a.member_id, res.points, res.id,
           abs(a.numeric_value - res.numeric_answer) as dist,
           min(abs(a.numeric_value - res.numeric_answer)) over (partition by res.id) as best
    from riddle_answers a join resolved res on res.id = a.riddle_id
    where res.kind = 'schaetzen' and a.numeric_value is not null
  ),
  est_pts as (select member_id, points from est where dist = best),
  all_pts as (select * from choice_pts union all select * from est_pts),
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
revoke all on function public.claim_member() from anon;
