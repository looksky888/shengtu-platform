type UnknownRecord = Record<string, unknown>;

function responseRecord(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}返回格式错误`);
  return value as UnknownRecord;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

export function assertItemsResponse<T>(value: unknown, label: string): asserts value is { items: T[] } {
  const record = responseRecord(value, label);
  if (!Array.isArray(record.items)) throw new Error(`${label}返回格式错误`);
}

export function assertOffsetPage<T>(value: unknown, label: string): asserts value is { items: T[]; total: number; page: number; page_size: number } {
  assertItemsResponse<T>(value, label);
  const record = value as unknown as UnknownRecord;
  if (!finiteNumber(record.total) || !finiteNumber(record.page) || !finiteNumber(record.page_size)) throw new Error(`${label}分页格式错误`);
}

export function assertCursorPage<T>(value: unknown, label: string): asserts value is { items: T[]; total: number; has_more: boolean; next_cursor: string; limit: number } {
  assertItemsResponse<T>(value, label);
  const record = value as unknown as UnknownRecord;
  if (!finiteNumber(record.total) || !finiteNumber(record.limit) || typeof record.has_more !== "boolean" || typeof record.next_cursor !== "string") throw new Error(`${label}分页格式错误`);
}
