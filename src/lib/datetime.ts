export const pad = (n: number) => String(n).padStart(2, "0");
const WD = ["日", "月", "火", "水", "木", "金", "土"];

// ISO -> value for <input type="datetime-local"> in the viewer's local time.
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso); if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ISO -> "9/25(金) 14:05" in local time.
export function fmtDT(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
