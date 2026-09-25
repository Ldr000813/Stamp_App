"use client";
import { useEffect, useState } from "react";
import ImageUpload from "@/components/ImageUpload";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymdOfIso = (iso: string) => ymd(new Date(iso));
const fmtTime = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso); if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const emptyForm = { spot_id: "", title_ja: "", title_en: "", description_ja: "", description_en: "", image_url: "", starts_at: "", ends_at: "" };

export default function EventCalendar({ token, spots }: { token: string; spots: any[] }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [events, setEvents] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  async function load() {
    const r = await fetch("/api/admin/events", { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setEvents((await r.json()).events || []);
  }
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const lead = first.getDay();
  const dim = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  const todayYmd = ymd(new Date());

  function countOn(day: number) {
    const y = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(day)}`;
    return events.filter((e) => ymdOfIso(e.starts_at) === y).length;
  }
  const dayEvents = selected ? events.filter((e) => ymdOfIso(e.starts_at) === selected).sort((a, b) => a.starts_at.localeCompare(b.starts_at)) : [];

  function pickDay(day: number) {
    const y = ymd(new Date(cursor.getFullYear(), cursor.getMonth(), day));
    setSelected(y); setEditingId(null); setMsg("");
    setForm({ ...emptyForm, starts_at: `${y}T12:00` });
  }
  function editEvent(ev: any) {
    setSelected(ymdOfIso(ev.starts_at)); setEditingId(ev.id); setMsg("");
    setForm({
      spot_id: ev.spot_id || "", title_ja: ev.title_ja, title_en: ev.title_en,
      description_ja: ev.description_ja || "", description_en: ev.description_en || "",
      image_url: ev.image_url || "", starts_at: toLocalInput(ev.starts_at), ends_at: toLocalInput(ev.ends_at),
    });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    if (!form.title_ja || !form.title_en || !form.starts_at) { setMsg("イベント名(日/英)と開始日時は必須です"); return; }
    const payload = {
      spot_id: form.spot_id || null,
      title_ja: form.title_ja, title_en: form.title_en,
      description_ja: form.description_ja, description_en: form.description_en, image_url: form.image_url,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
    };
    const r = await fetch("/api/admin/events", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
    });
    if (r.ok) { setForm({ ...emptyForm, starts_at: selected ? `${selected}T12:00` : "" }); setEditingId(null); load(); }
    else setMsg("保存に失敗しました");
  }
  async function del(ev: any) {
    if (!confirm(`「${ev.title_ja}」を削除しますか？`)) return;
    const r = await fetch(`/api/admin/events?id=${ev.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) load();
  }

  const monthLabel = `${cursor.getFullYear()}年 ${cursor.getMonth() + 1}月`;
  const wd = ["日", "月", "火", "水", "木", "金", "土"];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="px-3 py-1 border rounded">‹</button>
        <span className="font-bold">{monthLabel}</span>
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="px-3 py-1 border rounded">›</button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs text-gray-500 mb-1">
        {wd.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day == null) return <div key={i} />;
          const y = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(day)}`;
          const n = countOn(day);
          const isSel = selected === y;
          const isToday = todayYmd === y;
          return (
            <button
              key={i} type="button" onClick={() => pickDay(day)}
              className={`aspect-square rounded-lg text-sm flex flex-col items-center justify-center border
                ${isSel ? "bg-emerald-600 text-white border-emerald-600" : isToday ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white"}`}
            >
              <span>{day}</span>
              {n > 0 && <span className={`text-[10px] ${isSel ? "text-white" : "text-emerald-600"}`}>●{n}</span>}
            </button>
          );
        })}
      </div>

      {!selected && <p className="text-sm text-gray-500 mt-4">日付を選ぶと、その日のイベントを追加・編集できます。</p>}

      {selected && (
        <div className="mt-4">
          <h3 className="font-bold mb-2">{selected} のイベント</h3>
          {dayEvents.length === 0 ? <p className="text-sm text-gray-400 mb-2">まだありません</p> : (
            <ul className="space-y-2 mb-3">
              {dayEvents.map((ev) => (
                <li key={ev.id} className="flex justify-between items-center border rounded p-2">
                  <span className="text-sm">
                    <span className="text-emerald-700 font-bold">{fmtTime(ev.starts_at)}</span>{" "}
                    {ev.title_ja}
                    {ev.spot?.name_ja && <span className="text-gray-400"> @ {ev.spot.name_ja}</span>}
                  </span>
                  <span className="flex gap-1">
                    <button type="button" onClick={() => editEvent(ev)} className="text-xs border rounded px-2 py-0.5">編集</button>
                    <button type="button" onClick={() => del(ev)} className="text-xs bg-red-600 text-white rounded px-2 py-0.5">削除</button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={submit} className="bg-gray-50 rounded-lg p-3 space-y-2">
            <p className="text-sm font-bold text-emerald-700">{editingId ? "イベントを編集" : "この日にイベントを追加"}</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="border rounded p-2" placeholder="イベント名（日本語）" value={form.title_ja} onChange={(e) => set("title_ja", e.target.value)} required />
              <input className="border rounded p-2" placeholder="Title (English)" value={form.title_en} onChange={(e) => set("title_en", e.target.value)} required />
              <select className="border rounded p-2 col-span-2" value={form.spot_id} onChange={(e) => set("spot_id", e.target.value)}>
                <option value="">会場（スポット）を選択 — 任意</option>
                {spots.map((s) => <option key={s.id} value={s.id}>{s.name_ja}</option>)}
              </select>
              <label className="text-xs text-gray-500">開始</label>
              <label className="text-xs text-gray-500">終了（任意）</label>
              <input type="datetime-local" className="border rounded p-2" value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} required />
              <input type="datetime-local" className="border rounded p-2" value={form.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
              <textarea className="border rounded p-2 col-span-2" placeholder="説明（日本語）" value={form.description_ja} onChange={(e) => set("description_ja", e.target.value)} />
              <textarea className="border rounded p-2 col-span-2" placeholder="Description (English)" value={form.description_en} onChange={(e) => set("description_en", e.target.value)} />
              <ImageUpload value={form.image_url} onChange={(url) => set("image_url", url)} token={token} />
            </div>
            <div className="flex gap-2">
              <button className="rounded bg-emerald-600 text-white px-4 py-2">{editingId ? "更新" : "追加"}</button>
              {editingId && <button type="button" onClick={() => { setEditingId(null); setForm({ ...emptyForm, starts_at: `${selected}T12:00` }); }} className="rounded border px-4 py-2">キャンセル</button>}
            </div>
            {msg && <p className="text-red-600 text-sm">{msg}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
