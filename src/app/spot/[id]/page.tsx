"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import BottomNav from "@/components/BottomNav";

export default function SpotDetail({ params }: { params: { id: string } }) {
  const { t, lang } = useI18n();
  const [spot, setSpot] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/spot?id=${params.id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      setSpot(r?.spot || null);
      setLoading(false);
    })();
  }, [params.id]);

  if (loading) return <main className="p-6">{t("loading")}</main>;
  if (!spot) return (
    <main className="p-6">
      <Link href="/spots" className="text-[#33A6A0] underline">← {t("back")}</Link>
      <p className="mt-3">{t("not_found")}</p>
    </main>
  );

  const name = lang === "ja" ? spot.name_ja : spot.name_en;
  const desc = lang === "ja" ? spot.description_ja : spot.description_en;
  const address = lang === "ja" ? spot.address_ja : spot.address_en;
  const isEvent = spot.type === "event";
  const locale = lang === "ja" ? "ja-JP" : "en-US";
  const hasCoords = spot.lat && spot.lng;

  return (
    <>
      <div className="sticky top-0 z-30 bg-[#F6C64B] text-[#4b4640] flex items-center px-4 py-3">
        <Link href="/spots" className="text-sm font-bold">‹ {t("back")}</Link>
        <span className="flex-1 text-center font-bold">{isEvent ? t("event") : t("spot_info")}</span>
        <span className="w-10" />
      </div>
      <main className="mx-auto max-w-md px-4 pb-28">
        {spot.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={spot.image_url} alt={name} className="w-full h-56 object-cover rounded-b-2xl" />
        ) : (
          <div className="w-full h-56 rounded-b-2xl bg-[#E7E1D4] flex items-center justify-center text-5xl text-[#B7AC90]">📷</div>
        )}
        <h1 className="text-center text-2xl font-bold text-[#33A6A0] mt-4">{name}</h1>
        <div className="w-10 h-1 bg-[#33A6A0] mx-auto rounded mt-2 mb-3" />
        {isEvent && spot.event_start && (
          <p className="text-center text-amber-700 font-medium">
            🗓 {new Date(spot.event_start).toLocaleString(locale)}
            {spot.event_end ? ` 〜 ${new Date(spot.event_end).toLocaleTimeString(locale)}` : ""}
          </p>
        )}
        {desc && <p className="mt-3 whitespace-pre-wrap text-gray-700 text-sm leading-relaxed">{desc}</p>}
        {address && <p className="mt-3 text-sm text-gray-600">📍 {address}</p>}
        {(spot.map_url || hasCoords || address) && (
          <a
            href={spot.map_url
              ? spot.map_url
              : hasCoords
                ? `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`
                : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}
            target="_blank" rel="noreferrer"
            className="mt-5 block text-center rounded-full bg-[#F6C64B] text-[#4b4640] font-bold py-3"
          >
            🧭 {t("directions")}
          </a>
        )}
      </main>
      <BottomNav />
    </>
  );
}
