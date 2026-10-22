import { adminService } from 'api/api';
import type {
  common_Size,
  common_TechCardBomItem,
  common_TechCardBomPurpose,
  common_TechCardInsert,
  common_TechCardPiece,
  common_TechCardPieceDxfAlias,
  common_TechCardSizePattern,
} from 'api/proto-http/admin';
import {
  aliasIdentity,
  splitPiecesBySize,
} from 'components/managers/tech-card/components/nesting/split-pieces';
import {
  bareToken,
  sizeTokensOf,
} from 'components/managers/tech-card/components/nesting/block-code';
import {
  defaultContourLayer,
  layerOptions,
} from 'components/managers/tech-card/components/nesting/contour-layer';
import {
  defaultGrainLayer,
  grainLayerOptions,
} from 'components/managers/tech-card/components/nesting/grain';
import { scopeKeyOfBinding } from 'components/managers/tech-card/components/bom-purpose';
import { rollGoodsScopes } from 'components/managers/tech-card/components/piece-block-refs';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { sha256Hex } from 'lib/features/sha256';
import type { PieceDTO } from 'lib/nesting/types';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { NestingWorkerClient } from 'lib/nesting/worker/client';
import { normBlock } from 'lib/pattern-import/fabrics/draft';
import { isInterliningScope, PURPOSE, SECTION } from 'lib/pattern-import/fabrics/scope';
import type { DraftScopeTarget, PtMm } from 'lib/pattern-import/types';
import { mergeDxfSet } from 'lib/pattern-import/worker/dxf-set';
import {
  MAX_PATTERN_FILENAME,
  MAX_PATTERN_NAME,
  clampUtf8Bytes,
  isDxfUrl,
  patternUploadErrorMessage,
} from 'utils/pattern';
import { ulid } from 'utils/ulid';
import { nextFusingAliases, nextGeneratedPatterns, planFusingLines, sameAliasSet } from './aliases';
import { buildFusingSheets } from './dxf';
import type {
  BuildFusingSheetsResult,
  FusingBomLine,
  FusingSourcePiece,
  FusingSourceSize,
} from './dxf';
import { fuseSpecFromPiece } from './types';

export const GENERATED_FUSING_NAME_PREFIX = 'Fusing · generated · ';

export type RegenerateFusingSheetsResult = {
  generated: number;
  uploaded: number;
  reused: number;
  removed: number;
  changed: boolean;
  /** The card version this rebuild's own write left (`expected + 1`); absent when it wrote nothing. */
  lockVersion?: number;
  warnings: string[];
  skippedSizes: BuildFusingSheetsResult['skippedSizes'];
};

const unsetPurpose = 'TECH_CARD_BOM_PURPOSE_UNSET' as const;

function scopeOfBom(item: common_TechCardBomItem): DraftScopeTarget {
  const key = item.lineKey?.trim() ?? '';
  const purpose = item.purpose ?? unsetPurpose;
  return {
    scopeKey: purpose !== unsetPurpose ? purpose : key,
    fabricPurpose: purpose,
    bomLineKey: key,
    label: item.name?.trim() || item.supplierRef?.trim() || key,
    isInterlining: item.section === SECTION.interlining,
    sections: item.section ? [item.section] : [],
  };
}

function interliningLines(items: readonly common_TechCardBomItem[]): FusingBomLine[] {
  return items.flatMap((item) => {
    const scope = scopeOfBom(item);
    if (!scope.bomLineKey || !isInterliningScope(scope)) return [];
    return [
      {
        bomLineKey: scope.bomLineKey,
        code: item.supplierRef?.trim() || item.name?.trim() || scope.bomLineKey.slice(0, 10),
        label: scope.label,
      },
    ];
  });
}

const isGenerated = (pattern: common_TechCardSizePattern) =>
  (pattern.name ?? '').startsWith(GENERATED_FUSING_NAME_PREFIX);

function isMainPattern(
  pattern: common_TechCardSizePattern,
  bomByKey: ReadonlyMap<string, common_TechCardBomItem>,
): boolean {
  if (pattern.fabricPurpose === PURPOSE.main) return true;
  const item = bomByKey.get(pattern.bomLineKey?.trim() ?? '');
  if (!item) return false;
  return item.purpose === PURPOSE.main || item.section === SECTION.fabric;
}

function mainPatterns(
  patterns: readonly common_TechCardSizePattern[],
  bomByKey: ReadonlyMap<string, common_TechCardBomItem>,
): common_TechCardSizePattern[] {
  const dxfs = patterns.filter((pattern) => !isGenerated(pattern) && isDxfUrl(pattern.url));
  const explicit = dxfs.filter((pattern) => isMainPattern(pattern, bomByKey));
  if (explicit.length) return explicit;
  // Legacy cards predate pattern scoping. Only use unbound sheets as the main-fabric fallback.
  return dxfs.filter(
    (pattern) =>
      !pattern.bomLineKey?.trim() &&
      (!pattern.fabricPurpose || pattern.fabricPurpose === unsetPurpose),
  );
}

function tokenIndex(sizes: readonly common_Size[], cardSizeIds: readonly number[]) {
  const idRank = new Map(cardSizeIds.map((id, rank) => [id, rank]));
  const byToken = new Map<string, { id: number; rank: number; token: string }>();
  for (const size of sizes) {
    const id = size.id ?? 0;
    if (!id) continue;
    const tokens = sizeTokensOf(size.name);
    for (const token of tokens)
      byToken.set(bareToken(token), {
        id,
        rank: idRank.get(id) ?? Number.MAX_SAFE_INTEGER,
        token,
      });
  }
  return byToken;
}

function signedAreaCm2(points: readonly { x: number; y: number }[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return twice / 2;
}

function dartPolygons(piece: PieceDTO): PtMm[][] {
  return (piece.inner ?? []).flatMap((path) => {
    if (!path.closed || path.pts.length < 3) return [];
    const area = Math.abs(signedAreaCm2(path.pts));
    if (!(area > 0.05 && area < piece.areaCm2 * 0.15)) return [];
    const xs = path.pts.map((point) => point.x);
    const ys = path.pts.map((point) => point.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    // The parser writes/reads drills as 1 × 1 cm closed squares; those are not dart holes.
    if (path.pts.length === 4 && Math.abs(width - 1) < 0.08 && Math.abs(height - 1) < 0.08)
      return [];
    return [path.pts.map((point) => ({ x: point.x * 10, y: point.y * 10 }))];
  });
}

function sourceGrain(piece: PieceDTO, layer: string): FusingSourceSize['grain'] {
  const candidates = (piece.grain ?? []).filter((candidate) => !layer || candidate.layer === layer);
  const grain = candidates.length === 1 ? candidates[0] : null;
  if (!grain) return null;
  const dx = piece.originX ?? 0;
  const dy = piece.originY ?? 0;
  return {
    a: { x: (grain.a.x - dx) * 10, y: (grain.a.y - dy) * 10 },
    b: { x: (grain.b.x - dx) * 10, y: (grain.b.y - dy) * 10 },
  };
}

function aliasIsMain(
  alias: common_TechCardPieceDxfAlias,
  bomByKey: ReadonlyMap<string, common_TechCardBomItem>,
): boolean {
  if (alias.fabricPurpose === PURPOSE.main) return true;
  const bom = bomByKey.get(alias.bomLineKey?.trim() ?? '');
  return bom?.purpose === PURPOSE.main || bom?.section === SECTION.fabric;
}

function sourcePieces(
  parsed: readonly PieceDTO[],
  cardPieces: readonly common_TechCardPiece[],
  aliases: readonly common_TechCardPieceDxfAlias[],
  bomByKey: ReadonlyMap<string, common_TechCardBomItem>,
  dictionarySizes: readonly common_Size[],
  cardSizeIds: readonly number[],
  baseSizeId: number | null | undefined,
  seamAllowanceMm: number | null,
): {
  pieces: FusingSourcePiece[];
  warnings: string[];
  unmatchedFused: string[];
  /** source identity (lower case) → the card piece it was matched to. */
  pieceLineKeyByIdentity: Map<string, string>;
} {
  const warnings: string[] = [];
  const tokens = tokenIndex(dictionarySizes, cardSizeIds);
  const dictSet = new Set(tokens.keys());
  const split = splitPiecesBySize(parsed, dictSet);
  const contourLayer = defaultContourLayer(layerOptions(parsed, split.codeById));
  const chosen = contourLayer
    ? parsed.filter((piece) => piece.layer === contourLayer)
    : [...parsed];
  const grainLayer = defaultGrainLayer(grainLayerOptions(chosen));
  const cardByKey = new Map(
    cardPieces.map((piece) => [(piece.lineKey ?? '').trim().toLowerCase(), piece]),
  );
  const pieceForIdentity = new Map<string, common_TechCardPiece>();
  for (const alias of aliases) {
    if (!aliasIsMain(alias, bomByKey)) continue;
    const cardPiece = cardByKey.get((alias.pieceLineKey ?? '').trim().toLowerCase());
    if (!cardPiece) continue;
    const identity = aliasIdentity(alias.blockName ?? '', split).toLowerCase();
    if (identity) pieceForIdentity.set(identity, cardPiece);
  }
  // Exact names are a safe fallback for an old card that predates the alias table.
  for (const cardPiece of cardPieces) {
    const identity = normBlock(cardPiece.name ?? '').toLowerCase();
    if (identity && !pieceForIdentity.has(identity)) pieceForIdentity.set(identity, cardPiece);
  }

  const byIdentity = new Map<string, { spelling: string; rows: PieceDTO[] }>();
  for (const piece of chosen) {
    const code = split.codeById.get(piece.id);
    const identity = normBlock(code?.identity ?? piece.blockName ?? '');
    if (!identity) continue;
    const key = identity.toLowerCase();
    const group = byIdentity.get(key) ?? { spelling: identity, rows: [] };
    group.rows.push(piece);
    byIdentity.set(key, group);
  }

  const out: FusingSourcePiece[] = [];
  const matchedFused = new Set<common_TechCardPiece>();
  const pieceLineKeyByIdentity = new Map<string, string>();
  for (const [identityKey, group] of byIdentity) {
    const cardPiece = pieceForIdentity.get(identityKey);
    if (cardPiece?.fused) matchedFused.add(cardPiece);
    const pieceLineKey = cardPiece?.lineKey?.trim();
    if (pieceLineKey) pieceLineKeyByIdentity.set(identityKey, pieceLineKey);
    const bySize = new Map<string, PieceDTO>();
    for (const row of group.rows) {
      const code = split.codeById.get(row.id);
      const rawSize = row.manifest?.size || code?.size || '';
      const sizeKey = bareToken(rawSize);
      if (bySize.has(sizeKey)) {
        warnings.push(`${group.spelling}_${rawSize || 'UNI'}: duplicate contour ignored`);
        continue;
      }
      bySize.set(sizeKey, row);
    }
    const sizes: FusingSourceSize[] = [];
    for (const [sizeKey, row] of bySize) {
      const code = split.codeById.get(row.id);
      const rawToken = row.manifest?.size || code?.size || '';
      const known = tokens.get(sizeKey);
      const ungraded = cardPiece?.ungraded ?? !rawToken;
      const sizeId = row.manifest?.sizeId || known?.id || (ungraded ? baseSizeId ?? 0 : 0);
      const sizeToken = rawToken || known?.token || 'BASE';
      const rank =
        known?.rank !== undefined && known.rank !== Number.MAX_SAFE_INTEGER
          ? known.rank
          : split.orderOfSize.get(rawToken) ?? sizes.length;
      sizes.push({
        sizeToken,
        sizeId,
        rank,
        outline: row.poly.map((point) => ({ x: point.x * 10, y: point.y * 10 })),
        darts: dartPolygons(row),
        grain: sourceGrain(row, grainLayer),
      });
    }
    if (!sizes.length) continue;
    out.push({
      identity: group.spelling,
      displayName: cardPiece?.name?.trim() || group.spelling,
      piecesPerGarment: Math.max(1, cardPiece?.piecesPerGarment ?? 1),
      ungraded: cardPiece?.ungraded ?? !sizes.some((size) => size.sizeToken !== 'BASE'),
      fuse: cardPiece ? fuseSpecFromPiece(cardPiece) : null,
      seamAllowanceMm,
      sizes,
    });
  }
  return {
    pieces: out,
    warnings,
    unmatchedFused: cardPieces
      .filter((piece) => piece.fused && !matchedFused.has(piece))
      .map((piece) => piece.name?.trim() || piece.lineKey?.trim() || 'unnamed piece'),
    pieceLineKeyByIdentity,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 3 * 0x2000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function samePatterns(
  left: readonly common_TechCardSizePattern[],
  right: readonly common_TechCardSizePattern[],
) {
  const material = (rows: readonly common_TechCardSizePattern[]) =>
    rows.map((row) => ({
      lineKey: row.lineKey,
      url: row.url,
      filename: row.filename,
      sizeId: row.sizeId,
      name: row.name,
      bomLineKey: row.bomLineKey,
      fabricPurpose: row.fabricPurpose,
      sha256: row.sha256,
    }));
  return JSON.stringify(material(left)) === JSON.stringify(material(right));
}

const ECHO_AWARE = {
  machineFieldsAware: true,
  assemblyAware: true,
  mediaAware: true,
  operationKindsAware: true,
  operationWorkAware: true,
  operationDraftAware: true,
  operationReviewAware: true,
  bomQtyAware: true,
  labelsAware: true,
} satisfies Partial<common_TechCardInsert>;

/**
 * Rebuilds and atomically reattaches generated fusing DXFs. Files upload first; one UpdateTechCard
 * then replaces current generated rows and removes generated rows for no-longer-used lines.
 */
export async function regenerateFusingSheets(
  techCardId: number,
): Promise<RegenerateFusingSheetsResult> {
  if (!Number.isInteger(techCardId) || techCardId <= 0)
    throw new Error('techCardId must be positive');
  const response = await adminService.GetTechCard({ id: techCardId, vatCountryCode: undefined });
  const stored = response.techCard;
  const card = stored?.techCard;
  if (!stored || !card) throw new Error(`tech card ${techCardId} was not found`);
  const bom = card.bomItems ?? [];
  const cardPieces = card.pieces ?? [];
  const oldPatterns = card.patterns ?? [];
  const bomByKey = new Map(bom.map((item) => [item.lineKey?.trim() ?? '', item]));
  const lines = interliningLines(bom);
  const fused = cardPieces.some((piece) => piece.fused);
  const warnings: string[] = [];
  let built: BuildFusingSheetsResult = { sheets: [], warnings: [], skippedSizes: [] };
  let pieceLineKeyByIdentity = new Map<string, string>();

  if (fused && lines.length) {
    const patterns = mainPatterns(oldPatterns, bomByKey);
    if (!patterns.length) throw new Error('no main-fabric DXF sheet is attached to the tech card');
    const blobs = await Promise.all(
      patterns.map(async (pattern) => ({
        name: pattern.filename?.trim() || `pattern-${pattern.lineKey ?? 'sheet'}.dxf`,
        blob: await fetchMediaBlob(pattern.url!),
      })),
    );
    let files: File[];
    const filedSizes = patterns.map((pattern) => pattern.sizeId ?? 0);
    const perSizeSet =
      patterns.length > 1 &&
      filedSizes.every((sizeId) => sizeId > 0) &&
      new Set(filedSizes).size === filedSizes.length;
    if (perSizeSet) {
      const merged = await mergeDxfSet(
        await Promise.all(
          blobs.map(async ({ name, blob }, index) => ({
            id: String(index),
            name,
            bytes: await blob.arrayBuffer(),
          })),
        ),
        { checkCancel: () => undefined },
      );
      warnings.push(...merged.notes);
      files = [
        new File([merged.bytes], merged.name, {
          type: 'image/vnd.dxf',
        }),
      ];
    } else {
      files = blobs.map(({ name, blob }) => new File([blob], name, { type: 'image/vnd.dxf' }));
    }
    const worker = new NestingWorkerClient();
    try {
      const parsed = await worker.parse(files, {
        unit: 'auto',
        tol: NEST_DEFAULTS.tol,
        tolChain: NEST_DEFAULTS.tolChain,
      });
      warnings.push(...parsed.warnings);
      if (parsed.failedFiles || parsed.skippedBlocks)
        throw new Error(
          `main-fabric DXF parse is incomplete (${parsed.failedFiles} failed file(s), ${parsed.skippedBlocks} skipped block(s))`,
        );
      const dictionary = (await adminService.GetDictionary({})).dictionary;
      const prepared = sourcePieces(
        parsed.pieces,
        cardPieces,
        card.pieceDxfAliases?.items ?? [],
        bomByKey,
        dictionary?.sizes ?? [],
        card.sizeIds ?? [],
        card.baseSampleSizeId,
        Number(card.requiredSeamAllowanceMm?.value ?? NaN),
      );
      warnings.push(...prepared.warnings);
      pieceLineKeyByIdentity = prepared.pieceLineKeyByIdentity;
      if (prepared.unmatchedFused.length)
        throw new Error(
          `fused card pieces are not linked to the main DXF: ${prepared.unmatchedFused.join(', ')}`,
        );
      built = buildFusingSheets({
        techCardId,
        style: card.styleNumber?.trim() || card.name?.trim() || `style-${techCardId}`,
        baseSizeId: card.baseSampleSizeId,
        bomLines: lines,
        pieces: prepared.pieces,
      });
      warnings.push(...built.warnings);
    } finally {
      worker.terminate();
    }
  } else if (fused && !lines.length) {
    warnings.push('fused pieces exist, but the BOM has no interlining line');
  }

  const oldGenerated = oldPatterns.filter(isGenerated);
  const oldByLine = new Map(
    oldGenerated.map((pattern) => [pattern.bomLineKey?.trim() ?? '', pattern]),
  );
  const replacements = new Map<string, common_TechCardSizePattern>();
  let uploaded = 0;
  let reused = 0;
  const uploadedSheets = oldPatterns.filter((pattern) => !isGenerated(pattern));
  const scopes = rollGoodsScopes(bom);
  const { bindings, blocked, linked } = planFusingLines({
    lines: lines.map((line) => {
      const scope = scopes.find((candidate) =>
        candidate.lines.some((l) => l.lineKey.trim() === line.bomLineKey),
      );
      return {
        bomLineKey: line.bomLineKey,
        effectiveScope: scope?.key ?? line.bomLineKey,
        soloPurpose: scope?.byPurpose && scope.lines.length === 1 ? scope.key : '',
      };
    }),
    uploadedScopes: uploadedSheets.map((sheet) =>
      scopeKeyOfBinding(sheet.fabricPurpose, sheet.bomLineKey, scopes),
    ),
  });
  // A line whose effective scope an uploaded sheet holds: the uploaded sheet wins fully. Nothing is
  // generated and a generated sheet it already has is REMOVED (nextGeneratedPatterns). Its links
  // cannot be told from the owner's, so they stay as they are and a warning says so.
  const removedBlocked: common_TechCardSizePattern[] = [];
  for (const key of blocked) {
    const old = oldByLine.get(key);
    if (old) removedBlocked.push(old);
    const label = lines.find((line) => line.bomLineKey === key)?.label ?? key;
    if (old)
      warnings.push(
        `${label}: an uploaded sheet holds this interlining, generated sheet removed, its piece links left as they are`,
      );
    else if (built.sheets.some((sheet) => sheet.bomLineKey === key))
      warnings.push(`${label}: an uploaded sheet holds this interlining, not generated`);
  }
  const activeSheets = built.sheets.filter((sheet) => !blocked.has(sheet.bomLineKey));
  for (const sheet of activeSheets) {
    const binding = bindings.get(sheet.bomLineKey)!;
    const fabricPurpose = binding.fabricPurpose as common_TechCardBomPurpose;
    const bytes = new TextEncoder().encode(sheet.dxfText);
    const digest = await sha256Hex(bytes);
    const old = oldByLine.get(sheet.bomLineKey);
    if (old && digest && old.sha256 === digest) {
      replacements.set(sheet.bomLineKey, { ...old, fabricPurpose, bomLineKey: binding.bomLineKey });
      reused++;
      continue;
    }
    const filename = clampUtf8Bytes(sheet.filename, MAX_PATTERN_FILENAME);
    let uploadedFile;
    try {
      uploadedFile = await adminService.UploadPattern({ raw: bytesToBase64(bytes), filename });
    } catch (error) {
      throw new Error(patternUploadErrorMessage(error));
    }
    uploaded++;
    replacements.set(sheet.bomLineKey, {
      sizeId: 0,
      url: uploadedFile.url ?? '',
      filename: uploadedFile.filename ?? filename,
      sizeBytes: Number(uploadedFile.sizeBytes ?? bytes.byteLength) || bytes.byteLength,
      version: 0,
      uploadedAt: undefined,
      name: clampUtf8Bytes(
        `${GENERATED_FUSING_NAME_PREFIX}${
          lines.find((line) => line.bomLineKey === sheet.bomLineKey)?.code ?? sheet.bomLineKey
        }`,
        MAX_PATTERN_NAME,
      ),
      viewUrl: undefined,
      downloadUrl: undefined,
      lineKey: old?.lineKey?.trim() || ulid(),
      bomLineKey: binding.bomLineKey,
      // Purpose only when it names this line alone (planFusingLines): several interlinings under
      // one purpose would collapse into one scope.
      fabricPurpose,
      sha256: digest,
      history: undefined,
    });
  }

  const nextPatterns = nextGeneratedPatterns(oldPatterns, isGenerated, replacements);
  const oldAliases = card.pieceDxfAliases?.items ?? [];
  const aliasPlan = nextFusingAliases({
    current: oldAliases,
    // Ours to clean: the old sheet of a linked line, or one the rebuild bound to a purpose itself.
    previousGenerated: oldGenerated.filter((pattern) => {
      const key = pattern.bomLineKey?.trim() ?? '';
      if (blocked.has(key)) return false;
      const purpose = (pattern.fabricPurpose ?? '').trim();
      return linked.has(key) || (!!purpose && purpose !== unsetPurpose);
    }),
    // A removed blocked sheet and an unlinked (line-bound) sheet occupy their scopes like uploaded
    // ones: their links are not touched.
    otherSheets: [
      ...uploadedSheets,
      ...removedBlocked,
      ...activeSheets
        .filter((sheet) => !linked.has(sheet.bomLineKey))
        .map((sheet) => bindings.get(sheet.bomLineKey)!),
    ],
    sheets: activeSheets
      .filter((sheet) => linked.has(sheet.bomLineKey))
      .map((sheet) => ({
        binding: bindings.get(sheet.bomLineKey)!,
        links: sheet.aliases.flatMap((alias) => {
          const pieceLineKey = pieceLineKeyByIdentity.get(normBlock(alias.identity).toLowerCase());
          return pieceLineKey ? [{ blockName: alias.blockName, pieceLineKey }] : [];
        }),
      })),
  });
  for (const key of aliasPlan.shared)
    warnings.push(`piece links of scope ${key} left as they are: an uploaded sheet shares it`);
  const nextAliases = aliasPlan.rows.map(
    (row): common_TechCardPieceDxfAlias => ({
      bomLineKey: row.bomLineKey,
      blockName: row.blockName,
      pieceLineKey: row.pieceLineKey,
      fabricPurpose: row.fabricPurpose as common_TechCardBomPurpose | undefined,
    }),
  );
  const aliasesChanged = !sameAliasSet(oldAliases, nextAliases);
  const changed = !samePatterns(oldPatterns, nextPatterns) || aliasesChanged;
  if (changed) {
    await adminService.UpdateTechCard({
      id: techCardId,
      // The body is the stored card echoed back, so it does carry every gated field it holds —
      // without the flags the server refuses it as an outdated client (machine/press steps etc.).
      techCard: {
        ...card,
        ...ECHO_AWARE,
        patterns: nextPatterns,
        // The links of the generated sheets' blocks to their pieces ride in the same write; every
        // other row is echoed as read.
        pieceDxfAliases: { items: nextAliases },
      },
      expectedLockVersion: stored.lockVersion,
      snapshotReason: 'Regenerate generated fusing DXF sheets',
    });
  }
  return {
    generated: activeSheets.length,
    uploaded,
    reused,
    removed: oldGenerated.filter((pattern) => !replacements.has(pattern.bomLineKey?.trim() ?? ''))
      .length,
    changed,
    ...(changed ? { lockVersion: (stored.lockVersion ?? 0) + 1 } : {}),
    warnings,
    skippedSizes: built.skippedSizes,
  };
}
