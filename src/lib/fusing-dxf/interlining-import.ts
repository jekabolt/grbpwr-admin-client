import type { PieceDTO } from 'lib/nesting/types';
import {
  bareToken,
  normBlock,
  splitBlockSize,
} from 'components/managers/tech-card/components/nesting/block-code';
import {
  aliasIdentity,
  splitPiecesBySize,
  type BlockSplit,
} from 'components/managers/tech-card/components/nesting/split-pieces';

export type InterliningImportReason = 'no-match' | 'ambiguous' | 'oversize';

export type InterliningImportMatch = {
  identity: string;
  blocks: PieceDTO[];
  pieceLineKey?: string;
  previouslyBound?: boolean;
  reason?: InterliningImportReason;
};

export type InterliningBlockCode = {
  identity: string;
  size: string;
};

type Alias = {
  blockName?: string;
  pieceLineKey?: string;
};

type GarmentPiece = {
  lineKey?: string;
  name?: string;
};

type SizeTokens = { has(token: string): boolean };

export const interliningIdentityKey = (value: string): string =>
  value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

const loose = interliningIdentityKey;

const terminalToken = (value: string): { stem: string; token: string } | null => {
  const match = normBlock(value).match(/^(.*?)[\s_-]+(FUSING|FUSE|FUS|INT|IN|F)$/iu);
  if (!match?.[1]) return null;
  return { stem: normBlock(match[1]), token: match[2].toUpperCase() };
};

function stripFusingToken(
  value: string,
  mainIdentities: ReadonlySet<string>,
  sizeTokens: SizeTokens,
): string {
  const terminal = terminalToken(value);
  if (!terminal) return normBlock(value);
  const sizedStem = splitBlockSize(terminal.stem, sizeTokens);
  return mainIdentities.has(loose(terminal.stem)) ||
    (sizedStem.size && mainIdentities.has(loose(sizedStem.identity)))
    ? terminal.stem
    : normBlock(value);
}

function mainIdentitySet(split: BlockSplit): Set<string> {
  return new Set([...split.codeById.values()].map((code) => loose(code.identity)).filter(Boolean));
}

function mainIdentitySpelling(split: BlockSplit): Map<string, string> {
  const out = new Map<string, string>();
  for (const code of split.codeById.values()) {
    const key = loose(code.identity);
    if (key && !out.has(key)) out.set(key, normBlock(code.identity));
  }
  return out;
}

/**
 * The identity written to an interlining alias. It deliberately preserves the main sheet's
 * spelling while comparing punctuation-insensitively, just like the mapper's existing name tier.
 */
export function canonicalInterliningIdentity(args: {
  blockName: string;
  splitIdentity?: string;
  splitSize?: string;
  sizeTokens: SizeTokens;
  mainIdentities: ReadonlySet<string>;
}): InterliningBlockCode {
  const { blockName, splitIdentity, splitSize, sizeTokens, mainIdentities } = args;
  const raw = normBlock(blockName);
  const splitRaw = normBlock(splitIdentity || raw);
  let size = splitSize ?? '';

  // A suffix such as INT can be part of the garment piece's real name. The size-split identity is
  // already the main sheet's answer, so it wins before any fusing-token heuristic is attempted.
  if (mainIdentities.has(loose(splitRaw))) return { identity: splitRaw, size };

  let identity = stripFusingToken(splitRaw, mainIdentities, sizeTokens);

  // `BP_U_FUSE_XS`: the tag sits immediately before the size, so neither token is terminal until
  // the tag is removed. Accept every tag only after the exposed identity is confirmed on the main
  // sheet, exactly like the terminal-tag branch above.
  const beforeSize = raw.match(/^(.*?)[\s_-]+(FUSING|FUSE|FUS|INT|IN|F)[\s_-]+([^\s_-]+)$/iu);
  if (beforeSize && sizeTokens.has(bareToken(beforeSize[3]))) {
    const stem = normBlock(beforeSize[1]);
    if (mainIdentities.has(loose(stem))) {
      identity = stem;
      size = beforeSize[3];
    }
  }

  // `BP_U_XS_FUSE`: the fusing tag hides the size from the normal terminal-size parser. Remove
  // the tag first, then ask the same parser used by split-pieces about the exposed suffix.
  const withoutRawTag = stripFusingToken(raw, mainIdentities, sizeTokens);
  if (withoutRawTag !== raw) {
    const exposed = splitBlockSize(withoutRawTag, sizeTokens);
    const exposedIdentity = stripFusingToken(exposed.identity, mainIdentities, sizeTokens);
    if (exposed.size || loose(exposedIdentity) !== loose(identity)) {
      identity = exposedIdentity;
      if (exposed.size) size = exposed.size;
    }
  }

  return { identity: normBlock(identity), size };
}

/** Canonical identity/size for every contour, used by both matching and area lookup. */
export function interliningBlockCodes(args: {
  blocks: readonly PieceDTO[];
  sizeTokens: SizeTokens;
  mainBlocks: readonly PieceDTO[];
}): Map<number, InterliningBlockCode> {
  const { blocks, sizeTokens, mainBlocks } = args;
  const mainSplit = splitPiecesBySize(mainBlocks, sizeTokens);
  const mainIdentities = mainIdentitySet(mainSplit);
  const mainSpelling = mainIdentitySpelling(mainSplit);
  const split = splitPiecesBySize(blocks, sizeTokens);
  const out = new Map<number, InterliningBlockCode>();
  for (const block of blocks) {
    const code = split.codeById.get(block.id);
    const codeOut = canonicalInterliningIdentity({
      blockName: block.blockName ?? '',
      splitIdentity: code?.identity,
      splitSize: code?.size,
      sizeTokens,
      mainIdentities,
    });
    out.set(block.id, {
      ...codeOut,
      identity: mainSpelling.get(loose(codeOut.identity)) ?? codeOut.identity,
    });
  }
  return out;
}

function livePieceKeys(aliases: readonly Alias[], piecesByKey: ReadonlyMap<string, GarmentPiece>) {
  const out = new Set<string>();
  for (const alias of aliases) {
    const key = (alias.pieceLineKey ?? '').trim().toLowerCase();
    if (key && piecesByKey.has(key)) out.add(key);
  }
  return out;
}

function keysByName(pieces: readonly GarmentPiece[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const piece of pieces) {
    const key = (piece.lineKey ?? '').trim().toLowerCase();
    const name = loose(piece.name ?? '');
    if (!key || !name) continue;
    const keys = out.get(name) ?? new Set<string>();
    keys.add(key);
    out.set(name, keys);
  }
  return out;
}

function groupedAliases(
  aliases: readonly Alias[],
  identityOf: (block: string) => string,
): Map<string, Alias[]> {
  const out = new Map<string, Alias[]>();
  for (const alias of aliases) {
    const identity = loose(identityOf(alias.blockName ?? ''));
    if (!identity) continue;
    out.set(identity, [...(out.get(identity) ?? []), alias]);
  }
  return out;
}

/**
 * Match one owner-supplied interlining drawing to cut pieces without ever proposing new pieces.
 * Previous aliases win, then main-sheet aliases, then normalized cut-piece names.
 */
export function matchInterliningImport(args: {
  blocks: readonly PieceDTO[];
  mainBlocks: readonly PieceDTO[];
  mainAliases: readonly Alias[];
  previousAliases?: readonly Alias[];
  pieces: readonly GarmentPiece[];
  sizeTokens: SizeTokens;
}): InterliningImportMatch[] {
  const { blocks, mainBlocks, mainAliases, previousAliases = [], pieces, sizeTokens } = args;
  const piecesByKey = new Map(
    pieces
      .map((piece) => [(piece.lineKey ?? '').trim().toLowerCase(), piece] as const)
      .filter(([key]) => !!key),
  );
  const pieceKeysByName = keysByName(pieces);
  const mainSplit = splitPiecesBySize(mainBlocks, sizeTokens);
  const mainIdentities = mainIdentitySet(mainSplit);
  const codes = interliningBlockCodes({ blocks, sizeTokens, mainBlocks });

  const groups = new Map<string, { identity: string; blocks: PieceDTO[] }>();
  for (const block of blocks) {
    const identity = codes.get(block.id)?.identity ?? normBlock(block.blockName ?? '');
    const key = loose(identity);
    if (!key) continue;
    const group = groups.get(key) ?? { identity, blocks: [] };
    group.blocks.push(block);
    groups.set(key, group);
  }

  const previous = groupedAliases(previousAliases, (block) => {
    const parsed = splitBlockSize(block, sizeTokens);
    return canonicalInterliningIdentity({
      blockName: block,
      splitIdentity: parsed.identity,
      splitSize: parsed.size,
      sizeTokens,
      mainIdentities,
    }).identity;
  });
  const main = groupedAliases(mainAliases, (block) => aliasIdentity(block, mainSplit));

  // Main-sheet areas are resolved with the same priority as names: alias first, then a unique
  // piece-name hit. A same-size contour is preferred; the largest known contour is the safe
  // fallback for ungraded or differently labelled drawings.
  const mainAreas = new Map<string, Map<string, number>>();
  for (const block of mainBlocks) {
    const code = mainSplit.codeById.get(block.id);
    const identity = loose(code?.identity ?? block.blockName ?? '');
    if (!identity) continue;
    const aliasKeys = livePieceKeys(main.get(identity) ?? [], piecesByKey);
    const resolved =
      aliasKeys.size > 0 ? aliasKeys : pieceKeysByName.get(identity) ?? new Set<string>();
    if (resolved.size !== 1) continue;
    const pieceKey = [...resolved][0];
    const bySize = mainAreas.get(pieceKey) ?? new Map<string, number>();
    const size = bareToken(code?.size ?? '');
    bySize.set(size, Math.max(bySize.get(size) ?? 0, block.areaCm2));
    mainAreas.set(pieceKey, bySize);
  }

  const out: InterliningImportMatch[] = [];
  for (const [identityKey, group] of groups) {
    const priorKeys = livePieceKeys(previous.get(identityKey) ?? [], piecesByKey);
    const aliasKeys = livePieceKeys(main.get(identityKey) ?? [], piecesByKey);
    const nameKeys = pieceKeysByName.get(identityKey) ?? new Set<string>();
    const candidates = priorKeys.size > 0 ? priorKeys : aliasKeys.size > 0 ? aliasKeys : nameKeys;
    if (candidates.size !== 1) {
      out.push({
        ...group,
        reason: candidates.size > 1 ? 'ambiguous' : 'no-match',
      });
      continue;
    }

    const pieceLineKey = [...candidates][0];
    const bySize = mainAreas.get(pieceLineKey);
    const fallback = bySize ? Math.max(...bySize.values()) : 0;
    const oversize = group.blocks.some((block) => {
      const size = bareToken(codes.get(block.id)?.size ?? '');
      const mainArea = bySize?.get(size) ?? fallback;
      return mainArea > 0 && block.areaCm2 > mainArea * 1.15;
    });
    out.push(
      oversize
        ? { ...group, reason: 'oversize' }
        : {
            ...group,
            pieceLineKey: piecesByKey.get(pieceLineKey)?.lineKey ?? pieceLineKey,
            previouslyBound: priorKeys.size === 1,
          },
    );
  }
  return out;
}
