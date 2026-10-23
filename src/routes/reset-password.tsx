import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova senha — BusMap Macapá" },
      { name: "description", content: "Defina uma nova senha para sua conta BusMap Macapá." },
      { property: "og:title", content: "Nova senha — BusMap Macapá" },
      { property: "og:description", content: "Redefinição de senha." },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const [pw, setPw] = useState("");
  const navigate = useNavigate();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) {
      toast.error("Mínimo de 8 caracteres.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Senha atualizada.");
    navigate({ to: "/perfil" });
  };
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-extrabold">Definir nova senha</h1>
      <form onSubmit={submit} className="space-y-3">
        <Label htmlFor="pw">Nova senha</Label>
        <Input
          id="pw"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
        />
        <Button type="submit" className="w-full">
          Salvar
        </Button>
      </form>
    </main>
  );
}
