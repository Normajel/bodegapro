import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { buildPurchasePrices, type PriceItem, type PriceEntry } from "@/lib/purchase-prices";
type ReadTable<T> = { Row: T; Insert: never; Update: never; Relationships: [] };
type PriceDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      purchase_entries: ReadTable<PriceEntry>;
      purchase_entry_items: ReadTable<PriceItem>;
    };
  };
};
const db = supabase as unknown as SupabaseClient<PriceDatabase>;
async function allRows<T>(
  read: (offset: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await read(offset);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}
export function usePurchasePrices() {
  return useQuery({
    queryKey: ["purchase-price-history"],
    staleTime: 15000,
    refetchInterval: 60000,
    queryFn: async () => {
      const [movements, items, entries] = await Promise.all([
        allRows((offset) =>
          db
            .from("stock_movements")
            .select(
              "id,product_id,type,unit_cost,measure_unit,created_at,quantity,quantity_value,purchase_order_id,batch_id,supplier_id,document_type,folio",
            )
            .eq("type", "entrada")
            .order("created_at", { ascending: false })
            .order("id")
            .range(offset, offset + 999),
        ),
        allRows((offset) =>
          db
            .from("purchase_entry_items")
            .select(
              "id,product_id,unit_price,unit,created_at,quantity,stock_movement_id,purchase_entry_id",
            )
            .order("created_at", { ascending: false })
            .order("id")
            .range(offset, offset + 999),
        ),
        allRows((offset) =>
          db
            .from("purchase_entries")
            .select("id,cancelled_at")
            .order("id")
            .range(offset, offset + 999),
        ),
      ]);
      return buildPurchasePrices(movements, items, entries);
    },
  });
}
