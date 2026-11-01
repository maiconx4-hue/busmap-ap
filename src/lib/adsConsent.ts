// Consentimento de publicidade (Google AdSense) conforme a LGPD.
// O script de anúncios só carrega depois do aceite do visitante em regiões
// que exigem consentimento; nas demais, carrega sem aviso.

export const ADS_CLIENT_ID = "ca-pub-2404280823675572";
export const ADS_CONSENT_VERSION = "2026-10-27";
export const ADS_NOTICE_TEXT =
  "Usamos cookies do Google AdSense para exibir anúncios e medir resultados. " +
  "Você pode aceitar ou recusar; o mapa funciona igual nos dois casos.";

const STORAGE_KEY = "busmap_ads_consent";
export const ADS_CONSENT_RESET_EVENT = "busmap:ads-consent-reset";

// Regiões que exigem consentimento prévio para publicidade (LGPD/GDPR e equivalentes).
const CONSENT_REGIONS = new Set([
  "BR", // Brasil (LGPD) — público principal do app
  // EEE + Reino Unido + Suíça (GDPR)
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO", "GB", "CH",
]);

export type AdsConsentChoice = "accepted" | "rejected";

export interface AdsConsentRecord {
  choice: AdsConsentChoice;
  at: string; // ISO date
  version: string;
  region: string; // país detectado ou "unknown"
  notice: string; // texto do aviso exibido
}

export function readAdsConsent(): AdsConsentRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdsConsentRecord;
    if (parsed.choice !== "accepted" && parsed.choice !== "rejected") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAdsConsent(choice: AdsConsentChoice, region: string): AdsConsentRecord {
  const record: AdsConsentRecord = {
    choice,
    at: new Date().toISOString(),
    version: ADS_CONSENT_VERSION,
    region,
    notice: ADS_NOTICE_TEXT,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // armazenamento indisponível: a escolha vale só para esta visita
  }
  return record;
}

export function clearAdsConsent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignora
  }
}

// Cache da região válido apenas para a visita atual (não persiste entre páginas).
let regionCache: string | null = null;
let regionPromise: Promise<string> | null = null;

export function detectRegion(): Promise<string> {
  if (regionCache) return Promise.resolve(regionCache);
  if (regionPromise) return regionPromise;
  regionPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch("/cdn-cgi/trace", { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return "unknown";
      const text = await res.text();
      const loc = text.match(/^loc=(.+)$/m)?.[1]?.trim().toUpperCase();
      if (!loc || loc === "XX" || loc === "T1") return "unknown";
      regionCache = loc;
      return loc;
    } catch {
      return "unknown";
    }
  })();
  return regionPromise;
}

export function regionRequiresConsent(region: string): boolean {
  // Falha na detecção ("unknown") => trata como região que exige consentimento.
  return region === "unknown" || CONSENT_REGIONS.has(region);
}

let adsLoaded = false;

export function loadAdsScript(): void {
  if (adsLoaded) return;
  const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS_CLIENT_ID}`;
  if (Array.from(document.scripts).some((script) => script.src === src)) {
    adsLoaded = true;
    return;
  }
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = src;
  document.head.appendChild(script);
  adsLoaded = true;
}
