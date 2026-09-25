"use client";
import { useI18n } from "@/lib/i18n";
import LangToggle from "@/components/LangToggle";
import BottomNav from "@/components/BottomNav";

export default function Notes() {
  const { t } = useI18n();
  return (
    <>
      <main className="mx-auto max-w-md px-4 pt-5 pb-28">
        <div className="flex justify-between items-center mb-1">
          <span className="w-10" />
          <h1 className="text-lg font-bold text-[#4b4640]">{t("notes_title")}</h1>
          <LangToggle />
        </div>
        <div className="w-10 h-1 bg-[#33A6A0] mx-auto rounded mb-5" />
        <div className="rounded-2xl bg-white border border-[#EDE6D6] p-4 whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
          {t("notes_body")}
        </div>
      </main>
      <BottomNav />
    </>
  );
}
