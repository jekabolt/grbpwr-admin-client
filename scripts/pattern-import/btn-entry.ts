// PATTERN-IMPORT · BTN — the buttons of the golden CLO shirt (allsizes.dxf + allsizes.rul: 5 sizes
// XS S M L XL, sample XS, METRIC). CLO draws a button as a closed 20-gon circle (10 / 15 mm) with
// two cross lines on layer 8, no rule text on any of them. A button is a circle whose centre is
// graded, radius constant across sizes. Bundled by btn.mjs.
//   A  expandRul: every button circle is still a circle of the sample's radius in every size, its
//      cross lines move with it; on the placket (PLCK_R) the centre moves per size step by
//      -3 + 8·t mm — its proportional place between the side's 4064 (-3) and 4053 (+5) rule ends
//   B  the product path, Session → write (r12, storage 'rul'): our per-size DXF draws each button
//      as a circle of the source diameter at the expanded centre; the base + RUL package expands
//      back to the same circles
//   C  btn-after.svg in the golden dir: every piece with buttons × 5 sizes, outline + buttons, and
//      a zoom of the first button; the marks of PATIMPORT_BTN_BEFORE (an export of the old code),
//      when given, behind in red
// Two refusals of this pair are not about buttons and are worked around here, said as KNOWN: the
// DXF names table "allsizes" while the RUL says "Size Group 1"; a layer-3 point of clr_main lies
// on two layer-8 lines that move it differently.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expandRul, parseRul } from 'lib/pattern-import/adapters/rul';
import { buildAst } from 'lib/pattern-import/adapters/dxf/ast';
import { loadDxf } from 'lib/pattern-import/adapters/dxf/tags';
import { pieceBlocks } from 'lib/pattern-import/adapters/rul/model';
import { isUnsupportedFormat } from 'lib/pattern-import/adapters/sniff';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';
import type { CardSize, DraftScopeTarget, PtMm } from 'lib/pattern-import/types';

const GOLDEN =
  process.env.PATIMPORT_GOLDEN_CLO ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/dxf-rul-export/golden-clo-shirt/';
const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
/** PLCK_R's side runs from the 4064-ruled end to the 4053-ruled end (sample y, mm). */
const PLCK_SIDE = { lo: 463.967407, hi: 1149.372314, dLo: -3, dHi: 5 };
const MARK_MAX_MM = 15;

let bad = 0;
const check = (c: string, name: string, ok: boolean, got: unknown = '') => {
  if (!ok) bad++;
  const g = typeof got === 'string' ? got : JSON.stringify(got);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c} · ${name}${g ? ` · ${g}` : ''}`);
};
const known = (what: string) => console.log(`KNOWN ${what}`);
const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const latin1 = (p: string) => new TextDecoder('latin1').decode(readFileSync(p));
const ctx = (): StageCtx => ({ checkCancel: () => {}, progress: () => {} });
const MAIN: DraftScopeTarget = {
  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
  fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
  bomLineKey: '',
  label: 'main',
  isInterlining: false,
};
const card = (tokens: string[]): CardSize[] =>
  tokens.map((t, i) => ({ sizeId: 100 + i, name: t, token: t, rank: i, spellings: [t] }));
const detail = (e: unknown) =>
  isUnsupportedFormat(e) ? e.detail ?? e.message : e instanceof Error ? e.message : String(e);
const f2 = (v: number) => v.toFixed(2);

// ── the DXF text: blocks in / out ────────────────────────────────────────────────────────────
const blockNames = (text: string): string[] =>
  [...text.matchAll(/\r?\nBLOCK\r?\n *8\r?\n[^\r\n]*\r?\n *2\r?\n([^\r\n]*)\r?\n/g)].map(
    (m) => m[1],
  );

/** The DXF without the piece blocks `keep` refuses (their BLOCK and their INSERTs). */
function filterBlocks(text: string, keep: (name: string) => boolean): string {
  const L = text.split(/\r?\n/);
  const out: string[] = [];
  let section = '';
  let skip = false;
  for (let i = 0; i + 1 < L.length; i += 2) {
    const code = L[i].trim();
    const val = L[i + 1];
    if (code === '0' && val === 'SECTION') section = L[i + 3];
    if (code === '0' && (val === 'BLOCK' || val === 'INSERT')) {
      let j = i + 2;
      let nm = '';
      while (j + 1 < L.length && L[j].trim() !== '0') {
        if (L[j].trim() === '2') nm = L[j + 1];
        j += 2;
      }
      skip = !keep(nm);
    } else if (section === 'ENTITIES' && code === '0' && val !== 'SEQEND') skip = false;
    if (!skip) out.push(L[i], L[i + 1]);
    if (code === '0' && (val === 'ENDBLK' || val === 'ENDSEC')) skip = false;
  }
  return out.join('\r\n');
}

/** The golden pair as expandRul takes it: the two known, out-of-lane refusals worked around. */
function prepare(): { dxfText: string; rulText: string } {
  let rulText = latin1(resolve(GOLDEN, 'allsizes.rul'));
  let dxfText = latin1(resolve(GOLDEN, 'allsizes.dxf'));
  const tryExpand = (dxf: string) =>
    expandRul({
      dxf: enc(dxf),
      dxfName: 'allsizes.dxf',
      rul: parseRul(enc(rulText), 'allsizes.rul'),
      rulName: 'allsizes.rul',
    });
  try {
    tryExpand(dxfText);
    return { dxfText, rulText };
  } catch (e) {
    const why = detail(e);
    if (/names grade rule table/.test(why)) {
      known(`table name (other lane): ${why}`);
      rulText = rulText.replace(/^(GRADE RULE TABLE:)[^\r\n]*/m, '$1 allsizes');
    }
  }
  const refused: string[] = [];
  for (const name of blockNames(dxfText)) {
    try {
      tryExpand(filterBlocks(dxfText, (n) => n === name));
    } catch (e) {
      refused.push(name);
      known(`${name} refused (other lane): ${detail(e)}`);
    }
  }
  if (refused.length) dxfText = filterBlocks(dxfText, (n) => !refused.includes(n));
  tryExpand(dxfText);
  return { dxfText, rulText };
}

// ── what a per-size DXF draws ────────────────────────────────────────────────────────────────
type Circle = { c: PtMm; r: number; spread: number; n: number };
type Blk = {
  name: string;
  outline: PtMm[];
  /** CLO's buttons: closed 20-gons, round to 0.05 mm. */
  circles: Circle[];
  /** Other small closed shapes on layer 8 (our drill square, a 16-gon snap). */
  others: Circle[];
  lines: PtMm[][];
};
const stemOf = (name: string) => name.replace(/_(XS|S|M|L|XL)$/, '');
const sizeOf = (name: string) => /_(XS|S|M|L|XL)$/.exec(name)?.[1] ?? '';

function blocksOf(dxfText: string): Map<string, Blk> {
  const raw = buildAst(loadDxf(enc(dxfText)).tok.tags);
  const out = new Map<string, Blk>();
  for (const p of pieceBlocks(raw)) {
    const b: Blk = { name: p.block.name, outline: [], circles: [], others: [], lines: [] };
    for (const m of p.entities) {
      if (m.kind !== 'chain') continue;
      const pts = m.slots.map((s) => ({ x: s.x, y: s.y }));
      if (m.layer === '1' && m.closed && pts.length > b.outline.length) b.outline = pts;
      if (m.layer !== '8') continue;
      if (pts.length === 2) {
        b.lines.push(pts);
        continue;
      }
      if (!m.closed || pts.length < 4) continue;
      const xs = pts.map((q) => q.x);
      const ys = pts.map((q) => q.y);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      if (w > MARK_MAX_MM + 1 || h > MARK_MAX_MM + 1) continue;
      const c = {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
      const rs = pts.map((q) => Math.hypot(q.x - c.x, q.y - c.y));
      const k = {
        c,
        r: (Math.min(...rs) + Math.max(...rs)) / 2,
        spread: Math.max(...rs) - Math.min(...rs),
        n: pts.length,
      };
      (pts.length === 20 && k.spread <= 0.05 ? b.circles : b.others).push(k);
    }
    out.set(p.block.name, b);
  }
  return out;
}

/** The distinct marks of a block (CLO draws some buttons twice), in drawing order. */
const distinct = (ks: Circle[]): Circle[] =>
  ks.filter((k, i) => ks.findIndex((o) => Math.hypot(o.c.x - k.c.x, o.c.y - k.c.y) <= 0.05) === i);
const minOf = (pts: PtMm[]): PtMm => ({
  x: Math.min(...pts.map((p) => p.x)),
  y: Math.min(...pts.map((p) => p.y)),
});

/** Per stem: the sample's distinct circles and, per size, the same circles in order. */
function buttonsByStem(blocks: Map<string, Blk>): Map<string, Circle[][]> {
  const out = new Map<string, Circle[][]>();
  for (const stem of new Set([...blocks.keys()].map(stemOf))) {
    const per = SIZES.map((z) => blocks.get(`${stem}_${z}`)).filter((b): b is Blk => !!b);
    if (per.length !== SIZES.length || !per[0].circles.length) continue;
    out.set(
      stem,
      per.map((b) => distinct(b.circles)),
    );
  }
  return out;
}

// ── A · expandRul ────────────────────────────────────────────────────────────────────────────
function sectionA(
  dxfText: string,
  rulText: string,
): { text: string; byStem: Map<string, Circle[][]> } {
  const rul = parseRul(enc(rulText), 'allsizes.rul');
  const ex = expandRul({
    dxf: enc(dxfText),
    dxfName: 'allsizes.dxf',
    rul,
    rulName: 'allsizes.rul',
  });
  const blocks = blocksOf(ex.text);
  const byStem = buttonsByStem(blocks);
  check(
    'A',
    'pieces with buttons found in every size',
    byStem.size >= 4 &&
      [...byStem.values()].every((per) => per.every((c) => c.length === per[0].length)),
    [...byStem.entries()].map(([s, per]) => `${s} ×${per[0].length}`).join(', '),
  );
  let round = true;
  let why = '';
  for (const [stem, per] of byStem)
    per.forEach((cs, si) =>
      cs.forEach((k, i) => {
        const r0 = per[0][i].r;
        if (k.n !== 20 || k.spread > 0.02 || Math.abs(k.r - r0) > 0.01) {
          round = false;
          why ||= `${stem}_${SIZES[si]} button ${i}: n=${k.n} r=${f2(k.r)}±${f2(k.spread / 2)} (sample r=${f2(r0)})`;
        }
      }),
    );
  check('A', 'every button is a 20-gon circle of the sample radius in every size', round, why);

  const plck = byStem.get('PLCK_R');
  let placket = !!plck;
  why = plck ? '' : 'no PLCK_R';
  const steps: string[] = [];
  plck?.[0].forEach((k0, i) => {
    const t = (k0.c.y - PLCK_SIDE.lo) / (PLCK_SIDE.hi - PLCK_SIDE.lo);
    const want = PLCK_SIDE.dLo + (PLCK_SIDE.dHi - PLCK_SIDE.dLo) * t;
    steps.push(f2(want));
    plck.forEach((cs, si) => {
      const dx = cs[i].c.x - k0.c.x;
      const dy = cs[i].c.y - k0.c.y;
      if (Math.abs(dx) > 0.05 || Math.abs(dy - want * si) > 0.1) {
        placket = false;
        why ||= `button ${i} ${SIZES[si]}: moved (${f2(dx)}, ${f2(dy)}), wanted (0, ${f2(want * si)})`;
      }
    });
  });
  check(
    'A',
    'PLCK_R: each centre moves by -3 + 8·t per size step',
    placket,
    why || `Δy/step ${steps.join(' ')}`,
  );

  // every button moves WITH its piece: linear in size, and never beyond what the outline's own
  // vertices do in that size (a proportional place inside the outline)
  let linear = true;
  why = '';
  const moved: string[] = [];
  for (const [stem, per] of byStem) {
    const o0 = blocks.get(`${stem}_XS`)!.outline;
    per[0].forEach((k0, i) => {
      const d1 = { x: per[1][i].c.x - k0.c.x, y: per[1][i].c.y - k0.c.y };
      if (i === 0) moved.push(`${stem} (${f2(d1.x)}, ${f2(d1.y)})`);
      per.forEach((cs, si) => {
        const dx = cs[i].c.x - k0.c.x;
        const dy = cs[i].c.y - k0.c.y;
        if (Math.hypot(dx - d1.x * si, dy - d1.y * si) > 0.02) {
          linear = false;
          why ||= `${stem} button ${i} ${SIZES[si]}: off the size line by ${f2(Math.hypot(dx - d1.x * si, dy - d1.y * si))}`;
        }
        const os = blocks.get(`${stem}_${SIZES[si]}`)!.outline;
        const vx = o0.map((p, j) => os[j].x - p.x);
        const vy = o0.map((p, j) => os[j].y - p.y);
        if (
          dx < Math.min(...vx) - 0.01 ||
          dx > Math.max(...vx) + 0.01 ||
          dy < Math.min(...vy) - 0.01 ||
          dy > Math.max(...vy) + 0.01
        ) {
          linear = false;
          why ||= `${stem} button ${i} ${SIZES[si]}: moved (${f2(dx)}, ${f2(dy)}), the outline moves x ${f2(Math.min(...vx))}..${f2(Math.max(...vx))} y ${f2(Math.min(...vy))}..${f2(Math.max(...vy))}`;
        }
      });
    });
  }
  check(
    'A',
    'every button centre moves with its piece: linear in size, within what the outline does',
    linear,
    why || `Δ/step ${moved.join(' · ')}`,
  );

  let cross = true;
  why = '';
  for (const [stem, per] of byStem)
    per.forEach((cs, si) => {
      const b = blocks.get(`${stem}_${SIZES[si]}`)!;
      cs.forEach((k, i) => {
        const inside = b.lines.filter((l) =>
          l.every((p) => Math.hypot(p.x - k.c.x, p.y - k.c.y) <= k.r + 0.05),
        );
        const through = inside.filter((l) => {
          const m = { x: (l[0].x + l[1].x) / 2, y: (l[0].y + l[1].y) / 2 };
          return Math.hypot(m.x - k.c.x, m.y - k.c.y) <= 0.02;
        });
        if (through.length < 2) {
          cross = false;
          why ||= `${stem}_${SIZES[si]} button ${i}: ${through.length} cross lines through the centre (${inside.length} inside)`;
        }
      });
    });
  check('A', 'the two cross lines of every button move with its circle', cross, why);
  return { text: ex.text, byStem };
}

// ── B · the product path ─────────────────────────────────────────────────────────────────────
async function sectionB(dxfText: string, rulText: string, expanded: Map<string, Circle[][]>) {
  const s = new Session(1, [
    { name: 'allsizes.dxf', bytes: enc(dxfText) },
    { name: 'allsizes.rul', bytes: enc(rulText) },
  ]);
  const c = ctx();
  const ex = await s.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, c);
  await s.runStage(
    'scale',
    {
      decision: {
        factor: ex.scale[0]?.factor ?? 1,
        method: ex.scale[0]?.method ?? 'declared',
        operatorConfirmed: false,
      },
    },
    c,
  );
  await s.runStage('assemble', { sheet: 0 }, c);
  await s.runStage('chains', { opts: { joinGapMm: 3, joinAngleDeg: 15, joinLateralMm: 0.15 } }, c);
  const sz = await s.runStage('sizes', { card: card(SIZES) }, c);
  await s.runStage('pieces', { edits: [], opts: { cellMm: 0.5, snapMm: 0.3, variant: null } }, c);
  const sem = await s.runStage(
    'semantics',
    {
      fileAllowance: { meaning: 'cut', allowanceMm: 0, origin: 'default', evidence: [] },
      pieceOverrides: {},
      operatorGrain: {},
    },
    c,
  );
  const w = await s.runStage(
    'write',
    {
      techCardId: 1,
      scopes: [MAIN],
      assignment: {
        byPurpose: { [MAIN.scopeKey]: [...new Set(sem.pieces.map((p) => p.seed))] },
        interliningInBom: false,
        proposals: [],
      },
      sizes: sz.map.entries.flatMap((e) =>
        e.card
          ? [
              {
                token: e.card.token,
                sizeId: e.card.sizeId,
                name: e.card.name,
                sourceLabel: e.source.label,
                rank: e.source.rank,
              },
            ]
          : [],
      ),
      dialect: 'r12',
      generator: 'btn',
      storage: 'rul',
    },
    c,
  );
  s.close();
  const sc = w.scopes[0];
  const ours = blocksOf(sc.dxfText);
  const byStem = buttonsByStem(ours);

  // the same buttons, where the expansion put them (relative to the outline: the writer moves
  // pieces). A piece identical in every size (the flap: all its rules are 0) is one `_UNI` block;
  // a piece the session folds into another piece's quantity (the pockets, PLCK_L — as before this
  // fix) has no block of its own and is skipped.
  let same = true;
  let why = '';
  const skipped: string[] = [];
  const uni: string[] = [];
  const compare = (name: string, mine: Circle[], want: Circle[], from: string) => {
    const o0 = minOf(ours.get(name)!.outline);
    const k0 = expandedMin.get(from)!;
    if (mine.length !== want.length) {
      same = false;
      why ||= `${name}: ${mine.length} buttons, expanded ${want.length}`;
      return;
    }
    want.forEach((k, i) => {
      const m = mine[i];
      const rel = { x: m.c.x - o0.x, y: m.c.y - o0.y };
      const at = { x: k.c.x - k0.x, y: k.c.y - k0.y };
      if (
        Math.hypot(rel.x - at.x, rel.y - at.y) > 0.02 ||
        m.spread > 0.02 ||
        Math.abs(m.r - k.r) > 0.02 ||
        m.n < 8
      ) {
        same = false;
        why ||= `${name} button ${i}: at (${f2(rel.x)}, ${f2(rel.y)}) r=${f2(m.r)}±${f2(m.spread / 2)} n=${m.n}, expanded (${f2(at.x)}, ${f2(at.y)}) r=${f2(k.r)}`;
      }
    });
  };
  for (const [stem, per] of expanded) {
    const mine = byStem.get(stem);
    if (mine) {
      per.forEach((cs, si) =>
        compare(`${stem}_${SIZES[si]}`, mine[si], cs, `${stem}_${SIZES[si]}`),
      );
      continue;
    }
    const one = ours.get(`${stem}_UNI`);
    if (one) {
      uni.push(stem);
      per.forEach((cs, si) =>
        compare(`${stem}_UNI`, distinct(one.circles), cs, `${stem}_${SIZES[si]}`),
      );
    } else if (ours.has(`${stem}_XS`)) {
      same = false;
      why ||= `${stem}: no buttons in our export`;
    } else skipped.push(stem);
  }
  const squares = [...ours.values()].reduce(
    (a, b) => a + b.others.filter((k) => k.n === 4).length,
    0,
  );
  check(
    'B',
    'our per-size DXF: every button a circle of the source diameter at the expanded centre, no square',
    same && squares === 0 && byStem.has('PLCK_R'),
    why ||
      `${[...byStem.entries()].map(([s2, per]) => `${s2} ×${per[0].length} ⌀${f2(per[0][0].r * 2)}`).join(', ')}${uni.map((s2) => ` · ${s2}_UNI ×${distinct(ours.get(`${s2}_UNI`)!.circles).length} (same in every size)`).join('')}${squares ? ` · ${squares} squares` : ''}${skipped.length ? ` · folded into another piece by the session, no block of its own: ${skipped.join(', ')}` : ''}`,
  );

  const r = sc.rul;
  check(
    'B',
    'base + RUL packed',
    !!r && r.ok,
    r
      ? r.ok
        ? `base ${r.base} · ${r.rules} rules · max ${r.maxErrMm.toExponential(1)} mm`
        : r.reasons.join(' | ')
      : 'no rul',
  );
  if (r?.ok) {
    const back = expandRul({
      dxf: enc(r.dxfText),
      dxfName: r.dxfFilename,
      rul: parseRul(enc(r.rulText), r.rulFilename),
      rulName: r.rulFilename,
    });
    const again = buttonsByStem(blocksOf(back.text));
    let equal = true;
    why = '';
    for (const [stem, per] of byStem) {
      const b = again.get(stem);
      per.forEach((cs, si) =>
        cs.forEach((k, i) => {
          const m = b?.[si]?.[i];
          if (
            !m ||
            Math.hypot(m.c.x - k.c.x, m.c.y - k.c.y) > 0.01 ||
            m.spread > 0.02 ||
            Math.abs(m.r - k.r) > 0.01
          ) {
            equal = false;
            why ||= `${stem}_${SIZES[si]} button ${i}: ${m ? `(${f2(m.c.x)}, ${f2(m.c.y)}) r=${f2(m.r)}±${f2(m.spread / 2)}` : 'missing'} vs (${f2(k.c.x)}, ${f2(k.c.y)}) r=${f2(k.r)}`;
          }
        }),
      );
    }
    check(
      'B',
      'base + RUL expanded back: the same circles at the same centres (what CLO builds)',
      equal,
      why,
    );
  }
  return sc.dxfText;
}
/** Outline min corner per expanded block, set by main() before section B. */
const expandedMin = new Map<string, PtMm>();

// ── C · the picture ──────────────────────────────────────────────────────────────────────────
const COLOR: Record<string, string> = {
  XS: '#1f77b4',
  S: '#2ca02c',
  M: '#111111',
  L: '#ff7f0e',
  XL: '#d62728',
};

function sectionC(afterText: string, beforePath: string | undefined): string {
  const after = blocksOf(afterText);
  const before = beforePath ? blocksOf(latin1(beforePath)) : null;
  const stems = [...buttonsByStem(after).keys()];
  const PAD = 20;
  const ZOOM = 4;
  const ZOOM_R = 22; // mm around the first button
  const rows: string[] = [];
  let y0 = 40;
  let width = 0;
  const poly = (pts: PtMm[], o: PtMm, s: number, at: PtMm, style: string, closed = true) =>
    `<polyline points="${pts.map((p) => `${(at.x + (p.x - o.x) * s).toFixed(2)},${(at.y - (p.y - o.y) * s).toFixed(2)}`).join(' ')}${closed && pts.length ? ` ${(at.x + (pts[0].x - o.x) * s).toFixed(2)},${(at.y - (pts[0].y - o.y) * s).toFixed(2)}` : ''}" fill="none" ${style}/>`;
  for (const stem of stems) {
    const per = SIZES.map((z) => after.get(`${stem}_${z}`)!);
    const o = minOf(per[0].outline);
    const W = Math.max(...per.flatMap((b) => b.outline.map((p) => p.x - o.x)));
    const H = Math.max(...per.flatMap((b) => b.outline.map((p) => p.y - o.y)));
    // the zoom looks at the first button, centred on its mean centre across sizes
    const firsts = per.map((b) => distinct(b.circles)[0].c);
    const first = {
      x: firsts.reduce((a, p) => a + p.x, 0) / firsts.length,
      y: firsts.reduce((a, p) => a + p.y, 0) / firsts.length,
    };
    const zoomW = ZOOM_R * 2 * ZOOM;
    const panels: { title: string; w: number; draw: (at: PtMm, top: number) => string[] }[] = [];
    const marksOf = (
      src: Map<string, Blk> | null,
      z: string,
      at: PtMm,
      s: number,
      org: PtMm,
      red: boolean,
    ) => {
      if (!src) return [];
      const b = src.get(`${stem}_${z}`);
      if (!b) return [];
      // the writer nests the sizes (the expansion's frame, moved as one); a source export is
      // brought into the after-export's frame by aligning the two XS outlines
      const so = minOf(src.get(`${stem}_XS`)!.outline);
      const style = red
        ? `stroke="#d62728" stroke-width="${(1 / s).toFixed(2)}" stroke-dasharray="${(2 * s).toFixed(1)},${(1.5 * s).toFixed(1)}"`
        : `stroke="${COLOR[z]}" stroke-width="${(1.2 / Math.sqrt(s)).toFixed(2)}"`;
      const shift = (p: PtMm): PtMm => ({ x: p.x - so.x + o.x, y: p.y - so.y + o.y });
      return [
        ...b.others.map((k) => poly(polyOf(k, k.n).map(shift), org, s, at, style)),
        ...b.circles.map((k) => poly(polyOf(k, k.n).map(shift), org, s, at, style)),
        ...b.lines
          .filter(
            (l) =>
              l.every(
                (p) => Math.hypot(p.x - first.x - (so.x - o.x), p.y - first.y - (so.y - o.y)) <= 60,
              ) || s === 1,
          )
          .map((l) => poly(l.map(shift), org, s, at, style, false)),
      ];
    };
    const polyOf = (k: Circle, n: number): PtMm[] =>
      Array.from({ length: n }, (_, i) => {
        const a = (n === 4 ? Math.PI / 4 : Math.PI / 2) + (2 * Math.PI * i) / n;
        return { x: k.c.x + k.r * Math.cos(a), y: k.c.y + k.r * Math.sin(a) };
      });
    const piece = (title: string, src: Map<string, Blk> | null, red: boolean) =>
      panels.push({
        title,
        w: W,
        draw: (at) => [
          ...SIZES.map((z) =>
            poly(
              per[SIZES.indexOf(z)].outline,
              o,
              1,
              at,
              `stroke="${COLOR[z]}" stroke-width="0.5" opacity="0.7"`,
            ),
          ),
          ...SIZES.flatMap((z) => marksOf(src, z, at, 1, o, red)),
        ],
      });
    const zoom = (title: string, src: Map<string, Blk> | null, red: boolean) =>
      panels.push({
        title,
        w: zoomW,
        draw: (at, top) => {
          const org = { x: first.x - ZOOM_R, y: first.y - ZOOM_R };
          const base = { x: at.x, y: top + zoomW }; // the box's bottom-left corner
          const id = `c-${stem}-${title.replace(/[^a-z0-9]/gi, '')}`;
          return [
            `<rect x="${base.x}" y="${top}" width="${zoomW}" height="${zoomW}" fill="none" stroke="#999" stroke-width="0.5"/>`,
            `<clipPath id="${id}"><rect x="${base.x}" y="${top}" width="${zoomW}" height="${zoomW}"/></clipPath>`,
            `<g clip-path="url(#${id})">`,
            ...SIZES.map((z) =>
              poly(
                per[SIZES.indexOf(z)].outline,
                org,
                ZOOM,
                base,
                `stroke="${COLOR[z]}" stroke-width="0.6" opacity="0.7"`,
              ),
            ),
            ...SIZES.flatMap((z) => marksOf(src, z, base, ZOOM, org, red)),
            '</g>',
          ];
        },
      });
    if (before) piece('before', before, true);
    piece('after', after, false);
    if (before) zoom('before ×4', before, true);
    zoom('after ×4', after, false);
    const rowH = Math.max(H, zoomW) + PAD;
    let x = PAD;
    const row: string[] = [
      `<text x="${PAD}" y="${y0 - 6}" font-size="12" font-family="monospace" fill="#111">${stem}</text>`,
    ];
    for (const p of panels) {
      const at = { x, y: y0 + 12 + Math.max(H, zoomW) };
      row.push(
        `<text x="${x}" y="${y0 + 8}" font-size="9" font-family="monospace" fill="#555">${p.title}</text>`,
      );
      row.push(...p.draw(at, y0 + 12));
      x += p.w + PAD;
    }
    width = Math.max(width, x);
    rows.push(row.join('\n'));
    y0 += rowH + 40;
  }
  const legend = SIZES.map(
    (z, i) =>
      `<text x="${PAD + i * 40}" y="22" font-size="11" font-family="monospace" fill="${COLOR[z]}">${z}</text>`,
  ).join('');
  const note = `<text x="${PAD + 220}" y="22" font-size="10" font-family="monospace" fill="#d62728">red dashed = before (the old export: one still square for all sizes)</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y0}" viewBox="0 0 ${width} ${y0}" style="background:#fff">\n${legend}${before ? note : ''}\n${rows.join('\n')}\n</svg>\n`;
}

export async function main(): Promise<number> {
  const { dxfText, rulText } = prepare();
  const a = sectionA(dxfText, rulText);
  for (const [name, b] of blocksOf(a.text)) expandedMin.set(name, minOf(b.outline));
  const afterText = await sectionB(dxfText, rulText, a.byStem);
  const svg = sectionC(afterText, process.env.PATIMPORT_BTN_BEFORE);
  const out = resolve(GOLDEN, 'btn-after.svg');
  writeFileSync(out, svg);
  console.log(`picture: ${out}`);
  console.log(bad ? `\n${bad} FAIL` : '\nall PASS');
  return bad ? 1 : 0;
}
