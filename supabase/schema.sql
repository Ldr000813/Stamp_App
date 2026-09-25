-- ============================================================
-- Digital Stamp Rally — schema (run in Supabase SQL editor)
-- Participants are ANONYMOUS: a client-generated UUID, no PII.
-- ============================================================
create extension if not exists pgcrypto;

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name_ja text not null,
  name_en text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  required_stamps int not null default 5,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists spots (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(9), 'hex'),
  name_ja text not null,
  name_en text not null,
  description_ja text,
  description_en text,
  category text,
  lat double precision,
  lng double precision,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists campaign_spots (
  campaign_id uuid references campaigns(id) on delete cascade,
  spot_id uuid references spots(id) on delete cascade,
  primary key (campaign_id, spot_id)
);

create table if not exists stamps (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  spot_id uuid not null references spots(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  unique (participant_id, campaign_id, spot_id)   -- duplicate prevention
);

-- Row Level Security
alter table campaigns enable row level security;
alter table spots enable row level security;
alter table campaign_spots enable row level security;
alter table stamps enable row level security;

-- Public may READ campaigns/spots/links (no sensitive data). Reads for the
-- participant app actually go through server API routes (service role), but
-- these policies keep the tables safe if the anon key is ever used directly.
create policy "public read campaigns" on campaigns for select using (true);
create policy "public read spots" on spots for select using (true);
create policy "public read campaign_spots" on campaign_spots for select using (true);
-- stamps: NO anon policies => anon/public cannot read or write.
-- Only the server (service_role key) can touch stamps. service_role bypasses RLS.

-- Seed one active campaign so the app works immediately.
insert into campaigns (name_ja, name_en, required_stamps, active)
values ('京都まちめぐりスタンプラリー', 'Kyoto Machi-meguri Stamp Rally', 5, true);
