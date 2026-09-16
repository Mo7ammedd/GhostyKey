-- Public IDs and revocation capabilities are stored only as SHA-256 hashes.
create table public.secrets (
  id uuid primary key default gen_random_uuid(),
  secret_hash text unique not null check (secret_hash ~ '^[a-f0-9]{64}$'),
  deletion_token_hash text not null check (deletion_token_hash ~ '^[a-f0-9]{64}$'),
  ciphertext text not null check (
    length(ciphertext) between 23 and 1398123
    and ciphertext ~ '^[A-Za-z0-9_-]+$'
  ),
  iv text not null check (iv ~ '^[A-Za-z0-9_-]{16}$'),
  expires_at timestamptz not null,
  max_views integer not null default 1 check (max_views between 0 and 100),
  view_count integer not null default 0 check (view_count >= 0),
  created_at timestamptz not null default clock_timestamp(),
  constraint valid_view_count check (max_views = 0 or view_count <= max_views)
);

comment on column public.secrets.max_views is '0 means unlimited views until expiration.';
create index secrets_expiration_idx on public.secrets (expires_at);

-- No ciphertext, keys, creation times, or deletion tokens remain in these receipts.
-- A receipt permits a useful expired/consumed response for at most 24 hours.
create table public.secret_tombstones (
  secret_hash text primary key check (secret_hash ~ '^[a-f0-9]{64}$'),
  state text not null check (state in ('expired', 'consumed')),
  retained_until timestamptz not null default (clock_timestamp() + interval '24 hours')
);
create index secret_tombstones_retention_idx on public.secret_tombstones (retained_until);

-- Rate keys are HMACs of a short-lived, trusted edge identifier. Never raw IPs.
create table public.secret_rate_limits (
  bucket_key text primary key,
  requests integer not null check (requests >= 1),
  resets_at timestamptz not null
);
create index secret_rate_limits_reset_idx on public.secret_rate_limits (resets_at);

alter table public.secrets enable row level security;
alter table public.secret_tombstones enable row level security;
alter table public.secret_rate_limits enable row level security;

-- No browser-accessible policies. Even the server uses narrowly scoped RPCs.
revoke all on public.secrets, public.secret_tombstones, public.secret_rate_limits
  from public, anon, authenticated, service_role;

