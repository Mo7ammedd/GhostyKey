-- Supabase provides pg_cron. On a plain development PostgreSQL installation,
-- run cleanup_expired_secrets() manually if this extension is unavailable.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule(
      'ghostkey-expiration',
      '*/5 * * * *',
      'select public.cleanup_expired_secrets();'
    );
  else
    raise notice 'pg_cron is unavailable. Schedule public.cleanup_expired_secrets() every 5 minutes before production use.';
  end if;
end;
$$;

