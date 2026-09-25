"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import LangToggle from "@/components/LangToggle";
import BottomNav from "@/components/BottomNav";

const wd = ["日", "月", "火", "水", "木", "金", "土"];
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTime = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export default function Events() {
  const { t, lang } = useI18n();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const locale = lang === "ja" ? "ja-JP" : "en-US";

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/events", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ events: [] }));
      setEvents(r.events || []);
      setLoading(false);
    })();
  }, []);

  const groups: Record<string, any[]> = {};
  for (const e of events) (groups[keyOf(new Date(e.starts_at))] ||= []).push(e);
  const keys = Object.keys(groups).sort();
  const todayKey = keyOf(new Date());

  function dateLabel(key: string) {
    const [y, m, dd] = key.split("-").map(Number);
    const d = new Date(y, m - 1, dd);
    return lang === "ja" ? `${m}月${dd}日（${wd[d.getDay()]}）` : d.toLocaleDateString(locale, { month: "long", day: "numeric", weekday: "short" });
  }

  return (
    <>
      <main className="mx-auto max-w-md px-4 pt-5 pb-28">
        <div className="flex justify-between items-center mb-1">
          <span className="w-10" />
          <h1 className="text-lg font-bold text-[#4b4640]">{t("events_title")}</h1>
          <LangToggle />
        </div>
        <div className="w-10 h-1 bg-[#33A6A0] mx-auto rounded mb-4" />

        {loading ? (
          <p className="text-center">{t("loading")}</p>
        ) : keys.length === 0 ? (
          <p className="text-gray-500 text-center mt-8">{t("no_events_window")}</p>
        ) : (
          keys.map((key) => (
            <section key={key} className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="font-bold text-[#4b4640]">{dateLabel(key)}</h2>
                {key === todayKey && <span className="text-xs bg-[#F6C64B] text-[#4b4640] rounded-full px-2 py-0.5 font-bold">{t("today")}</span>}
              </div>
              <ul className="space-y-3">
                {groups[key].map((e) => {
                  const title = lang === "ja" ? e.title_ja : e.title_en;
                  const desc = lang === "ja" ? e.description_ja : e.description_en;
                  const venue = e.spot ? (lang === "ja" ? e.spot.name_ja : e.spot.name_en) : null;
                  return (
                    <li key={e.id} className="rounded-2xl bg-white border border-[#EDE6D6] overflow-hidden shadow-sm">
                      {e.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={e.image_url} alt="" className="w-full h-36 object-cover" />
                      )}
                      <div className="p-3">
                        <div className="text-[#33A6A0] font-bold text-sm">
                          🕒 {fmtTime(e.starts_at)}{e.ends_at ? `–${fmtTime(e.ends_at)}` : ""}
                        </div>
                        <div className="font-bold text-[#4b4640] mt-0.5">{title}</div>
                        {venue && (
                          <div className="text-xs text-gray-500 mt-1">
                            📍 {e.spot?.id ? <Link href={`/spot/${e.spot.id}`} className="underline">{venue}</Link> : venue}
                          </div>
                        )}
                        {desc && <p className="text-sm text-gray-600 mt-1 line-clamp-3 whitespace-pre-wrap">{desc}</p>}
                        {(e.spot?.map_url || (e.spot?.lat && e.spot?.lng)) && (
                          <a href={e.spot.map_url ? e.spot.map_url : `https://www.google.com/maps/dir/?api=1&destination=${e.spot.lat},${e.spot.lng}`} target="_blank" rel="noreferrer" className="inline-block mt-2 text-xs text-[#33A6A0] underline">🧭 {t("directions")}</a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </main>
      <BottomNav />
    </>
  );
}
