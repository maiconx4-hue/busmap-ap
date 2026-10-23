import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MACAPA_CENTER, type LatLng } from "@/lib/geo";

export type EditorMode = "draw" | "origin" | "dest" | "view";

type Props = {
  points: LatLng[];
  color: string;
  mode: EditorMode;
  origin: LatLng | null;
  dest: LatLng | null;
  onMapClick: (p: LatLng) => void;
  onMovePoint: (i: number, p: LatLng) => void;
  onDeletePoint: (i: number) => void;
};

export default function EditorMap({ points, color, mode, origin, dest, onMapClick, onMovePoint, onDeletePoint }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const cb = useRef({ onMapClick, onMovePoint, onDeletePoint });
  cb.current = { onMapClick, onMovePoint, onDeletePoint };
  const fitted = useRef(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current).setView(MACAPA_CENTER, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => cb.current.onMapClick([+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const lg = layer.current;
    const m = map.current;
    if (!lg || !m) return;
    lg.clearLayers();
    if (points.length >= 2) L.polyline(points, { color, weight: 5, opacity: 0.85 }).addTo(lg);
    if (mode === "draw" && points.length <= 400) {
      points.forEach((p, i) => {
        const mk = L.marker(p, {
          draggable: true,
          icon: L.divIcon({ className: "", html: '<div class="edit-point"></div>', iconSize: [14, 14] }),
          title: `Ponto ${i + 1} — arraste para mover, clique para excluir`,
        });
        mk.on("dragend", () => {
          const ll = mk.getLatLng();
          cb.current.onMovePoint(i, [+ll.lat.toFixed(6), +ll.lng.toFixed(6)]);
        });
        mk.on("click", (ev: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(ev);
          cb.current.onDeletePoint(i);
        });
        mk.addTo(lg);
      });
    }
    const pin = (p: LatLng, cls: string) =>
      L.marker(p, { icon: L.divIcon({ className: "", html: `<div class="pin-marker ${cls}"></div>`, iconSize: [22, 22], iconAnchor: [11, 22] }) }).addTo(lg);
    if (origin) pin(origin, "origin");
    if (dest) pin(dest, "dest");
    if (!fitted.current && points.length >= 2) {
      m.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
      fitted.current = true;
    }
  }, [points, color, mode, origin, dest]);

  useEffect(() => {
    if (el.current) el.current.style.cursor = mode === "view" ? "" : "crosshair";
  }, [mode]);

  return <div ref={el} className="h-full w-full rounded-xl" />;
}
