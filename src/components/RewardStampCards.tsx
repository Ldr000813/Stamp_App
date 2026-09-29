"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n";

const QRScanner = dynamic(() => import("@/components/QRScanner"), { ssr: false });

export default function RewardStampCards({ participantId }: { participantId: string }) {
  const { t, lang } = useI18n();
  const [cards, setCards] = useState<any[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<any>(null);      // stamp detail modal
  const [scanCard, setScanCard] = useState<any>(null);      // card being scanned
  const [congrats, setCongrats] = useState<any>(null);      // completion modal
  const [toast, setToast] = useState("");
  const locale = lang === "ja" ? "ja-JP" : "en-US";

  async function load() {
    const rw = await fetch(`/api/rewards?participantId=${participantId}`, { cache: "no-store" })
      .then((r) => r.json()).catch(() => ({ rewards: [] }));
    const list: any[] = rw.rewards || [];
    setCards(list);
    // Multiple cards → all collapsed; single card → expanded.
    setExpanded((prev) => (prev.size ? prev : new Set(list.length === 1 ? [list[0].id] : [])));
  }
  useEffect(() => { if (participantId) load(); /* eslint-disable-next-line */ }, [participantId]);

  function toggle(id: string) {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2200); }

  async function doScan(card: any, spotToken: string) {
    setScanCard(null);
    const r = await fetch("/api/stamp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, spotToken, rewardId: card.id }),
    }).then((x) => x.json()).catch(() => null);
    if (!r) { flash(lang === "ja" ? "通信に失敗しました" : "Network error"); return; }
    if (r.already) { flash(lang === "ja" ? "このスポットはこのカードで取得済みです" : "Already stamped on this card"); await load(); return; }
    if (r.already_complete) { flash(lang === "ja" ? "このカードはすでに達成済みです" : "This card is already complete"); return; }
    if (r.error) { flash(lang === "ja" ? "スタンプできませんでした" : "Could not add the stamp"); return; }
    await load();
    if (r.completed) setCongrats({ cardTitle: lang === "ja" ? card.title_ja : card.title_en, granted: r.granted || [], recurring: r.recurring });
    else flash("🎫 " + (lang === "ja" ? "スタンプGET！" : "Stamp added!"));
  }

  if (cards === null) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-16 rounded-2xl" />
        <div className="grid grid-cols-5 gap-2">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton aspect-square rounded-full" />)}</div>
      </div>
    );
  }
  if (cards.length === 0) {
    return (
      <div className="text-center text-gray-400 py-10">
        <div className="text-5xl mb-2">🎁</div>
        <p className="text-sm">{lang === "ja" ? "スタンプカードはまだありません。" : "No stamp cards yet."}</p>
      </div>
    );
  }

  const collapsible = cards.length > 1;

  return (
    <>
      <div className="space-y-3">
        {cards.map((c) => {
          const open = expanded.has(c.id);
          const need = c.required_stamps;
          const done = Math.min(c.progress, need);
          const title = (lang === "ja" ? c.title_ja : c.title_en) || c.title_ja;
          const body = lang === "ja" ? c.body_ja : c.body_en;
          const complete = c.unlocked;

          return (
            <div key={c.id} className={`rounded-2xl border ${complete && !c.recurring ? "bg-[#FFF6DC] border-[#F0DFA0]" : "bg-white border-[#EAE3D3]"} shadow-sm overflow-hidden`}>
              {/* header */}
              <div className="flex items-center gap-3 p-3">
                <button onClick={() => collapsible && toggle(c.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  {collapsible && <span className={`text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>}
                  {c.image_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    : <span className="w-10 h-10 rounded-lg bg-[#EAF6F3] flex items-center justify-center text-xl shrink-0">🎁</span>}
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="font-bold text-[#4b4640] truncate">{title}</span>
                      {c.recurring && <span className="text-[10px] bg-[#33A6A0] text-white rounded-full px-1.5 py-0.5 shrink-0">{lang === "ja" ? "定期" : "Repeat"}</span>}
                    </span>
                    <span className="text-xs text-[#33A6A0] font-bold">{done} / {need} {lang === "ja" ? "個" : ""}</span>
                  </span>
                </button>
                <button onClick={() => setScanCard(c)} className="shrink-0 rounded-full bg-[#F6C64B] text-[#4b4640] text-sm font-bold px-3.5 py-2 active:scale-95">
                  {lang === "ja" ? "スキャン" : "Scan"}
                </button>
              </div>

              {/* body (grid) */}
              {open && (
                <div className="px-3 pb-3">
                  <div className="grid grid-cols-5 gap-2">
                    {Array.from({ length: Math.max(need, done) }, (_, i) => {
                      const s = c.stamps[i];
                      const filled = !!s;
                      const tilt = ((i % 3) - 1) * 5;
                      return (
                        <button key={i} onClick={() => filled && setSelected(s)} disabled={!filled}
                          className="aspect-square relative" style={filled ? { transform: `rotate(${tilt}deg)` } : undefined}>
                          {filled
                            ? <span className="seal animate-stamp absolute inset-0 rounded-full flex items-center justify-center text-lg font-extrabold">✓</span>
                            : <span className="absolute inset-0 rounded-full bg-white border-2 border-dashed border-[#E6D8B0] text-[#E0CFA0] flex items-center justify-center text-lg font-bold">{i + 1}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 text-center mt-2">{t("tap_stamp_hint")}</p>
                  {complete && !c.recurring && (
                    <div className="mt-2 text-center rounded-xl bg-[#FFF3CF] p-2 text-sm font-bold text-[#C9971E]">🎉 {t("complete_title")}</div>
                  )}
                  {body && complete && !c.recurring && <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">{body}</p>}
                  {c.recurring && <p className="text-xs text-gray-400 mt-2 text-center">{lang === "ja" ? "コンプリートするたびにクーポンがもらえます（何度でも）" : "Complete it to earn a coupon — again and again"}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[80] bg-slate-800 text-white text-sm rounded-full px-4 py-2 shadow-lg">{toast}</div>
      )}

      {scanCard && (
        <QRScanner lang={lang as "ja" | "en"} onClose={() => setScanCard(null)} onDetect={(token) => doScan(scanCard, token)} />
      )}

      {selected && (
        <div className="fixed inset-0 z-[75] bg-black/40 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl max-w-xs w-full p-5 text-center" onClick={(e) => e.stopPropagation()}>
            {selected.spot_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.spot_image_url} alt="" className="w-full h-32 object-cover rounded-xl mb-3" />
            )}
            <div className="text-4xl mb-1">🎫</div>
            <div className="text-xs text-gray-500">{t("acquired_where")}</div>
            <div className="font-bold text-[#33A6A0] text-lg">{(lang === "ja" ? selected.spot_name_ja : selected.spot_name_en) || t("deleted_spot")}</div>
            <div className="text-xs text-gray-500 mt-3">{t("acquired_at")}</div>
            <div className="text-[#4b4640]">{new Date(selected.acquired_at).toLocaleString(locale)}</div>
            <button onClick={() => setSelected(null)} className="mt-5 w-full rounded-full bg-[#F6C64B] text-[#4b4640] font-bold py-2">{t("close")}</button>
          </div>
        </div>
      )}

      {congrats && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => setCongrats(null)}>
          <div className="bg-white rounded-3xl max-w-xs w-full p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-6xl mb-2">🎉</div>
            <h3 className="text-lg font-extrabold text-[#4b4640]">{lang === "ja" ? "クーポン獲得おめでとう！" : "Coupon unlocked!"}</h3>
            <p className="text-sm text-gray-500 mt-1">{congrats.cardTitle}{lang === "ja" ? " をコンプリート" : " completed"}</p>
            {congrats.granted?.length > 0 ? (
              <div className="mt-4 space-y-2">
                {congrats.granted.map((g: any, i: number) => (
                  <div key={i} className="rounded-xl bg-[#EAF6F3] border border-[#CDE9E3] p-3">
                    <div className="font-bold text-[#33A6A0]">🎟️ {lang === "ja" ? g.title_ja : (g.title_en || g.title_ja)}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{lang === "ja" ? "有効期限: " : "Use by: "}{new Date(g.expires_at).toLocaleDateString(locale)}</div>
                  </div>
                ))}
                <p className="text-xs text-gray-400">{lang === "ja" ? "「クリア特典」画面から使えます" : "Use it from the Rewards tab"}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mt-3">{lang === "ja" ? "コンプリートしました！" : "Completed!"}</p>
            )}
            {congrats.recurring && <p className="text-xs text-[#33A6A0] mt-3">{lang === "ja" ? "カードはリセットされました。また集められます！" : "The card has reset — collect again!"}</p>}
            <button onClick={() => setCongrats(null)} className="mt-5 w-full rounded-full bg-[#F6C64B] text-[#4b4640] font-bold py-2.5">{t("close")}</button>
          </div>
        </div>
      )}
    </>
  );
}
