import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: async () => {
    const { data, error } = await supabase.from("products").select("*").order("name");
    if (error) throw error;
    return data;
  },
});
export const suppliersQuery = queryOptions({
  queryKey: ["suppliers"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("supplier_directory")
      .select("id, name")
      .order("name");
    if (error) throw error;
    return data;
  },
});
export const movementsQuery = queryOptions({
  queryKey: ["movements"],
  queryFn: async () => {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, products(name, sku, unit)")
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    const { data: suppliers, error } = await supabase.from("supplier_directory").select("id, name");
    if (error) throw error;
    const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
    return rows.map((movement) => ({
      ...movement,
      suppliers: movement.supplier_id
        ? { name: supplierNames.get(movement.supplier_id) ?? null }
        : null,
    }));
  },
});
export type Movement = Awaited<ReturnType<NonNullable<typeof movementsQuery.queryFn>>>[number];
