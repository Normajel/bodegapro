import { santiagoDateTimeIso } from "@/lib/warehouse";
export const DISPATCH_METHODS = {
  correo_externo: "Correo externo",
  whatsapp: "WhatsApp",
  presencial: "Entrega presencial",
  otro: "Otro medio",
} as const;
export function santiagoLocalDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export function manualDispatchTimestamp(value: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59)
    throw new Error("Revisa la fecha y hora del envío");
  const date = new Date(
    Date.parse(santiagoDateTimeIso(match[1]!, Number(match[2]))) + Number(match[3]) * 60000,
  );
  if (santiagoLocalDateTime(date) !== value)
    throw new Error("La fecha u hora no es válida en Chile");
  return date.toISOString();
}
