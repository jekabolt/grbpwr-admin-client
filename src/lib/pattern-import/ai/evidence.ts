// EVIDENCE BUILDER (F10) — what the client itself measures and reads about every piece before any
// model sees it: the text inside the contour, the printed quantity ("cut 2", "2 дет.", "Cut 1 on
// fold"), a fold hint, a symmetry hint, a mirrored twin, area and bbox. It feeds BOTH the prompt
// (F9 `PatternPieceEvidence`, via wire.ts) and the deterministic half of the confidence
// (combine.ts) — so the model is never the only witness (Codex C10).
//
// Pure and worker-safe (runs inside the `render-som` stage next to the renderer).
import type {
  FoldFeature,
  IRText,
  PieceCandidate,
  PieceFamily,
  PtMm,
  Seed,
  SeedId,
  Sheet,
  SomMark,
} from '../types';
import { areaOf, bboxOf, distToOutline, inside, isMirrorSymmetric, isMirrorTwin } from './geom';

/** Texts within this distance outside a piece (and nearer to it than to any other) are "near". */
export const NEAR_MM = 25;
/** F9 caps: instructions excerpt ≤ 4000 runes. */
export const INSTRUCTIONS_MAX = 4000;

// ── quantity and fold in printed text ──────────────────────────────────────────────────────────

const L = '\\p{L}';
const QTY_RULES: { re: RegExp; times?: number; pairGroup?: number }[] = [
  // CLO / AAMA DXF and labelled PDFs: "QUANTITY: 1", "Qty 2", "Anzahl: 2", "Кол-во: 2"
  {
    re: /(?:quantity|qty|anzahl|кол-?во|количество|ilość|quantité|cantidad|aantal)\s*[:=]?\s*(\d{1,2})(?!\d)/iu,
  },
  // "cut 2", "Cut 1 on fold", "cut x1 pair", "CUT 2 ON FOLD"
  { re: /\bcut\s*(?:x\s*)?(\d{1,2})(?:\s*(pairs?|пар))?/iu, pairGroup: 2 },
  // "1 пара", "2 пары"
  { re: new RegExp(`(\\d{1,2})\\s*пар(?:а|ы|у)?(?!${L})`, 'iu'), times: 2 },
  // "2 дет.", "КАРМАН 2 ДЕТ.", "2 шт"
  { re: /(\d{1,2})\s*(?:дет|шт)/iu },
  { re: /(?:вы)?кроить\s*(\d{1,2})/iu },
  // "2 x VORD. HOSENTEIL", "2x im Bruch", "2× " — never "10 x 10 cm"
  { re: /(?<!\d)(\d{1,2})\s*[x×х](?!\s*\d)(?![a-wyz])/iu },
  // "DELANTERO X2", "x 2"
  { re: new RegExp(`(?<!\\d[\\s.]*)(?<![${L}\\d])[x×х]\\s*(\\d{1,2})(?![\\d${L}])`, 'iu') },
  // "2 mal / fois / razy / keer / veces / gange"
  { re: /(\d{1,2})\s*(?:mal|fois|razy|keer|veces|gange)(?!\p{L})/iu },
  { re: /(?:wytnij|wyciąć|couper|coupez|knip|cortar|zuschneiden)\s*(\d{1,2})/iu },
];
const PAIR_ONLY = /\bpaarig\b|\b(?:1|ein|one)\s*(?:paar|pair)\b/iu;

/** Printed quantity of one text item: pieces per garment (a pair = 2), 1..20; null = none. */
export function parseQuantity(text: string): number | null {
  for (const r of QTY_RULES) {
    const m = r.re.exec(text);
    if (!m) continue;
    let n = Number(m[1]);
    if (r.times) n *= r.times;
    if (r.pairGroup && m[r.pairGroup]) n *= 2;
    if (Number.isInteger(n) && n >= 1 && n <= 20) return n;
  }
  if (PAIR_ONLY.test(text)) return 2;
  return null;
}

// Corpus spellings (E1a): "CENTRE BACK FOLD", "Cut 1 on fold", "mod fold" / "Fold/ Stoffbruch/
// Pliure" (DA/DE/FR legend), "im Bruch", "Stoffbr.", "Besatz Umbruch", "со сгибом", "СГИБ", plus
// pli / doblez / piega / zgięcie / złożenie / vouw. A word is evidence only — semantics binds it to
// an edge of the piece before anything is unfolded (fold.ts `bindFoldText`).
const FOLD =
  /on\s+(?:the\s+)?fold|\bfold\b|im\s*bruch|stoffbr|\bbruch\b|umbruch|сгиб|au\s+pli|\bpli(?:ure)?\b|na\s+zgi[eę]ci|zgi[eę]ci|z[łl]o[żz]eni|doblez|\bpiega\b|\bvouw\b|på\s+fold/iu;

/** Does the text say "on fold"? */
export const saysFold = (text: string) => FOLD.test(text);

// ── language ───────────────────────────────────────────────────────────────────────────────────

const LANG: { lang: string; re: RegExp }[] = [
  { lang: 'ru', re: /[Ѐ-ӿ]/u },
  { lang: 'pl', re: /[ąćęłńśźż]|\b(?:przód|tył|rękaw|kołnierz|wykrój)\b/iu },
  { lang: 'da', re: /[æø]|\b(?:stykke|ærme|belægning)\w*/iu },
  { lang: 'de', re: /[äöüß]|\b(?:vorder|rück|teil|bruch|zuschneiden|tasche|futter|kragen)\w*/iu },
  { lang: 'es', re: /ñ|\b(?:delantero|espalda|manga|cuello|bolsillo|costado)\b/iu },
  { lang: 'fr', re: /\b(?:devant|dos|poche|manche|couper|pli|parementure)\b/iu },
  { lang: 'nl', re: /\b(?:voorpand|achterpand|mouw|kraag|knip|stofvouw)\b/iu },
];

/** The dominant language of the sheet text ('' = no letters at all). Prompt hint only. */
export function languageOf(texts: readonly string[]): string {
  const score = new Map<string, number>();
  let letters = false;
  for (const t of texts) {
    if (/\p{L}/u.test(t)) letters = true;
    for (const l of LANG) if (l.re.test(t)) score.set(l.lang, (score.get(l.lang) ?? 0) + 1);
  }
  let best = '';
  let n = 0;
  for (const [k, v] of score) if (v > n) [best, n] = [k, v];
  return best || (letters ? 'en' : '');
}

// ── pieces → marks ─────────────────────────────────────────────────────────────────────────────

/** One piece to mark: its family and the outline drawn/measured (the largest closed rank). */
export type MarkSource = {
  seed: SeedId;
  family: PieceFamily;
  candidate: PieceCandidate;
  outline: PtMm[];
  variant: string | null;
};

/**
 * The pieces to mark, in the order asked (`only`, else family order). The outer = largest-area
 * candidate (all sizes nest inside it), preferring closed fills; a family with no candidate is skipped.
 */
export function markSources(
  families: readonly PieceFamily[],
  seeds: readonly Seed[],
  only?: readonly SeedId[],
): MarkSource[] {
  const order = only ?? families.map((f) => f.seed);
  const out: MarkSource[] = [];
  for (const sd of order) {
    const family = families.find((f) => f.seed === sd);
    if (!family || !family.candidates.length) continue;
    const pool = family.candidates.filter((c) => c.outcome === 'closed' && c.outer.length >= 3);
    const from = pool.length ? pool : family.candidates.filter((c) => c.outer.length >= 3);
    if (!from.length) continue;
    const candidate = from.reduce((a, b) => (b.areaMm2 > a.areaMm2 ? b : a));
    out.push({
      seed: sd,
      family,
      candidate,
      outline: candidate.outer,
      variant: seeds.find((s) => s.id === sd)?.variant ?? null,
    });
  }
  return out;
}

const centreOf = (t: IRText): PtMm => {
  const b = t.bbox;
  return Number.isFinite(b.minX) && b.maxX >= b.minX
    ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
    : t.anchor;
};

/** Reading order on a y-up sheet: top line first, then left to right. */
const readingOrder = (a: IRText, b: IRText) =>
  Math.abs(a.anchor.y - b.anchor.y) > Math.max(a.fontSizeMm, b.fontSizeMm, 1) * 0.6
    ? b.anchor.y - a.anchor.y
    : a.anchor.x - b.anchor.x;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * The texts worth quoting: deduplicated, and only those with a letter or a quantity. CLO/AAMA
 * pieces carry dozens of grade-point labels ("# -1", "# 202") and size digits; quoted, they would
 * fill the 12 wire slots before the piece's NAME.
 */
function wordsOnly(texts: readonly IRText[]): string[] {
  const out: string[] = [];
  for (const t of texts) {
    const s = clean(t.text);
    if (!s || out.includes(s)) continue;
    if (!/\p{L}/u.test(s) && parseQuantity(s) === null) continue;
    out.push(s);
  }
  return out;
}

export type BuiltMarks = {
  marks: SomMark[];
  context: { instructionsExcerpt: string; languageHint: string };
};

/** Every piece's evidence, numbered 1..n in `sources` order. */
export function buildMarks(
  sheet: Pick<Sheet, 'texts'>,
  sources: readonly MarkSource[],
): BuiltMarks {
  const boxes = sources.map((s) => bboxOf(s.outline));
  const areas = sources.map((s) => areaOf(s.outline));
  const insideOf = new Map<number, IRText[]>();
  const nearOf = new Map<number, IRText[]>();
  const loose: IRText[] = [];
  const byId = new Map(sheet.texts.map((t) => [t.id, t]));
  const claimed = new Set<number>();

  // F4 may already know which texts it filled around; trust that first.
  sources.forEach((s, i) => {
    for (const id of s.candidate.textsInside ?? []) {
      const t = byId.get(id);
      if (!t || claimed.has(t.id)) continue;
      claimed.add(t.id);
      insideOf.set(i, [...(insideOf.get(i) ?? []), t]);
    }
  });

  for (const t of sheet.texts) {
    if (claimed.has(t.id) || !clean(t.text)) continue;
    const c = centreOf(t);
    // Inside: the SMALLEST containing piece (a pocket drawn inside the front owns its label).
    let host = -1;
    for (let i = 0; i < sources.length; i++) {
      const b = boxes[i];
      if (c.x < b.minX || c.x > b.maxX || c.y < b.minY || c.y > b.maxY) continue;
      if (!inside(c, sources[i].outline)) continue;
      if (host < 0 || areas[i] < areas[host]) host = i;
    }
    if (host >= 0) {
      insideOf.set(host, [...(insideOf.get(host) ?? []), t]);
      continue;
    }
    let near = -1;
    let nearD = NEAR_MM;
    for (let i = 0; i < sources.length; i++) {
      const b = boxes[i];
      if (
        c.x < b.minX - NEAR_MM ||
        c.x > b.maxX + NEAR_MM ||
        c.y < b.minY - NEAR_MM ||
        c.y > b.maxY + NEAR_MM
      )
        continue;
      const d = distToOutline(c, sources[i].outline);
      if (d <= nearD) {
        nearD = d;
        near = i;
      }
    }
    if (near >= 0) nearOf.set(near, [...(nearOf.get(near) ?? []), t]);
    else loose.push(t);
  }

  const outlines = sources.map((s) => s.outline);
  const twin = sources.map(() => null as number | null);
  for (let i = 0; i < sources.length; i++)
    for (let j = i + 1; j < sources.length; j++) {
      if (twin[i] !== null || twin[j] !== null) continue;
      if (isMirrorTwin(outlines[i], outlines[j])) {
        twin[i] = j + 1;
        twin[j] = i + 1;
      }
    }

  const marks: SomMark[] = sources.map((s, i) => {
    const textInside = wordsOnly([...(insideOf.get(i) ?? [])].sort(readingOrder));
    const textNear = wordsOnly([...(nearOf.get(i) ?? [])].sort(readingOrder));
    // The quantity note: inside first, then near; the WHOLE item is quoted (it carries the context).
    let quantityText = '';
    let cutQtyHint: number | null = null;
    for (const t of [...textInside, ...textNear]) {
      const q = parseQuantity(t);
      if (q !== null) {
        quantityText = t;
        cutQtyHint = q;
        break;
      }
    }
    const foldFeature = (s.candidate.features ?? []).some(
      (f): f is FoldFeature => f.kind === 'fold',
    );
    const b = boxes[i];
    return {
      mark: i + 1,
      seed: s.seed,
      bboxMm: [b.minX, b.minY, b.maxX, b.maxY],
      areaMm2: areas[i],
      textInside,
      textNear,
      quantityText,
      cutQtyHint,
      foldHint: foldFeature || [...textInside, ...textNear].some(saysFold),
      symmetricHint: isMirrorSymmetric(s.outline),
      sizeCount: s.family.candidates.length,
      mirrorTwinMark: twin[i],
      variant: s.variant,
    };
  });

  // What belongs to no piece: the piece list, the legend, the cutting notes. Deduplicated (a label
  // repeated once per size OCG is one line), letters only, reading order, ≤ 4000 characters.
  const seen = new Set<string>();
  const lines: string[] = [];
  let used = 0;
  for (const t of [...loose].sort(readingOrder)) {
    const s = clean(t.text);
    if (!/\p{L}{2}/u.test(s) || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    if (used + s.length + 1 > INSTRUCTIONS_MAX) break;
    lines.push(s);
    used += s.length + 1;
  }
  return {
    marks,
    context: {
      instructionsExcerpt: lines.join('\n'),
      languageHint: languageOf(sheet.texts.map((t) => t.text)),
    },
  };
}
