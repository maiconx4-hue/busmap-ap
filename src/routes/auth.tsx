import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Search = { next?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar — BusMap Macapá" },
      { name: "description", content: "Entre ou crie uma conta opcional para guardar seu nível e conquistas." },
      { property: "og:title", content: "Entrar — BusMap Macapá" },
      { property: "og:description", content: "Conta opcional para guardar sua experiência de colaborador." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const go = () => navigate({ to: next ?? "/perfil" });

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
    go();
  };
  const signup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    setBusy(true);
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/perfil" } });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Enviamos um link de confirmação para seu e-mail.");
  };
  const forgot = async () => {
    if (!email) return toast.error("Digite seu e-mail acima.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
    if (error) return toast.error(error.message);
    toast.success("Se o e-mail existir, você receberá um link para redefinir a senha.");
  };
  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" + (next ? `?next=${encodeURIComponent(next)}` : "") });
    if (r.error) return toast.error("Não foi possível entrar com Google.");
    if (r.redirected) return;
    go();
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center gap-6 p-6">
      <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> Voltar ao mapa
      </Link>
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground">
          <Bus />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold">Sua conta</h1>
          <p className="text-sm text-muted-foreground">Opcional — o mapa funciona sem cadastro.</p>
        </div>
      </div>
      <Button variant="outline" onClick={google}>
        Continuar com Google
      </Button>
      <Tabs defaultValue="login">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="login">Entrar</TabsTrigger>
          <TabsTrigger value="signup">Criar conta</TabsTrigger>
        </TabsList>
        {(["login", "signup"] as const).map((mode) => (
          <TabsContent key={mode} value={mode}>
            <form onSubmit={mode === "login" ? login : signup} className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label htmlFor={`${mode}-email`}>E-mail</Label>
                <Input id={`${mode}-email`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${mode}-pw`}>Senha</Label>
                <Input
                  id={`${mode}-pw`}
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {mode === "login" ? "Entrar" : "Criar conta"}
              </Button>
              {mode === "login" && (
                <button type="button" onClick={forgot} className="w-full text-center text-xs text-primary underline">
                  Esqueci minha senha
                </button>
              )}
            </form>
          </TabsContent>
        ))}
      </Tabs>
    </main>
  );
}
