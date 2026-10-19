// CUT-LAYOUT TEXT → piece numbers per fabric. The instructions of a printed pattern say what is cut
// from which cloth in three shapes, all read here from TEXT (no pictogram reading — a layout drawn
// as curves, or printed only as a picture, is left to the AI and the operator):
//
//   1. a numbered list under a fabric heading («Раскрой деталей из подкладочной ткани:» then
//      «1 - Спинка со сгибом - 1 дет.»; Burda's piece list «Futterteile:» then «A B 19 Vord…»);
//   2. prose naming numbers next to a fabric word («Futter für A nach den Teilen 19 bis 23»,
//      «детали 23–25», «GARNITURSTOFF · Teile 17 und 18 aus dem Rippen…»);
//   3. a heading that names no known cloth but opens a cutting list («Раскрой:», «Из шерстяного
//      сукна:») — that list is the MAIN cloth: a cutting list from a cloth that is none of the
//      secondary ones is the shell.
//
// Text items are first joined into LINES (same page, same baseline within half a glyph, split at a gap
// wider than one and a half glyphs — Burda prints four columns side by side). A list item or a
// reference with no cloth word of its own belongs to the nearest heading ABOVE it in its own column
// (left edges within 30 mm, ≤ 160 mm down); a piece-list header without a cloth, or four lines of
// prose in between, ends the heading's reach.

import type { IRText } from '../types';
import { type FabricKind, fabricKindsIn } from './lexicon';

export type TextLine = { page: string; text: string; y: number; x: number; fontMm: number };

/** One fabric's piece numbers as the instructions list them. */
export type CutList = {
  kind: FabricKind;
  /** The heading or prose line the list hangs off, as printed (≤ 80 chars). */
  label: string;
  /** Piece numbers as printed ("19", "7"). */
  pieces: string[];
  /** Fabric width the heading names ("140 cm"), when it does. */
  widthCm?: number;
  /** 'list' = numbered items under a heading · 'prose' = numbers named in a sentence. */
  how: 'list' | 'prose';
  /** The context came from rule 3 (a cutting list from an unnamed cloth = main). */
  implicitMain?: boolean;
};

/** Join text items into reading lines, per page, split at wide gaps (multi-column pages). */
export function linesOf(texts: readonly IRText[], pageOf: (t: IRText) => string): TextLine[] {
  const byPage = new Map<string, IRText[]>();
  for (const t of texts) {
    if (!t.text.trim()) continue;
    const rot = ((t.rotationDeg % 360) + 360) % 360;
    if (rot > 2 && rot < 358) continue; // rotated labels belong to pieces, not to the instructions
    const k = pageOf(t);
    byPage.set(k, [...(byPage.get(k) ?? []), t]);
  }
  const out: TextLine[] = [];
  for (const [page, ts] of byPage) {
    // y-up: reading order is top → bottom = descending y
    const sorted = [...ts].sort((a, b) => b.anchor.y - a.anchor.y || a.anchor.x - b.anchor.x);
    const rows: IRText[][] = [];
    for (const t of sorted) {
      const h = Math.max(0.5, t.fontSizeMm);
      const row = rows.find(
        (r) => Math.abs(r[0].anchor.y - t.anchor.y) <= 0.5 * Math.max(h, r[0].fontSizeMm),
      );
      if (row) row.push(t);
      else rows.push([t]);
    }
    // Column starts: a left edge many items share (≥ 6 on the page, 2 mm bins). Two columns set
    // with a narrow gutter join into one baseline row; a column start inside a row splits it.
    const bins = new Map<number, number>();
    for (const t of ts) {
      const b = Math.round(t.bbox.minX / 2);
      bins.set(b, (bins.get(b) ?? 0) + 1);
    }
    const starts = [...bins].filter(([, n]) => n >= 6).map(([b]) => b * 2);
    const atColumnStart = (x: number) => starts.some((c) => Math.abs(c - x) <= 1.5);
    for (const r of rows) {
      r.sort((a, b) => a.anchor.x - b.anchor.x);
      let cur: IRText[] = [];
      const flush = () => {
        if (!cur.length) return;
        out.push({
          page,
          text: cur
            .map((t) => t.text.trim())
            .join(' ')
            .replace(/\s+/g, ' '),
          y: cur[0].anchor.y,
          x: cur[0].anchor.x,
          fontMm: Math.max(...cur.map((t) => t.fontSizeMm)),
        });
        cur = [];
      };
      for (const t of r) {
        const prev = cur[cur.length - 1];
        const h = Math.max(1, t.fontSizeMm, prev?.fontSizeMm ?? 0);
        const gap = prev ? t.bbox.minX - prev.bbox.maxX : 0;
        if (prev && (gap > 1.5 * h || (gap > 0.8 * h && atColumnStart(t.bbox.minX)))) flush();
        cur.push(t);
      }
      flush();
    }
  }
  return out.sort((a, b) =>
    a.page === b.page ? b.y - a.y || a.x - b.x : a.page < b.page ? -1 : 1,
  );
}

// "1 - Спинка", "21 Полочка", "1. Обтачка", "A B 19 Vord…", "AB 9" (model letters first).
const ITEM =
  /^(?:[A-Z]{1,3}\s+)*(\d{1,2})(?:\s*[-–—.:)]\s*|\s+)(?!(?:cm|mm|см|мм|m|м|x|х|stk|шт)\b)(?=\p{L}{2,})/iu;
// numbers after a "pieces" word, with ranges and lists in the languages of the corpus
const PIECE_WORD =
  '(?:детал\\p{L}*|teil\\p{L}*|parts?|pieces?|pièces?|pieces|piezas?|pezz[io]|onderdel\\p{L}*|częś\\p{L}*|czes\\p{L}*|delar(?:na)?|dele(?:ne)?|osa(?:t)?|nr\\.?|№)';
const NUM = '\\d{1,2}';
const RANGE = `${NUM}(?:\\s*(?:[-–—]|bis|to|à|a|al|до|по|t/m|till|tot)\\s*${NUM})?`;
const JOIN = '(?:\\s*(?:,|;|und|and|et|y|e|и|en|och|og|i|oder|or|\\+|&)\\s*)';
const REF = new RegExp(`${PIECE_WORD}\\s*(${RANGE}(?:${JOIN}${RANGE})*)`, 'giu');
const LIST_HEADER =
  /(перечень|список детал|piece list|list of pieces|teileliste|schnittteile:|liste des pi|pattern pieces)/i;
const CUT_HEADER =
  /^(раскрой|crojenie|zuschnitt|zuschneiden|cutting|cut |découpe|corte|taglio|knippen)\b/i;
const FROM_HEADER = /^(из|aus|from|de|del|en|dalla|van|z|ze)\s+\p{L}[\p{L}\s-]*:\s*$/iu;
const WIDTH = /(\d{2,3})\s*(?:cm|см)\b/i;

function expand(spec: string): string[] {
  const out: string[] = [];
  for (const part of spec.split(new RegExp(JOIN, 'iu'))) {
    const m = new RegExp(
      `^(${NUM})\\s*(?:[-–—]|bis|to|à|a|al|до|по|t/m|till|tot)\\s*(${NUM})$`,
      'iu',
    ).exec(part.trim());
    if (m) {
      const a = +m[1];
      const b = +m[2];
      if (b >= a && b - a <= 30) for (let k = a; k <= b; k++) out.push(String(k));
    } else if (/^\d{1,2}$/.test(part.trim())) out.push(String(+part.trim()));
  }
  return out;
}

/** The fabric a reference at `at` belongs to: the nearest fabric word before it, else after it. */
function kindNear(line: string, at: number): FabricKind | null {
  const before = fabricKindsIn(line.slice(0, at));
  const k = before.length
    ? before[before.length - 1].kind
    : fabricKindsIn(line.slice(at))[0]?.kind ?? null;
  // «Garniturstoff: Rippenstrickstoff» — the contrast cloth IS rib knit: say the specific one
  if (k === 'contrast' && fabricKindsIn(line).some((h) => h.kind === 'rib')) return 'rib';
  return k;
}

type Role = 'item' | 'heading' | 'implicit' | 'breaker' | 'other';
type Classified = TextLine & {
  role: Role;
  item: string | null;
  kinds: FabricKind[];
  refs: { nums: string[]; at: number }[];
};

/** How far a heading reaches: same page, above, left edges within 30 mm, at most 160 mm down. */
const BAND_MM = 30;
const REACH_MM = 160;
/**
 * Four lines of prose (≥ 15 chars, no reference) between a heading and a line end its list: a
 * paragraph about something else (r4454: «Припуски на швы для деталей из подкладочной ткани:» + seven
 * lines, then the interlining list). A sentence that runs on over three lines (palto: «…деталь 22 …
 * детали 23–25») stays under its heading.
 */
const IDLE_LINES = 4;

/**
 * Read every cut list. A list item or a prose reference without a cloth word of its own belongs to
 * the nearest heading ABOVE it in its own column (left edges within 30 mm) — spatially, not in
 * reading order, because Burda's instruction page prints four columns that interleave in any order.
 * Lists of one kind and label are merged; numbers are kept as printed, without duplicates.
 */
export function readCutLists(lines: readonly TextLine[]): CutList[] {
  const out: CutList[] = [];
  const push = (l: CutList) => {
    if (!l.pieces.length) return;
    const same = out.find((o) => o.kind === l.kind && o.label === l.label && o.how === l.how);
    if (same) {
      for (const p of l.pieces) if (!same.pieces.includes(p)) same.pieces.push(p);
      return;
    }
    out.push({ ...l, pieces: [...new Set(l.pieces)] });
  };
  const cls: Classified[] = lines.map((l) => {
    const text = l.text.trim();
    const item = ITEM.exec(text);
    const kinds = fabricKindsIn(text).map((h) => h.kind);
    const refs = [...text.matchAll(REF)]
      .map((m) => ({ nums: expand(m[1]), at: m.index ?? 0 }))
      .filter((r) => r.nums.length);
    const role: Role = item
      ? 'item'
      : kinds.length
        ? 'heading'
        : CUT_HEADER.test(text) || FROM_HEADER.test(text)
          ? 'implicit'
          : LIST_HEADER.test(text)
            ? 'breaker'
            : 'other';
    return { ...l, text, role, item: item ? String(+item[1]) : null, kinds, refs };
  });
  const contextOf = (l: Classified): Classified | null => {
    let best: Classified | null = null;
    for (const h of cls) {
      if (h.page !== l.page || h === l) continue;
      if (h.role !== 'heading' && h.role !== 'implicit' && h.role !== 'breaker') continue;
      const dy = h.y - l.y;
      if (dy <= 0.1 || dy > REACH_MM || Math.abs(h.x - l.x) > BAND_MM) continue;
      if (!best || dy < best.y - l.y) best = h;
    }
    if (!best || best.role === 'breaker') return null;
    const between = cls.filter(
      (o) =>
        o.page === l.page &&
        o.role === 'other' &&
        !o.refs.length &&
        o.text.length >= 15 && // prose, not a model letter («A B») or a quantity («2х»)
        Math.abs(o.x - l.x) <= BAND_MM &&
        o.y < best!.y - 0.1 &&
        o.y > l.y + 0.1,
    ).length;
    return between >= IDLE_LINES ? null : best;
  };
  const kindOf = (h: Classified): FabricKind =>
    h.role === 'implicit'
      ? 'main'
      : h.kinds[0] === 'contrast' && h.kinds.includes('rib')
        ? 'rib'
        : h.kinds[0];
  const widthOf = (h: Classified | null) => {
    const w = h ? WIDTH.exec(h.text) : null;
    return w ? { widthCm: +w[1] } : {};
  };
  for (const l of cls) {
    // prose references: their own cloth word, else the heading's
    for (const r of l.refs) {
      const own = kindNear(l.text, r.at);
      const ctx = own ? null : contextOf(l);
      const kind = own ?? (ctx ? kindOf(ctx) : null);
      if (!kind) continue;
      push({
        kind,
        label: (own ? l.text : ctx!.text).slice(0, 80),
        pieces: r.nums,
        how: 'prose',
        ...widthOf(own ? l : ctx),
      });
    }
    if (l.role !== 'item' || !l.item) continue;
    // a list item; one that names its own cloth («19 Vorderteil Futter») says so itself
    if (l.kinds.length) {
      // only a short list line («19 Vorderteil Futter»): a numbered SEWING step that mentions a
      // cloth («6 ! Futtertasche auf den angesteppten…») says nothing about what is cut from it
      if (l.text.length <= 40)
        push({ kind: l.kinds[0], label: l.text.slice(0, 80), pieces: [l.item], how: 'list' });
      continue;
    }
    const ctx = contextOf(l);
    if (!ctx) continue;
    push({
      kind: kindOf(ctx),
      label: ctx.text.slice(0, 80),
      pieces: [l.item],
      how: 'list',
      ...widthOf(ctx),
      ...(ctx.role === 'implicit' ? { implicitMain: true } : {}),
    });
  }
  return out;
}

/** A piece number printed on its own («19», «7»): the number of the piece the text sits in. */
export function pieceNumberText(text: string): string | null {
  const m = /^\s*(\d{1,2})\s*$/.exec(text);
  return m ? String(+m[1]) : null;
}
