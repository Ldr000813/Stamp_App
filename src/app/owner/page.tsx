"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import SpotEventManager from "@/components/SpotEventManager";

export default function OwnerPage() {
  const { session, ready } = useAuth();
  const [spots, setSpots] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const token = session?.access_token as string | undefined;
  const email = session?.user?.email as string | undefined;

  useEffect(() => {
    if (!ready || !token) return;
    (async () => {
      const r = await fetch("/api/owner/spots", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (r.ok) { const j = await r.json(); setSpots(j.spots || []); setIsAdmin(!!j.isAdmin); }
      setLoading(false);
    })();
  }, [ready, token]);

  // When not logged in, the global AuthProvider shows the login screen instead of this page.
  if (!ready) return <main className="p-6 text-center text-gray-400">…</main>;

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
