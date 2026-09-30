-- Farming 対策: 1つのスポットは「カードごと・1日1回」まで。サイクル(cycle)を
-- 一意キーから外すことで、定期カードでも「同じ日に同じQRを再スキャンして
-- クーポンを量産する」抜け穴を塞ぐ。定期カードの再完了は、日が変わるか、
-- その日にまだ押していない別スポットで行う（＝実際に別の場所を訪れた場合のみ）。

-- 既存の重複（同一 参加者・カード・スポット・日付 が別サイクルで複数ある farming の痕跡）
-- があると新しい一意インデックスが作れないため、最古の1件だけ残して除去する。
-- （通常運用で正当に貯めたスタンプは各スポット1日1件なので影響しない）
delete from stamps s
using (
  select participant_id, reward_id, spot_id, stamp_date, min(acquired_at) as keep_at
  from stamps
  where stamp_date is not null
  group by participant_id, reward_id, spot_id, stamp_date
  having count(*) > 1
) d
where s.participant_id = d.participant_id
  and s.reward_id = d.reward_id
  and s.spot_id = d.spot_id
  and s.stamp_date = d.stamp_date
  and s.acquired_at > d.keep_at;

-- サイクルを含む旧インデックスを、含まない形へ置き換える。
drop index if exists stamps_participant_reward_spot_cycle_date_idx;
create unique index if not exists stamps_participant_reward_spot_date_idx
  on stamps (participant_id, reward_id, spot_id, stamp_date);
