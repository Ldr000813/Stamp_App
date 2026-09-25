"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import QRCode from "qrcode";
import Papa from "papaparse";
import SpotEventManager from "@/components/SpotEventManager";
import RewardManager from "@/components/RewardManager";
import CouponManager from "@/components/CouponManager";
import ImageUpload from "@/components/ImageUpload";


const emptyForm = {
  name_ja: "", name_en: "", description_ja: "", description_en: "",
  address_ja: "", address_en: "", image_url: "", category: "",
  lat: "", lng: "", map_url: "", owner_email: "",
};

const SESSION_MS = 60 * 60 * 1000; // admin session lifetime: 1 hour

export default function Admin() {
  const [supabase] = useState(() => supabaseBrowser());
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<"spots" | "events" | "reward">("spots");
  const [spots, setSpots] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [hardTarget, setHardTarget] = useState<any>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [confirmInput, setConfirmInput] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  function handleLogout() {
    if (typeof window !== "undefined") localStorage.removeItem("admin_login_at");
    supabase.auth.signOut();
  }

  useEffect(() => {
    if (!session) return;
    loadSpots();
    let t = Number((typeof window !== "undefined" && localStorage.getItem("admin_login_at")) || 0);
    if (!t) { t = Date.now(); localStorage.setItem("admin_login_at", String(t)); }
    const check = () => {
      const started = Number(localStorage.getItem("admin_login_at") || 0);
      if (started && Date.now() - started >= SESSION_MS) {
        localStorage.removeItem("admin_login_at");
        supabase.auth.signOut();
        setMsg("セッションの有効期限（1時間）が切れました。再度ログインしてください。");
      }
    };
    check();
    const iv = setInterval(check, 30 * 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function authHeaders(json = false): any {
    const h: any = { Authorization: `Bearer ${session.access_token}` };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }
  async function loadSpots() {
    const res = await fetch("/api/admin/spots", { headers: authHeaders() });
    if (res.ok) setSpots((await res.json()).spots || []);
    else setMsg("読み込みに失敗しました（管理者権限を確認してください）");
  }
  async function login(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg(error.message);
    else if (typeof window !== "undefined") localStorage.setItem("admin_login_at", String(Date.now()));
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    const res = await fetch("/api/admin/spots", {
      method: editingId ? "PATCH" : "POST",
      headers: authHeaders(true),
      body: JSON.stringify(editingId ? { id: editingId, ...form } : form),
    });
    if (res.ok) { setForm({ ...emptyForm }); setEditingId(null); loadSpots(); }
    else setMsg(editingId ? "更新に失敗しました" : "追加に失敗しました");
  }
  function editItem(s: any) {
    setEditingId(s.id);
    setForm({
      name_ja: s.name_ja || "", name_en: s.name_en || "",
      description_ja: s.description_ja || "", description_en: s.description_en || "",
      address_ja: s.address_ja || "", address_en: s.address_en || "",
      image_url: s.image_url || "", category: s.category || "",
      lat: s.lat != null ? String(s.lat) : "", lng: s.lng != null ? String(s.lng) : "",
      map_url: s.map_url || "", owner_email: s.owner_email || "",
    });
    setMsg("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function cancelEdit() { setEditingId(null); setForm({ ...emptyForm }); setMsg(""); }
  async function patchSpot(id: string, fields: any) {
    const res = await fetch("/api/admin/spots", { method: "PATCH", headers: authHeaders(true), body: JSON.stringify({ id, ...fields }) });
    if (res.ok) loadSpots(); else setMsg("更新に失敗しました");
  }
  async function deleteSpot(s: any) {
    if (!confirm(`「${s.name_ja}」を削除（非表示）しますか？　参加者からは見えなくなりますが、取得済みスタンプと記録は保持されます（後で復元も可能）。`)) return;
    await patchSpot(s.id, { active: false });
  }
  async function showQR(spot: any) {
    const url = `${window.location.origin}/stamp?spot=${spot.token}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 });
    const w = window.open("");
    if (w) w.document.write(
      `<title>QR: ${spot.name_ja}</title><div style="text-align:center;font-family:sans-serif">
       <h3>${spot.name_ja} / ${spot.name_en}</h3><img src="${dataUrl}" />
       <p style="word-break:break-all">${url}</p></div>`
    );
  }
  function exportCSV() {
    const csv = Papa.unparse(spots);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "spots.csv"; a.click();
  }
  const genCode = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  function openHard(s: any) { setHardTarget(s); setConfirmCode(genCode()); setConfirmInput(""); }
  function closeHard() { setHardTarget(null); setConfirmInput(""); }
  async function doHard() {
    if (!hardTarget) return;
    const res = await fetch(`/api/admin/spots?id=${hardTarget.id}`, { method: "DELETE", headers: authHeaders() });
    closeHard();
    if (res.ok) loadSpots(); else setMsg("完全削除に失敗しました");
  }
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  if (!session) {
    return (
      <main className="mx-auto max-w-sm p-6">
        <h1 className="text-xl font-bold mb-4">管理ログイン</h1>
        <form onSubmit={login} className="space-y-3">
          <input className="w-full border rounded p-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="w-full border rounded p-2" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="w-full rounded bg-emerald-600 text-white py-2">ログイン</button>
        </form>
        {msg && <p className="text-red-600 mt-3 text-sm">{msg}</p>}
      </main>
    );
  }

  const tabCls = (on: boolean) => `px-4 py-2 rounded-full text-sm font-bold ${on ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600"}`;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">管理画面</h1>
        <div className="flex gap-2">
          <Link href="/" className="text-sm border rounded px-3 py-1">ユーザー画面へ</Link>
          <button onClick={handleLogout} className="text-sm border rounded px-3 py-1">ログアウト</button>
        </div>
      </div>

      <div className="flex gap-2 mb-5">
        <button onClick={() => setTab("spots")} className={tabCls(tab === "spots")}>スポット（場所）</button>
        <button onClick={() => setTab("events")} className={tabCls(tab === "events")}>イベント（スポット別）</button>
        <button onClick={() => setTab("reward")} className={tabCls(tab === "reward")}>クリア特典</button>
      </div>

      {tab === "spots" ? (
        <>
          <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded-lg space-y-2 mb-5">
            {editingId && (
              <div className="flex justify-between items-center text-sm text-amber-700">
                <span>編集中</span>
                <button type="button" onClick={cancelEdit} className="underline">キャンセル（新規追加に戻す）</button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input className="border rounded p-2" placeholder="名前（日本語）" value={form.name_ja} onChange={(e) => set("name_ja", e.target.value)} required />
              <input className="border rounded p-2" placeholder="Name (English)" value={form.name_en} onChange={(e) => set("name_en", e.target.value)} required />
              <textarea className="border rounded p-2 col-span-2" placeholder="説明（日本語）" value={form.description_ja} onChange={(e) => set("description_ja", e.target.value)} />
              <textarea className="border rounded p-2 col-span-2" placeholder="Description (English)" value={form.description_en} onChange={(e) => set("description_en", e.target.value)} />
              <input className="border rounded p-2" placeholder="住所（日本語）" value={form.address_ja} onChange={(e) => set("address_ja", e.target.value)} />
              <input className="border rounded p-2" placeholder="Address (English)" value={form.address_en} onChange={(e) => set("address_en", e.target.value)} />
              <ImageUpload value={form.image_url} onChange={(url) => set("image_url", url)} token={session.access_token} />
              <label className="text-xs text-gray-500 col-span-2 mt-1">場所（Googleマップのリンク）</label>
              <input className="border rounded p-2 col-span-2" placeholder="Googleマップのリンクを貼り付け（例: https://maps.app.goo.gl/...）" value={form.map_url} onChange={(e) => set("map_url", e.target.value)} />
              <label className="text-xs text-gray-500 col-span-2 mt-1">店舗オーナーのメールアドレス（任意・このメールでログインした人だけが、この店舗のイベントを編集できます）</label>
              <input className="border rounded p-2 col-span-2" type="email" placeholder="owner@example.com" value={form.owner_email} onChange={(e) => set("owner_email", e.target.value)} />
            </div>
            <button className="rounded bg-emerald-600 text-white px-4 py-2">{editingId ? "更新する" : "スポットを追加"}</button>
          </form>

          <button onClick={exportCSV} className="text-sm border rounded px-3 py-1 mb-3">CSVエクスポート</button>

          <ul className="space-y-2">
            {spots.map((s) => (
              <li key={s.id} className={`flex justify-between items-center border rounded-lg p-3 ${s.active ? "" : "bg-gray-100 opacity-70"}`}>
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    {!s.active && <span className="text-xs bg-gray-300 text-gray-700 rounded-full px-2 py-0.5">非表示中</span>}
                    {s.name_ja} <span className="text-gray-400">/ {s.name_en}</span>
                  </span>
                  <span className="text-xs text-gray-400">
                    {s.owner_email ? `オーナー: ${s.owner_email}` : "オーナー未設定（運営のみ編集可）"}
                  </span>
                </span>
                <div className="flex gap-2">
                  <button onClick={() => editItem(s)} className="text-sm border rounded px-3 py-1">編集</button>
                  <button onClick={() => showQR(s)} className="text-sm bg-gray-800 text-white rounded px-3 py-1">QR発行</button>
                  {s.active
                    ? <button onClick={() => deleteSpot(s)} className="text-sm bg-red-600 text-white rounded px-3 py-1">削除</button>
                    : <button onClick={() => patchSpot(s.id, { active: true })} className="text-sm bg-emerald-600 text-white rounded px-3 py-1">復元</button>}
                  <button onClick={() => openHard(s)} className="text-xs text-red-500 underline self-center">完全削除</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : tab === "events" ? (
        <SpotEventManager token={session.access_token} spots={spots} />
      ) : (
        <>
          <RewardManager token={session.access_token} />
          <CouponManager token={session.access_token} />
        </>
      )}

      {hardTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5">
            <h3 className="font-bold text-red-600">完全削除の確認</h3>
            <p className="text-sm text-gray-700 mt-2">
              「{hardTarget.name_ja}」を<b>完全に削除</b>します。この操作は取り消せません。（参加者の取得済みスタンプの記録は保持されます）
            </p>
            <p className="text-sm mt-3">確認のため、下のコードをそのまま入力してください：</p>
            <div className="my-2 text-center font-mono text-lg font-bold tracking-[0.3em] bg-gray-100 rounded py-2 select-all">{confirmCode}</div>
            <input className="w-full border rounded p-2 font-mono" placeholder="上のコードを入力" value={confirmInput} onChange={(e) => setConfirmInput(e.target.value)} />
            <div className="flex gap-2 mt-4">
              <button onClick={closeHard} className="flex-1 border rounded py-2">キャンセル</button>
              <button onClick={doHard} disabled={confirmInput !== confirmCode} className="flex-1 rounded py-2 text-white bg-red-600 disabled:opacity-40">完全に削除する</button>
            </div>
          </div>
        </div>
      )}

      {msg && <p className="text-red-600 mt-3 text-sm">{msg}</p>}
    </main>
  );
}
