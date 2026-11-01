-- Optional dashboard-only identity, separate from legal document headers.
ALTER TABLE public.company_settings
 ADD COLUMN panel_name text NOT NULL DEFAULT ''
  CHECK (panel_name=btrim(panel_name) AND char_length(panel_name)<=20),
 ADD COLUMN panel_logo_path text
  CHECK (panel_logo_path IS NULL OR panel_logo_path ~ '^panel/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$');

-- Read only the two non-legal branding fields, including for dashboard-only users.
-- The privileged lookup is in private and always checks the caller's actual permissions.
CREATE OR REPLACE FUNCTION private.get_panel_branding()
RETURNS TABLE(panel_name text,panel_logo_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.panel_name,c.panel_logo_path FROM public.company_settings c
 WHERE c.id=true AND auth.uid() IS NOT NULL
  AND (public.has_app_permission('dashboard','view') OR public.has_app_permission('settings','manage'));
$$;
REVOKE ALL ON FUNCTION private.get_panel_branding() FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_panel_branding() TO authenticated;
CREATE OR REPLACE FUNCTION public.get_panel_branding()
RETURNS TABLE(panel_name text,panel_logo_path text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM private.get_panel_branding() $$;
REVOKE ALL ON FUNCTION public.get_panel_branding() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_panel_branding() TO authenticated;

-- Files are private. The client converts accepted images to a small raster PNG before upload.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('company-panel-logos','company-panel-logos',false,524288,ARRAY['image/png']);
CREATE POLICY "Read panel logo with dashboard access" ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id='company-panel-logos'
  AND name ~ '^panel/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
  AND (public.has_app_permission('dashboard','view') OR public.has_app_permission('settings','manage')));
CREATE POLICY "Upload panel logo as settings administrator" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id='company-panel-logos'
  AND name ~ '^panel/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
  AND public.has_app_permission('settings','manage'));
CREATE POLICY "Remove panel logo as settings administrator" ON storage.objects FOR DELETE TO authenticated
 USING (bucket_id='company-panel-logos'
  AND name ~ '^panel/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
  AND public.has_app_permission('settings','manage'));
-- No UPDATE policy: replacement creates a new immutable path, then changes the settings pointer.
