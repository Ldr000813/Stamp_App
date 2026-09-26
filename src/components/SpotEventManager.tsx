"use client";
import { useEffect, useState } from "react";
import ImageUpload from "@/components/ImageUpload";
import { pad, toLocalInput, fmtDT } from "@/lib/datetime";

const emptyForm = {
  title_ja: "", title_en: "", description_ja: "", description_en: "",
  image_url: "", starts_at: "", ends_at: "",
};

export default function SpotEventManager({ token, spots, apiBase = "/api/admin/events" }: { token: string; spots: any[]; apiBase?: string }) {
  const [events, setEvents] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [formSpot, setFormSpot] = useState<string | null>(null); // spot whose add/edit form is open
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ ...emptyForm });
  const [msg, setMsg] = useState("");

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  async function load() {
    const r = await fetch(apiBase, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (r.ok) setEvents((await r.json()).events || []);
  }
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const now = Date.now();
  const eventsFor = (spotId: string | null) =>
    events.filter((e) => (e.spot_id || null) === spotId).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const upcomingCount = (spotId: string | null) =>
    eventsFor(spotId).filter((e) => new Date(e.ends_at || e.starts_at).getTime() >= now - 3600e3).length;

  function openAdd(spotId: string) {
    setExpanded(spotId); setFormSpot(spotId); setEditingId(null); setMsg("");
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0);
    setForm({ ...emptyForm, starts_at: toLocalInput(d.toISOString()) });
  }
  function openEdit(spotId: string | null, ev: any) {
    setExpanded(spotId); setFormSpot(spotId ?? "__none__"); setEditingId(ev.id); setMsg("");
    setForm({
      title_ja: ev.title_ja, title_en: ev.title_en,
      description_ja: ev.description_ja || "", description_en: ev.description_en || "",
      image_url: ev.image_url || "", starts_at: toLocalInput(ev.starts_at), ends_at: toLocalInput(ev.ends_at),
    });
  }
  function closeForm() { setFormSpot(null); setEditingId(null); setForm({ ...emptyForm }); setMsg(""); }

  async function submit(e: React.FormEvent, spotId: string | null) {
    e.preventDefault(); setMsg("");
    if (!form.title_ja || !form.title_en || !form.starts_at) { setMsg("イベント名(日/英)と開始日時は必須です"); return; }
    const payload = {
      spot_id: spotId,
      title_ja: form.title_ja, title_en: form.title_en,
      description_ja: form.description_ja, description_en: form.description_en, image_url: form.image_url,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
    };
    const r = await fetch(apiBase, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
    });
    if (r.ok) { closeForm(); load(); } else setMsg("保存に失敗しました");
  }
  async function del(ev: any) {
    if (!confirm(`「${ev.title_ja}」を削除しますか？`)) return;
    const r = await fetch(`${apiBase}?id=${ev.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) load();
  }

  function eventForm(spotId: string | null) {
    const key = spotId ?? "__none__";
    if (formSpot !== key) return null;
    return (
      <form onSubmit={(e) => submit(e, spotId)} className="f-card p-4 space-y-2 mt-2">
        <p className="text-sm font-bold text-emerald-700">{editingId ? "イベントを編集" : "この店舗のイベントを追加"}</p>
        <div className="grid grid-cols-2 gap-2">
          <input className="f-input" placeholder="イベント名（日本語）" value={form.title_ja} onChange={(e) => set("title_ja", e.target.value)} required />
          <input className="f-input" placeholder="Title (English)" value={form.title_en} onChange={(e) => set("title_en", e.target.value)} required />
          <div className="col-span-2 grid grid-cols-2 gap-2">
            <div><label className="text-xs text-gray-500">開始</label>
              <input type="datetime-local" className="f-input" value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} required /></div>
            <div><label className="text-xs text-gray-500">終了（任意）</label>
              <input type="datetime-local" className="f-input" value={form.ends_at} onChange={(e) => set("ends_at", e.target.value)} /></div>
          </div>
          <textarea className="f-input col-span-2" placeholder="説明（日本語）" value={form.description_ja} onChange={(e) => set("description_ja", e.target.value)} />
          <textarea className="f-input col-span-2" placeholder="Description (English)" value={form.description_en} onChange={(e) => set("description_en", e.target.value)} />
          <ImageUpload value={form.image_url} onChange={(url) => set("image_url", url)} token={token} />
        </div>
        <div className="flex gap-2">
          <button className="f-btn f-btn-primary">{editingId ? "更新" : "追加"}</button>
          <button type="button" onClick={closeForm} className="f-btn f-btn-secondary">キャンセル</button>
        </div>
        {msg && <p className="text-red-600 text-sm">{msg}</p>}
      </form>
    );
  }

  function eventList(spotId: string | null) {
    const list = eventsFor(spotId);
    return (
      <>
        {list.length === 0 ? (
          <p className="text-sm text-gray-400 py-1">まだイベントがありません</p>
        ) : (
          <ul className="space-y-1.5">
            {list.map((ev) => {
              const past = new Date(ev.ends_at || ev.starts_at).getTime() < now - 3600e3;
              return (
                <li key={ev.id} className={`flex justify-between items-center border rounded p-2 ${past ? "opacity-50" : ""}`}>
                  <span className="text-sm">
                    <span className="text-emerald-700 font-bold">{fmtDT(ev.starts_at)}</span>{" "}
                    {ev.title_ja}
                    {past && <span className="text-[10px] text-gray-400 ml-1">終了</span>}
                  </span>
                  <span className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => openEdit(spotId, ev)} className="f-btn f-btn-sm f-btn-secondary">編集</button>
                    <button type="button" onClick={() => del(ev)} className="f-btn f-btn-sm f-btn-danger">削除</button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  }

  const orphan = eventsFor(null);

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        店舗（スポット）ごとにイベントを登録します。各オーナーは自分の店舗の行を開いて、日時とイベント内容を追加してください。
      </p>

      {spots.length === 0 && <p className="text-gray-400">先に「スポット（場所）」タブで店舗を登録してください。</p>}

      {spots.map((s) => {
        const open = expanded === s.id;
        const cnt = upcomingCount(s.id);
        return (
          <div key={s.id} className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-3 bg-gray-50">
              <button type="button" onClick={() => setExpanded(open ? null : s.id)} className="flex items-center gap-2 text-left">
                <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                {s.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.image_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                )}
                <span className="font-bold">{s.name_ja}</span>
                {cnt > 0 && <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">予定 {cnt}</span>}
              </button>
              <button type="button" onClick={() => openAdd(s.id)} className="f-btn f-btn-sm f-btn-primary shrink-0">＋イベント追加</button>
            </div>
            {open && (
              <div className="p-3">
                {eventList(s.id)}
                {eventForm(s.id)}
              </div>
            )}
          </div>
        );
      })}

      {orphan.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between p-3 bg-amber-50">
            <button type="button" onClick={() => setExpanded(expanded === "__none__" ? null : "__none__")} className="flex items-center gap-2 text-left">
              <span className={`transition-transform ${expanded === "__none__" ? "rotate-90" : ""}`}>▶</span>
              <span className="font-bold text-amber-800">店舗未設定のイベント</span>
              <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">{orphan.length}</span>
            </button>
          </div>
          {expanded === "__none__" && (
            <div className="p-3">
              <p className="text-xs text-gray-500 mb-2">どの店舗にも紐づいていないイベントです。編集で店舗を選び直すことはできないため、削除して各店舗から登録し直してください。</p>
              {eventList(null)}
              {eventForm(null)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
