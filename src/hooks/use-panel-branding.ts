import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PANEL_BRANDING_QUERY_KEY, PANEL_LOGO_BUCKET } from "@/lib/panel-branding";
export function usePanelBranding(enabled: boolean) {
  return useQuery({
    queryKey: PANEL_BRANDING_QUERY_KEY,
    enabled,
    staleTime: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_panel_branding");
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}
export function usePanelLogoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["panel-logo-url", path ?? null],
    enabled: !!path,
    staleTime: 40 * 60 * 1000,
    refetchInterval: 40 * 60 * 1000,
    queryFn: async () => {
      if (!path) return null;
      const { data, error } = await supabase.storage
        .from(PANEL_LOGO_BUCKET)
        .createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
