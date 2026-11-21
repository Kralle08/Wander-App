-- Alle 10 Minuten prüfen, ob ein Rätsel oder eine Enthüllung fällig ist (Edge Function send-push)
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('send-push', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://uibuayjywkchgxazprfm.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='push_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$);
-- Geheimnisse (vapid_private, push_cron_secret) wurden direkt im Vault angelegt, nicht im Repo.

-- Testnachricht nur an den angemeldeten Admin
create or replace function public.send_test_push()
returns bigint language plpgsql security definer set search_path = public, vault, net as $$
declare rid bigint;
begin
  if not public.is_admin() then raise exception 'nur Admin'; end if;
  select net.http_post(
    url := 'https://uibuayjywkchgxazprfm.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='push_cron_secret')),
    body := jsonb_build_object('test', true, 'member_id', public.current_member_id())
  ) into rid;
  return rid;
end $$;
revoke all on function public.send_test_push() from public, anon;
grant execute on function public.send_test_push() to authenticated;
