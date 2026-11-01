import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ADS_CONSENT_RESET_EVENT,
  ADS_NOTICE_TEXT,
  detectRegion,
  loadAdsScript,
  readAdsConsent,
  regionRequiresConsent,
  saveAdsConsent,
} from "@/lib/adsConsent";

type BannerState = "loading" | "hidden" | "visible";

export function AdsConsentBanner() {
  const [state, setState] = useState<BannerState>("loading");
  const [region, setRegion] = useState("unknown");

  useEffect(() => {
    let cancelled = false;

    async function decide() {
      const existing = readAdsConsent();
      if (existing?.choice === "accepted") {
        loadAdsScript();
        if (!cancelled) setState("hidden");
        return;
      }
      if (existing?.choice === "rejected") {
        if (!cancelled) setState("hidden");
        return;
      }
      const detected = await detectRegion();
      if (cancelled) return;
      setRegion(detected);
      if (regionRequiresConsent(detected)) {
        setState("visible");
      } else {
        // Região sem exigência de consentimento: anúncios ativos sem aviso.
        loadAdsScript();
        setState("hidden");
      }
    }

    void decide();

    const onReset = () => {
      setState("loading");
      void decide();
    };
    window.addEventListener(ADS_CONSENT_RESET_EVENT, onReset);
    return () => {
      cancelled = true;
      window.removeEventListener(ADS_CONSENT_RESET_EVENT, onReset);
    };
  }, []);

  if (state !== "visible") return null;

  const choose = (choice: "accepted" | "rejected") => {
    saveAdsConsent(choice, region);
    if (choice === "accepted") loadAdsScript();
    setState("hidden");
  };

  return (
    <div
      role="dialog"
      aria-label="Aviso de publicidade"
      className="fixed inset-x-0 bottom-0 z-[1500] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto max-w-lg space-y-3 rounded-2xl border bg-card p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
            <Megaphone className="size-4" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Publicidade no app</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {ADS_NOTICE_TEXT} Detalhes na{" "}
              <Link to="/privacidade" className="text-primary underline">
                política de privacidade
              </Link>
              .
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => choose("rejected")}>
            Recusar
          </Button>
          <Button size="sm" onClick={() => choose("accepted")}>
            Aceitar
          </Button>
        </div>
      </div>
    </div>
  );
}
