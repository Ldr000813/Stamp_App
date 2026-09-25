"use client";
import { useEffect, useState } from "react";
import ImageUpload from "@/components/ImageUpload";

const empty = { reward_title_ja: "", reward_title_en: "", reward_body_ja: "", reward_body_en: "", reward_image_url: "" };

export default function RewardEditor({ token }: { token: string }) {
  const [form, setForm] = useState<any>({ ...empty });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  useEffect(() => {
    (async () => {
      const c = await fetch("/api/campaign", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      const cp = c?.campaign || {};
      setForm({
        reward_title_ja: cp.reward_title_ja || "", reward_title_en: cp.reward_title_en || "",
        reward_body_ja: cp.reward_body_ja || "", reward_body_en: cp.reward_body_en || "",
        reward_image_url: cp.reward_image_url || "",
      });
      setLoading(false);
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    const r = await fetch("/api/admin/reward", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    setMsg(r.ok ? "保存しました" : "保存に失敗しました");
  }

  if (loading) return <p className="text-gray-400">読み込み中…</p>;

  return (
    <form onSubmit={save} className="bg-gray-50 p-4 rounded-lg space-y-3">
      <p className="text-sm text-gray-500">
        クリア特典（ユーザーの「特典」画面に表示される内容）です。ここは<strong>運営（管理者）のみ</strong>編集できます。
      </p>
      <div className="grid grid-cols-2 gap-2">
        <input className="border rounded p-2" placeholder="特典名（日本語）例: 記念グッズ" value={form.reward_title_ja} onChange={(e) => set("reward_title_ja", e.target.value)} />
        <input className="border rounded p-2" placeholder="Reward title (English)" value={form.reward_title_en} onChange={(e) => set("reward_title_en", e.target.value)} />
        <textarea className="border rounded p-2 col-span-2 h-28" placeholder="特典の説明・受け取り方法（日本語）" value={form.reward_body_ja} onChange={(e) => set("reward_body_ja", e.target.value)} />
        <textarea className="border rounded p-2 col-span-2 h-28" placeholder="Description / how to receive (English)" value={form.reward_body_en} onChange={(e) => set("reward_body_en", e.target.value)} />
        <div className="col-span-2">
          <label className="text-xs text-gray-500">特典の画像（任意）</label>
          <ImageUpload value={form.reward_image_url} onChange={(url) => set("reward_image_url", url)} token={token} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="rounded bg-emerald-600 text-white px-4 py-2">特典を保存</button>
        {msg && <span className={`text-sm ${msg.includes("失敗") ? "text-red-600" : "text-emerald-600"}`}>{msg}</span>}
      </div>
    </form>
  );
}
