<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All GPS writes go through SECURITY DEFINER RPCs (register_visitor/start_session/push_update/end_session) that verify the device secret; tables holding personal data have no anon/authenticated write grants. Why: anonymous sharing without trusting the client.
- XP, levels, grouping and validation are computed only in SQL functions; `src/lib/levels.ts` merely mirrors thresholds for display. Why: users must not alter scoring.
- The UI derives "ativo/desatualizado" from timestamps + settings (`src/lib/freshness.ts`), never from stored status alone. Why: never show a session as active after updates stop, even if the cleanup cron lags.
- Admin access = `user_roles` row granted by the auth trigger for the confirmed creator e-mail, checked by `is_admin()` in RLS/RPCs. Why: no public admin signup, no client-only gating.
- Leaflet is only imported inside lazily-loaded components under `src/components/map/`. Why: it touches `window` at import time and breaks SSR.
- GPS sharing state lives in GpsShareProvider (root) so it survives route changes; why: navigating away used to stop sharing.
- The native App Inventor GPS bridge (`src/lib/nativeGps.ts` + its use in `useGpsShare.ts`: JSON START_GPS/STOP_GPS via setWebViewString, 500ms getWebViewString polling, strict 5-field GPS_UPDATE validation) is a fixed protocol verified on device; never change or remove it. Why: the Android app depends on it exactly.
