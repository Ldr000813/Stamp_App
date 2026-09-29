-- ============================================================================
-- Stamp cards: each card has its own TARGET SPOTS and its own COUPONS.
-- Stamps belong to a card + cycle (定期 cards reset each completion).
-- On completion, the card's coupons are GRANTED with a 2-month expiry.
-- NOTE: clears existing test data (stamps / coupons / rewards).
-- ============================================================================

-- 0) clear old test data
delete from stamps;
delete from coupons;
delete from rewards;
drop table if exists coupon_redemptions;

-- 1) reward = stamp card (+ recurring flag)
alter table rewards add column if not exists recurring boolean not null default false;

-- 2) stamps belong to a card and a cycle
alter table stamps add column if not exists reward_id uuid references rewards(id) on delete cascade;
alter table stamps add column if not exists cycle int not null default 0;
alter table stamps drop constraint if exists stamps_participant_id_campaign_id_spot_id_key;
alter table stamps drop constraint if exists stamps_participant_reward_spot_cycle_key;
alter table stamps add constraint stamps_participant_reward_spot_cycle_key
  unique (participant_id, reward_id, spot_id, cycle);
create index if not exists stamps_participant_reward_idx on stamps (participant_id, reward_id);

-- 3) per-participant, per-card completion counter (= current cycle)
create table if not exists card_state (
  participant_id uuid not null,
  reward_id uuid not null references rewards(id) on delete cascade,
  completions int not null default 0,
  primary key (participant_id, reward_id)
);

-- 4) which spots count toward a card
create table if not exists card_spots (
  reward_id uuid not null references rewards(id) on delete cascade,
  spot_id uuid not null references spots(id) on delete cascade,
  primary key (reward_id, spot_id)
);

-- 5) which coupons a card grants on completion
create table if not exists card_coupons (
  reward_id uuid not null references rewards(id) on delete cascade,
  coupon_id uuid not null references coupons(id) on delete cascade,
  primary key (reward_id, coupon_id)
);

-- 6) coupon grants (2-month expiry; repeats for 定期 cards)
create table if not exists coupon_grants (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons(id) on delete cascade,
  participant_id uuid not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);
create index if not exists coupon_grants_participant_idx on coupon_grants (participant_id);

alter table coupon_grants enable row level security;
alter table card_state enable row level security;
alter table card_spots enable row level security;
alter table card_coupons enable row level security;

drop policy if exists "public read grants" on coupon_grants;
drop policy if exists "public read card_state" on card_state;
drop policy if exists "public read card_spots" on card_spots;
drop policy if exists "public read card_coupons" on card_coupons;

create policy "public read grants" on coupon_grants for select using (true);
create policy "public read card_state" on card_state for select using (true);
create policy "public read card_spots" on card_spots for select using (true);
create policy "public read card_coupons" on card_coupons for select using (true);
