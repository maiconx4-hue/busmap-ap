export type GroupState = "ativo" | "desatualizado" | "expirado";

/**
 * Derives the public state of a bus group from its timestamps. Never reports
 * "ativo" when updates stopped, even if the cleanup job has not run yet.
 */
export function groupState(
  g: { status: string; last_update: string; active_contributors: number },
  timeoutS: number,
  retentionS: number,
  now = Date.now(),
): GroupState {
  const age = (now - new Date(g.last_update).getTime()) / 1000;
  if (age > retentionS) return "expirado";
  if (g.status === "active" && g.active_contributors > 0 && age <= timeoutS) return "ativo";
  return "desatualizado";
}

export function formatAge(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  return `há ${Math.floor(m / 60)} h`;
}
