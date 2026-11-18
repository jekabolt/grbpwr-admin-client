import { stripDrawingsOf } from 'components/managers/tech-card/components/cut-strips/strip-pieces';
import { buildAssemblyPiecesFromInput } from 'components/managers/tech-card/techpack/assembly-geometry-build';
import { anchorOf } from 'lib/seams/anchor';
import { runById } from 'lib/seams/frame';
import { anchorToWire } from 'lib/seams/wire';
import { describe, expect, it } from 'vitest';
import type { SavedAssemblyCutStripSourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { readSavedCutStripStitchAnchorV1 } from './saved-cut-strip-stitch-anchor-v1';

const key = '01JABCDEFGHJKMNPQRSTVWXYZB';

function savedStrip() {
  return {
    strip: {
      lineKey: key,
      bomLineKey: '01JABCDEFGHJKMNPQRSTVWXYZC',
      lengthMode: 'per_size',
      seamKey: undefined,
      widthMm: { value: '35' },
      fitPct: { value: '100' },
      overlapMm: { value: '0' },
      oneLengthMm: undefined,
      qty: 1,
      sizes: [
        { sizeId: 58, seamMm: undefined, manualCutMm: 80, cutMm: 80, sewnMm: { value: '80' } },
      ],
    },
    bomMaterialId: 28,
    bomSection: 'hardware',
    bomUnit: 'm',
  } satisfies SavedAssemblyCutStripSourceV1;
}

function anchorEnds(binding: ReturnType<typeof savedStrip>) {
  const [drawing] = stripDrawingsOf([binding.strip], [], { sizeToken: 'M', baseSizeId: 58 });
  const pieces = buildAssemblyPiecesFromInput(
    {
      pieces: [{ lineKey: key, name: drawing.mark.label, materials: [], cutStrip: drawing.mark }],
      bomItems: [],
    },
    new Map([[key, drawing.found]]),
  );
  const shape = pieces.pieces.get(key)!.geom!;
  return ['#3', '#1'].map((edge) =>
    anchorToWire(anchorOf(shape, runById(shape, key + edge)!, pieces.grainDeg.get(key))),
  );
}

describe('saved cut strip attachment', () => {
  it('reads both ordinary strip ends at the selected rank and rejects stale dimensions', () => {
    const source = savedStrip();
    const [first, second] = anchorEnds(source);
    const left = readSavedCutStripStitchAnchorV1(source, first, 58, 'M');
    const right = readSavedCutStripStitchAnchorV1(source, second, 58, 'M');
    expect(left).toMatchObject({ lineKey: key, widthMm: 35, sewnMm: 80, fraction: [0, 1] });
    expect(left?.edgeMm[0]).toEqual([0, 35]);
    expect(left?.edgeMm.at(-1)).toEqual([0, 0]);
    expect(right?.edgeMm[0]).toEqual([80, 0]);
    expect(right?.edgeMm.at(-1)).toEqual([80, 35]);
    expect(readSavedCutStripStitchAnchorV1(source, first, 59, 'L')).toBeNull();
    expect(
      readSavedCutStripStitchAnchorV1(source, { ...first, edgeHint: second.edgeHint }, 58, 'M'),
    ).toBeNull();

    const changed = savedStrip();
    changed.strip.widthMm.value = '34';
    expect(readSavedCutStripStitchAnchorV1(changed, first, 58, 'M')).toBeNull();
    const wrongGauge = savedStrip();
    wrongGauge.strip.sizes[0].sewnMm.value = '79';
    expect(readSavedCutStripStitchAnchorV1(wrongGauge, second, 58, 'M')).toBeNull();
  });
});
