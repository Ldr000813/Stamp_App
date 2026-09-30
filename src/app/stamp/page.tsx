"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import LangToggle from "@/components/LangToggle";

const HANDOFF_FLAG = "tonari_handoff_prompted";

function StampInner() {
  const { t, lang } = useI18n();
  const { participantId, ready, isAnonymous, linkGoogle, session } = useAuth();
  const params = useSearchParams();
  const token = params.get("spot");
  const [spot, setSpot] = useState<any>(null);
  const [cards, setCards] = useState<any[]>([]);
  const [phase, setPhase] = useState<"loading" | "pick" | "busy" | "error">("loading");
  const [result, setResult] = useState<any>(null); // {kind, card, granted, recurring}
  const [pendingHandoff, setPendingHandoff] = useState(false); // one-time "set up handoff" prompt

  // After the FIRST stamp on an anonymous (not-linked) account, nudge the user to
  // set up Google hand-off — otherwise clearing data / changing device loses stamps.
  function maybePromptHandoff() {
    if (!isAnonymous) return;
    try {
      if (localStorage.getItem(HANDOFF_FLAG)) return;
      localStorage.setItem(HANDOFF_FLAG, "1");
    } catch { /* ignore */ }
    setPendingHandoff(true);
  }

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
    else if (res.completed) { setResult({ kind: "completed", card, granted: res.granted || [], recurring: res.recurring }); maybePromptHandoff(); }
    else { setResult({ kind: "got", card }); maybePromptHandoff(); }
    setPhase("pick");
  }

  const name = spot ? (lang === "ja" ? spot.name_ja : spot.name_en) : "";
  const locale = lang === "ja" ? "ja-JP" : "en-US";

  return (
    <>
      <div className="sticky top-0 z-30 bg-[#F6C64B] text-[#4b4640] flex items-center px-4 py-3">
        <Link href="/" className="text-sm font-bold">‹ {t("back")}</Link>
        <span className="flex-1 text-center font-bold">{t("spot_info")}</span>
        <LangToggle />
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

        {/* Persistent hand-off entry for anonymous users (e.g. after tapping "あとで"). */}
        {isAnonymous && (
          <div className="mt-8 rounded-2xl bg-[#EAF6F3] border border-[#CDE9E3] p-4 text-center">
            <p className="text-sm font-bold text-[#33A6A0]">📱 {lang === "ja" ? "スタンプを保存・引き継ぎ" : "Save & carry your stamps"}</p>
            <p className="text-xs text-gray-500 mt-1">
              {lang === "ja"
                ? "機種変更やデータ削除でスタンプが消えないよう、Googleで引き継ぎを設定できます。"
                : "Link Google so your stamps survive clearing data or changing phones."}
            </p>
            <button
              onClick={() => linkGoogle()}
              className="mt-3 w-full rounded-full bg-white border border-slate-300 text-slate-700 font-bold py-2.5 flex items-center justify-center gap-2 shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5C43.3 37.4 46.1 31.5 46.1 24.5z" />
                <path fill="#FBBC05" d="M10.4 28.3c-.5-1.4-.8-2.8-.8-4.3s.3-3 .8-4.3l-7.8-6.1C.9 16.7 0 20.2 0 24s.9 7.3 2.6 10.4l7.8-6.1z" />
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.1-5.5c-2 1.3-4.5 2.1-8.7 2.1-6.3 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
              </svg>
              {lang === "ja" ? "Googleで引き継ぎを設定" : "Link with Google"}
            </button>
          </div>
        )}

        {/* Signed in (e.g. just finished hand-off) → guide back to home. */}
        {!isAnonymous && session?.user && (
          <div className="mt-8 text-center">
            <p className="text-sm text-[#33A6A0] font-bold mb-2">
              {lang === "ja" ? "引き継ぎ済みです。スタンプは安全に保存されています。" : "Linked — your stamps are safely saved."}
            </p>
            <Link href="/" className="inline-block rounded-full bg-[#F6C64B] text-[#4b4640] font-bold px-6 py-3 active:scale-95">
              🏠 {lang === "ja" ? "ホーム画面へ戻る" : "Back to home"}
            </Link>
          </div>
        )}
      </main>

      {/* One-time hand-off nudge. Held back until the completion modal is closed. */}
      {pendingHandoff && result?.kind !== "completed" && (
        <div className="fixed inset-0 z-[85] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xs w-full p-6 text-center">
            <div className="text-5xl mb-2">📱</div>
            <h3 className="text-lg font-extrabold text-[#4b4640]">
              {lang === "ja" ? "スタンプを保存しましょう" : "Save your stamp"}
            </h3>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              {lang === "ja"
                ? "いまはお試しの状態です。このまま閉じても遊べますが、機種変更やデータ削除でスタンプが消えることがあります。Googleで引き継ぎを設定すると、どの端末でも安全に保存されます。"
                : "Your progress is only on this device for now. Link Google so your stamps are safely kept even if you clear data or switch phones."}
            </p>
            <p className="text-[11px] text-gray-400 mt-2">
              {lang === "ja" ? "※この案内は初回のみ表示されます" : "Shown once."}
            </p>
            <button
              onClick={() => { setPendingHandoff(false); linkGoogle(); }}
              className="mt-4 w-full rounded-full bg-white border border-slate-300 text-slate-700 font-bold py-3 flex items-center justify-center gap-2 shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5C43.3 37.4 46.1 31.5 46.1 24.5z" />
                <path fill="#FBBC05" d="M10.4 28.3c-.5-1.4-.8-2.8-.8-4.3s.3-3 .8-4.3l-7.8-6.1C.9 16.7 0 20.2 0 24s.9 7.3 2.6 10.4l7.8-6.1z" />
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.1-5.5c-2 1.3-4.5 2.1-8.7 2.1-6.3 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
              </svg>
              {lang === "ja" ? "Googleで引き継ぎを設定" : "Link with Google"}
            </button>
            <button onClick={() => setPendingHandoff(false)} className="mt-2 text-xs text-gray-400 underline">
              {lang === "ja" ? "あとで（このまま続ける）" : "Later"}
            </button>
          </div>
        </div>
      )}

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
