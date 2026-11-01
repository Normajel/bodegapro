import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { jsPDF } from "npm:jspdf@4.2.1";
import { autoTable } from "npm:jspdf-autotable@5.0.9";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const terms = (value: string) =>
  (
    ({
      contado: "Contado",
      credito_10_dias: "Crédito 10 días",
      credito_30_dias: "Crédito 30 días",
      credito_60_dias: "Crédito 60 días",
      credito_90_dias: "Crédito 90 días",
    }) as Record<string, string>
  )[value] ?? value;
const money = (v: number) => "$ " + Number(v).toLocaleString("es-CL", { maximumFractionDigits: 0 });
type Item = {
  description: string;
  quantity: number;
  measure_unit: string;
  unit_cost: number;
  line_total: number;
  item_type: string;
};
type Payload = {
  existing: boolean;
  event: { id: string; status: string; recipient: string; subject: string };
  order: {
    order_number: string;
    order_date: string;
    payment_terms: string;
    payment_terms_other: string | null;
    description: string | null;
    notes: string | null;
    net_total: number;
    vat_amount: number;
    total_amount: number;
    delivery_days: number | null;
  };
  supplier: { name: string; rut: string | null; address: string | null; email: string };
  company: {
    name: string;
    rut: string;
    address: string;
    business_activity: string;
    email: string;
  } | null;
  items: Item[];
};
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ message: "Método no permitido" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ message: "Debes iniciar sesión" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) return json({ message: "Sesión inválida" }, 401);
  let body: { order_id?: string; request_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ message: "Solicitud inválida" }, 400);
  }
  if (!uuid.test(body.order_id ?? "") || !uuid.test(body.request_id ?? ""))
    return json({ message: "Identificadores inválidos" }, 400);
  const { data, error } = await userClient.rpc("begin_purchase_order_email", {
    p_order_id: body.order_id,
    p_request_id: body.request_id,
  });
  if (error) return json({ message: error.message }, 403);
  const payload = data as Payload;
  if (payload.existing)
    return json(
      {
        status: payload.event.status,
        message:
          payload.event.status === "sent"
            ? "Este envío ya fue registrado"
            : "Consulta el historial de este intento antes de reenviar",
      },
      payload.event.status === "sent" ? 200 : 202,
    );
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const eventId = payload.event.id;
  async function record(status: string, detail: string, providerId: string | null = null) {
    const { error } = await admin
      .from("purchase_order_email_events")
      .update({
        status,
        error_message: detail || null,
        provider_id: providerId,
        sent_at: status === "sent" ? new Date().toISOString() : null,
      })
      .eq("id", eventId)
      .eq("status", "processing");
    return !error;
  }
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("PURCHASE_ORDER_FROM_EMAIL");
  if (!key || !from) {
    await record(
      "failed",
      "Servicio de correo sin configurar. Faltan RESEND_API_KEY y/o PURCHASE_ORDER_FROM_EMAIL.",
    );
    return json(
      {
        status: "failed",
        message:
          "El envío necesita configurar la clave de Resend y un remitente de dominio verificado en Supabase.",
      },
      503,
    );
  }
  let attachment: string;
  try {
    const { order: o, supplier: s, company: c, items } = payload;
    const doc = new jsPDF();
    doc.setFontSize(17);
    doc.text(c?.name || "INTEGRASTOCK", 14, 18);
    doc.setFontSize(10);
    const companyLines = [c?.rut && "RUT: " + c.rut, c?.business_activity, c?.address, c?.email]
      .filter(Boolean)
      .join("\n");
    doc.text(doc.splitTextToSize(companyLines, 180), 14, 26);
    doc.setFontSize(15);
    doc.text("Orden de compra " + o.order_number, 14, 53);
    doc.setFontSize(10);
    const header = [
      ["Fecha", o.order_date],
      ["Proveedor", s.name],
      ["RUT", s.rut || "—"],
      ["Dirección", s.address || "—"],
      ["Correo", payload.event.recipient],
      [
        "Condición de pago",
        o.payment_terms === "otro" ? o.payment_terms_other || "Otro" : terms(o.payment_terms),
      ],
      [
        "Plazo de productos",
        o.delivery_days == null
          ? "No aplica"
          : o.delivery_days + " días corridos desde el primer envío",
      ],
    ];
    autoTable(doc, { startY: 59, body: header, theme: "plain", styles: { fontSize: 9 } });
    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5,
      head: [["Producto / servicio", "Cantidad", "Unidad", "Precio neto", "Total neto"]],
      body: items.map((i) => [
        (i.item_type === "servicio" ? "Servicio: " : "") + i.description,
        String(i.quantity),
        i.measure_unit,
        money(i.unit_cost),
        money(i.line_total),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 40, 68] },
      margin: { bottom: 20 },
    });
    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5,
      body: [
        ["Neto", money(o.net_total)],
        ["IVA", money(o.vat_amount)],
        ["Total", money(o.total_amount)],
        ["Comentario", [o.description, o.notes].filter(Boolean).join("\n") || "—"],
      ],
      styles: { fontSize: 10 },
      theme: "plain",
    });
    attachment = doc.output("datauristring").split(",")[1]!;
  } catch {
    await record("failed", "No se pudo generar el PDF de la OC.");
    return json(
      { status: "failed", message: "No se pudo generar el PDF. No se envió correo." },
      500,
    );
  }
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        "Idempotency-Key": "purchase-order/" + eventId,
      },
      body: JSON.stringify({
        from,
        to: [payload.event.recipient],
        subject: payload.event.subject,
        text:
          "Adjuntamos la orden de compra " +
          payload.order.order_number +
          ". Por favor, confirme su recepción y el plazo de entrega acordado.",
        attachments: [{ filename: payload.order.order_number + ".pdf", content: attachment }],
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    await record(
      "unknown",
      "No se pudo confirmar la respuesta del proveedor de correo. Verificar en Resend antes de reenviar.",
    );
    return json(
      {
        status: "unknown",
        message: "Respuesta de correo sin confirmar. Revisa el historial antes de reenviar.",
      },
      502,
    );
  }
  if (!res.ok) {
    const failed = res.status >= 400 && res.status < 500;
    await record(
      failed ? "failed" : "unknown",
      "El proveedor de correo respondió HTTP " + res.status + ".",
    );
    return json(
      {
        status: failed ? "failed" : "unknown",
        message:
          "El proveedor de correo no confirmó el envío. Revisa la configuración y el historial.",
      },
      502,
    );
  }
  let provider: { id?: string };
  try {
    provider = await res.json();
  } catch {
    provider = {};
  }
  if (!provider.id) {
    await record("unknown", "El proveedor no devolvió una referencia de envío.");
    return json({ status: "unknown", message: "Envío por verificar en el proveedor." }, 502);
  }
  if (!(await record("sent", "", provider.id)))
    return json(
      {
        status: "unknown",
        message:
          "El proveedor aceptó el correo, pero falló el registro. No reenvíes: verifica el intento en Resend.",
      },
      502,
    );
  return json({ status: "sent", provider_id: provider.id });
});
