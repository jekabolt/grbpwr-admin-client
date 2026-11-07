import { describe, expect, it } from 'vitest';
import type { PaperDoc, PathCmd } from '../../assembly-print/paper';
import { hasCareArtwork } from '../../care-labels/artwork';
import { MOCKUP_A_BACK, MOCKUP_A_FACE, MOCKUP_PARTS } from '../../care-labels/fixtures/mockup';
import {
  L,
  LV,
  seamDash,
  typesetABack,
  typesetAFace,
  typesetB,
  type Seam,
} from '../../care-labels/layout';
import { PT_MM, type Shaper } from '../../care-labels/text-outline';
import { aBackRegions, aFaceRegions, bRegions, seamRect, type Region } from './regions';

const shaper: Shaper = {
  width(text, _lang, pt) {
    return [...text].length * 0.6 * pt * PT_MM;
  },
  run(text, _lang, pt, x = 0, y = 0) {
    const charW = 0.6 * pt * PT_MM;
    const glyphs: PathCmd[] = [];
    [...text].forEach((char, index) => {
      if (/\s/.test(char)) return;
      const x0 = x + index * charW;
      glyphs.push(
        ['M', x0, y],
        ['L', x0 + charW * 0.7, y],
        ['L', x0 + charW * 0.7, y - pt * PT_MM],
        ['L', x0, y - pt * PT_MM],
        ['Z'],
      );
    });
    return { widthMm: [...text].length * charW, glyphs };
  },
};

const TOL = 0.3;

/** Точки чернил стороны без пунктира сгиба (он всегда первый примитив). */
function inkPoints(doc: PaperDoc, seam: Seam): [number, number][] {
  expect(doc.prims[0]).toEqual(seamDash(seam));
  const points: [number, number][] = [];
  for (const prim of doc.prims.slice(1)) {
    if (prim.k === 'path')
      for (const cmd of prim.d) {
        if (cmd[0] === 'M' || cmd[0] === 'L') points.push([cmd[1], cmd[2]]);
        else if (cmd[0] === 'C') points.push([cmd[5], cmd[6]]);
      }
    else if (prim.k === 'rect') points.push([prim.x, prim.y], [prim.x + prim.w, prim.y + prim.h]);
    else if (prim.k === 'poly') points.push(...prim.pts);
    else if (prim.k === 'circle') points.push([prim.cx, prim.cy]);
    else if (prim.k === 'text') points.push([prim.x, prim.y]);
    else if (prim.k === 'line') points.push([prim.x1, prim.y1], [prim.x2, prim.y2]);
  }
  return points;
}

const inside = ([x, y]: [number, number], r: Region) =>
  x >= r.rect.x0 - TOL && x <= r.rect.x1 + TOL && y >= r.rect.y0 - TOL && y <= r.rect.y1 + TOL;

/** Every mark sits under a door, and every door sits on a mark of its own. */
function expectInkCovered(doc: PaperDoc, seam: Seam, regions: Region[]) {
  const points = inkPoints(doc, seam);
  expect(points.length).toBeGreaterThan(20);
  expect(points.filter((point) => !regions.some((r) => inside(point, r)))).toEqual([]);
  for (const door of regions) {
    // The QR lies on top of its caption column: it owns its ink against the other doors.
    const others = regions.filter(
      (r) => r !== door && !(door.line === 'qr' && r.line === 'caption'),
    );
    const own = points.filter((point) => !others.some((r) => inside(point, r)));
    expect(own.length, door.key).toBeGreaterThan(0);
  }
}

function expectOnPaper(regions: Region[], seam: Seam) {
  const hatch = seamRect(seam);
  for (const r of regions) {
    expect(r.rect.x0).toBeGreaterThanOrEqual(0);
    expect(r.rect.x1).toBeLessThanOrEqual(LV.W);
    expect(r.rect.x0).toBeLessThan(r.rect.x1);
    expect(r.rect.y0).toBeLessThan(r.rect.y1);
    // A door never sits on the sewn-in allowance.
    if (seam === 'top') expect(r.rect.y0).toBeGreaterThanOrEqual(hatch.y1);
    else expect(r.rect.y1).toBeLessThanOrEqual(hatch.y0);
  }
}

describe('vertical click regions follow the engine ink', () => {
  it('covers every printed mark of the A face', () => {
    const face = typesetAFace(shaper, MOCKUP_A_FACE, 'top', 'vertical');
    const madeW = shaper.width(`MADE IN ${MOCKUP_A_FACE.country.toUpperCase()}`, 'en', L.PT);
    const regions = aFaceRegions(face.report.seam, madeW, {
      proseLines: face.report.lines,
      symbols: MOCKUP_A_FACE.care.codes.filter(hasCareArtwork).length,
    });
    expect(regions.map((r) => r.line)).toEqual([
      'logo',
      'product',
      'care-text',
      'care-symbols',
      'made-in',
    ]);
    expectOnPaper(regions, 'top');
    expectInkCovered(face.doc, 'top', regions);
  });

  it('covers every printed mark of the A back', () => {
    const back = typesetABack(shaper, MOCKUP_A_BACK, 'bottom', 'vertical');
    const regions = aBackRegions(back.report.seam, back.report.lines);
    expect(regions.map((r) => r.line)).toEqual(['caption', 'qr', 'address']);
    expectOnPaper(regions, 'bottom');
    expectInkCovered(back.doc, 'bottom', regions);
  });

  it('puts one composition door on each B column at its reported height', () => {
    const result = typesetB(shaper, MOCKUP_PARTS, 'duplex', 'vertical');
    const sides = result.labels.flatMap((label) => [label.face, label.back]);
    for (const side of sides.filter((entry) => !entry.report.empty)) {
      const regions = bRegions(side.report);
      expect(regions.map((r) => r.part)).toEqual(side.report.columns.map((c) => c.part));
      side.report.columns.forEach((column, index) => {
        expect(regions[index].rect.y0).toBeCloseTo(column.y! - 0.6, 6);
        expect(regions[index].rect.y1).toBeCloseTo(column.y! + column.h! + 0.6, 6);
      });
      expectOnPaper(regions, side.report.seam);
      expectInkCovered(side.doc, side.report.seam, regions);
    }
  });
});
