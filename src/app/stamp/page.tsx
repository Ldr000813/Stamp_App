"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

function StampInner() {
  const { t, lang } = useI18n();
  const { participantId, ready } = useAuth();
  const params = useSearchParams();
  const token = params.get("spot");
  const [spot, setSpot] = useState<any>(null);
  const [cards, setCards] = useState<any[]>([]);
  const [phase, setPhase] = useState<"loading" | "pick" | "busy" | "error">("loading");
  const [result, setResult] = useState<any>(null); // {kind, card, granted, recurring}

  async function loadCards() {
    if (!participantId) return;
    const rw = await fetch(`/api/rewards?participantId=${participantId}`, { cache: "no-store" })
      .then((r) => r.json()).catch(() => ({ rewards: [] }));
    setCards(rw.rewards || []);
  }

  useEffect(() => {
    (async () => {
      if (!token) { setPhase("error"); return; }
      const r = await fetch(`/api/spot?token=${token}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (!r?.spot) { setPhase("error"); return; }
      setSpot(r.spot);
      await loadCards();
      setPhase("pick");
    })();
    // eslint-disable-next-line
  }, [token, participantId]);

  async function press(card: any) {
    if (!participantId || !token) return;
    setPhase("busy"); setResult(null);
    const res = await fetch("/api/stamp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, spotToken: token, rewardId: card.id }),
    }).then((r) => r.json()).catch(() => null);
    await loadCards();
    if (!res || res.error) { setResult({ kind: "error", card }); setPhase("pick"); return; }
    if (res.not_target) setResult({ kind: "not_target", card });
    else if (res.already) setResult({ kind: "already", card });
    else if (res.already_complete) setResult({ kind: "done", card });
    else if (res.completed) setResult({ kind: "completed", card, granted: res.granted || [], recurring: res.recurring });
    else setResult({ kind: "got", card });
    setPhase("pick");
  }

  const name = spot ? (lang === "ja" ? spot.name_ja : spot.name_en) : "";
  const locale = lang === "ja" ? "ja-JP" : "en-US";

  return (
    <>
      <div className="sticky top-0 z-30 bg-[#F6C64B] text-[#4b4640] flex items-center px-4 py-3">
        <Link href="/" className="text-sm font-bold">‹ {t("back")}</Link>
        <span className="flex-1 text-center font-bold">{t("spot_info")}</span>
        <span className="w-10" />
      </div>
      <main className="mx-auto max-w-md px-4 pb-16">
        {spot?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={spot.image_url} alt={name} className="w-full h-48 object-cover rounded-b-2xl" />
        ) : (
          <div className="w-full h-48 rounded-b-2xl bg-[#E7E1D4] flex items-center justify-center text-5xl text-[#B7AC90]">📷</div>
        )}
        <h1 className="text-center text-2xl font-bold text-[#33A6A0] mt-4">{name || "…"}</h1>
        <div className="w-10 h-1 bg-[#33A6A0] mx-auto rounded mt-2 mb-4" />

        {phase === "error" && <h2 className="text-center text-lg font-bold text-red-600">{t("stamp_error")}</h2>}
        {phase === "loading" && <p className="text-center">{t("loading")}</p>}

        {(phase === "pick" || phase === "busy") && (
          <>
            <p className="text-center text-sm text-gray-600 mb-3">{lang === "ja" ? "どのスタンプカードに押しますか？" : "Which stamp card?"}</p>
            {cards.length === 0 ? (
              <p className="text-center text-gray-400">{lang === "ja" ? "スタンプカードがありません" : "No stamp cards"}</p>
            ) : (
              <div className="space-y-2">
                {cards.map((c) => {
                  const done = Math.min(c.progress, c.required_stamps);
                  return (
                    <button key={c.id} onClick={() => press(c)} disabled={phase === "busy"}
                      className="w-full flex items-center justify-between rounded-2xl border border-[#EAE3D3] bg-white p-3 shadow-sm active:scale-[.99] disabled:opacity-60">
                      <span className="flex items-center gap-2 min-w-0">
                        {c.image_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={c.image_url} alt="" className="w-9 h-9 rounded-lg object-cover" />
                          : <span className="w-9 h-9 rounded-lg bg-[#EAF6F3] flex items-center justify-center">🎁</span>}
                        <span className="font-bold text-[#4b4640] truncate">{lang === "ja" ? c.title_ja : c.title_en}</span>
                        {c.recurring && <span className="text-[10px] bg-[#33A6A0] text-white rounded-full px-1.5 py-0.5">定期</span>}
                      </span>
                      <span className="text-sm font-bold text-[#33A6A0] shrink-0">{done}/{c.required_stamps}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {result && result.kind !== "completed" && (
          <div className="mt-5 text-center">
            {result.kind === "got" && <><div className="text-5xl">🎉</div><h2 className="text-lg font-extrabold text-emerald-700 mt-1">{t("stamp_got")}</h2></>}
            {result.kind === "already" && <h2 className="text-base font-bold text-amber-600">{lang === "ja" ? "このカードでは取得済みです" : "Already stamped on this card"}</h2>}
            {result.kind === "not_target" && <h2 className="text-base font-bold text-rose-500">{lang === "ja" ? "このスポットはこのカードの対象外です" : "Not part of this card"}</h2>}
            {result.kind === "done" && <h2 className="text-base font-bold text-amber-600">{lang === "ja" ? "このカードは達成済みです" : "This card is complete"}</h2>}
            {result.kind === "error" && <h2 className="text-base font-bold text-red-600">{t("stamp_error")}</h2>}
          </div>
        )}
      </main>

      {result?.kind === "completed" && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => setResult(null)}>
          <div className="bg-white rounded-3xl max-w-xs w-full p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-6xl mb-2">🎉</div>
            <h3 className="text-lg font-extrabold text-[#4b4640]">{lang === "ja" ? "クーポン獲得おめでとう！" : "Coupon unlocked!"}</h3>
            <p className="text-sm text-gray-500 mt-1">{lang === "ja" ? result.card.title_ja : result.card.title_en}{lang === "ja" ? " をコンプリート" : " completed"}</p>
            {(result.granted || []).map((g: any, i: number) => (
              <div key={i} className="mt-3 rounded-xl bg-[#EAF6F3] border border-[#CDE9E3] p-3">
                <div className="font-bold text-[#33A6A0]">🎟️ {lang === "ja" ? g.title_ja : (g.title_en || g.title_ja)}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{lang === "ja" ? "有効期限: " : "Use by: "}{new Date(g.expires_at).toLocaleDateString(locale)}</div>
              </div>
            ))}
            {result.recurring && <p className="text-xs text-[#33A6A0] mt-3">{lang === "ja" ? "カードはリセットされました。また集められます！" : "The card reset — collect again!"}</p>}
            <button onClick={() => setResult(null)} className="mt-5 w-full rounded-full bg-[#F6C64B] text-[#4b4640] font-bold py-2.5">{t("close")}</button>
          </div>
        </div>
      )}
    </>
  );
}

export default function StampPage() {
  return (
    <Suspense fallback={<main className="p-6">…</main>}>
      <StampInner />
    </Suspense>
  );
}
