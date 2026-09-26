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
import { Button, TextInput, TextArea, Field, Card, Segmented, Badge } from "@/components/ui";


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
  const [qrModal, setQrModal] = useState<any>(null);

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
    setQrModal({ name_ja: spot.name_ja, name_en: spot.name_en, dataUrl, url });
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
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-sm p-6">
          <h1 className="text-lg font-bold text-slate-800">管理ログイン</h1>
          <p className="text-sm text-slate-400 mb-5">運営メンバー専用の管理画面です。</p>
          <form onSubmit={login} className="space-y-3">
            <Field label="メールアドレス">
              <TextInput placeholder="admin@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="パスワード">
              <TextInput type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button className="w-full" type="submit">ログイン</Button>
          </form>
          {msg && <p className="text-rose-600 mt-3 text-sm">{msg}</p>}
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-800">管理画面</h1>
            <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">スポット・イベント・特典の管理</p>
          </div>
          <div className="flex gap-2">
            <Link href="/"><Button variant="secondary" size="sm">ユーザー画面へ</Button></Link>
            <Button onClick={handleLogout} variant="ghost" size="sm">ログアウト</Button>
          </div>
        </div>

        <div className="mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
          <Segmented
            value={tab}
            onChange={(v) => setTab(v as typeof tab)}
            options={[
              { value: "spots", label: "スポット（場所）" },
              { value: "events", label: "イベント（スポット別）" },
              { value: "reward", label: "クリア特典" },
            ]}
          />
        </div>

      {tab === "spots" ? (
        <>
          <Card className="p-4 sm:p-5 mb-5">
            {editingId && (
              <div className="flex justify-between items-center text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                <span>編集中</span>
                <button type="button" onClick={cancelEdit} className="underline font-medium">キャンセル（新規追加に戻す）</button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <Field label="名前（日本語）"><TextInput placeholder="例: ランドリーカフェ" value={form.name_ja} onChange={(e) => set("name_ja", e.target.value)} required /></Field>
              <Field label="Name (English)"><TextInput placeholder="Laundry Cafe" value={form.name_en} onChange={(e) => set("name_en", e.target.value)} required /></Field>
              <Field label="説明（日本語）" className="sm:col-span-2"><TextArea placeholder="お店の紹介など" value={form.description_ja} onChange={(e) => set("description_ja", e.target.value)} /></Field>
              <Field label="Description (English)" className="sm:col-span-2"><TextArea value={form.description_en} onChange={(e) => set("description_en", e.target.value)} /></Field>
              <Field label="住所（日本語）"><TextInput value={form.address_ja} onChange={(e) => set("address_ja", e.target.value)} /></Field>
              <Field label="Address (English)"><TextInput value={form.address_en} onChange={(e) => set("address_en", e.target.value)} /></Field>
              <Field label="画像" className="sm:col-span-2"><ImageUpload value={form.image_url} onChange={(url) => set("image_url", url)} token={session.access_token} /></Field>
              <Field label="場所（Googleマップのリンク）" className="sm:col-span-2">
                <TextInput placeholder="https://maps.app.goo.gl/..." value={form.map_url} onChange={(e) => set("map_url", e.target.value)} />
              </Field>
              <Field label="店舗オーナーのメールアドレス（任意）" hint="このメールでログインした人だけが、この店舗のイベントを編集できます。" className="sm:col-span-2">
                <TextInput type="email" placeholder="owner@example.com" value={form.owner_email} onChange={(e) => set("owner_email", e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit">{editingId ? "更新する" : "＋ スポットを追加"}</Button>
              </div>
            </form>
          </Card>

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-600">登録済みスポット <span className="text-slate-400">({spots.length})</span></h2>
            <Button onClick={exportCSV} variant="secondary" size="sm">CSVエクスポート</Button>
          </div>

          <div className="space-y-2.5">
            {spots.map((s) => (
              <Card key={s.id} className={`p-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${s.active ? "" : "opacity-60"}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {!s.active && <Badge tone="slate">非表示中</Badge>}
                    <span className="font-semibold text-slate-800">{s.name_ja}</span>
                    <span className="text-slate-400 text-sm">/ {s.name_en}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {s.owner_email ? `オーナー: ${s.owner_email}` : "オーナー未設定（運営のみ編集可）"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button onClick={() => editItem(s)} variant="secondary" size="sm">編集</Button>
                  <Button onClick={() => showQR(s)} variant="dark" size="sm">QR発行</Button>
                  {s.active
                    ? <Button onClick={() => deleteSpot(s)} variant="secondary" size="sm" className="text-rose-600 border-rose-200 hover:bg-rose-50">削除</Button>
                    : <Button onClick={() => patchSpot(s.id, { active: true })} variant="primary" size="sm">復元</Button>}
                  <button onClick={() => openHard(s)} className="text-xs text-rose-500 hover:text-rose-700 underline underline-offset-2 px-1">完全削除</button>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : tab === "events" ? (
        <SpotEventManager token={session.access_token} spots={spots} />
      ) : (
        <>
          <RewardManager token={session.access_token} />
          <CouponManager token={session.access_token} />
        </>
      )}

        {msg && <p className="text-rose-600 mt-4 text-sm">{msg}</p>}
      </div>

      {hardTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="max-w-sm w-full p-5">
            <h3 className="font-bold text-rose-600">完全削除の確認</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              「{hardTarget.name_ja}」を<b>完全に削除</b>します。この操作は取り消せません。（参加者の取得済みスタンプの記録は保持されます）
            </p>
            <p className="text-sm text-slate-600 mt-3">確認のため、下のコードをそのまま入力してください：</p>
            <div className="my-2 text-center font-mono text-lg font-bold tracking-[0.3em] bg-slate-100 text-slate-800 rounded-lg py-2 select-all">{confirmCode}</div>
            <TextInput className="font-mono" placeholder="上のコードを入力" value={confirmInput} onChange={(e) => setConfirmInput(e.target.value)} />
            <div className="flex gap-2 mt-4">
              <Button onClick={closeHard} variant="secondary" className="flex-1">キャンセル</Button>
              <Button onClick={doHard} disabled={confirmInput !== confirmCode} variant="danger" className="flex-1">完全に削除する</Button>
            </div>
          </Card>
        </div>
      )}

      {qrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setQrModal(null)}>
          <Card className="max-w-xs w-full p-5 text-center" >
            <div onClick={(e) => e.stopPropagation()}>
              <h3 className="font-bold text-slate-800">{qrModal.name_ja}</h3>
              <p className="text-xs text-slate-400 mb-3">{qrModal.name_en}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrModal.dataUrl} alt="QR" className="w-full max-w-[240px] mx-auto rounded-lg border border-slate-100" />
              <p className="text-[10px] text-slate-400 break-all mt-2">{qrModal.url}</p>
              <div className="mt-4 flex gap-2">
                <a href={qrModal.dataUrl} download={`qr-${qrModal.name_ja}.png`} className="flex-1"><Button variant="secondary" className="w-full">画像を保存</Button></a>
                <Button onClick={() => setQrModal(null)} className="flex-1">閉じる</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
