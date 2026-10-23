import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Privacidade — BusMap Macapá" },
      {
        name: "description",
        content: "Como o BusMap Macapá coleta, usa e apaga dados de localização, conforme a LGPD.",
      },
      { property: "og:title", content: "Política de privacidade — BusMap Macapá" },
      {
        property: "og:description",
        content: "Coleta voluntária, finalidade, retenção e seus direitos.",
      },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6 pb-16 text-sm leading-relaxed">
      <Link to="/" className="flex items-center gap-1 text-muted-foreground">
        <ArrowLeft className="size-4" /> Voltar ao mapa
      </Link>
      <h1 className="text-3xl font-extrabold">Política de privacidade</h1>
      <p className="text-muted-foreground">
        Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
      </p>
      <Section title="Finalidade">
        O BusMap Macapá exibe posições aproximadas de ônibus a partir de localizações compartilhadas
        voluntariamente por passageiros. Não é um serviço oficial de nenhuma empresa de transporte
        ou órgão público.
      </Section>
      <Section title="O que coletamos">
        <ul className="list-disc pl-5">
          <li>
            Enquanto você compartilha: latitude, longitude, precisão do GPS e horário, a cada poucos
            segundos.
          </li>
          <li>
            Um identificador aleatório do dispositivo e um segredo guardados no seu navegador (sem
            nome, telefone ou e-mail).
          </li>
          <li>
            Se criar conta: e-mail, apelido opcional, experiência, conquistas e um resumo das
            sessões.
          </li>
        </ul>
      </Section>
      <Section title="Base legal e consentimento">
        A coleta de localização depende do seu consentimento explícito, solicitado antes de cada
        compartilhamento. Você pode interromper a coleta a qualquer momento pelo botão “Parar de
        compartilhar”.
      </Section>
      <Section title="O que é público">
        Apenas a posição representativa de cada ônibus (média de até 5 colaboradores), o horário da
        última atualização, a qualidade do sinal e o nível do colaborador mais experiente que optou
        por não ser anônimo. Nunca publicamos nomes, contatos, identificadores ou o histórico
        individual de deslocamentos.
      </Section>
      <Section title="Retenção">
        Coordenadas brutas são apagadas automaticamente após 24 horas (configurável). A última
        posição de um ônibus sem colaboradores fica visível como desatualizada por até 15 minutos e
        depois é removida. Identificadores anônimos sem uso por 180 dias são excluídos.
      </Section>
      <Section title="Dados anônimos">
        O progresso de visitantes fica vinculado ao segredo salvo no navegador. Ao limpar os dados
        do navegador, reinstalar ou trocar de aparelho, esse progresso pode ser perdido. Você pode
        vinculá-lo a uma conta pelo seu perfil, usando o mesmo navegador.
      </Section>
      <Section title="Seus direitos">
        Pelo perfil você pode alterar o apelido, ativar o anonimato e excluir sua conta. A exclusão
        apaga perfil, experiência e conquistas, e desvincula as sessões, que permanecem apenas como
        estatística anônima até expirarem.
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="text-muted-foreground">{children}</div>
    </section>
  );
}
