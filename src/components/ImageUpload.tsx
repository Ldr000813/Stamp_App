"use client";
import { useState } from "react";

export default function ImageUpload({
  value, onChange, token,
}: { value: string; onChange: (url: string) => void; token: string }) {
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setMsg("");
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/admin/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    }).then((r) => r.json()).catch(() => null);
    setUploading(false);
    if (r?.url) onChange(r.url);
    else setMsg("アップロードに失敗しました");
    e.target.value = "";
  }

  return (
    <div className="col-span-2">
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="w-16 h-16 object-cover rounded border" />
        ) : (
          <div className="w-16 h-16 rounded border bg-gray-100 flex items-center justify-center text-xl text-gray-400">📷</div>
        )}
        <label className="text-sm border rounded px-3 py-2 cursor-pointer bg-white hover:bg-gray-50">
          {uploading ? "アップロード中..." : "画像を選択"}
          <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={uploading} />
        </label>
        {value && <button type="button" onClick={() => onChange("")} className="text-xs text-red-600 underline">削除</button>}
      </div>
      {msg && <p className="text-xs text-red-600 mt-1">{msg}</p>}
    </div>
  );
}
