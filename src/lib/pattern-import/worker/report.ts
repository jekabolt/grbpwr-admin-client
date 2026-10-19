// The "download error report" payload (M5) and the import's structured console log.
//
// When a stage fails or the gate blocks, the operator can save one JSON file that is enough to
// reproduce the run on a developer's machine WITHOUT the files themselves: versions, every file's
// name / size / sha256 (ask for the file, check it is the same one), the failing stage and its
// error, the gate reports, the size map and every decision the operator made. No file contents:
// no bytes, no DXF text, no preview geometry. Main-thread safe: types only.
import type {
  GateReport,
  ImportErrorCode,
  ImportSession,
  SourceFileInfo,
  StageIO,
  StageName,
} from '../types';
import { MANIFEST_VERSION } from '../types';

/** One line of the import's timeline (also printed to the console with `LOG_PREFIX`). */
export type ImportLogEvent = {
  /** ms since the page loaded (performance.now), rounded. */
  t: number;
  event: 'open' | 'start' | 'end' | 'error' | 'cancel' | 'crash';
  stage?: StageName;
  ms?: number;
  code?: ImportErrorCode;
  message?: string;
  heapMb?: number | null;
};

export const LOG_PREFIX = '[pattern-import]';
const LOG_MAX = 200;

/** Ring buffer + console: one prefix, one line per event, errors at error level. */
export class ImportLog {
  readonly events: ImportLogEvent[] = [];
  push(e: Omit<ImportLogEvent, 't'>): void {
    const ev: ImportLogEvent = { t: Math.round(now()), ...e };
    this.events.push(ev);
    if (this.events.length > LOG_MAX) this.events.splice(0, this.events.length - LOG_MAX);
    const parts = [
      e.event,
      e.stage,
      e.ms != null ? `${e.ms} ms` : undefined,
      e.code,
      e.heapMb != null ? `heap ${e.heapMb} MB` : undefined,
      e.message,
    ].filter((x) => x != null && x !== '');
    const line = `${LOG_PREFIX} ${parts.join(' · ')}`;
    if (e.event === 'error' || e.event === 'crash') console.error(line);
    else console.info(line);
  }
}

const now = () =>
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

export type ErrorReport = {
  kind: 'grbpwr-pattern-import-error-report';
  reportVersion: 1;
  createdAt: string;
  versions: {
    /** Writer / client identity the wizard passes (`client.kind`, generator string). */
    generator: string;
    manifest: number;
    build: string | null;
    userAgent: string | null;
  };
  step: ImportSession['step'];
  failure: {
    stage: StageName | null;
    code: ImportErrorCode | null;
    message: string | null;
  } | null;
  files: Pick<SourceFileInfo, 'name' | 'bytes' | 'sha256' | 'kind' | 'pages' | 'producer'>[];
  extract: { warnings: string[]; presegmented: boolean; scanPages: number } | null;
  pages: { tile: number; other: number; sheets: number };
  scale: ImportSession['scale'];
  sheet: {
    tiles: number;
    missing: number;
    worstResidualMm: number;
    warnings: string[];
  } | null;
  chains: { classes: number; bundles: number; warnings: string[]; flags: number } | null;
  sizes: {
    run: StageIO['sizes']['out']['run'] | null;
    map: {
      source: string;
      rank: number;
      card: string | null;
      origin: string;
      confidence: number | null;
    }[];
    unmapped: string[];
  } | null;
  pieces: {
    seeds: number;
    families: { seed: number; outcomes: string; monotone: boolean }[];
  } | null;
  semantics: {
    pieces: { identity: string; seed: number; sizes: string[]; allowance: string }[];
    blocked: { seed: number; reason: string; detail: string }[];
    warnings: string[];
  } | null;
  gate: Record<string, GateReport>;
  /** Size of each written file (the text itself is not included). */
  written: { scope: string; filename: string; bytes: number; blocks: number }[];
  /** What the operator decided (`Inputs` with every File replaced by its name and size). */
  operator: unknown;
  timeline: ImportLogEvent[];
  memory: { heapMb: number | null; peakHeapMb: number | null };
};

export type ErrorReportInput = {
  session: ImportSession;
  /** The operator's inputs; File / Blob / ArrayBuffer values are replaced by a stub. */
  operator: unknown;
  failure?: { stage?: StageName | null; code?: ImportErrorCode | null; message?: string | null };
  extract?: { warnings: string[]; presegmented?: boolean; calibrations?: unknown[] } | null;
  generator: string;
  log?: readonly ImportLogEvent[];
  heapMb?: number | null;
  peakHeapMb?: number | null;
  now?: () => Date;
};

/** Values that are file CONTENTS never enter the report. */
function scrub(v: unknown, depth = 0): unknown {
  if (depth > 12) return '[deep]';
  if (v == null || typeof v !== 'object') return v;
  if (typeof File !== 'undefined' && v instanceof File)
    return { file: v.name, bytes: v.size, type: v.type };
  if (typeof Blob !== 'undefined' && v instanceof Blob) return { blob: v.size };
  if (v instanceof ArrayBuffer) return { bytes: v.byteLength };
  if (ArrayBuffer.isView(v)) return { bytes: v.byteLength };
  if (Array.isArray(v)) return v.map((x) => scrub(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    // DXF text, previews and renders are contents
    if (k === 'dxfText' || k === 'previewPaths' || k === 'chainPreview' || k === 'png') continue;
    out[k] = scrub(x, depth + 1);
  }
  return out;
}

export function buildErrorReport(i: ErrorReportInput): ErrorReport {
  const s = i.session;
  const nav = (globalThis as { navigator?: { userAgent?: string } }).navigator;
  const build =
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_BUILD_ID ??
    (import.meta as { env?: Record<string, string | undefined> }).env?.MODE ??
    null;
  const failure =
    i.failure || s.error
      ? {
          stage: i.failure?.stage ?? null,
          code: i.failure?.code ?? null,
          message: i.failure?.message ?? s.error ?? null,
        }
      : null;
  const sheet = s.sheet?.sheet;
  return {
    kind: 'grbpwr-pattern-import-error-report',
    reportVersion: 1,
    createdAt: (i.now ?? (() => new Date()))().toISOString(),
    versions: {
      generator: i.generator,
      manifest: MANIFEST_VERSION,
      build,
      userAgent: nav?.userAgent ?? null,
    },
    step: s.step,
    failure,
    files: s.files.map((f) => ({
      name: f.name,
      bytes: f.bytes,
      sha256: f.sha256,
      kind: f.kind,
      pages: f.pages,
      ...(f.producer ? { producer: f.producer } : {}),
    })),
    extract: i.extract
      ? {
          warnings: i.extract.warnings,
          presegmented: !!i.extract.presegmented,
          scanPages: i.extract.calibrations?.length ?? 0,
        }
      : null,
    pages: {
      tile: s.pages.filter((p) => p.cls === 'tile').length,
      other: s.pages.filter((p) => p.cls !== 'tile').length,
      sheets: new Set(s.pages.filter((p) => p.cls === 'tile').map((p) => p.sheet)).size,
    },
    scale: s.scale,
    sheet: sheet
      ? {
          tiles: sheet.poses.length,
          missing: sheet.missing.length,
          worstResidualMm: Math.max(0, ...sheet.poses.map((p) => p.residualMm)),
          warnings: sheet.warnings ?? [],
        }
      : null,
    chains: s.chains
      ? {
          classes: s.chains.classes.length,
          bundles: s.chains.bundles.length,
          warnings: s.chains.warnings,
          flags: s.chains.ambiguities?.length ?? 0,
        }
      : null,
    sizes: s.sizes
      ? {
          run: s.sizes.run,
          map: s.sizes.map.entries.map((e) => ({
            source: e.source.label,
            rank: e.source.rank,
            card: e.card?.token ?? null,
            origin: e.origin,
            confidence: e.confidence ?? null,
          })),
          unmapped: s.sizes.map.unmapped.map((c) => c.token),
        }
      : null,
    pieces: s.pieces
      ? {
          seeds: s.pieces.seeds.length,
          families: s.pieces.families.map((f) => ({
            seed: f.seed,
            outcomes: f.candidates.map((c) => c.outcome).join(','),
            monotone: f.monotone,
          })),
        }
      : null,
    semantics: s.semantics
      ? {
          pieces: s.semantics.pieces.map((p) => ({
            identity: p.identity,
            seed: p.seed,
            sizes: p.sizes.map((z) => z.sizeToken),
            allowance: `${p.allowance.meaning} ${p.allowance.allowanceMm} mm (${p.allowance.origin})`,
          })),
          blocked: s.semantics.blocked.map((b) => ({
            seed: b.seed,
            reason: b.reason,
            detail: b.detail,
          })),
          warnings: s.semantics.warnings,
        }
      : null,
    gate: s.gate,
    written: (s.draft?.scopes ?? []).map((d) => ({
      scope: d.target.scopeKey,
      filename: d.filename,
      bytes: d.dxfText.length,
      blocks: d.manifest.blocks.length,
    })),
    operator: scrub(i.operator),
    timeline: [...(i.log ?? [])],
    memory: { heapMb: i.heapMb ?? null, peakHeapMb: i.peakHeapMb ?? null },
  };
}

export const errorReportFilename = (r: ErrorReport) =>
  `pattern-import-report-${r.createdAt.replace(/[:.]/g, '-').slice(0, 19)}.json`;

/** Hands the report to the browser as a file (main thread). */
export function downloadErrorReport(r: ErrorReport): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = errorReportFilename(r);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
