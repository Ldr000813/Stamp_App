// Extract coordinates from a Google Maps URL/HTML. Prefers the real pin
// (!3d!4d) over the map viewport center (@lat,lng), which fixes "ずれる".
export function extractLatLng(hay: string): { lat: number; lng: number } | null {
  const m =
    hay.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/) ||
    hay.match(/[?&](?:q|ll|destination|daddr)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/) ||
    hay.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}
