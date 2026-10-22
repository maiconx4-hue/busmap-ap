import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Award, Link2, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { levelForXp } from "@/lib/levels";
import { readVisitor } from "@/lib/visitor";
import { friendlyError } from "@/lib/errors";
import { deleteMyAccount } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Meu perfil — BusMap Macapá" },
      { name: "description", content: "Seu nível, experiência e conquistas como colaborador." },
      { property: "og:title", content: "Meu perfil — BusMap Macapá" },
      { property: "og:description", content: "Nível, experiência e conquistas." },
    ],
  }),
  component: Profile,
});

const VALIDATION_PT: Record<string, string> = { valid: "Válida", invalid: "Não validada", inconclusive: "Pendente", pending: "Em andamento" };

function Profile() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const del = useServerFn(deleteMyAccount);
  const q = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const [p, ach, mine, sessions] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).single(),
        supabase.from("achievements").select("*"),
        supabase.from("user_achievements").select("code,earned_at"),
        supabase
          .from("location_sessions")
          .select("id,started_at,ended_at,validation,xp_awarded,first_accepted_at,last_accepted_at,routes(code,name)")
          .order("started_at", { ascending: false })
          .limit(20),
      ]);
      if (p.error) throw p.error;
      return { email: u.user!.email, profile: p.data, achievements: ach.data ?? [], mine: mine.data ?? [], sessions: sessions.data ?? [] };
    },
  });
  const [nick, setNick] = useState("");
  const [anon, setAnon] = useState(true);
  useEffect(() => {
    if (q.data) {
      setNick(q.data.profile.nickname ?? "");
      setAnon(q.data.profile.is_anonymous);
    }
  }, [q.data]);

  if (q.isLoading) return <main className="p-6 text-sm text-muted-foreground">Carregando…</main>;
  if (q.error || !q.data) return <main className="p-6 text-sm text-destructive">{friendlyError(q.error)}</main>;
  const { profile, achievements, mine, sessions, email } = q.data;
  const lvl = levelForXp(profile.xp);
  const earned = new Map(mine.map((m) => [m.code, m.earned_at]));
  const validCount = sessions.filter((s) => s.validation === "valid").length;

  const save = async () => {
    const { error } = await supabase
      .from("profiles")
      .update({ nickname: nick.trim() || null, is_anonymous: anon })
      .eq("id", profile.id);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado.");
    qc.invalidateQueries({ queryKey: ["my-profile"] });
  };
  const link = async () => {
    const v = readVisitor();
    if (!v) return toast.info("Este navegador não tem progresso anônimo para vincular.");
    const { data, error } = await supabase.rpc("claim_visitor", { p_visitor: v.visitor_id, p_secret: v.secret });
    if (error) return toast.error(friendlyError(error));
    toast.success(`Dispositivo vinculado. ${(data as { credited_sessions: number }).credited_sessions} sessão(ões) creditada(s).`);
    qc.invalidateQueries({ queryKey: ["my-profile"] });
  };
  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };
  const remove = async () => {
    if (!confirm("Excluir sua conta permanentemente? Experiência e conquistas serão apagadas.")) return;
    try {
      await del();
      await supabase.auth.signOut();
      toast.success("Conta excluída.");
      navigate({ to: "/" });
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <main className="mx-auto max-w-lg space-y-5 p-5 pb-16">
      <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> Mapa
      </Link>
      <section className="space-y-3 rounded-3xl bg-primary p-5 text-primary-foreground">
        <p className="text-xs opacity-80">{profile.is_anonymous ? "Aparece como: Colaborador anônimo" : `Aparece como: ${profile.nickname ?? "sem apelido"}`}</p>
        <h1 className="text-3xl font-extrabold">
          {lvl.current.name} <span className="font-normal opacity-80">· {lvl.current.title}</span>
        </h1>
        <p className="text-sm">{profile.xp} XP</p>
        <Progress value={lvl.progress * 100} className="bg-primary-foreground/20" />
        <p className="text-xs opacity-80">{lvl.next ? `Faltam ${lvl.missing} XP para ${lvl.next.name}` : "Nível máximo alcançado"}</p>
        <p className="text-xs opacity-80">
          {validCount} sessões válidas recentes · membro desde {new Date(profile.created_at).toLocaleDateString("pt-BR")}
        </p>
      </section>
      <p className="text-xs text-muted-foreground">O nível reflete seu histórico de colaboração; ele não garante a precisão de nenhuma localização.</p>

      <section className="space-y-2">
        <h2 className="font-bold">Medalhas e conquistas</h2>
        <div className="grid grid-cols-3 gap-2">
          {achievements.map((a) => (
            <div key={a.code} className={`rounded-xl border p-3 text-center ${earned.has(a.code) ? "bg-accent text-accent-foreground" : "opacity-50"}`}>
              <Award className="mx-auto size-5" />
              <p className="mt-1 text-xs font-semibold">{a.name}</p>
              <p className="text-[10px]">{a.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Histórico resumido</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma sessão ainda.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {sessions.map((s) => {
              const dur = s.first_accepted_at && s.last_accepted_at ? Math.round((+new Date(s.last_accepted_at) - +new Date(s.first_accepted_at)) / 60000) : 0;
              const r = s.routes as { code: string; name: string } | null;
              return (
                <li key={s.id} className="flex items-center justify-between p-3 text-sm">
                  <span>
                    <b>{r?.code ?? "—"}</b> · {new Date(s.started_at).toLocaleDateString("pt-BR")} · {dur} min
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {VALIDATION_PT[s.validation]} {s.xp_awarded ? `· +${s.xp_awarded} XP` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground">Mostramos apenas o resumo; o trajeto detalhado nunca é exibido.</p>
      </section>

      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="font-bold">Preferências</h2>
        <div className="space-y-1">
          <Label htmlFor="nick">Apelido público (opcional)</Label>
          <Input id="nick" maxLength={30} value={nick} onChange={(e) => setNick(e.target.value)} placeholder="ex.: Passageira da Zona Norte" />
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Permanecer anônimo (não exibir meu nível no mapa)</span>
          <Switch checked={anon} onCheckedChange={setAnon} />
        </label>
        <Button onClick={save}>Salvar</Button>
      </section>

      <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
        <h2 className="font-bold">Progresso anônimo deste aparelho</h2>
        <p className="text-muted-foreground">
          Sessões feitas sem conta ficam ligadas a um segredo salvo neste navegador. Vincule-as agora — o progresso se perde se você limpar os dados do
          navegador ou trocar de aparelho.
        </p>
        <Button variant="outline" onClick={link}>
          <Link2 /> Vincular este dispositivo
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Conectado como {email}</p>
        <Button variant="outline" onClick={logout}>
          <LogOut /> Sair
        </Button>
        <Button variant="destructive" onClick={remove}>
          <Trash2 /> Excluir minha conta
        </Button>
      </section>
    </main>
  );
}
