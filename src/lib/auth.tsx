"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getParticipantId } from "@/lib/participant";
import ParticipantLogin from "@/components/ParticipantLogin";

type Ctx = {
  session: any;
  participantId: string;
  ready: boolean;
  tick: number;
  supabase: ReturnType<typeof supabaseBrowser>;
  refresh: () => void;
};
const AuthContext = createContext<Ctx>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => supabaseBrowser());
  const [session, setSession] = useState<any>(null);
  const [anonId, setAnonId] = useState("");
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const path = usePathname() || "";
  const isAdmin = path.startsWith("/admin");

  useEffect(() => {
    setAnonId(getParticipantId());
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  // Migrate any pre-login (anonymous) stamps to the account, once.
  useEffect(() => {
    (async () => {
      if (session?.user && anonId && session.user.id !== anonId) {
        try {
          await fetch("/api/link", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ anonId }),
          });
        } catch {}
        setTick((t) => t + 1);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const participantId = session?.user?.id || anonId;
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Login is required for participant pages. Admin (/admin) handles its own auth.
  let content: React.ReactNode = children;
  if (!isAdmin) {
    if (!ready) content = <main className="p-6 text-center text-gray-400">…</main>;
    else if (!session) content = <ParticipantLogin supabase={supabase} />;
  }

  return (
    <AuthContext.Provider value={{ session, participantId, ready, tick, supabase, refresh }}>
      {content}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
