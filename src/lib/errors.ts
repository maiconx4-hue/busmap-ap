const MESSAGES: Record<string, string> = {
  INVALID_VISITOR: "Identificador do dispositivo inválido. Recarregue a página.",
  ROUTE_UNAVAILABLE: "Esta linha não está mais disponível.",
  INVALID_COORDS: "Coordenadas inválidas recebidas do GPS.",
  OUT_OF_AREA: "Sua posição está fora da área atendida (Macapá/Santana).",
  LOW_ACCURACY: "A precisão do GPS está baixa. Vá para um local aberto e tente novamente.",
  RATE_LIMIT: "Muitas tentativas em pouco tempo. Aguarde alguns instantes.",
  GROUP_FULL: "Este ônibus já tem o máximo de colaboradores. Obrigado pela intenção!",
  SESSION_EXPIRED: "A sessão expirou por falta de atualizações.",
  SESSION_ENDED: "A sessão foi encerrada.",
  SESSION_NOT_FOUND: "Sessão não encontrada.",
  AUTH_REQUIRED: "Entre na sua conta para continuar.",
  ALREADY_LINKED: "Este dispositivo já está vinculado a outra conta.",
  FORBIDDEN: "Acesso negado.",
};

export function friendlyError(e: unknown): string {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
        ? String((e as { message: unknown }).message)
        : String(e);
  for (const code of Object.keys(MESSAGES)) if (msg.includes(code)) return MESSAGES[code]!;
  if (/fetch|network|Failed to fetch/i.test(msg)) return "Sem conexão com a internet.";
  return msg || "Erro inesperado.";
}

export function errorCode(e: unknown): string | null {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
        ? String((e as { message: unknown }).message)
        : String(e);
  return Object.keys(MESSAGES).find((c) => msg.includes(c)) ?? null;
}
