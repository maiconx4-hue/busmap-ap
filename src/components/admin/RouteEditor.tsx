import { Suspense, lazy, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { toast } from "sonner";
import { Redo2, Route as RouteIcon, Trash, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistance, isLatLngArray, pathLength, type LatLng } from "@/lib/geo";
import type { EditorMode } from "@/components/map/EditorMap";

const EditorMap = lazy(() => import("@/components/map/EditorMap"));

type RouteRow = Tables<"routes">;

export function RouteEditor({ initial, onDone }: { initial: RouteRow | null; onDone: () => void }) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color ?? "#0e9f8e");
  const [direction, setDirection] = useState(initial?.direction ?? "ida");
  const [originLabel, setOriginLabel] = useState(initial?.origin_label ?? "");
  const [destLabel, setDestLabel] = useState(initial?.dest_label ?? "");
  const [origin, setOrigin] = useState<LatLng | null>(initial?.origin_lat != null ? [initial.origin_lat, initial.origin_lng!] : null);
  const [dest, setDest] = useState<LatLng | null>(initial?.dest_lat != null ? [initial.dest_lat, initial.dest_lng!] : null);
  const [method, setMethod] = useState<"osrm" | "manual">((initial?.creation_method as "osrm" | "manual") ?? "osrm");
  const [history, setHistory] = useState<LatLng[][]>([isLatLngArray(initial?.geometry) ? (initial!.geometry as LatLng[]) : []]);
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<EditorMode>(method === "osrm" ? "origin" : "draw");
  const [busy, setBusy] = useState(false);
  const points = history[cursor];

  const commit = (next: LatLng[]) => {
    const h = history.slice(0, cursor + 1);
    h.push(next);
    setHistory(h.slice(-100));
    setCursor(Math.min(h.length - 1, 99));
  };

  const onMapClick = (p: LatLng) => {
    if (mode === "origin") {
      setOrigin(p);
      setMode("dest");
    } else if (mode === "dest") {
      setDest(p);
      setMode("view");
    } else if (mode === "draw") commit([...points, p]);
  };

  const calc = async () => {
    if (!origin || !dest) return toast.error("Marque origem e destino no mapa.");
    setBusy(true);
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${origin[1]},${origin[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`OSRM respondeu ${res.status}`);
      const j = (await res.json()) as { routes?: { geometry: { coordinates: [number, number][] } }[] };
      const coords = j.routes?.[0]?.geometry.coordinates;
      if (!coords?.length) throw new Error("Nenhum trajeto encontrado");
      // keep every point but round; thin very dense lines
      const step = Math.max(1, Math.floor(coords.length / 600));
      const pts = coords.filter((_, i) => i % step === 0 || i === coords.length - 1).map(([lng, lat]) => [+lat.toFixed(6), +lng.toFixed(6)] as LatLng);
      commit(pts);
      toast.success("Trajeto calculado. Ajuste no modo desenho, se precisar.");
    } catch (e) {
      toast.error(`Roteamento indisponível (${e instanceof Error ? e.message : "erro"}). Use o desenho manual.`);
    } finally {
      setBusy(false);
    }
  };

  const save = async (status: "draft" | "published") => {
    if (!code.trim() || name.trim().length < 2) return toast.error("Preencha código e nome.");
    if (status === "published" && points.length < 2) return toast.error("O traçado precisa de pelo menos 2 pontos.");
    setBusy(true);
    const row = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description.trim(),
      color,
      direction,
      origin_label: originLabel.trim(),
      dest_label: destLabel.trim(),
      origin_lat: origin?.[0] ?? points[0]?.[0] ?? null,
      origin_lng: origin?.[1] ?? points[0]?.[1] ?? null,
      dest_lat: dest?.[0] ?? points.at(-1)?.[0] ?? null,
      dest_lng: dest?.[1] ?? points.at(-1)?.[1] ?? null,
      geometry: points,
      distance_m: Math.round(pathLength(points)),
      creation_method: method,
      status,
    };
    const { error } = initial ? await supabase.from("routes").update(row).eq("id", initial.id) : await supabase.from("routes").insert(row);
    setBusy(false);
    if (error) return toast.error(error.code === "23505" ? "Já existe uma rota com esse código." : error.message);
    toast.success(status === "published" ? "Rota publicada." : "Rascunho salvo.");
    onDone();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="space-y-3">
        <div className="grid grid-cols-[90px_1fr] gap-2">
          <div>
            <Label>Código</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} placeholder="101" />
          </div>
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Centro – Zerão" />
          </div>
        </div>
        <div>
          <Label>Descrição</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Cor</Label>
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 p-1" />
          </div>
          <div>
            <Label>Sentido</Label>
            <select value={direction} onChange={(e) => setDirection(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="ida">Ida</option>
              <option value="volta">Volta</option>
              <option value="circular">Circular</option>
            </select>
          </div>
          <div>
            <Label>Origem (nome)</Label>
            <Input value={originLabel} onChange={(e) => setOriginLabel(e.target.value)} />
          </div>
          <div>
            <Label>Destino (nome)</Label>
            <Input value={destLabel} onChange={(e) => setDestLabel(e.target.value)} />
          </div>
        </div>

        <Tabs value={method} onValueChange={(v) => { setMethod(v as "osrm" | "manual"); setMode(v === "osrm" ? "origin" : "draw"); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="osrm">A · Origem e destino</TabsTrigger>
            <TabsTrigger value="manual">B · Desenho manual</TabsTrigger>
          </TabsList>
        </Tabs>

        {method === "osrm" ? (
          <div className="space-y-2 text-sm">
            <div className="flex gap-2">
              <Button size="sm" variant={mode === "origin" ? "default" : "outline"} onClick={() => setMode("origin")}>
                {origin ? "Origem ✓" : "Marcar origem"}
              </Button>
              <Button size="sm" variant={mode === "dest" ? "default" : "outline"} onClick={() => setMode("dest")}>
                {dest ? "Destino ✓" : "Marcar destino"}
              </Button>
            </div>
            <Button className="w-full" onClick={calc} disabled={busy || !origin || !dest}>
              <RouteIcon /> Calcular trajeto pelas vias
            </Button>
            <p className="text-xs text-muted-foreground">Clique no mapa para marcar. Depois de calcular, edite os pontos pelo modo de desenho.</p>
            {points.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => { setMethod("manual"); setMode("draw"); }}>
                Editar prévia ponto a ponto
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>Clique no mapa para adicionar pontos. Arraste para mover; clique num ponto para excluí-lo.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={cursor === 0} onClick={() => setCursor(cursor - 1)} aria-label="Desfazer">
                <Undo2 />
              </Button>
              <Button size="sm" variant="outline" disabled={cursor >= history.length - 1} onClick={() => setCursor(cursor + 1)} aria-label="Refazer">
                <Redo2 />
              </Button>
              <Button size="sm" variant="outline" onClick={() => commit([])}>
                <Trash /> Limpar
              </Button>
            </div>
          </div>
        )}

        <p className="text-sm">
          {points.length} pontos · distância estimada <b>{formatDistance(pathLength(points))}</b>
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => save("draft")}>
            Salvar rascunho
          </Button>
          <Button variant="live" className="flex-1" disabled={busy} onClick={() => save("published")}>
            Publicar
          </Button>
        </div>
        <Button variant="ghost" className="w-full" onClick={onDone}>
          Cancelar
        </Button>
      </div>
      <div className="h-[60vh] min-h-[380px] overflow-hidden rounded-xl border">
        <ClientOnly fallback={<div className="h-full bg-muted" />}>
          <Suspense fallback={<div className="h-full bg-muted" />}>
            <EditorMap
              points={points}
              color={color}
              mode={mode}
              origin={origin}
              dest={dest}
              onMapClick={onMapClick}
              onMovePoint={(i, p) => commit(points.map((q, j) => (j === i ? p : q)))}
              onDeletePoint={(i) => commit(points.filter((_, j) => j !== i))}
            />
          </Suspense>
        </ClientOnly>
      </div>
    </div>
  );
}
