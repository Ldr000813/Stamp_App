-- 完了時のクーポン付与を「カードのサイクルごとにちょうど1回」に厳密化する。
-- 同時スキャンで完了した場合でも、取りこぼし（0回）も二重付与（2回）も起きないよう、
-- coupon_grants に (どのカードの・第何サイクルの) 完了かを持たせ、一意にする。

alter table coupon_grants add column if not exists reward_id uuid references rewards(id) on delete set null;
alter table coupon_grants add column if not exists cycle int not null default 0;

-- 同一 (参加者・カード・クーポン・サイクル) の付与は1回だけ。
-- 既存行は reward_id が NULL のため（NULL は一意判定上は互いに区別される）衝突しない。
create unique index if not exists coupon_grants_once_idx
  on coupon_grants (participant_id, reward_id, coupon_id, cycle);
