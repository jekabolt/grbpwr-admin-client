// Cut line vs seam line: is the drawn outline the CUTTING line (allowance included) or the SEWING
// line (allowance to be added)? Two kinds of evidence, in this order:
//
//   1. geometry — a second loop parallel to the outline at a constant 3–30 mm inside it (DXF layer
//      14 seam feature; on a PDF a seam-classed chain or a same-size chain): BOTH are drawn, the
//      allowance is MEASURED (Redcafe, blazer, every CLO export);
//   2. text — the sheet says so, in the languages the corpus speaks: "seam allowance(s) included" /
//      "1/2" seam allowances (SA's) included" (reef), "All Patterns are without seam allowances"
//      (viola), "1 cm seam allowance included" (leonie), "Nahtzugabe(n) … enthalten / ohne",
//      "припуск(и) включен(ы) / без припусков / На швы … 1,5 см" (palto), "sans/avec marges de
//      couture (comprises)", "klippes med 1 cm sømrum" (robe), "z zapasami / bez zapasów",
//      "naadtoeslag inbegrepen / zonder", "margen de costura incluido / sin".
//
// Owner decision 7: a seam-only source gets a cut line at 10 mm per file, corrected per piece. When
// the text says "without" but names no amount (viola), the amount is the 10 mm default and the
// evidence says so. Nothing found at all → origin 'default' (the wizard asks).

import type {
  AllowanceDecision,
  ChainSet,
  DetectAllowanceFn,
  Feature,
  PieceCandidate,
  PieceFamily,
  PtMm,
  Sheet,
} from '../types';
import { PATIMPORT } from '../types';
import { readPieceText } from '../dictionary/synonyms';
import { SegIndex, perimeter, pointInPolygon, sampleAlong } from './geom';

// ── text ───────────────────────────────────────────────────────────────────────────────────

/** Words that name the SEAM ALLOWANCE (not the hem). Lower-case, matched on normalised text. */
const SA_WORDS = [
  'seam allowance',
  'seam allowances',
  "sa's",
  'nahtzugabe',
  'nahtzugaben',
  'naht- und saumzugabe',
  'naht und saumzugabe',
  'zugabe',
  'zugaben',
  'припуск',
  'припуски',
  'припусков',
  'припуском',
  'припусками',
  'на швы',
  'marge de couture',
  'marges de couture',
  'valeur de couture',
  'valeurs de couture',
  'surplus de couture',
  'naadtoeslag',
  'naadtoeslagen',
  'zapas na szw',
  'zapasy na szw',
  'zapasami',
  'zapasów',
  'zapasy',
  'sømrum',
  'sommerum',
  'margen de costura',
  'márgenes de costura',
  'margini di cucitura',
  'cucitura',
];
const SA_RE = new RegExp(
  `(?:\\bsa\\b|${SA_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'iu',
);

// JS `\b` is ASCII-only even with the u flag: Cyrillic/Danish/Polish words use NB (no letter before).
const NB = '(?<!\\p{L})';
const re = (src: string) => new RegExp(src, 'iu');

/** "included" side, checked in the sentence of an SA word. */
const INCLUDED = [
  re(`${NB}includ(?:ed|es|ing)`),
  re(`${NB}incl\\.?\\s`),
  re(`${NB}with(?:\\s+\\S+){0,3}\\s+seam allowance`),
  re(`${NB}enthalten`),
  re(`${NB}inkl(?:\\.|usive)?(?!\\p{L})`),
  re(`${NB}mit\\s+(?:\\S+\\s+){0,2}(?:naht|zugabe)`),
  re(`включ[её]н`),
  re(`${NB}с\\s+(?:уч[её]том\\s+)?припуск`),
  re(`${NB}(?:compris|comprises|incluse?s?)(?!\\p{L})`),
  re(`${NB}avec\\s+(?:\\S+\\s+){0,2}(?:marge|valeur|surplus)`),
  re(`${NB}inbegrepen`),
  re(`${NB}inclusief`),
  re(`${NB}z\\s+zapas`),
  re(`wliczon|uwzględnion`),
  re(`${NB}inkluderet`),
  re(`${NB}incluid[oa]s?`),
  re(`${NB}inclus[io](?!\\p{L})`),
];
/** "excluded / add it" side. Checked FIRST: "not included" contains "included". */
const EXCLUDED = [
  re(`${NB}without`),
  re(`${NB}not\\s+(?:been\\s+)?includ`),
  re(`${NB}exclud(?:ed|ing)`),
  re(`${NB}no\\s+seam allowance`),
  re(`${NB}add(?:ed|ing)?(?!\\p{L})`),
  re(`${NB}ohne(?!\\p{L})`),
  re(`${NB}nicht\\s+(?:\\S+\\s+)?enthalten`),
  re(`${NB}zuz(?:ü|u)gl|${NB}zzgl`),
  re(`hinzu(?:zu)?fügen|zugegeben|${NB}zugeben`),
  re(`${NB}без\\s+(?:уч[её]та\\s+)?припуск`),
  re(`${NB}не\\s+включ`),
  re(`${NB}(?:прибав|добав|оставить|оставля|дать\\s+припуск|давать\\s+припуск)`),
  re(`${NB}sans(?!\\p{L})`),
  re(`${NB}non\\s+compris|${NB}ajout`),
  re(`${NB}zonder`),
  re(`toevoeg|toeslag\\s+toe`),
  re(`${NB}bez\\s+zapas`),
  re(`${NB}doda[ćj]`),
  re(`${NB}klippes\\s+med|${NB}uden\\s+sømrum|${NB}tilføj`),
  re(`${NB}sin\\s+(?:\\S+\\s+){0,2}m[aá]rgen|${NB}añad`),
  re(`${NB}senza(?!\\p{L})|${NB}aggiung`),
];
/** A sentence about EASE ("учтены припуски на свободное облегание"), not the seam allowance. */
const EASE = re(`облегани|bewegungsweite|${NB}ease(?!\\p{L})|aisance|wearing ease|прибавк`);
/** Sewing-step sentences ("Nahtzugaben zurückschneiden", "trim the SA to 5 mm"): amounts there are not the allowance. */
const INSTRUCTION = re(
  `zurückschneid|versäuber|bügel|steppen|${NB}trim|cut\\s+back|${NB}press|${NB}sew(?!\\p{L})|${NB}stitch|${NB}attach|срез(?:ать|ают)|подрез|стачать|притач|пристроч|настроч|застроч|обработ|${NB}sy(?!\\p{L})|kantstik`,
);
const HEM_WORD = re(
  `(?:hem|saum|säume|ourlet|подгиб|низ|нижн|zoom|dół|opsøm|forneden|bajo|dobladillo|orlo)\\p{L}*\\s*[:\\-–—]?\\s*$`,
);
const HEM_AFTER = re(`^\\s*(?:hem|saum|ourlet|подгиб|низ|zoom|opsøm|op\\s+forneden)`);
const EXCEPT = re(`(?:кроме|except|außer|ausser|sauf|behalve|oprócz|undtagen|excepto)\\s*$`);
/** A safety/fitting margin ("страховочных 5 мм") is not the allowance. */
const SAFETY = re(`(?:страховоч|safety|sicherheit|fitting)\\p{L}*\\s*$`);

/** Amount in mm from one match: "1 cm", "1,5 см", "10 mm", '1/2"', "5/8 inch", "½″". */
const AMOUNT =
  /(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?|½|¼|¾|⅝|⅜)\s*(cm|см|mm|мм|"|''|in(?:ch(?:es)?)?(?!\p{L})|zoll)/giu;
const FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅝': 0.625,
  '⅜': 0.375,
};

function amountMm(num: string, unit: string): number | null {
  let v: number;
  if (FRACTIONS[num] != null) v = FRACTIONS[num];
  else if (num.includes('/')) {
    const [a, b] = num.split('/').map((x) => Number(x.trim()));
    v = b ? a / b : NaN;
  } else v = Number(num.replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) return null;
  const u = unit.toLowerCase();
  const mm = u === 'cm' || u === 'см' ? v * 10 : u === 'mm' || u === 'мм' ? v : v * 25.4;
  // A plausible seam allowance: 3 mm … 50 mm.
  return mm >= 3 && mm <= 50 ? Math.round(mm * 10) / 10 : null;
}

export type TextAllowance = {
  included: boolean;
  allowanceMm: number | null;
  quote: string;
  /**
   * 'file' — a general sentence ("Nahtzugaben 1 cm", "все припуски 1 см", "seam allowance
   * included"): evidence for the whole file. 'piece' — the sentence names a piece («Кокетки – …»,
   * "Hood: …") or gives several values edge by edge ("1.5 cm on the shoulder, 2 cm on the
   * others"): it speaks of those pieces only, never of the file (FLY M3).
   */
  scope: 'file' | 'piece';
  /** For 'piece': the words that name it, as printed (empty when only the per-edge values tell). */
  subject?: string;
};

/** A hem / turn-up amount, read from its own clause ("на подгибку низа … — 4 см", "hem 3 cm"). */
const HEM_CLAUSE = re(
  `(?:hem|saum|säume|ourlet|подгиб|${NB}низ|нижн|zoom|dół|opsøm|forneden|bajo|dobladillo|orlo)`,
);
/** Edge words: a value tied to an edge, not to the piece ("по плечевому срезу", "an allen Kanten"). */
const EDGE_WORD = re(
  `срез|${NB}edge|kante|${NB}bord(?!\\p{L})|${NB}rand|${NB}kant(?!\\p{L})|krawędz|${NB}borde`,
);

/** Which edge: a value for SOME edges only ("по остальным срезам", "on the top edge"), not all. */
const EDGE_QUAL = re(
  `остальн|верхн|нижн|плечев|горловин|боков|кроме|${NB}other|remaining|${NB}top(?!\\p{L})|bottom|shoulder|neck|übrig|ausser|außer|${NB}oberen|${NB}unteren|except`,
);

/**
 * Is a statement about named pieces rather than the file (FLY M3)?
 *   · a piece named as the SUBJECT of a rule: "<1–4 words that name a piece> – / : …" before the
 *     amount («Кокетки – по …», «Спинка, Полочка, Рукав – …», «Пата – …», "Hood: 1.5 cm");
 *   · several values edge by edge: two or more distinct amounts outside hem clauses, with an edge
 *     word («по плечевому срезу … 1.5 см, по остальным 2 см»).
 */
function pieceScope(win: string, amountAt: number | null): { subject: string } | null {
  const upto = amountAt ?? win.length;
  const sep = /\s[-–—]\s|:\s/gu;
  for (let m = sep.exec(win); m && m.index < upto; m = sep.exec(win)) {
    const before = win.slice(0, m.index);
    // the words right before the separator, back to the previous clause mark
    const clause = before.split(/[.!?;:)\]]\s|\s[-–—]\s/u).pop() ?? '';
    const words = clause.trim().split(/\s+/).slice(-4).join(' ');
    if (!words || SA_RE.test(words)) continue;
    const r = readPieceText(words);
    if (r.code) return { subject: words };
  }
  const values = new Set<number>();
  let perEdge = false;
  AMOUNT.lastIndex = 0;
  for (let a = AMOUNT.exec(win); a; a = AMOUNT.exec(win)) {
    const mm = amountMm(a[1].replace(/\s+/g, ''), a[2]);
    if (mm == null) continue;
    const clause =
      win
        .slice(0, a.index)
        .split(/[,;.]\s/u)
        .pop() ?? '';
    // "по остальным срезам … 5 мм", "on the top edge 3.5 cm": a value for some edges only
    if (EDGE_WORD.test(clause) && EDGE_QUAL.test(clause)) perEdge = true;
    if (HEM_CLAUSE.test(clause)) continue;
    values.add(mm);
  }
  return perEdge || (values.size >= 2 && EDGE_WORD.test(win)) ? { subject: '' } : null;
}

const normalise = (s: string) =>
  s
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/\s+/g, ' ');

/** Every statement about the seam allowance in a text: one per sentence that names it. */
export function allowanceStatements(text: string): TextAllowance[] {
  const t = normalise(text);
  const out: TextAllowance[] = [];
  const seen = new Set<number>();
  const g = new RegExp(SA_RE.source, 'giu');
  for (let m = g.exec(t); m; m = g.exec(t)) {
    // the sentence around the SA word, at most ±140 characters
    let from = Math.max(0, m.index - 140);
    const before = t.slice(from, m.index);
    const cut = Math.max(
      before.lastIndexOf('. '),
      before.lastIndexOf('! '),
      before.lastIndexOf('? '),
      before.lastIndexOf('; '),
    );
    if (cut >= 0) from += cut + 2;
    if (seen.has(from)) continue;
    seen.add(from);
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 140);
    const endRel = after.search(/[.!?;](?=\s|$)/);
    const to = m.index + m[0].length + (endRel >= 0 ? endRel + 1 : after.length);
    const win = t.slice(from, to);
    if (EASE.test(win)) continue;
    // the verdict must be NEAR the SA word (±60 chars): «Припуски: на швы 1,5 см, …, детали
    // подкладки выкроить с припусками» is about the shell, the "с припусками" is the lining's
    const near = t.slice(Math.max(from, m.index - 60), Math.min(to, m.index + m[0].length + 60));
    const excluded = EXCLUDED.some((r) => r.test(near));
    const included = !excluded && INCLUDED.some((r) => r.test(near));
    const instruction = INSTRUCTION.test(win);
    // the amount: closest to the SA word, not a hem / safety amount
    const saAt = m.index - from;
    let best: { mm: number; d: number; at: number } | null = null;
    AMOUNT.lastIndex = 0;
    for (let a = AMOUNT.exec(win); a; a = AMOUNT.exec(win)) {
      const mm = amountMm(a[1].replace(/\s+/g, ''), a[2]);
      if (mm == null) continue;
      const pre = win.slice(Math.max(0, a.index - 28), a.index);
      const hem = HEM_WORD.exec(pre);
      if (hem && !/zugabe/i.test(pre.slice(hem.index)) && !EXCEPT.test(pre.slice(0, hem.index)))
        continue;
      if (HEM_AFTER.test(win.slice(a.index + a[0].length, a.index + a[0].length + 14))) continue;
      if (SAFETY.test(pre)) continue;
      const d = Math.abs(a.index - saAt);
      if (!best || d < best.d) best = { mm, d, at: a.index };
    }
    if (!excluded && !included) {
      // "На швы и по срезам — 1,5 см" / "Naht- und Saumzugaben … 1,5 cm an allen Kanten" with no
      // verb: a printed amount TO ADD is the convention of every source that states one without
      // "included" — unless the sentence is a sewing step (trim, press, stitch).
      if (best && !instruction && best.d <= 60)
        out.push({
          included: false,
          allowanceMm: best.mm,
          quote: win.trim(),
          ...scopeOf(win, best.at),
        });
      continue;
    }
    out.push({
      included,
      allowanceMm: instruction ? null : best?.mm ?? null,
      quote: win.trim(),
      ...scopeOf(win, best?.at ?? null),
    });
  }
  return out;
}

const scopeOf = (win: string, at: number | null): Pick<TextAllowance, 'scope' | 'subject'> => {
  const p = pieceScope(win, at);
  return p ? { scope: 'piece', subject: p.subject } : { scope: 'file' };
};

/** The first statement in one text, or null (unit-test helper). */
export function readAllowanceText(text: string): TextAllowance | null {
  return allowanceStatements(text)[0] ?? null;
}

/** All statements on the sheet, weighted (an amount counts double); disagreement is reported. */
export function allowanceFromTexts(texts: readonly string[]): {
  decision: AllowanceDecision | null;
  conflicts: string[];
  statements: TextAllowance[];
  /** Statements about named pieces / per-edge values: context for the operator, never the file's. */
  context: TextAllowance[];
} {
  const all = allowanceStatements(
    texts
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' '),
  );
  const found = all.filter((f) => f.scope === 'file');
  const context = all.filter((f) => f.scope === 'piece');
  if (!found.length) return { decision: null, conflicts: [], statements: [], context };
  const w = (f: TextAllowance) => (f.allowanceMm != null ? 2 : 1);
  const inc = found.filter((f) => f.included);
  const exc = found.filter((f) => !f.included);
  const wi = inc.reduce((s, f) => s + w(f), 0);
  const we = exc.reduce((s, f) => s + w(f), 0);
  const conflicts =
    inc.length && exc.length
      ? [`the sheet also says the opposite: «${(wi >= we ? exc : inc)[0].quote.slice(0, 100)}»`]
      : [];
  const pick = wi > we ? inc : we > wi ? exc : [found[0]];
  // the amount most stated on the winning side
  const votes = new Map<number, number>();
  for (const f of pick)
    if (f.allowanceMm != null) votes.set(f.allowanceMm, (votes.get(f.allowanceMm) ?? 0) + 1);
  // ties: the amount stated first (instructions/cover come before the sewing steps)
  const firstAt = (mm: number) => pick.findIndex((f) => f.allowanceMm === mm);
  const amount =
    [...votes].sort((a, b) => b[1] - a[1] || firstAt(a[0]) - firstAt(b[0]))[0]?.[0] ?? null;
  const quoteOf = pick.find((f) => f.allowanceMm === amount) ?? pick[0];
  const included = quoteOf.included;
  // the sheet prints amounts piece by piece (a table, «Кокетки – 1.5 см …») and no general one:
  // "without" alone must not become the 10 mm default — the outline is asked (FLY M3)
  if (amount == null && context.some((c) => c.allowanceMm != null))
    return { decision: null, conflicts, statements: found, context };
  const evidence = [`text: «${quoteOf.quote.slice(0, 160)}»`];
  if (amount == null)
    evidence.push(
      `no amount printed — ${PATIMPORT.defaultAllowanceMm} mm default (owner decision 7)`,
    );
  return {
    decision: {
      meaning: included ? 'cut' : 'seam',
      allowanceMm: amount ?? PATIMPORT.defaultAllowanceMm,
      origin: 'text',
      evidence,
    },
    conflicts,
    statements: found,
    context,
  };
}

// ── geometry: two nested loops of one rank ─────────────────────────────────────────────────

export type MeasuredGap = { mm: number; spreadMm: number; coverage: number };

/**
 * Distance from an inner line to the outline: median and spread (p90 − p10) over samples every
 * 2 mm, coverage = inner length / outline perimeter. A seam line is 3–30 mm in, spread < 1.5 mm.
 */
export function measureGap(outer: readonly PtMm[], inner: readonly PtMm[][]): MeasuredGap | null {
  if (outer.length < 3 || !inner.length) return null;
  const idx = new SegIndex([{ pts: outer, closed: true }], 5);
  const d: number[] = [];
  let len = 0;
  for (const line of inner) {
    if (line.length < 2) continue;
    for (const p of sampleAlong(line, false, 2)) {
      const e = idx.nearest(p, 40);
      if (Number.isFinite(e)) d.push(e);
    }
    for (let i = 0; i + 1 < line.length; i++)
      len += Math.hypot(line[i + 1].x - line[i].x, line[i + 1].y - line[i].y);
  }
  if (d.length < 10) return null;
  d.sort((a, b) => a - b);
  const q = (f: number) => d[Math.min(d.length - 1, Math.floor(d.length * f))];
  return { mm: q(0.5), spreadMm: q(0.9) - q(0.1), coverage: len / perimeter(outer) };
}

export const isSeamGap = (g: MeasuredGap | null): g is MeasuredGap =>
  !!g && g.mm >= 3 && g.mm <= 30 && g.spreadMm <= 1.5 && g.coverage >= 0.5;

/** The DXF fast path (and any adapter that knows) carries typed features on the candidate. */
export const featuresOf = (c: PieceCandidate): Feature[] =>
  c.features ?? (c as PieceCandidate & { dxf?: { features?: Feature[] } }).dxf?.features ?? [];

/** Seam lines a candidate carries or a ChainSet shows inside it (seam class / same size class). */
export function innerSeamLines(c: PieceCandidate, set?: ChainSet): PtMm[][] {
  const fromFeatures = featuresOf(c)
    .filter((f): f is Extract<Feature, { kind: 'seam' }> => f.kind === 'seam')
    .map((f) => [...f.pts, f.pts[0]]);
  if (fromFeatures.length || !set) return fromFeatures;
  const clsOf = new Map<number, (typeof set.classes)[number]>();
  for (const k of set.classes) for (const ch of k.chains) clsOf.set(ch, k);
  const wallCls = new Set(c.walls.map((w) => clsOf.get(w)?.id));
  const out: PtMm[][] = [];
  for (const id of c.inside) {
    const ch = set.chains[id];
    const k = clsOf.get(id);
    if (!ch || !k) continue;
    const sameSize = k.role === 'size' && wallCls.has(k.id);
    if (k.role !== 'seam' && !sameSize) continue;
    if (!ch.pts.every((p) => pointInPolygon(p, c.outer))) continue;
    out.push(ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts);
  }
  if (!out.length) return drawnSeam(c, set)?.lines ?? [];
  return out;
}

/** A drawn seam fragment continues another across a break this short (a notch, a crossing), mm. */
const SEAM_JOIN_MM = 12;
/** …turning at most this much more than the outline turns there, degrees. */
const SEAM_JOIN_TURN_DEG = 25;
/** A connected run of seam fragments counts from this share of the outline's perimeter. */
const SEAM_RUN_SHARE = 0.15;

/** The drawn seam line of one candidate, qualified once (Codex N3): its chains and its gap. */
export type DrawnSeam = { ids: number[]; lines: PtMm[][]; gap: MeasuredGap };

const memo = new WeakMap<PieceCandidate, WeakMap<ChainSet, DrawnSeam | null>>();

/**
 * N3 (wm M) + Codex: one pen draws the cut line AND the seam line inside it, so the legend files
 * the seam line with the outlines ('common', A0.3 "the seam line inside") or, a piece of it, as
 * 'internal'. A fragment inside this outline, in the outline's pen, at a constant distance to it
 * (3–30 mm, spread ≤ 1.5 mm; an 'internal' one ≥ 40 mm, spread ≤ 0.5 mm, within 0.3 mm of the
 * median) is part of the drawn seam ONLY inside a connected, coherent parallel contour: fragments
 * joined end to end across short breaks (≤ 12 mm, the direction carried on) into runs, a run
 * counting from 15 % of the perimeter. The qualified runs together must pass `isSeamGap` — the
 * SAME test (and 50 % coverage) the measured allowance uses; that one result both measures the
 * allowance and keeps those chains off layer 8. A disconnected pocket placement, topstitch or hem
 * fold at the same gap stays an internal line.
 */
export function drawnSeam(c: PieceCandidate, set: ChainSet): DrawnSeam | null {
  const m = memo.get(c)?.get(set);
  if (m !== undefined) return m;
  const r = qualifySeam(c, set);
  if (!memo.has(c)) memo.set(c, new WeakMap());
  memo.get(c)!.set(set, r);
  return r;
}

function qualifySeam(c: PieceCandidate, set: ChainSet): DrawnSeam | null {
  const clsOf = new Map<number, (typeof set.classes)[number]>();
  for (const k of set.classes) for (const ch of k.chains) clsOf.set(ch, k);
  const walls = new Set(c.walls);
  const wallCls = new Set(c.walls.map((w) => clsOf.get(w)?.id));
  const wallStyles = new Set(c.walls.map((w) => set.chains[w]?.style));
  type Cand = { id: number; pts: PtMm[]; mm: number; spread: number; len: number; row: boolean };
  const cands: Cand[] = [];
  for (const id of new Set(c.inside)) {
    const ch = set.chains[id];
    const k = clsOf.get(id);
    if (!ch || !k || walls.has(id) || ch.lengthMm < 20) continue;
    const row = k.role === 'common' && wallCls.has(k.id);
    if (!row && !(k.role === 'internal' && wallStyles.has(ch.style))) continue;
    if (!ch.pts.every((p) => pointInPolygon(p, c.outer))) continue;
    const pts = ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts;
    const g = measureGap(c.outer, [pts]);
    if (!g || g.mm < 3 || g.mm > 30 || g.spreadMm > 1.5) continue;
    cands.push({ id, pts, mm: g.mm, spread: g.spreadMm, len: ch.lengthMm, row });
  }
  const rows = cands.filter((x) => x.row).sort((a, b) => a.mm - b.mm);
  if (!rows.length) return null;
  // the length-weighted median distance of the outline-row pieces
  const total = rows.reduce((a, x) => a + x.len, 0);
  let acc = 0;
  const med = rows.find((x) => (acc += x.len) >= total / 2)!.mm;
  const kept = [
    ...rows.filter((x) => Math.abs(x.mm - med) <= 1),
    ...cands.filter((x) => !x.row && x.len >= 40 && x.spread <= 0.5 && Math.abs(x.mm - med) <= 0.3),
  ];
  // runs: fragments joined end to end, the direction carried across the break
  const ends = (x: Cand) => {
    const p = x.pts;
    const n = p.length;
    // the end point and the direction pointing OUT of the fragment there
    const out = (a: PtMm, b: PtMm) => {
      const l = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      return { x: (a.x - b.x) / l, y: (a.y - b.y) / l };
    };
    return [
      { p: p[0], d: out(p[0], p[Math.min(n - 1, 1)]) },
      { p: p[n - 1], d: out(p[n - 1], p[Math.max(0, n - 2)]) },
    ];
  };
  const closedLoop = (x: Cand) =>
    Math.hypot(x.pts[0].x - x.pts[x.pts.length - 1].x, x.pts[0].y - x.pts[x.pts.length - 1].y) < 1;
  const cos = Math.cos((SEAM_JOIN_TURN_DEG * Math.PI) / 180);
  const joins = (a: Cand, b: Cand) =>
    ends(a).some((ea) =>
      ends(b).some((eb) => {
        const gx = eb.p.x - ea.p.x;
        const gy = eb.p.y - ea.p.y;
        const gl = Math.hypot(gx, gy);
        if (gl <= 1) return true; // touching ends (a break at a corner)
        if (gl > SEAM_JOIN_MM) return false;
        // a's end carries on into b: b's end points back at a (opposite directions)…
        if (-(ea.d.x * eb.d.x + ea.d.y * eb.d.y) < cos) return false;
        // …and the break itself runs along that direction
        return (gx * ea.d.x + gy * ea.d.y) / gl >= cos;
      }),
    );
  const parent = kept.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < kept.length; i++)
    for (let j = i + 1; j < kept.length; j++)
      if (joins(kept[i], kept[j])) parent[find(i)] = find(j);
  const runs = new Map<number, Cand[]>();
  kept.forEach((x, i) => runs.set(find(i), [...(runs.get(find(i)) ?? []), x]));
  const per = perimeter(c.outer);
  const qualified = [...runs.values()]
    .filter(
      (r) =>
        r.reduce((a, x) => a + x.len, 0) >= SEAM_RUN_SHARE * per ||
        (r.length === 1 && closedLoop(r[0])),
    )
    .flat();
  if (!qualified.length) return null;
  const lines = qualified.map((x) => x.pts);
  const gap = measureGap(c.outer, lines);
  if (!isSeamGap(gap)) return null;
  return { ids: qualified.map((x) => x.id), lines, gap };
}

/** The measured allowance of one candidate, when a seam line is drawn inside it. */
export function measuredAllowance(c: PieceCandidate, set?: ChainSet): MeasuredGap | null {
  const g = measureGap(c.outer, innerSeamLines(c, set));
  return isSeamGap(g) ? g : null;
}

// ── the file-level decision ────────────────────────────────────────────────────────────────

/**
 * File-level allowance (`SemanticsInput.fileAllowance` proposal). Geometry over text: a drawn seam
 * line inside most pieces measures the allowance (meaning 'both'); else the sheet's statement;
 * else the default (meaning 'cut', origin 'default' — the wizard must ask).
 * The optional ChainSet lets a PDF candidate's inner seam chains be measured (contract signature
 * is (sheet, families); the extra argument is ignored by callers that do not have one).
 */
export const detectAllowance: DetectAllowanceFn &
  ((s: Sheet, f: PieceFamily[], set?: ChainSet) => AllowanceDecision) = (
  sheet: Sheet,
  families: PieceFamily[],
  set?: ChainSet,
): AllowanceDecision => {
  const textual = allowanceFromTexts(sheet.texts.map((t) => t.text));
  // geometry
  const gaps: number[] = [];
  let seamOuter = 0;
  let measuredOn = 0;
  for (const f of families) {
    const c = [...f.candidates].sort((a, b) => b.rank - a.rank)[0];
    if (!c || c.outcome !== 'closed') continue;
    measuredOn++;
    const dxf = (c as PieceCandidate & { dxf?: { outerIsSeam?: boolean } }).dxf;
    if (dxf?.outerIsSeam) {
      seamOuter++;
      const cut = featuresOf(c).find((x) => x.kind === 'cut');
      if (cut && cut.kind === 'cut') {
        const g = measureGap([...cut.pts], [[...c.outer, c.outer[0]]]);
        if (isSeamGap(g)) gaps.push(g.mm);
      }
      continue;
    }
    const g = measuredAllowance(c, set);
    if (g) gaps.push(g.mm);
  }
  gaps.sort((a, b) => a - b);
  const med = gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)] * 10) / 10 : null;
  const textEv = textual.decision?.evidence ?? [];
  if (med != null && gaps.length * 2 >= Math.max(1, measuredOn)) {
    const meaning = seamOuter * 2 > measuredOn ? 'seam' : 'both';
    return {
      meaning,
      allowanceMm: med,
      origin: 'measured',
      evidence: [
        meaning === 'seam'
          ? `outline is the sewing line; the drawn cut line sits ${med} mm outside it (${gaps.length} pieces)`
          : `a seam line is drawn ${med} mm inside the outline on ${gaps.length}/${measuredOn} pieces`,
        ...textEv,
        ...textual.conflicts,
      ],
    };
  }
  // a seam line in a pen of its own (chains/seam.ts: role 'seam', evidence `seam-offset`) inside
  // most pieces: the drawn outline is the cut line even where the allowance changes edge by edge
  // (BLAZER: 6–12 mm, the hem more), which the per-piece spread test above turns down
  const seamCls = new Set(set?.classes.filter((k) => k.role === 'seam').map((k) => k.id) ?? []);
  if (set && seamCls.size) {
    const clsOf = new Map<number, number>();
    for (const k of set.classes)
      if (seamCls.has(k.id)) for (const ch of k.chains) clsOf.set(ch, k.id);
    let holding = 0;
    for (const f of families) {
      const c = [...f.candidates].sort((a, b) => b.rank - a.rank)[0];
      if (c && c.outcome === 'closed' && c.inside.some((id) => clsOf.has(id))) holding++;
    }
    const offs = set.classes
      .filter((k) => seamCls.has(k.id))
      .flatMap((k) => k.evidence.flatMap((e) => (e.kind === 'seam-offset' ? [e.offsetMm] : [])));
    if (offs.length && holding * 2 >= Math.max(1, measuredOn)) {
      const mm = offs.sort((a, b) => a - b)[offs.length >> 1];
      return {
        meaning: 'both',
        allowanceMm: mm,
        origin: 'measured',
        evidence: [
          `a seam line is drawn in its own pen about ${mm} mm inside the outline on ${holding}/${measuredOn} pieces (the allowance varies edge by edge); the outline is the cut line`,
          ...textEv,
          ...textual.conflicts,
        ],
      };
    }
  }
  if (textual.decision) {
    return { ...textual.decision, evidence: [...textual.decision.evidence, ...textual.conflicts] };
  }
  return {
    meaning: 'cut',
    allowanceMm: PATIMPORT.defaultAllowanceMm,
    origin: 'default',
    evidence: textual.context.length
      ? [pieceOnlyEvidence(textual.context)]
      : [
          'no seam-allowance statement and no seam line found — the outline is taken as the cut line; confirm',
        ],
  };
};

/**
 * The sheet speaks of allowances only for named pieces / edges (FLY M3): shown to the operator as
 * context, never as the file's value — the outline question is still asked.
 */
export function pieceOnlyEvidence(context: readonly TextAllowance[]): string {
  const q = context[0].quote.slice(0, 120);
  return `the sheet gives allowances only for some pieces or edges («${q}»${context.length > 1 ? ` and ${context.length - 1} more` : ''}) — no value for the whole file`;
}
