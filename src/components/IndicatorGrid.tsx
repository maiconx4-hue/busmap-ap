import { Award, Clock, Signal, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export type Indicator = { label: string; value: string; hint?: string; tone?: "good" | "mid" | "bad" | "neutral" };

const toneClass = {
  good: "text-live",
  mid: "text-warn",
  bad: "text-destructive",
  neutral: "text-muted-foreground",
};

export function IndicatorGrid({ experience, freshness, signal, validation }: Record<"experience" | "freshness" | "signal" | "validation", Indicator>) {
  const items: [ReactNode, Indicator][] = [
    [<Award key="a" />, experience],
    [<Clock key="c" />, freshness],
    [<Signal key="s" />, signal],
    [<ShieldCheck key="v" />, validation],
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(([icon, it]) => (
        <div key={it.label} className="rounded-xl border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
            {icon}
            {it.label}
          </div>
          <div className={`mt-1 text-sm font-semibold ${toneClass[it.tone ?? "neutral"]}`}>{it.value}</div>
          {it.hint && <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{it.hint}</div>}
        </div>
      ))}
    </div>
  );
}
