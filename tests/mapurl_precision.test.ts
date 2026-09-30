import { describe, it, expect } from "vitest";
import { extractLatLng } from "@/lib/mapurl";

// 最終チェック — 座標抽出の精密テスト（「@中心にずれる=亀岡ドリフト」バグ系の砦）
// 実行:  npm test    または  npx vitest run tests/mapurl_precision.test.ts
// すべて純粋関数・ネットワーク不要の決定的テスト。

describe("extractLatLng — ピン精度と優先順位（ずれ防止）", () => {
  it("A1 @中心が遠くにあっても、実ピン(!3d!4d)を優先する（亀岡ドリフト再現）", () => {
    // 中心は北西にずれた地点、実ピンは正しい建物
    const hay =
      "https://www.google.com/maps/place/Store/@35.020,135.650,15z/data=!4m6!3m5!1s0x0:0x0!8m2!3d34.9912!4d135.7331";
    expect(extractLatLng(hay)).toEqual({ lat: 34.9912, lng: 135.7331 });
  });

  it("A2 実ピンが本文(HTML)の奥にあっても拾い、@中心より優先する", () => {
    // HTML blob の奥に @中心と実ピンが混在 → 実ピンを返す
    const hay =
      "prefix noise @35.0,135.6 noise data=!3d34.98533!4d135.75884 tail";
    expect(extractLatLng(hay)).toEqual({ lat: 34.98533, lng: 135.75884 });
    // 参考: !3d と !4d が空白で分断されているとピンとして一致せず、他に座標が無ければ null
    const broken =
      "https://maps.google.com/?cid=123 junk !3d34.98533 !4d135.75884 more junk";
    expect(extractLatLng(broken)).toBeNull();
  });

  it("A3 q= の座標は @中心より優先される", () => {
    const hay = "https://www.google.com/maps?q=34.700,135.500&somewhere/@35.0,135.0,12z";
    expect(extractLatLng(hay)).toEqual({ lat: 34.7, lng: 135.5 });
  });

  it("A4 経路リンク destination= を解釈する", () => {
    const hay = "https://www.google.com/maps/dir/?api=1&destination=34.7551,135.5000";
    expect(extractLatLng(hay)).toEqual({ lat: 34.7551, lng: 135.5 });
  });

  it("A5 daddr= を解釈する", () => {
    const hay = "https://maps.google.com/?saddr=A&daddr=34.60,135.49";
    expect(extractLatLng(hay)).toEqual({ lat: 34.6, lng: 135.49 });
  });

  it("A6 ll= を解釈する", () => {
    const hay = "https://maps.google.com/?ll=34.91,135.77&z=16";
    expect(extractLatLng(hay)).toEqual({ lat: 34.91, lng: 135.77 });
  });
});

describe("extractLatLng — 数値の範囲・境界", () => {
  it("B1 負の座標（南半球・西半球）を扱える", () => {
    expect(extractLatLng("x/@0,0/data=!3d-33.8688!4d151.2093")).toEqual({ lat: -33.8688, lng: 151.2093 });
  });

  it("B2 経度が3桁（例: 151.xxxx）でも欠けない", () => {
    expect(extractLatLng("!3d35.0000!4d139.7000")).toEqual({ lat: 35.0, lng: 139.7 });
    expect(extractLatLng("@-45.1234,170.5678,10z")).toEqual({ lat: -45.1234, lng: 170.5678 });
  });

  it("B3 高精度の小数を保持する", () => {
    expect(extractLatLng("!3d34.9876543!4d135.7654321")).toEqual({ lat: 34.9876543, lng: 135.7654321 });
  });

  it("B4 小数点の無い整数座標(@35,135)はピンとみなさず null", () => {
    expect(extractLatLng("https://maps/@35,135,17z")).toBeNull();
  });
});

describe("extractLatLng — フォールバックと異常系", () => {
  it("C1 ピンが無ければ @中心にフォールバックする", () => {
    expect(extractLatLng("https://www.google.com/maps/@34.9858,135.7588,17z")).toEqual({ lat: 34.9858, lng: 135.7588 });
  });

  it("C2 座標が全く無い短縮リンクは null", () => {
    expect(extractLatLng("https://maps.app.goo.gl/AbCdEf123")).toBeNull();
    expect(extractLatLng("")).toBeNull();
    expect(extractLatLng("just some text without coordinates")).toBeNull();
  });

  it("C3 複数のピンがある場合は最初のピンを返す（決定的）", () => {
    const hay = "data=!3d34.111!4d135.111 ... other=!3d35.999!4d136.999";
    expect(extractLatLng(hay)).toEqual({ lat: 34.111, lng: 135.111 });
  });

  it("C4 実際に近いフルURL（中心と実ピンが別）でピンを返す", () => {
    const hay =
      "https://www.google.com/maps/place/%E3%83%A9%E3%83%B3%E3%83%89%E3%83%AA%E3%83%BC%E3%82%AB%E3%83%95%E3%82%A7/@34.9701,135.6571,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d34.9701!4d135.7333";
    // 以前ここで @の135.6571（山側）を拾ってズレていた。ピンの135.7333が正。
    expect(extractLatLng(hay)).toEqual({ lat: 34.9701, lng: 135.7333 });
  });
});
