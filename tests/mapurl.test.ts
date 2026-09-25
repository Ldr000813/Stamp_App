import { describe, it, expect } from "vitest";
import { extractLatLng } from "@/lib/mapurl";

describe("extractLatLng — Google Maps coordinate parsing", () => {
  it("prefers the real pin (!3d!4d) over the map center (@)", () => {
    const hay = "https://www.google.com/maps/place/x/@34.900,135.700,17z/data=!3d34.985!4d135.758";
    expect(extractLatLng(hay)).toEqual({ lat: 34.985, lng: 135.758 });
  });
  it("falls back to @lat,lng when no pin is present", () => {
    expect(extractLatLng("https://maps/@35.011,135.768,17z")).toEqual({ lat: 35.011, lng: 135.768 });
  });
  it("reads q= / ll= style params", () => {
    expect(extractLatLng("https://maps?q=34.5,135.5")).toEqual({ lat: 34.5, lng: 135.5 });
  });
  it("returns null when there are no coordinates (e.g. a short link)", () => {
    expect(extractLatLng("https://maps.app.goo.gl/abc123")).toBeNull();
  });
});
