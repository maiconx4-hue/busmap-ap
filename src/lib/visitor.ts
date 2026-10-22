import { supabase } from "@/integrations/supabase/client";

const KEY = "busmap.visitor.v1";
export type VisitorCreds = { visitor_id: string; secret: string };

/** Random device identity issued by the backend; the secret is the only proof of ownership. */
export async function ensureVisitor(): Promise<VisitorCreds> {
  const raw = localStorage.getItem(KEY);
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
  localStorage.setItem(KEY, JSON.stringify(creds));
  return creds;
}

export function readVisitor(): VisitorCreds | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VisitorCreds) : null;
  } catch {
    return null;
  }
}
