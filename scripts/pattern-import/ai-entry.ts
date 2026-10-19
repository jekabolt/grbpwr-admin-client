// F10 probe: AI piece naming, client side. NO NETWORK: every model answer here is a fake.
//   §D  dictionary — SL not SLV, D2 codes, isKnownCode, piece-codes.ts aligned, wizard rule
//   §Q  quantity / fold / language readers on printed strings
//   §S  synonyms on every printed name of the truth corpus (hit rate + misses listed)
//   §E  evidence builder on a synthetic sheet (inside/near text, nested pocket, qty, fold,
//       symmetry, mirrored twin, instructions excerpt, language)
//   §R  SoM render on a recording canvas: caps, marks inside their pieces, crops, byte-cap fallback
//   §W  wire mapping: clamps to F9's bounds, code splitting, purposes, zero values
//   §C  combiner unit cases (text agree/conflict, collisions, uniqueness, grammar, siblings)
//   §N  the call path with fake upload + fake RPC (uploads, request, decisions)
//   §K  calibration on K0 truth with fake answers + injected errors → T, precision, recall
import fs from 'node:fs';
import path from 'node:path';
import type {
  SuggestPatternPiecesRequest,
  SuggestPatternPiecesResponse,
} from 'api/proto-http/admin';
import {
  pieceBaseCodes,
  pieceModifiers,
} from 'components/managers/tech-card/components/piece-codes';
import { combineNames } from 'lib/pattern-import/ai/combine';
import { aiFabricHintsOf } from 'lib/pattern-import/fabrics/propose';
import {
  buildMarks,
  languageOf,
  markSources,
  parseQuantity,
  saysFold,
} from 'lib/pattern-import/ai/evidence';
import { isMirrorSymmetric, isMirrorTwin, inside as insidePoly } from 'lib/pattern-import/ai/geom';
import { buildSuggestInput } from 'lib/pattern-import/ai/input';
import { suggestNames } from 'lib/pattern-import/ai/name';
import { planSom, renderSom, SOM_DEFAULTS } from 'lib/pattern-import/ai/som';
import {
  AI_AUTO_ACCEPT_CALIBRATED,
  AI_AUTO_ACCEPT_FLOOR,
  AI_AUTO_ACCEPT_T,
  AI_PRECISION_TARGET,
} from 'lib/pattern-import/ai/threshold';
import {
  fromWireResponse,
  splitCode,
  toWireRequest,
  WIRE_LIMITS,
} from 'lib/pattern-import/ai/wire';
import { isKnownCode, PIECE_CODES } from 'lib/pattern-import/dictionary/codes';
import { readPieceText } from 'lib/pattern-import/dictionary/synonyms';
import { identitiesOf, identityProblem, sizeTokenTest } from 'lib/pattern-import/manifest';
import type {
  NameDecision,
  IRPath,
  IRText,
  PieceCandidate,
  PieceFamily,
  PieceSuggestion,
  PtMm,
  Seed,
  SomMark,
  StageIO,
  Style,
} from 'lib/pattern-import/types';

// ── harness ────────────────────────────────────────────────────────────────────────────────

type Row = { section: string; what: string; ok: boolean; detail: string };
const rows: Row[] = [];
let section = '';
const ck = (ok: boolean, what: string, detail = '') => {
  rows.push({ section, what, ok, detail });
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};
const head = (s: string) => {
  section = s;
  console.log(`\n${s}`);
};

// ── synthetic geometry ─────────────────────────────────────────────────────────────────────

const tr = (pts: PtMm[], dx: number, dy: number) => pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
const mirrorX = (pts: PtMm[]) => pts.map((p) => ({ x: -p.x, y: p.y })).reverse();
const scaleAbout = (pts: PtMm[], k: number) => {
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  return pts.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
};
const area = (p: PtMm[]) => {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    a += (p[j].x + p[i].x) * (p[j].y - p[i].y);
  return Math.abs(a / 2);
};
const box = (p: PtMm[]) => ({
  minX: Math.min(...p.map((q) => q.x)),
  minY: Math.min(...p.map((q) => q.y)),
  maxX: Math.max(...p.map((q) => q.x)),
  maxY: Math.max(...p.map((q) => q.y)),
});

let textId = 1;
const txt = (text: string, x: number, y: number, size = 8): IRText => ({
  id: textId++,
  text,
  anchor: { x, y },
  bbox: { minX: x, minY: y, maxX: x + text.length * size * 0.55, maxY: y + size * 0.7 },
  fontSizeMm: size,
  rotationDeg: 0,
  layer: null,
  src: { file: 'f', page: 0, op: 0, sub: 0 },
});

function family(seed: number, outer: PtMm[], extra: Partial<PieceCandidate> = {}): PieceFamily {
  const cand = (rank: number, pts: PtMm[]): PieceCandidate => ({
    seed,
    rank,
    outer: pts,
    walls: [],
    inside: [],
    textsInside: [],
    outcome: 'closed',
    areaMm2: area(pts),
    bbox: box(pts),
    sourceCoverage: 1,
    p95Mm: 0.05,
    ...extra,
  });
  return { seed, candidates: [cand(0, scaleAbout(outer, 0.94)), cand(1, outer)], monotone: true };
}

// An asymmetric front (CF straight, armhole + side shaped), its mirror, a symmetric back, a
// small symmetric collar, a pocket nested inside the front.
const FRONT: PtMm[] = [
  { x: 0, y: 0 },
  { x: 280, y: 0 },
  { x: 300, y: 380 },
  { x: 250, y: 470 },
  { x: 230, y: 560 },
  { x: 120, y: 600 },
  { x: 40, y: 540 },
  { x: 0, y: 500 },
];
const BACK: PtMm[] = [
  { x: 0, y: 0 },
  { x: 420, y: 0 },
  { x: 440, y: 420 },
  { x: 380, y: 590 },
  { x: 210, y: 620 },
  { x: 40, y: 590 },
  { x: -20, y: 420 },
];
const COLLAR: PtMm[] = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 190, y: 60 },
  { x: 10, y: 60 },
];
const POCKET: PtMm[] = [
  { x: 0, y: 0 },
  { x: 120, y: 0 },
  { x: 120, y: 140 },
  { x: 0, y: 140 },
];

function syntheticSheet() {
  textId = 1;
  const front = tr(FRONT, 0, 0);
  const frontTwin = tr(mirrorX(FRONT), 700, 0);
  const back = tr(BACK, 820, 0);
  const collar = tr(COLLAR, 1400, 40);
  const pocket = tr(POCKET, 60, 80);
  const fams: PieceFamily[] = [
    family(1, front),
    family(2, frontTwin),
    family(3, back, {
      features: [
        {
          kind: 'fold',
          a: { x: 1030, y: 0 },
          b: { x: 1030, y: 620 },
          origin: 'detected',
          ranges: [],
          confidence: 1,
        },
      ],
    }),
    family(4, collar),
    family(5, pocket),
  ];
  const seeds: Seed[] = fams.map((f) => ({
    id: f.seed,
    at: { x: 0, y: 0 },
    origin: 'click',
    variant: null,
  }));
  const texts: IRText[] = [
    txt('Vorderteil', 120, 300),
    txt('2 x zuschneiden', 120, 280),
    txt('# -1', 150, 200), // a CLO/AAMA grade-point label: never quoted
    txt('Vorderteil', 130, 320), // the same label twice: quoted once
    txt('Tasche', 80, 150, 5), // inside the pocket, which is inside the front
    txt('Rückenteil', 960, 300),
    txt('Cut 1 on fold', 1020, 630), // near the back (10 mm above its top)
    txt('Kragen', 1460, 70, 3),
    txt('10 x 10 cm', 2000, 900), // the test square label: no quantity
    txt('Teile: 1 Vorderteil 2x, 2 Rückenteil im Bruch', 0, 900),
    txt('Teile: 1 Vorderteil 2x, 2 Rückenteil im Bruch', 0, 880), // repeated per size OCG
  ];
  const styles: Style[] = [
    { id: 0, strokeRgb: [0, 0, 0], widthMm: 0.3, dash: null, layer: null, fill: false, clip: null },
    { id: 1, strokeRgb: [0, 0, 0], widthMm: 0, dash: null, layer: null, fill: true, clip: null },
  ];
  const paths: IRPath[] = [
    ...fams.map((f, i) => ({
      id: i,
      pts: f.candidates[1].outer,
      closed: true,
      style: 0,
      src: { file: 'f', page: 0, op: i, sub: 0 },
    })),
    // a letter drawn as a filled curve
    {
      id: 99,
      pts: [
        { x: 1500, y: 300 },
        { x: 1510, y: 300 },
        { x: 1510, y: 320 },
      ],
      closed: true,
      style: 1,
      src: { file: 'f', page: 0, op: 99, sub: 0 },
    },
  ];
  return { sheet: { texts, paths, styles }, fams, seeds };
}

// ── recording canvas (node has no OffscreenCanvas) ────────────────────────────────────────

type Rec = {
  w: number;
  h: number;
  calls: { op: string; args: unknown[] }[];
  texts: { s: string; x: number; y: number }[];
};
function recordingCanvas(
  sizeOf: (type: string, quality: number | undefined, w: number, h: number) => number,
) {
  const made: Rec[] = [];
  const factory = (w: number, h: number) => {
    const rec: Rec = { w, h, calls: [], texts: [] };
    made.push(rec);
    const ctx: Record<string, unknown> = {};
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(t, k: string) {
        if (k in t) return t[k];
        return (...args: unknown[]) => {
          rec.calls.push({ op: k, args });
          if (k === 'fillText')
            rec.texts.push({ s: String(args[0]), x: Number(args[1]), y: Number(args[2]) });
        };
      },
      set(t, k: string, v) {
        t[k] = v;
        return true;
      },
    };
    const proxy = new Proxy(ctx, handler);
    return {
      width: w,
      height: h,
      getContext: () => proxy,
      convertToBlob: async (o?: { type?: string; quality?: number }) => {
        const type = o?.type ?? 'image/png';
        return new Blob([new Uint8Array(sizeOf(type, o?.quality, w, h))], { type });
      },
    } as unknown as OffscreenCanvas;
  };
  return { factory, made };
}

// ── truth corpus ───────────────────────────────────────────────────────────────────────────

type TruthPiece = {
  label: string;
  name_orig: string;
  name_en: string;
  suggested_code: string;
  qty: number | string;
  fold: boolean | string;
  pair: boolean | string;
  fabric: string;
  grammar_gap?: boolean;
  notes?: string;
};
type TruthSample = {
  id: string;
  variants: { name: string; pieces?: TruthPiece[]; pieces_ref?: number[] }[];
  pieces?: TruthPiece[];
};
type Sheetish = { sample: string; variant: string; pieces: TruthPiece[] };

function truthSheets(corpus: string): Sheetish[] {
  const t = JSON.parse(fs.readFileSync(path.join(corpus, 'truth.json'), 'utf8')) as {
    samples: TruthSample[];
  };
  const out: Sheetish[] = [];
  for (const s of t.samples)
    for (const v of s.variants) {
      const pieces =
        v.pieces ??
        (v.pieces_ref ?? [])
          .map((n) => (s.pieces ?? []).find((p) => p.label === String(n)))
          .filter((p): p is TruthPiece => !!p);
      out.push({ sample: s.id, variant: v.name, pieces });
    }
  return out;
}

// Labels that exist as TEXT in the files (TRUTH.md): kombinezon names + "cut x1 pair"; polupalto's
// RU/EN/DE labels on the overview sheets. Every other sample draws its labels as curves (reef,
// blazer, r4454, Redcafe, wm), is a raster (leonie), or prints no names (viola, zhaket, robe → the
// names are in the instructions, palto → numbers on the sheet).
const TEXT_SAMPLES = new Set(['kombinezon', 'polupalto']);
const printed = (p: TruthPiece) => !p.name_orig.trim().startsWith('(');

// ── deterministic RNG ──────────────────────────────────────────────────────────────────────

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CONFUSE: Record<string, string[]> = {
  FP: ['BP', 'SP', 'FAC'],
  BP: ['FP', 'SP', 'YK'],
  SP: ['FP', 'BP'],
  SL: ['CUF', 'FP', 'SP'],
  CUF: ['WB', 'SL', 'CLR'],
  CLR: ['CUF', 'LAP', 'FAC'],
  LAP: ['CLR', 'FAC'],
  FAC: ['LIN', 'PLK', 'FP'],
  PCK: ['FAC', 'TAB', 'PLK'],
  WB: ['BLT', 'CUF', 'HB'],
  BLT: ['WB', 'TAB'],
  YK: ['BP', 'FP'],
  PLK: ['FAC', 'TAB'],
  HD: ['CLR', 'BP'],
  TAB: ['BLT', 'PLK', 'PCK'],
  HB: ['WB', 'CUF'],
  SK: ['FP', 'BP'],
};

type Fake = {
  code: string;
  mods: string[];
  pair: boolean;
  onFold: boolean;
  conf: number;
  wrong: boolean;
  kind: string;
};

function fakeAnswer(p: TruthPiece, r: () => number, errRate: number, siblings: string[]): Fake {
  const truth = splitCode(p.suggested_code);
  const pair = p.pair === true;
  const onFold = p.fold === true;
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  if (r() >= errRate)
    return { ...truth, pair, onFold, conf: 0.55 + 0.43 * r(), wrong: false, kind: 'right' };
  // A wrong answer; half of them CONFIDENTLY wrong (0.80–0.97), the rest 0.30–0.85.
  const conf = r() < 0.5 ? 0.8 + 0.17 * r() : 0.3 + 0.55 * r();
  const kind = pick(['base', 'base', 'side', 'part', 'hand', 'size', 'pairfold']);
  const mods = [...truth.mods];
  switch (kind) {
    case 'base': {
      const first = truth.code.split('_')[0];
      const alt = pick(CONFUSE[first] ?? ['FP', 'BP']);
      return { code: alt, mods, pair, onFold, conf, wrong: true, kind };
    }
    case 'side': {
      const i = mods.findIndex((m) => m === 'F' || m === 'B');
      if (i >= 0) mods[i] = mods[i] === 'F' ? 'B' : 'F';
      else
        mods.splice(
          mods.findIndex((m) => /^\d+$/.test(m) || m === '#') >= 0
            ? mods.findIndex((m) => /^\d+$/.test(m) || m === '#')
            : mods.length,
          0,
          pick(['F', 'B']),
        );
      return { code: truth.code, mods, pair, onFold, conf, wrong: true, kind };
    }
    case 'part': {
      // Prefer a sibling's number (a swap), else a fresh one.
      const i = mods.findIndex((m) => /^\d+$/.test(m));
      const taken = siblings.filter((s) => s !== p.suggested_code);
      const sib = taken.find((s) => splitCode(s).code === truth.code);
      if (sib && r() < 0.6) return { ...splitCode(sib), pair, onFold, conf, wrong: true, kind };
      if (i >= 0) mods[i] = String(Number(mods[i]) + 1 + Math.floor(r() * 2));
      else mods.push(String(1 + Math.floor(r() * 3)));
      return { code: truth.code, mods, pair, onFold, conf, wrong: true, kind };
    }
    case 'hand':
      return {
        code: truth.code,
        mods: [pick(['L', 'R']), ...mods],
        pair: false,
        onFold,
        conf,
        wrong: true,
        kind,
      };
    case 'size':
      // The model wrote a size tail; the server refuses the code (code "", warning).
      return { code: '', mods: [], pair, onFold, conf, wrong: true, kind };
    default:
      // Pair/fold wrong, code right: the IDENTITY is still right (counted correct for naming).
      return { ...truth, pair: !pair, onFold: !onFold, conf, wrong: false, kind };
  }
}

const FABRIC_OF = (f: string): string[] => {
  const out = new Set<string>();
  const s = f.toLowerCase();
  if (/shell|main|fabric|contrast/.test(s) || !s.trim()) out.add('TECH_CARD_BOM_PURPOSE_MAIN');
  if (/lining/.test(s)) out.add('TECH_CARD_BOM_PURPOSE_LINING');
  if (/interfacing/.test(s)) out.add('TECH_CARD_BOM_PURPOSE_INTERFACING');
  return [...out];
};
const BOM = [
  'TECH_CARD_BOM_PURPOSE_MAIN',
  'TECH_CARD_BOM_PURPOSE_LINING',
  'TECH_CARD_BOM_PURPOSE_INTERFACING',
];

type Scenario = {
  name: string;
  text: 'realistic' | 'labels' | 'none';
  card: 'empty' | 'populated';
};
const SCENARIOS: Scenario[] = [
  { name: 'realistic text, empty card', text: 'realistic', card: 'empty' },
  { name: 'every label read, empty card', text: 'labels', card: 'empty' },
  { name: 'every label read, card already lists the pieces', text: 'labels', card: 'populated' },
  { name: 'no text at all', text: 'none', card: 'empty' },
];
const ERR_RATES = [0.1, 0.25, 0.4];
const RUNS = 200;
const TS = Array.from({ length: 70 }, (_, i) => Math.round((0.3 + i * 0.01) * 100) / 100);

type Tally = {
  pieces: number;
  auto: number[];
  correct: number[];
  strictPair: number[];
  /** Wrong rows auto-accepted at the T in use, by injected error kind (truth → answer examples). */
  wrongAtT: Record<string, { n: number; examples: string[] }>;
};

function runCalibration(sheets: Sheetish[], sc: Scenario, errRate: number): Tally {
  const tally: Tally = {
    pieces: 0,
    auto: TS.map(() => 0),
    correct: TS.map(() => 0),
    strictPair: TS.map(() => 0),
    wrongAtT: {},
  };
  for (let run = 0; run < RUNS; run++) {
    const r = rng(1000 * run + Math.round(errRate * 100) + sc.name.length * 7919);
    for (const sh of sheets) {
      const pieces = sh.pieces.filter(
        (p) => p.suggested_code !== '?' && /^[A-Z]/.test(p.suggested_code),
      );
      if (!pieces.length) continue;
      const marks: SomMark[] = [];
      const sugg: PieceSuggestion[] = [];
      const fakes: Fake[] = [];
      const codes = pieces.map((p) => p.suggested_code);
      pieces.forEach((p, i) => {
        const hasText =
          sc.text === 'labels'
            ? printed(p)
            : sc.text === 'realistic'
              ? TEXT_SAMPLES.has(sh.sample) && printed(p)
              : false;
        const textInside = hasText ? [p.name_orig] : [];
        const q = hasText ? parseQuantity(p.name_orig) : null;
        const fold = p.fold === true;
        marks.push({
          mark: i + 1,
          seed: i + 1,
          bboxMm: [0, 0, 300, 500],
          areaMm2: 150000,
          textInside,
          textNear: [],
          quantityText: q !== null ? p.name_orig : '',
          cutQtyHint: q,
          // A drawn fold line is detected 70 % of the time; text saying so counts too.
          foldHint: (fold && r() < 0.7) || (hasText && saysFold(p.name_orig)),
          // Pieces drawn half (fold) and chiral pairs are not symmetric; a single piece is 50/50.
          symmetricHint: !fold && p.pair !== true && r() < 0.5,
          sizeCount: 5,
          mirrorTwinMark: null,
          variant: null,
        });
        const f = fakeAnswer(p, r, errRate, codes);
        fakes.push(f);
        sugg.push({
          mark: i + 1,
          code: f.code,
          mods: f.mods,
          displayName: p.name_en,
          fabrics: FABRIC_OF(p.fabric),
          cutQty: typeof p.qty === 'number' ? p.qty : f.pair ? 2 : null,
          onFold: f.onFold,
          pair: f.pair,
          variant: null,
          modelConfidence: f.conf,
          evidence: [],
        });
      });
      tally.pieces += pieces.length;
      // threshold 0 → `autoAccepted` = every gate but the confidence; the sweep applies T itself.
      const dec = combineNames(sugg, marks, {
        existingPieceNames:
          sc.card === 'populated' ? [...codes, ...pieces.map((p) => p.name_en)] : [],
        threshold: 0,
        sizeTokens: ['XS', 'S', 'M', 'L', 'XL', '44', '46', '48'],
        bomPurposes: BOM,
        isKnownCode,
      });
      dec.forEach((d, i) => {
        const truth = pieces[i].suggested_code;
        const got = [d.code, ...d.mods].filter(Boolean).join('_');
        const ok = got === truth;
        const gate = d.autoAccepted;
        TS.forEach((T, ti) => {
          if (!gate || !d.code || d.confidence < T) return;
          tally.auto[ti]++;
          if (ok) tally.correct[ti]++;
          if (ok && (pieces[i].pair === true) === fakes[i].pair) tally.strictPair[ti]++;
          if (!ok && Math.abs(T - AI_AUTO_ACCEPT_T) < 1e-9) {
            const w = (tally.wrongAtT[fakes[i].kind] ??= { n: 0, examples: [] });
            w.n++;
            const ex = `${sh.sample}: ${truth} → ${got} («${marks[i].textInside[0] ?? ''}», m ${fakes[i].conf.toFixed(2)}, c ${d.confidence.toFixed(2)})`;
            if (w.examples.length < 4 && !w.examples.includes(ex)) w.examples.push(ex);
          }
        });
      });
    }
  }
  return tally;
}

// ── main ───────────────────────────────────────────────────────────────────────────────────

export async function main(opts: { plans: string; corpus: string }): Promise<number> {
  // §D ────────────────────────────────────────────────────────────────────────────────────
  head('§D · dictionary (owner decision 10, D2)');
  {
    const codes = PIECE_CODES.map((c) => c.code);
    ck(codes.includes('SL') && !codes.includes('SLV'), 'sleeve is SL, SLV is gone');
    for (const c of ['SK', 'HB', 'LAP', 'HD', 'TAB']) ck(isKnownCode(c), `D2 code ${c} is known`);
    ck(
      codes.every((c) => c === c.toUpperCase()),
      'every base code is upper-case',
    );
    ck(new Set(codes).size === codes.length, 'no duplicate base code');
    ck(
      !isKnownCode('fp') && !isKnownCode('SLV') && !isKnownCode('XYZ'),
      'isKnownCode is exact (fp, SLV, XYZ unknown)',
    );
    ck(
      JSON.stringify(pieceBaseCodes.map((p) => p.code)) === JSON.stringify(codes),
      'piece-codes.ts base codes = dictionary codes (one list)',
    );
    ck(
      pieceModifiers.some((m) => m.mod === '_F / _B') &&
        !pieceModifiers.some((m) => /_f|_b/.test(m.mod)),
      'piece-codes.ts modifiers are upper-case _F / _B',
    );
    const isSize = sizeTokenTest(['S', 'M', 'L']);
    ck(
      identityProblem('SLV_L', {
        isSizeToken: isSize,
        pair: { hand: 'L', of: 'SLV_R' },
        isKnownCode,
      }) === 'SLV is not in the dictionary',
      'identityProblem + isKnownCode refuses SLV (AI-origin rule)',
    );
    ck(
      identityProblem('SLV_L', { isSizeToken: isSize, pair: { hand: 'L', of: 'SLV_R' } }) === null,
      'without isKnownCode (operator-typed) SLV_L stays structurally fine',
    );
    ck(
      identitiesOf('LIN_FP', ['2'], 'L').every(
        (w) =>
          identityProblem(w.identity, {
            isSizeToken: isSize,
            pair: { hand: w.pairHand, of: w.pairOf },
            isKnownCode,
          }) === null,
      ),
      'compound LIN_FP pair passes with the dictionary (both code words known)',
    );
    ck(
      identityProblem('SK_B', { isSizeToken: isSize, isKnownCode }) === null &&
        identityProblem('HB_F', { isSizeToken: isSize, isKnownCode }) === null,
      'reef gaps now spell: SK_B, HB_F pass G11 with the dictionary',
    );
  }

  // §Q ────────────────────────────────────────────────────────────────────────────────────
  head('§Q · quantity, fold and language readers');
  {
    const qty: [string, number | null][] = [
      ['cut 2', 2],
      ['Cut 1 on fold', 1],
      ['CUT 2 ON FOLD', 2],
      ['cut x1 pair', 2],
      ['2 дет.', 2],
      ['КАРМАН 2 ДЕТ.', 2],
      ['1 пара', 2],
      ['2 x VORD. HOSENTEIL', 2],
      ['VORD. BUNDSTREIFEN 2 x IM BRUCH ZUSCHNEIDEN', 2],
      ['2x Taschenbeutel Futter', 2],
      ['DELANTERO X2', 2],
      ['Обтачка под застежки 8 шт', 8],
      ['kroić 2 razy', 2],
      ['QUANTITY: 1', 1],
      // A0.4 (the 10.10 beta smoke: «CUT & 2» on inkscape-pieces-mm.svg was not read)
      ['CUT & 2', 2],
      ['Cut: 2', 2],
      ['CUT 2', 2],
      ['×2', 2],
      ['x2', 2],
      ['2 ДЕТ.', 2],
      ['2 дет', 2],
      ['CUT & SEW', null],
      // Codex П0: a count per fabric is not the piece's count — ask
      ['Cut: 2 fabric, 1 lining', null],
      ['cut 1 interfacing', null],
      ['PIECE NAME: 3', null],
      ['# 202', null],
      ['10 x 10 cm', null],
      ['Size 42', null],
      ['Piece 3', null],
      ['2 cm seam allowance', null],
      ['TEST 10X10CM', null],
      ['2XL', null],
    ];
    for (const [s, want] of qty) {
      const got = parseQuantity(s);
      ck(got === want, `qty «${s}» → ${want}`, got === want ? '' : `got ${got}`);
    }
    for (const [s, want] of [
      ['Cut 1 on fold', true],
      ['IM BRUCH ZUSCHNEIDEN', true],
      ['ЗАДНЯЯ СЕРЕДИНА СГИБ', true],
      ['Vord. M. Stoffbr.', true],
      ['Front Top', false],
    ] as const)
      ck(saysFold(s) === want, `fold «${s}» → ${want}`);
    ck(languageOf(['Полочка', 'Спинка']) === 'ru', 'language ru');
    ck(languageOf(['Vorderteil', 'Rückenteil im Bruch']) === 'de', 'language de');
    ck(languageOf(['Front Top', 'Back Pants']) === 'en', 'language en');
    ck(languageOf(['42', '44']) === '', 'no letters → no language');
  }

  // §S ────────────────────────────────────────────────────────────────────────────────────
  head('§S · synonyms on every printed truth name');
  const sheets = truthSheets(opts.corpus);
  {
    let n = 0;
    let hit = 0;
    const misses: string[] = [];
    const seen = new Set<string>();
    for (const sh of sheets)
      for (const p of sh.pieces) {
        if (!printed(p) || p.suggested_code === '?' || seen.has(p.name_orig)) continue;
        seen.add(p.name_orig);
        n++;
        const t = splitCode(p.suggested_code);
        const r = readPieceText(p.name_orig);
        const side = t.mods.find((m) => m === 'F' || m === 'B');
        const ok =
          !!r.code && t.code.split('_').includes(r.code) && !(r.side && side && r.side !== side);
        if (ok) hit++;
        else
          misses.push(
            `${sh.sample}: «${p.name_orig}» → ${r.code ?? '∅'}${r.side ? `+${r.side}` : ''}, truth ${p.suggested_code}`,
          );
      }
    const rate = hit / n;
    ck(
      rate >= 0.9,
      `printed names whose reading agrees with truth: ${hit}/${n} (${(rate * 100).toFixed(1)} %) ≥ 90 %`,
    );
    for (const m of misses) console.log(`        miss  ${m}`);
  }

  // §E ────────────────────────────────────────────────────────────────────────────────────
  head('§E · evidence builder on a synthetic sheet');
  const syn = syntheticSheet();
  const sources = markSources(syn.fams, syn.seeds);
  const built = buildMarks(syn.sheet, sources);
  {
    const m = built.marks;
    ck(
      m.length === 5 && m.map((x) => x.mark).join() === '1,2,3,4,5',
      'five marks, numbered 1..5 in family order',
    );
    ck(
      sources.every((s) => s.candidate.rank === 1),
      'outline = the largest rank of each family',
    );
    ck(
      m[0].textInside.join('|') === 'Vorderteil|2 x zuschneiden',
      'front: its texts inside, deduplicated, grade-point label «# -1» dropped',
      m[0].textInside.join('|'),
    );
    ck(
      !m[0].textInside.includes('Tasche') && m[4].textInside.join() === 'Tasche',
      'nested pocket owns its label, not the front',
    );
    ck(
      m[0].cutQtyHint === 2 && m[0].quantityText === '2 x zuschneiden',
      'front: quantity 2 from «2 x zuschneiden»',
    );
    ck(
      m[2].textNear.includes('Cut 1 on fold') && m[2].cutQtyHint === 1,
      'back: «Cut 1 on fold» read as NEAR text, qty 1',
    );
    ck(m[2].foldHint, 'back: fold hint (fold feature + text)');
    ck(m[2].symmetricHint && m[3].symmetricHint, 'back and collar read as mirror-symmetric');
    ck(!m[0].symmetricHint && !m[1].symmetricHint, 'the asymmetric fronts are not symmetric');
    ck(
      m[0].mirrorTwinMark === 2 && m[1].mirrorTwinMark === 1,
      'front and its mirror are twins (1 ↔ 2)',
    );
    ck(
      m[2].mirrorTwinMark === null && m[3].mirrorTwinMark === null,
      'symmetric pieces get no twin',
    );
    ck(!isMirrorTwin(FRONT, tr(FRONT, 500, 0)), 'a plain copy is not a mirror twin');
    ck(isMirrorSymmetric(BACK) && !isMirrorSymmetric(FRONT), 'symmetry test, direct');
    const ex = built.context.instructionsExcerpt;
    ck(
      ex.split('\n').filter((l) => l.startsWith('Teile')).length === 1 && ex.includes('10 x 10 cm'),
      'instructions excerpt: loose text, deduplicated',
      JSON.stringify(ex),
    );
    ck(built.context.languageHint === 'de', `language hint de (got ${built.context.languageHint})`);
    ck(
      m[0].bboxMm[2] - m[0].bboxMm[0] === 300 && Math.abs(m[0].areaMm2 - area(FRONT)) < 1e-6,
      'bbox and area of the outer outline',
    );
  }

  // §R ────────────────────────────────────────────────────────────────────────────────────
  head('§R · Set-of-Mark render (recording canvas)');
  {
    const plan = planSom(sources, 150);
    const long = Math.max(plan.overview.widthPx, plan.overview.heightPx);
    ck(
      long <= SOM_DEFAULTS.overviewMaxPx,
      `overview long side ${long} px ≤ ${SOM_DEFAULTS.overviewMaxPx}`,
    );
    ck(
      plan.markAt.every((p, i) => insidePoly(p, sources[i].outline)),
      'every mark disc sits inside its own piece',
    );
    const k = plan.overview.pxPerMm;
    ck(
      plan.markAt.every((p, i) =>
        plan.markAt.every(
          (q, j) =>
            j <= i ||
            Math.hypot(p.x - q.x, p.y - q.y) * k >= plan.markRadiusPx[i] + plan.markRadiusPx[j],
        ),
      ),
      'no two discs overlap (a hidden number is a piece the model never sees)',
    );
    {
      // A lining square drawn exactly over its shell square: one label point, two discs.
      const sq = tr(POCKET, 0, 0);
      const stacked = markSources(
        [family(1, sq), family(2, sq)],
        [
          { id: 1, at: { x: 0, y: 0 }, origin: 'click', variant: null },
          { id: 2, at: { x: 0, y: 0 }, origin: 'click', variant: null },
        ],
      );
      const sp = planSom(stacked, 150);
      const d =
        Math.hypot(sp.markAt[0].x - sp.markAt[1].x, sp.markAt[0].y - sp.markAt[1].y) *
        sp.overview.pxPerMm;
      ck(
        d >= sp.markRadiusPx[0] + sp.markRadiusPx[1] && sp.markAt.every((p) => insidePoly(p, sq)),
        'stacked pieces: the second disc moves aside, both inside, no overlap',
        `d ${d.toFixed(1)} px, r ${sp.markRadiusPx.map((r) => r.toFixed(1)).join('/')}`,
      );
    }
    ck(
      plan.crops.length >= 1 && plan.crops.length <= 12,
      `crops: ${plan.crops.map((c) => c.mark).join(',')} (1..12)`,
    );
    ck(
      plan.crops.some((c) => c.mark === 4) && !plan.crops.some((c) => c.mark === 3),
      'the small collar gets a close-up, the big back does not',
    );
    ck(
      plan.crops.every((c) => Math.max(c.view.widthPx, c.view.heightPx) <= SOM_DEFAULTS.cropMaxPx),
      'crops ≤ 768 px',
    );
    const low = planSom(sources, 20);
    ck(
      Math.max(low.overview.widthPx, low.overview.heightPx) < long,
      'dpi below the cap is honoured',
    );

    // Small blobs: PNG passes.
    const a = recordingCanvas(() => 200_000);
    const out = await renderSom(syn.sheet, syn.fams, syn.seeds, 150, { canvas: a.factory });
    ck(
      out.sheetPng.type === 'image/png' && out.sheetPng.size === 200_000,
      'overview encoded as PNG when it fits',
    );
    ck(
      out.crops.length === plan.crops.length && out.crops.every((c) => c.png.size > 0),
      'one picture per planned crop',
    );
    const ov = a.made[0];
    const nums = ov.texts.filter((t) => /^\d+$/.test(t.s)).map((t) => t.s);
    ck(nums.join() === '1,2,3,4,5', `overview draws the numbers 1..5 (got ${nums.join()})`);
    ck(
      ov.calls.some((c) => c.op === 'arc') && ov.calls.filter((c) => c.op === 'arc').length === 5,
      'five mark discs',
    );
    ck(
      ov.calls.some((c) => c.op === 'fill'),
      'tints / filled curves are filled',
    );
    ck(
      ov.texts.some((t) => t.s === 'Vorderteil'),
      'sheet text is drawn on the overview',
    );
    const crop = a.made[1];
    ck(crop.texts.filter((t) => /^\d+$/.test(t.s)).length === 1, 'a crop draws only its own mark');
    ck(
      out.marks.length === 5 && !!out.context?.languageHint,
      'stage output carries marks + context',
    );

    // Over the cap: PNG too big → JPEG 0.85 too big → JPEG 0.7 fits.
    const b = recordingCanvas((type, q) =>
      type === 'image/png' ? 3_000_000 : q && q > 0.8 ? 1_800_000 : 900_000,
    );
    const out2 = await renderSom(syn.sheet, syn.fams, syn.seeds, 150, { canvas: b.factory });
    ck(
      out2.sheetPng.type === 'image/jpeg' && out2.sheetPng.size === 900_000,
      'byte cap: falls back to JPEG 0.7',
    );
    // Nothing fits at full size → redraw smaller.
    const c = recordingCanvas((_t, _q, w, h) => (w * h > 500_000 ? 5_000_000 : 400_000));
    const out3 = await renderSom(syn.sheet, syn.fams, syn.seeds, 150, { canvas: c.factory });
    ck(out3.sheetPng.size === 400_000 && c.made.length > 2, 'byte cap: redraws at a smaller scale');
  }

  // §W ────────────────────────────────────────────────────────────────────────────────────
  head('§W · wire mapping (ai/wire.ts is the only file naming proto fields)');
  {
    const long = 'Ж'.repeat(200);
    const marks: SomMark[] = Array.from({ length: 90 }, (_, i) => ({
      ...built.marks[0],
      mark: i + 1,
      seed: i + 1,
      textInside: Array.from({ length: 15 }, () => long),
      quantityText: long,
    }));
    const input = buildSuggestInput(
      { marks, context: { instructionsExcerpt: 'x'.repeat(5000), languageHint: 'de' } },
      {
        techCardId: 7,
        sizeTokens: ['S', 'M'],
        bomPurposes: [
          'TECH_CARD_BOM_PURPOSE_MAIN',
          'TECH_CARD_BOM_PURPOSE_LINING',
          'TECH_CARD_BOM_PURPOSE_MAIN',
        ],
        existingPieceNames: ['FP', ' FP ', 'Back'],
      },
      {
        overview: 11,
        crops: [
          ...Array.from({ length: 14 }, (_, i) => ({ mark: i + 1, mediaId: 100 + i })),
          { mark: 95, mediaId: 5 },
        ],
      },
    );
    const w = toWireRequest(input);
    ck(w.pieces!.length === WIRE_LIMITS.pieces, `pieces clamped to ${WIRE_LIMITS.pieces}`);
    ck(
      w.crops!.length === 12 && w.crops!.every((c) => (c.mark ?? 0) <= 80),
      'crops ≤ 12 and only of marks that are sent',
    );
    ck(
      w.pieces![0].textInside!.length === 12 &&
        Array.from(w.pieces![0].textInside![0]).length === 120,
      'text_inside ≤ 12 × 120 runes (code points, not UTF-16)',
    );
    ck(Array.from(w.pieces![0].quantityText!).length === 120, 'quantity_text ≤ 120 runes');
    ck(
      Array.from(w.context!.instructionsTextExcerpt!).length === 4000,
      'instructions ≤ 4000 runes',
    );
    ck(
      JSON.stringify(w.context!.fabricPurposesInBom) === '["main","lining"]',
      'BOM purposes as F9 words, deduplicated',
    );
    ck(
      JSON.stringify(w.context!.existingCardPieceNames) === '["FP","Back"]',
      'card piece names trimmed + deduplicated',
    );
    ck(
      w.allowedCodes!.some((c) => c.code === 'SK') &&
        !w.allowedCodes!.some((c) => c.code === 'SLV'),
      'allowed codes = the dictionary (D2 in, SLV out)',
    );
    ck(
      JSON.stringify(w.allowedModifiers) === '["L","R","F","B","#"]',
      'allowed modifiers L R F B #',
    );
    ck(
      w.pieces![0].areaCm2 === Math.round(built.marks[0].areaMm2) / 100 &&
        w.pieces![0].bboxWMm === 300,
      'area in cm², bbox in mm',
    );
    ck(
      w.techCardId === 7 && w.overviewMediaId === 11 && w.force === false,
      'card, overview, force',
    );

    const res: SuggestPatternPiecesResponse = {
      suggestions: [
        {
          mark: 2,
          code: 'LIN_FP_L_2',
          humanNameEn: 'front lining',
          fabricPurposes: ['lining', 'bogus'],
          cutQuantity: 0,
          fold: false,
          pair: false,
          variant: '',
          confidence: 0.7,
          evidence: ['Futter'],
        },
        {
          mark: 1,
          code: '',
          humanNameEn: 'front',
          fabricPurposes: [],
          cutQuantity: 2,
          fold: undefined,
          pair: true,
          variant: 'A',
          confidence: 1.4,
          evidence: [],
        },
      ],
      model: 'm',
      promptTokens: 10,
      completionTokens: 5,
      costUsd: '',
      warnings: ['w'],
      cached: true,
    };
    const o = fromWireResponse(res);
    ck(o.suggestions.map((s) => s.mark).join() === '1,2', 'suggestions in mark order');
    ck(
      o.suggestions[1].code === 'LIN_FP' && o.suggestions[1].mods.join() === 'L,2',
      'LIN_FP_L_2 → code LIN_FP, mods L,2',
    );
    ck(
      JSON.stringify(o.suggestions[1].fabrics) === '["TECH_CARD_BOM_PURPOSE_LINING"]',
      'purpose words back to the BOM enum, unknown dropped',
    );
    ck(
      o.suggestions[1].cutQty === null && o.suggestions[1].variant === null,
      'cut_quantity 0 → null, variant "" → null',
    );
    ck(
      o.suggestions[0].code === '' &&
        o.suggestions[0].modelConfidence === 1 &&
        o.suggestions[0].variant === 'A',
      'refused code stays "", confidence clamped',
    );
    ck(o.cached && o.costUsd === '' && o.warnings.length === 1, 'cached / cost / warnings carried');
    ck(JSON.stringify(splitCode('fp_l')) === '{"code":"FP","mods":["L"]}', 'splitCode upper-cases');
  }

  // §C ────────────────────────────────────────────────────────────────────────────────────
  head('§C · confidence combiner');
  {
    const base = (over: Partial<SomMark>): SomMark => ({
      mark: 1,
      seed: 1,
      bboxMm: [0, 0, 300, 500],
      areaMm2: 1e5,
      textInside: [],
      textNear: [],
      quantityText: '',
      cutQtyHint: null,
      foldHint: false,
      symmetricHint: false,
      sizeCount: 5,
      mirrorTwinMark: null,
      variant: null,
      ...over,
    });
    const sug = (over: Partial<PieceSuggestion>): PieceSuggestion => ({
      mark: 1,
      code: 'FP',
      mods: [],
      displayName: 'front piece',
      fabrics: ['TECH_CARD_BOM_PURPOSE_MAIN'],
      cutQty: 2,
      onFold: false,
      pair: true,
      variant: null,
      modelConfidence: 0.8,
      evidence: [],
      ...over,
    });
    const ctx = {
      existingPieceNames: [] as string[],
      threshold: AI_AUTO_ACCEPT_T,
      sizeTokens: ['S', 'M', 'L'],
      bomPurposes: BOM,
      isKnownCode,
    };
    const one = (s: PieceSuggestion, m: SomMark, c = ctx) => combineNames([s], [m], c)[0];

    const a = one(
      sug({}),
      base({ textInside: ['Vorderteil'], quantityText: '2 x', cutQtyHint: 2 }),
    );
    ck(
      Math.abs(a.confidence - (0.5 * 0.8 + 0.5 * 1)) < 1e-9 && a.autoAccepted && a.source === 'ai',
      `text + qty + chirality + layout + grammar + unique → E = 1, conf ${a.confidence.toFixed(3)}, auto`,
    );
    const b = one(sug({}), base({}));
    ck(
      !b.autoAccepted && b.confidence <= 0.5 * 0.8 + 0.5 * 0.6 + 1e-9,
      `no text: E ≤ 0.6 → conf ${b.confidence.toFixed(3)}, not auto`,
    );
    const c = one(sug({ modelConfidence: 0.99 }), base({ textInside: ['Ärmel'] }));
    ck(
      c.evidence.some((e) => e.kind === 'text-conflict') && !c.autoAccepted,
      'text says SL, model says FP → conflict, never auto',
    );
    const d = one(sug({}), base({ textInside: ['Vorderteil'] }), {
      ...ctx,
      existingPieceNames: ['FP'],
    });
    ck(
      d.evidence.some((e) => e.kind === 'collides-existing' && e.weight === 0) && d.autoAccepted,
      'collides with a card piece BUT text backs it → no penalty',
    );
    const e = one(sug({ modelConfidence: 1 }), base({}), {
      ...ctx,
      existingPieceNames: ['front piece'],
    });
    ck(
      e.evidence.some((x) => x.kind === 'collides-existing' && x.weight === -0.5) &&
        !e.autoAccepted,
      'collides by name alone → −0.5, never auto (C10)',
    );
    const f = one(sug({ code: 'SLV', modelConfidence: 1 }), base({ textInside: ['sleeve'] }));
    ck(
      !f.evidence.some((x) => x.kind === 'grammar-ok') && !f.autoAccepted,
      'SLV: not in the dictionary → no grammar-ok, never auto',
    );
    const g = one(
      sug({ code: 'FP', mods: ['M'], pair: false, modelConfidence: 1 }),
      base({ textInside: ['Vorderteil'] }),
    );
    ck(!g.autoAccepted, 'FP_M on a run with M (a size tail) → never auto');
    const two = combineNames(
      [sug({ mark: 1, modelConfidence: 1 }), sug({ mark: 2, modelConfidence: 1 })],
      [
        base({ mark: 1, seed: 1, textInside: ['Vorderteil'] }),
        base({ mark: 2, seed: 2, textInside: ['Vorderteil'] }),
      ],
      ctx,
    );
    ck(
      two.every((x) => !x.autoAccepted && !x.evidence.some((y) => y.kind === 'unique')),
      'two marks with one identity → neither unique, neither auto',
    );
    const sib = combineNames(
      [
        sug({ mark: 1, mods: ['1'], modelConfidence: 0.8 }),
        sug({ mark: 2, mods: ['2'], modelConfidence: 0.8 }),
      ],
      [
        base({ mark: 1, seed: 1, textInside: ['Front Top'] }),
        base({ mark: 2, seed: 2, textInside: ['Front Pants'] }),
      ],
      ctx,
    );
    ck(
      sib.every((x) => x.autoAccepted),
      'siblings FP_1 / FP_2 numbered 1..2, text backs the base → auto',
    );
    const lone = one(
      sug({ code: 'CLR', mods: ['2'], pair: false, modelConfidence: 1 }),
      base({ textInside: ['Kragen'] }),
    );
    ck(
      lone.evidence.some((x) => x.kind === 'unconfirmed' && x.part === 'number') &&
        !lone.autoAccepted,
      'lone CLR_2 → numbering unconfirmed, never auto',
    );
    const gap = combineNames(
      [sug({ mark: 1, mods: ['1'] }), sug({ mark: 2, mods: ['3'] })],
      [
        base({ mark: 1, seed: 1, textInside: ['Front Top'] }),
        base({ mark: 2, seed: 2, textInside: ['Front Pants'] }),
      ],
      ctx,
    );
    ck(
      gap.every((x) => !x.autoAccepted),
      'FP_1 + FP_3 (a gap) → neither auto',
    );
    const side = one(
      sug({ code: 'FAC', mods: ['F'], pair: true, modelConfidence: 1 }),
      base({ textInside: ['Подборт'] }),
    );
    ck(
      side.evidence.some((x) => x.kind === 'unconfirmed' && x.part === 'side') &&
        !side.autoAccepted,
      'FAC_F on «Подборт» (no side printed) → side unconfirmed',
    );
    const side2 = one(
      sug({ code: 'FAC', mods: ['F'], pair: true, modelConfidence: 1 }),
      base({ textInside: ['Vorderer Besatz'] }),
    );
    ck(side2.autoAccepted, 'FAC_F on «Vorderer Besatz» → side stated, auto');
    const flip = one(
      sug({ code: 'FAC', mods: ['B'], pair: true, modelConfidence: 1 }),
      base({ textInside: ['Vorderer Besatz'] }),
    );
    ck(
      flip.evidence.some((x) => x.kind === 'text-conflict') && !flip.autoAccepted,
      'FAC_B on «Vorderer Besatz» → conflict',
    );
    const lonely = one(
      sug({ code: 'SL', mods: ['L'], pair: false, modelConfidence: 1 }),
      base({ textInside: ['Ärmel'] }),
    );
    ck(
      lonely.evidence.some((x) => x.kind === 'unconfirmed' && x.part === 'hand') &&
        !lonely.autoAccepted,
      'SL_L without a mirrored twin → hand unconfirmed',
    );
    const near = one(sug({}), base({ textNear: ['Vorderteil'] }));
    ck(
      near.evidence.find((x) => x.kind === 'text-synonym')?.weight === 0.3,
      'near text weighs 0.3',
    );
    const hand = combineNames(
      [sug({ mark: 1, mods: ['L'], pair: false }), sug({ mark: 2, mods: ['R'], pair: false })],
      [
        base({ mark: 1, seed: 1, mirrorTwinMark: 2 }),
        base({ mark: 2, seed: 2, mirrorTwinMark: 1 }),
      ],
      ctx,
    );
    ck(
      hand.every((x) => x.evidence.some((y) => y.kind === 'chirality' && y.hand)),
      'FP_L / FP_R on mirrored twins → chirality evidence',
    );
    const none = combineNames([], [base({})], ctx)[0];
    ck(
      none.suggestion === null && none.code === '' && !none.autoAccepted,
      'a mark the server did not name → empty, not auto',
    );
  }

  // §N ────────────────────────────────────────────────────────────────────────────────────
  head('§N · call path with fake upload + fake RPC (no network)');
  {
    const a = recordingCanvas(() => 1000);
    const som: StageIO['render-som']['out'] = await renderSom(syn.sheet, syn.fams, syn.seeds, 150, {
      canvas: a.factory,
    });
    const uploads: string[] = [];
    let sent: SuggestPatternPiecesRequest | null = null;
    let id = 500;
    const res = await suggestNames(
      som,
      { techCardId: 42, sizeTokens: ['S', 'M', 'L'], bomPurposes: BOM, existingPieceNames: [] },
      { threshold: AI_AUTO_ACCEPT_T },
      {
        async upload(_b, what) {
          uploads.push(what);
          if (what.endsWith(` ${som.crops[0]?.mark}`) && som.crops.length > 1)
            throw new Error('boom');
          return ++id;
        },
        async suggest(req) {
          sent = req;
          return {
            suggestions: [
              {
                mark: 1,
                code: 'FP_L',
                humanNameEn: 'front',
                fabricPurposes: ['main'],
                cutQuantity: 1,
                fold: false,
                pair: false,
                variant: '',
                confidence: 0.9,
                evidence: ['Vorderteil'],
              },
              {
                mark: 2,
                code: 'FP_R',
                humanNameEn: 'front',
                fabricPurposes: ['main'],
                cutQuantity: 1,
                fold: false,
                pair: false,
                variant: '',
                confidence: 0.9,
                evidence: [],
              },
              {
                mark: 3,
                code: 'BP',
                humanNameEn: 'back',
                fabricPurposes: ['main'],
                cutQuantity: 1,
                fold: true,
                pair: false,
                variant: '',
                confidence: 0.92,
                evidence: ['Rückenteil'],
              },
              {
                mark: 4,
                code: 'CLR',
                humanNameEn: 'collar',
                fabricPurposes: ['main'],
                cutQuantity: 2,
                fold: false,
                pair: false,
                variant: '',
                confidence: 0.6,
                evidence: [],
              },
            ],
            model: 'fake',
            promptTokens: 1,
            completionTokens: 1,
            costUsd: '0.01',
            warnings: ['mark 5 was not named'],
            cached: false,
          };
        },
      },
    );
    ck(
      uploads[0] === 'pattern overview' && uploads.length === 1 + som.crops.length,
      `uploads: overview + ${som.crops.length} crops`,
    );
    const req = sent as SuggestPatternPiecesRequest | null;
    ck(
      !!req && req.overviewMediaId === 501 && req.techCardId === 42,
      'request carries the overview media id and card',
    );
    ck(
      !!req && req.crops!.length === som.crops.length - (som.crops.length > 1 ? 1 : 0),
      'a failed crop upload is dropped, the call goes on',
    );
    ck(
      res.decisions.length === 5 && res.decisions.map((d) => d.seed).join() === '1,2,3,4,5',
      'one decision per seed, in mark order',
    );
    const [d1, d2, d3, d4, d5] = res.decisions;
    ck(
      d1.autoAccepted && d1.code === 'FP' && d1.mods.join() === 'L',
      'FP_L: text + twin chirality + qty → auto',
    );
    ck(d2.autoAccepted === false || d2.confidence < d1.confidence, 'FP_R (no text) is below FP_L');
    ck(d3.autoAccepted, 'BP: text + near «Cut 1 on fold» + fold → auto');
    ck(!d4.autoAccepted, 'CLR at model 0.6 → asks the operator');
    ck(d5.suggestion === null && !d5.autoAccepted, 'unnamed mark → empty row');
    ck(
      res.output?.warnings.length === 1 && res.output.costUsd === '0.01',
      'warnings and cost come back',
    );
  }

  // §K ────────────────────────────────────────────────────────────────────────────────────
  head(
    `§K · calibration on K0 truth (fake answers, ${RUNS} runs × ${ERR_RATES.length} error rates × ${SCENARIOS.length} scenarios)`,
  );
  const report: Record<string, unknown>[] = [];
  let calibrated = 0.5;
  {
    const tallies = SCENARIOS.flatMap((sc) =>
      ERR_RATES.map((er) => ({ sc, er, t: runCalibration(sheets, sc, er) })),
    );
    const prec = (t: Tally, i: number) => (t.auto[i] ? t.correct[i] / t.auto[i] : 1);
    // Smallest T at which EVERY scenario × error rate is at or above the precision target.
    const ti = TS.findIndex((_, i) => tallies.every((x) => prec(x.t, i) >= AI_PRECISION_TARGET));
    calibrated = ti >= 0 ? TS[ti] : 1;
    const at = (T: number) => TS.findIndex((x) => Math.abs(x - T) < 1e-9);
    const iT = at(AI_AUTO_ACCEPT_T);
    console.log(
      `\n  ${'scenario'.padEnd(52)} err   pieces | T*=${calibrated.toFixed(2)} prec  recall | T=${AI_AUTO_ACCEPT_T.toFixed(2)} prec  recall  auto`,
    );
    for (const x of tallies) {
      const i = ti >= 0 ? ti : TS.length - 1;
      const row = {
        scenario: x.sc.name,
        errRate: x.er,
        pieces: x.t.pieces,
        tStar: calibrated,
        precisionAtTStar: prec(x.t, i),
        recallAtTStar: x.t.correct[i] / x.t.pieces,
        T: AI_AUTO_ACCEPT_T,
        precisionAtT: prec(x.t, iT),
        recallAtT: x.t.correct[iT] / x.t.pieces,
        autoAtT: x.t.auto[iT],
        pairAlsoRightAtT: x.t.auto[iT] ? x.t.strictPair[iT] / x.t.auto[iT] : 1,
        wrongAtT: x.t.wrongAtT,
        curve: TS.map((T, k) => ({
          T,
          precision: prec(x.t, k),
          recall: x.t.correct[k] / x.t.pieces,
        })),
      };
      report.push(row);
      console.log(
        `  ${x.sc.name.padEnd(52)} ${x.er.toFixed(2)} ${String(x.t.pieces).padStart(7)} |        ${row.precisionAtTStar.toFixed(3)}  ${row.recallAtTStar.toFixed(3)} |        ${row.precisionAtT.toFixed(3)}  ${row.recallAtT.toFixed(3)} ${String(row.autoAtT).padStart(5)}`,
      );
      if (process.env.PATIMPORT_AI_WRONG)
        for (const [k, v] of Object.entries(x.t.wrongAtT))
          console.log(`      wrong ${k} ×${v.n}: ${v.examples.join(' | ')}`);
    }
    ck(
      ti >= 0,
      `a threshold reaching precision ≥ ${AI_PRECISION_TARGET} exists in every scenario: T* = ${calibrated.toFixed(2)}`,
    );
    ck(
      AI_AUTO_ACCEPT_CALIBRATED === calibrated,
      `ai/threshold.ts records the calibrated T* (${AI_AUTO_ACCEPT_CALIBRATED} vs probe ${calibrated.toFixed(2)})`,
    );
    ck(
      AI_AUTO_ACCEPT_T >= AI_AUTO_ACCEPT_FLOOR,
      `T in use = ${AI_AUTO_ACCEPT_T} (floor ${AI_AUTO_ACCEPT_FLOOR})`,
    );
    ck(
      tallies.every((x) => prec(x.t, iT) >= AI_PRECISION_TARGET),
      `precision on auto-accepted rows ≥ ${AI_PRECISION_TARGET} at the T in use, in every scenario`,
    );
    const none = tallies.filter((x) => x.sc.text === 'none');
    ck(
      none.every((x) => x.t.auto[iT] === 0),
      'no text → nothing is auto-accepted at the T in use (the model alone never is)',
    );
  }

  // ── C7 · the AI's fabric call rides on the name's bar (negative controls) ──────────────
  {
    head('C7 · AI fabric hints');
    const LINING = 'TECH_CARD_BOM_PURPOSE_LINING';
    const dec = (seed: number, p: Partial<NameDecision>): NameDecision => ({
      seed,
      suggestion: {
        mark: seed,
        code: 'BP',
        mods: [],
        displayName: 'back',
        fabrics: [LINING],
        cutQty: 2,
        onFold: false,
        pair: false,
        variant: null,
        modelConfidence: 0.95,
        evidence: [],
      },
      source: 'ai',
      evidence: [],
      confidence: 0.92,
      autoAccepted: true,
      code: 'BP',
      mods: [],
      displayName: 'back',
      ...p,
    });
    const names = [
      dec(1, {}),
      dec(2, { confidence: 0.6, autoAccepted: false }),
      dec(3, {}),
      dec(4, { confidence: 0.9, autoAccepted: false }),
      dec(5, { source: 'text' }),
    ];
    const hints = aiFabricHintsOf(names, [3]);
    ck(
      hints.length === 1 && hints[0].seed === 1,
      'only an auto-accepted AI name at ≥ T carries its fabric (low 0.60, edited name, ≥ T but gates failed, sheet text → none)',
      JSON.stringify(hints.map((h) => h.seed)),
    );
    ck(
      !hints.some((h) => h.seed === 2),
      `AI lining at 0.60 (< T ${AI_AUTO_ACCEPT_T}) is not a fabric hint`,
    );
    ck(!hints.some((h) => h.seed === 3), 'an edited name drops its AI fabric');
    ck(
      aiFabricHintsOf([dec(1, { confidence: AI_AUTO_ACCEPT_T - 0.01 })], []).length === 0,
      'just below T: no hint even when flagged auto-accepted',
    );
  }

  // ── report ─────────────────────────────────────────────────────────────────────────────
  const failed = rows.filter((r) => !r.ok);
  const outDir = path.join(opts.plans, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  fs.writeFileSync(
    path.join(outDir, `F10-${stamp}.json`),
    JSON.stringify(
      {
        probe: 'patimport:ai',
        date: new Date().toISOString(),
        passed: rows.length - failed.length,
        total: rows.length,
        rows,
        calibration: {
          note: 'FAKE model answers derived from corpus/truth.json with injected errors; no network.',
          runs: RUNS,
          errRates: ERR_RATES,
          tStar: calibrated,
          tInUse: AI_AUTO_ACCEPT_T,
          precisionTarget: AI_PRECISION_TARGET,
          rows: report,
        },
      },
      null,
      1,
    ),
  );
  console.log(`\n${rows.length - failed.length}/${rows.length} checks pass`);
  if (failed.length)
    for (const f of failed) console.log(`  FAIL [${f.section}] ${f.what} ${f.detail}`);
  return failed.length;
}
