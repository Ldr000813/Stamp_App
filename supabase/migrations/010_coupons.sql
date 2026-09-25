-- Coupons (admin-managed) + per-user redemptions (slide-to-use marks them used).
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  title_ja text not null,
  title_en text,
  description_ja text,
  description_en text,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons(id) on delete cascade,
  participant_id uuid not null,
  redeemed_at timestamptz not null default now(),
  unique (coupon_id, participant_id)
);

create index if not exists coupon_redemptions_participant_idx on coupon_redemptions (participant_id);

alter table coupons enable row level security;
alter table coupon_redemptions enable row level security;
-- Public may read coupons; all writes go through the server (service role).
create policy "public read coupons" on coupons for select using (true);
create policy "public read redemptions" on coupon_redemptions for select using (true);
