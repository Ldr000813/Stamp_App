"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

type Spot = { id: string; name_ja: string; name_en: string; type?: string };
type Campaign = { required_stamps: number };

export default function StampCard({
  campaign, spots, acquired,
}: { campaign: Campaign; spots: Spot[]; acquired: string[] }) {
  const { t, lang } = useI18n();
  const done = acquired.length;
  const total = campaign.required_stamps;
  const complete = done >= total;
  const cells = Array.from({ length: total }, (_, i) => i < done);

  return (
    <div>
      <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-5 mb-4 text-center">
        <div className="text-3xl font-extrabold text-emerald-700">{t("progress", { done, total })}</div>

        <div className="mt-3 grid grid-cols-5 gap-2">
          {cells.map((filled, i) => (
            <div
              key={i}
              className={`aspect-square rounded-full flex items-center justify-center text-lg font-bold ${
                filled ? "bg-emerald-600 text-white" : "bg-white border-2 border-dashed border-emerald-200 text-emerald-300"
              }`}
            >
              {filled ? "✓" : i + 1}
            </div>
          ))}
        </div>

        {complete ? (
          <div className="mt-3">
            <div className="text-lg font-bold text-emerald-700">🎉 {t("complete_title")}</div>
            <div className="text-sm text-emerald-600">{t("complete_body")}</div>
          </div>
        ) : (
          <div className="text-emerald-600 mt-2 text-sm">{t("remaining", { n: Math.max(0, total - done) })}</div>
        )}
      </div>

      <div className="flex justify-between items-center mb-2">
        <h2 className="font-bold">{t("spots")}</h2>
        <Link href="/events" className="text-sm text-emerald-700 underline">{t("events_title")}</Link>
      </div>

      <ul className="space-y-2">
        {spots.map((s) => {
          const got = acquired.includes(s.id);
          return (
            <li key={s.id}>
              <Link
                href={`/spot/${s.id}`}
                className={`flex justify-between items-center rounded-xl border p-3 hover:bg-gray-50 ${
                  got ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"
                }`}
              >
                <span className="flex items-center gap-2">
                  {s.type === "event" && <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">{t("event")}</span>}
                  {lang === "ja" ? s.name_ja : s.name_en}
                </span>
                <span className={got ? "text-emerald-600 font-bold" : "text-gray-300"}>{got ? "●" : "○"}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
