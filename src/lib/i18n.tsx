"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import ja from "@/messages/ja.json";
import en from "@/messages/en.json";

type Dict = Record<string, string>;
type Lang = "ja" | "en";
const dicts: Record<Lang, Dict> = { ja, en };

type Vars = Record<string, string | number>;
const Ctx = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: string, vars?: Vars) => string;
}>({ lang: "ja", setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ja");
  useEffect(() => {
    const saved = window.localStorage.getItem("lang");
    if (saved === "ja" || saved === "en") setLangState(saved);
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    window.localStorage.setItem("lang", l);
  };
  const t = (k: string, vars?: Vars) => {
    let s = dicts[lang][k] ?? k;
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val));
    return s;
  };
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
