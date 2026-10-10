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
};

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
    let best: { mm: number; d: number } | null = null;
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
      if (!best || d < best.d) best = { mm, d };
    }
    if (!excluded && !included) {
      // "На швы и по срезам — 1,5 см" / "Naht- und Saumzugaben … 1,5 cm an allen Kanten" with no
      // verb: a printed amount TO ADD is the convention of every source that states one without
      // "included" — unless the sentence is a sewing step (trim, press, stitch).
      if (best && !instruction && best.d <= 60)
        out.push({ included: false, allowanceMm: best.mm, quote: win.trim() });
      continue;
    }
    out.push({ included, allowanceMm: instruction ? null : best?.mm ?? null, quote: win.trim() });
  }
  return out;
}

/** The first statement in one text, or null (unit-test helper). */
export function readAllowanceText(text: string): TextAllowance | null {
  return allowanceStatements(text)[0] ?? null;
}

/** All statements on the sheet, weighted (an amount counts double); disagreement is reported. */
export function allowanceFromTexts(texts: readonly string[]): {
  decision: AllowanceDecision | null;
  conflicts: string[];
  statements: TextAllowance[];
} {
  const found = allowanceStatements(
    texts
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' '),
  );
  if (!found.length) return { decision: null, conflicts: [], statements: [] };
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
  return out;
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
    evidence: [
      'no seam-allowance statement and no seam line found — the outline is taken as the cut line; confirm',
    ],
  };
};
