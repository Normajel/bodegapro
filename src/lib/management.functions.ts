import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canViewManagement } from "./management";
import { santiagoDateTimeIso } from "./warehouse";

export const getManagementData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        from: z.iso.date(),
        to: z.iso.date(),
      })
      .refine(
        (v) => v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000,
        "Selecciona un período de hasta un año",
      )
      .parse(input),
  )
  .handler(async ({ data: period, context }) => {
    const db = context.supabase;
    const { data: profile, error } = await db
      .from("profiles")
      .select("app_roles(name, permissions)")
      .eq("id", context.userId)
      .single();
    if (error || !canViewManagement(profile?.app_roles?.name, profile?.app_roles?.permissions))
      throw new Error("Acceso exclusivo para Admin y Gerencia");
    if (profile?.app_roles?.name === "ADMIN" && context.claims["aal"] !== "aal2")
      throw new Error("Verifica tu segundo factor");
    for (const module of ["inventory", "movements", "purchases", "cubication"]) {
      const permission = await db.rpc("has_app_permission", {
        module_name: module,
        action_name: "view",
      });
      if (permission.error || permission.data !== true)
        throw new Error(
          `Falta permiso de lectura en ${module}; no se mostrarán totales parciales.`,
        );
    }
    // Use the caller's JWT: existing RLS remains in force. No service key.
    const until = santiagoDateTimeIso(period.to, 24);
    const since = santiagoDateTimeIso(period.from);
    async function pages<T>(
      read: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
    ) {
      const rows: T[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await read(offset, offset + 999);
        if (result.error)
          throw new Error(
            "No se pudieron consultar los datos del panel. Revisa los permisos de lectura.",
          );
        rows.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < 1000) return rows;
      }
    }
    const [products, movements, orders, templates, items] = await Promise.all([
      pages((a, b) =>
        db
          .from("products")
          .select("id,name,category,unit,active,stock,stock_quantity,min_stock,unit_cost")
          .order("id")
          .range(a, b),
      ),
      pages((a, b) =>
        db
          .from("stock_movements")
          .select("id,product_id,type,quantity,quantity_value,unit_cost,created_at")
          .gte("created_at", since)
          .lt("created_at", until)
          .order("id")
          .range(a, b),
      ),
      pages((a, b) =>
        db
          .from("purchase_orders")
          .select("id,order_number,order_date,status,approval_status,total_amount,supplier_id")
          .gte("order_date", period.from)
          .lte("order_date", period.to)
          .order("id")
          .range(a, b),
      ),
      pages((a, b) =>
        db.from("cubication_templates").select("id,unit_code,updated_at").order("id").range(a, b),
      ),
      pages((a, b) =>
        db
          .from("cubication_template_items")
          .select("id,template_id,product_id,quantity")
          .order("id")
          .range(a, b),
      ),
    ]);
    return { products, movements, orders, templates, items, generatedAt: new Date().toISOString() };
  });
