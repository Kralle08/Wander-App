-- Push-Benachrichtigungen (Web Push)
create table if not exists public.push_subscriptions (
  id bigserial primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_own_select on public.push_subscriptions for select to authenticated using (member_id = public.current_member_id());
create policy push_own_delete on public.push_subscriptions for delete to authenticated using (member_id = public.current_member_id());
grant select, delete on public.push_subscriptions to authenticated;

-- Abo speichern (Gerät gehört danach dem angemeldeten Mitglied)
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_member_id() is null then raise exception 'not a member'; end if;
  insert into public.push_subscriptions (member_id, endpoint, p256dh, auth, user_agent)
  values (public.current_member_id(), p_endpoint, p_p256dh, p_auth, p_ua)
  on conflict (endpoint) do update set member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end $$;
revoke all on function public.save_push_subscription(text,text,text,text) from public, anon;
grant execute on function public.save_push_subscription(text,text,text,text) to authenticated;

-- Was schon verschickt wurde (damit nichts doppelt kommt)
create table if not exists public.push_log (
  kind text not null,
  ref_id int not null,
  sent_at timestamptz not null default now(),
  recipients int,
  primary key (kind, ref_id)
);
alter table public.push_log enable row level security;
create policy push_log_admin on public.push_log for select to authenticated using (public.is_admin());
grant select on public.push_log to authenticated;

-- Geheimnisse liegen im Vault; lesen darf sie nur die Edge Function (service_role)
create or replace function public.push_secrets()
returns table (vapid_private text, cron_secret text)
language sql stable security definer set search_path = public, vault as $$
  select (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private'),
         (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret');
$$;
revoke all on function public.push_secrets() from public, anon, authenticated;
grant execute on function public.push_secrets() to service_role;
