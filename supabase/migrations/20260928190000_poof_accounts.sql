-- Supabase is only poof's login (Google + email code). Everything else stays in n8n, keyed by the poof user id
-- ("usr_…"). This table links one login to one poof account, both ways (primary key + unique).
create table public.poof_accounts (
  auth_id uuid primary key references auth.users (id) on delete cascade,
  poof_uid text not null unique check (poof_uid ~ '^usr_[a-z0-9]{8,40}$'),
  created_at timestamptz not null default now()
);

-- Only the app's server (service role) reads or writes it: RLS on, no policies.
alter table public.poof_accounts enable row level security;
