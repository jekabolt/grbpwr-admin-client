import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { sourcePieces } from 'lib/fusing-dxf/regenerate';
import { roundTrip } from 'lib/pattern-import/gate/roundtrip';
import { readGradeMapBlock, writeGradeMapBlock } from 'lib/pattern-import/manifest/grade-map-block';
import type { ManifestSize } from 'lib/pattern-import/types';
import { withGradeMap } from 'lib/pattern-import/write/grade-map';
import { buildFileMap } from './build';
import { compareMaps } from './compare';
import { fromSourceSize } from './index';
import { canonicalJson, gradeMapFromBytes } from './serialize';
import { gradeMapInputs, gradeMapOfParsed, gradeMapSources, middleSize } from './source';
import type { GmFile, GmSizeGeometry } from './types';

// Size dictionary rows the card files use (prod `size`, read 2026-11-12).
const DICT = [
  { id: 2, name: 'xs' },
  { id: 3, name: 's' },
  { id: 4, name: 'm' },
  { id: 5, name: 'l' },
  { id: 6, name: 'xl' },
];
const CARD = { sizeIds: [2, 3, 4, 5, 6], baseSizeId: 4 };
const manifestSizes: ManifestSize[] = DICT.map((d, rank) => ({
  token: d.name.toUpperCase(),
  sizeId: d.id,
  name: d.name,
  sourceLabel: d.name.toUpperCase(),
  rank,
}));
const refs = DICT.map((d, rank) => ({ id: d.id, tokens: [d.name], rank }));

const fixture = fileURLToPath(new URL('../fusing-dxf/card6-main-v10.fixture.dxf', import.meta.url));
// Prod DXFs of the phase-0 survey (local only, outside the repo).
const prodDir = fileURLToPath(new URL('../../../../tmp/plans/grademap/data/dxf/', import.meta.url));
const prod = existsSync(prodDir)
  ? readdirSync(prodDir).filter((f) => /^c(2|3|4|5|6|7|9|16)-.*\.dxf$/.test(f))
  : [];

const parse = async (text: string) => (await roundTrip(text)).pieces;

/** The map the runtime would build on the fly: fusing-dxf `sourcePieces` → the same builder. */
function onTheFly(
  pieces: Awaited<ReturnType<typeof parse>>,
  base: number,
): { file: GmFile; geo: Map<string, GmSizeGeometry[]> } | null {
  const prep = sourcePieces(
    pieces,
    [],
    [],
    new Map(),
    DICT as never,
    CARD.sizeIds,
    CARD.baseSizeId,
    null,
  );
  const sources = prep.pieces.map((p) => ({
    key: p.identity,
    ungraded: p.ungraded,
    sizes: p.sizes.map(fromSourceSize).filter((g) => g.sizeId),
  }));
  const inputs = gradeMapInputs(sources, CARD.sizeIds, base);
  if (!inputs.length) return null;
  return {
    file: buildFileMap(inputs, CARD.sizeIds, base).file,
    geo: new Map(sources.map((s) => [s.key.toLowerCase(), s.sizes])),
  };
}

describe('grade map source', { timeout: 300_000 }, () => {
  it('reads the same per-size geometry as sourcePieces', async () => {
    const pieces = await parse(readFileSync(fixture, 'utf8'));
    const mine = gradeMapSources(pieces, refs);
    const theirs = sourcePieces(
      pieces,
      [],
      [],
      new Map(),
      DICT as never,
      CARD.sizeIds,
      CARD.baseSizeId,
      null,
    );
    expect(mine.length).toBeGreaterThan(0);
    for (const p of mine) {
      const t = theirs.pieces.find((x) => x.identity === p.key)!;
      expect(t).toBeTruthy();
      expect(p.ungraded).toBe(t.ungraded);
      expect(p.sizes).toEqual(t.sizes.map(fromSourceSize).filter((g) => g.sizeId));
    }
  });

  for (const name of ['fixture card6-main', ...prod]) {
    it(`${name}: the map in the written file equals the map on the fly`, async () => {
      const text = readFileSync(name.startsWith('fixture') ? fixture : prodDir + name, 'utf8');
      // a CLO / prod export carries no block: read as before
      expect(readGradeMapBlock(text).status).toBe('absent');
      const out = await withGradeMap(text, manifestSizes);
      const fly = onTheFly(await parse(out.text), middleSize(refs));
      if (!fly) {
        expect(out.file).toBeNull();
        return;
      }
      const read = readGradeMapBlock(out.text, { manifestTrusted: true });
      expect(read.status).toBe('ok');
      if (read.status !== 'ok') return;
      const fromFile = gradeMapFromBytes(read.bytes);
      // derived from the same geometry by the same builder: byte-identical
      expect(canonicalJson(fromFile)).toBe(canonicalJson(fly.file));
      const d = compareMaps(fromFile, fly.file, (k) => fly.geo.get(k.toLowerCase()) ?? null);
      expect(d.unmatched).toEqual([]);
      expect(d.maxMm).toBeLessThanOrEqual(0.1);
      // the block changes nothing the card's parse reads
      expect(await parse(out.text)).toEqual(await parse(writeGradeMapBlock(out.text, null)));
      expect(writeGradeMapBlock(out.text, null)).toBe(text);
    });
  }

  it('builds nothing for one size and never throws', async () => {
    const text = readFileSync(fixture, 'utf8');
    const one = await withGradeMap(text, manifestSizes.slice(0, 1));
    expect(one.text).toBe(text);
    expect(one.file).toBeNull();
    const broken = await withGradeMap('not a dxf', manifestSizes);
    expect(broken.text).toBe('not a dxf');
    expect(broken.file).toBeNull();
    expect(gradeMapOfParsed([], refs)).toBeNull();
  });
});
