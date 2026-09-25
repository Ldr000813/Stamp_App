"use client";
import { useI18n } from "@/lib/i18n";

export default function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <button
      onClick={() => setLang(lang === "ja" ? "en" : "ja")}
      className="text-sm rounded-full border border-gray-300 px-3 py-1"
    >
      {lang === "ja" ? "English" : "日本語"}
    </button>
  );
}
