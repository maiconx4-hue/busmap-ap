// Mirrors public.level_for_xp in the database (the database is the source of truth).
export type LevelKey = "bronze" | "prata" | "ouro" | "platina";

export const LEVELS: { key: LevelKey; name: string; title: string; min: number }[] = [
  { key: "bronze", name: "Bronze", title: "Iniciante", min: 0 },
  { key: "prata", name: "Prata", title: "Colaborador", min: 200 },
  { key: "ouro", name: "Ouro", title: "Explorador", min: 800 },
  { key: "platina", name: "Platina", title: "Embaixador", min: 2000 },
];

export function levelForXp(xp: number) {
  let idx = 0;
  LEVELS.forEach((l, i) => {
    if (xp >= l.min) idx = i;
  });
  const current = LEVELS[idx];
  const next = LEVELS[idx + 1] ?? null;
  const progress = next ? Math.min(1, (xp - current.min) / (next.min - current.min)) : 1;
  return { current, next, progress, missing: next ? next.min - xp : 0 };
}

export function levelLabel(key: string | null | undefined) {
  const l = LEVELS.find((x) => x.key === key);
  return l ? `${l.name} · ${l.title}` : "Colaborador anônimo";
}
