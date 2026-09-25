"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

// Renders every reward as the original stamp-card UI (grid of cells).
// Cells filled = stamps earned AFTER that reward's created_at.
export default function RewardStampCards({ participantId, tick = 0 }: { participantId: string; tick?: number }) {
  const { t, lang } = useI18n();
  const [rewards, setRewards] = useState<any[] | null>(null);
  const [stamps, setStamps] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const locale = lang === "ja" ? "ja-JP" : "en-US";

  useEffect(() => {
    if (!participantId) return;
    (async () => {
      const rw = await fetch(`/api/rewards?participantId=${participantId}`, { cache: "no-store" })
        .then((r) => r.json()).catch(() => ({ rewards: [] }));
      const list: any[] = [...(rw.rewards || [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const pr = await fetch(`/api/progress?participantId=${participantId}`, { cache: "no-store" })
        .then((r) => r.json()).catch(() => ({ stamps: [] }));
      setStamps(pr.stamps || []);
      setRewards(list);
    })();
  }, [participantId, tick]);

  if (rewards === null) return <p className="text-center text-gray-400 py-6">…</p>;
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
                  return (
                    <button
                      key={i}
                      onClick={() => filled && setSelected(s)}
                      disabled={!filled}
                      className={`aspect-square rounded-full flex items-center justify-center text-lg font-bold transition ${filled ? "bg-[#F6C64B] text-white active:scale-95" : "bg-white border-2 border-dashed border-[#E6D8B0] text-[#E0CFA0]"}`}
                    >
                      {filled ? "✓" : i + 1}
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
