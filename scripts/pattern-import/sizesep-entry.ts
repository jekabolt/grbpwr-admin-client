// PATTERN-IMPORT · SIZESEP honesty probe (bundled by sizesep.mjs). A labelled sheet whose sizes have
// a look each (polupalto: 44 crosses … 54 thick, key on the sheet) is ranked look by look only where
// the look order, the inside vote and the labels on the look lines agree (sizes/look-order.ts).
// The probe runs the real chains + sizes steps on both polupalto sheets and r4454 (text-label too,
// must not move), with the fix off and on, then on mutated inputs that must NOT be ranked by look
// (the step goes back to asking) or, for one contradicting label, must ask about that line:
//   labels-swapped   the boxed labels 44↔54, 46↔52, 48↔50 (the run text stays): labels contradict
//                    the nesting
//   looks-merged     every 50 line drawn in the 48 look: no section shows six looks
//   looks-shuffled   every size line drawn in a random size look: no order dominates
//   region-reordered on the right 40 % of the sheet 44 is drawn in 48's look and 48 in 44's: one
//                    part of the sheet reads the looks in another order
//   piece-reordered  the same swap on one small piece only (every line within 25 mm of the smallest
//                    44 line with all six sizes around it): outvoted in any 15 cm cell
//   label-on-line    a "48" printed on three long 44 lines: ranked by look, but those lines ask
// LABELFRAME (sizes/label-frame.ts): the boxes around polupalto's size labels are label frames — no
// size line, no common line — and two mutations must keep a box that is NOT a frame:
//   frame-nested     the other five sizes' outlines drawn around one 44 box (1.5 mm apart, in their
//                    looks): the smallest outline of a small graded piece with its label inside
//   frame-loose      one 44 label printed at a third of its size: the box no longer hugs it
// Truth for a frame: a closed line ≤ 30 mm in no size pen around exactly one size label.
// The truth per polupalto chain is its pen (width + dash), read from the sheet's key, never from the
// engine's rows. Output: one table on stdout, JSON in PATIMPORT_REPORTS (default os tmpdir).
//   node scripts/pattern-import/sizesep.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_EXTRACT_OPTS,
  extractPdf,
  setPdfjsLoader,
  type PdfjsModule,
} from 'lib/pattern-import/adapters/pdf';
import { assembleSheet, classifyPages } from 'lib/pattern-import/assemble';
import { furniture } from 'lib/pattern-import/chains/classify';
import { makeChains, type ChainBuild } from 'lib/pattern-import/chains/make';
import { recoverSizes, type RecoverOut } from 'lib/pattern-import/sizes/recover';
import type { Chain, Sheet, SourceDoc, Style } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const REPORTS = process.env.PATIMPORT_REPORTS ?? tmpdir();
const CACHE = process.env.PATIMPORT_CACHE ?? resolve(tmpdir(), 'patimport-sizesep-cache');
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);

const mk = (d: string) => (existsSync(d) || mkdirSync(d, { recursive: true }), d);

async function loadDoc(file: string): Promise<SourceDoc> {
  const cp = resolve(mk(CACHE), `doc-${file.replace(/\W+/g, '_')}.json`);
  if (existsSync(cp)) return JSON.parse(readFileSync(cp, 'utf8')) as SourceDoc;
  const b = readFileSync(resolve(CORPUS, 'pdf', file));
  const doc = await extractPdf(
    {
      id: '0',
      name: file,
      bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    },
    DEFAULT_EXTRACT_OPTS,
  );
  writeFileSync(cp, JSON.stringify(doc));
  return doc;
}

/** polupalto's key (drawn on the sheet): 44 crosses, 46 diamonds (0.35 mm), 48 dash, 50 long dash,
 *  52 dots (0.5 mm), 54 solid 1 mm. */
function poluTruth(c: Chain, styles: Map<number, Style>): number {
  const w = styles.get(c.style)?.widthMm ?? 0;
  const m = c.motif;
  if (!m || !m.length) return Math.abs(w - 1) < 0.05 ? 5 : -1;
  const m0 = m[0];
  if (Math.abs(w - 0.35) < 0.03 && Math.abs(m0 - 1.25) < 0.05) return 0;
  if (Math.abs(w - 0.35) < 0.03 && m0 >= 4.8 && m0 <= 5.4) return 1;
  if (Math.abs(w - 0.5) < 0.03 && m.length >= 4 && Math.abs(m0 - 9) < 0.3) return 3;
  if (Math.abs(w - 0.5) < 0.03 && Math.abs(m0 - 1.5) < 0.1) return 2;
  if (Math.abs(w - 0.5) < 0.03 && Math.abs(m0 - 0.5) < 0.1) return 4;
  return -1;
}

type Mutation =
  | 'none'
  | 'labels-swapped'
  | 'looks-merged'
  | 'looks-shuffled'
  | 'region-reordered'
  | 'piece-reordered'
  | 'label-on-line'
  | 'frame-nested'
  | 'frame-loose';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

/** piece-reordered found no piece to swap on this sheet (the row is then not a test) */
let pieceFound = true;

function refLines(build: ChainBuild, truth: number[]): number[] {
  // a reference line per look: the longest reliable line in the look's commonest pen (the longest
  // line of all can be an odd one — a corner drawn as one stroke — and would make a seventh look)
  const ref = new Array<number>(6).fill(-1);
  for (let r = 0; r < 6; r++) {
    const byPen = new Map<string, number>();
    const pen = (i: number) => `${build.chains[i].style}|${build.chains[i].motif?.join('/') ?? ''}`;
    truth.forEach((t, i) => {
      if (t === r) byPen.set(pen(i), (byPen.get(pen(i)) ?? 0) + build.chains[i].lengthMm);
    });
    const top = [...byPen].sort((a, b) => b[1] - a[1])[0]?.[0];
    truth.forEach((t, i) => {
      if (t !== r || pen(i) !== top || !build.sigs[i].reliable) return;
      if (ref[r] < 0 || build.chains[i].lengthMm > build.chains[ref[r]].lengthMm) ref[r] = i;
    });
  }
  return ref;
}

/** a point inside a closed ring (even-odd) */
function inRing(p: { x: number; y: number }, ring: readonly { x: number; y: number }[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

const POLU_LABELS = new Set(['44', '46', '48', '50', '52', '54']);

/** polupalto's label boxes, read from the sheet: a closed line ≤ 30 mm drawn in no size pen around
 *  exactly one size label (chain id → the label's text id). */
function truthFrames(sheet: Sheet, build: ChainBuild, truth: number[]): Map<number, number> {
  const out = new Map<number, number>();
  build.chains.forEach((c, i) => {
    if (!c.closed || c.lengthMm > 30 || truth[i] >= 0) return;
    const held = sheet.texts.filter((t) =>
      inRing({ x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 }, c.pts),
    );
    if (held.length === 1 && POLU_LABELS.has(held[0].text.trim())) out.set(i, Number(held[0].id));
  });
  return out;
}

/** the box the frame mutations work on (the first 44 box), its new rings (frame-nested) */
let frameTarget = -1;
let frameRings: number[] = [];

/** a convex ring moved `d` mm outward along its vertex bisectors */
function offsetRing(ring: { x: number; y: number }[], d: number) {
  let a2 = 0;
  for (let k = 0; k < ring.length; k++) {
    const p = ring[k];
    const q = ring[(k + 1) % ring.length];
    a2 += p.x * q.y - q.x * p.y;
  }
  const out = (k: number) => {
    const p = ring[k];
    const q = ring[(k + 1) % ring.length];
    const L = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const t = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
    return a2 > 0 ? { x: t.y, y: -t.x } : { x: -t.y, y: t.x };
  };
  return ring.map((p, k) => {
    const n1 = out((k - 1 + ring.length) % ring.length);
    const n2 = out(k);
    const den = 1 + n1.x * n2.x + n1.y * n2.y || 1;
    return { x: p.x + (d * (n1.x + n2.x)) / den, y: p.y + (d * (n1.y + n2.y)) / den };
  });
}

function mutate(sheet: Sheet, build: ChainBuild, truth: number[], m: Mutation): Sheet {
  if (m === 'labels-swapped') {
    const swap: Record<string, string> = {
      '44': '54',
      '54': '44',
      '46': '52',
      '52': '46',
      '48': '50',
      '50': '48',
    };
    return {
      ...sheet,
      texts: sheet.texts.map((t) =>
        swap[t.text.trim()] ? { ...t, text: swap[t.text.trim()] } : t,
      ),
    };
  }
  if (m === 'none') return sheet;
  if (m === 'frame-nested' || m === 'frame-loose') {
    const boxes = truthFrames(sheet, build, truth);
    const tid = [...boxes].find(
      ([, t]) => sheet.texts.find((x) => Number(x.id) === t)?.text.trim() === '44',
    );
    frameTarget = tid?.[0] ?? -1;
    frameRings = [];
    if (!tid) return sheet;
    const [fi, textId] = tid;
    if (m === 'frame-loose') {
      // the label at a third of its size, same centre: the box is three times wider than it
      return {
        ...sheet,
        texts: sheet.texts.map((t) => {
          if (Number(t.id) !== textId) return t;
          const cx = (t.bbox.minX + t.bbox.maxX) / 2;
          const cy = (t.bbox.minY + t.bbox.maxY) / 2;
          const hw = (t.bbox.maxX - t.bbox.minX) / 6;
          const hh = (t.bbox.maxY - t.bbox.minY) / 6;
          return {
            ...t,
            fontSizeMm: t.fontSizeMm / 3,
            bbox: { minX: cx - hw, minY: cy - hh, maxX: cx + hw, maxY: cy + hh },
          };
        }),
      };
    }
    // frame-nested: sizes 46 … 54 drawn around the box in their own looks, 1.5 mm apart
    const ref = refLines(build, truth);
    const f = build.chains[fi];
    const shut =
      f.pts.length > 1 &&
      Math.hypot(f.pts[0].x - f.pts[f.pts.length - 1].x, f.pts[0].y - f.pts[f.pts.length - 1].y) <
        0.5;
    const ring = shut ? f.pts.slice(0, -1) : f.pts.slice();
    for (let r = 1; r < 6; r++) {
      const j = ref[r];
      if (j < 0) continue;
      const o = offsetRing(ring, 1.5 * r);
      const pts = [...o, o[0]];
      let L = 0;
      for (let k = 1; k < pts.length; k++)
        L += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      const id = build.chains.length;
      build.chains.push({
        ...f,
        id: id as typeof f.id,
        pts,
        lengthMm: L,
        closed: true,
        style: build.chains[j].style,
        motif: build.chains[j].motif,
      });
      build.sigs.push(build.sigs[j]);
      build.work.push(build.work[fi]);
      frameRings.push(id);
    }
    return sheet;
  }
  const ref = refLines(build, truth);
  const draw = (i: number, r: number) => {
    const j = ref[r];
    if (j < 0 || j === i) return;
    build.sigs[i] = build.sigs[j];
    build.chains[i] = {
      ...build.chains[i],
      style: build.chains[j].style,
      motif: build.chains[j].motif,
    };
  };
  if (m === 'label-on-line') {
    const long = truth
      .map((r, i) => ({ r, i, L: build.chains[i].lengthMm }))
      .filter((e) => e.r === 0)
      .sort((a, b) => b.L - a.L)
      .slice(0, 3);
    const t0 = sheet.texts[0];
    const added = long.map(({ i }, k) => {
      const pts = build.chains[i].pts;
      const p = pts[pts.length >> 1];
      return {
        ...t0,
        id: (Math.max(...sheet.texts.map((t) => Number(t.id))) + 1 + k) as typeof t0.id,
        text: '48',
        anchor: { x: p.x - 1.5, y: p.y + 1 },
        bbox: { minX: p.x - 1.5, minY: p.y - 1, maxX: p.x + 1.5, maxY: p.y + 1 },
        fontSizeMm: 2.5,
        rotationDeg: 0,
        background: undefined,
      };
    });
    return { ...sheet, texts: [...sheet.texts, ...added] };
  }
  if (m === 'piece-reordered') {
    // the smallest piece drawn in all six looks (a 44 line with every other size's line within
    // 25 mm of its box) swaps 44 and 48: the sheet around it outvotes it in any 15 cm cell (sheet 0:
    // a 65 mm piece, ranked by look without the per-piece check)
    const box = (i: number) => {
      const ps = build.chains[i].pts;
      const xs = ps.map((q) => q.x);
      const ys = ps.map((q) => q.y);
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    };
    const boxes = build.chains.map((_, i) => box(i));
    let best: { inside: number[]; diag: number } | null = null;
    truth.forEach((r, i) => {
      if (r !== 0) return;
      const b = boxes[i];
      const diag = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
      if (diag < 60) return;
      const W = { x0: b.x0 - 25, y0: b.y0 - 25, x1: b.x1 + 25, y1: b.y1 + 25 };
      const inside = truth
        .map((t, j) => ({ t, j }))
        .filter(
          ({ t, j }) =>
            t >= 0 &&
            boxes[j].x0 >= W.x0 &&
            boxes[j].y0 >= W.y0 &&
            boxes[j].x1 <= W.x1 &&
            boxes[j].y1 <= W.y1,
        );
      if (new Set(inside.map((e) => e.t)).size < 6) return;
      if (!best || diag < best.diag) best = { inside: inside.map((e) => e.j), diag };
    });
    const pick = best as { inside: number[]; diag: number } | null;
    pieceFound = !!pick;
    if (pick) {
      console.log(
        `  piece-reordered: a piece ${pick.diag.toFixed(0)} mm across, ${pick.inside.length} lines`,
      );
      for (const i of pick.inside) if (truth[i] === 0 || truth[i] === 2) draw(i, 2 - truth[i]);
    }
    return sheet;
  }
  const rnd = rng(19);
  const xs = sheet.paths.flatMap((p) => p.pts.map((q) => q.x));
  const x60 = Math.min(...xs) + 0.6 * (Math.max(...xs) - Math.min(...xs));
  truth.forEach((r, i) => {
    if (r < 0) return;
    if (m === 'looks-merged' && r === 3) draw(i, 2);
    if (m === 'looks-shuffled') draw(i, Math.floor(rnd() * 6));
    if (m === 'region-reordered' && (r === 0 || r === 2)) {
      const pts = build.chains[i].pts;
      if (pts[pts.length >> 1].x > x60) draw(i, 2 - r);
    }
  });
  return sheet;
}

type Row = {
  case: string;
  fix: boolean;
  mutation: Mutation;
  encoding: string;
  lookOrder: string;
  rankedByLook: boolean;
  /** truth length (m): right / wrong / not ranked; polupalto only */
  right: number;
  wrong: number;
  none: number;
  /** per truth rank: engine rank → length (m) */
  perLook: Record<number, Record<number, number>>;
  /** chains moved vs the fix off (r4454), length m */
  moved: number;
  /** lines whose own label names another size than their look (asked) */
  lookAgainst: number;
  asks: Record<string, number>;
  /** LABELFRAME: label frames the engine set aside / the sheet's boxes (truth) / boxes left in a
   *  size or common row / frames that are no box or a size line (truth) */
  frames: number;
  boxes: number;
  boxesKept: number;
  falseFrames: number;
  /** frame mutations: the box worked on (or one of its new rings) was set aside as a frame */
  targetFramed: boolean | null;
};

function score(
  name: string,
  fix: boolean,
  m: Mutation,
  rec: RecoverOut,
  truth: number[] | null,
  pathTruth: Map<number, number>,
): Row {
  const asks: Record<string, number> = {};
  for (const a of rec.ambiguities) {
    const k = /drawn in \d+ looks/.test(a.message) ? `${a.kind}:split-looks` : a.kind;
    asks[k] = (asks[k] ?? 0) + 1;
  }
  const row: Row = {
    case: name,
    fix,
    mutation: m,
    encoding: rec.encoding,
    lookOrder: String(rec.diag.lookOrder ?? '—'),
    rankedByLook: /ranked by look$/.test(String(rec.diag.lookOrder ?? '')),
    right: 0,
    wrong: 0,
    none: 0,
    perLook: {},
    moved: 0,
    lookAgainst: Number(rec.diag.lookAgainstLabel ?? 0),
    asks,
    frames: 0,
    boxes: 0,
    boxesKept: 0,
    falseFrames: 0,
    targetFramed: null,
  };
  if (!truth) return row;
  rec.chains.forEach((c, i) => {
    // split chains (ids past the built ones): the truth of the line they were cut from
    const t = i < truth.length ? truth[i] : pathTruth.get(c.ranges[0]?.path ?? -1) ?? -1;
    if (t < 0) return;
    const L = c.lengthMm / 1000;
    const e = rec.rankOf.get(i);
    const pl = (row.perLook[t] ??= {});
    pl[e ?? -1] = (pl[e ?? -1] ?? 0) + L;
    if (e === undefined) row.none += L;
    else if (e === t) row.right += L;
    else row.wrong += L;
  });
  return row;
}

function runOne(
  name: string,
  sheet0: Sheet,
  base: ChainBuild,
  extraTexts: string[],
  fix: boolean,
  m: Mutation,
  truthOf: ((c: Chain, s: Map<number, Style>) => number) | null,
): { row: Row; rec: RecoverOut } {
  const build: ChainBuild = structuredClone(base);
  const styles = new Map<number, Style>(sheet0.styles.map((s) => [s.id, s]));
  const truth = truthOf ? build.chains.map((c) => truthOf(c, styles)) : null;
  const pathTruth = new Map<number, number>();
  if (truth)
    build.chains.forEach((c, i) => {
      for (const r of c.ranges) pathTruth.set(r.path, truth[i]);
    });
  const sheet = mutate(sheet0, build, truth ?? [], m);
  const furn = furniture(build.chains, styles, sheet.poses, sheet.texts);
  const opLinked = build.work.map((w) => {
    const ops = new Set(w.items.map((l) => l.it.op));
    return w.items.length >= 3 && ops.size < w.items.length / 2;
  });
  if (fix) delete process.env.SIZESEP_OFF;
  else process.env.SIZESEP_OFF = '1';
  const rec = recoverSizes({
    sheet,
    chains: build.chains,
    sigs: build.sigs,
    furniture: furn,
    opLinked,
    extraTexts,
    fileNames: new Map([['0', name]]),
  });
  delete process.env.SIZESEP_OFF;
  const row = score(name, fix, m, rec, truth, pathTruth);
  const framed = new Set(rec.ignore.filter((g) => g.why === 'label frame').map((g) => g.id));
  row.frames = framed.size;
  if (truth) {
    const boxes = truthFrames(sheet, build, truth);
    row.boxes = boxes.size;
    const kept = new Set([...rec.rankOf.keys(), ...rec.common]);
    row.boxesKept = [...boxes.keys()].filter((i) => kept.has(i)).length;
    row.falseFrames = [...framed].filter(
      (i) => !boxes.has(i) && !(m === 'frame-nested' && frameRings.includes(i)),
    ).length;
    if (m === 'frame-nested' || m === 'frame-loose')
      row.targetFramed =
        frameTarget >= 0 && (framed.has(frameTarget) || frameRings.some((i) => framed.has(i)));
  }
  return { row, rec };
}

const f1 = (v: number) => v.toFixed(1);

/** Each line's role in a recovery: its size, common, internal, notch, orphan, or why it is ignored. */
function roles(rec: RecoverOut): Map<number, string> {
  const r = new Map<number, string>();
  for (const [c, k] of rec.rankOf) r.set(c, `size ${k}`);
  for (const c of rec.common) r.set(c, 'common');
  for (const c of rec.internal) r.set(c, 'internal');
  for (const c of rec.notches) r.set(c, 'notch');
  for (const c of rec.orphans) r.set(c, 'orphan');
  for (const g of rec.ignore) r.set(g.id, `ignore: ${g.why}`);
  return r;
}

export async function main(): Promise<number> {
  const cases: { file: string; sheet: number; truth: boolean }[] = [
    { file: 'polupalto.pdf', sheet: 0, truth: true },
    { file: 'polupalto.pdf', sheet: 1, truth: true },
    { file: 'r4454.pdf', sheet: 0, truth: false },
  ];
  const rows: Row[] = [];
  const fails: string[] = [];
  for (const cs of cases) {
    const doc = await loadDoc(cs.file);
    const sheet = assembleSheet([doc], classifyPages([doc]), cs.sheet);
    const docTexts = doc.pages.flatMap((p) => p.texts.map((t) => t.text));
    const base = makeChains(sheet, {
      joinGapMm: PATIMPORT.joinGapMm,
      joinAngleDeg: PATIMPORT.joinAngleDeg,
      joinLateralMm: PATIMPORT.joinLateralMm,
    });
    const name = `${cs.file.replace(/\.pdf$/, '')}#${cs.sheet}`;
    const truthOf = cs.truth ? poluTruth : null;
    const off = runOne(name, sheet, base, docTexts, false, 'none', truthOf);
    const on = runOne(name, sheet, base, docTexts, true, 'none', truthOf);
    on.row.moved = 0;
    on.rec.chains.forEach((c, i) => {
      if (on.rec.rankOf.get(i) !== off.rec.rankOf.get(i)) on.row.moved += c.lengthMm / 1000;
    });
    rows.push(off.row, on.row);
    if (cs.truth) {
      if (!on.row.rankedByLook) fails.push(`${name}: the unmutated sheet is not ranked by look`);
      if (on.row.wrong > 0.02 * (on.row.right + on.row.wrong + on.row.none))
        fails.push(`${name}: ${f1(on.row.wrong)} m wrong with the fix`);
      if (on.row.right < off.row.right) fails.push(`${name}: right went down`);
      // LABELFRAME: every box is a frame, nothing else is
      if (on.row.boxes < 10) fails.push(`${name}: ${on.row.boxes} label boxes read from the sheet`);
      if (on.row.boxesKept)
        fails.push(`${name}: ${on.row.boxesKept} label boxes still in a size or common row`);
      if (on.row.frames < on.row.boxes)
        fails.push(`${name}: ${on.row.boxes - on.row.frames} label boxes not set aside as frames`);
      if (on.row.falseFrames)
        fails.push(
          `${name}: ${on.row.falseFrames} lines set aside as frames that are no label box`,
        );
      process.env.LABELFRAME_OFF = '1';
      const lfOff = runOne(name, sheet, base, docTexts, true, 'none', truthOf);
      delete process.env.LABELFRAME_OFF;
      lfOff.row.mutation = 'none';
      (lfOff.row as Row & { note?: string }).note = 'LABELFRAME_OFF';
      rows.push(lfOff.row);
      if (lfOff.row.frames) fails.push(`${name}: LABELFRAME_OFF still sets frames aside`);
      // the frames only leave: no other line changes its role (size, common, internal, notch,
      // orphan, ignored and why), and no line is added or lost
      const rOff = roles(lfOff.rec);
      const rOn = roles(on.rec);
      let movedLf = 0;
      const movedEx: string[] = [];
      const ids = new Set([...rOff.keys(), ...rOn.keys()]);
      for (const i of ids) {
        if (rOn.get(i) === 'ignore: label frame' || rOff.get(i) === rOn.get(i)) continue;
        movedLf += (on.rec.chains[i] ?? lfOff.rec.chains[i])?.lengthMm ?? 0;
        if (movedEx.length < 5) movedEx.push(`#${i} ${rOff.get(i)} → ${rOn.get(i)}`);
      }
      if (movedEx.length || lfOff.rec.chains.length !== on.rec.chains.length)
        fails.push(
          `${name}: ${f1(movedLf)} mm of other lines changed role with LABELFRAME ` +
            `(${movedEx.join('; ')}; lines ${lfOff.rec.chains.length} → ${on.rec.chains.length})`,
        );
      for (const m of ['frame-nested', 'frame-loose'] as const) {
        const mu = runOne(name, sheet, base, docTexts, true, m, truthOf);
        rows.push(mu.row);
        if (mu.row.targetFramed === null || frameTarget < 0)
          fails.push(`${name} ${m}: no 44 box to work on`);
        else if (mu.row.targetFramed)
          fails.push(`${name} ${m}: a box that is not a label frame was set aside as one`);
        else if (m === 'frame-nested' && frameRings.length < 5)
          fails.push(`${name} ${m}: only ${frameRings.length} rings drawn`);
        // the detector still works on that sheet: every other box is a frame, nothing else is
        else if (mu.row.frames !== on.row.boxes - 1 || mu.row.falseFrames)
          fails.push(
            `${name} ${m}: ${mu.row.frames} frames (${on.row.boxes - 1} other boxes), ` +
              `${mu.row.falseFrames} false`,
          );
      }
      const muts = [
        'labels-swapped',
        'looks-merged',
        'looks-shuffled',
        'region-reordered',
        'piece-reordered',
        'label-on-line',
      ] as const;
      for (const m of muts) {
        const mu = runOne(name, sheet, base, docTexts, true, m, truthOf);
        rows.push(mu.row);
        if (m === 'piece-reordered' && !pieceFound) {
          console.log(`  ${name} ${m}: no piece with all six looks, not a test`);
          continue;
        }
        if (m === 'label-on-line') {
          if (mu.row.rankedByLook && !mu.row.lookAgainst)
            fails.push(`${name} ${m}: a line labelled against its look is not asked`);
        } else if (mu.row.rankedByLook)
          fails.push(`${name} ${m}: ranked by look on a mutated sheet`);
        const offAsks = Object.values(mu.row.asks).reduce((a, b) => a + b, 0);
        if (!offAsks) fails.push(`${name} ${m}: no question left`);
      }
    } else if (on.row.moved > 0) fails.push(`${name}: ${f1(on.row.moved)} m changed rank`);
  }
  console.log(
    'case          fix mutation        right  wrong  none(m)  moved  frames  asks                    look order',
  );
  for (const r of rows)
    console.log(
      `${r.case.padEnd(13)} ${r.fix ? 'on ' : 'off'} ${(r.mutation + (r.lookAgainst ? `(${r.lookAgainst} asked)` : '')).padEnd(15)} ${f1(r.right).padStart(6)} ${f1(r.wrong).padStart(6)} ${f1(r.none).padStart(6)}  ${f1(r.moved).padStart(6)}  ${`${r.frames}/${r.boxes}`.padStart(6)}  ${JSON.stringify(r.asks).padEnd(24)} ${r.lookOrder}`,
    );
  for (const r of rows)
    if (Object.keys(r.perLook).length && r.mutation === 'none')
      console.log(
        `  ${r.case} fix ${r.fix ? 'on ' : 'off'} truth→engine (m):`,
        Object.entries(r.perLook)
          .map(
            ([t, e]) =>
              `${t}:{${Object.entries(e)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => `${k}=${f1(v)}`)
                .join(' ')}}`,
          )
          .join('  '),
      );
  const out = resolve(mk(REPORTS), 'SIZESEP-probe.json');
  writeFileSync(out, JSON.stringify({ rows, fails }, null, 1));
  console.log(fails.length ? `FAIL\n  ${fails.join('\n  ')}` : 'PASS', '·', out);
  return fails.length ? 1 : 0;
}
