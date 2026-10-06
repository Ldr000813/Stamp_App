"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import SpotEventManager from "@/components/SpotEventManager";

// View-only temporary login (for showing the internal screen to judges / partners).
// It grants NO real power: all actions are blocked and nothing is editable.
const DEMO_ID = process.env.NEXT_PUBLIC_DEMO_OWNER_ID || "demo";
const DEMO_PW = process.env.NEXT_PUBLIC_DEMO_OWNER_PW || "tonari2026";
const DEMO_KEY = "owner_demo_viewer";

export default function OwnerPage() {
  const { session, ready, isAnonymous, signInGoogle } = useAuth();
  const [spots, setSpots] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const token = session?.access_token as string | undefined;
  const email = session?.user?.email as string | undefined;
  const signedIn = !!session?.user && !isAnonymous && !!email;

  // --- temporary viewer (demo) state ---
  const [demo, setDemo] = useState(false);
  const [demoSpots, setDemoSpots] = useState<any[]>([]);
  const [demoId, setDemoId] = useState("");
  const [demoPw, setDemoPw] = useState("");
  const [demoErr, setDemoErr] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(DEMO_KEY) === "1") setDemo(true);
  }, []);

  // Real owner: load their spots.
  useEffect(() => {
    if (!ready || !token || !signedIn || demo) { if (ready) setLoading(false); return; }
    (async () => {
      setLoading(true);
      const r = await fetch("/api/owner/spots", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (r.ok) { const j = await r.json(); setSpots(j.spots || []); setIsAdmin(!!j.isAdmin); }
      setLoading(false);
    })();
  }, [ready, token, signedIn, demo]);

  // Demo viewer: load active spots (read-only, public).
  useEffect(() => {
    if (!demo) return;
    (async () => {
      const r = await fetch("/api/demo", { cache: "no-store" });
      if (r.ok) setDemoSpots((await r.json()).spots || []);
    })();
  }, [demo]);

  function tempLogin(e: React.FormEvent) {
    e.preventDefault(); setDemoErr("");
    if (demoId.trim() === DEMO_ID && demoPw === DEMO_PW) {
      try { sessionStorage.setItem(DEMO_KEY, "1"); } catch {}
      setDemo(true);
    } else {
      setDemoErr("IDまたはパスワードが違います。");
    }
  }
  function exitDemo() {
    try { sessionStorage.removeItem(DEMO_KEY); } catch {}
    setDemo(false); setDemoId(""); setDemoPw("");
  }

  if (!ready) return <main className="p-6 text-center text-gray-400">…</main>;

  // --- Temporary viewer mode: show the owner screen read-only ---
  if (demo) {
    return (
      <main className="mx-auto max-w-lg px-4 py-5">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-[#4b4640]">店舗オーナー画面</h1>
          <button onClick={exitDemo} className="text-sm text-gray-400 underline underline-offset-2">閲覧専用を終了</button>
        </div>
        <p className="text-xs text-amber-700 font-bold mb-4">ログイン中: 一時ユーザー（閲覧専用）</p>
        <SpotEventManager token="" spots={demoSpots} apiBase="/api/events" readOnly />
      </main>
    );
  }

  // --- Not signed in: Google login (real owners) + temporary viewer login ---
  if (!signedIn) {
    return (
      <main className="mx-auto max-w-sm px-4 pt-14 pb-10 text-center">
        <div className="text-4xl mb-3">🏪</div>
        <h1 className="text-xl font-bold text-[#4b4640]">店舗オーナーログイン</h1>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">
          運営から店舗を割り当てられたメールアドレスの<b>Googleアカウント</b>でログインしてください。
        </p>
        <button
          onClick={() => signInGoogle()}
          className="mt-6 w-full rounded-full bg-white border border-slate-300 text-slate-700 font-bold py-3 flex items-center justify-center gap-2 shadow-sm"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5C43.3 37.4 46.1 31.5 46.1 24.5z" />
            <path fill="#FBBC05" d="M10.4 28.3c-.5-1.4-.8-2.8-.8-4.3s.3-3 .8-4.3l-7.8-6.1C.9 16.7 0 20.2 0 24s.9 7.3 2.6 10.4l7.8-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.1-5.5c-2 1.3-4.5 2.1-8.7 2.1-6.3 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
          Googleでログイン
        </button>

        {/* 閲覧専用の一時ログイン（内部の様子を見るだけ） */}
        <div className="mt-8 rounded-2xl bg-slate-50 border border-slate-200 p-4 text-left">
          <p className="text-sm font-bold text-slate-700 text-center">👀 閲覧専用ログイン（一時ユーザー）</p>
          <p className="text-[11px] text-slate-400 text-center mt-1 mb-3">画面の確認用です。編集・追加・削除はできません。</p>
          <form onSubmit={tempLogin} className="space-y-2">
            <input className="w-full border rounded-lg p-2.5 text-sm" placeholder="ユーザーID" value={demoId} onChange={(e) => setDemoId(e.target.value)} />
            <input className="w-full border rounded-lg p-2.5 text-sm" type="password" placeholder="パスワード" value={demoPw} onChange={(e) => setDemoPw(e.target.value)} />
            <button className="w-full rounded-full bg-slate-700 text-white font-bold py-2.5 text-sm">閲覧専用で入る</button>
          </form>
          {demoErr && <p className="text-xs text-rose-600 mt-2 text-center">{demoErr}</p>}
        </div>

        <Link href="/" className="inline-block mt-6 text-sm text-gray-400 underline underline-offset-2">ユーザー画面へ戻る</Link>
      </main>
    );
  }

  // --- Real owner view ---
  return (
    <main className="mx-auto max-w-lg px-4 py-5">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold text-[#4b4640]">店舗オーナー画面</h1>
        <Link href="/" className="text-sm text-gray-400 underline underline-offset-2">ユーザー画面へ</Link>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        ログイン中: {email}{isAdmin && <span className="ml-1 text-emerald-600 font-bold">（運営）</span>}
      </p>

      {loading ? (
        <p className="text-gray-400">読み込み中…</p>
      ) : spots.length === 0 ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 leading-relaxed">
          あなたのメールアドレスに紐づいた店舗がまだありません。<br />
          運営（りえさん）に、この画面のメールアドレス<br />
          <span className="font-bold">{email}</span><br />
          を伝えて、店舗を割り当ててもらってください。
        </div>
      ) : (
        <SpotEventManager token={token!} spots={spots} apiBase="/api/owner/events" />
      )}
    </main>
  );
}
