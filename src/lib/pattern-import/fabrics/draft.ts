// buildDraft — the write stage's per-scope files + the card as the wizard read it → ONE CardDraft
// (08-CONTRACT §4.3). Pure and main-thread safe (types + string ops; the manifest IS the input).
//
// What it decides, and the rules:
//   · FILES: one per scope, named `<style>-<purpose>-<fingerprint>.dxf`. The fingerprint hashes the
//     bare DXF (manifest comments and the creation time removed), so the same import produces the
//     same name and a re-apply finds its file already on the card (`alreadyOnCard`: no upload, no
//     row — re-applying changes nothing). A changed import gets a new name → a new row = the card's
//     own "revision" (two files in one scope count max, not sum: K1).
//   · CARD PIECES: one per CARD NAME — the identity without the pair hand (`FP_L` + `FP_R` → `FP`,
//     ×2), exactly the name the piece-match modal derives from the same manifest (parse-files.ts
//     `cardName`). A lining file's identities are `LIN_…` (scope.ts) → separate `LIN_…` pieces;
//     interlining and the other cloths keep the identity → the SAME piece, aliased in each scope.
//     × per garment = per scope the sum over its identities (both hands count 1), across scopes the
//     max (the fused collar is the collar, not a second one).
//   · REUSE: a piece already bound to one of the group's blocks in the same scope (alias) is that
//     piece; else an existing piece with the same name (case-insensitive) — the server allows one
//     name per card, so minting a second «FP» would only fail the save. A lining piece never matches
//     a shell piece: its name is `LIN_…`.
//   · SYMMETRY: a new piece is IDENTICAL (D1'). An existing piece follows the modal's one rule
//     (`importedCutSymmetry`): IDENTICAL only on the manifest's proof (pair / unfolded fold), when
//     unmarked, or when the new count makes its MIRRORED impossible — an explicit MIRRORED/FOLD is
//     kept otherwise (F14 MAJOR 2). A rewrite is a point write with the reason, never a root rewrite.
//   · FUSED: any interlining copy (file or `fused` flag) → `fused` + fusing mode FULL on a new piece;
//     an existing piece's own fusing mode is kept.
//   · RE-IMPORT (MF-C, M4): a scope that already holds a sheet THIS importer wrote (manifest on the
//     card) gets `replaces` = that row, default mode 'replace': the new file takes the row's place
//     instead of becoming a revision. Picked by the same source file (sha256, then file name), else
//     the scope alone (newest conversion). `vanished` = the scope's links to blocks the old manifest
//     drew and the new one does not — listed, never removed here (presence ≠ geometry: only the
//     piece-match modal, on the card's complete parse, may offer removal).
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
  DraftVanished,
  ManifestPiece,
} from '../types';
import { MANIFEST_TAG } from '../types';
import { isInterliningScope, purposeWord } from './scope';
import { importedCutSymmetry } from 'components/managers/tech-card/components/piece-codes';

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
   * Live pattern rows, scope as above. `manifest` = the conversion manifest the card's parse read
   * off that sheet (MF-C: a sheet this importer wrote; null/absent = a foreign DXF or not parsed).
   */
  existingPatterns?: {
    scopeKey: string;
    filename: string;
    url: string;
    lineKey?: string;
    name?: string;
    manifest?: ConversionManifest | null;
  }[];
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
  // the R12 (AAMA) header prints the creation time again, as «CREATION DATE: dd-mm-yyyy» / «… TIME:»
  const text = out.map((l) => l.replace(/^(CREATION (?:DATE|TIME):).*$/, '$1')).join('\n');
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
  const src = scope.manifest.source.files[0]?.name.replace(/\.[^.]+$/, '') ?? '';
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

type Group = {
  name: string;
  /** scopeKey → identities in that scope's file. */
  byScope: Map<string, { pieces: ManifestPiece[]; aliasNames: Map<string, string> }>;
  fused: boolean;
  ungraded: boolean;
  pair: boolean;
  unfolded: boolean;
};

export function buildDraft(
  write: { scopes: DraftScope[] },
  card: DraftCardContext,
  opts: { mintKey?: () => string } = {},
): CardDraft {
  const mint = opts.mintKey ?? mintLineKey;
  const groups = new Map<string, Group>();
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

  for (const sc of scopes) {
    const names = aliasNames(sc.manifest);
    const interlining = isInterliningScope(sc.target);
    for (const mp of sc.manifest.pieces) {
      const cn = cardNameOf(mp);
      const g: Group = groups.get(cn.toLowerCase()) ?? {
        name: cn,
        byScope: new Map(),
        fused: false,
        ungraded: true,
        pair: false,
        unfolded: false,
      };
      const slot = g.byScope.get(sc.target.scopeKey) ?? { pieces: [], aliasNames: names };
      slot.pieces.push(mp);
      g.byScope.set(sc.target.scopeKey, slot);
      g.fused ||= mp.fused || interlining;
      g.ungraded &&= mp.ungraded;
      g.pair ||= !!mp.pairOf;
      g.unfolded ||= mp.unfoldedFold;
      groups.set(cn.toLowerCase(), g);
    }
  }

  const liveKeys = new Set(card.existingPieces.map((p) => p.lineKey.trim().toLowerCase()));
  const aliasOwner = new Map<string, string>();
  for (const a of card.existingAliases ?? [])
    if (liveKeys.has(a.pieceLineKey.trim().toLowerCase()))
      aliasOwner.set(aliasKey(a.scopeKey, a.blockName), a.pieceLineKey);
  const byName = new Map(card.existingPieces.map((p) => [p.name.trim().toLowerCase(), p]));
  const byKey = new Map(card.existingPieces.map((p) => [p.lineKey, p]));

  const pieces: DraftPiece[] = [];
  const pieceUpdates: DraftPieceUpdate[] = [];
  const aliases: DraftAlias[] = [];
  const seenAlias = new Set<string>();
  const taken = new Set<string>();
  for (const g of groups.values()) {
    // 1. reuse by an alias this card already has for one of the group's blocks, 2. by name
    let lineKey: string | null = null;
    let basis: DraftPiece['basis'] = 'new';
    for (const [scopeKey, slot] of g.byScope) {
      for (const mp of slot.pieces) {
        const owner = aliasOwner.get(
          aliasKey(scopeKey, slot.aliasNames.get(mp.identity) ?? mp.identity),
        );
        if (owner && !taken.has(owner)) {
          lineKey = owner;
          basis = 'alias';
          break;
        }
      }
      if (lineKey) break;
    }
    if (!lineKey) {
      const named = byName.get(g.name.trim().toLowerCase());
      if (named && !taken.has(named.lineKey)) {
        lineKey = named.lineKey;
        basis = 'name';
      }
    }
    const existing = lineKey ? byKey.get(lineKey) ?? null : null;
    const ppg = Math.max(
      1,
      ...[...g.byScope.values()].map((s) =>
        s.pieces.reduce((n, p) => n + Math.max(1, p.piecesPerGarment), 0),
      ),
    );
    const key = existing?.lineKey ?? mint();
    taken.add(key);
    const force = g.pair ? 'pair' : g.unfolded ? 'unfolded' : undefined;
    const symmetry = existing
      ? importedCutSymmetry(existing.cutSymmetry, ppg, force)
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
      basis,
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
    for (const [scopeKey, slot] of g.byScope) {
      const target = scopes.find((s) => s.target.scopeKey === scopeKey)!.target;
      for (const mp of slot.pieces) {
        const blockName = slot.aliasNames.get(mp.identity) ?? mp.identity;
        const k = aliasKey(scopeKey, blockName);
        if (seenAlias.has(k)) continue;
        seenAlias.add(k);
        aliases.push({
          scopeKey,
          fabricPurpose: target.fabricPurpose,
          bomLineKey: target.bomLineKey,
          blockName,
          pieceLineKey: key,
        });
      }
    }
  }

  return {
    techCardId: card.techCardId,
    scopes,
    pieces,
    aliases,
    pieceUpdates,
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
 * The previous import's sheet in this scope, if any. Only rows whose manifest the card's parse read
 * (a sheet this importer wrote) qualify: a foreign CLO sheet is never replaced. Strongest match
 * first: the same source sha256 (MF-B fills it), the same source file name, else the scope alone
 * (the newest conversion — one DXF per scope is the importer's rule, K1 item 7).
 */
export function replaceTargetOf(
  sc: Pick<DraftScope, 'target' | 'manifest'>,
  card: Pick<DraftCardContext, 'existingPatterns'>,
): DraftReplaceTarget | null {
  const rows = (card.existingPatterns ?? []).filter(
    (p) => p.scopeKey === sc.target.scopeKey && !!p.manifest && !!(p.lineKey ?? '').trim(),
  );
  if (!rows.length) return null;
  const sha = new Set(nonEmpty(sc.manifest.source.files.map((f) => f.sha256)));
  const src = new Set(nonEmpty(sc.manifest.source.files.map((f) => f.name)));
  const score = (p: (typeof rows)[number]): [number, DraftReplaceTarget['matchedBy']] => {
    const files = p.manifest!.source.files;
    if (sha.size && nonEmpty(files.map((f) => f.sha256)).some((h) => sha.has(h)))
      return [2, 'sha256'];
    if (src.size && nonEmpty(files.map((f) => f.name)).some((n) => src.has(n)))
      return [1, 'source'];
    return [0, 'scope'];
  };
  const best = rows
    .map((p) => ({ p, s: score(p) }))
    .sort(
      (a, b) =>
        b.s[0] - a.s[0] ||
        (b.p.manifest!.createdAt ?? '').localeCompare(a.p.manifest!.createdAt ?? ''),
    )[0];
  return {
    lineKey: best.p.lineKey!.trim(),
    url: best.p.url,
    filename: best.p.filename,
    name: best.p.name ?? '',
    matchedBy: best.s[1],
    convertedAt: best.p.manifest!.createdAt ?? '',
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
