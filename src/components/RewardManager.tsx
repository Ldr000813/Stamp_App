"use client";
import { useEffect, useState } from "react";
import ImageUpload from "@/components/ImageUpload";

const empty = { title_ja: "", title_en: "", body_ja: "", body_en: "", image_url: "", required_stamps: "5", recurring: false, spot_ids: [] as string[], coupon_ids: [] as string[] };

export default function RewardManager({ token, onUploadingChange }: { token: string; onUploadingChange?: (b: boolean) => void }) {
  const [rewards, setRewards] = useState<any[]>([]);
  const [allSpots, setAllSpots] = useState<any[]>([]);
  const [allCoupons, setAllCoupons] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ ...empty });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));
  const auth = { Authorization: `Bearer ${token}` };

  const toggleId = (key: "spot_ids" | "coupon_ids", id: string) =>
    setForm((f: any) => {
      const has = f[key].includes(id);
      return { ...f, [key]: has ? f[key].filter((x: string) => x !== id) : [...f[key], id] };
    });

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  async function load() {
    const [rr, rs, rc] = await Promise.all([
      fetch("/api/admin/rewards", { headers: auth, cache: "no-store" }),
      fetch("/api/admin/spots", { headers: auth, cache: "no-store" }),
      fetch("/api/admin/coupons", { headers: auth, cache: "no-store" }),
    ]);
    if (rr.ok) setRewards((await rr.json()).rewards || []);
    if (rs.ok) setAllSpots(((await rs.json()).spots || []).filter((s: any) => s.active));
    if (rc.ok) setAllCoupons(((await rc.json()).coupons || []).filter((c: any) => c.active));
  }
  function openAdd() { setEditingId(null); setForm({ ...empty, spot_ids: [], coupon_ids: [] }); setShowForm(true); setMsg(""); }
  function openEdit(x: any) {
    setEditingId(x.id);
    setForm({
      title_ja: x.title_ja || "", title_en: x.title_en || "",
      body_ja: x.body_ja || "", body_en: x.body_en || "",
      image_url: x.image_url || "", required_stamps: String(x.required_stamps ?? 5),
      recurring: !!x.recurring,
      spot_ids: x.spot_ids || [], coupon_ids: x.coupon_ids || [],
    });
    setShowForm(true); setMsg("");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    if (!form.title_ja) { setMsg("特典名（日本語）は必須です"); return; }
    if (!form.spot_ids.length) { setMsg("対象スポットを1つ以上選んでください"); return; }
    const req = Math.min(Math.max(1, parseInt(form.required_stamps, 10) || 1), form.spot_ids.length);
    const payload = { ...form, required_stamps: String(req) };
    const r = await fetch("/api/admin/rewards", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
    });
    if (r.ok) { setShowForm(false); setForm({ ...empty }); setEditingId(null); load(); }
    else setMsg("保存に失敗しました");
  }
  async function toggle(x: any) {
    await fetch("/api/admin/rewards", { method: "PATCH", headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify({ id: x.id, active: !x.active }) });
    load();
  }
  async function del(x: any) {
    if (!confirm(`特典「${x.title_ja}」を削除しますか？`)) return;
    await fetch(`/api/admin/rewards?id=${x.id}`, { method: "DELETE", headers: auth });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-[#4b4640]">スタンプカード（特典）</h3>
        <button onClick={openAdd} className="f-btn f-btn-primary rounded-full">＋ カードを追加</button>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        カードごとに「必要スタンプ数」を設定。参加者はカードの「スキャン」でスポットQRを読むと、そのカードにスタンプが付きます。Maxで、そのカードに紐づくクーポンが<strong>2か月期限</strong>で付与されます。<strong>定期カード</strong>はコンプリートのたびにリセットして繰り返せます。
      </p>

      {showForm && (
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 mb-4">
          <p className="text-sm font-bold text-emerald-700">{editingId ? "特典を編集" : "新しい特典"}</p>
          <div className="grid grid-cols-2 gap-2">
            <input className="f-input" placeholder="特典名（日本語）例: 記念グッズ" value={form.title_ja} onChange={(e) => set("title_ja", e.target.value)} required />
            <input className="f-input" placeholder="Title (English)" value={form.title_en} onChange={(e) => set("title_en", e.target.value)} />
            <div className="col-span-2 flex items-center gap-2">
              <label className="text-sm text-gray-600">必要スタンプ数</label>
              <input type="number" min={1} className="f-input w-24" value={form.required_stamps} onChange={(e) => set("required_stamps", e.target.value)} />
              <span className="text-sm text-gray-500">個</span>
            </div>
            <label className="col-span-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={!!form.recurring} onChange={(e) => setForm((f: any) => ({ ...f, recurring: e.target.checked }))} />
              <span className="text-sm text-slate-700"><strong>定期カード</strong>にする（コンプリートのたびにリセット＆クーポン付与、繰り返し可）</span>
            </label>

            <div className="col-span-2">
              <label className="text-xs text-gray-500">対象スポット（{form.spot_ids.length}件選択・必要数はこの中から）</label>
              <div className="mt-1 grid grid-cols-2 gap-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                {allSpots.length === 0
                  ? <p className="text-xs text-gray-400 col-span-2">スポットがありません。先に「スポット（場所）」タブで追加してください。</p>
                  : allSpots.map((s) => (
                    <label key={s.id} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={form.spot_ids.includes(s.id)} onChange={() => toggleId("spot_ids", s.id)} />
                      <span className="truncate">{s.name_ja}</span>
                    </label>
                  ))}
              </div>
            </div>

            <div className="col-span-2">
              <label className="text-xs text-gray-500">達成時に付与するクーポン（{form.coupon_ids.length}件）</label>
              <div className="mt-1 grid grid-cols-1 gap-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                {allCoupons.length === 0
                  ? <p className="text-xs text-gray-400">クーポンがありません。下の「クーポン」で先に作成してください。</p>
                  : allCoupons.map((c) => (
                    <label key={c.id} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={form.coupon_ids.includes(c.id)} onChange={() => toggleId("coupon_ids", c.id)} />
                      <span className="truncate">🎟️ {c.title_ja}</span>
                    </label>
                  ))}
              </div>
            </div>
            <textarea className="f-input col-span-2" placeholder="説明・受け取り方法（日本語）" value={form.body_ja} onChange={(e) => set("body_ja", e.target.value)} />
            <textarea className="f-input col-span-2" placeholder="Description / how to receive (English)" value={form.body_en} onChange={(e) => set("body_en", e.target.value)} />
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

      {rewards.length === 0 ? (
        <p className="text-sm text-gray-400">まだ特典がありません。「＋ 特典を追加」から作成してください。</p>
      ) : (
        <ul className="space-y-2">
          {rewards.map((x) => (
            <li key={x.id} className={`flex justify-between items-center border rounded-lg p-3 ${x.active ? "" : "bg-gray-100 opacity-70"}`}>
              <span className="flex items-center gap-2 min-w-0">
                {!x.active && <span className="text-xs bg-gray-300 text-gray-700 rounded-full px-2 py-0.5">無効</span>}
                <span className="truncate">🎁 {x.title_ja}</span>
                <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 shrink-0">{x.required_stamps}個</span>
                {x.recurring && <span className="text-xs bg-teal-100 text-teal-700 rounded-full px-2 py-0.5 shrink-0">定期</span>}
              </span>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openEdit(x)} className="f-btn f-btn-sm f-btn-secondary">編集</button>
                <button onClick={() => toggle(x)} className="f-btn f-btn-sm f-btn-secondary">{x.active ? "無効化" : "有効化"}</button>
                <button onClick={() => del(x)} className="f-btn f-btn-sm f-btn-danger">削除</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
