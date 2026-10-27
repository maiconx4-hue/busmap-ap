import { describe, expect, it } from "vitest";
import { parseNativeGps, START_GPS, STOP_GPS } from "@/lib/nativeGps";

const ok = { action: "GPS_UPDATE", latitude: -0.035, longitude: -51.07, accuracy: 10, timestamp: 1790000000000 };

describe("App Inventor protocol", () => {
  it("control commands use the action field", () => {
    expect(START_GPS).toBe('{"action":"START_GPS"}');
    expect(STOP_GPS).toBe('{"action":"STOP_GPS"}');
  });
  it("parses a valid GPS_UPDATE string with all five fields", () => {
    const p = parseNativeGps(JSON.stringify(ok))!;
    expect(p.coords.latitude).toBe(-0.035);
    expect(p.coords.longitude).toBe(-51.07);
    expect(p.coords.accuracy).toBe(10);
    expect(p.timestamp).toBe(1790000000000);
  });
  it("rejects wrong action", () => expect(parseNativeGps({ ...ok, action: "GPS_START" })).toBeNull());
  it("rejects out-of-range latitude", () => expect(parseNativeGps({ ...ok, latitude: 91 })).toBeNull());
  it("rejects out-of-range longitude", () => expect(parseNativeGps({ ...ok, longitude: -181 })).toBeNull());
  it("rejects negative accuracy", () => expect(parseNativeGps({ ...ok, accuracy: -1 })).toBeNull());
  it("rejects timestamp in seconds", () => expect(parseNativeGps({ ...ok, timestamp: 1790000000 })).toBeNull());
  it("rejects non-JSON strings", () => expect(parseNativeGps("START_GPS")).toBeNull());
});
