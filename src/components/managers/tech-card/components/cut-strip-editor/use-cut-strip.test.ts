import type { common_Material, common_TechCardSeam } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';
import { cutStripEligible, freshCutStrip, toggleCutStrips, type CutStrip } from './use-cut-strip';

const line = {
  lineKey: 'bom-waistband',
  name: 'waistband',
  unit: 'm',
  purpose: 'TECH_CARD_BOM_PURPOSE_OTHER',
};

const seam = {
  seamKey: 'seam-waistband',
  kind: 'TECH_CARD_SEAM_KIND_EDGE',
  note: '',
  sideA: { parts: [{ pieceLineKey: 'waistband-piece' }] },
  sideB: { parts: [{ pieceLineKey: 'front-piece' }] },
} as common_TechCardSeam;

const context = {
  line,
  sizeIds: [1, 2],
  seams: [seam],
  pieces: [
    { lineKey: 'waistband-piece', name: 'waistband' },
    { lineKey: 'front-piece', name: 'front' },
  ],
  material: {
    hardwareAttrs: { dimensions: '30 mm' },
  } as common_Material,
};

describe('cut strip toggle', () => {
  it('adds, removes and restores the same values', () => {
    const stash = new Map<string, CutStrip[]>();
    const added = toggleCutStrips([], true, context, stash);
    expect(added.strips).toHaveLength(1);

    const edited: CutStrip = {
      ...added.strips[0],
      overlapMm: '18',
      sizes: added.strips[0].sizes?.map((row, index) => ({
        ...row,
        manualCutMm: index === 0 ? '704' : '',
      })),
    };
    const removed = toggleCutStrips([edited], false, context, stash);
    expect(removed.strips).toEqual([]);

    const restored = toggleCutStrips(removed.strips, true, context, stash);
    expect(restored.strips[0]).toEqual(edited);
  });

  it('stashes and restores every strip of one line', () => {
    const stash = new Map<string, CutStrip[]>();
    const first = freshCutStrip(context);
    const second = { ...first, lineKey: 'strip-second', overlapMm: '42' };
    const other = { ...first, lineKey: 'strip-other', bomLineKey: 'other-line' };

    const removed = toggleCutStrips([first, second, other], false, context, stash);
    expect(removed.strips).toEqual([other]);
    expect(stash.get(line.lineKey)).toEqual([first, second]);

    const restored = toggleCutStrips(removed.strips, true, context, stash);
    expect(restored.lineStrips).toEqual([first, second]);
    expect(restored.strips).toEqual([other, first, second]);
  });

  it('auto-fills the matching seam and article width', () => {
    const strip = freshCutStrip(context);
    expect(strip.lengthMode).toBe('from_seam');
    expect(strip.seamKey).toBe('seam-waistband');
    expect(strip.widthMm).toBe('30');
  });

  it('does not create a strip for main fabric or pieces', () => {
    expect(cutStripEligible({ unit: 'm', purpose: 'TECH_CARD_BOM_PURPOSE_MAIN' })).toBe(false);
    expect(cutStripEligible({ unit: 'pcs', purpose: 'TECH_CARD_BOM_PURPOSE_OTHER' })).toBe(false);
    const result = toggleCutStrips(
      [],
      true,
      { ...context, line: { ...line, unit: 'pcs' } },
      new Map(),
    );
    expect(result.strips).toEqual([]);
  });
});
