export type LatLng = [number, number];

export const MACAPA_CENTER: LatLng = [0.0349, -51.0694];

export function haversine(a: LatLng, b: LatLng) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function pathLength(points: LatLng[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1]!, points[i]!);
  return total;
}

export function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m)} m`;
}

export function isLatLngArray(v: unknown): v is LatLng[] {
  return (
    Array.isArray(v) &&
    v.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number"))
  );
}

/** Nearest point on a polyline to `pos` (equirectangular approx, fine for short distances). */
export function snapToPath(pos: LatLng, path: LatLng[]): LatLng {
  if (path.length === 0) return pos;
  if (path.length === 1) return path[0]!;
  const lat0 = (pos[0] * Math.PI) / 180;
  const kx = Math.cos(lat0) * 111320;
  const ky = 110540;
  const px = pos[1] * kx;
  const py = pos[0] * ky;
  let best: LatLng = path[0]!;
  let bestD = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const ax = a[1] * kx;
    const ay = a[0] * ky;
    const bx = b[1] * kx;
    const by = b[0] * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = (cx - px) ** 2 + (cy - py) ** 2;
    if (d < bestD) {
      bestD = d;
      best = [cy / ky, cx / kx];
    }
  }
  return best;
}
