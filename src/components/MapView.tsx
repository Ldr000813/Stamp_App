"use client";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

export default function MapView({ spots }: { spots: any[] }) {
  const { t, lang } = useI18n();
  const [me, setMe] = useState<[number, number] | null>(null);
  const pts = (spots || []).filter((s) => s.lat && s.lng);
  const center: [number, number] = pts.length ? [pts[0].lat, pts[0].lng] : [35.0116, 135.7681]; // Kyoto

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setMe([p.coords.latitude, p.coords.longitude]),
        () => {}
      );
    }
  }, []);

  return (
    <MapContainer center={center} zoom={14} style={{ height: "70vh", width: "100%" }}>
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {me && (
        <Marker position={me} icon={icon}>
          <Popup>{t("current_location")}</Popup>
        </Marker>
      )}
      {pts.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={icon}>
          <Popup>
            <div style={{ minWidth: 150 }}>
              <strong>{lang === "ja" ? s.name_ja : s.name_en}</strong>
              <div style={{ marginTop: 6 }}>
                <Link href={`/spot/${s.id}`}>{t("detail")}</Link>
                {"　・　"}
                <a
                  href={
                    me
                      ? `https://www.google.com/maps/dir/?api=1&origin=${me[0]},${me[1]}&destination=${s.lat},${s.lng}`
                      : `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`
                  }
                  target="_blank" rel="noreferrer"
                >
                  {t("route")}
                </a>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
