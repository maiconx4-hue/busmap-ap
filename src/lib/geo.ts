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
