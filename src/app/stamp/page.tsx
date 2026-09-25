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
  const [phase, setPhase] = useState<"loading" | "ready" | "got" | "already" | "error">("loading");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) { setPhase("error"); return; }
      const r = await fetch(`/api/spot?token=${token}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (r?.spot) { setSpot(r.spot); setPhase("ready"); } else setPhase("error");
    })();
  }, [token]);

  async function press() {
    if (!ready || !participantId || !token) return;
    setPhase("loading");
    const res = await fetch("/api/stamp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, spotToken: token }),
    }).then((r) => r.json()).catch(() => null);
    if (!res || res.error) { setPhase("error"); return; }
    setProgress({ done: res.done, total: res.total });
    setPhase(res.already ? "already" : "got");
  }

  const name = spot ? (lang === "ja" ? spot.name_ja : spot.name_en) : "";
  const desc = spot ? (lang === "ja" ? spot.description_ja : spot.description_en) : "";

  return (
    <>
      <div className="sticky top-0 z-30 bg-[#F6C64B] text-[#4b4640] flex items-center px-4 py-3">
        <Link href="/" className="text-sm font-bold">‹ {t("back")}</Link>
        <span className="flex-1 text-center font-bold">{t("spot_info")}</span>
        <span className="w-10" />
      </div>
      <main className="mx-auto max-w-md px-4 pb-10">
        {spot?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={spot.image_url} alt={name} className="w-full h-56 object-cover rounded-b-2xl" />
        ) : (
          <div className="w-full h-56 rounded-b-2xl bg-[#E7E1D4] flex items-center justify-center text-5xl text-[#B7AC90]">📷</div>
        )}
        <h1 className="text-center text-2xl font-bold text-[#33A6A0] mt-4">{name || "…"}</h1>
        <div className="w-10 h-1 bg-[#33A6A0] mx-auto rounded mt-2 mb-5" />

        {phase === "ready" && (
          <button
            onClick={press}
            disabled={!ready}
            className="block w-full text-center rounded-full bg-[#F6C64B] text-[#4b4640] font-extrabold py-4 text-lg shadow disabled:opacity-60"
          >
            {t("press_stamp")}
          </button>
        )}
        {phase === "loading" && <p className="text-center">{t("loading")}</p>}
        {phase === "got" && (
          <div className="text-center">
            <div className="text-6xl">🎉</div>
            <h2 className="text-xl font-extrabold text-emerald-700 mt-2">{t("stamp_got")}</h2>
          </div>
        )}
        {phase === "already" && <h2 className="text-center text-lg font-bold text-amber-600">{t("stamp_already")}</h2>}
        {phase === "error" && <h2 className="text-center text-lg font-bold text-red-600">{t("stamp_error")}</h2>}
        {progress && <p className="text-center mt-3 text-lg font-bold text-[#33A6A0]">{t("collected")}: {progress.done}</p>}

        {(phase === "got" || phase === "already") && (
          <Link href="/" className="mt-6 block text-center rounded-full border border-[#33A6A0] text-[#33A6A0] font-bold py-3">
            {t("back_home")}
          </Link>
        )}
        {phase === "ready" && desc && (
          <p className="mt-5 text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{desc}</p>
        )}
      </main>
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
