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
  const grants: any[] = cpData?.grants || [];
  const [redeemedLocal, setRedeemedLocal] = useState<Record<string, string>>({});

  async function redeemGrant(grantId: string): Promise<boolean> {
    try {
      const r = await fetch("/api/coupons/redeem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, grantId }),
      });
      if (!r.ok) return false;
      const j = await r.json();
      setRedeemedLocal((m) => ({ ...m, [grantId]: j.redeemed_at || new Date().toISOString() }));
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

        {grants.length > 0 && (
          <div className="mt-8">
            <h3 className="text-base font-bold text-[#4b4640] mb-1">{lang === "ja" ? "獲得したクーポン" : "Your coupons"}</h3>
            <p className="text-xs text-gray-400 mb-3">{lang === "ja" ? "お店でスタッフの前でスライドして使用してください。" : "Slide in front of the staff to redeem."}</p>
            <div className="space-y-3">
              {grants.map((g) => (
                <Coupon
                  key={g.id}
                  coupon={g.coupon}
                  lang={lang as "ja" | "en"}
                  redeemedAt={redeemedLocal[g.id] ?? g.redeemed_at}
                  expiresAt={g.expires_at}
                  expired={g.expired && !(redeemedLocal[g.id] ?? g.redeemed_at)}
                  onRedeem={() => redeemGrant(g.id)}
                />
              ))}
            </div>
          </div>
        )}
      </main>
      <BottomNav />
    </>
  );
}
