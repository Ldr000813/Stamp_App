"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function AuthPanel() {
  const { session, supabase } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  if (session?.user) {
    return (
      <div className="mt-6 text-center text-xs text-gray-500">
        {t("logged_in_as")} {session.user.email}　
        <button onClick={() => supabase.auth.signOut()} className="underline">{t("logout")}</button>
      </div>
    );
  }
  if (!open) {
    return (
      <div className="mt-6 text-center">
        <button onClick={() => setOpen(true)} className="text-xs text-emerald-700 underline">
          {t("login_sync")}
        </button>
      </div>
    );
  }
  async function submit(mode: "in" | "up") {
    setMsg("");
    const res = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (res.error) setMsg(res.error.message);
    else if (mode === "up") setMsg(t("check_email"));
  }
  return (
    <div className="mt-6 mx-auto max-w-xs bg-gray-50 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-2">{t("login_hint")}</p>
      <input className="w-full border rounded p-2 mb-2 text-sm" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="w-full border rounded p-2 mb-2 text-sm" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <div className="flex gap-2">
        <button onClick={() => submit("in")} className="flex-1 rounded bg-emerald-600 text-white py-1.5 text-sm">{t("login")}</button>
        <button onClick={() => submit("up")} className="flex-1 rounded border py-1.5 text-sm">{t("signup")}</button>
      </div>
      {msg && <p className="text-xs text-red-600 mt-2">{msg}</p>}
    </div>
  );
}
