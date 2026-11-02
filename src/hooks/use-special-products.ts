import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAppAccess, hasPermission } from "@/lib/permissions";
import { canAccessSpecialProducts, type SpecialHistory } from "@/lib/special-products";
export function useSpecialProducts() {
  const access = useAppAccess();
  return useQuery({
    queryKey: ["special-products"],
    enabled:
      canAccessSpecialProducts(access?.name) &&
      hasPermission(access?.name, access?.permissions, "special_inventory"),
    queryFn: async () => {
      const result = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("special_products")
          .select("*")
          .eq("active", true)
          .order("name")
          .order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        result.push(...data);
        if (data.length < 1000) return result;
      }
    },
  });
}
export function useSpecialHistory(id?: string) {
  return useQuery({
    queryKey: ["special-product-history", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_special_product_history", {
        p_product_id: id!,
      });
      if (error) throw error;
      return data as unknown as SpecialHistory;
    },
  });
}
