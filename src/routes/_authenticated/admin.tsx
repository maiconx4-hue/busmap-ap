import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RouteEditor } from "@/components/admin/RouteEditor";
import { formatDistance } from "@/lib/geo";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administração — BusMap Macapá" },
      { name: "description", content: "Área restrita de administração do BusMap Macapá." },
      { property: "og:title", content: "Administração — BusMap Macapá" },
      { property: "og:description", content: "Área restrita." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

type RouteRow = Tables<"routes">;
type AdminStats = Partial<
  Record<
    | "routes_total"
    | "routes_published"
    | "routes_draft"
    | "routes_inactive"
    | "sessions_active"
    | "groups_active"
    | "groups_stale"
    | "sessions_24h"
    | "valid_24h"
    | "inconclusive_24h"
    | "invalid_24h"
    | "updates_24h"
    | "rejected_24h"
    | "visitors"
    | "users"
    | "last_maintenance",
    number | string | null
  >
>;
const STATUS_PT = { draft: "Rascunho", published: "Publicada", inactive: "Desativada" } as const;

function Admin() {
  const adm = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => (await supabase.rpc("is_admin")).data === true,
  });
  if (adm.isLoading)
    return <main className="p-6 text-sm text-muted-foreground">Verificando acesso…</main>;
  if (!adm.data)
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
        <Lock className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-bold">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">
          Esta área é exclusiva do administrador do BusMap Macapá.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Voltar ao mapa</Link>
        </Button>
      </main>
    );
  return <AdminPanel />;
}

function AdminPanel() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RouteRow | "new" | null>(null);
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_stats");
      if (error) throw error;
      return data as unknown as AdminStats;
    },
    refetchInterval: 15000,
  });
  const routes = useQuery({
    queryKey: ["admin-routes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("routes").select("*").order("code");
      if (error) throw error;
      return data;
    },
  });
  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").order("key");
      if (error) throw error;
      return data;
    },
  });
  const [osrm, setOsrm] = useState<"?" | "ok" | "falha">("?");
  useEffect(() => {
    fetch(
      "https://router.project-osrm.org/route/v1/driving/-51.07,0.03;-51.06,0.04?overview=false",
      { signal: AbortSignal.timeout(8000) },
    )
      .then((r) => setOsrm(r.ok ? "ok" : "falha"))
      .catch(() => setOsrm("falha"));
  }, []);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-routes"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["public-routes"] });
  };
  const setStatus = async (r: RouteRow, status: RouteRow["status"]) => {
    const { error } = await supabase.from("routes").update({ status }).eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };
  const remove = async (r: RouteRow) => {
    if (!confirm(`Excluir a rota ${r.code}? Posições ligadas a ela também serão removidas.`))
      return;
    const { error } = await supabase.from("routes").delete().eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  const s: AdminStats = stats.data ?? {};
  const lastMaint = s.last_maintenance ? new Date(String(s.last_maintenance)) : null;
  const maintOk = lastMaint && Date.now() - lastMaint.getTime() < 15 * 60_000;

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-5 pb-16">
      <div className="flex items-center justify-between">
        <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" /> Mapa
        </Link>
        <h1 className="text-2xl font-extrabold">Administração</h1>
      </div>
      <Tabs defaultValue="painel">
        <TabsList>
          <TabsTrigger value="painel">Painel</TabsTrigger>
          <TabsTrigger value="rotas">Rotas</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="painel" className="space-y-4">
          {stats.error && <p className="text-sm text-destructive">{friendlyError(stats.error)}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Rotas cadastradas", s.routes_total],
              ["Publicadas", s.routes_published],
              ["Rascunhos", s.routes_draft],
              ["Desativadas", s.routes_inactive],
              ["Sessões ativas", s.sessions_active],
              ["Ônibus ativos", s.groups_active],
              ["Posições desatualizadas", s.groups_stale],
              ["Sessões (24h)", s.sessions_24h],
              ["Válidas (24h)", s.valid_24h],
              ["Pendentes (24h)", s.inconclusive_24h],
              ["Inválidas (24h)", s.invalid_24h],
              ["Atualizações GPS (24h)", s.updates_24h],
              ["Rejeitadas (24h)", s.rejected_24h],
              ["Dispositivos anônimos", s.visitors],
              ["Contas", s.users],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl border bg-card p-3">
                <div className="text-xs text-muted-foreground">{k}</div>
                <div className="font-display text-2xl font-bold">{v ?? "–"}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border bg-card p-4 text-sm">
            <h2 className="mb-2 font-bold">Estado dos serviços</h2>
            <ul className="space-y-1">
              <li>Banco de dados: {stats.error ? "falha" : stats.data ? "ok" : "verificando…"}</li>
              <li>
                Limpeza automática (a cada 5 min): {maintOk ? "ok" : "atrasada"} — última execução{" "}
                {lastMaint ? lastMaint.toLocaleString("pt-BR") : "nunca"}
              </li>
              <li>Roteamento OSRM (servidor público de demonstração): {osrm}</li>
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="rotas" className="space-y-4">
          {editing ? (
            <RouteEditor
              key={editing === "new" ? "new" : editing.id}
              initial={editing === "new" ? null : editing}
              onDone={() => {
                setEditing(null);
                refresh();
              }}
            />
          ) : (
            <>
              <Button onClick={() => setEditing("new")}>
                <Plus /> Nova rota
              </Button>
              {routes.data?.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma rota cadastrada.</p>
              )}
              <div className="divide-y rounded-xl border bg-card">
                {routes.data?.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                    <span
                      className="grid h-9 min-w-9 place-items-center rounded-lg px-1.5 text-xs font-bold text-primary-foreground"
                      style={{ background: r.color }}
                    >
                      {r.code}
                    </span>
                    <div className="min-w-40 flex-1">
                      <div className="text-sm font-semibold">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {STATUS_PT[r.status]} · {formatDistance(r.distance_m)} ·{" "}
                        {r.creation_method === "osrm" ? "OSRM" : "manual"} · atualizada{" "}
                        {new Date(r.updated_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                        Editar
                      </Button>
                      {r.status !== "published" ? (
                        <Button size="sm" variant="live" onClick={() => setStatus(r, "published")}>
                          Publicar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStatus(r, "inactive")}
                        >
                          Desativar
                        </Button>
                      )}
                      <Button size="sm" variant="destructive" onClick={() => remove(r)}>
                        Excluir
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="config">
          <div className="divide-y rounded-xl border bg-card">
            {settings.data?.map((row) => (
              <SettingRow
                key={row.key}
                row={row}
                onSaved={() => qc.invalidateQueries({ queryKey: ["admin-settings"] })}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function SettingRow({ row, onSaved }: { row: Tables<"settings">; onSaved: () => void }) {
  const [v, setV] = useState(String(row.value));
  const save = async () => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Valor inválido.");
      return;
    }
    const { error } = await supabase
      .from("settings")
      .update({ value: n, updated_at: new Date().toISOString() })
      .eq("key", row.key);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Configuração salva.");
    onSaved();
  };
  return (
    <div className="flex flex-wrap items-center gap-3 p-3 text-sm">
      <div className="min-w-48 flex-1">
        <div className="font-mono text-xs">{row.key}</div>
        <div className="text-muted-foreground">{row.description}</div>
      </div>
      <Input
        className="w-28"
        value={v}
        onChange={(e) => setV(e.target.value)}
        inputMode="decimal"
      />
      <Button size="sm" variant="outline" onClick={save} disabled={String(row.value) === v}>
        Salvar
      </Button>
    </div>
  );
}
