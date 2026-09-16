create function public.ghostkey_take_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requests integer;
  v_resets_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  insert into public.secret_rate_limits as limits (bucket_key, requests, resets_at)
  values (p_key, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (bucket_key) do update set
    requests = case when limits.resets_at <= v_now then 1 else least(limits.requests + 1, p_limit + 1) end,
    resets_at = case when limits.resets_at <= v_now then excluded.resets_at else limits.resets_at end
  returning requests, resets_at into v_requests, v_resets_at;

  if v_requests > p_limit then
    return greatest(1, ceil(extract(epoch from (v_resets_at - v_now)))::integer);
  end if;
  return 0;
end;
$$;

create function public.ghostkey_unavailable_state(p_secret_hash text)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce(
    (select state from public.secret_tombstones
     where secret_hash = p_secret_hash and retained_until > clock_timestamp()),
    'not_found'
  );
$$;

create function public.create_secret(
  p_secret_hash text,
  p_deletion_token_hash text,
  p_ciphertext text,
  p_iv text,
  p_expires_in integer,
  p_max_views integer,
  p_rate_limit_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_retry_after integer;
  v_expires_at timestamptz;
begin
  if p_secret_hash is null or p_secret_hash !~ '^[a-f0-9]{64}$'
     or p_deletion_token_hash is null or p_deletion_token_hash !~ '^[a-f0-9]{64}$'
     or p_ciphertext is null or length(p_ciphertext) not between 23 and 1398123
     or p_ciphertext !~ '^[A-Za-z0-9_-]+$'
     or p_iv is null or p_iv !~ '^[A-Za-z0-9_-]{16}$'
     or p_expires_in is null or p_expires_in not between 60 and 2592000
     or p_max_views is null or p_max_views not between 0 and 100
     or p_rate_limit_key is null or p_rate_limit_key !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status', 'invalid_request');
  end if;

  v_retry_after := public.ghostkey_take_rate_limit('create:' || p_rate_limit_key, 30, 3600);
  if v_retry_after = 0 then
    v_retry_after := public.ghostkey_take_rate_limit('create:global', 1000, 3600);
  end if;
  if v_retry_after > 0 then
    return jsonb_build_object('status', 'rate_limited', 'retry_after', v_retry_after);
  end if;

  v_expires_at := clock_timestamp() + make_interval(secs => p_expires_in);
  insert into public.secrets (secret_hash, deletion_token_hash, ciphertext, iv, expires_at, max_views)
  values (p_secret_hash, p_deletion_token_hash, p_ciphertext, p_iv, v_expires_at, p_max_views);

  return jsonb_build_object('status', 'created', 'expires_at', v_expires_at, 'max_views', p_max_views);
end;
$$;

-- Metadata never returns ciphertext and never spends a view.
create function public.peek_secret(p_secret_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret public.secrets%rowtype;
  v_state text;
begin
  select * into v_secret from public.secrets
  where secret_hash = p_secret_hash for update;

  if not found then
    return jsonb_build_object('status', public.ghostkey_unavailable_state(p_secret_hash));
  end if;

  if v_secret.expires_at <= clock_timestamp() then
    v_state := 'expired';
  elsif v_secret.max_views > 0 and v_secret.view_count >= v_secret.max_views then
    v_state := 'consumed';
  end if;

  if v_state is not null then
    delete from public.secrets where id = v_secret.id;
    insert into public.secret_tombstones (secret_hash, state) values (p_secret_hash, v_state)
    on conflict (secret_hash) do nothing;
    return jsonb_build_object('status', v_state);
  end if;

  return jsonb_build_object(
    'status', 'available', 'expires_at', v_secret.expires_at,
    'max_views', v_secret.max_views, 'view_count', v_secret.view_count
  );
end;
$$;

-- The row lock, expiry check, view accounting, ciphertext return and deletion
-- share a single transaction. Waiting consumers recheck after the lock is released.
create function public.consume_secret(p_secret_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret public.secrets%rowtype;
  v_state text;
  v_view_count integer;
begin
  select * into v_secret from public.secrets
  where secret_hash = p_secret_hash for update;

  if not found then
    return jsonb_build_object('status', public.ghostkey_unavailable_state(p_secret_hash));
  end if;

  -- clock_timestamp() is checked AFTER acquiring the lock, not at transaction start.
  if v_secret.expires_at <= clock_timestamp() then
    v_state := 'expired';
  elsif v_secret.max_views > 0 and v_secret.view_count >= v_secret.max_views then
    v_state := 'consumed';
  end if;

  if v_state is not null then
    delete from public.secrets where id = v_secret.id;
    insert into public.secret_tombstones (secret_hash, state) values (p_secret_hash, v_state)
    on conflict (secret_hash) do nothing;
    return jsonb_build_object('status', v_state);
  end if;

  v_view_count := v_secret.view_count + 1;
  if v_secret.max_views > 0 and v_view_count >= v_secret.max_views then
    delete from public.secrets where id = v_secret.id;
    insert into public.secret_tombstones (secret_hash, state) values (p_secret_hash, 'consumed')
    on conflict (secret_hash) do nothing;
  else
    update public.secrets set view_count = v_view_count where id = v_secret.id;
  end if;

  return jsonb_build_object(
    'status', 'available', 'ciphertext', v_secret.ciphertext, 'iv', v_secret.iv,
    'expires_at', v_secret.expires_at, 'max_views', v_secret.max_views, 'view_count', v_view_count
  );
end;
$$;

-- Possession of the shared URL is deliberately insufficient to revoke a secret.
create function public.delete_secret(p_secret_hash text, p_deletion_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret public.secrets%rowtype;
begin
  select * into v_secret from public.secrets
  where secret_hash = p_secret_hash and deletion_token_hash = p_deletion_token_hash
  for update;
  if not found then
    return jsonb_build_object('status', 'forbidden');
  end if;

  delete from public.secrets where id = v_secret.id;
  insert into public.secret_tombstones (secret_hash, state)
  values (p_secret_hash, case when v_secret.expires_at <= clock_timestamp() then 'expired' else 'consumed' end)
  on conflict (secret_hash) do nothing;
  return jsonb_build_object('status', 'deleted');
end;
$$;

create function public.cleanup_expired_secrets()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    delete from public.secrets where expires_at <= clock_timestamp() returning secret_hash
  )
  insert into public.secret_tombstones (secret_hash, state)
  select secret_hash, 'expired' from expired
  on conflict (secret_hash) do nothing;
  get diagnostics v_count = row_count;

  delete from public.secret_tombstones where retained_until <= clock_timestamp();
  delete from public.secret_rate_limits where resets_at <= clock_timestamp();
  return v_count;
end;
$$;

revoke all on function public.ghostkey_take_rate_limit(text, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.ghostkey_unavailable_state(text) from public, anon, authenticated, service_role;
revoke all on function public.create_secret(text, text, text, text, integer, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.peek_secret(text) from public, anon, authenticated, service_role;
revoke all on function public.consume_secret(text) from public, anon, authenticated, service_role;
revoke all on function public.delete_secret(text, text) from public, anon, authenticated, service_role;
revoke all on function public.cleanup_expired_secrets() from public, anon, authenticated, service_role;

grant execute on function public.create_secret(text, text, text, text, integer, integer, text) to service_role;
grant execute on function public.peek_secret(text) to service_role;
grant execute on function public.consume_secret(text) to service_role;
grant execute on function public.delete_secret(text, text) to service_role;
grant execute on function public.cleanup_expired_secrets() to service_role;
