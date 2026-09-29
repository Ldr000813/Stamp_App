-- ============================================================================
-- Redesign: stamps belong to a specific stamp card (reward). Cards can be
-- "recurring" (定期): on completion they reset and can be earned again.
-- Coupons are tied to a card and GRANTED (with a 2-month expiry) on completion.
-- NOTE: clears existing test data (stamps / coupons / rewards).
-- ============================================================================

-- 0) clear old data (test data only)
delete from stamps;
delete from coupons;
delete from rewards;
drop table if exists coupon_redemptions;

-- 1) reward = stamp card; add recurring flag
alter table rewards add column if not exists recurring boolean not null default false;

-- 2) stamps belong to a card, and to a "cycle" (for recurring resets)
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

-- 4) coupons belong to a card
alter table coupons add column if not exists reward_id uuid references rewards(id) on delete cascade;

-- 5) coupon grants: created when a card is completed (may repeat for 定期 cards)
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
create policy "public read grants" on coupon_grants for select using (true);
create policy "public read card_state" on card_state for select using (true);
