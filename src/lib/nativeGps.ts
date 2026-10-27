// MIT App Inventor bridge (WebViewer1.WebViewString). Protocol is fixed by the Android app:
// Web → Android: {"action":"START_GPS"} / {"action":"STOP_GPS"}
// Android → Web: {"action":"GPS_UPDATE","latitude","longitude","accuracy"(m),"timestamp"(ms)}

export type NativeGpsPayload = {
  action: "GPS_UPDATE";
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

type AppInventorBridge = {
  setWebViewString?: (v: string) => void;
  getWebViewString?: () => string;
};

declare global {
  interface Window {
    AppInventor?: AppInventorBridge;
    busApGpsUpdate?: (payload: string | NativeGpsPayload) => void;
  }
}

export const START_GPS = JSON.stringify({ action: "START_GPS" });
export const STOP_GPS = JSON.stringify({ action: "STOP_GPS" });

export function getBridge(): AppInventorBridge | null {
  if (typeof window === "undefined") return null;
  const ai = window.AppInventor;
  return ai && typeof ai.setWebViewString === "function" ? ai : null;
}

export function sendNativeCommand(cmd: string): boolean {
  try {
    const ai = getBridge();
    if (!ai) return false;
    ai.setWebViewString!(cmd);
    return true;
  } catch {
    return false;
  }
}

export function readWebViewString(): string | null {
  try {
    const v = getBridge()?.getWebViewString?.();
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Returns a GeolocationPosition-like object, or null if the message is not a valid GPS_UPDATE. */
export function parseNativeGps(raw: unknown): GeolocationPosition | null {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!v || typeof v !== "object" || (v as { action?: unknown }).action !== "GPS_UPDATE") return null;
    const o = v as Record<string, unknown>;
    const num = (x: unknown) => (typeof x === "number" ? x : typeof x === "string" && x.trim() ? Number(x) : NaN);
    const latitude = num(o["latitude"]);
    const longitude = num(o["longitude"]);
    const accuracy = num(o["accuracy"]);
    const timestamp = num(o["timestamp"]);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
    if (latitude === 0 && longitude === 0) return null;
    if (!Number.isFinite(accuracy) || accuracy < 0) return null;
    // Milliseconds since epoch: reject seconds-based values (< year 2001 in ms).
    if (!Number.isFinite(timestamp) || timestamp < 1e12) return null;
    return {
      coords: { latitude, longitude, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
      timestamp,
    } as GeolocationPosition;
  } catch {
    return null;
  }
}
