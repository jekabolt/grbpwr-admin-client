// PATTERN-IMPORT · SIZESEP DUMP (probe only) — what the engine read as each size, for a picture of
// "each size's lines coloured by the engine's row vs the truth read from the drawing's key".
// ARCHIVE_SIZESEP=<dir> (archive-entry.ts) writes <dir>/<file>.json: every sheet path (page, op,
// sub, style, points in the sheet frame, 0.05 mm), every chain (its paths, motif, row), the rows
// (role, size label, evidence kinds, confidence), the size run, and every family candidate
// (rank, outcome, outline). The truth side is read from the paths alone (scripts in the lane's
// scratch: drawing order + glyph shapes against the key samples), never from the engine's rows.
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { furniture } from 'lib/pattern-import/chains/classify';
import type { ChainSet, PieceFamily, PtMm, Sheet, SizeRun } from 'lib/pattern-import/types';

const q = (v: number) => Math.round(v * 20) / 20;
const flat = (pts: readonly PtMm[], max: number) => {
  const step = Math.max(1, Math.ceil(pts.length / max));
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += step) out.push(q(pts[i].x), q(pts[i].y));
  const l = pts[pts.length - 1];
  if (l && (pts.length - 1) % step) out.push(q(l.x), q(l.y));
  return out;
};

export function sizesepDump(
  rel: string,
  S: {
    sheet: Sheet | null;
    chains: ChainSet | null;
    wallSet: ChainSet | null;
    families: PieceFamily[] | null;
    run: SizeRun | null;
  },
  dir: string,
): string | null {
  const sheet = S.sheet;
  const set = S.chains;
  if (!sheet || !set) return null;
  mkdirSync(dir, { recursive: true });
  // why each ignored line is page furniture (recomputed the way chains/build.ts does, file overlays
  // aside): the ignore rows carry no reason of their own
  let furn: (string | null)[] = [];
  try {
    furn = furniture(
      set.chains,
      new Map(sheet.styles.map((s) => [s.id, s])),
      sheet.poses,
      sheet.texts,
    );
  } catch {
    furn = [];
  }
  const ignored = new Set(set.classes.filter((k) => k.role === 'ignore').flatMap((k) => k.chains));
  const out = {
    furniture: Object.fromEntries(
      [...ignored].filter((i) => furn[i]).map((i) => [i, furn[i]] as const),
    ),
    rel,
    parts: sheet.parts ?? null,
    styles: sheet.styles.map((s) => [
      s.id,
      s.strokeRgb,
      q(s.widthMm),
      s.dash?.map((v) => Math.round(v * 1000) / 1000) ?? null,
      s.fill ? 1 : 0,
      s.layer,
    ]),
    paths: sheet.paths.map((p) => [
      p.id,
      p.src.page,
      p.src.op,
      p.src.sub,
      p.style,
      p.closed ? 1 : 0,
      p.background ?? null,
      flat(p.pts, 400),
    ]),
    texts: sheet.texts.map((t) => [t.text, q(t.anchor.x), q(t.anchor.y), q(t.fontSizeMm)]),
    chains: set.chains.map((c) => [
      c.id,
      c.style,
      c.motif,
      c.closed ? 1 : 0,
      q(c.lengthMm),
      [...new Set(c.ranges.map((r) => r.path))],
      flat(c.pts, 2000),
    ]),
    classes: set.classes.map((k) => ({
      id: k.id,
      role: k.role,
      size: k.sizeLabel,
      conf: k.confidence,
      sig: k.sig ?? null,
      len: Math.round(k.totalLengthMm),
      ev: k.evidence.map((e) =>
        e.kind === 'legend-sample'
          ? `legend-sample:${e.label}:${e.score.toFixed(2)}/${e.second.toFixed(2)}:${e.alike.join('|')}${e.nestingOnly ? ':nestingOnly' : ''}`
          : e.kind === 'nesting-order'
            ? `nesting-order:${e.rank}`
            : e.kind === 'declared-dash'
              ? `declared-dash:${e.dash.map((v) => v.toFixed(2)).join('/')}`
              : e.kind === 'recovered-motif'
                ? `recovered-motif:${e.motif.join('/')}`
                : e.kind === 'face-stray'
                  ? `face-stray:${e.why}`
                  : e.kind,
      ),
      chains: k.chains,
    })),
    wallClasses:
      S.wallSet && S.wallSet !== set
        ? S.wallSet.classes.map((k) => ({
            id: k.id,
            role: k.role,
            size: k.sizeLabel,
            chains: k.chains,
          }))
        : null,
    orphans: set.orphans,
    ambiguities: (set.ambiguities ?? []).map((a) => ({
      kind: a.kind,
      message: a.message,
      classes: a.classes,
      n: a.chains.length,
    })),
    run: S.run
      ? {
          encoding: S.run.encoding,
          sizes: S.run.sizes.map((s) => [s.label, s.rank, s.classId]),
        }
      : null,
    families: (S.families ?? []).map((f) => ({
      seed: f.seed,
      cands: f.candidates.map((c) => [c.rank, c.outcome, flat(c.outer ?? [], 600)]),
    })),
  };
  const file = resolve(dir, `${basename(rel).replace(/\.pdf$/i, '')}.json`);
  writeFileSync(file, JSON.stringify(out));
  return file;
}
