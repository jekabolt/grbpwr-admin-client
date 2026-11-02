import type { PackedPieces, ParseOpts, PieceDTO } from '../types';
import { packPieces, packedPiecesBytes, unpackPieces } from './piece-transfer';
import { parseCacheKey, type ParseCache } from './parse-cache';
import { parseSheets, type ParsedSheets } from './parse-files';

export type ParseSource = { name: string; url: string };

export type ParsedSources = {
  parsed: ParsedSheets;
  /** Original source indices that reached parsing, in compacted-batch order. */
  sourceIndices: number[];
  /** Original source indices whose fetch failed. */
  downloadFailedIndices: number[];
};

export type CachedParsedSheet = {
  schema: 1;
  sourceName: string;
  packedPieces: PackedPieces;
  parsed: Omit<ParsedSheets, 'pieces'>;
};

function isCachedParsedSheet(value: unknown): value is CachedParsedSheet {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CachedParsedSheet>;
  return (
    candidate.schema === 1 &&
    typeof candidate.sourceName === 'string' &&
    !!candidate.packedPieces &&
    Array.isArray(candidate.packedPieces.pieces) &&
    candidate.packedPieces.coordinates instanceof Float64Array &&
    !!candidate.parsed &&
    candidate.parsed.failedFiles === 0 &&
    Array.isArray(candidate.parsed.warnings) &&
    Array.isArray(candidate.parsed.blockNames) &&
    Array.isArray(candidate.parsed.manifests) &&
    Array.isArray(candidate.parsed.manifestDistrust)
  );
}

function cachedSheet(parsed: ParsedSheets, sourceName: string): CachedParsedSheet {
  const { pieces, ...metadata } = parsed;
  return { schema: 1, sourceName, packedPieces: packPieces(pieces), parsed: metadata };
}

function cachedSheetBytes(value: CachedParsedSheet): number {
  return (
    packedPiecesBytes(value.packedPieces) +
    new TextEncoder().encode(
      JSON.stringify({ schema: value.schema, sourceName: value.sourceName, parsed: value.parsed }),
    ).byteLength
  );
}

function restoreSheet(cached: CachedParsedSheet, sourceName: string): ParsedSheets {
  const pieces = unpackPieces(cached.packedPieces);
  for (const piece of pieces) piece.source = sourceName;
  const prefix = `${cached.sourceName}:`;
  const warnings = cached.parsed.warnings.map((warning) =>
    warning.startsWith(prefix)
      ? `${sourceName}${warning.slice(cached.sourceName.length)}`
      : warning,
  );
  return { ...cached.parsed, warnings, pieces };
}

/**
 * Merge one-sheet parses back into parseSheets' batch contract.
 *
 * IDs are global and fileIndex counts every downloaded file, including one that later fails to
 * parse. Synthetic names follow the reminted id. These three details are why cached files cannot
 * simply be concatenated: all are storage identities used by marker and fabric-scope readers.
 */
export function mergeParsedSheets(sheets: readonly ParsedSheets[]): ParsedSheets {
  const pieces: PieceDTO[] = [];
  const warnings: string[] = [];
  const blockNames = new Set<string>();
  const manifests: ParsedSheets['manifests'] = [];
  const manifestDistrust: ParsedSheets['manifestDistrust'] = [];
  let detectedUnit: ParsedSheets['detectedUnit'] = 'mm';
  let failedFiles = 0;
  let skippedBlocks = 0;
  let nextId = 1;

  sheets.forEach((sheet, fileIndex) => {
    warnings.push(...sheet.warnings);
    failedFiles += sheet.failedFiles;
    skippedBlocks += sheet.skippedBlocks;
    for (const block of sheet.blockNames) blockNames.add(block);
    manifests.push(sheet.manifests[0] ?? null);
    manifestDistrust.push(sheet.manifestDistrust[0] ?? null);
    if (sheet.failedFiles === 0) detectedUnit = sheet.detectedUnit;
    for (const piece of sheet.pieces) {
      const oldId = piece.id;
      piece.id = nextId++;
      piece.fileIndex = fileIndex;
      if (!piece.blockName && piece.name === `piece ${oldId}`) piece.name = `piece ${piece.id}`;
      pieces.push(piece);
    }
  });

  return {
    pieces,
    detectedUnit,
    warnings,
    failedFiles,
    skippedBlocks,
    blockNames: [...blockNames],
    manifests,
    manifestDistrust,
  };
}

/**
 * Per-URL cache lookup, parallel download of misses, then the parser's original sequential order.
 * A download or parse failure is returned for this opening but never written. Cache failures have
 * already been reduced to misses by ParseCache and therefore follow the same ordinary path.
 */
export async function parseCachedSources(
  sources: readonly ParseSource[],
  opts: ParseOpts,
  parserVersion: string,
  cache: ParseCache<CachedParsedSheet>,
  openSource: (source: ParseSource) => Promise<ArrayBuffer>,
): Promise<ParsedSources> {
  const keys = sources.map((source) => parseCacheKey(source.url, opts, parserVersion));
  const hits = await Promise.all(keys.map((key) => cache.read(key)));
  const misses: number[] = [];
  for (let i = 0; i < hits.length; i++) {
    if (hits[i] !== undefined && !isCachedParsedSheet(hits[i])) {
      await cache.remove(keys[i]);
      hits[i] = undefined;
    }
    if (!hits[i]) misses.push(i);
  }

  // Fetch all misses before parsing any of them: the old dxfGeometry Promise.allSettled did this,
  // and making four CDN round trips serial would throw away much of the cache's cold-path gain.
  const fetched = await Promise.allSettled(misses.map((index) => openSource(sources[index])));
  const fetchedByIndex = new Map(misses.map((index, at) => [index, fetched[at]]));
  const parsedSheets: ParsedSheets[] = [];
  const sourceIndices: number[] = [];
  const downloadFailedIndices: number[] = [];

  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    const hit = hits[index];
    let parsed: ParsedSheets;
    if (hit && isCachedParsedSheet(hit)) {
      parsed = restoreSheet(hit, source.name);
    } else {
      const download = fetchedByIndex.get(index);
      if (!download || download.status === 'rejected') {
        downloadFailedIndices.push(index);
        continue;
      }
      parsed = await parseSheets([{ name: source.name, open: async () => download.value }], opts);
      // Only a complete download that also completed parsing can become evidence on a later open.
      if (parsed.failedFiles === 0) {
        const value = cachedSheet(parsed, source.name);
        await cache.write(keys[index], value, cachedSheetBytes(value));
      }
    }
    sourceIndices.push(index);
    parsedSheets.push(parsed);
  }

  return {
    parsed: mergeParsedSheets(parsedSheets),
    sourceIndices,
    downloadFailedIndices,
  };
}
