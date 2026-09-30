"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5C43.3 37.4 46.1 31.5 46.1 24.5z" />
      <path fill="#FBBC05" d="M10.4 28.3c-.5-1.4-.8-2.8-.8-4.3s.3-3 .8-4.3l-7.8-6.1C.9 16.7 0 20.2 0 24s.9 7.3 2.6 10.4l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.1-5.5c-2 1.3-4.5 2.1-8.7 2.1-6.3 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export default function AuthPanel() {
  const { session, isAnonymous, authError, clearAuthError, linkGoogle, signInGoogle, signOut } = useAuth();
  const { lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Signed in with a real (Google) account.
  if (session?.user && !isAnonymous) {
    return (
      <div className="mt-6 text-center text-xs text-gray-500">
        {lang === "ja" ? "ログイン中: " : "Signed in: "}{session.user.email || "Google"}{" "}
        <button onClick={() => signOut()} className="underline">{lang === "ja" ? "ログアウト" : "Sign out"}</button>
      </div>
    );
  }

  // An error returned from a failed link/sign-in redirect, or from the button call.
  const shownError = msg || authError;
  // "Already linked" → steer the user to the sign-in button.
  const alreadyLinked = /既に(連携|登録)|already/.test(shownError);

  async function link() {
    setBusy(true); setMsg(""); clearAuthError();
    try {
      const { error } = await linkGoogle();        // resolves only if it did NOT redirect (i.e. failed)
      if (error) { setMsg(error); setBusy(false); }
    } catch (e: any) { setMsg(e?.message || (lang === "ja" ? "連携に失敗しました" : "Linking failed")); setBusy(false); }
  }
  async function login() {
    setBusy(true); setMsg(""); clearAuthError();
    try {
      const { error } = await signInGoogle();
      if (error) { setMsg(error); setBusy(false); }
    } catch (e: any) { setMsg(e?.message || (lang === "ja" ? "ログインに失敗しました" : "Sign-in failed")); setBusy(false); }
  }

  return (
    <div className="mt-6 mx-auto max-w-xs rounded-2xl bg-[#EAF6F3] border border-[#CDE9E3] p-4 text-center">
      <p className="text-sm font-bold text-[#33A6A0]">📱 {lang === "ja" ? "進捗の引き継ぎ" : "Keep your progress"}</p>
      <p className="text-xs text-gray-500 mt-1">
        {lang === "ja"
          ? "このままでも遊べます。機種変や別の端末でも引き継ぎたい場合は、Googleで連携してください。"
          : "You can play as you are. To carry your stamps to another device, link your Google account."}
      </p>
      <button onClick={link} disabled={busy} className="mt-3 w-full rounded-full bg-white border border-slate-300 text-slate-700 font-bold py-2.5 disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm">
        <GoogleG /> {lang === "ja" ? "Googleで引き継ぎを設定" : "Link with Google"}
      </button>
      <button onClick={login} disabled={busy} className={"mt-2 text-xs underline " + (alreadyLinked ? "text-[#33A6A0] font-bold" : "text-gray-500")}>
        {lang === "ja" ? "別の端末で連携済みの方（Googleでログイン）" : "Already linked? Sign in with Google"}
      </button>
      {shownError && <p className="text-xs text-red-600 mt-2">{shownError}</p>}
    </div>
  );
}
