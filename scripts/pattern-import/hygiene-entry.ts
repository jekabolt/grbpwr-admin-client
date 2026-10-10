// PATTERN-IMPORT · wall hygiene controls (Codex round 3, S4 / S6) on synthetic sheets.
//   S4  colour alone never proves furniture: a light-grey cut contour around a black inner loop
//       is the piece's outline (or a question), a grey lattice is still background.
//   S6  overprint needs glyph evidence: a common straight edge crossed by a graded curve in every
//       overlaid file stays line work; a cluster of repeated strokes over the curve is overprint.
import { buildChainsDetailed, DEFAULT_CHAIN_OPTS } from 'lib/pattern-import/chains';
import { furniture, overprintLines } from 'lib/pattern-import/chains/classify';
import { makeChains } from 'lib/pattern-import/chains/make';
import { fillPiecesDetailed } from 'lib/pattern-import/pieces';
import { detectSizeRun } from 'lib/pattern-import/sizes';
import type {
  IRPath,
  IRText,
  PagePose,
  PtMm,
  Seed,
  Sheet,
  SourceFileInfo,
  Style,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

const GREY: Style = {
  id: 0,
  strokeRgb: [180, 180, 180],
  widthMm: 0.3,
  dash: null,
  layer: null,
  fill: false,
  clip: null,
};
const BLACK: Style = { ...GREY, id: 1, strokeRgb: [0, 0, 0] };

type P = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

function sheetOf(
  draw: { pts: P[]; closed?: boolean; style: number; file?: string }[],
  texts: { s: string; at: P }[] = [],
  files = ['0'],
): Sheet {
  const ops = new Map<string, number>();
  const paths: IRPath[] = draw.map((d, id) => {
    const file = d.file ?? '0';
    const op = (ops.get(file) ?? 0) + 1;
    ops.set(file, op);
    return {
      id,
      pts: d.pts.map(([x, y]) => ({ x, y })),
      closed: !!d.closed,
      style: d.style,
      src: { file, page: 0, op, sub: 0 },
    };
  });
  const irTexts: IRText[] = texts.map((t, id) => ({
    id,
    text: t.s,
    anchor: { x: t.at[0], y: t.at[1] },
    bbox: { minX: t.at[0], minY: t.at[1], maxX: t.at[0] + 20, maxY: t.at[1] + 5 },
    fontSizeMm: 5,
    rotationDeg: 0,
    layer: null,
    src: { file: '0', page: 0, op: 0, sub: 0 },
  }));
  const poses: PagePose[] = files.map((file) => ({
    file,
    page: 0,
    toSheet: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    widthMm: 600,
    heightMm: 600,
    residualMm: 0,
  }));
  return {
    id: 0,
    poses,
    pairs: [],
    bbox: { minX: 0, minY: 0, maxX: 600, maxY: 600 },
    missing: [],
    paths,
    texts: irTexts,
    rasters: [],
    styles: [GREY, BLACK],
    warnings: [],
  };
}

const FILES: SourceFileInfo[] = [
  { id: '0', name: 'probe.pdf', bytes: 0, sha256: '', kind: 'pdf', pages: 1 },
];

function fillAt(sheet: Sheet, at: PtMm) {
  const { set } = buildChainsDetailed(sheet, DEFAULT_CHAIN_OPTS);
  const run = detectSizeRun(sheet, set, FILES);
  const seeds: Seed[] = [{ id: 0, at, origin: 'click', variant: null }];
  const { families } = fillPiecesDetailed(sheet, set, run, seeds, {
    cellMm: PATIMPORT.fillCellMm,
    snapMm: PATIMPORT.snapMm,
    variant: null,
    grade: 'off',
  });
  return { set, cand: families[0]?.candidates[0] };
}

export async function main(): Promise<number> {
  let bad = 0;
  const check = (name: string, ok: boolean, detail: string) => {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}  — ${detail}`);
    if (!ok) bad++;
  };

  // S4-a: grey closed cut contour 200 × 300, black inner loop 150 × 250, label inside
  {
    const sheet = sheetOf(
      [
        { pts: rect(100, 100, 300, 400), closed: true, style: 0 },
        { pts: rect(125, 125, 275, 375), closed: true, style: 1 },
      ],
      [{ s: 'FRONT', at: [180, 250] }],
    );
    const { set, cand } = fillAt(sheet, { x: 200, y: 250 });
    const outerUsed = !!cand && cand.outcome === 'closed' && Math.abs(cand.areaMm2 - 60000) < 600;
    const asked = set.classes.some(
      (k) => k.role === 'ignore' && k.confidence < 0.6 && k.chains.includes(0),
    );
    check(
      'S4 grey closed outer contour + black inner loop → the outer is the piece (or asked)',
      outerUsed || asked,
      `area ${cand ? Math.round(cand.areaMm2 / 100) : '—'} cm² (outer 600, inner 375), asked ${asked}`,
    );
  }
  // S4-b: the same grey contour drawn as two open halves 8 mm apart (no loop): colour-only → a
  // question in the legend (or, if anything closes it, the outer)
  {
    const sheet = sheetOf([
      {
        pts: [
          [196, 100],
          [100, 100],
          [100, 400],
          [196, 400],
        ],
        style: 0,
      },
      {
        pts: [
          [204, 100],
          [300, 100],
          [300, 400],
          [204, 400],
        ],
        style: 0,
      },
      { pts: rect(125, 125, 275, 375), closed: true, style: 1 },
    ]);
    const { set, cand } = fillAt(sheet, { x: 200, y: 250 });
    const outerUsed = !!cand && cand.outcome === 'closed' && Math.abs(cand.areaMm2 - 60000) < 600;
    const asked = set.classes.some((k) => k.role === 'ignore' && k.confidence < 0.6);
    check(
      'S4 grey open outer contour + black inner loop → outer used or the legend asks',
      outerUsed || asked,
      `area ${cand ? Math.round(cand.areaMm2 / 100) : '—'} cm², low-confidence ignore row ${asked}`,
    );
  }
  // S4-c (control): a grey 10 mm lattice is still background, no question
  {
    const draw: { pts: P[]; style: number }[] = [];
    for (let k = 0; k <= 20; k++) {
      draw.push({
        pts: [
          [50 + 10 * k, 50],
          [50 + 10 * k, 250],
        ],
        style: 0,
      });
      draw.push({
        pts: [
          [50, 50 + 10 * k],
          [250, 50 + 10 * k],
        ],
        style: 0,
      });
    }
    const sheet = sheetOf(draw);
    const mk = makeChains(sheet, DEFAULT_CHAIN_OPTS);
    const styles = new Map(sheet.styles.map((s) => [s.id, s]));
    const f = furniture(mk.chains, styles, sheet.poses, sheet.texts);
    const grid = f.filter((w) => w === 'background grid').length;
    check(
      'S4 control: a grey lattice is background grid (not a question)',
      grid === mk.chains.length,
      `${grid}/${mk.chains.length} chains 'background grid'`,
    );
  }

  // S6: three overlaid files
  {
    const files = ['0', '1', '2'];
    const draw: { pts: P[]; style: number; file: string }[] = [];
    for (const [k, file] of files.entries()) {
      // a common straight edge every size draws alike (100 mm), its ends on graded lines
      draw.push({
        pts: [
          [50, 100],
          [50, 200],
        ],
        style: 1,
        file,
      });
      draw.push({
        pts: [
          [50, 100],
          [200, 95 - 4 * k],
        ],
        style: 1,
        file,
      });
      draw.push({
        pts: [
          [50, 200],
          [200, 205 + 4 * k],
        ],
        style: 1,
        file,
      });
      // repeated marks near it (grain / notches drawn alike in every size)
      for (const y of [120, 140, 160])
        draw.push({
          pts: [
            [60, y],
            [95, y],
          ],
          style: 1,
          file,
        });
      // a graded curve crossing the edge (runs 10 mm past it)
      draw.push({
        pts: [
          [40, 150 + 3 * k],
          [120, 160 + 3 * k],
          [220, 175 + 3 * k],
        ],
        style: 1,
        file,
      });
      // a watermark: five 50 mm strokes in a cluster, one crossing the graded curve
      for (let s = 0; s < 5; s++)
        draw.push({
          pts: [
            [300 + 12 * s, 120],
            [306 + 12 * s, 170],
          ],
          style: 1,
          file,
        });
      draw.push({
        pts: [
          [280, 150 + 3 * k],
          [380, 152 + 3 * k],
        ],
        style: 1,
        file,
      });
    }
    const sheet = sheetOf(draw, [], files);
    const mk = makeChains(sheet, DEFAULT_CHAIN_OPTS);
    const pathFile = new Map(sheet.paths.map((p) => [p.id, p.src.file]));
    const fileOf = (i: number) => pathFile.get(mk.chains[i].ranges[0]?.path ?? -1) ?? '';
    const over = new Set(overprintLines(mk.chains, fileOf));
    const isEdge = (i: number) => {
      const b = mk.chains[i].pts;
      return b.every((p) => Math.abs(p.x - 50) < 0.5) && mk.chains[i].lengthMm > 90;
    };
    const isWater = (i: number) => mk.chains[i].pts.every((p) => p.x >= 299 && p.x <= 355);
    const edges = mk.chains.map((_, i) => i).filter(isEdge);
    const water = mk.chains.map((_, i) => i).filter(isWater);
    check(
      'S6 common straight edge crossed by a graded curve in every file → kept',
      edges.length === 3 && edges.every((i) => !over.has(i)),
      `${edges.filter((i) => over.has(i)).length}/${edges.length} edges marked overprint`,
    );
    check(
      'S6 control: a cluster of repeated strokes over the graded line → overprint',
      water.some((i) => over.has(i)),
      `${water.filter((i) => over.has(i)).length}/${water.length} watermark strokes marked`,
    );
  }
  console.log(bad ? `\n${bad} FAILED` : '\nall hygiene controls ok');
  return bad;
}
