"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type AuthResult = { error?: string };
type Ctx = {
  session: any;
  participantId: string;
  ready: boolean;
  isAnonymous: boolean;
  tick: number;
  authError: string;
  clearAuthError: () => void;
  isDemo: boolean;
  enterDemo: () => void;
  exitDemo: () => void;
  supabase: ReturnType<typeof supabaseBrowser>;
  refresh: () => void;
  linkGoogle: (next?: string) => Promise<AuthResult>;
  signInGoogle: (next?: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};
const DEMO_KEY = "owner_demo_viewer";
const AuthContext = createContext<Ctx>(null as any);

// Parse an OAuth error returned in the URL (either ?query or #hash form).
function readOAuthError(): { code: string; desc: string } | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const err = q.get("error") || h.get("error") || q.get("error_code") || h.get("error_code");
  if (!err) return null;
  return {
    code: (q.get("error_code") || h.get("error_code") || q.get("error") || h.get("error") || "").toLowerCase(),
    desc: q.get("error_description") || h.get("error_description") || "",
  };
}
function friendlyAuthError(code: string, desc: string): string {
  const blob = decodeURIComponent((code + " " + desc).replace(/\+/g, " ")).toLowerCase();
  // Any "already exists / already registered / identity already linked" case means
  // this Google account already belongs to an account → they should sign in, not link.
  if (/already|identity_already_exists|email_exists|user_already/.test(blob)) {
    return "このGoogleアカウントは既に登録済みです。下の「Googleでログイン」からお入りください。";
  }
  return decodeURIComponent(desc || "連携に失敗しました。もう一度お試しください。").replace(/\+/g, " ");
}
function cleanOAuthUrl() {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, "", window.location.pathname);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => supabaseBrowser());
  const [session, setSession] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [authError, setAuthError] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const path = usePathname() || "";
  const isAdmin = path.startsWith("/admin");

  // Temporary "view-only" visitor flag (shared app-wide). While set, every login /
  // hand-off feature is disabled and a persistent notice is shown.
  useEffect(() => {
    try { if (sessionStorage.getItem(DEMO_KEY) === "1") setIsDemo(true); } catch { /* ignore */ }
  }, []);
  const enterDemo = useCallback(() => { try { sessionStorage.setItem(DEMO_KEY, "1"); } catch {} setIsDemo(true); }, []);
  const exitDemo = useCallback(() => { try { sessionStorage.removeItem(DEMO_KEY); } catch {} setIsDemo(false); }, []);

  useEffect(() => {
    let mounted = true;
    // Subscribe first so we catch the SIGNED_IN that arrives after an OAuth return.
    const listener = supabase.auth.onAuthStateChange(async (event, s) => {
      if (!mounted) return;
      // Participants are anonymous by default. If they sign out (e.g. leaving a
      // linked Google account), immediately hand them a fresh anonymous session
      // instead of dropping them on the "could not start" screen.
      if (!s && !isAdmin && event === "SIGNED_OUT") {
        const r = await supabase.auth.signInAnonymously();
        if (!mounted) return;
        setSession(r.data?.session ?? null);
        setReady(true);
        return;
      }
      setSession(s);
      setReady(true);
    });

    (async () => {
      // A failed Google link/sign-in returns an error in the URL. The user's
      // existing (anonymous) session is still intact, so surface the reason and
      // keep going rather than silently swallowing it.
      const oauthErr = readOAuthError();
      if (oauthErr) {
        cleanOAuthUrl();
        if (mounted) setAuthError(friendlyAuthError(oauthErr.code, oauthErr.desc));
      }

      const { data } = await supabase.auth.getSession();
      const s = data.session;
      if (s) { if (mounted) { setSession(s); setReady(true); } return; }

      // If we just came back from a successful Google (OAuth/link) redirect, do NOT
      // create a new anonymous user — that would overwrite the just-linked account.
      // Wait for onAuthStateChange to deliver the session (with a safety fallback).
      const url = typeof window !== "undefined" ? window.location.href : "";
      const oauthInProgress = !oauthErr && /[?&]code=|[#&]access_token=/.test(url);
      if (oauthInProgress) {
        setTimeout(async () => {
          if (!mounted) return;
          const { data: d2 } = await supabase.auth.getSession();
          if (!d2.session && !isAdmin) {
            const r = await supabase.auth.signInAnonymously();
            setSession(r.data?.session ?? null);
          }
          setReady(true);
        }, 4000);
        return;
      }

      // Normal load with no session: give participants an anonymous account.
      if (!isAdmin) {
        const r = await supabase.auth.signInAnonymously();
        if (mounted) setSession(r.data?.session ?? null);
      }
      if (mounted) setReady(true);
    })();

    return () => { mounted = false; listener.data.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, isAdmin]);

  const participantId = session?.user?.id || "";
  const isAnonymous = !!session?.user?.is_anonymous;
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const clearAuthError = useCallback(() => setAuthError(""), []);
  // Where to land after the Google round-trip. Defaults to the current page
  // (owners → /owner). Callers can pass a path, e.g. "/" so a hand-off from the
  // stamp page returns to home instead of a spot URL that no longer has ?spot.
  // The Supabase redirect allowlist uses /**.
  const buildRedirect = (next?: string) =>
    typeof window !== "undefined" ? window.location.origin + (next || window.location.pathname) : undefined;

  // linkIdentity/signInWithOAuth return { error } instead of throwing. Surface it
  // (before the browser redirect) so a failed link never looks like "nothing happened".
  const linkGoogle = useCallback(async (next?: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo: buildRedirect(next) } } as any);
    return error ? { error: error.message } : {};
  }, [supabase]);
  const signInGoogle = useCallback(async (next?: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: buildRedirect(next) } });
    return error ? { error: error.message } : {};
  }, [supabase]);
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

  // Persistent "you are a temporary (view-only) user" banner, shown app-wide.
  const banner = isDemo && !isAdmin ? (
    <div className="sticky top-0 z-[70] bg-amber-400 text-[#4b4640] text-center text-xs font-bold px-3 py-1.5 flex items-center justify-center gap-2">
      <span>👀 一時ユーザー（閲覧専用）です — 編集・ログイン機能はご利用いただけません</span>
      <button onClick={exitDemo} className="underline underline-offset-2 shrink-0">終了</button>
    </div>
  ) : null;

  return (
    <AuthContext.Provider value={{ session, participantId, ready, isAnonymous, tick, authError, clearAuthError, isDemo, enterDemo, exitDemo, supabase, refresh, linkGoogle, signInGoogle, signOut }}>
      {banner}
      {content}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
