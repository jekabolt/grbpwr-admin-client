import type { common_StockChange } from 'api/proto-http/admin';

function escapeCsvCell(value: string): string {
  const s = String(value ?? '').replace(/"/g, '""');
  return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r') ? `"${s}"` : s;
}

function formatSource(source: string | undefined): string {
  if (!source) return '';
  return source.replace('STOCK_CHANGE_SOURCE_', '').replace(/_/g, ' ').toLowerCase();
}

function formatChange(value: string | undefined): string {
  if (value == null || value === '') return '';
  const n = Number(value);
  const sign = n >= 0 ? '+' : '';
  return `${sign}${value}`;
}

function formatDate(value: string | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleString();
}

interface SizeOption {
  id?: number;
  name?: string;
}

export function stockChangesToCsv(changes: common_StockChange[], sizes: SizeOption[] = []): string {
  const sizeById = new Map(
    sizes.filter((s) => s.id != null).map((s) => [s.id!, s.name ?? String(s.id)]),
  );
  const headers = ['Size', 'Source', 'Change', 'Date', 'Order', 'Admin'];
  const rows = changes.map((c) => [
    c.sizeId != null ? sizeById.get(c.sizeId) ?? String(c.sizeId) : '',
    formatSource(c.source),
    formatChange(c.quantityDelta?.value),
    formatDate(c.createdAt),
    c.orderUuid ?? '',
    c.adminUsername ?? '',
  ]);
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
