-- Multiple rewards per campaign. Each reward has its own stamp threshold, and
-- only stamps earned AFTER the reward's created_at count toward it.
create table if not exists rewards (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  title_ja text not null,
  title_en text,
  body_ja text,
  body_en text,
  image_url text,
  required_stamps int not null default 5,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists rewards_campaign_idx on rewards (campaign_id);
alter table rewards enable row level security;
create policy "public read rewards" on rewards for select using (true);
