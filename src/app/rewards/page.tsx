"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCachedFetch } from "@/lib/swr";
import LangToggle from "@/components/LangToggle";
import BottomNav from "@/components/BottomNav";
import Coupon from "@/components/Coupon";
import RewardStampCards from "@/components/RewardStampCards";

export default function Rewards() {
  const { t, lang } = useI18n();
  const { participantId, ready } = useAuth();
  const { data: cpData } = useCachedFetch<any>(participantId ? `/api/coupons?participantId=${participantId}` : null);
  const coupons: any[] = cpData?.coupons || [];
  const [redeemedLocal, setRedeemedLocal] = useState<Record<string, string>>({});
  const redeemed = { ...(cpData?.redeemed || {}), ...redeemedLocal };

  async function redeemCoupon(id: string): Promise<boolean> {
    try {
      const r = await fetch("/api/coupons/redeem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, couponId: id }),
      });
      if (!r.ok) return false;
      const j = await r.json();
      setRedeemedLocal((m) => ({ ...m, [id]: j.redeemed_at || new Date().toISOString() }));
      return true;
    } catch { return false; }
  }

  return (
    <>
      <main className="mx-auto max-w-md px-4 pt-5 pb-28">
        <div className="flex justify-between items-center mb-1">
          <span className="w-10" />
          <h1 className="text-lg font-bold text-[#4b4640]">{t("rewards_title")}</h1>
          <LangToggle />
        </div>
        <div className="w-10 h-1 bg-[#33A6A0] mx-auto rounded mb-5" />

        {ready && participantId && <RewardStampCards participantId={participantId} />}

        {coupons.length > 0 && (
          <div className="mt-8">
            <h3 className="text-base font-bold text-[#4b4640] mb-1">{lang === "ja" ? "クーポン" : "Coupons"}</h3>
            <p className="text-xs text-gray-400 mb-3">{lang === "ja" ? "お店でスタッフの前でスライドして使用してください。" : "Slide in front of the staff to redeem."}</p>
            <div className="space-y-3">
              {coupons.map((c) => (
                <Coupon key={c.id} coupon={c} lang={lang as "ja" | "en"} redeemedAt={redeemed[c.id]} onRedeem={redeemCoupon} />
              ))}
            </div>
          </div>
        )}
      </main>
      <BottomNav />
    </>
  );
}
