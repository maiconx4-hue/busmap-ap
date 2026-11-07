import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GpsShareProvider, useGpsShare } from "@/hooks/useGpsShare";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), ensureVisitor: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc } }));
vi.mock("@/lib/visitor", () => ({ ensureVisitor: mock.ensureVisitor }));

const session = { session_id: "session", group_id: "group", match: "new_group", off_route: false, update_interval_s: 10, timeout_s: 60, contributors: 1 };
const commands: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1790000000000);
  sessionStorage.clear();
  commands.length = 0;
  window.AppInventor = { setWebViewString: (value) => { commands.push(value); }, getWebViewString: () => "" };
  mock.ensureVisitor.mockResolvedValue({ visitor_id: "visitor", secret: "test-secret" });
  mock.rpc.mockReset();
  mock.rpc.mockImplementation(async (name: string) => ({ data: name === "start_session" ? session : name === "end_session" ? { ended: true } : { accepted: true, reason: null, contributors: 1 }, error: null }));
});
afterEach(() => {
  cleanup();
  delete window.AppInventor;
  vi.useRealTimers();
});

async function begin(result: { current: ReturnType<typeof useGpsShare> }) {
  await act(async () => {
    const promise = result.current.begin("route", null);
    window.busApGpsUpdate?.({ action: "GPS_UPDATE", latitude: -0.035, longitude: -51.07, accuracy: 10, timestamp: Date.now() });
    await vi.advanceTimersByTimeAsync(250);
    await promise;
  });
}
function respond(overrides: Record<string, unknown> = {}) {
  window.busApRpcResult?.({ action: "PUSH_UPDATE_RESULT", session_id: "session", timestamp: Date.now(), accepted: true, ended: false, reason: null, contributors: 1, ...overrides });
}

describe("Native Web1 ownership with the existing sharing provider", () => {
  it("keeps existing commands and web fallback until Web1 confirms, then avoids duplicate writes", async () => {
    const { result } = renderHook(() => useGpsShare(), { wrapper: GpsShareProvider });
    await begin(result);
    expect(commands[0]).toBe('{"action":"START_GPS"}');
    expect(JSON.parse(commands[1] ?? "{}").action).toBe("SESSION_STARTED");
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(mock.rpc.mock.calls.filter(([name]) => name === "push_update")).toHaveLength(1);
    act(() => respond({ session_id: "wrong" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(mock.rpc.mock.calls.filter(([name]) => name === "push_update")).toHaveLength(2);
    act(() => respond());
    const confirmedAt = result.current.lastAck;
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(mock.rpc.mock.calls.filter(([name]) => name === "push_update")).toHaveLength(2);
    expect(result.current.lastAck).toBe(confirmedAt);
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(result.current.status).toBe("paused");
    act(() => respond());
    expect(result.current.status).toBe("active");
    await act(async () => { await result.current.stop(); });
    expect(commands.at(-1)).toBe('{"action":"STOP_GPS"}');
    expect(mock.rpc).toHaveBeenCalledWith("end_session", { p_session: "session", p_visitor: "visitor", p_secret: "test-secret" });
    act(() => respond());
    expect(result.current.status).toBe("ended");
  });
  it("stops native collection when the server ends an off-route session", async () => {
    const { result } = renderHook(() => useGpsShare(), { wrapper: GpsShareProvider });
    await begin(result);
    act(() => respond({ accepted: false, ended: true, reason: "OFF_ROUTE" }));
    expect(result.current.status).toBe("ended");
    expect(commands.at(-1)).toBe('{"action":"STOP_GPS"}');
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(mock.rpc.mock.calls.filter(([name]) => name === "push_update")).toHaveLength(0);
  });
  it("preserves rejected readings instead of treating them as accepted", async () => {
    const { result } = renderHook(() => useGpsShare(), { wrapper: GpsShareProvider });
    await begin(result);
    act(() => respond({ accepted: false, reason: "IMPOSSIBLE_SPEED" }));
    expect(result.current.lastReject).toBe("IMPOSSIBLE_SPEED");
  });
  it("keeps normal browser geolocation and sends without any native acknowledgement", async () => {
    delete window.AppInventor;
    const fix = { coords: { latitude: -0.035, longitude: -51.07, accuracy: 10 }, timestamp: Date.now() };
    const watchPosition = vi.fn(() => 1);
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (ok: (p: unknown) => void) => ok(fix), watchPosition, clearWatch: vi.fn() } });
    const { result } = renderHook(() => useGpsShare(), { wrapper: GpsShareProvider });
    await act(async () => { await result.current.begin("route", null); });
    expect(watchPosition).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(mock.rpc.mock.calls.filter(([name]) => name === "push_update")).toHaveLength(1);
    expect(result.current.status).toBe("active");
  });
});