import { supabase } from "@/integrations/supabase/client";

const KEY = "busmap.visitor.v1";
export type VisitorCreds = { visitor_id: string; secret: string };

/** Random device identity issued by the backend; the secret is the only proof of ownership. */
export async function ensureVisitor(): Promise<VisitorCreds> {
  let raw: string | null = null;
  try {
    raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
  } catch {
    // Storage may be unavailable in an embedded browser; continue with a fresh visitor.
  }
  if (raw) {
    try {
      const v = JSON.parse(raw) as VisitorCreds;
      if (v.visitor_id && v.secret?.length === 64) return v;
    } catch {
      /* regenerate */
    }
  }
  const { data, error } = await supabase.rpc("register_visitor");
  if (error) throw error;
  const creds = data as unknown as VisitorCreds;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(creds));
  } catch {
    // Keep credentials in memory for this page even if persistence is unavailable.
  }
  return creds;
}

export function readVisitor(): VisitorCreds | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VisitorCreds) : null;
  } catch {
    return null;
  }
}
