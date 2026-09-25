"use client";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41],
});

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { if (lat && lng) map.setView([lat, lng], 16); }, [lat, lng, map]);
  return null;
}

function parseLatLng(text: string): [number, number] | null {
  const t = text.trim();
  const m =
    t.match(/^(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/) ||
    t.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/) ||
    t.match(/[?&](?:q|ll|destination|daddr)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/) ||
    t.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2])];
  return null;
}

export default function LocationPicker({
  lat, lng, onChange, mapUrl = "", onMapUrl,
}: {
  lat: string; lng: string;
  onChange: (lat: string, lng: string) => void;
  mapUrl?: string;
  onMapUrl?: (v: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState("");
  const hasPoint = lat !== "" && lng !== "";
  const center: [number, number] = hasPoint ? [Number(lat), Number(lng)] : [35.0116, 135.7681];

  async function search() {
    if (!q.trim()) return;
    setSearching(true);
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => ({ results: [] }));
    setSearching(false);
    setResults(r.results || []);
    if (r.results && r.results[0]) onChange(String(r.results[0].lat), String(r.results[0].lng));
  }

  async function handlePaste(v: string) {
    onMapUrl?.(v);
    setNote("");
    const p = parseLatLng(v);
    if (p) { onChange(String(p[0]), String(p[1])); setNote("座標を読み取りました"); return; }
    if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/.test(v.trim())) {
      setNote("短縮リンクを展開中...");
      const r = await fetch(`/api/resolve?url=${encodeURIComponent(v.trim())}`).then((r) => r.json()).catch(() => null);
      if (r && r.lat && r.lng) { onChange(String(r.lat), String(r.lng)); setNote("リンクから座標を取得しました"); }
      else setNote("このリンクからは座標を取得できませんでした。地図のピンをドラッグしてください。");
    }
  }

  return (
    <div className="col-span-2 border rounded p-2 bg-white space-y-2">
      <div className="flex gap-2">
        <input
          className="border rounded p-2 flex-1 text-sm"
          placeholder="住所・店名で検索（例：京田辺市 ローソン河原北口店）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
        />
        <button type="button" onClick={search} className="rounded bg-gray-800 text-white px-3 text-sm">
          {searching ? "..." : "検索"}
        </button>
      </div>

      <input
        className="border rounded p-2 w-full text-sm"
        placeholder="または Googleマップのリンク / 座標を貼り付け"
        value={mapUrl}
        onChange={(e) => handlePaste(e.target.value)}
      />
      {note && <p className="text-xs text-emerald-700">{note}</p>}

      {results.length > 1 && (
        <ul className="text-sm max-h-32 overflow-auto border rounded p-1 bg-gray-50">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="text-left text-blue-600 underline py-0.5 w-full"
                onClick={() => { onChange(String(r.lat), String(r.lng)); setResults([]); }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded overflow-hidden" style={{ height: 200 }}>
        <MapContainer center={center} zoom={hasPoint ? 16 : 13} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          <Recenter lat={Number(lat) || 0} lng={Number(lng) || 0} />
          {hasPoint && (
            <Marker
              position={[Number(lat), Number(lng)]}
              icon={icon}
              draggable
              eventHandlers={{
                dragend: (e: any) => { const p = e.target.getLatLng(); onChange(String(p.lat), String(p.lng)); },
              }}
            />
          )}
        </MapContainer>
      </div>
      <p className="text-xs text-gray-500">
        検索・貼り付けでピンが自動配置。ピンをドラッグで微調整も可。（緯度 {lat || "-"} / 経度 {lng || "-"}）
      </p>
    </div>
  );
}
