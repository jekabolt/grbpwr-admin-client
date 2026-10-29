import { existsSync, readFileSync } from 'node:fs';

import type { common_TechCard } from 'api/proto-http/admin';
import { toWire, type EdgeAnchor, type StoredSeam } from 'lib/seams';

import card85Seams from './assembly-card85-seams.fixture.json';
import type { AssemblyInput } from './derive-assembly';

export const CARD85_REAL_INPUT =
  '/Users/jekabolt/go/src/github.com/jekabolt/grbpwr-admin-client-wt-asm-ink/proto-tmp/card85-asm-input.json';

type EncodedMap = { __map: [unknown, unknown][] };
type EncodedSet = { __set: unknown[] };
type RawAnchor = {
  pieceLineKey: string;
  samples: { u: number; v: number }[];
  perimShare: number;
  lenMm: number;
  notches: number;
  turnDeg: number;
  rangeFrom: number;
  rangeTo: number;
  edgeHint: string;
  contourSig: string;
};
type RawSeam = {
  seamKey: string;
  status: StoredSeam['status'];
  kind: StoredSeam['kind'];
  direction: StoredSeam['direction'];
  source: StoredSeam['source'];
  sideA: RawAnchor[];
  sideB: RawAnchor[];
  anchoredSize: string;
  note: string;
};

function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revive);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray((value as EncodedMap).__map))
    return new Map((value as EncodedMap).__map.map(([key, item]) => [revive(key), revive(item)]));
  if (Array.isArray((value as EncodedSet).__set))
    return new Set((value as EncodedSet).__set.map(revive));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, revive(item)]),
  );
}

const anchor = (row: RawAnchor): EdgeAnchor => ({
  piece: row.pieceLineKey,
  samples: row.samples.map(({ u, v }) => [u, v]),
  perimShare: row.perimShare,
  lenMm: row.lenMm,
  notches: row.notches,
  turnDeg: row.turnDeg,
  range: row.rangeFrom === 0 && row.rangeTo === 0 ? [0, 1] : [row.rangeFrom, row.rangeTo],
  edgeHint: row.edgeHint,
  contourSig: row.contourSig,
});

export const card85RealFixtureAvailable = () =>
  existsSync(CARD85_REAL_INPUT);

/** The untrimmed 2.3 MB card 85 capture (outside the repo; skipped when absent) plus its 25 stored beta seams. */
export function card85RealFixture(): AssemblyInput {
  const base = revive(JSON.parse(readFileSync(CARD85_REAL_INPUT, 'utf8'))) as AssemblyInput;
  const overlay = card85Seams as unknown as { seams: RawSeam[] };
  return {
    ...base,
    techCard: {
      ...base.techCard,
      seams: overlay.seams.map(
        (row) =>
          toWire({
            seamKey: row.seamKey,
            status: row.status,
            kind: row.kind,
            direction: row.direction,
            source: row.source,
            sideA: row.sideA.map(anchor),
            sideB: row.sideB.map(anchor),
            anchoredSize: row.anchoredSize,
            note: row.note,
          }) as NonNullable<common_TechCard['seams']>[number],
      ),
    },
  };
}
