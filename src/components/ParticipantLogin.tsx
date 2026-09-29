"use client";
import { useEffect, useRef, useState } from "react";

const RESEND_COOLDOWN = 60; // seconds (matches Supabase's default resend limit)

export default function ParticipantLogin({ supabase }: { supabase: any }) {
  const [mode, setMode] = useState<"in" | "up">("up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<any>(null);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((s) => { if (s <= 1) { clearInterval(timerRef.current); return 0; } return s - 1; });
    }, 1000);
  }
  useEffect(() => () => clearInterval(timerRef.current), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(""); setBusy(true);
    const res = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (res.error) { setMsg(res.error.message); return; }
    if (mode === "up" && !res.data?.session) {
      setAwaitingConfirm(true);
      setMsg("確認メールを送りました。メール内のリンクで有効化してから、ログインしてください。");
      startCooldown();
    }
    // On success with a session, the AuthProvider gate re-renders into the app.
  }

  async function resend() {
    if (cooldown > 0 || !email) return;
    setMsg(""); setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setBusy(false);
    if (error) { setMsg("再送できませんでした：" + error.message + "（しばらく待つか、迷惑メールもご確認ください）"); startCooldown(); return; }
    setMsg("確認メールを再送しました。届かない場合は迷惑メールもご確認ください。");
    startCooldown();
  }

  return (
    <main className="mx-auto max-w-sm px-4 pt-14 pb-10">
      <div className="rounded-3xl bg-gradient-to-br from-[#FCE8B2] to-[#BFE8DF] p-6 text-center mb-6 shadow-sm">
        <div className="text-3xl mb-1">🎫</div>
        <h1 className="text-xl font-extrabold text-[#4b4640]">京都スタンプラリー</h1>
        <p className="text-sm text-[#4b4640] mt-1">はじめる前に、ログインしてください</p>
      </div>

      <div className="flex gap-3 mb-3 text-sm justify-center">
        <button onClick={() => { setMode("up"); setMsg(""); }} className={mode === "up" ? "font-bold text-[#33A6A0] underline" : "text-gray-500"}>新規登録</button>
        <span className="text-gray-300">/</span>
        <button onClick={() => { setMode("in"); setMsg(""); setAwaitingConfirm(false); }} className={mode === "in" ? "font-bold text-[#33A6A0] underline" : "text-gray-500"}>ログイン</button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input className="w-full border rounded-lg p-3" placeholder="メールアドレス" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <div className="relative">
          <input
            className="w-full border rounded-lg p-3 pr-12"
            placeholder="パスワード"
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? "パスワードを隠す" : "パスワードを表示"}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium px-2 py-1 rounded hover:bg-gray-100"
          >
            {showPw ? "隠す" : "表示"}
          </button>
        </div>
        <button disabled={busy} className="w-full rounded-full bg-[#F6C64B] text-[#4b4640] font-bold py-3 disabled:opacity-60">
          {busy ? "..." : mode === "up" ? "登録して始める" : "ログイン"}
        </button>
      </form>

      {awaitingConfirm && (
        <div className="mt-4 rounded-2xl bg-[#FFF6DC] border border-[#F0DFA0] p-4 text-center">
          <p className="text-sm text-[#8a6d1e]">📧 メールが届かない場合は、下から再送できます。</p>
          <button
            onClick={resend}
            disabled={cooldown > 0 || busy}
            className="mt-3 w-full rounded-full bg-white border border-[#33A6A0] text-[#33A6A0] font-bold py-2.5 disabled:opacity-50"
          >
            {cooldown > 0 ? `あと ${cooldown} 秒で再送できます` : "確認メールを再送する"}
          </button>
          <p className="text-[11px] text-gray-400 mt-2">送信元は迷惑メールに振り分けられることがあります。ご確認ください。</p>
        </div>
      )}

      {msg && <p className="text-sm text-red-600 mt-3 text-center">{msg}</p>}
      <p className="text-xs text-gray-400 mt-6 text-center">スタンプの進捗はアカウントに保存され、機種変や別の端末でも引き継げます。</p>
    </main>
  );
}
