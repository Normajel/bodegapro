import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { priceDirection } from "@/lib/purchase-prices";
const money = (n: number) => "$" + n.toLocaleString("es-CL", { maximumFractionDigits: 2 });
export function PriceTrend({
  current,
  previous,
}: {
  current: number;
  previous: number | undefined;
}) {
  const direction = priceDirection(current, previous);
  if (!direction)
    return (
      <span
        className="ml-1 text-xs text-muted-foreground"
        title="Sin compra anterior comparable del mismo producto y unidad"
        aria-label="Sin compra anterior comparable"
      >
        —
      </span>
    );
  const Icon = direction === "down" ? ArrowDown : direction === "up" ? ArrowUp : ArrowRight;
  const label =
    (direction === "down" ? "Bajó" : direction === "up" ? "Subió" : "Se mantiene") +
    ": " +
    money(current) +
    "; compra anterior " +
    money(previous!);
  const color =
    direction === "down"
      ? "text-green-600 dark:text-green-400"
      : direction === "up"
        ? "text-red-600 dark:text-red-400"
        : "text-yellow-600 dark:text-yellow-400";
  return (
    <span
      className={`ml-1 inline-flex align-middle ${color}`}
      title={label}
      role="img"
      aria-label={label}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}
