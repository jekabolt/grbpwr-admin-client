// Helpers for the выкройка (cut pattern) upload primitive shared by the tech-card
// and fitting editors. The binary is uploaded via Admin.UploadPattern, which sniffs the
// bytes (PDF or DXF) and caps the size — we mirror those guards client-side for instant
// feedback before spending an upload round-trip.

export const MAX_PATTERN_BYTES = 40 * 1024 * 1024; // 40 MB — server hard limit (ASCII DXF is bulky)
export const MAX_PATTERN_FILENAME = 255; // server caps it; trim client-side
export const MAX_PATTERN_NAME = 255; // display name — server caps it; trim client-side

// What the file input offers. The server sniffs bytes authoritatively — this is UX only.
//
// TWO lists, because the two callers want different things and the difference is not a setting,
// it is what the file IS. A fitting sheet is a document a human READS — PDF is the right format
// for it and stays. A tech-card выкройка is geometry a machine cuts: only DXF carries the graded
// block names, the layers and the contours that the viewer, the раскладка and the piece matcher
// all read, so a PDF there is a dead end that merely looks filed.
export const PATTERN_FILE_ACCEPT = 'application/pdf,.pdf,.dxf,image/vnd.dxf';
export const PATTERN_FILE_ACCEPT_DXF = '.dxf,image/vnd.dxf';

// Accept by declared MIME or extension — some browsers leave file.type blank for PDFs.
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

// DXF has no reliable browser MIME (usually blank or octet-stream) — the extension is the
// only useful pre-flight signal; the server sniffs the actual bytes.
export function isDxfFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.dxf');
}

// The stored object's extension carries the file type (there is no content-type field
// anywhere in the contract) — the server names the object .pdf or .dxf from its sniff.
// Decided on the url PATH, so a future query string (presigned/versioned urls) cannot
// silently reroute every DXF into the PDF viewer branch.
export function isDxfUrl(url?: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.dxf');
  } catch {
    return url.split('?')[0].split('#')[0].toLowerCase().endsWith('.dxf');
  }
}

// Trim to at most `maxBytes` of UTF-8 without splitting a code point — the server caps
// name/filename by BYTES (Go len()), so a 255-char Cyrillic name is 2× over the limit and
// would reject the whole save with an error the operator cannot attribute.
export function clampUtf8Bytes(s: string, maxBytes: number): string {
  const enc = new TextEncoder();
  if (enc.encode(s).length <= maxBytes) return s;
  let out = '';
  for (const ch of s) {
    if (enc.encode(out + ch).length > maxBytes) break;
    out += ch;
  }
  return out;
}

// The canonical write-side normalisation for a pattern display name.
export function clampPatternName(s: string): string {
  return clampUtf8Bytes(s.trim(), MAX_PATTERN_NAME);
}

// Pre-flight check shared by the pick and drop paths. Returns a user-facing error, or
// null when the file may be offered to the naming modal / upload.
//
// `dxfOnly` is OPT-IN and not the default on purpose. The server still accepts both formats, and
// so does the fitting editor, where a PDF sheet is exactly the right thing to attach. Making the
// restriction a caller's choice keeps the tighter rule where it belongs — the tech card, where a
// PDF cannot be laid out, matched to cut pieces or read for a size — instead of imposing it on
// every consumer of this helper.
export function patternFileError(file: File, opts?: { dxfOnly?: boolean }): string | null {
  if (opts?.dxfOnly) {
    if (!isDxfFile(file)) return 'DXF only — a PDF is no longer accepted for tech card patterns.';
  } else if (!isPdfFile(file) && !isDxfFile(file)) {
    return 'PDF or DXF only.';
  }
  if (file.size > MAX_PATTERN_BYTES) return 'the file is too large — 40 MB at most.';
  return null;
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
  if (status === 400)
    return raw || 'the file is refused — a valid PDF or DXF is needed (up to 40 MB).';
  if (status && status >= 500) return 'upload error on the server — try again.';
  return raw || "couldn't upload the file.";
}
