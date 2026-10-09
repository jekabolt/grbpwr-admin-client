// FABRIC SCOPES — which card scope (fabric PURPOSE, K1 C5) a fabric of the sheet goes to, and what
// each scope's DXF contains. Pure and main-thread safe: the worker's `write` stage cuts the files
// with `planScopes`, the wizard's fabrics step blocks on the same function's `problems`, so the
// footer and the files can never disagree.
//
// Rules (owner decisions 13/14, 09-CARD-CONTRACT K1 items 7–11):
//   · ONE DXF per scope; a piece cut from two fabrics goes into both files.
//   · LINING copies are renamed `LIN_<identity>` (code `LIN_<code>`, pair sibling too) unless the
//     code already carries the LIN word: a lining piece is a different physical piece from the shell
//     piece it is shaped like, and a lining block spelled like a shell block would be preselected
//     onto the shell piece by the card (K1 item 8). Its card piece is `LIN_<code>` — never the
//     shell's piece.
//   · INTERLINING copies keep the shell identity and bind to the SAME card piece (K1 item 11: the
//     fused collar IS the collar; `piece_id` is not in the alias uniqueness, the server measures the
//     fused layer by the piece's own interlining-scope contour when it has one). Interlining with no
//     BOM line has no file at all: its pieces carry `fused` (decision 14).
//   · Every other secondary cloth (pocketing, contrast/rib, insulation, mesh, other) also keeps the
//     identity and the card piece: the card models "one piece cut from several layers" by aliases in
//     several scopes. Only the lining is a separate piece by the owner's request.
//   · A fabric with no live BOM scope writes no DXF and its pieces are REFUSED with a reason the
//     wizard shows — never dropped silently.

import type {
  DraftScopeTarget,
  FabricAssignment,
  FabricPurposeKey,
  PieceKey,
  PieceSpec,
  SeedId,
} from '../types';
import { codeWordsOf } from '../manifest/identity';
import type { FabricKind } from './lexicon';
import { fabricKindsIn } from './lexicon';

export const PURPOSE = {
  main: 'TECH_CARD_BOM_PURPOSE_MAIN',
  lining: 'TECH_CARD_BOM_PURPOSE_LINING',
  pocketing: 'TECH_CARD_BOM_PURPOSE_POCKETING',
  interfacing: 'TECH_CARD_BOM_PURPOSE_INTERFACING',
  insulation: 'TECH_CARD_BOM_PURPOSE_INSULATION',
  contrast: 'TECH_CARD_BOM_PURPOSE_CONTRAST',
  mesh: 'TECH_CARD_BOM_PURPOSE_MESH',
  other: 'TECH_CARD_BOM_PURPOSE_OTHER',
} as const;

export const SECTION = {
  fabric: 'TECH_CARD_BOM_SECTION_FABRIC',
  lining: 'TECH_CARD_BOM_SECTION_LINING',
  interlining: 'TECH_CARD_BOM_SECTION_INTERLINING',
  insulation: 'TECH_CARD_BOM_SECTION_INSULATION',
} as const;

/** The purpose a sheet fabric is proposed under (rib has none of its own: Burda's «Garniturstoff»). */
export const PURPOSE_OF_KIND: Record<FabricKind, FabricPurposeKey> = {
  main: PURPOSE.main,
  lining: PURPOSE.lining,
  interfacing: PURPOSE.interfacing,
  rib: PURPOSE.contrast,
  pocketing: PURPOSE.pocketing,
  insulation: PURPOSE.insulation,
  contrast: PURPOSE.contrast,
  mesh: PURPOSE.mesh,
};

export const KIND_OF_PURPOSE: Record<string, FabricKind> = {
  [PURPOSE.main]: 'main',
  [PURPOSE.lining]: 'lining',
  [PURPOSE.interfacing]: 'interfacing',
  [PURPOSE.pocketing]: 'pocketing',
  [PURPOSE.insulation]: 'insulation',
  [PURPOSE.contrast]: 'contrast',
  [PURPOSE.mesh]: 'mesh',
};

/** One word per purpose, for file names and labels. */
export const purposeWord = (t: DraftScopeTarget): string => {
  const p = (t.fabricPurpose || '').replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase();
  if (p) return p;
  if (t.sections?.includes(SECTION.lining)) return 'lining';
  if (t.sections?.includes(SECTION.interlining)) return 'interlining';
  if (t.sections?.includes(SECTION.insulation)) return 'insulation';
  return 'fabric';
};

/** The sheet fabrics a card scope can hold, in preference order. */
export function kindsOfScope(t: DraftScopeTarget): FabricKind[] {
  switch (t.fabricPurpose) {
    case PURPOSE.main:
      return ['main'];
    case PURPOSE.lining:
      return ['lining'];
    case PURPOSE.pocketing:
      return ['pocketing'];
    case PURPOSE.interfacing:
      return ['interfacing'];
    case PURPOSE.insulation:
      return ['insulation'];
    case PURPOSE.contrast:
      return ['contrast', 'rib'];
    case PURPOSE.mesh:
      return ['mesh'];
    case PURPOSE.other:
      return ['rib'];
  }
  if (t.fabricPurpose) return [];
  // an unsorted BOM line (no purpose yet, scope = its lineKey): its section says what it is
  const s = t.sections ?? [];
  if (t.isInterlining || s.includes(SECTION.interlining)) return ['interfacing'];
  if (s.includes(SECTION.lining)) return ['lining'];
  if (s.includes(SECTION.insulation)) return ['insulation'];
  // an unsorted cloth line can be any cloth sold by length: main first, the rest by its name
  if (s.includes(SECTION.fabric)) return ['main', 'rib', 'contrast', 'pocketing', 'mesh'];
  return [];
}

export const isInterliningScope = (t: DraftScopeTarget) =>
  t.isInterlining || kindsOfScope(t)[0] === 'interfacing';
export const isLiningScope = (t: DraftScopeTarget) => kindsOfScope(t)[0] === 'lining';

/**
 * The card scope a sheet fabric goes to, or null when the BOM has none. Several candidates (two
 * unsorted fabric lines) → the first in BOM order, and `alternatives` says the operator should look.
 * Rib knit prefers a scope whose BOM line names rib, then contrast, then «other».
 */
export function scopeFor(
  kind: FabricKind,
  bom: readonly DraftScopeTarget[],
): { target: DraftScopeTarget; alternatives: number } | null {
  const cands = bom.filter((t) => kindsOfScope(t).includes(kind));
  if (!cands.length) return null;
  // a BOM line whose name says the cloth («Rib 1x1», «Cupro lining») wins outright
  const named = cands.filter((t) => fabricKindsIn(t.label).some((h) => h.kind === kind));
  if (named.length === 1) return { target: named[0], alternatives: 0 };
  if (kind === 'rib') {
    // Burda: «Garniturstoff: Rippenstrickstoff» — rib knit is the contrast cloth, else «other»
    const contrast = cands.filter((t) => t.fabricPurpose === PURPOSE.contrast);
    const other = cands.filter((t) => t.fabricPurpose === PURPOSE.other);
    const pick = contrast.length ? contrast : other;
    return pick.length ? { target: pick[0], alternatives: pick.length - 1 } : null;
  }
  // the scopes whose FIRST cloth this is; an unsorted fabric line takes a secondary cloth only by
  // its name (above) — «Loden» is not the pocketing because it is an unsorted fabric line
  const primary = cands.filter((t) => kindsOfScope(t)[0] === kind);
  if (!primary.length) return null;
  const notNamedElse = primary.filter(
    (t) => !fabricKindsIn(t.label).some((h) => h.kind !== kind && h.kind !== 'main'),
  );
  const pool = notNamedElse.length ? notNamedElse : primary;
  return { target: pool.find((t) => t.fabricPurpose) ?? pool[0], alternatives: pool.length - 1 };
}

// ── seeds ↔ scopes ───────────────────────────────────────────────────────────────────────────

/** Seeds that carry the `fused` flag: every piece cut from interlining, in a file or not. */
export function fusedSeeds(a: FabricAssignment, targets: readonly DraftScopeTarget[]): Set<SeedId> {
  const out = new Set<SeedId>();
  for (const t of targets)
    if (isInterliningScope(t)) for (const s of a.byPurpose[t.scopeKey] ?? []) out.add(s);
  if (!a.interliningInBom)
    for (const p of a.proposals)
      if (p.purpose === PURPOSE.interfacing) for (const s of p.seeds) out.add(s);
  return out;
}

const LIN = 'LIN';

/** The lining spelling of an identity: `FP_L` → `LIN_FP_L`; one that already says LIN is kept. */
export function liningIdentity(identity: string): string {
  return codeWordsOf(identity).includes(LIN) ? identity : `${LIN}_${identity}`;
}

/** One spec as it is written into one scope's file (fabrics = that scope; lining renamed). */
export function scopedSpec(p: PieceSpec, t: DraftScopeTarget): PieceSpec {
  const fabrics = [...new Set([t.scopeKey, t.fabricPurpose, t.bomLineKey].filter(Boolean))];
  if (!isLiningScope(t) || codeWordsOf(p.identity).includes(LIN)) return { ...p, fabrics };
  return {
    ...p,
    fabrics,
    identity: liningIdentity(p.identity),
    code: codeWordsOf(p.code).includes(LIN) ? p.code : `${LIN}_${p.code}`,
    pairOf: p.pairOf ? liningIdentity(p.pairOf) : null,
    displayName: /lining|подклад/i.test(p.displayName)
      ? p.displayName
      : `${p.displayName} · lining`,
  };
}

export type ScopePlan = {
  target: DraftScopeTarget;
  /** The specs this scope's DXF is written from (renamed, `fabrics` = the scope). */
  specs: PieceSpec[];
  /** written identity → the semantics identity it came from (walls, provenance). */
  sourceOf: Record<PieceKey, PieceKey>;
  seeds: SeedId[];
};

export type ScopeProblem =
  | { kind: 'no-fabric'; seeds: SeedId[]; message: string }
  | { kind: 'duplicate'; scopeKey: string; identity: PieceKey; seeds: SeedId[]; message: string }
  | { kind: 'refused'; seeds: SeedId[]; message: string };

/**
 * What each scope's file holds, and everything that stops the write. A scope with no ticked piece
 * writes no file. `problems` empty = the write stage can run.
 */
export function planScopes(
  pieces: readonly PieceSpec[],
  a: FabricAssignment,
  targets: readonly DraftScopeTarget[],
): { scopes: ScopePlan[]; problems: ScopeProblem[] } {
  const problems: ScopeProblem[] = [];
  const scopes: ScopePlan[] = [];
  const placed = new Set<SeedId>();
  const seen = new Set<string>();
  for (const t of targets) {
    if (seen.has(t.scopeKey)) continue; // one file per scope, never two (K1 item 7)
    seen.add(t.scopeKey);
    const ticked = new Set(a.byPurpose[t.scopeKey] ?? []);
    const src = pieces.filter((p) => ticked.has(p.seed));
    const specs = src.map((p) => scopedSpec(p, t));
    if (!specs.length) continue;
    const sourceOf: Record<PieceKey, PieceKey> = {};
    const byId = new Map<string, SeedId[]>();
    specs.forEach((s, i) => {
      sourceOf[s.identity] = src[i].identity;
      byId.set(s.identity, [...(byId.get(s.identity) ?? []), s.seed]);
      placed.add(s.seed);
    });
    for (const [identity, seeds] of byId)
      if (seeds.length > 1)
        problems.push({
          kind: 'duplicate',
          scopeKey: t.scopeKey,
          identity,
          seeds,
          message: `${seeds.length} pieces would be written as ${identity} into the ${t.label} file — untick one or rename it`,
        });
    scopes.push({ target: t, specs, sourceOf, seeds: [...new Set(specs.map((x) => x.seed))] });
  }
  const fused = fusedSeeds(a, targets);
  const refusedSeeds = new Set((a.refused ?? []).flatMap((r) => r.seeds));
  for (const r of a.refused ?? []) {
    const open = r.seeds.filter((s) => !placed.has(s));
    if (open.length) problems.push({ kind: 'refused', seeds: open, message: r.reason });
  }
  const orphan = [...new Set(pieces.map((p) => p.seed))].filter(
    (s) => !placed.has(s) && !refusedSeeds.has(s),
  );
  if (orphan.length) {
    const fusedOnly = orphan.filter((s) => fused.has(s));
    const bare = orphan.filter((s) => !fused.has(s));
    if (fusedOnly.length)
      problems.push({
        kind: 'no-fabric',
        seeds: fusedOnly,
        message: `${fusedOnly.length} ${fusedOnly.length === 1 ? 'piece is' : 'pieces are'} cut only from interlining and the BOM has no interlining line — add one on the BOM tab, or tick the fabric it is also cut from`,
      });
    if (bare.length)
      problems.push({
        kind: 'no-fabric',
        seeds: bare,
        message: `${bare.length} ${bare.length === 1 ? 'piece has' : 'pieces have'} no fabric — tick one`,
      });
  }
  return { scopes, problems };
}
