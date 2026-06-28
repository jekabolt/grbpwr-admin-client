// Helpers for the PDF выкройка (cut pattern) upload primitive shared by the tech-card
// and fitting editors. The binary is uploaded via Admin.UploadPattern, which sniffs the
// %PDF- magic header and caps the size — we mirror those guards client-side for instant
// feedback before spending an upload round-trip.

export const MAX_PATTERN_BYTES = 25 * 1024 * 1024; // 25 MB — server hard limit
export const MAX_PATTERN_FILENAME = 255; // server caps it; trim client-side

// Accept by declared MIME or extension — some browsers leave file.type blank for PDFs.
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

// FileReader.readAsDataURL yields "data:application/pdf;base64,JVBERi0…"; UploadPattern
// wants the raw base64 only.
export function stripDataUrlPrefix(dataUrl: string): string {
  const marker = 'base64,';
  const i = dataUrl.indexOf(marker);
  return i >= 0 ? dataUrl.slice(i + marker.length) : dataUrl;
}

// Human-readable file size for the download row (e.g. "180 KB", "1.4 MB").
export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

// Maps an UploadPattern failure to a tailor-facing message. The grpc-gateway surfaces the
// gRPC code as an HTTP status on the thrown error: INVALID_ARGUMENT → 400 ("fix the file"),
// INTERNAL → 5xx ("retry").
export function patternUploadErrorMessage(error: unknown): string {
  const status = (error as { status?: number })?.status;
  const raw = error instanceof Error ? error.message : '';
  if (status === 400) return raw || 'Файл отклонён — нужен корректный PDF (до 25 МБ).';
  if (status && status >= 500) return 'Ошибка загрузки на сервере — попробуйте ещё раз.';
  return raw || 'Не удалось загрузить файл.';
}
