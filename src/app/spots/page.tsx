"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import LangToggle from "@/components/LangToggle";
import BottomNav from "@/components/BottomNav";

export default function Spots() {
  const { t, lang } = useI18n();
  const { participantId, ready } = useAuth();
  const [spots, setSpots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const c = await fetch("/api/campaign", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      setSpots(c?.spots || []);
      setLoading(false);
    })();
  }, [ready, participantId]);

  return (
    <>
      <main className="mx-auto max-w-md px-4 pt-5 pb-28">
        <div className="flex justify-between items-center mb-1">
          <span className="w-10" />
          <h1 className="text-lg font-bold text-[#4b4640]">{t("target_spots")}</h1>
          <LangToggle />
        </div>
        <div className="w-10 h-1 bg-[#33A6A0] mx-auto rounded mb-4" />

        <div className="flex justify-center gap-3 mb-5 text-sm">
          <Link href="/map" className="rounded-full border border-[#33A6A0] text-[#33A6A0] px-4 py-1">🗺 {t("map_title")}</Link>
          <Link href="/events" className="rounded-full border border-[#33A6A0] text-[#33A6A0] px-4 py-1">🗓 {t("events_title")}</Link>
        </div>

        {loading ? (
          <p className="text-center">{t("loading")}</p>
        ) : spots.length === 0 ? (
          <p className="text-gray-500 text-center">—</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6">
            {spots.map((s) => (
              <Link key={s.id} href={`/spot/${s.id}`} className="flex flex-col items-center">
                <div className="relative w-28 h-28 rounded-full overflow-hidden bg-[#E7E1D4] shadow-sm">
                  {s.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl text-[#B7AC90]">📷</div>
                  )}
                  {s.type === "event" && <span className="absolute top-1 left-1 text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5">EVENT</span>}
                </div>
                <span className="mt-2 text-sm text-center text-[#4b4640] leading-tight">{lang === "ja" ? s.name_ja : s.name_en}</span>
              </Link>
            ))}
          </div>
        )}
      </main>
      <BottomNav />
    </>
  );
}
