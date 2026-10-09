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
//   · SYMMETRY: always IDENTICAL (D1'); an existing piece that says otherwise gets a point write with
//     the reason ("both hands drawn" / "unfolded") — never a root rewrite.
//   · FUSED: any interlining copy (file or `fused` flag) → `fused` + fusing mode FULL on a new piece;
//     an existing piece's own fusing mode is kept.
//   · ALIASES: per scope per identity, `blockName` = the identity as the card's splitter keys it (the
//     manifest identity; an ungraded `_UNI` block keeps its raw name — split-pieces.ts does the same).

import type {
  CardDraft,
  ConversionManifest,
  DraftAlias,
  DraftPiece,
  DraftPieceUpdate,
  DraftScope,
  ManifestPiece,
} from '../types';
import { MANIFEST_TAG } from '../types';
import { isInterliningScope, purposeWord } from './scope';

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
  /** Live pattern rows, scope as above. */
  existingPatterns?: { scopeKey: string; filename: string; url: string }[];
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
function aliasNames(m: ConversionManifest): Map<string, string> {
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
    return {
      ...sc,
      filename,
      name: sc.name || name,
      alreadyOnCard: onCard ? { url: onCard.url, filename: onCard.filename } : null,
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
    pieces.push({
      lineKey: key,
      name: existing?.name ?? g.name,
      piecesPerGarment: ppg,
      cutSymmetry: IDENTICAL,
      grainline: '',
      fused: g.fused,
      existingLineKey: existing?.lineKey ?? null,
      ungraded: g.ungraded,
      fusingMode: g.fused ? FUSING_FULL : FUSING_UNKNOWN,
      basis,
      scopeKeys: [...g.byScope.keys()],
    });
    if (existing) {
      const u: DraftPieceUpdate = {
        lineKey: existing.lineKey,
        cutSymmetry: IDENTICAL,
        reason: '',
      };
      const why: string[] = [];
      if ((existing.cutSymmetry ?? '') !== IDENTICAL)
        why.push(
          g.pair
            ? 'the drawing carries both hands as separate pieces — cut as drawn'
            : g.unfolded
              ? 'the drawing carries the unfolded piece — cut flat, not on the fold'
              : 'the drawing carries every contour — cut as drawn',
        );
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
