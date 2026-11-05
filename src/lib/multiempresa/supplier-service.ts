import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "./database.types";
import { loadMyCompanies } from "./company-api";

const db = supabase as unknown as SupabaseClient<Database>;
export type SupplierInput = {
  name: string;
  supplier_kind: "productos" | "servicios" | "ambos";
  email: string;
  phone: string;
  delivery_days: string;
};
async function authorize(companyId: string) {
  const company = (await loadMyCompanies()).find((option) => option.company.id === companyId);
  if (!company || !["ADMIN", "ADMINPRO", "GERENCIA", "GERENTE"].includes(company.role)) {
    throw new Error("No tienes permiso para registrar o modificar proveedores de esta empresa.");
  }
}
function validate(input: SupplierInput) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 160) throw new Error("El nombre debe tener entre 2 y 160 caracteres.");
  if (!["productos", "servicios", "ambos"].includes(input.supplier_kind)) throw new Error("Tipo de proveedor no válido.");
  const email = input.email.trim().toLowerCase();
  if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("Correo no válido.");
  const phone = input.phone.trim();
  if (phone.length > 40) throw new Error("Teléfono demasiado largo.");
  const days = input.delivery_days.trim();
  if (days && (!/^\d+$/.test(days) || Number(days) > 3650)) throw new Error("El plazo debe ser un número entero entre 0 y 3650.");
  return { name, supplier_kind: input.supplier_kind, email: email || null, phone: phone || null, delivery_days: days ? Number(days) : null };
}
export async function saveTenantSupplier(companyId: string, input: SupplierInput, supplierId?: string) {
  if (!companyId) throw new Error("Debes elegir una empresa.");
  await authorize(companyId);
  const payload = validate(input);
  if (supplierId) {
    const { data, error } = await db.from("suppliers").update(payload).eq("company_id", companyId).eq("id", supplierId).select("id").single();
    if (error) throw error;
    if (!data) throw new Error("El proveedor no se encuentra en esta empresa.");
    return data.id;
  }
  const { data, error } = await db.from("suppliers").insert({ company_id: companyId, ...payload }).select("id").single();
  if (error) throw error;
  if (!data) throw new Error("No se confirmó el registro.");
  return data.id;
}
