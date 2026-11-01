export type TablePageSize = 10 | 20;
export function pageWindow(total: number, pageSize: TablePageSize, requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(0, Math.min(requestedPage, pageCount - 1));
  const start = page * pageSize;
  const end = Math.min(start + pageSize, total);
  return { page, pageCount, start, end, first: total ? start + 1 : 0, last: end };
}

// Fetch complete sources before grouping documents or applying local filters.
// Database page boundaries must never split a logical purchase/sale document.
export async function fetchAllTableRows<Row>(
  read: (start: number, end: number) => PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await read(start, start + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}
