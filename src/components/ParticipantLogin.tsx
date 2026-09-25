"use client";
import { useState } from "react";

export default function ParticipantLogin({ supabase }: { supabase: any }) {
  const [mode, setMode] = useState<"in" | "up">("up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(""); setBusy(true);
    const res = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (res.error) setMsg(res.error.message);
    else if (mode === "up" && !res.data?.session) setMsg("確認メールを送りました。メール内のリンクで有効化してから、ログインしてください。");
    // On success with an active session, the AuthProvider gate re-renders into the app automatically.
  }

  return (
    <main className="mx-auto max-w-sm px-4 pt-14 pb-10">
      <div className="rounded-3xl bg-gradient-to-br from-[#FCE8B2] to-[#BFE8DF] p-6 text-center mb-6 shadow-sm">
        <div className="text-3xl mb-1">🎫</div>
        <h1 className="text-xl font-extrabold text-[#4b4640]">京都スタンプラリー</h1>
        <p className="text-sm text-[#4b4640] mt-1">はじめる前に、ログインしてください</p>
      </div>

      <div className="flex gap-3 mb-3 text-sm justify-center">
        <button onClick={() => setMode("up")} className={mode === "up" ? "font-bold text-[#33A6A0] underline" : "text-gray-500"}>新規登録</button>
        <span className="text-gray-300">/</span>
        <button onClick={() => setMode("in")} className={mode === "in" ? "font-bold text-[#33A6A0] underline" : "text-gray-500"}>ログイン</button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input className="w-full border rounded-lg p-3" placeholder="メールアドレス" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full border rounded-lg p-3" placeholder="パスワード" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button disabled={busy} className="w-full rounded-full bg-[#F6C64B] text-[#4b4640] font-bold py-3 disabled:opacity-60">
          {busy ? "..." : mode === "up" ? "登録して始める" : "ログイン"}
        </button>
      </form>

      {msg && <p className="text-sm text-red-600 mt-3 text-center">{msg}</p>}
      <p className="text-xs text-gray-400 mt-6 text-center">スタンプの進捗はアカウントに保存され、機種変や別の端末でも引き継げます。</p>
    </main>
  );
}
