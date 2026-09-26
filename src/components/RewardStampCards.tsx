"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useCachedFetch } from "@/lib/swr";

// Renders every reward as the original stamp-card UI (grid of cells).
// Cells filled = stamps earned AFTER that reward's created_at.
export default function RewardStampCards({ participantId, tick = 0 }: { participantId: string; tick?: number }) {
  const { t, lang } = useI18n();
  const [selected, setSelected] = useState<any>(null);
  const locale = lang === "ja" ? "ja-JP" : "en-US";

  const { data: rwData } = useCachedFetch<any>(participantId ? `/api/rewards?participantId=${participantId}` : null);
  const { data: prData } = useCachedFetch<any>(participantId ? `/api/progress?participantId=${participantId}` : null);

  const stamps: any[] = prData?.stamps || [];
  const rewards: any[] | null = rwData?.rewards
    ? [...rwData.rewards].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : null;

  // Show the skeleton only on the very first load (nothing cached yet).
  if (rewards === null || prData === undefined) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-16 rounded-2xl" />
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton aspect-square rounded-full" />)}
        </div>
      </div>
    );
  }
  if (rewards.length === 0) {
    return (
      <div className="text-center text-gray-400 py-10">
        <div className="text-5xl mb-2">🎁</div>
        <p className="text-sm">{lang === "ja" ? "特典はまだ登録されていません。" : "No rewards yet."}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-7">
        {rewards.map((rw) => {
          const need = rw.required_stamps;
          const anchor = new Date(rw.created_at).getTime();
          const relevant = stamps
            .filter((s) => new Date(s.acquired_at).getTime() >= anchor)
            .sort((a, b) => new Date(a.acquired_at).getTime() - new Date(b.acquired_at).getTime());
          const done = relevant.length;
          const complete = done >= need;
          const cellCount = Math.max(need, done);
          const title = (lang === "ja" ? rw.title_ja : rw.title_en) || rw.title_ja;
          const body = lang === "ja" ? rw.body_ja : rw.body_en;

          return (
            <div key={rw.id}>
              <div className="flex items-center gap-2 mb-2">
                {rw.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={rw.image_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <span className="text-xl">🎁</span>
                )}
                <h3 className="font-bold text-[#4b4640]">{title}</h3>
                {complete && <span className="text-xs bg-emerald-500 text-white rounded-full px-2 py-0.5">{lang === "ja" ? "獲得！" : "Unlocked"}</span>}
              </div>

              <div className="rounded-2xl bg-[#EAF6F3] border border-[#CDE9E3] p-4 flex items-center justify-between">
                <span className="flex items-center gap-2 font-bold text-[#33A6A0]">🎫 {t("collected")}</span>
                <span className="text-2xl font-extrabold text-[#33A6A0]">{done} / {need} 個</span>
              </div>

              <div className="mt-3 grid grid-cols-5 gap-2">
                {Array.from({ length: cellCount }, (_, i) => {
                  const s = relevant[i];
                  const filled = !!s;
                  const tilt = ((i % 3) - 1) * 5; // -5 / 0 / +5 deg — hand-stamped feel
                  return (
                    <button
                      key={i}
                      onClick={() => filled && setSelected(s)}
                      disabled={!filled}
                      className="aspect-square relative"
                      style={filled ? { transform: `rotate(${tilt}deg)` } : undefined}
                      aria-label={filled ? (lang === "ja" ? "獲得済みスタンプ" : "collected stamp") : undefined}
                    >
                      {filled ? (
                        <span className="seal animate-stamp absolute inset-0 rounded-full flex items-center justify-center text-lg font-extrabold active:scale-95">✓</span>
                      ) : (
                        <span className="absolute inset-0 rounded-full bg-white border-2 border-dashed border-[#E6D8B0] text-[#E0CFA0] flex items-center justify-center text-lg font-bold">{i + 1}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 text-center mt-2">{t("tap_stamp_hint")}</p>

              {complete && (
                <div className="mt-3 text-center rounded-2xl bg-[#FFF6DC] border border-[#F0DFA0] p-3">
                  <div className="font-bold text-[#C9971E]">🎉 {t("complete_title")}</div>
                  <div className="text-sm text-[#B0862a] whitespace-pre-line">{body || t("complete_body")}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl max-w-xs w-full p-5 text-center" onClick={(e) => e.stopPropagation()}>
            {selected.spot_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.spot_image_url} alt="" className="w-full h-32 object-cover rounded-xl mb-3" />
            )}
            <div className="text-4xl mb-1">🎫</div>
            <div className="text-xs text-gray-500">{t("acquired_where")}</div>
            <div className="font-bold text-[#33A6A0] text-lg">
              {(lang === "ja" ? selected.spot_name_ja : selected.spot_name_en) || t("deleted_spot")}
            </div>
            <div className="text-xs text-gray-500 mt-3">{t("acquired_at")}</div>
            <div className="text-[#4b4640]">{new Date(selected.acquired_at).toLocaleString(locale)}</div>
            <button onClick={() => setSelected(null)} className="mt-5 w-full rounded-full bg-[#F6C64B] text-[#4b4640] font-bold py-2">{t("close")}</button>
          </div>
        </div>
      )}
    </>
  );
}
