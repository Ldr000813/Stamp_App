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
  // 1. Resolved place-profile URL — opens the exact building page, never drifts.
  if (spot.place_url) return spot.place_url;
  // 2. Coordinates (map pin) as a directions URL.
  if (spot.lat != null && spot.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;
  }
  // 3. Address, then the raw link, then a name search.
  const addr = spot.address_ja || spot.address_en;
  if (addr) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
  if (spot.map_url) return spot.map_url;
  const name = spot.name_ja || spot.name_en;
  if (name) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
  return "#";
}
