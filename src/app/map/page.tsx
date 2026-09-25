"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import LangToggle from "@/components/LangToggle";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function MapPage() {
  const { t } = useI18n();
  const [spots, setSpots] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const c = await fetch("/api/campaign", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      setSpots(c?.spots || []);
    })();
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-xl font-bold">{t("map_title")}</h1>
        <LangToggle />
      </div>
      <Link href="/" className="text-sm text-emerald-700 underline">← {t("back_home")}</Link>
      <div className="mt-3 rounded-xl overflow-hidden border">
        <MapView spots={spots} />
      </div>
      <p className="text-xs text-gray-400 mt-2">© OpenStreetMap contributors</p>
    </main>
  );
}
