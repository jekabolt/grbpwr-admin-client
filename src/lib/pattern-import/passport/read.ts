// PASSPORT Ф1 — the deterministic reader: what the document says, read by OUR grammars only.
//
//   text       the cutting list's numbered lines with a count (semantics/fold.ts
//              `quantityListEntries`, the N3 grammar: only lines in a cutting section, no per-fabric
//              line, no number two lists disagree on) → expected pieces with their printed label and
//              count; the file-wide allowance sentence (semantics/allowance.ts); model labels.
//   structure  layer / group names that are an outline word (layer-words.ts); the file names.
//
// Nothing here builds geometry. The outline fact found at extraction is provisional: after pieces,
// `bindPassport` re-reads it from the layers of the exported pieces' OWN outline walls only — a word
// about some other line (an Illustrator "Seam line" group holding a hip line) says nothing about the
// outline. The text layer is data: no line of it is ever an instruction (Ф1 has no model to inject).

import type { SourceDoc } from '../types';
import { allowanceFromTexts } from '../semantics/allowance';
import { normFoldLine, quantityListEntries, type QtyListEntry } from '../semantics/fold';
import { saysFold } from '../ai/evidence';
import { variantLabels } from '../pieces/seeds';
import { layerOutlineWord } from './layer-words';
import {
  PASSPORT_READER_REV,
  type CutMode,
  type ExpectedPiece,
  type Fact,
  type GarmentPassport,
  type LayerWord,
  type OutlineMeaning,
  type SourceRef,
} from './types';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const PAIR_WORD = /(?<!\p{L})(?:pairs?|paar(?:ig)?|пар[аы]?|par|paire?s?|paio|pareja)(?!\p{L})/iu;
/** The list line's number and its punctuation, as LIST_HEAD (semantics/fold.ts) reads it. */
const LEAD =
  /^\s*(?:[•·*\-–]\s*)?(?:(?:piece|pc\.?|teil|деталь|дет\.?|det\.?|№|no\.?|nr\.?)\s*)?\(?[\p{L}\p{N}]{1,4}\)?\s*[.\-–:)]?\s*/iu;
/** A segment of a list line that is only the count / cut vocabulary ("1 gang mod fold", "2 дет."). */
const COUNT_ONLY =
  /^(?:\d+\s*[xх×]?|[xх×]\s*\d+|cut|cutting|gang|gange|mal|раз|шт\.?|дет\.?|деталь|детали|деталей|pair|pairs|paar|пар[аы]?|on|the|fold|mod|im|bruch|stoffbruch|со|по|сгибом|сгибу|au|pli|[\s.,:;])+$/iu;

/** sha256 over the sorted sha256 hex of the files (PASSPORT.md §1 `sourceDigest`). */
export async function passportSourceDigest(sha256s: readonly string[]): Promise<string> {
  const text = [...sha256s]
    .map((s) => s.toLowerCase())
    .sort()
    .join('\n');
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return '';
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type TextSrc = { file: number; page: number; text: string };

/** The piece name as printed: the list line without its number and its count. */
export function listName(text: string): string {
  const rest = text.replace(LEAD, '');
  const segs = rest
    .split(/\s*[,;]\s*|\s+[-–—]\s+/u)
    .map((s) => s.trim())
    .filter((s) => /\p{L}/u.test(s) && !COUNT_ONLY.test(s));
  const name = (segs[0] ?? rest)
    .replace(/\s+\d+\s*(?:[xх×]|gange?|mal|раз|шт\.?|дет\.?).*$/iu, '')
    .trim();
  return clip(name || rest.trim(), 60);
}

function cutMode(e: QtyListEntry): CutMode {
  if (saysFold(e.text)) return 'fold';
  if (PAIR_WORD.test(e.text)) return 'pair';
  return e.qty === 1 ? 'single' : 'count';
}

/** Where a list line was printed: the first text item that is it, or that it starts with. */
function refOf(e: QtyListEntry, src: readonly TextSrc[]): SourceRef {
  const t = normFoldLine(e.text);
  const hit =
    src.find((s) => normFoldLine(s.text) === t) ??
    src.find((s) => {
      const x = normFoldLine(s.text);
      return x.length >= 3 && (t.startsWith(x) || t.endsWith(x) || x.includes(t));
    });
  return { file: hit?.file ?? 0, page: hit?.page ?? null, quote: clip(e.text, 160), quoted: true };
}

function closedLoops(doc: SourceDoc): Map<string, number> {
  const n = new Map<string, number>();
  for (const p of doc.pages) {
    const layerOf = new Map(p.styles.map((s) => [s.id, s.layer]));
    for (const l of p.layers) if (!n.has(l)) n.set(l, 0);
    for (const path of p.paths) {
      const l = layerOf.get(path.style);
      if (!l) continue;
      if (!n.has(l)) n.set(l, 0);
      const a = path.pts[0];
      const b = path.pts[path.pts.length - 1];
      const closed =
        path.pts.length > 2 &&
        (path.closed || (!!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) < 0.5));
      if (closed) n.set(l, n.get(l)! + 1);
    }
  }
  return n;
}

/** The outline fact from layer words that hold closed loops (provisional, extraction). */
export function outlineFromWords(words: readonly LayerWord[]): Fact<OutlineMeaning> | null {
  const holding = words.filter((w) => w.loops > 0);
  if (!holding.length) return null;
  const kinds = [...new Set(holding.map((w) => w.word))];
  const refs = holding.map(
    (w): SourceRef => ({ file: w.file, page: null, quote: clip(w.layer, 160) }),
  );
  const said = holding.map((w) => `«${clip(w.layer, 40)}» (${w.loops} closed)`).join(', ');
  if (kinds.length > 1)
    return {
      value: holding[0].word,
      refs,
      classes: ['structure'],
      confidence: 0.3,
      status: 'conflict',
      note: `layers disagree: ${said}`,
    };
  return {
    value: kinds[0],
    refs,
    classes: ['structure'],
    confidence: 0.5,
    status: 'read',
    note: `provisional — layer ${said}; bound to the pieces' own outlines after pieces`,
  };
}

/**
 * The passport of the files as read (no card, no pieces yet). Never throws on a reader miss: an
 * empty fact is null.
 */
export function readPassport(
  docs: readonly SourceDoc[],
  opts: { sourceDigest: string; at?: string },
): GarmentPassport {
  const src: TextSrc[] = docs.flatMap((d, fi) =>
    d.pages.flatMap((p) =>
      p.texts.filter((t) => !t.background).map((t) => ({ file: fi, page: p.page, text: t.text })),
    ),
  );
  const texts = src.map((s) => s.text);

  // structure: the outline words of layer / group names (SVG, DXF — the formats whose layers are
  // the author's own; a PDF's OCGs are print layers, a raster has none)
  const layerWords: LayerWord[] = [];
  docs.forEach((d, fi) => {
    if (d.file.kind !== 'svg' && d.file.kind !== 'dxf') return;
    for (const [layer, loops] of closedLoops(d)) {
      const word = layerOutlineWord(layer);
      if (word) layerWords.push({ file: fi, layer: clip(layer, 80), word, loops });
    }
  });

  // text: the cutting list (N3 grammar) — section lines only, never a disputed number
  const entries = quantityListEntries(texts).filter((e) => e.section && !e.conflict);
  const conflicts = quantityListEntries(texts)
    .filter((e) => e.conflict)
    .map((e) => clip([e.text, ...(e.conflict ?? [])].map((x) => `«${x}»`).join(' vs '), 240));
  const pieces: ExpectedPiece[] = entries.map((e, k) => {
    const ref = refOf(e, src);
    return {
      key: `e${k + 1}`,
      label: { value: e.no, refs: [ref], classes: ['text'], confidence: 0.9, status: 'read' },
      name: {
        value: listName(e.text),
        refs: [ref],
        classes: ['text'],
        confidence: 0.7,
        status: 'read',
      },
      nameEn: null,
      role: null,
      qty: {
        value: { n: e.qty, mode: cutMode(e), text: clip(e.text, 160) },
        refs: [ref],
        classes: ['text'],
        confidence: 0.8,
        status: 'read',
      },
      cloth: null,
      fused: null,
      drawn: null,
      models: null,
      sheet: null,
      allowance: null,
    };
  });

  // text: the file-wide allowance sentence
  const al = allowanceFromTexts(texts);
  const quote = al.decision?.evidence[0]?.replace(/^text: «|»$/g, '') ?? null;
  const allowance: GarmentPassport['allowance'] = al.decision
    ? {
        value: {
          included: al.decision.meaning === 'cut',
          mm: al.decision.evidence.some((e) => /no amount printed/.test(e))
            ? null
            : al.decision.allowanceMm,
          hemMm: null,
        },
        refs: quote ? [{ file: 0, page: null, quote: clip(quote, 160), quoted: true }] : [],
        classes: ['text'],
        confidence: al.conflicts.length ? 0.4 : 0.8,
        status: al.conflicts.length ? 'conflict' : 'read',
        ...(al.conflicts.length ? { note: al.conflicts[0] } : {}),
      }
    : null;

  const models = variantLabels(texts);
  const listPages = new Map<string, { file: number; page: number }>();
  for (const p of pieces)
    for (const r of p.qty?.refs ?? [])
      if (r.page != null) listPages.set(`${r.file}:${r.page}`, { file: r.file, page: r.page });

  return {
    v: 1,
    sourceDigest: opts.sourceDigest,
    readers: [{ kind: 'det', rev: PASSPORT_READER_REV, at: opts.at ?? new Date().toISOString() }],
    garment: {
      category: null,
      title: docs[0]
        ? {
            value: clip(docs[0].file.name.replace(/\.[^.]+$/, ''), 80),
            refs: [{ file: 0, page: null, quote: clip(docs[0].file.name, 160) }],
            classes: ['structure'],
            confidence: 0.3,
            status: 'read',
            note: 'the file name',
          }
        : null,
      models: models.length
        ? {
            value: models,
            refs: [],
            classes: ['text'],
            confidence: 0.7,
            status: 'read',
          }
        : null,
      patternNo: null,
    },
    sizes: null,
    allowance,
    outline: outlineFromWords(layerWords),
    layerWords,
    pieces,
    listComplete: null,
    pages: [...listPages.values()].map((p) => ({ ...p, holds: ['piece-list' as const] })),
    watermarks: [],
    legend: {},
    steps: [],
    conflicts,
  };
}

// ── after pieces ─────────────────────────────────────────────────────────────────────────────

export type BindPiece = {
  seed: number;
  /** Exported identities of the piece ("P02", "P03_L" …); empty = not exported. */
  identities: string[];
  /** The layer of every wall chain of the piece's outline (every size drawn); null = no layer. */
  wallLayers: (string | null)[];
  /** The printed label the piece was seeded from (a text seed), if any. */
  label: string | null;
};

const normNo = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.,:;()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * (c) The outline, from the exported pieces' OWN outline walls: every wall of every exported piece
 * lies on a layer whose whole name is one outline word → that word (status 'read', class
 * 'structure'); cut on some and seam on others (or both on one piece) → 'conflict'; any exported
 * piece with a wall on a layer that says nothing → null (the question stays).
 */
export function outlineOfPieces(
  pieces: readonly BindPiece[],
  words: readonly LayerWord[],
): Fact<OutlineMeaning> | null {
  const exported = pieces.filter((p) => p.identities.length);
  if (!exported.length) return null;
  // Codex P1 #1: only a layer the READER took as a word — an SVG / DXF layer of the files — counts;
  // a PDF's OCG ("Cut lines" as a print layer) or a name of another format says nothing here
  const known = new Map(words.map((w) => [w.layer, w.word] as const));
  const seen = new Map<string, 'cut' | 'seam'>();
  let silent = false;
  const kinds = new Set<'cut' | 'seam'>();
  for (const p of exported) {
    if (!p.wallLayers.length) {
      silent = true;
      continue;
    }
    for (const l of p.wallLayers) {
      const w = l ? known.get(clip(l, 80)) ?? null : null;
      if (!w) {
        silent = true;
        continue;
      }
      kinds.add(w);
      seen.set(l!, w);
    }
  }
  if (!kinds.size) return null;
  const refs = [...seen.keys()].map((layer): SourceRef => {
    const lw = words.find((w) => w.layer === clip(layer, 80));
    return { file: lw?.file ?? 0, page: null, quote: clip(layer, 160) };
  });
  const names = [...seen].map(([l, w]) => `«${clip(l, 40)}» = ${w} line`).join(', ');
  if (kinds.size > 1)
    return {
      value: 'cut',
      refs,
      classes: ['structure'],
      confidence: 0.3,
      status: 'conflict',
      note: `the outline walls lie on layers that disagree: ${names}`,
    };
  if (silent) return null;
  const value = [...kinds][0];
  return {
    value,
    refs,
    classes: ['structure'],
    confidence: 0.6,
    status: 'read',
    note: `every outline wall of the ${exported.length} exported ${exported.length === 1 ? 'piece' : 'pieces'} lies on layer ${names} — the file's own word`,
  };
}

/**
 * The passport after pieces: the outline re-read from the pieces' own walls, the expected list bound
 * to the pieces by the printed label (the number printed twice: in the list and on the piece), and
 * what is missing / extra. A binding is 'text' (the list) + 'geometry' (the label on the piece).
 */
export function bindPassport(p: GarmentPassport, pieces: readonly BindPiece[]): GarmentPassport {
  const outline = outlineOfPieces(pieces, p.layerWords);
  const byLabel = new Map<string, BindPiece[]>();
  for (const x of pieces) {
    if (!x.label) continue;
    const k = normNo(x.label);
    byLabel.set(k, [...(byLabel.get(k) ?? []), x]);
  }
  const bound = new Set<number>();
  const expected = p.pieces.map((e): ExpectedPiece => {
    const { binding: _drop, ...rest } = e;
    void _drop;
    const hit = e.label ? byLabel.get(normNo(e.label.value)) : undefined;
    if (!hit || hit.length !== 1) return rest;
    bound.add(hit[0].seed);
    return {
      ...rest,
      binding: {
        seed: hit[0].seed,
        ...(hit[0].identities[0] ? { identity: hit[0].identities[0] } : {}),
        by: 'label',
        classes: ['text', 'geometry'],
      },
    };
  });
  const listed = expected.length > 0;
  return {
    ...p,
    outline,
    pieces: expected,
    missing: listed ? expected.filter((e) => !e.binding).map((e) => e.key) : [],
    extra: listed
      ? pieces.filter((x) => x.identities.length && !bound.has(x.seed)).map((x) => x.identities[0])
      : [],
  };
}
