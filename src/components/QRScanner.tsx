"use client";
import { useEffect, useRef, useState } from "react";

// In-app QR scanner (camera). Reads a spot QR and returns its token.
export default function QRScanner({
  onDetect, onClose, lang,
}: { onDetect: (spotToken: string) => void; onClose: () => void; lang: "ja" | "en" }) {
  const [err, setErr] = useState("");
  const scannerRef = useRef<any>(null);
  const doneRef = useRef(false);

  function parseToken(text: string): string | null {
    try { const u = new URL(text); const s = u.searchParams.get("spot"); if (s) return s; } catch { /* not a url */ }
    if (/^[A-Za-z0-9_-]{6,}$/.test(text.trim())) return text.trim();
    return null;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode("qr-reader");
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text: string) => {
            if (doneRef.current) return;
            const token = parseToken(text);
            if (!token) { setErr(lang === "ja" ? "このQRは対象外です" : "Not a valid spot QR"); return; }
            doneRef.current = true;
            scanner.stop().catch(() => {});
            onDetect(token);
          },
          () => {}
        );
      } catch {
        if (!cancelled) setErr(lang === "ja" ? "カメラを起動できませんでした（ブラウザのカメラ許可をご確認ください）" : "Could not start the camera. Check camera permission.");
      }
    })();
    return () => { cancelled = true; try { scannerRef.current?.stop?.().catch(() => {}); } catch { /* noop */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() { try { scannerRef.current?.stop?.().catch(() => {}); } catch { /* noop */ } onClose(); }

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xs">
        <div id="qr-reader" className="w-full aspect-square rounded-2xl overflow-hidden bg-black" />
        <p className="text-white/90 text-center text-sm mt-3">
          {err || (lang === "ja" ? "スポットのQRコードを枠に合わせてください" : "Point at the spot's QR code")}
        </p>
        <button onClick={close} className="mt-4 w-full rounded-full bg-white text-[#4b4640] font-bold py-2.5">
          {lang === "ja" ? "閉じる" : "Close"}
        </button>
      </div>
    </div>
  );
}
