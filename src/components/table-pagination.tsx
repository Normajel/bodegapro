import { pageWindow, type TablePageSize } from "@/lib/table-pagination";
export function TablePagination({
  id,
  label,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  disabled = false,
}: {
  id: string;
  label: string;
  total: number;
  page: number;
  pageSize: TablePageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: TablePageSize) => void;
  disabled?: boolean;
}) {
  const window = pageWindow(total, pageSize, page);
  return (
    <nav
      aria-label={`Paginación de ${label}`}
      className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm"
    >
      <label htmlFor={`${id}-page-size`} className="flex items-center gap-2">
        Mostrar
        <select
          id={`${id}-page-size`}
          className="input w-20"
          value={pageSize}
          disabled={disabled}
          onChange={(e) => onPageSizeChange(e.target.value === "20" ? 20 : 10)}
        >
          <option value="10">10</option>
          <option value="20">20</option>
        </select>
        registros
      </label>
      <span aria-live="polite">
        {disabled ? "Cargando…" : `${window.first}–${window.last} de ${total}`}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn btn-secondary"
          type="button"
          disabled={disabled || window.page === 0}
          onClick={() => onPageChange(window.page - 1)}
        >
          Anterior
        </button>
        <span>
          Página {window.page + 1} de {window.pageCount}
        </span>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={disabled || window.page + 1 >= window.pageCount}
          onClick={() => onPageChange(window.page + 1)}
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}
