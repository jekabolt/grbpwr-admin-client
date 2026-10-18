// PASSPORT — the manifest's digest (≤ 2 KB, PASSPORT.md "Где хранится"): written from the worker's
// passport, read back shape-tolerantly like the autopilot record (manifest/index.ts): a digest that
// is not an object of version 1 reads as absent, an entry that does not validate is left out, and
// what is kept is rebuilt from validated fields only — never the input object cast to the type.

import {
  PASSPORT_DIGEST_MAX,
  type CutMode,
  type EvidenceClass,
  type FactStatus,
  type GarmentPassport,
  type OutlineMeaning,
  type PassportDigest,
} from './types';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const CLASSES: readonly EvidenceClass[] = [
  'text',
  'structure',
  'geometry',
  'card',
  'ai',
  'operator',
];
const STATUSES: readonly FactStatus[] = [
  'read',
  'verified',
  'agreed',
  'conflict',
  'confirmed',
  'rejected',
];
const MODES: readonly CutMode[] = ['single', 'pair', 'fold', 'identical', 'mirrored', 'count'];
const MEANINGS: readonly OutlineMeaning[] = ['cut', 'seam', 'both'];
const LIST_MAX = 60;

/** The digest of a passport, cut to fit `PASSPORT_DIGEST_MAX` bytes of JSON. */
export function passportDigest(p: GarmentPassport): PassportDigest {
  const identityOf = new Map(
    p.pieces.flatMap((e) => (e.binding?.identity ? [[e.key, e.binding.identity] as const] : [])),
  );
  const d: PassportDigest = {
    v: 1,
    sourceDigest: /^[0-9a-f]{64}$/.test(p.sourceDigest) ? p.sourceDigest : '',
    readers: p.readers.slice(0, 4).map((r) => ({ kind: r.kind, rev: clip(r.rev, 32) })),
    category: p.garment.category ? clip(p.garment.category.value, 32) : null,
    outline: p.outline
      ? {
          value: p.outline.value,
          status: p.outline.status,
          classes: [...p.outline.classes],
          quote: p.outline.refs[0]?.quote ? clip(p.outline.refs[0].quote, 60) : null,
        }
      : null,
    allowance: p.allowance
      ? {
          included: p.allowance.value.included,
          mm: p.allowance.value.mm,
          classes: [...p.allowance.classes],
          quote: p.allowance.refs[0]?.quote ? clip(p.allowance.refs[0].quote, 100) : null,
        }
      : null,
    expected: p.pieces.slice(0, LIST_MAX).map((e) => ({
      key: clip(e.key, 8),
      label: e.label ? clip(e.label.value, 8) : null,
      name: clip(e.name.value, 24),
      qty: e.qty?.value.n ?? null,
      mode: e.qty?.value.mode ?? null,
      drawn: e.drawn?.value ?? null,
      cloth: e.cloth ? clip(e.cloth.value, 16) : null,
    })),
    bound: [...identityOf].slice(0, LIST_MAX).map(([key, identity]) => ({
      key: clip(key, 8),
      identity: clip(identity, 32),
    })),
    missing: (p.missing ?? []).slice(0, LIST_MAX).map((k) => clip(k, 8)),
    extra: (p.extra ?? []).slice(0, LIST_MAX).map((k) => clip(k, 32)),
  };
  // the budget: drop the tail of the lists (expected last-in first) until the JSON fits
  const size = () => JSON.stringify(d).length;
  while (size() > PASSPORT_DIGEST_MAX) {
    d.truncated = true;
    if (d.extra.length) d.extra.pop();
    else if (d.expected.length) {
      const e = d.expected.pop()!;
      d.bound = d.bound.filter((b) => b.key !== e.key);
      d.missing = d.missing.filter((k) => k !== e.key);
    } else if (d.bound.length) d.bound.pop();
    else if (d.missing.length) d.missing.pop();
    else break;
  }
  return d;
}

/**
 * SHAPE soft rule: the digest with the pieces whose written sizes carry different notch / drill
 * counts (from the manifest's blocks — what the file holds). Kept within the budget: the list is
 * cut from its tail (`truncated`), and dropped only when even one entry does not fit.
 */
export function withShapeNotes(
  d: PassportDigest,
  notes: readonly { identity: string; note: string }[],
): PassportDigest {
  const rest: PassportDigest = { ...d };
  delete rest.shape;
  if (!notes.length) return rest;
  const out: PassportDigest = {
    ...rest,
    shape: notes
      .slice(0, LIST_MAX)
      .map((x) => ({ identity: clip(x.identity, 32), note: clip(x.note, 160) })),
  };
  while (out.shape!.length && JSON.stringify(out).length > PASSPORT_DIGEST_MAX) {
    out.shape!.pop();
    out.truncated = true;
  }
  if (!out.shape!.length) delete out.shape;
  return out;
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, n: number): string | null =>
  typeof x === 'string' && x.length <= n ? x : null;
const num = (x: unknown): number | null =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 10000 ? x : null;
const classesOf = (x: unknown): EvidenceClass[] | null =>
  Array.isArray(x) && x.length <= 6 && x.every((c) => CLASSES.includes(c as EvidenceClass))
    ? [...(x as EvidenceClass[])]
    : null;
const listOf = <T>(x: unknown, f: (y: unknown) => T | null): T[] =>
  Array.isArray(x) && x.length <= LIST_MAX
    ? x.flatMap((y) => {
        const v = f(y);
        return v == null ? [] : [v];
      })
    : [];

/** The digest as a manifest carries it; undefined when absent or not a version-1 object. */
export function readPassportDigest(x: unknown): PassportDigest | undefined {
  if (!isObj(x) || x.v !== 1) return undefined;
  const outline = isObj(x.outline)
    ? (() => {
        const o = x.outline as Record<string, unknown>;
        const classes = classesOf(o.classes);
        if (
          !MEANINGS.includes(o.value as OutlineMeaning) ||
          !STATUSES.includes(o.status as FactStatus) ||
          !classes
        )
          return null;
        return {
          value: o.value as OutlineMeaning,
          status: o.status as FactStatus,
          classes,
          quote: str(o.quote, 60),
        };
      })()
    : null;
  const allowance = isObj(x.allowance)
    ? (() => {
        const a = x.allowance as Record<string, unknown>;
        const classes = classesOf(a.classes);
        if (!classes) return null;
        return {
          included: typeof a.included === 'boolean' ? a.included : null,
          mm: num(a.mm),
          classes,
          quote: str(a.quote, 100),
        };
      })()
    : null;
  const expected = listOf(x.expected, (y) => {
    if (!isObj(y)) return null;
    const key = str(y.key, 8);
    const name = str(y.name, 24);
    if (!key || name == null) return null;
    return {
      key,
      label: str(y.label, 8),
      name,
      qty: num(y.qty),
      mode: MODES.includes(y.mode as CutMode) ? (y.mode as CutMode) : null,
      drawn: str(y.drawn, 16),
      cloth: str(y.cloth, 16),
    };
  });
  return {
    v: 1,
    sourceDigest: str(x.sourceDigest, 64) ?? '',
    readers: listOf(x.readers, (y): PassportDigest['readers'][number] | null => {
      if (!isObj(y)) return null;
      const kind = y.kind === 'det' ? 'det' : y.kind === 'ai' ? 'ai' : null;
      const rev = str(y.rev, 32);
      return kind && rev ? { kind, rev } : null;
    }).slice(0, 4),
    category: str(x.category, 32),
    outline,
    allowance,
    expected,
    bound: listOf(x.bound, (y) => {
      if (!isObj(y)) return null;
      const key = str(y.key, 8);
      const identity = str(y.identity, 32);
      return key && identity ? { key, identity } : null;
    }),
    missing: listOf(x.missing, (y) => str(y, 8)),
    extra: listOf(x.extra, (y) => str(y, 32)),
    ...(Array.isArray(x.shape)
      ? {
          shape: listOf(x.shape, (y) => {
            if (!isObj(y)) return null;
            const identity = str(y.identity, 32);
            const note = str(y.note, 160);
            return identity && note ? { identity, note } : null;
          }),
        }
      : {}),
    ...(x.truncated === true ? { truncated: true } : {}),
  };
}
