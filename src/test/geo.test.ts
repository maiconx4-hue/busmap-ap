import { describe, expect, it } from "vitest";
import { haversine, snapToPath, type LatLng } from "@/lib/geo";

// Simple east-west segment around Macapá: 1 km long at lat 0.03
const SEG: LatLng[] = [
  [0.03, -51.07],
  [0.03, -51.06],
];

describe("snapToPath", () => {
  it("snaps a point beside the segment onto the segment", () => {
    // ~100 m north of the middle of the segment
    const p: LatLng = [0.0309, -51.065];
    const s = snapToPath(p, SEG);
    expect(s[1]).toBeCloseTo(-51.065, 5);
    expect(s[0]).toBeCloseTo(0.03, 4);
    expect(haversine(p, s)).toBeLessThan(110);
  });

  it("returns the closest endpoint when beyond the segment end", () => {
    const s = snapToPath([0.03, -51.05], SEG);
    expect(s[0]).toBeCloseTo(0.03, 6);
    expect(s[1]).toBeCloseTo(-51.06, 6);
  });

  it("returns the point itself for an empty path", () => {
    const p: LatLng = [0.03, -51.07];
    expect(snapToPath(p, [])).toEqual(p);
  });
});
