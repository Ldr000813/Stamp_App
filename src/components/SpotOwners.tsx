"use client";
import { useEffect, useState } from "react";
import { Button, TextInput, Card } from "@/components/ui";

// Admin-only modal: manage the owner allowlist for one spot. Owners added here
// can sign in with Google (using this email) and edit that spot's events.
export default function SpotOwners({
  spot, token, onClose,
}: { spot: any; token: string; onClose: () => void }) {
  const [owners, setOwners] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const authHeaders = (json = false): any => {
    const h: any = { Authorization: `Bearer ${token}` };
    if (json) h["Content-Type"] = "application/json";
    return h;
  };

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/admin/owners?spot_id=${spot.id}`, { headers: authHeaders(), cache: "no-store" });
    if (r.ok) setOwners(((await r.json()).owners || []).map((o: any) => o.email));
    else setMsg("読み込みに失敗しました");
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [spot.id]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!v) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/admin/owners", {
      method: "POST", headers: authHeaders(true),
      body: JSON.stringify({ spot_id: spot.id, email: v }),
    });
    setBusy(false);
    if (r.ok) { setEmail(""); load(); }
    else {
      const j = await r.json().catch(() => ({}));
      setMsg(j.error === "invalid_email" ? "メールアドレスの形式が正しくありません" : "追加に失敗しました");
    }
  }

  async function remove(target: string) {
    if (!confirm(`${target} をこの店舗のオーナーから外しますか？`)) return;
    setBusy(true); setMsg("");
    const r = await fetch(`/api/admin/owners?spot_id=${spot.id}&email=${encodeURIComponent(target)}`, {
      method: "DELETE", headers: authHeaders(),
    });
    setBusy(false);
    if (r.ok) load(); else setMsg("削除に失敗しました");
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <Card className="max-w-sm w-full p-5" >
        <div onClick={(e) => e.stopPropagation()}>
          <h3 className="font-bold text-slate-800">オーナー管理</h3>
          <p className="text-xs text-slate-400 mt-0.5">{spot.name_ja}</p>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            登録したメールアドレスの人が、<b>Googleでログイン</b>してこの店舗のイベントを編集できます。
          </p>

          <form onSubmit={add} className="flex gap-2 mt-4">
            <TextInput type="email" placeholder="owner@example.com" value={email}
              onChange={(e) => setEmail(e.target.value)} className="flex-1" />
            <Button type="submit" disabled={busy || !email.trim()}>追加</Button>
          </form>

          <div className="mt-4">
            {loading ? (
              <p className="text-sm text-slate-400">読み込み中…</p>
            ) : owners.length === 0 ? (
              <p className="text-sm text-slate-400">まだオーナーがいません。</p>
            ) : (
              <ul className="space-y-2">
                {owners.map((o) => (
                  <li key={o} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-700 truncate">{o}</span>
                    <button onClick={() => remove(o)} disabled={busy}
                      className="text-xs text-rose-500 hover:text-rose-700 underline underline-offset-2 shrink-0">
                      外す
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {msg && <p className="text-rose-600 mt-3 text-sm">{msg}</p>}
          <Button onClick={onClose} variant="secondary" className="w-full mt-5">閉じる</Button>
        </div>
      </Card>
    </div>
  );
}
