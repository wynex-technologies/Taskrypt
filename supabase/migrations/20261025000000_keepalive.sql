-- =============================================================================
-- Keep-alive ping.
--
-- Free-plan Supabase projects are paused after about a week without database
-- activity. A scheduled job (.github/workflows/supabase-keepalive.yml in the
-- repository root, or any external cron) calls this RPC with the PUBLIC anon key
-- every few days so the project always sees real database traffic.
--
-- It reads one row through an index and returns only a boolean, so it reveals
-- nothing about user data and costs a few bytes of egress per call.
-- =============================================================================

create or replace function public.keepalive()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.profiles limit 1;
  return true;
end;
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
