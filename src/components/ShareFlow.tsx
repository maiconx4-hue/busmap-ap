import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, ShieldAlert, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { BusGroup, PublicRoute, Settings } from "@/hooks/useMapData";
import { formatAge, groupState } from "@/lib/freshness";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  routes: PublicRoute[];
  groups: BusGroup[];
  settings: Settings;
  initialRouteId: string | null;
  targetGroupId: string | null;
  onConfirm: (routeId: string, targetGroupId: string | null) => void;
  busy: boolean;
};

export function ShareFlow({
  open,
  onOpenChange,
  routes,
  groups,
  settings,
  initialRouteId,
  targetGroupId,
  onConfirm,
  busy,
}: Props) {
  const [routeId, setRouteId] = useState<string | null>(initialRouteId);
  const [step, setStep] = useState<"route" | "consent">(initialRouteId ? "consent" : "route");
  const [agree, setAgree] = useState(false);
  const timeout = settings.session_timeout_s ?? 60;
  const retention = settings.stale_retention_s ?? 900;
  const max = settings.max_contributors ?? 5;

  const route = routes.find((r) => r.id === routeId) ?? null;
  const context = useMemo(() => {
    if (!routeId) return null;
    const rg = groups.filter((g) => g.route_id === routeId);
    const active = rg.filter((g) => groupState(g, timeout, retention) === "ativo");
    const stale = rg.filter((g) => groupState(g, timeout, retention) === "desatualizado");
    const target = targetGroupId ? (rg.find((g) => g.id === targetGroupId) ?? null) : null;
    return { active, stale, target };
  }, [routeId, groups, targetGroupId, timeout, retention]);

  const reset = (o: boolean) => {
    if (!o) {
      setAgree(false);
      setStep(initialRouteId ? "consent" : "route");
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        {step === "route" ? (
          <>
            <DialogHeader>
              <DialogTitle>Em qual linha você está?</DialogTitle>
              <DialogDescription>
                Escolha a linha do ônibus em que você está viajando agora.
              </DialogDescription>
            </DialogHeader>
            {routes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma linha publicada ainda.</p>
            ) : (
              <div className="grid gap-2">
                {routes.map((r) => {
                  const n = groups.filter(
                    (g) => g.route_id === r.id && groupState(g, timeout, retention) === "ativo",
                  ).length;
                  return (
                    <button
                      key={r.id}
                      onClick={() => {
                        setRouteId(r.id);
                        setStep("consent");
                      }}
                      className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-primary"
                    >
                      <span
                        className="grid h-9 min-w-9 place-items-center rounded-lg px-1.5 text-xs font-bold text-primary-foreground"
                        style={{ background: r.color }}
                      >
                        {r.code}
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-semibold">{r.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {n > 0
                            ? `${n} ônibus com colaboradores agora`
                            : "Sem colaboradores agora"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {context?.target &&
                groupState(context.target, timeout, retention) === "desatualizado"
                  ? "Ajude a atualizar esta posição"
                  : context && context.active.length > 0
                    ? "Quer reforçar o acompanhamento?"
                    : "Compartilhe sua posição"}
              </DialogTitle>
              <DialogDescription>
                {route ? `Linha ${route.code} · ${route.name}` : ""}
              </DialogDescription>
            </DialogHeader>

            {context?.target &&
            groupState(context.target, timeout, retention) === "desatualizado" ? (
              <div className="flex gap-2 rounded-xl bg-muted p-3 text-sm">
                <Users className="mt-0.5 size-4 shrink-0" />
                <p>
                  A última posição conhecida deste ônibus é de{" "}
                  {formatAge(context.target.last_update)} e ninguém está atualizando. Vamos comparar
                  sua posição com ela e com o trajeto da linha. Só associaremos você a esse ônibus
                  se houver evidência geográfica suficiente; caso contrário, iniciaremos um
                  acompanhamento independente.
                </p>
              </div>
            ) : context && context.active.length > 0 ? (
              <div className="flex gap-2 rounded-xl bg-muted p-3 text-sm">
                <Users className="mt-0.5 size-4 shrink-0" />
                <p>
                  Já há colaboradores compartilhando nesta linha. Sua contribuição melhora a
                  precisão. Se estiver perto de um ônibus já acompanhado, você será agrupado a ele
                  (até {max} pessoas por ônibus).
                </p>
              </div>
            ) : null}

            <div className="space-y-2 text-sm">
              <p className="font-semibold">Como seus dados são usados</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  Sua localização é enviada a cada ~{settings.update_interval_s ?? 10}s apenas
                  enquanto você compartilhar.
                </li>
                <li>
                  No mapa aparece só a posição média do ônibus, sem seu nome ou identificador.
                </li>
                <li>
                  Coordenadas brutas são apagadas após {settings.gps_retention_h ?? 24}h. Não
                  publicamos seu histórico.
                </li>
                <li>Você pode parar a qualquer momento com um toque.</li>
                <li>
                  Proximidade não comprova que você está dentro do ônibus. Use somente se estiver de
                  fato a bordo.
                </li>
              </ul>
              <div className="flex gap-2 rounded-xl border border-warn/40 p-3 text-xs">
                <ShieldAlert className="size-4 shrink-0 text-warn" />
                <span>
                  Navegadores costumam pausar o GPS com a tela bloqueada ou o app em segundo plano.
                  Mantenha esta página aberta e a tela ligada para continuar contribuindo.
                </span>
              </div>
              <label className="flex items-start gap-2 pt-1">
                <Checkbox
                  checked={agree}
                  onCheckedChange={(v) => setAgree(v === true)}
                  className="mt-0.5"
                />
                <span>
                  Concordo em compartilhar minha localização para esta finalidade. Li a{" "}
                  <Link to="/privacidade" className="text-primary underline">
                    política de privacidade
                  </Link>
                  .
                </span>
              </label>
            </div>
            <div className="flex gap-2">
              {!initialRouteId && (
                <Button variant="outline" onClick={() => setStep("route")}>
                  Trocar linha
                </Button>
              )}
              <Button
                variant="live"
                className="flex-1"
                disabled={!agree || !routeId || busy}
                onClick={() => routeId && onConfirm(routeId, targetGroupId)}
              >
                <MapPin /> {busy ? "Obtendo GPS…" : "Permitir GPS e compartilhar"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
