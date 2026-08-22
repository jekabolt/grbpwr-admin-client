import type { FieldErrors, FieldValues, Path, UseFormSetError } from 'react-hook-form';

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

// ПРИЧИНА ОТКАЗА — МАШИННЫЙ КОД, А НЕ ПОДСТРОКА В ПРЕДЛОЖЕНИИ.
//
// Проводная форма описания зафиксирована сервером (`internal/apisrv/apierr/apierr.go`,
// `fieldViolation`): `reason[ (used by …)][; howToFix]`. То есть код причины — ПРЕФИКС описания
// до первой `;` или `(`, а всё остальное — человеческий хвост. Искать в описании подстроку
// «required» значило бы поймать и «…; set a required value» из чужого howToFix.
//
// Когда `reason` пуст, сервер кладёт в описание свободный текст `ve.Message` — тогда префикс не
// совпадёт ни с одним кодом, и классификатор промолчит. Это правильный исход: неизвестная форма
// не классифицируется.
export function violationReason(description: string): string {
  return (description.split(/[;(]/)[0] ?? '').trim();
}

// ─── отказ ТРАНСПОРТА против отказа бизнес-правила ───────────────────────────────────────────────

// Строгий protojson admin-гейтвея (Ф2) отвечает на незнакомое поле и незнакомое имя члена enum
// телом `{"code":3,"message":"proto: (line 1:145): unknown field \"pressAction2\"","details":[]}`.
// Такой отказ означает ровно одно: приложение и бэкенд разной версии. Карточка НЕ сохранена,
// ничего не потеряно — RPC не звали вовсе, разбор тела кончился раньше.
//
// РАСПОЗНАЁТСЯ ПРЕФИКС ПРОТОКОЛА, А НЕ ФРАЗА «unknown field». Фразу умеет выдать и обычная
// бизнес-валидация: предикат сегмента email-рассылки заворачивает `segment: unknown field: "…"`
// в `InvalidArgument` БЕЗ BadRequest-details (`internal/apisrv/admin/email_campaign.go`), то есть
// даёт тот же код, ту же фразу и те же пустые details. Отличает их только префикс protojson: он
// есть у маршалера и не бывает у `status.Errorf`. Матчинг по фразе нарисовал бы баннер
// «расхождение версий» на обычной опечатке в поле сегмента.
//
// Контракт держит серверный тест `internal/api/http/marshaler_test.go` — он и красится первым,
// если бамп grpc-gateway изменит форму тела. Тогда пересобирается ЭТОТ распознаватель, а не тест.
const PROTOJSON_PREFIX = 'proto: (line ';
const PROTOJSON_PHRASES = ['unknown field', 'invalid value for enum field'];

// Возвращает серверное сообщение целиком (в нём имя виновника) — или null, если это не отказ
// транспорта.
export function transportRefusal(error: unknown): string | null {
  const e = error as ErrorWithDetails | undefined;
  if (!e || e.status !== 400) return null;
  // Отказ транспорта приходит БЕЗ поимённых нарушений: тело не разобралось, и полей, на которые
  // ругаться, у сервера ещё нет. Непустой BadRequest — это бизнес-валидация, её место у поля.
  if (extractFieldViolations(error).length > 0) return null;
  const raw = (error instanceof Error ? error.message : (e.message ?? '')) || '';
  if (!raw.includes(PROTOJSON_PREFIX)) return null;
  if (!PROTOJSON_PHRASES.some((p) => raw.includes(p))) return null;
  return raw;
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
  // ОТКАЗ, ПРОТИВОРЕЧАЩИЙ ЭКРАНУ, НЕ ПРИШПИЛИВАЕТСЯ К ПОЛЮ.
  //
  // «required» про поле, которое форма держит заполненным, — не ошибка человека и не ошибка поля:
  // сервер не узнал значения, потому что приложение и бэкенд разной версии. Покрасить поле
  // красным здесь значило бы соврать про человека («ты не заполнил») ровно в том случае, когда
  // он заполнил. Такое нарушение уходит в `contradictions` — и показывается баннером.
  contradicts?: (formPath: string, violation: FieldViolation) => boolean;
};

export type ContradictingViolation = { path: string; violation: FieldViolation };

export type AppliedFieldErrors = {
  // Form paths that received a server error (in order), e.g. ['styleNumber', 'bomItems.2.name'].
  applied: string[];
  // Violations that could NOT be pinned to a field (unknown/global) — toast these.
  unmapped: FieldViolation[];
  // Violations the caller's `contradicts` predicate disowned: the field is filled on screen and the
  // server says it is not. Nothing was pinned for these — they belong in a version-skew banner.
  contradictions: ContradictingViolation[];
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
  const contradictions: ContradictingViolation[] = [];
  const { map = {}, stripPrefixes = [], allow, contradicts } = options;
  for (const v of violations) {
    const path = map[v.field] ?? toFormPath(v.field, stripPrefixes);
    if (!path || (allow && !allow(path))) {
      unmapped.push(v);
      continue;
    }
    // Проверка стоит ПЕРЕД setError, а не после: пришпилить и потом снять значило бы мигнуть
    // красным на поле, которое ни в чём не виновато, и увести на него фокус.
    if (contradicts?.(path, v)) {
      contradictions.push({ path, violation: v });
      continue;
    }
    setError(
      path as Path<T>,
      { type: 'server', message: v.description },
      { shouldFocus: applied.length === 0 },
    );
    applied.push(path);
  }
  return { applied, unmapped, contradictions };
}

// ─── the other direction: RHF's own errors → a flat, addressable list ────────────────────────────

export type FlatFieldError = { path: string; message: string };

// RHF nests `errors` to mirror the form shape, so `Object.keys(errors)` only ever yields ROOT keys —
// `bomItems.3.name` collapses to `bomItems`, which is why a failed save could only ever name a tab.
// A leaf error node is `{ type, message?, ref? }`; a container is a plain object/array of nodes. The
// discriminator is that a leaf's `type`/`message` are STRINGS — a container that happens to own a
// field literally called `type` (labels[].type) holds an OBJECT there, so this never mis-splits.
function isLeafError(node: unknown): node is { message?: unknown; type?: unknown } {
  if (!node || typeof node !== 'object') return false;
  const n = node as { message?: unknown; type?: unknown };
  return typeof n.message === 'string' || typeof n.type === 'string';
}

// Flattens RHF FieldErrors into an ordered list of { path, message } with FULL dotted paths
// (`bomItems.3.name`), depth-first in schema order — so the first entry is the error to deep-link to.
// A leaf with no message still yields an entry (empty string) so a path is never silently dropped:
// an error we can't describe is still an error we must be able to point at.
export function flattenFieldErrors(errors: FieldErrors | undefined): FlatFieldError[] {
  const out: FlatFieldError[] = [];
  const walk = (node: unknown, prefix: string) => {
    if (!node || typeof node !== 'object') return;
    if (isLeafError(node)) {
      const message = (node as { message?: unknown }).message;
      out.push({ path: prefix, message: typeof message === 'string' ? message : '' });
      return;
    }
    for (const key of Object.keys(node)) {
      const child = (node as Record<string, unknown>)[key];
      if (child == null) continue;
      // RHF parks array-LEVEL issues (min length, a whole-array refine) under a synthetic `root`
      // key. There is no input registered at `x.root`, so address it as the array itself.
      walk(child, key === 'root' ? prefix : prefix ? `${prefix}.${key}` : key);
    }
  };
  walk(errors, '');
  return out;
}

// `bomItems.3.name` → `bomItems`. The root segment is what maps to an owning tab/section.
export function errorRootKey(path: string): string {
  return path.split('.')[0] ?? '';
}

// Pulse classes are listed as literals so Tailwind's source scan emits them — they are applied
// imperatively, not through JSX.
const FIELD_PULSE = ['animate-pulse', 'ring-2', 'ring-error', 'motion-reduce:animate-none'];

// Brings the field at a dotted RHF path into view and pulses it. `[data-field]` is stamped on every
// FormItem (ui/form), so this resolves ANY field in ANY form from its error path — including
// controls that register no focusable ref (Radix selects, pickers), which setFocus alone cannot
// reach. Returns false when the path has no rendered field, so the caller can retry or fall back.
export function revealField(path: string): boolean {
  const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(path)}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add(...FIELD_PULSE);
  window.setTimeout(() => el.classList.remove(...FIELD_PULSE), 2600);
  return true;
}

// One-line description of the first blocking error, always naming a concrete path — so a field that
// renders nowhere (or sits behind a branch the user isn't in) is still diagnosable instead of being
// a dead Save button. `(+N)` counts the rest.
export function firstErrorSummary(errors: FieldErrors | undefined): string {
  const flat = flattenFieldErrors(errors);
  if (flat.length === 0) return '';
  const [first] = flat;
  const rest = flat.length > 1 ? ` (+${flat.length - 1})` : '';
  return `${first.path}${first.message ? ` — ${first.message}` : ''}${rest}`;
}

// Convenience: a single human-readable string for a caught error, preferring field violations.
export function fieldErrorSummary(error: unknown, fallback: string): string {
  const violations = extractFieldViolations(error);
  if (violations.length > 0) {
    return violations.map((v) => `${v.field}: ${v.description}`).join('; ');
  }
  return error instanceof Error ? error.message || fallback : fallback;
}
