// PIECES BENCH — shared by the capture (dxf-shot-entry.ts, env PIECES_SNAPSHOT=1) and the replay
// (pieces-bench.ts). A snapshot is the worker Session as it enters the pieces stage: every field
// that survives a structured clone, plus the stage input. Replaying it runs the CURRENT pieces code
// on the recorded sheet, chains and size run — no PDF read, no sheet, chains or sizes step.
//
// What it can and cannot judge:
//   · pieces/*, seeds, fill, gfit, nest walk, automatic gap — replayed in full.
//   · chains/*, sizes/* (corners, dash trains, ranks) — NOT: their output is frozen in the
//     snapshot. A change there needs a fresh capture (a dxf-shot with PIECES_SNAPSHOT=1).
//   · steps after pieces (meaning, fabrics, check) — not run; the bench measures cells only.
import { createHash } from 'node:crypto';
import { deserialize, serialize } from 'node:v8';
import { gunzipSync, gzipSync } from 'node:zlib';

import type { PieceFamily, SizeMap, StageIO } from 'lib/pattern-import/types';
import { Session } from 'lib/pattern-import/worker/session';

export type RankInfo = { rank: number; label: string; exported: boolean };

export type PiecesSnapshot = {
  v: 1;
  id: string;
  /** 1-based index of this pieces call in the run (the autopilot calls the stage several times). */
  call: number;
  fields: Record<string, unknown>;
  /** Session fields that do not survive a structured clone (left undefined on replay). */
  skipped: string[];
  input: StageIO['pieces']['in'];
  /** null = no size map yet: every rank is listed. */
  ranks: RankInfo[] | null;
};

/** Fields not worth carrying: the parsed PDF (functions, huge) and preview bitmaps. */
const NEVER = new Set(['docs']);

export function captureSession(
  id: string,
  call: number,
  session: Session,
  input: StageIO['pieces']['in'],
): Buffer {
  const own = session as unknown as Record<string, unknown>;
  const fields: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const k of Object.keys(own)) {
    if (NEVER.has(k) || typeof own[k] === 'function') {
      skipped.push(k);
      continue;
    }
    try {
      serialize(own[k]);
      fields[k] = own[k];
    } catch {
      skipped.push(k);
    }
  }
  // the ranks the shot's cells.json lists: the size map's entries with a card size (exportedRanks)
  const map = own.sizeMap as SizeMap | null | undefined;
  const ranks: RankInfo[] | null = map
    ? map.entries.map((e) => ({
        rank: e.source.rank,
        label: e.source.label || '∅',
        exported: !!e.card,
      }))
    : null;
  // one serialize call keeps references shared between fields (run inside sizeMap, …) shared
  const snap: PiecesSnapshot = { v: 1, id, call, fields, skipped, input, ranks };
  return gzipSync(serialize(snap), { level: 6 });
}

export function readSnapshot(buf: Buffer): PiecesSnapshot {
  const s = deserialize(gunzipSync(buf)) as PiecesSnapshot;
  if (s.v !== 1) throw new Error(`pieces snapshot v${String(s.v)} — recapture`);
  return s;
}

/**
 * Caches the chains step leaves on the session that the pieces step derives again — dropped so a
 * change to seeds or faces takes effect (the recorded size run, map and expected sizes stay).
 */
const DERIVED = [
  'textSeeds',
  'codeHeld',
  'measureHeld',
  'sizeFaces',
  'faces',
  'pieceSession',
  'pieceKey',
];

export async function replaySnapshot(s: PiecesSnapshot): Promise<StageIO['pieces']['out']> {
  const session = Object.create(Session.prototype) as Session;
  Object.assign(session, deserializeClone(s.fields));
  const own = session as unknown as Record<string, unknown>;
  for (const k of DERIVED) own[k] = k === 'pieceKey' ? '' : null;
  return session.runStage('pieces', s.input, { progress: () => {}, checkCancel: () => {} });
}

/** A fresh copy per replay: the stage mutates session state. */
function deserializeClone<T>(v: T): T {
  return deserialize(serialize(v)) as T;
}

export type BenchCell = {
  size: string;
  outcome: string;
  from: string | null;
  repair: string | null;
  nest: unknown;
  derivedMm: number;
  gapRecovery: boolean;
  /** Fingerprint of the outline, its walls and area: a speed-only change must keep it. */
  geo?: string;
};
export type BenchPiece = {
  seed: number;
  label: string | null;
  at: { x: number; y: number } | null;
  cells: BenchCell[];
};

const len = (p: readonly { x: number; y: number }[]) =>
  p.reduce((a, q, k) => (k ? a + Math.hypot(q.x - p[k - 1].x, q.y - p[k - 1].y) : 0), 0);

/** The cells of a pieces output, as dxf-shot's cells.json lists them (exported ranks only). */
export function cellsOf(out: StageIO['pieces']['out'], ranks: RankInfo[] | null): BenchPiece[] {
  const label = new Map((ranks ?? []).map((r) => [r.rank, r.label]));
  const exp = ranks ? new Set(ranks.filter((r) => r.exported).map((r) => r.rank)) : null;
  return out.families.map((f: PieceFamily) => {
    const sd = out.seeds.find((x) => x.id === f.seed);
    return {
      seed: f.seed,
      label: sd?.text?.text?.slice(0, 32) ?? null,
      at: sd ? { x: Math.round(sd.at.x), y: Math.round(sd.at.y) } : null,
      cells: f.candidates
        .filter((c) => !exp || exp.has(c.rank))
        .map((c) => ({
          size: label.get(c.rank) ?? `r${c.rank}`,
          outcome: c.outcome,
          from: c.rankFrom ?? null,
          repair: c.repair?.kind ?? null,
          nest: c.nest ?? null,
          derivedMm: Math.round(
            (c.derived ?? []).reduce((a, d) => a + len(d.pts as { x: number; y: number }[]), 0),
          ),
          gapRecovery: !!c.gapRecovery,
          walk: c.walk
            ? {
                maxMm: +c.walk.maxMm.toFixed(1),
                overMm: Math.round(c.walk.overMm),
                ...(c.walk.open ? { open: true } : {}),
                ...(c.walk.verdict ? { verdict: c.walk.verdict } : {}),
                ...(c.walk.auto ? { auto: true } : {}),
              }
            : null,
          geo: createHash('md5')
            .update(
              JSON.stringify([
                c.outer.map((q) => [Math.round(q.x * 100), Math.round(q.y * 100)]),
                c.walls,
                Math.round(c.areaMm2),
                (c.derived ?? []).map((d) => d.pts.length),
              ]),
            )
            .digest('hex')
            .slice(0, 12),
        })),
    };
  });
}
