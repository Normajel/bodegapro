import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { useSpecialProducts } from "@/hooks/use-special-products";
import { SpecialProductModal } from "./special-product-modal";
import type { SpecialProduct } from "@/lib/special-products";
import { money } from "@/lib/warehouse";

export function SpecialProductSelector({
  value,
  onSelect,
  disabled = false,
}: {
  value: string;
  onSelect: (product: SpecialProduct) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const { data: products = [], isPending, isError, refetch } = useSpecialProducts();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const selected = products.find((p) => p.id === value);
  const normalized = search.trim().toLocaleLowerCase("es");
  const matches = products.filter((p) =>
    `${p.name} ${p.sku}`.toLocaleLowerCase("es").includes(normalized),
  );
  return (
    <div className="min-w-64 space-y-1">
      <label className="sr-only" htmlFor={id}>
        Descripción del producto especial
      </label>
      <div className="flex gap-1">
        <input
          id={id}
          className="input min-w-0 flex-1 bg-yellow-50 dark:bg-yellow-950"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-results`}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          placeholder="Buscar descripción o SKU ESP…"
          value={open ? search : selected ? `${selected.sku} · ${selected.name}` : ""}
          onFocus={() => {
            setOpen(true);
            setSearch("");
          }}
          onBlur={(e) => {
            if (!e.currentTarget.parentElement?.parentElement?.contains(e.relatedTarget))
              setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              e.stopPropagation();
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              document.getElementById(`${id}-option-0`)?.focus();
            }
            if (e.key === "Enter" && open) {
              e.preventDefault();
              if (matches[0]) {
                onSelect(matches[0]);
                setOpen(false);
              }
            }
          }}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled}
          aria-label="Nuevo producto especial"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {open && !disabled && (
        <div
          id={`${id}-results`}
          role="listbox"
          aria-label="Productos especiales"
          className="max-h-48 overflow-y-auto rounded border bg-background p-1"
        >
          {isPending && <p className="p-2 text-sm">Cargando productos especiales…</p>}
          {isError && (
            <button type="button" className="btn btn-secondary" onClick={() => refetch()}>
              Error al cargar. Reintentar
            </button>
          )}
          {!isPending && !isError && matches.length === 0 && (
            <p className="p-2 text-sm">No existe. Usa + para crearlo.</p>
          )}
          {matches.map((p, index) => (
            <button
              key={p.id}
              id={`${id}-option-${index}`}
              type="button"
              role="option"
              aria-selected={p.id === value}
              className="block w-full rounded bg-yellow-50 p-2 text-left text-sm hover:bg-yellow-100 dark:bg-yellow-950"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(p);
                setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                  document.getElementById(id)?.focus();
                }
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  document
                    .getElementById(
                      `${id}-option-${Math.max(0, Math.min(matches.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)))}`,
                    )
                    ?.focus();
                }
              }}
            >
              <strong>{p.sku}</strong> · {p.name}
              <span className="block text-xs text-muted-foreground">
                {p.unit} · Referencia {money(p.unit_cost)}
              </span>
            </button>
          ))}
        </div>
      )}
      <SpecialProductModal
        open={creating}
        initialName={search}
        onClose={() => setCreating(false)}
        onSaved={(p) => {
          onSelect(p);
          setOpen(false);
          setSearch("");
        }}
      />
    </div>
  );
}
