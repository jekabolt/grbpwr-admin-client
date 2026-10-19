// PATTERN-IMPORT · LEAKS-2 honesty probe (synthetic, no PDF) — W: the sheet pass's outline
// lettering (clean/index.ts `cleanSheet`, clean/detect.ts `textLines`) masks the watermark's
// letters and NOTHING of the size lines its band and reach cover.
//
// A sheet: a row of outline letters (closed glyphs of one height, different widths, bowls and
// crossbars inside them) at three heights, and size lines through the band and beside it — dashes,
// bead rows (open circles, filled diamonds), a dash-dot motif, a long curved stretch, short straight
// stretches. The watermark kind is accepted (the autopilot's click). Every letter part must be
// masked; every size-line path must stay line work. Mutations (each its own sheet): every size-line
// element alone in the band — must stay; a letter set without one letter — the rest still masked;
// the letters shrunk below the watermark height — nothing masked (not a watermark row).
// EXIT 1 = a size-line path masked, or a letter part left.
import type { IRPath, PtMm, Sheet, Style } from 'lib/pattern-import/types';
import { cleanSheet } from 'lib/pattern-import/clean';

type Part = {
  pts: PtMm[];
  closed: boolean;
  fill?: boolean;
  /** drawn in the watermark's grey (letters; a size line in the mutation `same pen`) */
  grey?: boolean;
  letter: boolean;
  what: string;
};

const ell = (cx: number, cy: number, rx: number, ry: number, n = 40): PtMm[] =>
  Array.from({ length: n }, (_, i) => ({
    x: cx + rx * Math.cos((2 * Math.PI * i) / n),
    y: cy + ry * Math.sin((2 * Math.PI * i) / n),
  }));
const rect = (x0: number, y0: number, w: number, h: number): PtMm[] => [
  { x: x0, y: y0 },
  { x: x0 + w, y: y0 },
  { x: x0 + w, y: y0 + h },
  { x: x0, y: y0 + h },
];

/** Outline letters of height H from x0 on baseline y0: O (bowl), E, I, A (counter), M, D (bowl). */
function letters(x0: number, y0: number, H: number, gapFrac = 0.35): Part[] {
  const out: Part[] = [];
  let x = x0;
  const gap = gapFrac * H;
  // an outline glyph as a PDF draws it: its outline in three strokes joined end to end
  const L = (pts: PtMm[], what: string) => {
    const ring = [...pts, pts[0]];
    const n = ring.length - 1;
    const cuts = [0, Math.max(1, Math.floor(n / 3)), Math.max(2, Math.floor((2 * n) / 3)), n];
    for (let k = 0; k < 3; k++)
      if (cuts[k + 1] > cuts[k])
        out.push({
          pts: ring.slice(cuts[k], cuts[k + 1] + 1),
          closed: false,
          grey: true,
          letter: true,
          what,
        });
  };
  // O
  L(ell(x + 0.45 * H, y0 + H / 2, 0.45 * H, H / 2), 'O');
  L(ell(x + 0.45 * H, y0 + H / 2, 0.3 * H, 0.36 * H), 'O-bowl');
  x += 0.9 * H + gap;
  // E
  const t = 0.16 * H;
  L(
    [
      { x, y: y0 },
      { x: x + 0.6 * H, y: y0 },
      { x: x + 0.6 * H, y: y0 + t },
      { x: x + t, y: y0 + t },
      { x: x + t, y: y0 + 0.42 * H },
      { x: x + 0.5 * H, y: y0 + 0.42 * H },
      { x: x + 0.5 * H, y: y0 + 0.58 * H },
      { x: x + t, y: y0 + 0.58 * H },
      { x: x + t, y: y0 + H - t },
      { x: x + 0.6 * H, y: y0 + H - t },
      { x: x + 0.6 * H, y: y0 + H },
      { x, y: y0 + H },
    ],
    'E',
  );
  x += 0.6 * H + gap;
  // I
  L(rect(x, y0, t, H), 'I');
  x += t + gap;
  // A with its counter
  L(
    [
      { x, y: y0 },
      { x: x + 0.2 * H, y: y0 },
      { x: x + 0.28 * H, y: y0 + 0.25 * H },
      { x: x + 0.62 * H, y: y0 + 0.25 * H },
      { x: x + 0.7 * H, y: y0 },
      { x: x + 0.9 * H, y: y0 },
      { x: x + 0.55 * H, y: y0 + H },
      { x: x + 0.35 * H, y: y0 + H },
    ],
    'A',
  );
  L(
    [
      { x: x + 0.33 * H, y: y0 + 0.38 * H },
      { x: x + 0.57 * H, y: y0 + 0.38 * H },
      { x: x + 0.45 * H, y: y0 + 0.72 * H },
    ],
    'A-counter',
  );
  x += 0.9 * H + gap;
  // M
  L(
    [
      { x, y: y0 },
      { x: x + t, y: y0 },
      { x: x + t, y: y0 + 0.7 * H },
      { x: x + 0.5 * H, y: y0 + 0.3 * H },
      { x: x + H - t, y: y0 + 0.7 * H },
      { x: x + H - t, y: y0 },
      { x: x + H, y: y0 },
      { x: x + H, y: y0 + H },
      { x: x + H - t, y: y0 + H },
      { x: x + 0.5 * H, y: y0 + 0.55 * H },
      { x: x + t, y: y0 + H },
      { x, y: y0 + H },
    ],
    'M',
  );
  x += H + gap;
  // D with its bowl
  L(
    [
      { x, y: y0 },
      { x: x + 0.4 * H, y: y0 },
      ...ell(x + 0.4 * H, y0 + H / 2, 0.35 * H, H / 2, 24)
        .filter((p) => p.x >= x + 0.4 * H)
        .sort((a, b) => a.y - b.y),
      { x: x + 0.4 * H, y: y0 + H },
      { x, y: y0 + H },
    ],
    'D',
  );
  L(rect(x + t, y0 + t, 0.35 * H, H - 2 * t), 'D-bowl');
  return out;
}

/** Size-line elements across [x0, x1] at height y (they are never letters). */
function sizeLine(kind: string, x0: number, x1: number, y: number): Part[] {
  const out: Part[] = [];
  const P = (pts: PtMm[], closed = false, fill = false) =>
    out.push({ pts, closed, fill, letter: false, what: kind });
  if (kind === 'dashes')
    for (let x = x0; x + 6 <= x1; x += 8.5)
      P([
        { x, y: y + 0.02 * (x - x0) },
        { x: x + 6, y: y + 0.02 * (x + 6 - x0) },
      ]);
  if (kind === 'long-dashes')
    for (let x = x0; x + 13 <= x1; x += 15.4)
      P([
        { x, y },
        { x: x + 13, y },
      ]);
  if (kind === 'beads') for (let x = x0; x <= x1; x += 5) P(ell(x, y, 1.6, 1.6, 12), true);
  if (kind === 'diamonds')
    for (let x = x0; x <= x1; x += 4)
      P(
        [
          { x: x - 1.2, y },
          { x, y: y + 0.7 },
          { x: x + 1.2, y },
          { x, y: y - 0.7 },
        ],
        true,
        true,
      );
  if (kind === 'dash-dot')
    for (let x = x0; x + 9 <= x1; x += 12) {
      P([
        { x, y },
        { x: x + 7, y },
      ]);
      P(ell(x + 9.5, y, 0.6, 0.6, 8), true, true);
    }
  if (kind === 'long-curve')
    P(
      Array.from({ length: 60 }, (_, i) => ({
        x: x0 + (i / 59) * Math.min(170, x1 - x0),
        y: y + 18 * Math.sin((i / 59) * Math.PI),
      })),
    );
  if (kind === 'straight')
    for (let x = x0; x + 30 <= x1; x += 45)
      P([
        { x, y },
        { x: x + 30, y: y + 3 },
      ]);
  return out;
}

const STYLE: Style = {
  id: 0,
  strokeRgb: [0, 0, 0],
  widthMm: 0.3,
  dash: null,
  layer: null,
  fill: false,
  clip: null,
};
const FILL: Style = { ...STYLE, id: 1, fill: true, widthMm: 0 };
const GREY: Style = { ...STYLE, id: 2, strokeRgb: [230, 230, 230] };
const GREY_FILL: Style = { ...FILL, id: 3, strokeRgb: [230, 230, 230] };

function sheetOf(parts: Part[]): Sheet {
  const paths: IRPath[] = parts.map((p, i) => ({
    id: i,
    pts: p.pts,
    closed: p.closed,
    style: (p.fill ? 1 : 0) + (p.grey ? 2 : 0),
    src: { file: 'synthetic', page: 0, op: i, sub: 0 },
  }));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of paths)
    for (const q of p.pts) {
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x);
      maxY = Math.max(maxY, q.y);
    }
  return {
    id: 0,
    poses: [],
    pairs: [],
    bbox: { minX, minY, maxX, maxY },
    missing: [],
    paths,
    texts: [],
    rasters: [],
    styles: [STYLE, FILL, GREY, GREY_FILL],
    warnings: [],
  } as Sheet;
}

/** A fan of nested size lines cut at a tile seam: 2 groups of 9 pieces 16 mm apart, ~105 mm long. */
function fanParts(kind: 'one path' | 'two strokes'): Part[] {
  const parts: Part[] = [];
  for (const g0 of [0, 200])
    for (let k = 0; k < 9; k++) {
      const x = g0 + 16 * k;
      const w = 28 + (k % 3) * 4; // nested lines bend differently: the pieces' widths differ
      const poly: PtMm[] = [
        { x, y: 0 },
        { x: x + 0.6 * w, y: 55 },
        { x: x + w, y: 105 },
      ];
      if (kind === 'one path')
        parts.push({ pts: poly, closed: false, fill: false, letter: false, what: 'fan' });
      else {
        parts.push({
          pts: poly.slice(0, 2),
          closed: false,
          fill: false,
          letter: false,
          what: 'fan',
        });
        parts.push({
          pts: poly.slice(1),
          closed: false,
          fill: false,
          letter: false,
          what: 'fan',
        });
      }
    }
  return parts;
}

/**
 * Pieces of size lines cut at the tile seams, lined up like a word (Mood Jolie / Memoir C): letter
 * high, side by side without overlapping, widths differ, each an OPEN curve drawn in three strokes
 * end to end — never lettering. `closedK` of them are closed instead (a mutation: real outlines).
 */
function fragmentParts(H: number, pen: 'black' | 'grey', closedK = 0): Part[] {
  const parts: Part[] = [];
  let x = 0;
  const ws = [0.62, 0.4, 0.75, 0.5, 0.58, 0.45];
  ws.forEach((wf, k) => {
    const w = wf * H;
    // an arc bulging right, then a hook: open, ends far apart
    const pts: PtMm[] = Array.from({ length: 31 }, (_, i) => {
      const t = i / 30;
      return { x: x + w * Math.sin(Math.PI * t) * (0.6 + 0.4 * t), y: H * t };
    });
    const P = (q: PtMm[], closedOne: boolean) =>
      parts.push({
        pts: q,
        closed: false,
        grey: pen === 'grey',
        letter: closedOne,
        what: closedOne ? 'outline' : 'fragment',
      });
    if (k < closedK) {
      // a closed outline in three strokes end to end
      const ring = [
        ...pts,
        ...pts
          .slice(1, -1)
          .reverse()
          .map((q) => ({ x: q.x - 0.25 * w, y: q.y })),
        pts[0],
      ];
      const n = ring.length - 1;
      const cuts = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n];
      for (let j = 0; j < 3; j++) P(ring.slice(cuts[j], cuts[j + 1] + 1), true);
    } else {
      // an open curve met by a tick (the junction splits it: three strokes, three loose ends)
      P(pts.slice(0, 16), false);
      P(pts.slice(15), false);
      P([pts[15], { x: pts[15].x + 0.3 * w, y: pts[15].y + 0.05 * H }], false);
    }
    x += w + 0.35 * H;
  });
  return parts;
}

type Res = { lettersLeft: string[]; linesMasked: string[]; rows: number };

function run(parts: Part[]): Res {
  const sheet = sheetOf(parts);
  const items = cleanSheet(sheet, [{ kind: 'watermark', keep: false }]);
  const lettersLeft: string[] = [];
  const linesMasked: string[] = [];
  parts.forEach((p, i) => {
    const m = sheet.paths[i].background === 'watermark';
    if (p.letter && !m) lettersLeft.push(p.what);
    if (!p.letter && m) linesMasked.push(p.what);
  });
  if (process.env.LEAKS2_DEBUG) {
    console.log(
      JSON.stringify(items.map((x) => ({ k: x.kind, a: x.applied, l: x.lines, e: x.evidence }))),
    );
    const g = globalThis as unknown as { __CLEANWM?: string[] };
    for (const l of g.__CLEANWM ?? []) console.log(l.slice(0, 300));
    g.__CLEANWM = [];
  }
  return {
    lettersLeft,
    linesMasked,
    rows: items.filter((x) => x.kind === 'watermark').length,
  };
}

const LINE_KINDS = [
  'dashes',
  'long-dashes',
  'beads',
  'diamonds',
  'dash-dot',
  'long-curve',
  'straight',
];

export async function main(): Promise<number> {
  if (process.env.LEAKS2_DEBUG2) {
    await debugRows();
    return 0;
  }
  let fail = 0;
  let checks = 0;
  const say = (ok: boolean, msg: string) => {
    checks++;
    if (!ok) fail++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  };
  const nLetters = (parts: Part[]) => parts.filter((p) => p.letter).length;
  const grey = (ps: Part[]) => ps.map((p) => ({ ...p, grey: true }));
  for (const H of [25, 60, 117]) {
    const word = (x0: number, y0: number) => [
      ...letters(x0, y0, H),
      ...letters(x0 + 7 * H, y0, H).slice(0, 12),
    ];
    // 0 · the lettering alone: found, every part masked
    {
      const r = run(word(0, 0));
      say(
        r.rows > 0 && !r.lettersLeft.length,
        `H${H} lettering alone: found and masked whole (left: ${r.lettersLeft.join(',') || '-'})`,
      );
    }
    // 0b · tightly kerned lettering (every pair tucked 5–10 % of the height, display tracking):
    // still lettering — its glyphs are closed outlines — masked (15 % at 25 mm: the row grammar
    // never found it, before LEAKS-2 either)
    for (const kern of [0.05, 0.1]) {
      const r = run(letters(0, 0, H, -kern));
      say(
        r.rows > 0 && !r.lettersLeft.length,
        `H${H} kerned lettering (pairs overlap ${kern * 100} % of h): found and masked whole (left: ${r.lettersLeft.join(',') || '-'})`,
      );
    }
    // 1 · every size-line kind through the band and beside it, black and in the watermark's grey
    for (const pen of ['black', 'grey'] as const) {
      const parts: Part[] = [...word(0, 0)];
      const W = 12 * H;
      LINE_KINDS.forEach((k, i) => {
        const add = (ps: Part[]) => parts.push(...(pen === 'grey' ? grey(ps) : ps));
        add(sizeLine(k, -2 * H, W + 2 * H, 0.1 * H + (i * 0.8 * H) / LINE_KINDS.length));
        add(sizeLine(k, -2 * H, W + 2 * H, -0.5 * H - i * 4));
      });
      const r = run(parts);
      const share = 1 - r.lettersLeft.length / nLetters(parts);
      if (pen === 'black')
        say(
          !r.linesMasked.length,
          `H${H} full (${pen} lines): no size-line path masked (masked: ${[...new Set(r.linesMasked)].join(',') || '-'})`,
        );
      else
        say(
          !r.linesMasked.length,
          `H${H} full (grey lines, the watermark's own pen): ${r.linesMasked.length} size-line paths masked (${[...new Set(r.linesMasked)].join(',') || '-'})`,
        );
      // letters a size line meets stay line work (the guard, conservative) — informational
      say(
        r.rows > 0,
        `H${H} full (${pen} lines): the row is found; ${(share * 100).toFixed(0)} % of the letter strokes masked (the rest touched by size lines: kept as line work)`,
      );
    }
    // 2 · each size-line kind alone in the band (both pens)
    for (const pen of ['black', 'grey'] as const)
      for (const k of LINE_KINDS) {
        const ln = sizeLine(k, -H, 12 * H + H, 0.45 * H);
        const r = run([...word(0, 0), ...(pen === 'grey' ? grey(ln) : ln)]);
        if (pen === 'black')
          say(
            !r.linesMasked.length,
            `H${H} mutation ${k} (${pen}) in the band: stays line work (${r.linesMasked.length} masked)`,
          );
        else
          say(
            !r.linesMasked.length,
            `H${H} mutation ${k} (grey, the watermark's own pen): ${r.linesMasked.length} paths masked`,
          );
      }
    // 3 · one letter dropped: the rest still a row, masked; the lines kept
    {
      const parts = word(0, 0).filter((p) => p.what !== 'M');
      const r = run([...parts, ...sizeLine('dashes', -H, 12 * H, 0.5 * H)]);
      say(r.rows > 0 && !r.linesMasked.length, `H${H} mutation no M: still a row, lines kept`);
    }
  }
  // 5 · a fan of nested size lines cut at a tile seam (Mood: 10 mm apart, ~100 mm pieces, each one
  // path with a dash style, or two joined end to end): pieces side by side that overlap along —
  // never a row of letters, nothing masked
  for (const kind of ['one path', 'two strokes'] as const) {
    const parts = fanParts(kind);
    const r = run(parts);
    say(
      !r.linesMasked.length,
      `fan of nested lines (${kind}, pieces overlapping along): nothing masked (${r.linesMasked.length} masked, ${r.rows} rows)`,
    );
  }
  // 6 · pieces of size lines cut at the tile seams, lined up like a word (Mood: Jolie, Memoir C,
  // Madison): open curves, not outlines — never a row of letters, nothing masked (both pens)
  for (const H of [30, 60])
    for (const pen of ['black', 'grey'] as const) {
      const r = run(fragmentParts(H, pen));
      say(
        !r.linesMasked.length,
        `H${H} open pieces lined up like a word (${pen}): nothing masked (${r.linesMasked.length} masked, ${r.rows} rows)`,
      );
    }
  // 6b · the honesty side: the same row with most pieces closed outlines is lettering — the
  // outlines masked, the open pieces lined up with them stay line work
  {
    const r = run(fragmentParts(60, 'grey', 4));
    say(
      r.rows > 0 && !r.lettersLeft.length && !r.linesMasked.length,
      `H60 mutation 4 of 6 pieces closed (outlines): a row, the outlines masked (left: ${r.lettersLeft.length}), the open pieces kept (masked: ${r.linesMasked.length})`,
    );
  }
  // 6c · lettering with one letter outline broken (a 2 mm gap): still lettering, the rest masked
  {
    const parts = letters(0, 0, 60);
    const iE = parts.findIndex((p) => p.what === 'E');
    const e = parts[iE];
    parts[iE] = { ...e, pts: e.pts.slice(0, -1) };
    const r = run(parts);
    const left = r.lettersLeft.filter((w) => w !== 'E');
    say(
      r.rows > 0 && !left.length,
      `H60 mutation one outline broken: still a row, the other letters masked (left: ${left.join(',') || '-'})`,
    );
  }
  // 4 · letters too small for a watermark: nothing masked by the sheet pass's lettering
  {
    const parts: Part[] = [...letters(0, 0, 8), ...sizeLine('dashes', -10, 120, 4)];
    const r = run(parts);
    say(!r.linesMasked.length, `H8 (below the watermark height): no size-line path masked`);
  }
  console.log(`LEAKS-2 honesty (W): ${checks - fail}/${checks} ${fail ? 'FAIL' : 'PASS'}`);
  return fail ? 1 : 0;
}

// debug helper (LEAKS2_DEBUG2): the lettering rows the sheet pass reads on a bare letter row
export async function debugRows(): Promise<void> {
  const { makeChains } = await import('lib/pattern-import/chains/make');
  const { DEFAULT_CHAIN_OPTS } = await import('lib/pattern-import/chains/build');
  const { textLines } = await import('lib/pattern-import/clean/detect');
  const { glyphClusters } = await import('lib/pattern-import/chains/classify');
  const sheet = sheetOf(
    process.env.LEAKS2_DEBUG2 === 'fan' ? fanParts('one path') : letters(0, 0, 60),
  );
  const { chains } = makeChains(sheet, DEFAULT_CHAIN_OPTS);
  console.log(
    'chains',
    chains.length,
    chains.map((c) => `${c.closed ? 'C' : 'o'}${c.pts.length}`).join(' '),
  );
  const polys = chains.map((c) => c.pts);
  const cl = glyphClusters(polys, 192, 0.6, () => true, true);
  console.log(
    'clusters',
    cl.map((c) => `${(c.maxX - c.minX).toFixed(0)}x${(c.maxY - c.minY).toFixed(0)}`).join(' '),
  );
  console.log(
    'rows',
    textLines(polys, {
      minH: 20,
      maxH: 120,
      minGlyphs: 4,
      minStrokes: 8,
      maxGap: 0.9,
      maxAspect: 1.3,
      endsOnly: true,
    }).length,
  );
}
