"use client";
import { useEffect, useState } from "react";

export default function RewardList({
  participantId, lang, order = "created",
}: {
  participantId: string;
  lang: "ja" | "en";
  order?: "created" | "required";
}) {
  const [rewards, setRewards] = useState<any[] | null>(null);

  useEffect(() => {
    if (!participantId) return;
    (async () => {
      const rw = await fetch(`/api/rewards?participantId=${participantId}`, { cache: "no-store" })
        .then((r) => r.json()).catch(() => ({ rewards: [] }));
      let list: any[] = rw.rewards || [];
      list = [...list].sort((a, b) =>
        order === "required"
          ? a.required_stamps - b.required_stamps
          : new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setRewards(list);
    })();
  }, [participantId, order]);

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
    <div className="space-y-4">
      {rewards.map((rw) => {
        const need = rw.required_stamps;
        const prog = Math.min(rw.progress, need);
        const remaining = Math.max(0, need - rw.progress);
        const unlocked = rw.unlocked;
        const title = (lang === "ja" ? rw.title_ja : rw.title_en) || rw.title_ja;
        const body = lang === "ja" ? rw.body_ja : rw.body_en;
        return (
          <div key={rw.id} className={`rounded-2xl border p-4 ${unlocked ? "bg-[#FFF6DC] border-[#F0DFA0]" : "bg-white border-gray-200"}`}>
            <div className="flex items-center gap-3">
              {rw.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={rw.image_url} alt="" className={`w-16 h-16 rounded-xl object-cover shrink-0 ${unlocked ? "" : "grayscale opacity-60"}`} />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-[#EAF6F3] flex items-center justify-center text-3xl shrink-0">🎁</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-extrabold text-[#4b4640] truncate">{title}</p>
                  {unlocked && <span className="text-xs bg-emerald-500 text-white rounded-full px-2 py-0.5 shrink-0">{lang === "ja" ? "獲得！" : "Unlocked"}</span>}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {unlocked
                    ? (lang === "ja" ? "🎉 スタンプ達成！お店で受け取れます" : "🎉 Achieved! Claim it at the shop")
                    : (lang === "ja" ? `あと ${remaining} 個` : `${remaining} more to go`)}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#33A6A0] to-[#54c3ba] transition-all duration-500"
                     style={{ width: `${need ? (prog / need) * 100 : 0}%` }} />
              </div>
              <p className="text-right text-xs text-gray-500 mt-1">{prog} / {need} {lang === "ja" ? "個" : ""}</p>
            </div>

            {body && unlocked && (
              <p className="text-sm text-gray-600 mt-2 leading-relaxed whitespace-pre-line border-t border-[#F0DFA0] pt-2">{body}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
