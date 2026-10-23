import { useEffect, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type PublicRoute = Pick<
  Tables<"routes">,
  "id" | "code" | "name" | "description" | "color" | "direction" | "origin_label" | "dest_label" | "geometry" | "distance_m"
>;
export type BusGroup = Pick<
  Tables<"bus_groups">,
  "id" | "route_id" | "lat" | "lng" | "accuracy_m" | "divergence_m" | "active_contributors" | "status" | "signal" | "confidence" | "top_level" | "last_update"
>;

export type Settings = Partial<
  Record<
    | "session_timeout_s" | "update_interval_s" | "max_contributors" | "stale_retention_s" | "gps_retention_h"
    | "max_accuracy_m" | "group_join_radius_m" | "stale_join_radius_m",
    number
  >
>;

const ROUTE_COLS = "id,code,name,description,color,direction,origin_label,dest_label,geometry,distance_m";
const GROUP_COLS = "id,route_id,lat,lng,accuracy_m,divergence_m,active_contributors,status,signal,confidence,top_level,last_update";

export const routesQuery = queryOptions({
  queryKey: ["public-routes"],
  queryFn: async () => {
    const { data, error } = await supabase.from("routes").select(ROUTE_COLS).eq("status", "published").order("code");
    if (error) throw error;
    return data as PublicRoute[];
  },
});
export const groupsQuery = queryOptions({
  queryKey: ["bus-groups"],
  queryFn: async () => {
    const { data, error } = await supabase.from("bus_groups").select(GROUP_COLS).limit(500);
    if (error) throw error;
    return data as BusGroup[];
  },
});
export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async () => {
    const { data, error } = await supabase.from("settings").select("key,value");
    if (error) throw error;
    return Object.fromEntries(data.map((r) => [r.key, Number(r.value)])) as Settings;
  },
  staleTime: 5 * 60_000,
});

/** Loads public data and patches it in place from Realtime (no full map reload). */
export function useMapData() {
  const qc = useQueryClient();
  const routes = useQuery(routesQuery);
  const groups = useQuery(groupsQuery);
  const settings = useQuery(settingsQuery);
  const [live, setLive] = useState<"connecting" | "online" | "offline">("connecting");
  const [, setTick] = useState(0);

  useEffect(() => {
    const channel = supabase
      .channel("public-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "bus_groups" }, (p) => {
        qc.setQueryData<BusGroup[]>(groupsQuery.queryKey, (old = []) => {
          if (p.eventType === "DELETE") return old.filter((g) => g.id !== (p.old as { id: string }).id);
          const row = p.new as BusGroup;
          const i = old.findIndex((g) => g.id === row.id);
          if (i === -1) return [...old, row];
          const copy = old.slice();
          copy[i] = row;
          return copy;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "routes" }, () => {
        qc.invalidateQueries({ queryKey: routesQuery.queryKey });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLive("online");
          qc.invalidateQueries({ queryKey: groupsQuery.queryKey });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLive("offline");
      });
    // re-evaluate freshness labels every 5s
    const t = setInterval(() => setTick((x) => x + 1), 5000);
    return () => {
      clearInterval(t);
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return {
    routes: routes.data ?? [],
    groups: groups.data ?? [],
    settings: settings.data ?? ({} as Settings),
    loading: routes.isLoading || groups.isLoading,
    error: routes.error || groups.error,
    live,
  };
}
