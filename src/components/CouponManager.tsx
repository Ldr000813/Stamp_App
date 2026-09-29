"use client";
import { useEffect, useState } from "react";
import ImageUpload from "@/components/ImageUpload";

const empty = { title_ja: "", title_en: "", description_ja: "", description_en: "", image_url: "", reward_id: "" };

export default function CouponManager({ token, onUploadingChange }: { token: string; onUploadingChange?: (b: boolean) => void }) {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ ...empty });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));
  const auth = { Authorization: `Bearer ${token}` };
  const cardName = (id: string) => cards.find((c) => c.id === id)?.title_ja;

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  async function load() {
    const [rc, rr] = await Promise.all([
      fetch("/api/admin/coupons", { headers: auth, cache: "no-store" }),
      fetch("/api/admin/rewards", { headers: auth, cache: "no-store" }),
    ]);
    if (rc.ok) setCoupons((await rc.json()).coupons || []);
    if (rr.ok) setCards((await rr.json()).rewards || []);
  }
  function openAdd() { setEditingId(null); setForm({ ...empty }); setShowForm(true); setMsg(""); }
  function openEdit(c: any) {
    setEditingId(c.id);
    setForm({ title_ja: c.title_ja || "", title_en: c.title_en || "", description_ja: c.description_ja || "", description_en: c.description_en || "", image_url: c.image_url || "", reward_id: c.reward_id || "" });
    setShowForm(true); setMsg("");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    if (!form.title_ja) { setMsg("クーポン名（日本語）は必須です"); return; }
    if (!form.reward_id) { setMsg("対象スタンプカードを選んでください"); return; }
    const r = await fetch("/api/admin/coupons", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify(editingId ? { id: editingId, ...form } : form),
    });
    if (r.ok) { setShowForm(false); setForm({ ...empty }); setEditingId(null); load(); }
    else setMsg("保存に失敗しました");
  }
  async function toggle(c: any) {
    await fetch("/api/admin/coupons", { method: "PATCH", headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify({ id: c.id, active: !c.active }) });
    load();
  }
  async function del(c: any) {
    if (!confirm(`クーポン「${c.title_ja}」を削除しますか？（利用履歴も消えます）`)) return;
    await fetch(`/api/admin/coupons?id=${c.id}`, { method: "DELETE", headers: auth });
    load();
  }

  return (
    <div className="mt-6 border-t pt-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-[#4b4640]">クーポン</h3>
        <button onClick={openAdd} className="f-btn f-btn-primary rounded-full">＋ クーポンを追加</button>
      </div>
      <p className="text-xs text-gray-500 mb-3">各クーポンは<strong>対象スタンプカード</strong>に紐づきます。参加者がそのカードをコンプリートすると、<strong>有効期限2か月</strong>で自動付与されます（定期カードなら毎回）。</p>

      {showForm && (
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 mb-4">
          <p className="text-sm font-bold text-emerald-700">{editingId ? "クーポンを編集" : "新しいクーポン"}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-gray-500">対象スタンプカード（このカードを達成すると付与）</label>
              <select className="f-input" value={form.reward_id} onChange={(e) => set("reward_id", e.target.value)} required>
                <option value="">— カードを選択 —</option>
                {cards.map((c) => <option key={c.id} value={c.id}>{c.title_ja}{c.recurring ? "（定期）" : ""}</option>)}
              </select>
            </div>
            <input className="f-input" placeholder="クーポン名（日本語）例: ドリンク1杯無料" value={form.title_ja} onChange={(e) => set("title_ja", e.target.value)} required />
            <input className="f-input" placeholder="Title (English)" value={form.title_en} onChange={(e) => set("title_en", e.target.value)} />
            <textarea className="f-input col-span-2" placeholder="条件・説明（日本語）例: 1回限り / 対象店舗で提示" value={form.description_ja} onChange={(e) => set("description_ja", e.target.value)} />
            <textarea className="f-input col-span-2" placeholder="Description (English)" value={form.description_en} onChange={(e) => set("description_en", e.target.value)} />
            <div className="col-span-2"><label className="text-xs text-gray-500">画像（任意）</label>
              <ImageUpload value={form.image_url} onChange={(url) => set("image_url", url)} token={token} onUploadingChange={onUploadingChange} /></div>
          </div>
          <div className="flex gap-2">
            <button className="f-btn f-btn-primary">{editingId ? "更新" : "追加"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="f-btn f-btn-secondary">キャンセル</button>
          </div>
          {msg && <p className="text-red-600 text-sm">{msg}</p>}
        </form>
      )}

      {coupons.length === 0 ? (
        <p className="text-sm text-gray-400">まだクーポンがありません。「＋ クーポンを追加」から作成してください。</p>
      ) : (
        <ul className="space-y-2">
          {coupons.map((c) => (
            <li key={c.id} className={`flex justify-between items-center border rounded-lg p-3 ${c.active ? "" : "bg-gray-100 opacity-70"}`}>
              <span className="flex items-center gap-2 min-w-0">
                {!c.active && <span className="text-xs bg-gray-300 text-gray-700 rounded-full px-2 py-0.5">無効</span>}
                <span className="truncate">🎟️ {c.title_ja}</span>
                {c.reward_id
                  ? <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 shrink-0 truncate">→ {cardName(c.reward_id) || "カード"}</span>
                  : <span className="text-xs bg-rose-100 text-rose-600 rounded-full px-2 py-0.5 shrink-0">カード未設定</span>}
              </span>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openEdit(c)} className="f-btn f-btn-sm f-btn-secondary">編集</button>
                <button onClick={() => toggle(c)} className="f-btn f-btn-sm f-btn-secondary">{c.active ? "無効化" : "有効化"}</button>
                <button onClick={() => del(c)} className="f-btn f-btn-sm f-btn-danger">削除</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
