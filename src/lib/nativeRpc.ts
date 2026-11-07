/** Optional, additive Web1 acknowledgement; the existing GPS protocol is unchanged. */
export type NativeRpcResult = {
  action: "PUSH_UPDATE_RESULT";
  session_id: string;
  timestamp: number;
  accepted: boolean;
  ended: boolean;
  reason: string | null;
  contributors?: number;
};

export function parseNativeRpcResult(raw: unknown): NativeRpcResult | null {
  try {
    const value: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") return null;
    const o = value as Record<string, unknown>;
    if (o['action'] !== 'PUSH_UPDATE_RESULT' || typeof o['session_id'] !== 'string' || !o['session_id']) return null;
    if (typeof o['timestamp'] !== 'number' || !Number.isFinite(o['timestamp']) || o['timestamp'] < 1e12) return null;
    if (typeof o['accepted'] !== 'boolean' || typeof o['ended'] !== 'boolean') return null;
    if (o['reason'] !== null && typeof o['reason'] !== 'string') return null;
    if (o['contributors'] !== undefined && (typeof o['contributors'] !== 'number' || !Number.isInteger(o['contributors']) || o['contributors'] < 0 || o['contributors'] > 5)) return null;
    return o as NativeRpcResult;
  } catch {
    return null;
  }
}

export function isCurrentNativeResult(result: NativeRpcResult, sessionId: string, previous: number, timeoutS: number, now: number): boolean {
  return result.session_id === sessionId && result.timestamp > previous && result.timestamp <= now && now - result.timestamp < timeoutS * 1000;
}