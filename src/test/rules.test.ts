import { describe, expect, it } from "vitest";
import { levelForXp } from "@/lib/levels";
import { groupState } from "@/lib/freshness";
import { haversine, pathLength } from "@/lib/geo";

describe("níveis", () => {
  it("Bronze abaixo de 200 XP", () => expect(levelForXp(199).current.key).toBe("bronze"));
  it("Prata a partir de 200 XP", () => expect(levelForXp(200).current.key).toBe("prata"));
  it("Ouro a partir de 800 XP", () => expect(levelForXp(800).current.key).toBe("ouro"));
  it("Platina a partir de 2000 XP, sem próximo nível", () => {
    const l = levelForXp(2500);
    expect(l.current.key).toBe("platina");
    expect(l.next).toBeNull();
  });
  it("progresso até o próximo nível", () => expect(levelForXp(500).progress).toBeCloseTo(0.5));
});

describe("atualidade das posições", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");
  const at = (s: number) => new Date(now - s * 1000).toISOString();
  it("ativo com atualização há 30s", () =>
    expect(groupState({ status: "active", last_update: at(30), active_contributors: 2 }, 60, 900, now)).toBe("ativo"));
  it("nunca ativo após 60s sem atualização, mesmo com status active", () =>
    expect(groupState({ status: "active", last_update: at(61), active_contributors: 2 }, 60, 900, now)).toBe("desatualizado"));
  it("desatualizado sem colaboradores", () =>
    expect(groupState({ status: "stale", last_update: at(10), active_contributors: 0 }, 60, 900, now)).toBe("desatualizado"));
  it("expirado após a retenção", () =>
    expect(groupState({ status: "stale", last_update: at(901), active_contributors: 0 }, 60, 900, now)).toBe("expirado"));
});

describe("geo", () => {
  it("haversine ~1,11 km por 0,01° de latitude", () => expect(haversine([0, -51], [0.01, -51])).toBeCloseTo(1112, -1));
  it("comprimento do traçado soma segmentos", () =>
    expect(pathLength([[0, -51], [0.01, -51], [0.02, -51]])).toBeCloseTo(2224, -1));
});
