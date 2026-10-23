import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MACAPA_CENTER, isLatLngArray, type LatLng } from "@/lib/geo";
import type { GroupState } from "@/lib/freshness";

export type MapRoute = { id: string; code: string; color: string; geometry: unknown };
export type MapGroup = {
  id: string;
  route_id: string;
  lat: number;
  lng: number;
  accuracy_m: number;
  state: GroupState;
  code: string;
  color: string;
};

type Props = {
  routes: MapRoute[];
  groups: MapGroup[];
  selectedRouteId: string | null;
  userPos: LatLng | null;
  focus: { pos: LatLng; zoom: number; key: number } | null;
  onSelectGroup: (id: string) => void;
  onSelectRoute: (id: string) => void;
};

export default function BusMap({
  routes,
  groups,
  selectedRouteId,
  userPos,
  focus,
  onSelectGroup,
  onSelectRoute,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);
  const groupLayer = useRef<L.LayerGroup | null>(null);
  const meLayer = useRef<L.LayerGroup | null>(null);
  const cb = useRef({ onSelectGroup, onSelectRoute });
  cb.current = { onSelectGroup, onSelectRoute };

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(
      MACAPA_CENTER,
      13,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    L.control.zoom({ position: "bottomright" }).addTo(m);
    routeLayer.current = L.layerGroup().addTo(m);
    groupLayer.current = L.layerGroup().addTo(m);
    meLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = routeLayer.current;
    if (!layer) return;
    layer.clearLayers();
    routes.forEach((r) => {
      if (!isLatLngArray(r.geometry) || r.geometry.length < 2) return;
      const dim = selectedRouteId && selectedRouteId !== r.id;
      L.polyline(r.geometry, { color: r.color, weight: dim ? 3 : 6, opacity: dim ? 0.25 : 0.85 })
        .on("click", () => cb.current.onSelectRoute(r.id))
        .addTo(layer);
    });
  }, [routes, selectedRouteId]);

  useEffect(() => {
    const layer = groupLayer.current;
    if (!layer) return;
    layer.clearLayers();
    groups.forEach((g) => {
      if (g.state === "expirado") return;
      if (selectedRouteId && g.route_id !== selectedRouteId) return;
      const live = g.state === "ativo";
      if (live && g.accuracy_m > 0)
        L.circle([g.lat, g.lng], {
          radius: g.accuracy_m,
          color: g.color,
          weight: 1,
          fillOpacity: 0.08,
        }).addTo(layer);
      L.marker([g.lat, g.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div class="bus-marker ${live ? "live" : "stale"}" style="--route:${g.color}">${g.code.slice(0, 4)}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        title: live ? "Posição colaborativa ativa" : "Última posição conhecida (desatualizada)",
      })
        .on("click", () => cb.current.onSelectGroup(g.id))
        .addTo(layer);
    });
  }, [groups, selectedRouteId]);

  useEffect(() => {
    const layer = meLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (userPos)
      L.marker(userPos, {
        icon: L.divIcon({
          className: "",
          html: '<div class="me-marker"></div>',
          iconSize: [16, 16],
        }),
      }).addTo(layer);
  }, [userPos]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo(focus.pos, focus.zoom, { duration: 0.8 });
  }, [focus]);

  return <div ref={el} className="absolute inset-0 z-0" aria-label="Mapa de Macapá" />;
}
