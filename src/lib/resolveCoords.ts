import { extractLatLng } from "@/lib/mapurl";

// Server-only: follow a Google Maps share link and return the ACTUAL pin
// coordinates (prefers the !3d!4d pin over the @-center, so it never drifts).
export async function resolveCoords(mapUrl: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(mapUrl, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36" },
    });
    let finalUrl = res.url || "";
    if (finalUrl.includes("consent.google")) {
      try { const c = new URL(finalUrl).searchParams.get("continue"); if (c) finalUrl = decodeURIComponent(c); } catch { /* ignore */ }
    }
    const body = await res.text().catch(() => "");
    return extractLatLng(finalUrl + " " + body);
  } catch {
    return null;
  }
}
