-- Für die Reiseleitung: wer ist in der App angemeldet, wer hat Mitteilungen an
create or replace function public.member_app_status()
returns table (member_id uuid, logged_in boolean, push_on boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id is not null, exists (select 1 from push_subscriptions s where s.member_id = m.id)
  from members m where public.is_admin();
$$;
revoke all on function public.member_app_status() from public, anon;
grant execute on function public.member_app_status() to authenticated;
