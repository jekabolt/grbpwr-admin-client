// STOPFIX: what a run needs to come back after the importer was restarted under it.
//
// A stage that never yields (assemble, chains, the fill) cannot take the soft cancel: the client
// terminates the worker (worker/client.ts HARD_CANCEL_MS) and the worker's session dies with it.
// The wizard keeps its session and the operator's inputs; the worker's state is rebuilt by playing
// the stages that made it again, in order, with the inputs they were given — the RESTORE HISTORY.
//
// The history mirrors the WORKER's state, not the screen: a stage that ran drops what the worker
// dropped (session.ts `invalidateAfter`: every stage after it), and nothing else. `back` trims
// nothing on purpose — the worker keeps those outputs until a stage before them runs, and the
// pieces stage reads its own previous run (`separator`, appended wall edits): trimming on `back`
// would make the first pieces run after a restore differ from the run without the stop.
//
// Every replayed output is compared with the one recorded (`digestOf`): a stage that comes out
// different refuses the restore — the run never silently continues on another drawing.
import type { ImportSession, StageIO, StageName, WizardStep } from 'lib/pattern-import/types';

/** The worker's stage order (session.ts ORDER); a stage drops the state of every stage after it. */
const ORDER: readonly StageName[] = [
  'extract',
  'clean',
  'scale',
  'assemble',
  'chains',
  'sizes',
  'pieces',
  'semantics',
  'fabrics',
  'write',
];

/**
 * The stages whose run leaves state the next stages read. fabrics, write and the side stages
 * (render-som, render-pages) leave none a later stage reads: they are not replayed — their outputs
 * are on the wizard's session already. The AI calls are not stages: what they answered rides in
 * the recorded inputs (clean `aiHints`, the semantics overrides), so a restore never asks again.
 */
export const RESTORE_STAGES: ReadonlySet<StageName> = new Set<StageName>([
  'extract',
  'clean',
  'scale',
  'assemble',
  'chains',
  'sizes',
  'pieces',
  'semantics',
]);

export type RestoreEntry = {
  stage: StageName;
  input: StageIO[StageName]['in'];
  /** `digestOf` the output the stage gave. */
  digest: string;
};

const at = (s: StageName) => ORDER.indexOf(s);

/**
 * PATTERNS ("chains: assemble the sheet first"): the latest stage whose output the screen shows —
 * a stage before it that fails in a live worker has dropped what the screen still shows.
 */
export function shownStage(s: ImportSession): StageName | null {
  if (s.semantics) return 'semantics';
  if (s.pieces) return 'pieces';
  if (s.sizes) return 'sizes';
  if (s.chains) return 'chains';
  if (s.sheet) return 'assemble';
  if (s.scale.decision) return 'scale';
  if (s.clean) return 'clean';
  return null;
}

/** True when stage `failed` comes before stage `shown` in the worker's order. */
export const before = (failed: StageName, shown: StageName | null) =>
  shown != null && at(failed) >= 0 && at(failed) < at(shown);

/** The first stage "next" runs from a step (what a stop between two stages names). */
export function nextStageOf(step: WizardStep): StageName | null {
  switch (step) {
    case 'scale':
      return 'scale';
    case 'sheet':
      return 'chains';
    case 'sizes':
      return 'pieces';
    case 'pieces':
      return 'semantics';
    case 'meaning':
      return 'fabrics';
    case 'fabrics':
      return 'write';
    default:
      return null;
  }
}

/** The history once stage `s` ran (successfully or not, in a live worker): later stages dropped. */
export function pruneAfter(h: readonly RestoreEntry[], s: StageName): RestoreEntry[] {
  const k = at(s);
  if (k < 0) return [...h];
  return h.filter((e) => at(e.stage) <= k);
}

/** A copy of a stage input as the worker receives it (postMessage clones it). */
export function cloneInput<T>(input: T): T {
  try {
    return structuredClone(input);
  } catch {
    return input;
  }
}

/** Keys that carry the time a stage took or ran at, never what it found. */
const TIMING = new Set(['ms', 'durationMs', 'createdAt']);
/** A moment as text (a reader's `at` in the garment passport): when, never what. */
const ISO_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/;

/**
 * A 64-bit digest of a stage output: every value, in the order the stage built it, typed arrays by
 * their bytes; timing fields (`ms`, `durationMs`, `createdAt`) left out, a timestamp string read
 * as "a time". Equal digests = the same
 * output (a collision is not a concern at this size of history).
 */
export function digestOf(v: unknown): string {
  let h1 = 0xdeadbeef | 0;
  let h2 = 0x41c6ce57 | 0;
  const mix = (n: number) => {
    h1 = Math.imul(h1 ^ n, 2654435761);
    h2 = Math.imul(h2 ^ n, 1597334677);
  };
  const f64 = new Float64Array(1);
  const w = new Uint32Array(f64.buffer);
  const num = (x: number) => {
    f64[0] = x;
    mix(w[0]);
    mix(w[1]);
  };
  const str = (s: string) => {
    mix(s.length);
    for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i));
  };
  const bytes = (buf: ArrayBufferLike, off: number, len: number) => {
    mix(len);
    if (off % 4 === 0 && len % 4 === 0) {
      const u = new Uint32Array(buf, off, len / 4);
      for (let i = 0; i < u.length; i++) mix(u[i]);
      return;
    }
    const u = new Uint8Array(buf, off, len);
    for (let i = 0; i < u.length; i++) mix(u[i]);
  };
  const stack = new Set<object>();
  const walk = (x: unknown): void => {
    switch (typeof x) {
      case 'undefined':
        return mix(1);
      case 'boolean':
        return mix(x ? 3 : 4);
      case 'number':
        mix(5);
        return num(x);
      case 'string':
        mix(6);
        return str(x.length >= 20 && x.length <= 32 && ISO_TIME.test(x) ? '<time>' : x);
      case 'bigint':
        mix(13);
        return str(String(x));
      case 'function':
      case 'symbol':
        return mix(14);
    }
    if (x === null) return mix(2);
    const o = x as object;
    // a cycle (never on the wire; possible in-process) is one marker, not a loop
    if (stack.has(o)) return mix(15);
    stack.add(o);
    try {
      if (ArrayBuffer.isView(o)) {
        mix(7);
        str(o.constructor.name);
        return bytes(o.buffer, o.byteOffset, o.byteLength);
      }
      if (o instanceof ArrayBuffer) {
        mix(7);
        return bytes(o, 0, o.byteLength);
      }
      if (Array.isArray(o)) {
        mix(8);
        mix(o.length);
        for (const e of o) walk(e);
        return;
      }
      if (o instanceof Map) {
        mix(9);
        mix(o.size);
        for (const [k, e] of o) {
          walk(k);
          walk(e);
        }
        return;
      }
      if (o instanceof Set) {
        mix(10);
        mix(o.size);
        for (const e of o) walk(e);
        return;
      }
      if (typeof Blob !== 'undefined' && o instanceof Blob) {
        mix(11);
        num(o.size);
        return str(o.type);
      }
      if (o instanceof Date) {
        mix(16);
        return num(o.getTime());
      }
      mix(12);
      for (const k of Object.keys(o)) {
        if (TIMING.has(k)) continue;
        str(k);
        walk((o as Record<string, unknown>)[k]);
      }
    } finally {
      stack.delete(o);
    }
  };
  walk(v);
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(h2) + hex(h1);
}
