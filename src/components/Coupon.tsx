"use client";
import { useRef, useState, useEffect } from "react";

type C = {
  id: string;
  title_ja: string; title_en?: string | null;
  description_ja?: string | null; description_en?: string | null;
  image_url?: string | null;
};

export default function Coupon({
  coupon, lang, redeemedAt, onRedeem,
}: {
  coupon: C;
  lang: "ja" | "en";
  redeemedAt?: string | null;
  onRedeem: (id: string) => Promise<boolean>;
}) {
  const title = (lang === "ja" ? coupon.title_ja : coupon.title_en) || coupon.title_ja;
  const desc = lang === "ja" ? coupon.description_ja : coupon.description_en;

  const trackRef = useRef<HTMLDivElement>(null);
  const KNOB = 52;
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [used, setUsed] = useState(!!redeemedAt);
  const [busy, setBusy] = useState(false);
  const maxRef = useRef(0);

  useEffect(() => { setUsed(!!redeemedAt); }, [redeemedAt]);

  function maxX() {
    const w = trackRef.current?.clientWidth ?? 0;
    return Math.max(0, w - KNOB - 6);
  }
  function onDown(e: React.PointerEvent) {
    if (used || busy) return;
    maxRef.current = maxX();
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    if (!dragging) return;
    const rect = trackRef.current!.getBoundingClientRect();
    let nx = e.clientX - rect.left - KNOB / 2;
    nx = Math.max(0, Math.min(nx, maxRef.current));
    setX(nx);
  }
  async function onUp() {
    if (!dragging) return;
    setDragging(false);
    const max = maxRef.current || maxX();
    if (max > 0 && x >= max * 0.85) {
      setX(max); setBusy(true);
      const ok = await onRedeem(coupon.id);
      setBusy(false);
      if (ok) { setUsed(true); }
      else setX(0);
    } else {
      setX(0);
    }
  }

  const pct = maxRef.current ? Math.min(1, x / maxRef.current) : 0;

  return (
    <div className={`relative select-none rounded-2xl bg-white shadow-[0_6px_20px_rgba(120,90,60,0.12)] overflow-hidden ${used ? "opacity-90" : ""}`}>
      {/* dashed separator + notches between body and stub */}
      <div className="flex">
        <div className="flex-1 p-4">
          <div className="flex items-center gap-3">
            {coupon.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coupon.image_url} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-[#EAF6F3] flex items-center justify-center text-2xl shrink-0">🎟️</div>
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-bold tracking-wider text-[#33A6A0]">COUPON</p>
              <p className="font-extrabold text-[#4b4640] leading-tight truncate">{title}</p>
              {desc && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 whitespace-pre-line">{desc}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* slide-to-use zone */}
      <div className="px-4 pb-4">
        <div
          ref={trackRef}
          className="relative h-[52px] rounded-full bg-[#EFEAE0] overflow-hidden"
        >
          {/* fill */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#33A6A0] to-[#54c3ba]"
            style={{ width: used ? "100%" : `${(KNOB + (maxRef.current ? pct * maxRef.current : 0))}px`, transition: dragging ? "none" : "width .28s cubic-bezier(.22,1,.36,1)" }}
          />
          {/* label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className={`text-sm font-bold ${used || pct > 0.4 ? "text-white" : "text-gray-400"}`}>
              {used ? (lang === "ja" ? "使用済み" : "USED") : busy ? "…" : (lang === "ja" ? "スライドして使用" : "Slide to use")}
            </span>
          </div>
          {/* knob */}
          {!used && (
            <div
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              className="absolute top-[3px] left-[3px] h-[46px] w-[46px] rounded-full bg-white shadow-md flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
              style={{ transform: `translateX(${x}px)`, transition: dragging ? "none" : "transform .28s cubic-bezier(.22,1,.36,1)" }}
            >
              <span className="text-[#33A6A0] text-xl font-bold">›</span>
            </div>
          )}
          {used && (
            <div className="absolute top-[3px] right-[3px] h-[46px] w-[46px] rounded-full bg-white/90 flex items-center justify-center">
              <span className="text-[#33A6A0] text-2xl">✓</span>
            </div>
          )}
        </div>
        {used && redeemedAt && (
          <p className="text-[11px] text-gray-400 text-center mt-1.5">
            {(lang === "ja" ? "使用日時: " : "Used: ") + new Date(redeemedAt).toLocaleString(lang === "ja" ? "ja-JP" : "en-US")}
          </p>
        )}
      </div>

      {/* used stamp overlay */}
      {used && (
        <div className="pointer-events-none absolute top-3 right-3 rotate-12 border-2 border-red-400/70 text-red-500/80 rounded-md px-2 py-0.5 text-xs font-extrabold tracking-widest">
          {lang === "ja" ? "USED" : "USED"}
        </div>
      )}
    </div>
  );
}
