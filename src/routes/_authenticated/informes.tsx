import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { dateKey, money, santiagoDateTimeIso } from "@/lib/warehouse";

export const Route = createFileRoute("/_authenticated/informes")({
  head: () => ({
    meta: [
      { title: "Informes — BodegaPro" },
      {
        name: "description",
        content: "Informes de inventario, stock crítico, movimientos y compras pendientes.",
      },
    ],
  }),
  component: InformesPage,
});

type ReportType =
  "prices" | "general-inventory" | "inventory" | "critical" | "movements" | "pending";
type PeriodPreset = "7days" | "30days" | "month" | "custom";
type ReportRow = { id: string; cells: (string | number)[]; searchText: string };

const REPORTS: { id: ReportType; label: string; description: string }[] = [
  {
    id: "prices",
    label: "Informe de Precios",
    description: "Compara fecha, proveedor y precio de las tres últimas compras del período.",
  },
  {
    id: "general-inventory",
    label: "Inventario General",
    description: "Consulta stock, última compra, documentos y stock crítico.",
  },
  {
    id: "inventory",
    label: "Inventario valorizado",
    description: "Stock actual y capital valorizado por producto.",
  },
  {
    id: "critical",
    label: "Stock crítico",
    description: "Productos bajo el mínimo y unidades que faltan para reponer.",
  },
  {
    id: "movements",
    label: "Movimientos",
    description: "Entradas y salidas con documento, responsable y valorización.",
  },
  {
    id: "pending",
    label: "Compras pendientes",
    description: "Órdenes abiertas, cantidades recibidas y saldos pendientes.",
  },
];

const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  parcial: "Recepción parcial",
};

function InformesPage() {
  const today = dateKey(new Date());
  const weekAgo = new Date(`${today}T12:00:00Z`);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);
  const [reportType, setReportType] = useState<ReportType>("prices");
  const [from, setFrom] = useState(weekAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("7days");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const validPeriod = from <= to;
  const {
    data: products = [],
    isLoading: productsLoading,
    isError: productsError,
  } = useQuery({
    queryKey: ["report-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, sku, category, stock_quantity, min_stock, unit, unit_cost, location, active",
        )
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled:
      reportType === "prices" ||
      reportType === "general-inventory" ||
      reportType === "inventory" ||
      reportType === "critical" ||
      reportType === "pending",
  });

  const {
    data: purchases = [],
    isLoading: purchasesLoading,
    isError: purchasesError,
  } = useQuery({
    queryKey: ["report-purchases", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select(
          "id, product_id, created_at, quantity_value, unit_cost, purchase_order, document_type, document_number, supplier_id, suppliers(name)",
        )
        .eq("type", "entrada")
        .gte("created_at", santiagoDateTimeIso(from))
        .lt("created_at", santiagoDateTimeIso(to, 24))
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: (reportType === "prices" || reportType === "general-inventory") && validPeriod,
  });

  const {
    data: movements = [],
    isLoading: movementsLoading,
    isError: movementsError,
  } = useQuery({
    queryKey: ["report-movements", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select(
          "id, created_at, type, quantity_value, measure_unit, unit_cost, document_type, document_number, reference, notes, unit_type, unit_type_value, purchase_order, suppliers(name), customers(name), products(name, sku)",
        )
        .gte("created_at", santiagoDateTimeIso(from))
        .lt("created_at", santiagoDateTimeIso(to, 24))
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: reportType === "movements" && validPeriod,
  });

  const {
    data: orders = [],
    isLoading: ordersLoading,
    isError: ordersError,
  } = useQuery({
    queryKey: ["report-pending-orders", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, order_number, supplier_id, status, created_at")
        .in("status", ["pendiente", "parcial"])
        .gte("created_at", santiagoDateTimeIso(from))
        .lt("created_at", santiagoDateTimeIso(to, 24))
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: reportType === "pending" && validPeriod,
  });

  const {
    data: orderItems = [],
    isLoading: orderItemsLoading,
    isError: orderItemsError,
  } = useQuery({
    queryKey: ["report-pending-order-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_order_items").select("*");
      if (error) throw error;
      return data;
    },
    enabled: reportType === "pending",
  });

  const {
    data: suppliers = [],
    isLoading: suppliersLoading,
    isError: suppliersError,
  } = useQuery({
    queryKey: ["report-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name");
      if (error) throw error;
      return data;
    },
    enabled: reportType === "pending",
  });

  const report = REPORTS.find((item) => item.id === reportType) ?? REPORTS[0]!;

  function changePeriodPreset(preset: PeriodPreset) {
    setPeriodPreset(preset);
    if (preset === "custom") return;
    const start = new Date(`${today}T12:00:00Z`);
    if (preset === "7days") start.setUTCDate(start.getUTCDate() - 6);
    if (preset === "30days") start.setUTCDate(start.getUTCDate() - 29);
    setFrom(preset === "month" ? `${today.slice(0, 7)}-01` : start.toISOString().slice(0, 10));
    setTo(today);
  }
  const headers = useMemo(() => {
    switch (reportType) {
      case "prices":
        return [
          "SKU",
          "Descripción",
          "Cantidad",
          "Fecha última compra",
          "Proveedor última compra",
          "Precio última compra",
          "Fecha penúltima compra",
          "Proveedor penúltima compra",
          "Precio penúltima compra",
          "Fecha antepenúltima compra",
          "Proveedor antepenúltima compra",
          "Precio antepenúltima compra",
        ];
      case "general-inventory":
        return [
          "SKU",
          "Descripción",
          "Cantidad",
          "Fecha última compra",
          "Orden de compra",
          "Factura",
          "Guía de despacho",
          "Categoría",
          "Stock crítico",
          "Último precio",
        ];
      case "inventory":
        return [
          "SKU",
          "Producto",
          "Categoría",
          "Stock actual",
          "Unidad",
          "Costo unitario",
          "Valor stock",
          "Ubicación",
        ];
      case "critical":
        return [
          "SKU",
          "Producto",
          "Categoría",
          "Stock actual",
          "Stock mínimo",
          "Faltante",
          "Unidad",
          "Ubicación",
        ];
      case "movements":
        return [
          "Fecha",
          "Tipo",
          "Producto",
          "SKU",
          "Cantidad",
          "Unidad",
          "Costo unitario",
          "Valor movimiento",
          "Proveedor / Maestro",
          "Tipo documento",
          "Número documento",
          "Orden de compra",
          "Tipo de unidad",
          "Unidades",
          "Referencia",
          "Observaciones",
        ];
      case "pending":
        return [
          "Orden de compra",
          "Fecha",
          "Proveedor",
          "Estado",
          "Producto",
          "SKU",
          "Cantidad ordenada",
          "Cantidad recibida",
          "Cantidad pendiente",
          "Unidad",
          "Costo unitario",
          "Valor pendiente",
        ];
    }
  }, [reportType]);

  const rows = useMemo<ReportRow[]>(() => {
    switch (reportType) {
      case "prices": {
        const latestPurchases = new Map<string, (typeof purchases)[number][]>();
        for (const purchase of purchases) {
          const productPurchases = latestPurchases.get(purchase.product_id) ?? [];
          if (purchase.unit_cost !== null && productPurchases.length < 3) {
            productPurchases.push(purchase);
            latestPurchases.set(purchase.product_id, productPurchases);
          }
        }
        return products
          .filter((product) => product.active)
          .map((product) => {
            const history = latestPurchases.get(product.id) ?? [];
            const cells = [
              product.sku,
              product.name,
              Number(product.stock_quantity),
              ...[0, 1, 2].flatMap((index) => {
                const purchase = history[index];
                return [
                  purchase
                    ? new Date(purchase.created_at).toLocaleDateString("es-CL", {
                        timeZone: "America/Santiago",
                      })
                    : "",
                  purchase?.suppliers?.name ?? "",
                  purchase?.unit_cost == null ? "" : Number(purchase.unit_cost),
                ];
              }),
            ];
            return {
              id: product.id,
              cells,
              searchText: cells.join(" ").toLocaleLowerCase("es-CL"),
            };
          })
          .sort((a, b) => String(a.cells[1]).localeCompare(String(b.cells[1]), "es-CL"));
      }
      case "general-inventory": {
        const latestPurchase = new Map<string, (typeof purchases)[number]>();
        for (const purchase of purchases) {
          if (!latestPurchase.has(purchase.product_id)) {
            latestPurchase.set(purchase.product_id, purchase);
          }
        }
        return products
          .filter((product) => product.active)
          .map((product) => {
            const purchase = latestPurchase.get(product.id);
            const documentNumber = purchase?.document_number ?? "";
            const cells = [
              product.sku,
              product.name,
              Number(product.stock_quantity),
              purchase
                ? new Date(purchase.created_at).toLocaleDateString("es-CL", {
                    timeZone: "America/Santiago",
                  })
                : "",
              purchase?.purchase_order ?? "",
              purchase?.document_type === "factura" ? documentNumber : "",
              purchase?.document_type === "guia_despacho" ? documentNumber : "",
              product.category,
              Number(product.min_stock),
              purchase?.unit_cost == null ? "" : Number(purchase.unit_cost),
            ];
            return {
              id: product.id,
              cells,
              searchText: cells.join(" ").toLocaleLowerCase("es-CL"),
            };
          })
          .sort((a, b) => String(a.cells[1]).localeCompare(String(b.cells[1]), "es-CL"));
      }
      case "inventory":
        return products
          .filter((product) => product.active)
          .map((product) => {
            const stock = Number(product.stock_quantity);
            const unitCost = Number(product.unit_cost);
            const cells = [
              product.sku,
              product.name,
              product.category,
              stock,
              product.unit,
              unitCost,
              stock * unitCost,
              product.location ?? "",
            ];
            return {
              id: product.id,
              cells,
              searchText: cells.join(" ").toLocaleLowerCase("es-CL"),
            };
          })
          .sort((a, b) => String(a.cells[1]).localeCompare(String(b.cells[1]), "es-CL"));
      case "critical":
        return products
          .filter(
            (product) =>
              product.active && Number(product.stock_quantity) <= Number(product.min_stock),
          )
          .map((product) => {
            const stock = Number(product.stock_quantity);
            const minimum = Number(product.min_stock);
            const cells = [
              product.sku,
              product.name,
              product.category,
              stock,
              minimum,
              Math.max(0, minimum - stock),
              product.unit,
              product.location ?? "",
            ];
            return {
              id: product.id,
              cells,
              searchText: cells.join(" ").toLocaleLowerCase("es-CL"),
            };
          })
          .sort((a, b) => Number(b.cells[5]) - Number(a.cells[5]));
      case "movements":
        return movements.map((movement) => {
          const unitCost = movement.unit_cost === null ? "" : Number(movement.unit_cost);
          const movementValue =
            movement.unit_cost === null
              ? ""
              : Number(movement.quantity_value) * Number(movement.unit_cost);
          const cells = [
            new Date(movement.created_at).toLocaleString("es-CL", {
              timeZone: "America/Santiago",
              dateStyle: "short",
              timeStyle: "short",
            }),
            movement.type === "entrada" ? "Entrada" : "Salida",
            movement.products?.name ?? "",
            movement.products?.sku ?? "",
            Number(movement.quantity_value),
            movement.measure_unit ?? "",
            unitCost,
            movementValue,
            movement.suppliers?.name ?? movement.customers?.name ?? "",
            movement.document_type ?? "",
            movement.document_number ?? "",
            movement.purchase_order ?? "",
            movement.unit_type ?? "",
            movement.unit_type_value ?? "",
            movement.reference ?? "",
            movement.notes ?? "",
          ];
          return { id: movement.id, cells, searchText: cells.join(" ").toLocaleLowerCase("es-CL") };
        });
      case "pending": {
        const openOrderIds = new Set(orders.map((order) => order.id));
        return orderItems
          .filter((item) => openOrderIds.has(item.purchase_order_id))
          .map((item) => {
            const order = orders.find((entry) => entry.id === item.purchase_order_id);
            const product = products.find((entry) => entry.id === item.product_id);
            const supplier = suppliers.find((entry) => entry.id === order?.supplier_id);
            const pending = Number(item.quantity) - Number(item.received_quantity);
            const cells = [
              order?.order_number ?? "",
              order
                ? new Date(order.created_at).toLocaleDateString("es-CL", {
                    timeZone: "America/Santiago",
                  })
                : "",
              supplier?.name ?? "",
              STATUS_LABELS[order?.status ?? ""] ?? order?.status ?? "",
              product?.name ?? "",
              product?.sku ?? "",
              Number(item.quantity),
              Number(item.received_quantity),
              pending,
              item.measure_unit,
              Number(item.unit_cost),
              pending * Number(item.unit_cost),
            ];
            return {
              id: item.id,
              cells,
              searchText: cells.join(" ").toLocaleLowerCase("es-CL"),
            };
          })
          .filter((row) => Number(row.cells[8]) > 0);
      }
    }
  }, [movements, orderItems, orders, products, purchases, reportType, suppliers]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-CL");
    return term ? rows.filter((row) => row.searchText.includes(term)) : rows;
  }, [rows, search]);

  const isLoading =
    reportType === "prices" || reportType === "general-inventory"
      ? productsLoading || purchasesLoading
      : reportType === "movements"
        ? movementsLoading
        : reportType === "pending"
          ? ordersLoading || orderItemsLoading || productsLoading || suppliersLoading
          : productsLoading;
  const isError =
    reportType === "prices" || reportType === "general-inventory"
      ? productsError || purchasesError
      : reportType === "movements"
        ? movementsError
        : reportType === "pending"
          ? ordersError || orderItemsError || productsError || suppliersError
          : productsError;

  const summary = useMemo(() => {
    if (reportType === "prices" || reportType === "general-inventory") {
      return [{ label: "Productos", value: filteredRows.length.toLocaleString("es-CL") }];
    }
    if (reportType === "inventory") {
      return [
        { label: "Productos activos", value: filteredRows.length.toLocaleString("es-CL") },
        {
          label: "Unidades en stock",
          value: filteredRows
            .reduce((sum, row) => sum + Number(row.cells[3]), 0)
            .toLocaleString("es-CL"),
        },
        {
          label: "Valor total inventario",
          value: money(filteredRows.reduce((sum, row) => sum + Number(row.cells[6]), 0)),
        },
      ];
    }
    if (reportType === "critical") {
      return [
        { label: "Productos bajo mínimo", value: filteredRows.length.toLocaleString("es-CL") },
        {
          label: "Unidades por reponer",
          value: filteredRows
            .reduce((sum, row) => sum + Number(row.cells[5]), 0)
            .toLocaleString("es-CL"),
        },
        {
          label: "Productos sin stock",
          value: filteredRows
            .filter((row) => Number(row.cells[3]) <= 0)
            .length.toLocaleString("es-CL"),
        },
      ];
    }
    if (reportType === "movements") {
      return [
        { label: "Movimientos", value: filteredRows.length.toLocaleString("es-CL") },
        {
          label: "Unidades ingresadas",
          value: filteredRows
            .filter((row) => row.cells[1] === "Entrada")
            .reduce((sum, row) => sum + Number(row.cells[4]), 0)
            .toLocaleString("es-CL"),
        },
        {
          label: "Unidades despachadas",
          value: filteredRows
            .filter((row) => row.cells[1] === "Salida")
            .reduce((sum, row) => sum + Number(row.cells[4]), 0)
            .toLocaleString("es-CL"),
        },
        {
          label: "Valor informado",
          value: money(filteredRows.reduce((sum, row) => sum + (Number(row.cells[7]) || 0), 0)),
        },
      ];
    }
    return [
      {
        label: "Órdenes abiertas",
        value: new Set(filteredRows.map((row) => row.cells[0])).size.toLocaleString("es-CL"),
      },
      {
        label: "Unidades pendientes",
        value: filteredRows
          .reduce((sum, row) => sum + Number(row.cells[8]), 0)
          .toLocaleString("es-CL"),
      },
      {
        label: "Valor pendiente",
        value: money(filteredRows.reduce((sum, row) => sum + Number(row.cells[11]), 0)),
      },
    ];
  }, [filteredRows, reportType]);

  async function exportReport() {
    setExporting(true);
    try {
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      const sheet = workbook.addWorksheet(report.label.slice(0, 31));
      workbook.creator = "BodegaPro";
      sheet.addRow(headers);
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = {
        from: "A1",
        to: { row: Math.max(1, filteredRows.length + 1), column: headers.length },
      };
      sheet.columns = headers.map((header, index) => ({
        header,
        width: Math.min(32, Math.max(header.length + 2, index < 2 ? 24 : 18)),
        style: {
          numFmt:
            (reportType === "prices" && [5, 8, 11].includes(index)) ||
            (reportType === "general-inventory" && index === 9) ||
            (reportType === "inventory" && (index === 5 || index === 6)) ||
            (reportType === "movements" && (index === 6 || index === 7)) ||
            (reportType === "pending" && (index === 10 || index === 11))
              ? '"$"#,##0'
              : "General",
        },
      }));
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF28C00" },
      };
      filteredRows.forEach((row) => sheet.addRow(row.cells));
      const bytes = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `informe-${reportType}-${from}_a_${to}.xlsx`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo exportar el informe");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Informes</h1>
          <p className="text-sm text-muted-foreground">
            Consulta y exporta información clave de inventario, movimientos y compras.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={exportReport}
          disabled={isLoading || isError || exporting || filteredRows.length === 0}
        >
          <Download className="h-4 w-4" /> {exporting ? "Preparando…" : "Exportar Excel"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setReportType(item.id);
              setSearch("");
            }}
            className={`card p-4 text-left transition-colors hover:border-primary ${
              reportType === item.id ? "border-primary bg-primary/5" : ""
            }`}
            aria-pressed={reportType === item.id}
          >
            <span className="font-semibold">{item.label}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{item.description}</span>
          </button>
        ))}
      </div>

      <section className="card space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          {(reportType === "prices" ||
            reportType === "general-inventory" ||
            reportType === "movements" ||
            reportType === "pending") && (
            <>
              <div>
                <label className="label" htmlFor="report-period">
                  Período
                </label>
                <select
                  id="report-period"
                  className="input"
                  value={periodPreset}
                  onChange={(event) => changePeriodPreset(event.target.value as PeriodPreset)}
                >
                  <option value="7days">Últimos 7 días</option>
                  <option value="30days">Últimos 30 días</option>
                  <option value="month">Este mes</option>
                  <option value="custom">Personalizado</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="report-from">
                  Desde
                </label>
                <input
                  id="report-from"
                  type="date"
                  className="input"
                  value={from}
                  max={to}
                  onChange={(event) => {
                    setPeriodPreset("custom");
                    setFrom(event.target.value);
                  }}
                />
              </div>
              <div>
                <label className="label" htmlFor="report-to">
                  Hasta
                </label>
                <input
                  id="report-to"
                  type="date"
                  className="input"
                  value={to}
                  min={from}
                  onChange={(event) => {
                    setPeriodPreset("custom");
                    setTo(event.target.value);
                  }}
                />
              </div>
            </>
          )}
          <div className="min-w-[220px] flex-1">
            <label className="label" htmlFor="report-search">
              Buscar en el informe
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="report-search"
                className="input pl-9"
                placeholder="Producto, SKU, proveedor, categoría…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
        </div>
        {!validPeriod &&
          (reportType === "prices" ||
            reportType === "general-inventory" ||
            reportType === "movements" ||
            reportType === "pending") && (
            <p className="text-sm text-destructive">
              La fecha inicial debe ser anterior o igual a la fecha final.
            </p>
          )}
        <p className="text-sm text-muted-foreground">{report.description}</p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((item) => (
          <div className="card p-4" key={item.label}>
            <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
            <p className="mt-1 font-display text-xl font-bold">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table
          className={`table-base ${reportType === "prices" ? "min-w-[1450px]" : "min-w-[850px]"}`}
        >
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={headers.length} className="py-8 text-center text-muted-foreground">
                  Cargando informe…
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={headers.length} className="py-8 text-center text-destructive">
                  No se pudo cargar este informe. Comprueba que las migraciones requeridas estén
                  aplicadas y vuelve a intentarlo.
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="py-8 text-center text-muted-foreground">
                  {rows.length === 0
                    ? "No hay datos para este informe."
                    : "No hay resultados para la búsqueda aplicada."}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id}>
                  {row.cells.map((cell, index) => {
                    const isMoney =
                      (reportType === "inventory" && (index === 5 || index === 6)) ||
                      (reportType === "prices" && [5, 8, 11].includes(index)) ||
                      (reportType === "general-inventory" && index === 9) ||
                      (reportType === "movements" && (index === 6 || index === 7)) ||
                      (reportType === "pending" && (index === 10 || index === 11));
                    return (
                      <td
                        key={`${row.id}-${index}`}
                        className={isMoney ? "whitespace-nowrap" : undefined}
                      >
                        {isMoney
                          ? cell === ""
                            ? "—"
                            : money(Number(cell))
                          : cell === ""
                            ? "—"
                            : cell}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-right text-xs text-muted-foreground">
        {filteredRows.length.toLocaleString("es-CL")}{" "}
        {filteredRows.length === 1 ? "resultado" : "resultados"}
        {search.trim() ? " con la búsqueda aplicada" : ""}.
      </p>
    </div>
  );
}
