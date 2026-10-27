import { createContext, createElement, useContext, type ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureVisitor, type VisitorCreds } from "@/lib/visitor";
import { errorCode, friendlyError } from "@/lib/errors";
import {
  getBridge,
  parseNativeGps,
  readWebViewString,
  sendNativeCommand,
  START_GPS,
  STOP_GPS,
  type NativeGpsPayload,
} from "@/lib/nativeGps";

export type ShareStatus =
  "idle" | "locating" | "starting" | "active" | "reconnecting" | "paused" | "ended" | "error";
export type StartResult = {
  session_id: string;
  group_id: string;
  match: "new_group" | "joined_active" | "joined_stale" | "target_mismatch";
  off_route: boolean;
  update_interval_s: number;
  timeout_s: number;
  contributors: number;
};
export type EndResult = {
  ended: boolean;
  validation?: string;
  notes?: string;
  xp?: number;
  credited?: boolean;
};

const SESSION_KEY = "busmap.session.v1";

// WebViews and privacy-restricted browsers may expose storage but reject access.
function readSessionId(): string | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_KEY) : null;
  } catch {
    return null;
  }
}

function writeSessionId(value: string): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(SESSION_KEY, value);
  } catch {
    // The active session remains in React state even when persistence is unavailable.
  }
}

function clearSessionId(): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("GPS_UNAVAILABLE"));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 5000,
    });
  });
}

export function geoErrorMessage(e: unknown) {
  if (e && typeof e === "object" && "code" in e) {
    const c = (e as GeolocationPositionError).code;
    if (c === 1)
      return "Permissão de localização negada. Libere o acesso ao GPS nas configurações do navegador.";
    if (c === 2)
      return "GPS indisponível no momento. Verifique se a localização do aparelho está ligada.";
    if (c === 3) return "O GPS demorou demais para responder. Tente em um local aberto.";
  }
  if (e instanceof Error && e.message === "GPS_NATIVE_TIMEOUT") return "O app não enviou GPS em 25 segundos. Confira LocationSensor e RunJavaScript.";
  if (e instanceof Error && e.message === "GPS_UNAVAILABLE")
    return "Este navegador não oferece GPS.";
  return friendlyError(e);
}

function useGpsShareState() {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [start, setStart] = useState<StartResult | null>(null);
  const [lastAck, setLastAck] = useState<number | null>(null);
  const [lastReject, setLastReject] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [debugPosition, setDebugPosition] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
    source: string;
  } | null>(null);
  const [contributors, setContributors] = useState(0);
  const [endResult, setEndResult] = useState<EndResult | null>(null);
  const [backgrounded, setBackgrounded] = useState(false);

  const creds = useRef<VisitorCreds | null>(null);
  const watchId = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef<GeolocationPosition | null>(null);
  const nativeMode = useRef(false);
  const nativeLatest = useRef<GeolocationPosition | null>(null);
  const nativeTimestamp = useRef(0);
  const nativeLastRaw = useRef<string | null>(null);
  const nativePoll = useRef<ReturnType<typeof setInterval> | null>(null);
  const receiveNative = useRef<(raw: unknown) => void>(() => {});
  const session = useRef<StartResult | null>(null);
  const lastAckRef = useRef<number | null>(null);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const sending = useRef(false);

  const cleanup = useCallback(() => {
    if (nativeMode.current) sendNativeCommand(STOP_GPS);
    if (nativePoll.current) clearInterval(nativePoll.current);
    nativePoll.current = null;
    nativeMode.current = false;
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
    session.current = null;
    clearSessionId();
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
      };
      if (nav.wakeLock && document.visibilityState === "visible")
        wakeLock.current = await nav.wakeLock.request("screen");
    } catch {
      /* not supported or denied */
    }
  }, []);

  const send = useCallback(async () => {
    const s = session.current;
    const c = creds.current;
    const pos = latest.current;
    if (!s || !c || sending.current) return;
    const timeoutMs = s.timeout_s * 1000;
    // Honest status: if no confirmed update within the timeout, it's not active.
    if (lastAckRef.current && Date.now() - lastAckRef.current > timeoutMs) setStatus("paused");
    if (!pos || Date.now() - pos.timestamp > s.update_interval_s * 3000) return; // no fresh fix
    sending.current = true;
    try {
      const { data, error } = await supabase.rpc("push_update", {
        p_session: s.session_id,
        p_visitor: c.visitor_id,
        p_secret: c.secret,
        p_lat: pos.coords.latitude,
        p_lng: pos.coords.longitude,
        p_accuracy: pos.coords.accuracy,
      });
      if (error) throw error;
      const r = data as {
        accepted: boolean;
        reason: string | null;
        ended?: boolean;
        contributors?: number;
      };
      if (r.ended) {
        setStatus("ended");
        setMessage(
          r.reason === "OFF_ROUTE"
            ? "Você se afastou do trajeto da linha, então o compartilhamento foi encerrado automaticamente. Obrigado por contribuir!"
            : "A sessão expirou porque as atualizações pararam por mais de " +
                s.timeout_s +
                " segundos.",
        );
        cleanup();
        return;
      }
      if (r.reason === "RATE_LIMIT") return;
      lastAckRef.current = Date.now();
      setLastAck(Date.now());
      setLastReject(r.accepted ? null : r.reason);
      if (typeof r.contributors === "number") setContributors(r.contributors);
      setStatus("active");
      setMessage(null);
    } catch (e) {
      const code = errorCode(e);
      if (code === "SESSION_ENDED" || code === "SESSION_NOT_FOUND" || code === "INVALID_VISITOR") {
        setStatus("ended");
        setMessage(friendlyError(e));
        cleanup();
      } else {
        setStatus("reconnecting");
        setMessage("Sem conexão. Tentando reenviar…");
      }
    } finally {
      sending.current = false;
    }
  }, [cleanup]);

  const begin = useCallback(
    async (routeId: string, targetGroup: string | null) => {
      setMessage(null);
      setEndResult(null);
      setLastReject(null);
      try {
        setStatus("locating");
        let pos: GeolocationPosition;
        if (getBridge()) {
          nativeMode.current = true;
          nativeLatest.current = null;
          nativeTimestamp.current = 0;
          // Ignore whatever string was left in WebViewString before this request.
          nativeLastRaw.current = readWebViewString();
          setMessage("Aguardando GPS nativo do aplicativo…");
          sendNativeCommand(START_GPS);
          if (nativePoll.current) clearInterval(nativePoll.current);
          nativePoll.current = setInterval(() => {
            const raw = readWebViewString();
            if (raw && raw !== nativeLastRaw.current) {
              nativeLastRaw.current = raw;
              receiveNative.current(raw);
            }
          }, 500);
          const deadline = Date.now() + 25000;
          while (!nativeLatest.current && Date.now() < deadline)
            await new Promise((r) => setTimeout(r, 250));
          if (!nativeLatest.current) throw new Error("GPS_NATIVE_TIMEOUT");
          pos = nativeLatest.current;
        } else {
          nativeMode.current = false;
          pos = await getPosition();
        }
        const c = await ensureVisitor();
        creds.current = c;
        latest.current = pos;
        setAccuracy(pos.coords.accuracy);
        setDebugPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: Date.now(),
          source: nativeMode.current ? "GPS nativo App Inventor" : "getCurrentPosition (WebView/navegador)",
        });
        setStatus("starting");
        const { data, error } = await supabase.rpc("start_session", {
          p_visitor: c.visitor_id,
          p_secret: c.secret,
          p_route: routeId,
          p_lat: pos.coords.latitude,
          p_lng: pos.coords.longitude,
          p_accuracy: pos.coords.accuracy,
          ...(targetGroup ? { p_target_group: targetGroup } : {}),
        });
        if (error) throw error;
        const r = data as unknown as StartResult;
        session.current = r;
        writeSessionId(r.session_id);
        setStart(r);
        setContributors(r.contributors);
        lastAckRef.current = Date.now();
        setLastAck(Date.now());
        setStatus("active");
        if (!nativeMode.current) watchId.current = navigator.geolocation.watchPosition(
          (p) => {
            latest.current = p;
            setAccuracy(p.coords.accuracy);
            setDebugPosition({
              latitude: p.coords.latitude,
              longitude: p.coords.longitude,
              accuracy: p.coords.accuracy,
              timestamp: Date.now(),
              source: "watchPosition (WebView/navegador)",
            });
          },
          (err) => setMessage(geoErrorMessage(err)),
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 },
        );
        timer.current = setInterval(send, Math.max(4, r.update_interval_s) * 1000);
        requestWakeLock();
        return r;
      } catch (e) {
        setStatus("error");
        setMessage(geoErrorMessage(e));
        cleanup();
        return null;
      }
    },
    [send, cleanup, requestWakeLock],
  );

  const stop = useCallback(async () => {
    const s = session.current;
    const c = creds.current;
    cleanup();
    setStatus("ended");
    if (!s || !c) return;
    try {
      const { data } = await supabase.rpc("end_session", {
        p_session: s.session_id,
        p_visitor: c.visitor_id,
        p_secret: c.secret,
      });
      setEndResult(data as EndResult);
    } catch {
      setMessage(
        "Coleta interrompida no aparelho. O servidor encerrará a sessão automaticamente em até 60 segundos.",
      );
    }
  }, [cleanup]);

  useEffect(() => {
    const receive = (raw: unknown) => {
      if (!nativeMode.current) return; // only while native sharing was requested
      const p = parseNativeGps(raw);
      if (!p || p.timestamp <= nativeTimestamp.current) return; // invalid or repeated
      nativeTimestamp.current = p.timestamp;
      nativeLatest.current = p;
      latest.current = p;
      setAccuracy(p.coords.accuracy);
      setDebugPosition({
        latitude: p.coords.latitude,
        longitude: p.coords.longitude,
        accuracy: p.coords.accuracy,
        timestamp: p.timestamp,
        source: "GPS nativo App Inventor",
      });
    };
    receiveNative.current = receive;
    const fn = (payload: string | NativeGpsPayload) => receive(payload);
    window.busApGpsUpdate = fn;
    return () => {
      if (window.busApGpsUpdate === fn) delete window.busApGpsUpdate;
    };
  }, []);

  // Background / visibility / connectivity handling
  useEffect(() => {
    const onVis = () => {
      const hidden = document.visibilityState === "hidden";
      setBackgrounded(hidden);
      if (!hidden && session.current) {
        requestWakeLock();
        send();
      }
    };
    const onOnline = () => session.current && send();
    const onOffline = () =>
      session.current &&
      (setStatus("reconnecting"), setMessage("Sem internet. Reenviaremos ao reconectar."));
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [send, requestWakeLock]);

  // End a session left over from a previous page load
  useEffect(() => {
    const leftover = readSessionId();
    if (leftover) {
      ensureVisitor()
        .then((c) =>
          supabase.rpc("end_session", {
            p_session: leftover,
            p_visitor: c.visitor_id,
            p_secret: c.secret,
          }),
        )
        .finally(() => clearSessionId());
    }
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setMessage(null);
    setStart(null);
    setEndResult(null);
  }, []);

  return {
    status,
    message,
    start,
    lastAck,
    lastReject,
    accuracy,
    debugPosition,
    contributors,
    endResult,
    backgrounded,
    begin,
    stop,
    reset,
  };
}

export type GpsShare = ReturnType<typeof useGpsShareState>;
const GpsShareContext = createContext<GpsShare | null>(null);

/** Mounted once in the root so sharing survives page navigation. */
export function GpsShareProvider({ children }: { children: ReactNode }) {
  const value = useGpsShareState();
  return createElement(GpsShareContext.Provider, { value }, children);
}

export function useGpsShare(): GpsShare {
  const ctx = useContext(GpsShareContext);
  if (!ctx) throw new Error("useGpsShare must be used inside GpsShareProvider");
  return ctx;
}
