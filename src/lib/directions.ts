// Build a Google Maps directions URL that opens reliably on ANY device.
// Preference order:
//   1. resolved coordinates  -> official "Maps URLs" directions (always opens in app or browser)
//   2. address               -> directions by address text
//   3. the admin's raw link   -> only if we have nothing better
//   4. the spot name          -> a map search as a last resort
// The coordinate form is Google's documented universal format, which avoids the
// "サポートされていないリンク / このリンクは Google マップで開けません" error that some
// maps.app.goo.gl share links trigger when handed straight to the Maps app.
export function directionsUrl(spot: any): string {
  if (!spot) return "#";
  // Route through /api/go, which resolves the admin's share link on the fly to the
  // exact place-profile URL (opens reliably, shows the building, never drifts).
  if (spot.id) return `/api/go?spot=${spot.id}`;
  // Fallbacks when we don't have an id (shouldn't normally happen).
  if (spot.lat != null && spot.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
  }
  if (spot.map_url) return spot.map_url;
  const name = spot.name_ja || spot.name_en;
  if (name) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
  return "#";
}
