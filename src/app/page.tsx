"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import LangToggle from "@/components/LangToggle";
import AuthPanel from "@/components/AuthPanel";
import BottomNav from "@/components/BottomNav";
import RewardStampCards from "@/components/RewardStampCards";

export default function Home() {
  const { t, lang } = useI18n();
  const { participantId, ready, tick } = useAuth();
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const c = await fetch("/api/campaign", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (c) setCampaign(c.campaign);
      setLoading(false);
    })();
  }, [ready, tick]);

  if (loading) return <main className="p-6">{t("loading")}</main>;
  if (!campaign) return <main className="p-6">{t("no_campaign")}</main>;

  return (
    <>
      <main className="mx-auto max-w-md px-4 pt-4 pb-28">
        <div className="flex justify-end mb-2"><LangToggle /></div>

        <div className="relative rounded-3xl overflow-hidden mb-4 bg-gradient-to-br from-[#FCE8B2] via-[#F7DCA6] to-[#BFE8DF] px-6 py-8 text-center shadow-sm">
          <p className="text-[11px] tracking-[0.3em] text-[#C8483A] font-bold mb-2">KYOTO STAMP RALLY</p>
          <h1 className="text-2xl font-bold text-[#4b4640] leading-snug">
            {lang === "ja" ? campaign.name_ja : campaign.name_en}
          </h1>
        </div>

        <h2 className="text-lg font-bold text-[#33A6A0] text-center mb-1">{t("explore")}</h2>
        <p className="text-sm text-gray-600 text-center mb-4">{t("home_desc")}</p>

        {participantId && <RewardStampCards participantId={participantId} tick={tick} />}

        <Link href="/spots" className="mt-6 block text-center rounded-full bg-[#F6C64B] text-[#4b4640] font-bold py-3 shadow-sm">
          {t("go_spots")}
        </Link>

        <AuthPanel />

        <div className="mt-6 text-center flex justify-center gap-4">
          <Link href="/owner" className="text-xs text-gray-400 underline underline-offset-2">
            {lang === "ja" ? "店舗オーナーの方" : "Shop owners"}
          </Link>
          <Link href="/admin" className="text-xs text-gray-400 underline underline-offset-2">
            {lang === "ja" ? "管理者ログイン" : "Admin login"}
          </Link>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
