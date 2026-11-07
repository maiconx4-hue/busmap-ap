import { describe, expect, it } from "vitest";
import { isCurrentNativeResult, parseNativeRpcResult } from "@/lib/nativeRpc";

const now = 1790000000000;
const result = { action: "PUSH_UPDATE_RESULT" as const, session_id: "s", timestamp: now, accepted: true, ended: false, reason: null, contributors: 1 };

describe("Optional native RPC acknowledgement", () => {
  it("parses the response independently of the fixed GPS payload", () => {
    expect(parseNativeRpcResult(JSON.stringify(result))).toEqual(result);
    expect(parseNativeRpcResult({ action: "GPS_UPDATE" })).toBeNull();
  });
  it("requires actual booleans and milliseconds", () => {
    expect(parseNativeRpcResult({ ...result, accepted: "true" })).toBeNull();
    expect(parseNativeRpcResult({ ...result, timestamp: now / 1000 })).toBeNull();
  });
  it("does not confirm another session or replay an old result", () => {
    expect(isCurrentNativeResult(result, "other", 0, 60, now)).toBe(false);
    expect(isCurrentNativeResult(result, "s", now, 60, now)).toBe(false);
  });
  it("uses the configured timeout without keeping stale acknowledgements active", () => {
    expect(isCurrentNativeResult(result, "s", 0, 60, now + 59999)).toBe(true);
    expect(isCurrentNativeResult(result, "s", 0, 60, now + 60000)).toBe(false);
    expect(isCurrentNativeResult(result, "s", 0, 120, now + 60000)).toBe(true);
    expect(isCurrentNativeResult(result, "s", 0, 60, now - 1)).toBe(false);
  });
  it("never accepts a contributor count above five", () => {
    expect(parseNativeRpcResult({ ...result, contributors: 5 })).not.toBeNull();
    expect(parseNativeRpcResult({ ...result, contributors: 6 })).toBeNull();
  });
});