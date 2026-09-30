-- Per-spot owner allowlist. An owner is granted access purely by their (Google-
-- verified) email being listed here for a spot. Multiple owners per spot are
-- allowed. Only the server (service role) reads/writes this table; owners never
-- see it directly. Admins manage it from the admin screen.

create table if not exists spot_owners (
  spot_id    uuid not null references spots(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now(),
  primary key (spot_id, email)
);

-- Carry over any existing single-owner assignments (spots.owner_email) so nobody
-- loses access when we switch the source of truth to this table.
insert into spot_owners (spot_id, email)
  select id, lower(btrim(owner_email))
  from spots
  where owner_email is not null and btrim(owner_email) <> ''
  on conflict (spot_id, email) do nothing;

-- Look up "which spots does this email own" quickly.
create index if not exists spot_owners_email_idx on spot_owners (email);

-- Accessed only via the service role on the server; enable RLS with no public
-- policies so the anon/authenticated keys can never read the allowlist.
alter table spot_owners enable row level security;
