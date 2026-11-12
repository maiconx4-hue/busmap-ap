DROP POLICY IF EXISTS "settings public read" ON public.settings;
CREATE POLICY "admins read settings" ON public.settings FOR SELECT TO authenticated USING (public.is_admin());
REVOKE SELECT ON public.settings FROM anon;

CREATE OR REPLACE FUNCTION public.public_settings()
RETURNS TABLE(key text, value numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT s.key, s.value FROM public.settings s $$;
REVOKE ALL ON FUNCTION public.public_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_settings() TO anon, authenticated;