import { Suspense, lazy, useMemo, useState } from "react";
import { ClientOnly, Link, createFileRoute } from "@tanstack/react-router";
import { Bus, Crosshair, Info, LocateFixed, Radio, Settings, Square, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMapData, type BusGroup } from "@/hooks/useMapData";
import { useGpsShare } from "@/hooks/useGpsShare";
import { useAuth } from "@/hooks/useAuth";
import { formatAge, groupState } from "@/lib/freshness";
import { formatDistance, haversine, isLatLngArray, snapToPath, type LatLng } from "@/lib/geo";
import { levelLabel } from "@/lib/levels";
import { ShareFlow } from "@/components/ShareFlow";
import { IndicatorGrid } from "@/components/IndicatorGrid";
import { friendlyError } from "@/lib/errors";

const BusMap = lazy(() => import("@/components/map/BusMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bus AP — ônibus colaborativo em tempo real" },
      {
        name: "description",
        content:
          "Veja rotas e posições colaborativas de ônibus em Macapá, compartilhadas voluntariamente por passageiros.",
      },
      { property: "og:title", content: "Bus AP" },
      {
        property: "og:description",
        content: "Rotas e posições colaborativas de ônibus em Macapá, em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const MATCH_TEXT: Record<string, string> = {
  new_group: "Você iniciou um novo acompanhamento nesta linha.",
  joined_active: "Sua posição foi agrupada a um ônibus já acompanhado por outros colaboradores.",
  joined_stale:
    "Sua posição é compatível com a última posição conhecida; você está atualizando esse ônibus.",
  target_mismatch:
    "Sua posição não é compatível com a última posição conhecida. Iniciamos um acompanhamento independente.",
};

function Index() {
  const { routes, groups, settings, loading, error, live } = useMapData();
  const { user, isAdmin } = useAuth();
  const share = useGpsShare();
  const [routeFilter, setRouteFilter] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCtx, setShareCtx] = useState<{ route: string | null; group: string | null }>({
    route: null,
    group: null,
  });
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [focus, setFocus] = useState<{ pos: LatLng; zoom: number; key: number } | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);

  const timeout = settings["session_timeout_s"] ?? 60;
  const retention = settings["stale_retention_s"] ?? 900;
  const routeById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);
  const now = Date.now();
  const visibleGroups = groups
    .filter((g) => routeById.has(g.route_id))
    .map((g) => ({ ...g, state: groupState(g, timeout, retention, now) }))
    .filter((g) => g.state !== "expirado");
  const activeCount = visibleGroups
    .filter((g) => g.state === "ativo")
    .reduce((s, g) => s + g.active_contributors, 0);
  const activeBuses = visibleGroups.filter((g) => g.state === "ativo").length;
  const sharing = ["locating", "starting", "active", "reconnecting", "paused"].includes(
    share.status,
  );

  const group = visibleGroups.find((g) => g.id === selectedGroup) ?? null;
  const routeDetail = routeById.get(selectedRoute ?? "") ?? null;

  const locate = () => {
    setLocMsg(null);
    if (!("geolocation" in navigator)) return setLocMsg("Este navegador não oferece localização.");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos: LatLng = [p.coords.latitude, p.coords.longitude];
        setUserPos(pos);
        setFocus({ pos, zoom: 16, key: Date.now() });
      },
      (e) =>
        setLocMsg(
          e.code === 1
            ? "Permissão de localização negada."
            : "Não foi possível obter sua localização.",
        ),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const openShare = (route: string | null, grp: string | null) => {
    setShareCtx({ route, group: grp });
    setShareOpen(true);
  };

  const confirmShare = async (routeId: string, target: string | null) => {
    const r = await share.begin(routeId, target);
    if (r) {
      setShareOpen(false);
      setSelectedGroup(null);
    }
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <ClientOnly fallback={<div className="absolute inset-0 bg-muted" />}>
        <Suspense fallback={<div className="absolute inset-0 bg-muted" />}>
          <BusMap
            routes={routes}
            groups={visibleGroups.map((g) => {
              const r = routeById.get(g.route_id)!;
              let lat = g.lat;
              let lng = g.lng;
              // Display-only: snap the marker onto the route line when close enough,
              // so GPS drift doesn't show the bus off the road.
              if (isLatLngArray(r.geometry) && r.geometry.length >= 2) {
                const s = snapToPath([g.lat, g.lng], r.geometry);
                if (haversine([g.lat, g.lng], s) <= 250) {
                  lat = s[0];
                  lng = s[1];
                }
              }
              return { ...g, lat, lng, code: r.code, color: r.color };
            })}
            selectedRouteId={routeFilter}
            userPos={userPos}
            focus={focus}
            followId={selectedGroup ?? (sharing ? (share.start?.group_id ?? null) : null)}
            onSelectGroup={(id) => {
              setSelectedGroup(id);
              setSelectedRoute(null);
            }}
            onSelectRoute={(id) => {
              setSelectedRoute(id);
              setSelectedGroup(null);
            }}
          />
        </Suspense>
      </ClientOnly>

      {/* Top bar */}
      <header
        className="pointer-events-none absolute inset-x-0 top-0 z-[500] space-y-2 p-3"
        style={{ background: "var(--gradient-header)" }}
      >
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-2xl bg-card/95 px-3 py-2 shadow-[var(--shadow-pop)] backdrop-blur">
            <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground">
              <Bus className="size-4" />
            </span>
            <div className="leading-tight">
              <h1 className="text-base font-bold">Bus AP</h1>
              <p className="text-[11px] text-muted-foreground">
                Posições colaborativas · não oficial
              </p>
            </div>
            <span
              className={`ml-auto flex items-center gap-1 text-[11px] ${live === "online" ? "text-live" : "text-muted-foreground"}`}
            >
              <Radio className="size-3" />{" "}
              {live === "online" ? "ao vivo" : live === "connecting" ? "conectando" : "offline"}
            </span>
          </div>
          <Button
            asChild
            size="icon"
            variant="outline"
            className="rounded-xl bg-card/95"
            aria-label={user ? "Meu perfil" : "Entrar"}
          >
            <Link to={user ? "/perfil" : "/auth"}>
              <User />
            </Link>
          </Button>
          <Button
            asChild
            size="icon"
            variant="outline"
            className="rounded-xl bg-card/95"
            aria-label="Administração"
          >
            <Link to="/admin" className={isAdmin ? "text-primary" : ""}>
              <Settings />
            </Link>
          </Button>
        </div>
        {routes.length > 0 && (
          <div className="pointer-events-auto -mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
            <Chip active={!routeFilter} onClick={() => setRouteFilter(null)}>
              Todas
            </Chip>
            {routes.map((r) => (
              <Chip
                key={r.id}
                active={routeFilter === r.id}
                color={r.color}
                onClick={() => setRouteFilter(routeFilter === r.id ? null : r.id)}
              >
                {r.code}
              </Chip>
            ))}
          </div>
        )}
      </header>

      {/* Bottom sheet */}
      <section className="absolute inset-x-0 bottom-0 z-[500] mx-auto max-w-lg p-3">
        <div className="space-y-3 rounded-3xl bg-card p-4 shadow-[var(--shadow-sheet)]">
          {sharing ? (
            <SharePanel share={share} timeout={timeout} />
          ) : group ? (
            <GroupPanel
              group={group}
              route={routeById.get(group.route_id)!}
              timeout={timeout}
              max={settings["max_contributors"] ?? 5}
              onClose={() => setSelectedGroup(null)}
              onHelp={() => openShare(group.route_id, group.id)}
            />
          ) : routeDetail ? (
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <span
                  className="grid h-10 min-w-10 place-items-center rounded-xl px-2 text-sm font-bold text-primary-foreground"
                  style={{ background: routeDetail.color }}
                >
                  {routeDetail.code}
                </span>
                <div className="flex-1">
                  <h2 className="font-bold">{routeDetail.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {routeDetail.origin_label || "Origem"} → {routeDetail.dest_label || "Destino"} ·{" "}
                    {formatDistance(routeDetail.distance_m)} · sentido {routeDetail.direction}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSelectedRoute(null)}
                  aria-label="Fechar"
                >
                  <X />
                </Button>
              </div>
              {routeDetail.description && (
                <p className="text-sm text-muted-foreground">{routeDetail.description}</p>
              )}
              <Button
                variant="bus"
                className="w-full"
                onClick={() => openShare(routeDetail.id, null)}
              >
                Estou nesta linha — compartilhar
              </Button>
            </div>
          ) : (
            <>
              {share.status === "ended" && <EndSummary share={share} signedIn={!!user} />}
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat n={routes.length} label="rotas" />
                <Stat n={activeBuses} label="ônibus ativos" />
                <Stat n={activeCount} label="compartilhando" />
              </div>
              {error ? (
                <p className="text-sm text-destructive">
                  Não foi possível carregar os dados: {friendlyError(error)}
                </p>
              ) : loading ? (
                <p className="text-sm text-muted-foreground">Carregando rotas…</p>
              ) : routes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ainda não há rotas publicadas. Volte em breve.
                </p>
              ) : visibleGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum passageiro está compartilhando agora. Está em um ônibus? Seja o primeiro!
                </p>
              ) : null}
              {locMsg && <p className="text-xs text-destructive">{locMsg}</p>}
              {/* Espaço reservado para publicidade (Google AdSense) no futuro */}
              <div
                className="grid min-h-14 place-items-center rounded-xl border border-dashed text-[11px] text-muted-foreground"
                aria-label="Espaço reservado para publicidade"
              >
                Publicidade
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11 rounded-xl"
                  onClick={locate}
                  aria-label="Centralizar na minha localização"
                >
                  <LocateFixed />
                </Button>
                <Button
                  variant="bus"
                  className="h-11 flex-1 rounded-xl text-base"
                  disabled={routes.length === 0}
                  onClick={() => openShare(routeFilter, null)}
                >
                  <Crosshair /> Estou no ônibus
                </Button>
              </div>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Info className="size-3" /> Dados enviados voluntariamente por passageiros. Não é
                rastreamento oficial.{" "}
                <Link to="/privacidade" className="underline">
                  Privacidade
                </Link>
              </p>
            </>
          )}
        </div>
      </section>

      <ShareFlow
        key={`${shareCtx.route}-${shareCtx.group}-${shareOpen}`}
        open={shareOpen}
        onOpenChange={setShareOpen}
        routes={routes}
        groups={groups}
        settings={settings}
        initialRouteId={shareCtx.route}
        targetGroupId={shareCtx.group}
        onConfirm={(r, g) => {
          setShareCtx((c) => ({ ...c, route: r }));
          confirmShare(r, g);
        }}
        busy={share.status === "locating" || share.status === "starting"}
      />
      {shareOpen && share.status === "error" && share.message && (
        <div className="fixed inset-x-3 top-3 z-[2000] mx-auto max-w-md rounded-xl bg-destructive p-3 text-sm text-destructive-foreground">
          {share.message}
        </div>
      )}
    </div>
  );
}

function Chip({
  children,
  active,
  color,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card/95 text-foreground"
      }`}
    >
      {color && <span className="size-2.5 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl bg-muted py-2">
      <div className="font-display text-xl font-bold">{n}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function GroupPanel({
  group,
  route,
  timeout,
  max,
  onClose,
  onHelp,
}: {
  group: BusGroup & { state: string };
  route: { code: string; name: string; color: string };
  timeout: number;
  max: number;
  onClose: () => void;
  onHelp: () => void;
}) {
  const live = group.state === "ativo";
  const ageS = (Date.now() - new Date(group.last_update).getTime()) / 1000;
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span
          className="grid h-10 min-w-10 place-items-center rounded-xl px-2 text-sm font-bold text-primary-foreground"
          style={{ background: route.color }}
        >
          {route.code}
        </span>
        <div className="flex-1">
          <h2 className="font-bold">{route.name}</h2>
          <p className={`text-xs font-semibold ${live ? "text-live" : "text-muted-foreground"}`}>
            {live
              ? `Ativo · ${group.active_contributors} de ${max} colaboradores`
              : `Desatualizado · última posição ${formatAge(group.last_update)} (${new Date(group.last_update).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})`}
          </p>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Fechar">
          <X />
        </Button>
      </div>
      <IndicatorGrid
        experience={{
          label: "Experiência",
          value: live ? levelLabel(group.top_level) : "—",
          hint: "Nível não garante a precisão da posição.",
        }}
        freshness={{
          label: "Atualidade",
          value: formatAge(group.last_update),
          tone: ageS <= timeout / 2 ? "good" : ageS <= timeout ? "mid" : "bad",
        }}
        signal={{
          label: "Sinal",
          value: live ? `${group.signal} · ±${Math.round(group.accuracy_m)} m` : "sem sinal",
          tone: !live
            ? "bad"
            : group.signal === "bom"
              ? "good"
              : group.signal === "moderado"
                ? "mid"
                : "bad",
          hint:
            live && group.divergence_m > 50
              ? `Colaboradores divergem ${Math.round(group.divergence_m)} m — posição incerta.`
              : undefined,
        }}
        validation={{
          label: "Validação",
          value: live ? `confiança ${group.confidence}` : "aguardando dados",
          tone: !live
            ? "neutral"
            : group.confidence === "alta"
              ? "good"
              : group.confidence === "media"
                ? "mid"
                : "bad",
          hint: "Área, precisão e velocidade verificadas no servidor.",
        }}
      />
      {live ? (
        group.active_contributors < max ? (
          <Button variant="bus" className="w-full" onClick={onHelp}>
            Estou neste ônibus — quero contribuir
          </Button>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            Este ônibus já tem o máximo de colaboradores.
          </p>
        )
      ) : (
        <Button variant="bus" className="w-full" onClick={onHelp}>
          Ajudar a atualizar esta localização
        </Button>
      )}
    </div>
  );
}

function SharePanel({
  share,
  timeout,
}: {
  share: ReturnType<typeof useGpsShare>;
  timeout: number;
}) {
  const ack = share.lastAck ? Math.round((Date.now() - share.lastAck) / 1000) : null;
  const isActive = share.status === "active" && ack !== null && ack <= timeout;
  const label =
    share.status === "locating"
      ? "Obtendo sinal do GPS…"
      : share.status === "starting"
        ? "Iniciando sessão…"
        : share.status === "reconnecting"
          ? "Reconectando…"
          : isActive
            ? "Compartilhamento ativo"
            : "Atualizações pausadas";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span
          className={`relative grid size-10 place-items-center rounded-full ${isActive ? "bg-live text-live-foreground" : "bg-stale text-stale-foreground"}`}
        >
          <Radio className="size-5" />
        </span>
        <div className="flex-1">
          <h2 className="font-bold">{label}</h2>
          <p className="text-xs text-muted-foreground">
            {ack !== null ? `Último envio confirmado ${ack}s atrás` : "—"}
            {share.accuracy ? ` · precisão ±${Math.round(share.accuracy)} m` : ""}
            {share.contributors ? ` · ${share.contributors} no grupo` : ""}
          </p>
        </div>
      </div>
      {share.start && (
        <p className="rounded-xl bg-muted p-2 text-xs">{MATCH_TEXT[share.start.match]}</p>
      )}
      {share.start?.off_route && (
        <p className="rounded-xl border border-warn/50 p-2 text-xs">
          Você parece estar longe do trajeto desta linha. Confirme se escolheu a linha certa.
        </p>
      )}
      {share.lastReject && (
        <p className="text-xs text-warn">
          Última leitura não aceita:{" "}
          {share.lastReject === "LOW_ACCURACY"
            ? "precisão insuficiente"
            : share.lastReject === "IMPOSSIBLE_SPEED"
              ? "salto de posição improvável"
              : share.lastReject === "OUT_OF_AREA"
                ? "fora da área"
                : share.lastReject}
        </p>
      )}
      {share.backgrounded && (
        <p className="text-xs text-warn">Página em segundo plano: o navegador pode pausar o GPS.</p>
      )}
      {share.message && <p className="text-xs text-destructive">{share.message}</p>}
      <Button
        variant="destructive"
        className="h-11 w-full rounded-xl text-base"
        onClick={share.stop}
      >
        <Square /> Parar de compartilhar
      </Button>
    </div>
  );
}

function EndSummary({
  share,
  signedIn,
}: {
  share: ReturnType<typeof useGpsShare>;
  signedIn: boolean;
}) {
  const r = share.endResult;
  return (
    <div className="flex items-start gap-2 rounded-xl bg-muted p-3 text-xs">
      <div className="flex-1 space-y-1">
        <p className="font-semibold">Compartilhamento encerrado. Obrigado!</p>
        {share.message && <p>{share.message}</p>}
        {r?.validation && (
          <p>
            Validação:{" "}
            <b>
              {r.validation === "valid"
                ? "válida"
                : r.validation === "inconclusive"
                  ? "pendente/inconclusiva (sem pontos, sem punição)"
                  : r.validation === "invalid"
                    ? "não validada"
                    : r.validation}
            </b>
            {r.notes ? ` — ${r.notes}` : ""}
            {r.validation === "valid" &&
              (signedIn ? ` · +${r.xp ?? 0} XP` : " · entre na conta para guardar sua experiência")}
          </p>
        )}
      </div>
      <button onClick={share.reset} aria-label="Fechar">
        <X className="size-4" />
      </button>
    </div>
  );
}
