import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

// Shared parser for server-side field-tagged validation errors (PLM-rework Q1 + general).
//
// The gRPC gateway serialises a google.rpc.Status as { code, message, details: [...] }. A
// field-level validation failure is a google.rpc.BadRequest detail carrying fieldViolations —
// each { field, description }. api.ts attaches the raw `details` array to the thrown Error; this
// module turns those into per-field messages a form can show AT the field instead of a blind toast.

export type FieldViolation = { field: string; description: string };

type ErrorWithDetails = { status?: number; details?: unknown[]; message?: string };

function isBadRequestDetail(d: unknown): d is { fieldViolations?: unknown[] } {
  if (!d || typeof d !== 'object') return false;
  const t = (d as { '@type'?: unknown })['@type'];
  // Match by type URL suffix; also accept a bare object that already has fieldViolations.
  return (
    (typeof t === 'string' && t.endsWith('BadRequest')) ||
    Array.isArray((d as { fieldViolations?: unknown }).fieldViolations)
  );
}

// Pulls every { field, description } out of a caught error's BadRequest details. Returns [] for
// non-field errors (network, 5xx, plain-message 4xx) — the caller falls back to a toast.
export function extractFieldViolations(error: unknown): FieldViolation[] {
  const details = (error as ErrorWithDetails | undefined)?.details;
  if (!Array.isArray(details)) return [];
  const out: FieldViolation[] = [];
  for (const d of details) {
    if (!isBadRequestDetail(d)) continue;
    for (const v of d.fieldViolations ?? []) {
      const field = (v as { field?: unknown }).field;
      const description = (v as { description?: unknown }).description;
      if (typeof field === 'string' && typeof description === 'string') {
        out.push({ field, description });
      }
    }
  }
  return out;
}

// proto field paths are snake_case and may be array-indexed (`bom_items[2].name`) and/or wrapped in
// the request message (`tech_card.style_number`, `material.code`). Convert to an RHF dotted camelCase
// path: strip any wrapper prefix, snake→camel each segment, `[i]` → `.i`.
function toFormPath(field: string, stripPrefixes: string[]): string {
  let f = field.trim();
  for (const p of stripPrefixes) {
    const dotted = `${p}.`;
    if (f.startsWith(dotted)) {
      f = f.slice(dotted.length);
      break;
    }
  }
  return f
    .replace(/\[(\d+)\]/g, '.$1') // bom_items[2] -> bom_items.2
    .split('.')
    .map((seg) => seg.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()))
    .join('.');
}

export type ApplyFieldErrorsOptions = {
  // Explicit proto-field → form-field-path overrides (wins over the automatic conversion). Use for
  // fields whose form name diverges from the wire name.
  map?: Record<string, string>;
  // Request-wrapper prefixes to drop before conversion (e.g. 'tech_card', 'material').
  stripPrefixes?: string[];
  // Only these form paths may receive a server error; violations outside the set are returned
  // unmapped (so a stray/unknown field never silently pins onto the wrong input).
  allow?: (formPath: string) => boolean;
};

export type AppliedFieldErrors = {
  // Form paths that received a server error (in order), e.g. ['styleNumber', 'bomItems.2.name'].
  applied: string[];
  // Violations that could NOT be pinned to a field (unknown/global) — toast these.
  unmapped: FieldViolation[];
};

// Applies server field violations onto a react-hook-form via setError. Focuses the first pinned
// field. Generic over the form type so `form.setError` passes through with no cast.
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  options: ApplyFieldErrorsOptions = {},
): AppliedFieldErrors {
  const violations = extractFieldViolations(error);
  const applied: string[] = [];
  const unmapped: FieldViolation[] = [];
  const { map = {}, stripPrefixes = [], allow } = options;
  for (const v of violations) {
    const path = map[v.field] ?? toFormPath(v.field, stripPrefixes);
    if (!path || (allow && !allow(path))) {
      unmapped.push(v);
      continue;
    }
    setError(
      path as Path<T>,
      { type: 'server', message: v.description },
      { shouldFocus: applied.length === 0 },
    );
    applied.push(path);
  }
  return { applied, unmapped };
}

// Convenience: a single human-readable string for a caught error, preferring field violations.
export function fieldErrorSummary(error: unknown, fallback: string): string {
  const violations = extractFieldViolations(error);
  if (violations.length > 0) {
    return violations.map((v) => `${v.field}: ${v.description}`).join('; ');
  }
  return error instanceof Error ? error.message || fallback : fallback;
}
