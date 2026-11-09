// buildDraft — the write stage's per-scope files + the card as the wizard read it → ONE CardDraft
// (08-CONTRACT §4.3). Pure and main-thread safe (types + string ops; the manifest IS the input).
//
// What it decides, and the rules:
//   · FILES: one per scope, named `<style>-<purpose>-<fingerprint>.dxf`. The fingerprint hashes the
//     bare DXF (manifest comments and the creation time removed), so the same import produces the
//     same name and a re-apply finds its file already on the card (`alreadyOnCard`: no upload, no
//     row — re-applying changes nothing). A changed import gets a new name → a new row = the card's
//     own "revision" (two files in one scope count max, not sum: K1).
//   · CARD PIECES: every (scope, identity) of the files is bound on its own, strongest proof first
//     (re-import, owner 09.11: «чтобы мы могли всё загрузить и ничего не отвалилось»):
//       1. a link this card already has in the scope (the block's spelling, its identity or the
//          source name) — never to a piece of the opposite hand (SLV_L is not SLV_R);
//       2. a card piece of the same name (case-free);
//       3. the same name tokens in any order, `UNI` dropped (FLP_MAIN_L_UNI → FLP_L_MAIN);
//       4. one hand of a pair → the card's hand-less pair piece of that part (FP_L + FP_R → FP ×2);
//       5. the same outline as one card piece's current block of this scope, size by size (area
//          and both sides of the box, same hand) — a block the importer renamed (P_L_MAIN → FP_L);
//       6. still nothing, while a card piece of this scope and hand loses its blocks in this
//          re-import and the outline does not rule it out → UNRESOLVED: no piece, no link; the
//          piece goes to `vanished` and the operator maps the block in "↔ cut pieces".
//     The rest is new: a pair collapses into one card name (`FP_L` + `FP_R` → `FP`, ×2, the name
//     the piece-match modal derives, parse-files.ts `cardName`) unless the card keeps that part
//     per hand. A lining file's identities are `LIN_…` (scope.ts) → separate `LIN_…` pieces;
//     interlining and the other cloths keep the identity → the SAME piece, aliased in each scope.
//     × per garment = per scope the sum over its identities (both hands count 1), across scopes the
//     max (the fused collar is the collar, not a second one). One piece takes two blocks of one
//     file only through the card's own links or as both hands of a hand-less pair piece.
//   · SYMMETRY: a new piece is IDENTICAL (D1'). An existing piece follows the modal's one rule
//     (`importedCutSymmetry`): IDENTICAL only on the manifest's proof (pair / unfolded fold), when
//     unmarked, or when the new count makes its MIRRORED impossible — an explicit MIRRORED/FOLD is
//     kept otherwise (F14 MAJOR 2). A rewrite is a point write with the reason, never a root rewrite.
//   · FUSED: any interlining copy (file or `fused` flag) → `fused` + fusing mode FULL on a new piece;
//     an existing piece's own fusing mode is kept.
//   · RE-IMPORT (MF-C, M4): a scope that already holds any sheet gets `replaces` = that row: the new
//     file takes its place instead of becoming a second active row. An importer manifest improves the
//     match (source digest, file name, newest conversion), but is not required. `vanished` (review
//     only) lists the links an old importer manifest drew and the new file does not, and the links
//     of a card piece this scope's current sheet draws (the card's parse) that no block binds now.
//   · ALIASES: per scope per identity, `blockName` = the identity as the card's splitter keys it (the
//     manifest identity; an ungraded `_UNI` block keeps its raw name — split-pieces.ts does the same).

import type {
  CardDraft,
  ConversionManifest,
  DraftAlias,
  DraftPiece,
  DraftPieceUpdate,
  DraftReplaceTarget,
  DraftScope,
  DraftShapeRef,
  DraftUnresolved,
  DraftVanished,
  ManifestBlock,
  ManifestPiece,
} from '../types';
import { MANIFEST_TAG } from '../types';
import { isInterliningScope, purposeWord } from './scope';
import {
  FOLD_CUT_SYMMETRY,
  importedCutSymmetry,
} from 'components/managers/tech-card/components/piece-codes';

export const IDENTICAL = 'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL';
export const FUSING_FULL = 'TECH_CARD_PIECE_FUSING_MODE_FULL';
export const FUSING_UNKNOWN = 'TECH_CARD_PIECE_FUSING_MODE_UNKNOWN';

/** The card as the draft needs it — `CardContext` (wizard) satisfies it structurally. */
export type DraftCardContext = {
  techCardId: number;
  existingPieces: {
    lineKey: string;
    name: string;
    cutSymmetry?: string;
    piecesPerGarment?: number;
    fused?: boolean;
    fusingMode?: string;
  }[];
  /** Live block → piece links, scope = `fabricScopeKey(purpose, line)`. */
  existingAliases?: { scopeKey: string; blockName: string; pieceLineKey: string }[];
  /**
   * Live pattern rows, scope as above. Every row is an occupant; `manifest` only adds source facts.
   */
  existingPatterns?: {
    scopeKey: string;
    filename: string;
    url: string;
    lineKey?: string;
    name?: string;
    manifest?: ConversionManifest | null;
  }[];
  /**
   * Each card piece's current outline per scope and size (the card's parse of its sheets). Only
   * re-import reads it: a block the importer renamed binds to the piece of the same outline.
   */
  existingShapes?: DraftShapeRef[];
  styleLabel: string;
};

/** block-code.ts `normBlock` (lib may not import components/): trim, collapse inner whitespace. */
export const normBlock = (s: string) => s.trim().replace(/\s+/g, ' ');
/** The alias identity key the card's UNIQUE(card, scope, block) collapses on (piece-match-modal). */
export const aliasKey = (scopeKey: string, block: string) =>
  `${scopeKey}|${normBlock(block).toLowerCase()}`;

/** The card piece name a manifest piece binds to — parse-files.ts `cardName`, same rule. */
export function cardNameOf(
  p: Pick<ManifestPiece, 'identity' | 'code' | 'mods' | 'pairHand'>,
): string {
  const hand = p.pairHand;
  if (!hand) return p.identity.trim();
  const mods = p.mods.filter((x) => x.toUpperCase() !== hand);
  return [p.code, ...mods].filter(Boolean).join('_') || p.identity.trim();
}

/** The DXF without the manifest comment block and without its creation time (ISO and R12 header). */
export function bareOf(dxfText: string, createdAt: string): string {
  const lines = dxfText.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '999' && (lines[i + 1] ?? '').startsWith(MANIFEST_TAG)) {
      i++;
      continue;
    }
    out.push(lines[i]);
  }
  // the R12 (AAMA) header prints the creation time again, as «Creation Date: dd-mm-yyyy» / «… Time:»
  // (upper case in files written before W3 — either spelling)
  const text = out.map((l) => l.replace(/^(CREATION (?:DATE|TIME):).*$/i, '$1')).join('\n');
  return createdAt ? text.split(createdAt).join('') : text;
}

/** cyrb53 → 8 hex chars. Not cryptographic: it only has to tell two imports apart. */
export function fingerprint(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
  ).slice(0, 8);
}

const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);

/** File and row name of one scope's DXF. */
export function scopeFileName(
  scope: Pick<DraftScope, 'target' | 'dxfText' | 'manifest'>,
  styleLabel: string,
) {
  const src = (scope.manifest.source?.files?.[0]?.name ?? '').replace(/\.[^.]+$/, '');
  const base = slug(styleLabel) || slug(src) || 'pattern';
  const word = purposeWord(scope.target);
  const fp = fingerprint(bareOf(scope.dxfText, scope.manifest.createdAt));
  return {
    filename: `${base}-${word}-${fp}.dxf`,
    name: `${styleLabel.trim() || src || 'pattern'} · ${word} · import`,
  };
}

/** Alias spelling of each identity in one file: the identity, or the raw `_UNI` block. */
export function aliasNames(m: ConversionManifest): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of m.blocks) {
    if (out.has(b.identity)) continue;
    out.set(b.identity, b.sizeToken.toUpperCase() === 'UNI' ? b.block : b.identity);
  }
  for (const p of m.pieces) if (!out.has(p.identity)) out.set(p.identity, p.identity);
  return out;
}

type Hand = 'L' | 'R';
const HAND_TOKENS: Record<string, Hand> = { L: 'L', R: 'R', LEFT: 'L', RIGHT: 'R' };
/** `UNI` marks an ungraded block (block-code.ts), not another piece: FLP_L_UNI is FLP_L. */
const NOISE_TOKENS = new Set(['UNI']);

/** A name as its tokens: upper case, split on anything not a letter or a digit, `UNI` dropped. */
export function nameTokens(s: string): string[] {
  return normBlock(s)
    .toUpperCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t && !NOISE_TOKENS.has(t));
}
/** Order-free key of a name: FLP_MAIN_L_UNI and FLP_L_MAIN are one key. */
export const tokenKey = (s: string) => nameTokens(s).sort().join(' ');
/** The key without the hand — the part both hands of a pair share (FP_L, FP_R → FP). */
const partKey = (s: string) =>
  nameTokens(s)
    .filter((t) => !HAND_TOKENS[t])
    .sort()
    .join(' ');
/** The one hand a name carries (an L / R / LEFT / RIGHT token), else null. */
export function handOf(s: string): Hand | null {
  const hands = new Set(nameTokens(s).flatMap((t) => (HAND_TOKENS[t] ? [HAND_TOKENS[t]] : [])));
  return hands.size === 1 ? [...hands][0] : null;
}
const handsMeet = (a: Hand | null, b: Hand | null) => !a || !b || a === b;

/**
 * Geometry step of a re-import: the largest relative difference of the area and of the two box
 * sides, over the sizes both outlines carry. The same piece re-exported differs by ≤ 0.05 % (card
 * 6: the CLO sheet against our R12 of the same source, every size); another piece of the same hand
 * by tens of percent. ≤ SHAPE_SAME binds; > SHAPE_OTHER rules a candidate out; between the two the
 * piece may have been redrawn, and the operator decides.
 */
export const SHAPE_SAME = 0.01;
export const SHAPE_OTHER = 0.1;

type Outline = { areaMm2: number; wMm: number; hMm: number };
const rel = (a: number, b: number) => {
  const m = Math.max(Math.abs(a), Math.abs(b));
  return m > 0 ? Math.abs(a - b) / m : 0;
};
function outlineCost(a: Outline, b: Outline): number {
  const [a1, a2] = [a.wMm, a.hMm].sort((x, y) => x - y);
  const [b1, b2] = [b.wMm, b.hMm].sort((x, y) => x - y);
  return Math.max(rel(a.areaMm2, b.areaMm2), rel(a1, b1), rel(a2, b2));
}
/** block-code.ts `bareToken` (lib may not import components/): the size key of `DraftShapeRef`. */
const sizeKey = (t: string) => t.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

/**
 * One identity's blocks against one card piece's current outline, size by size. An ungraded block
 * (UNI) or a sizeless reference is one outline for every size. null = nothing to compare.
 */
export function shapeCost(
  blocks: readonly Pick<ManifestBlock, 'sizeToken' | 'bboxMm' | 'areaMm2'>[],
  ref: DraftShapeRef['sizes'],
): number | null {
  const mine = new Map<string, Outline>();
  for (const b of blocks) {
    const [x0, y0, x1, y1] = b.bboxMm;
    if (!(b.areaMm2 > 0)) continue;
    mine.set(sizeKey(b.sizeToken), {
      areaMm2: b.areaMm2,
      wMm: Math.abs(x1 - x0),
      hMm: Math.abs(y1 - y0),
    });
  }
  const theirs = Object.entries(ref).filter(([, o]) => o.areaMm2 > 0);
  if (!mine.size || !theirs.length) return null;
  const common = theirs.filter(([k]) => mine.has(k));
  if (common.length) return Math.max(...common.map(([k, o]) => outlineCost(mine.get(k)!, o)));
  if (mine.size === 1 || theirs.length === 1)
    return Math.min(...[...mine.values()].flatMap((m) => theirs.map(([, o]) => outlineCost(m, o))));
  return null;
}

/** One identity of one scope's file and what it binds to. */
type Slot = {
  scope: DraftScope;
  scopeKey: string;
  mp: ManifestPiece;
  /** The block as the card keys it (`aliasNames`). */
  spelling: string;
  /** What the card may already call it: the spelling, the identity, the source's own name. */
  names: string[];
  hand: Hand | null;
  part: string;
  blocks: ManifestBlock[];
  interlining: boolean;
  bind?: { lineKey: string; basis: 'alias' | 'name' | 'shape' };
  /** Candidate card pieces, best first: bound to none of them, no new piece. */
  unresolved?: string[];
  pick?: string;
};

type Group = {
  existingLineKey: string | null;
  name: string;
  basis: DraftPiece['basis'];
  byScope: Map<string, Slot[]>;
  fused: boolean;
  ungraded: boolean;
  pair: boolean;
  unfolded: boolean;
  /** L13: a half on fold (the manifest) — the card cuts it on the fold. */
  half: boolean;
};

const BASIS_RANK: Record<string, number> = { alias: 0, name: 1, shape: 2, new: 3 };
const lc = (s: string) => normBlock(s).toLowerCase();
const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
};

export function buildDraft(
  write: { scopes: DraftScope[] },
  card: DraftCardContext,
  opts: { mintKey?: () => string } = {},
): CardDraft {
  const mint = opts.mintKey ?? mintLineKey;
  const scopes: DraftScope[] = write.scopes.map((sc) => {
    const { filename, name } = scopeFileName(sc, card.styleLabel);
    const onCard = (card.existingPatterns ?? []).find(
      (p) => p.scopeKey === sc.target.scopeKey && p.filename === filename,
    );
    const replaces = onCard ? null : replaceTargetOf(sc, card);
    return {
      ...sc,
      filename,
      name: sc.name || name,
      alreadyOnCard: onCard ? { url: onCard.url, filename: onCard.filename } : null,
      replaces,
      vanished: replaces ? vanishedOf(sc, replaces, card) : [],
      readsBack: readsBack(sc.manifest),
    };
  });

  const slots: Slot[] = [];
  for (const sc of scopes) {
    const names = aliasNames(sc.manifest);
    const interlining = isInterliningScope(sc.target);
    for (const mp of sc.manifest.pieces) {
      const spelling = names.get(mp.identity) ?? mp.identity;
      const source =
        mp.nameOrigin === 'text' || mp.nameOrigin === 'operator' ? mp.displayName ?? '' : '';
      slots.push({
        scope: sc,
        scopeKey: sc.target.scopeKey,
        mp,
        spelling,
        names: [...new Set([spelling, mp.identity, source].map(normBlock).filter(Boolean))],
        hand: mp.pairHand ?? handOf(mp.identity),
        part: partKey(mp.identity),
        blocks: sc.manifest.blocks.filter((b) => b.identity === mp.identity),
        interlining,
      });
    }
  }

  // ── the card as read: live pieces, their links per scope, their current outlines ──
  const live = card.existingPieces.filter((p) => p.lineKey.trim() && p.name.trim());
  const byKey = new Map(live.map((p) => [p.lineKey, p]));
  const keyOf = new Map(live.map((p) => [p.lineKey.trim().toLowerCase(), p.lineKey]));
  const liveKey = (k: string) => keyOf.get(k.trim().toLowerCase());
  const pieceHand = (k: string) => handOf(byKey.get(k)?.name ?? '');
  const aliasOwner = new Map<string, string>();
  const linksOf = new Map<string, { blockName: string; lineKey: string }[]>();
  for (const a of card.existingAliases ?? []) {
    const k = liveKey(a.pieceLineKey);
    if (!k) continue;
    aliasOwner.set(aliasKey(a.scopeKey, a.blockName), k);
    push(linksOf, a.scopeKey, { blockName: a.blockName, lineKey: k });
  }
  const byName = new Map<string, string>();
  for (const p of live) if (!byName.has(lc(p.name))) byName.set(lc(p.name), p.lineKey);
  const shapes = (card.existingShapes ?? []).flatMap((r) => {
    const k = liveKey(r.pieceLineKey);
    return k ? [{ ...r, pieceLineKey: k }] : [];
  });
  // A re-import replaces ONE sheet of its scope: the outlines and the links of the scope's other
  // sheets are neither its candidates nor pieces it leaves without a block. An outline of no known
  // sheet counts for any.
  const drawsOf = (m?: ConversionManifest | null): Set<string> | null =>
    m && Array.isArray(m.blocks) && Array.isArray(m.pieces)
      ? new Set([...aliasNames(m).values(), ...m.pieces.map((p) => p.identity)].map(lc))
      : null;
  const sheetOf = new Map<
    string,
    { url: string; draws: Set<string> | null; siblingDraws: Set<string>; siblings: number }
  >();
  for (const sc of scopes) {
    const url = sc.replaces?.url;
    if (!url) continue;
    const others = (card.existingPatterns ?? []).filter(
      (p) => p.scopeKey === sc.target.scopeKey && !!p.url && p.url !== url,
    );
    sheetOf.set(sc.target.scopeKey, {
      url,
      draws: drawsOf(
        (card.existingPatterns ?? []).find(
          (p) => p.scopeKey === sc.target.scopeKey && p.url === url,
        )?.manifest,
      ),
      siblingDraws: new Set(others.flatMap((p) => [...(drawsOf(p.manifest) ?? [])])),
      siblings: others.length,
    });
  }
  const rowShapes = shapes.filter((r) => {
    const sheet = sheetOf.get(r.scopeKey);
    return !sheet || !r.url || r.url === sheet.url;
  });
  /** A link that may be the replaced sheet's: the scope's only sheet, or no proof of another. */
  const linkOnSheet = (scopeKey: string, l: { blockName: string; lineKey: string }) => {
    const sheet = sheetOf.get(scopeKey);
    if (!sheet || !sheet.siblings) return true;
    const b = lc(l.blockName);
    const outlinedOn = (own: boolean) =>
      shapes.some(
        (r) =>
          r.scopeKey === scopeKey &&
          r.pieceLineKey === l.lineKey &&
          !!r.url &&
          (r.url === sheet.url) === own,
      );
    if (sheet.draws?.has(b) || outlinedOn(true)) return true;
    return !sheet.siblingDraws.has(b) && !outlinedOn(false);
  };

  // ── binding: every (scope, identity) on its own, each proof over all slots before the next ──
  const held = new Map<string, Slot[]>(); // `${scopeKey}|${lineKey}` → slots bound to it
  const heldKey = (scopeKey: string, k: string) => `${scopeKey}|${k}`;
  // a second block of one file takes a piece only as the other hand of its hand-less pair piece
  const free = (s: Slot, k: string) => {
    const on = held.get(heldKey(s.scopeKey, k)) ?? [];
    return (
      on.length === 0 ||
      (!pieceHand(k) &&
        !!s.hand &&
        on.every((o) => !!o.hand && o.hand !== s.hand && o.part === s.part))
    );
  };
  const bind = (s: Slot, k: string, basis: 'alias' | 'name' | 'shape') => {
    s.bind = { lineKey: k, basis };
    push(held, heldKey(s.scopeKey, k), s);
  };
  const open = () => slots.filter((s) => !s.bind && !s.unresolved);

  // 1. the card's own link of this block in this scope. Not followed across hands only when it
  //    provably swapped: both names carry a hand, the hands differ, and the card holds a piece of
  //    the block's own hand to take instead — an L / R in a name alone proves no hand (R = rear)
  const swapped = (s: Slot, owner: string) => {
    const h = pieceHand(owner);
    if (!s.hand || !h || h === s.hand) return false;
    const parts = new Set([s.part, partKey(byKey.get(owner)?.name ?? '')].filter(Boolean));
    const keys = new Set(s.names.map(tokenKey).filter(Boolean));
    return live.some(
      (p) =>
        p.lineKey !== owner &&
        handOf(p.name) === s.hand &&
        (parts.has(partKey(p.name)) || keys.has(tokenKey(p.name))),
    );
  };
  for (const s of slots)
    for (const n of s.names) {
      const owner = aliasOwner.get(aliasKey(s.scopeKey, n));
      if (owner && !swapped(s, owner)) {
        bind(s, owner, 'alias');
        break;
      }
    }
  // 2. a card piece of the same name
  for (const s of open())
    for (const n of s.names) {
      const k = byName.get(lc(n));
      if (k && handsMeet(s.hand, pieceHand(k)) && free(s, k)) {
        bind(s, k, 'name');
        break;
      }
    }
  // 3. the same tokens in any order (a piece name, or a link of this scope)
  const byTokens = new Map<string, string[]>();
  for (const p of live) push(byTokens, tokenKey(p.name), p.lineKey);
  for (const s of open()) {
    const keys = new Set(s.names.map(tokenKey).filter(Boolean));
    const hits = new Set([...keys].flatMap((key) => byTokens.get(key) ?? []));
    for (const l of linksOf.get(s.scopeKey) ?? [])
      if (keys.has(tokenKey(l.blockName))) hits.add(l.lineKey);
    const fit = [...hits].filter((k) => handsMeet(s.hand, pieceHand(k)));
    if (fit.length === 1 && free(s, fit[0])) bind(s, fit[0], 'name');
  }
  // 4. one hand of a pair → the card's hand-less pair piece of that part
  const pairPieces = new Map<string, string[]>();
  for (const p of live) if (!handOf(p.name)) push(pairPieces, tokenKey(p.name), p.lineKey);
  for (const s of open()) {
    if (!s.hand) continue;
    const fit = [...new Set(s.names.flatMap((n) => pairPieces.get(partKey(n)) ?? []))];
    if (fit.length === 1 && free(s, fit[0])) bind(s, fit[0], 'name');
  }
  // 5. the same outline as one card piece's current block of this sheet (same hand)
  const costOf = (s: Slot, k: string): number | null => {
    const costs = rowShapes
      .filter(
        (r) =>
          r.scopeKey === s.scopeKey &&
          r.pieceLineKey === k &&
          handsMeet(s.hand, handOf(r.identity)),
      )
      .map((r) => shapeCost(s.blocks, r.sizes))
      .filter((c): c is number => c != null);
    return costs.length ? Math.min(...costs) : null;
  };
  const tentative = new Map<string, Slot[]>();
  for (const s of open()) {
    const pool = [
      ...new Set(rowShapes.filter((r) => r.scopeKey === s.scopeKey).map((r) => r.pieceLineKey)),
    ].filter((k) => handsMeet(s.hand, pieceHand(k)) && free(s, k));
    const near = pool
      .map((k) => ({ k, c: costOf(s, k) }))
      .filter((x): x is { k: string; c: number } => x.c != null && x.c <= SHAPE_SAME)
      .sort((a, b) => a.c - b.c);
    if (near.length === 1) {
      s.pick = near[0].k;
      push(tentative, heldKey(s.scopeKey, near[0].k), s);
    } else if (near.length > 1) s.unresolved = near.map((x) => x.k);
  }
  for (const ss of tentative.values()) {
    const k = ss[0].pick!;
    // two blocks with one outline: only both hands of a hand-less pair piece share it
    const pair =
      ss.length === 1 ||
      (!pieceHand(k) &&
        ss.every((s) => !!s.hand && s.part === ss[0].part) &&
        new Set(ss.map((s) => s.hand)).size === ss.length);
    for (const s of ss) {
      if (pair && free(s, k)) bind(s, k, 'shape');
      else s.unresolved = [k];
    }
  }
  // 6. a card piece this re-import leaves without a block (a link or a current outline in the
  //    replaced sheet, no block bound to it) may be any open block of its hand: unresolved, unless
  //    the outline rules every such piece out
  const present = new Map<string, Set<string>>();
  const mark = (scopeKey: string, k: string) =>
    (present.get(scopeKey) ?? present.set(scopeKey, new Set()).get(scopeKey)!).add(k);
  for (const [scopeKey, links] of linksOf)
    for (const l of links) if (linkOnSheet(scopeKey, l)) mark(scopeKey, l.lineKey);
  for (const r of rowShapes) mark(r.scopeKey, r.pieceLineKey);
  const orphansOf = (sc: DraftScope) =>
    sc.replaces
      ? [...(present.get(sc.target.scopeKey) ?? [])].filter(
          (k) => !held.get(heldKey(sc.target.scopeKey, k))?.length,
        )
      : [];
  for (const s of open()) {
    const ranked = orphansOf(s.scope)
      .filter((k) => handsMeet(s.hand, pieceHand(k)))
      .map((k) => ({ k, c: costOf(s, k) }));
    if (!ranked.length || ranked.every((x) => x.c != null && x.c > SHAPE_OTHER)) continue;
    s.unresolved = ranked
      .sort(
        (a, b) =>
          (a.c ?? Infinity) - (b.c ?? Infinity) ||
          (byKey.get(a.k)?.name ?? '').localeCompare(byKey.get(b.k)?.name ?? ''),
      )
      .map((x) => x.k);
  }

  // ── groups: one per card piece (existing, or a new card name) ──
  // a new pair collapses into one card name unless the card keeps that part per hand
  const perHand = new Set(live.filter((p) => handOf(p.name)).map((p) => partKey(p.name)));
  const groups = new Map<string, Group>();
  for (const s of slots) {
    if (s.unresolved) continue;
    let existingLineKey = s.bind?.lineKey ?? null;
    let basis: DraftPiece['basis'] = s.bind?.basis ?? 'new';
    const name = existingLineKey
      ? byKey.get(existingLineKey)!.name
      : s.hand && perHand.has(s.part)
        ? normBlock(s.mp.identity)
        : cardNameOf(s.mp);
    if (!existingLineKey) {
      // the server allows one name per card: minting a second «FP» would only fail the save
      const same = byName.get(lc(name));
      if (same) {
        existingLineKey = same;
        basis = 'name';
      }
    }
    const gk = existingLineKey ? `k|${existingLineKey}` : `n|${lc(name)}`;
    const g: Group = groups.get(gk) ?? {
      existingLineKey,
      name,
      basis,
      byScope: new Map(),
      fused: false,
      ungraded: true,
      pair: false,
      unfolded: false,
      half: false,
    };
    if (BASIS_RANK[basis ?? 'new'] < BASIS_RANK[g.basis ?? 'new']) g.basis = basis;
    push(g.byScope, s.scopeKey, s);
    g.fused ||= s.mp.fused || s.interlining;
    g.ungraded &&= s.mp.ungraded;
    g.pair ||= !!s.mp.pairOf;
    g.unfolded ||= s.mp.unfoldedFold;
    g.half ||= !!s.mp.halfFold;
    groups.set(gk, g);
  }

  const pieces: DraftPiece[] = [];
  const pieceUpdates: DraftPieceUpdate[] = [];
  const aliases: DraftAlias[] = [];
  const seenAlias = new Set<string>();
  for (const g of groups.values()) {
    const existing = g.existingLineKey ? byKey.get(g.existingLineKey) ?? null : null;
    const ppg = Math.max(
      1,
      ...[...g.byScope.values()].map((ss) =>
        ss.reduce((n, s) => n + Math.max(1, s.mp.piecesPerGarment), 0),
      ),
    );
    const key = existing?.lineKey ?? mint();
    const force = g.pair ? 'pair' : g.unfolded ? 'unfolded' : g.half ? 'half' : undefined;
    // L13: a half on fold is cut on the fold — a new piece too (the drawing carries the half only)
    const symmetry = existing
      ? importedCutSymmetry(existing.cutSymmetry, ppg, force)
      : force === 'half'
        ? FOLD_CUT_SYMMETRY
        : IDENTICAL;
    pieces.push({
      lineKey: key,
      name: existing?.name ?? g.name,
      piecesPerGarment: ppg,
      cutSymmetry: symmetry ?? (existing?.cutSymmetry || IDENTICAL),
      ...(force ? { symmetryForce: force } : {}),
      grainline: '',
      fused: g.fused,
      existingLineKey: existing?.lineKey ?? null,
      ungraded: g.ungraded,
      fusingMode: g.fused ? FUSING_FULL : FUSING_UNKNOWN,
      basis: existing ? g.basis : 'new',
      scopeKeys: [...g.byScope.keys()],
    });
    if (existing) {
      const u: DraftPieceUpdate = { lineKey: existing.lineKey, reason: '' };
      const why: string[] = [];
      if (symmetry) {
        u.cutSymmetry = symmetry;
        why.push(
          g.pair
            ? 'the drawing carries both hands as separate pieces — cut as drawn'
            : g.unfolded
              ? 'the drawing carries the unfolded piece — cut flat, not on the fold'
              : g.half
                ? 'the drawing carries the half with its fold line — cut on the fold'
                : (existing.cutSymmetry ?? '').trim().endsWith('MIRRORED')
                  ? `a mirrored pair cannot be ${ppg} per garment — cut as drawn`
                  : 'not marked — the drawing carries every contour, cut as drawn',
        );
      }
      if ((existing.piecesPerGarment ?? 1) !== ppg) {
        u.piecesPerGarment = ppg;
        why.push(`× per garment ${existing.piecesPerGarment ?? 1} → ${ppg} from the drawing`);
      }
      if (g.fused && !existing.fused) {
        u.fused = true;
        why.push('cut from interlining too — marked fused');
        const mode = (existing.fusingMode ?? '').trim();
        if (!mode || mode === FUSING_UNKNOWN) u.fusingMode = FUSING_FULL;
      }
      if (why.length) pieceUpdates.push({ ...u, reason: why.join('; ') });
    }
    for (const [scopeKey, ss] of g.byScope) {
      const target = ss[0].scope.target;
      for (const s of ss) {
        const k = aliasKey(scopeKey, s.spelling);
        if (seenAlias.has(k)) continue;
        seenAlias.add(k);
        aliases.push({
          scopeKey,
          fabricPurpose: target.fabricPurpose,
          bomLineKey: target.bomLineKey,
          blockName: s.spelling,
          pieceLineKey: key,
        });
      }
    }
  }

  const unresolved: DraftUnresolved[] = slots.flatMap((s) =>
    s.unresolved
      ? [
          {
            scopeKey: s.scopeKey,
            blockName: s.spelling,
            identity: s.mp.identity,
            candidates: s.unresolved.map((k) => ({
              pieceLineKey: k,
              pieceName: byKey.get(k)?.name ?? k,
            })),
          },
        ]
      : [],
  );

  // the pieces this re-import leaves without a block go to the scope's review list: the ones the
  // card's parse shows drawn in the replaced sheet, and every candidate of an unresolved block
  for (const sc of scopes) {
    if (!sc.replaces) continue;
    const sk = sc.target.scopeKey;
    const drawn = new Set(
      [...aliasNames(sc.manifest).values(), ...sc.manifest.pieces.map((p) => p.identity)].map(lc),
    );
    const outlined = new Set(rowShapes.filter((r) => r.scopeKey === sk).map((r) => r.pieceLineKey));
    const asked = new Set(
      unresolved
        .filter((u) => u.scopeKey === sk)
        .flatMap((u) => u.candidates.map((c) => c.pieceLineKey)),
    );
    const listed = new Set((sc.vanished ?? []).map((v) => lc(v.blockName)));
    const extra: DraftVanished[] = [];
    for (const k of orphansOf(sc)) {
      if (!outlined.has(k) && !asked.has(k)) continue;
      const links = (linksOf.get(sk) ?? []).filter(
        (l) => l.lineKey === k && !drawn.has(lc(l.blockName)) && linkOnSheet(sk, l),
      );
      const blocks = links.length
        ? links.map((l) => l.blockName)
        : rowShapes.filter((r) => r.scopeKey === sk && r.pieceLineKey === k).map((r) => r.identity);
      for (const b of blocks) {
        if (listed.has(lc(b))) continue;
        listed.add(lc(b));
        extra.push({ blockName: b, pieceLineKey: k, pieceName: byKey.get(k)?.name ?? k });
      }
    }
    if (extra.length) sc.vanished = [...(sc.vanished ?? []), ...extra];
  }

  return {
    techCardId: card.techCardId,
    scopes,
    pieces,
    aliases,
    pieceUpdates,
    ...(unresolved.length ? { unresolved } : {}),
    downloads: scopes.map((s) => ({ filename: s.filename, dxfText: s.dxfText })),
  };
}

/** The new file read back through our own parser completely (gate G1-roundtrip passed). */
export function readsBack(m: ConversionManifest): boolean {
  const g1 = m.gate?.checks.find((c) => c.id === 'G1-roundtrip');
  return !!g1 && g1.ok;
}

const nonEmpty = (xs: string[]) => xs.map((x) => x.trim().toLowerCase()).filter(Boolean);

/**
 * The active sheet in this scope, if any. Strongest importer match first: the same source sha256,
 * the same source file name, then the newest converted row. A foreign DXF or legacy PDF still owns
 * the slot and is the scope fallback, so apply can never append beside it.
 */
export function replaceTargetOf(
  sc: Pick<DraftScope, 'target' | 'manifest'>,
  card: Pick<DraftCardContext, 'existingPatterns'>,
): DraftReplaceTarget | null {
  const rows = (card.existingPatterns ?? []).filter(
    (p) => p.scopeKey === sc.target.scopeKey && (!!(p.lineKey ?? '').trim() || !!p.url),
  );
  if (!rows.length) return null;
  // Codex C8: a manifest from the card's read is validated, but these rows also come from callers
  // and older reads — a missing `source.files` must cost the match, not the apply.
  const filesOf = (m: ConversionManifest | null | undefined) =>
    Array.isArray(m?.source?.files) ? m.source.files : [];
  const strs = (xs: unknown[]) => xs.filter((v): v is string => typeof v === 'string');
  const sha = new Set(nonEmpty(strs(filesOf(sc.manifest).map((f) => f?.sha256))));
  const src = new Set(nonEmpty(strs(filesOf(sc.manifest).map((f) => f?.name))));
  const score = (p: (typeof rows)[number]): [number, DraftReplaceTarget['matchedBy']] => {
    const files = filesOf(p.manifest);
    if (sha.size && nonEmpty(strs(files.map((f) => f?.sha256))).some((h) => sha.has(h)))
      return [2, 'sha256'];
    if (src.size && nonEmpty(strs(files.map((f) => f?.name))).some((n) => src.has(n)))
      return [1, 'source'];
    return [0, 'scope'];
  };
  const best = rows
    .map((p) => ({ p, s: score(p) }))
    .sort(
      (a, b) =>
        b.s[0] - a.s[0] ||
        (b.p.manifest?.createdAt ?? '').localeCompare(a.p.manifest?.createdAt ?? ''),
    )[0];
  return {
    lineKey: (best.p.lineKey ?? '').trim(),
    url: best.p.url,
    filename: best.p.filename,
    name: best.p.name ?? '',
    matchedBy: best.s[1],
    convertedAt: best.p.manifest?.createdAt ?? '',
  };
}

/**
 * Links of this scope to blocks the replaced sheet's manifest drew and the new file does not. A
 * link to a block of ANOTHER sheet of the scope is not ours to judge and is never listed.
 */
export function vanishedOf(
  sc: Pick<DraftScope, 'target' | 'manifest'>,
  replaces: DraftReplaceTarget,
  card: Pick<DraftCardContext, 'existingPatterns' | 'existingAliases' | 'existingPieces'>,
): DraftVanished[] {
  const old = (card.existingPatterns ?? []).find((p) => p.lineKey?.trim() === replaces.lineKey);
  if (!old?.manifest) return [];
  const lower = (s: string) => normBlock(s).toLowerCase();
  const before = new Set([...aliasNames(old.manifest).values()].map(lower));
  const now = new Set([...aliasNames(sc.manifest).values()].map(lower));
  const nameOf = new Map(card.existingPieces.map((p) => [p.lineKey, p.name]));
  const out: DraftVanished[] = [];
  for (const a of card.existingAliases ?? []) {
    if (a.scopeKey !== sc.target.scopeKey) continue;
    const b = lower(a.blockName);
    if (!before.has(b) || now.has(b)) continue;
    out.push({
      blockName: a.blockName,
      pieceLineKey: a.pieceLineKey,
      pieceName: nameOf.get(a.pieceLineKey) ?? a.pieceLineKey,
    });
  }
  return out;
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** A ULID-shaped key (26 Crockford chars) — same contract as `utils/ulid`, no import across lib. */
export function mintLineKey(): string {
  let t = Date.now();
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = new Uint8Array(16);
  const g = (globalThis as { crypto?: Crypto }).crypto;
  if (g?.getRandomValues) g.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  let rnd = '';
  for (let i = 0; i < 16; i++) rnd += CROCKFORD[bytes[i] % 32];
  return time + rnd;
}
