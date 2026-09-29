"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Ctx = {
  session: any;
  participantId: string;
  ready: boolean;
  isAnonymous: boolean;
  tick: number;
  supabase: ReturnType<typeof supabaseBrowser>;
  refresh: () => void;
  linkGoogle: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<Ctx>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => supabaseBrowser());
  const [session, setSession] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const path = usePathname() || "";
  const isAdmin = path.startsWith("/admin");

  useEffect(() => {
    let sub: any;
    (async () => {
      const { data } = await supabase.auth.getSession();
      let s = data.session;
      // Participants get an automatic anonymous account — no signup, no email.
      if (!s && !isAdmin) {
        const r = await supabase.auth.signInAnonymously();
        s = r.data?.session ?? null;
      }
      setSession(s);
      setReady(true);
    })();
    const listener = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    sub = listener.data;
    return () => sub?.subscription?.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, isAdmin]);

  const participantId = session?.user?.id || "";
  const isAnonymous = !!session?.user?.is_anonymous;
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;

  const linkGoogle = useCallback(async () => {
    await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo } } as any);
  }, [supabase, redirectTo]);
  const signInGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  }, [supabase, redirectTo]);
  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, [supabase]);

  let content: React.ReactNode = children;
  if (!isAdmin) {
    if (!ready) content = <main className="p-6 text-center text-gray-400">…</main>;
    else if (!session) content = (
      <main className="p-6 text-center text-gray-500">
        <p className="mb-3">アプリを開始できませんでした。</p>
        <p className="text-xs text-gray-400 mb-4">Supabaseの Authentication → Sign In / Providers で「Anonymous sign-ins（匿名ログイン）」を有効にしてください。</p>
        <button onClick={() => location.reload()} className="rounded-full bg-[#F6C64B] text-[#4b4640] font-bold px-5 py-2">再読み込み</button>
      </main>
    );
  }

  return (
    <AuthContext.Provider value={{ session, participantId, ready, isAnonymous, tick, supabase, refresh, linkGoogle, signInGoogle, signOut }}>
      {content}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
