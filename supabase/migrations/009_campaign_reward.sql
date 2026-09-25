-- Editable completion reward (admin-only), stored on the active campaign.
alter table campaigns add column if not exists reward_title_ja text;
alter table campaigns add column if not exists reward_title_en text;
alter table campaigns add column if not exists reward_body_ja text;
alter table campaigns add column if not exists reward_body_en text;
alter table campaigns add column if not exists reward_image_url text;
