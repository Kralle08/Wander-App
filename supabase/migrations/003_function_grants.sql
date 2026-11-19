-- Hilfsfunktionen nur für angemeldete Nutzer
revoke execute on function public.current_member_id() from public, anon;
revoke execute on function public.is_member() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.claim_member() from public, anon;
revoke execute on function public.riddle_leaderboard() from public, anon;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.is_member() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.claim_member() to authenticated;
grant execute on function public.riddle_leaderboard() to authenticated;
