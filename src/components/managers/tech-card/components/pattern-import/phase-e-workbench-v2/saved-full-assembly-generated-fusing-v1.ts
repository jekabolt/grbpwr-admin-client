import type { common_Size, common_TechCard } from 'api/proto-http/admin';
import { sizeTokensOf } from '../../nesting/block-code';
import { sha256Hex } from 'lib/features/sha256';
import {
  buildFusingSheets,
  reconstructHistoricalFusingForVerificationV1,
  type GeneratedFusingSheet,
} from 'lib/fusing-dxf/dxf';
import { runGradeMapJobs } from 'lib/fusing-dxf/grade-map-job';
import { attachGradeMaps } from 'lib/fusing-dxf/grade-map-source';
import { isGenerated, newestUpload, sourcePieces } from 'lib/fusing-dxf/regenerate';
import { entityToChain } from 'lib/nesting/dxf/entities';
import { parseDxf } from 'lib/nesting/dxf/parse';
import { signedArea } from 'lib/nesting/geom/polygon';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { parseSheets } from 'lib/nesting/worker/parse-files';
import { loadDxf } from 'lib/pattern-import/adapters/dxf/tags';
import { SECTION } from 'lib/pattern-import/fabrics/scope';
import type { CardDraft, CardSize } from 'lib/pattern-import/types';
import { bindSavedFullAssemblyNativeCutPathsV1 } from './saved-full-assembly-native-boundaries-v1';

import {
  completeSavedAssemblyRowIdentityV1,
  isVerifiedCompleteSavedAssemblySourceV1,
  type CompleteSavedAssemblySourceV1,
} from './saved-assembly-complete-source-rpc-v1';

type Member = CompleteSavedAssemblySourceV1['rows'][number];
type ParsedFusing = ReturnType<typeof parseDxf>;

function historicalFusingStamp(parsed: ParsedFusing): string {
  const { entities } = parsed.dxf;
  const header: Record<string, unknown> | undefined = parsed.dxf.header;
  const invalidStamp = () =>
    new Error('Historical fusing needs one exact model-space R12 UTC stamp.');
  if (header?.['$ACADVER'] !== 'AC1009' || header['$INSUNITS'] !== 4) throw invalidStamp();
  function oneText(label: string) {
    const matches = entities.filter(
      (entity) =>
        entity.type === 'TEXT' &&
        'text' in entity &&
        typeof entity.text === 'string' &&
        entity.text.startsWith(label + ':'),
    );
    const [entity] = matches;
    if (
      matches.length !== 1 ||
      !entity ||
      entity.layer !== '1' ||
      entity.inPaperSpace ||
      !('text' in entity)
    )
      throw invalidStamp();
    return entity.text as string;
  }
  const date = /^Creation Date: ([0-9]{2})-([0-9]{2})-([0-9]{4})$/.exec(oneText('Creation Date'));
  const time = /^Creation Time: ([0-9]{2}):([0-9]{2})$/.exec(oneText('Creation Time'));
  if (
    oneText('Author') !== 'Author: GRBPWR' ||
    oneText('Product') !== 'Product: grbpwr pattern-import' ||
    oneText('Version') !== 'Version: 3' ||
    oneText('Units') !== 'Units: METRIC' ||
    !date ||
    !time
  )
    throw invalidStamp();
  const utc = `${date[3]}-${date[2]}-${date[1]}T${time[1]}:${time[2]}:00.000Z`;
  const parsedUtc = new Date(utc);
  if (!Number.isFinite(parsedUtc.getTime()) || parsedUtc.toISOString() !== utc)
    throw invalidStamp();
  return utc;
}

function historicalFusingDictionary(
  dictionary: readonly common_Size[],
  cardSizeIds: readonly number[],
  currentSizes: readonly CardSize[],
): common_Size[] {
  // The archive serializes numeric size keys by ID. Test a single deterministic historical
  // ordering against the saved bytes. GetDictionary supplies no historical order or revision.
  const names = new Map(dictionary.map(({ id, name }) => [id, name]));
  if (
    names.size !== dictionary.length ||
    dictionary.some(
      ({ id, name }) => !Number.isSafeInteger(id) || !id || id < 0 || !name?.trim(),
    ) ||
    cardSizeIds.some((id) => !names.has(id))
  )
    throw new Error('Historical fusing requires a complete, unique size dictionary.');
  if (
    currentSizes.some(
      ({ sizeId, token }) => sizeTokensOf(names.get(sizeId))[0]?.toUpperCase() !== token,
    )
  )
    throw new Error('Historical fusing requires exact current card size tokens.');
  return [...dictionary].sort((a, b) => a.id! - b.id!);
}

async function historicalFusingSelectedPlacements(
  source: CompleteSavedAssemblySourceV1,
  mainRow: Member,
  main: Readonly<{ draft: CardDraft; sizes: readonly CardSize[] }>,
  cardSizeIds: readonly number[],
  selectedSizeId: number,
  sheet: GeneratedFusingSheet,
  parsed: ParsedFusing,
  hostByIdentity: ReadonlyMap<string, string>,
  signal: AbortSignal,
) {
  const expectedTokens = new Set(main.sizes.map(({ token }) => token));
  const expectedIds = new Set(main.sizes.map(({ sizeId }) => sizeId));
  const selected = main.sizes.find(({ sizeId }) => sizeId === selectedSizeId);
  const blockNames = new Set(sheet.blockPlacements.map(({ blockName }) => blockName));
  if (
    !selected ||
    expectedTokens.size !== cardSizeIds.length ||
    expectedIds.size !== cardSizeIds.length ||
    cardSizeIds.some((id) => !expectedIds.has(id)) ||
    hostByIdentity.size !== sheet.aliases.length ||
    sheet.blockPlacements.length !== expectedTokens.size * hostByIdentity.size ||
    blockNames.size !== sheet.blockPlacements.length ||
    sheet.blocks.length !== blockNames.size ||
    sheet.blocks.some((blockName) => !blockNames.has(blockName) || !parsed.dxf.blocks[blockName])
  )
    throw new Error('Historical fusing is missing an exact block at a current garment rank.');
  for (const identity of hostByIdentity.keys()) {
    const tokens = new Set(
      sheet.blockPlacements
        .filter(({ sourceIdentity }) => sourceIdentity === identity)
        .map(({ sizeToken }) => sizeToken),
    );
    if (
      tokens.size !== expectedTokens.size ||
      [...expectedTokens].some((token) => !tokens.has(token))
    )
      throw new Error('Historical fusing is missing an exact block at a current garment rank.');
  }
  const cuts = await bindSavedFullAssemblyNativeCutPathsV1(
    source,
    { row: completeSavedAssemblyRowIdentityV1(mainRow), draft: main.draft },
    selected.token,
    signal,
  );
  const hostByLineKey = new Map(cuts.map((cut) => [cut.pieceLineKey, cut]));
  for (const [identity, lineKey] of hostByIdentity) {
    if (hostByLineKey.get(lineKey)?.blockName !== identity)
      throw new Error('A historical fusing block has no exact current MAIN native cut.');
  }
  // The historical writer's global dictionary can resolve "M" to another family ID.
  // Only the current verified MAIN size token and native cut binding select the restored rank.
  return sheet.blockPlacements.filter(({ sizeToken }) => sizeToken === selected.token);
}

function savedPattern(card: common_TechCard, row: Member) {
  const rows =
    card.techCard?.patterns?.filter((pattern) => pattern.lineKey === row.patternLineKey) ?? [];
  const [pattern] = rows;
  if (
    rows.length !== 1 ||
    !pattern ||
    pattern.sha256 !== row.sha256 ||
    Number(pattern.sizeBytes) !== row.sizeBytes ||
    pattern.version !== row.patternVersion
  )
    throw new Error('The card projection no longer contains the exact saved DXF revision.');
  return pattern;
}

/** Validates generated cut-layer registration through the existing fusing writer and exact saved bytes. */
export async function replaySavedFullAssemblyGeneratedFusingV1(
  input: Readonly<{
    source: CompleteSavedAssemblySourceV1;
    card: common_TechCard;
    sizeDictionary: readonly common_Size[];
    sizeId: number;
    fusingScopeKey: string;
    mainBytes: Uint8Array;
    fusingBytes: Uint8Array;
    nativeMain?: Readonly<{ draft: CardDraft; sizes: readonly CardSize[] }>;
  }>,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const { source, sizeId, fusingScopeKey } = input;
  if (!isVerifiedCompleteSavedAssemblySourceV1(source))
    throw new Error('A verified complete saved Assembly source is required for fusing.');
  const card = structuredClone(input.card);
  const dictionary = structuredClone(input.sizeDictionary);
  const mainBytes = new Uint8Array(input.mainBytes);
  const fusingBytes = new Uint8Array(input.fusingBytes);
  const mainRows = source.rows.filter(({ scopeKey }) => scopeKey === 'main');
  const fusingRows = source.rows.filter(({ scopeKey }) => scopeKey === fusingScopeKey);
  const [mainRow] = mainRows;
  const [fusingRow] = fusingRows;
  const techCard = card.techCard;
  if (
    !techCard ||
    mainRows.length !== 1 ||
    !mainRow ||
    fusingRows.length !== 1 ||
    !fusingRow ||
    fusingRow === mainRow ||
    card.id !== mainRow.techCardId ||
    card.lockVersion !== mainRow.cardLockVersion ||
    !techCard.sizeIds?.includes(sizeId)
  )
    throw new Error(
      'The selected size and saved Assembly do not identify one main and fusing DXF.',
    );

  const mainPattern = savedPattern(card, mainRow);
  const fusingPattern = savedPattern(card, fusingRow);
  const bom = techCard.bomItems ?? [];
  const bomKey = fusingPattern.bomLineKey;
  const bomByKey = new Map(bom.map((item) => [item.lineKey!, item]));
  const line = bomKey ? bomByKey.get(bomKey) : undefined;
  if (
    isGenerated(mainPattern) ||
    !isGenerated(fusingPattern) ||
    bomKey !== fusingScopeKey ||
    bom.filter((item) => item.lineKey === bomKey).length !== 1 ||
    !line ||
    line.section !== SECTION.interlining
  )
    throw new Error('The saved DXF is not the generated cut layer of this exact interlining line.');

  const [mainSha256, fusingSha256] = await Promise.all([
    sha256Hex(mainBytes),
    sha256Hex(fusingBytes),
  ]);
  signal.throwIfAborted();
  if (
    mainSha256 !== mainRow.sha256 ||
    fusingSha256 !== fusingRow.sha256 ||
    mainBytes.length !== mainRow.sizeBytes ||
    fusingBytes.length !== fusingRow.sizeBytes
  )
    throw new Error(
      'The downloaded main or generated fusing bytes differ from the saved Assembly.',
    );

  const loaded = loadDxf(fusingBytes.buffer);
  const historical = !loaded.generatedFusing;
  const nativeMain =
    historical && input.nativeMain
      ? { draft: input.nativeMain.draft, sizes: structuredClone(input.nativeMain.sizes) }
      : null;
  if (historical && (!nativeMain || loaded.binary || loaded.manifest))
    throw new Error(
      'Historical fusing requires bare R12 and the exact current MAIN native source.',
    );
  const historicalDxf = historical ? parseDxf(fusingBytes.buffer, 'mm') : null;
  const historicalStamp = historicalDxf ? historicalFusingStamp(historicalDxf) : null;
  const parsed = await parseSheets(
    [{ name: mainPattern.filename ?? 'main.dxf', open: async () => mainBytes.buffer }],
    { unit: 'auto', tol: NEST_DEFAULTS.tol, tolChain: NEST_DEFAULTS.tolChain },
  );
  signal.throwIfAborted();
  if (parsed.failedFiles || parsed.skippedBlocks)
    throw new Error('The exact main DXF could not be fully read for fusing.');
  const prepared = sourcePieces(
    parsed.pieces,
    techCard.pieces ?? [],
    techCard.pieceDxfAliases?.items ?? [],
    bomByKey,
    nativeMain
      ? historicalFusingDictionary(dictionary, techCard.sizeIds, nativeMain.sizes)
      : dictionary,
    techCard.sizeIds,
    techCard.baseSampleSizeId,
    Number(techCard.requiredSeamAllowanceMm?.value ?? NaN),
  );
  if (historical && prepared.unmatchedFused.length)
    throw new Error(
      'Historical fusing requires an exact source piece for each fused garment piece.',
    );
  const mapped = historical
    ? prepared
    : await attachGradeMaps(
        prepared.pieces,
        techCard.baseSampleSizeId,
        async (jobs) => runGradeMapJobs(jobs),
        mainSha256,
      );
  signal.throwIfAborted();
  const rebuild = {
    techCardId: mainRow.techCardId,
    style: techCard.styleNumber?.trim() || techCard.name?.trim() || `style-${mainRow.techCardId}`,
    createdAt: historicalStamp ?? newestUpload([mainPattern]),
    baseSizeId: techCard.baseSampleSizeId,
    bomLines: [
      {
        bomLineKey: bomKey,
        code: line.supplierRef?.trim() || line.name?.trim() || bomKey.slice(0, 10),
        label: line.name?.trim() || line.supplierRef?.trim() || bomKey,
      },
    ],
    pieces: mapped.pieces,
  };
  const rebuilt = historicalStamp
    ? reconstructHistoricalFusingForVerificationV1({ ...rebuild, createdAt: historicalStamp })
    : buildFusingSheets(rebuild);
  const [sheet] = rebuilt.sheets;
  if (
    rebuilt.sheets.length !== 1 ||
    !sheet ||
    rebuilt.skippedSizes.length ||
    (historical && sheet.filename !== fusingPattern.filename) ||
    (await sha256Hex(new TextEncoder().encode(sheet.dxfText))) !== fusingSha256
  )
    throw new Error('The saved fusing DXF could not be reproduced by the current generator.');
  signal.throwIfAborted();

  const fusingAliases = source.aliases.filter(({ scopeKey }) => scopeKey === fusingScopeKey);
  const mainAliases = source.aliases.filter(({ scopeKey }) => scopeKey === mainRow.scopeKey);
  if (
    sheet.aliases.length !== fusingAliases.length ||
    new Set(sheet.aliases.map(({ blockName }) => blockName)).size !== sheet.aliases.length
  )
    throw new Error('Generated fusing identities no longer match the saved Assembly aliases.');
  const ownerBySourceIdentity = new Map<string, string>();
  for (const alias of sheet.aliases) {
    const matches = fusingAliases.filter(({ blockName }) => blockName === alias.blockName);
    const hosts = mainAliases.filter(({ blockName }) => blockName === alias.identity);
    const pieceLineKey = matches[0]?.pieceLineKey;
    if (
      matches.length !== 1 ||
      hosts.length !== 1 ||
      !pieceLineKey ||
      hosts[0]?.pieceLineKey !== pieceLineKey ||
      prepared.pieceLineKeyByIdentity.get(alias.identity.toLowerCase()) !== pieceLineKey
    )
      throw new Error('A generated fusing block has no one exact main garment piece owner.');
    ownerBySourceIdentity.set(alias.identity, pieceLineKey);
  }
  const savedFusing = historicalDxf ?? parseDxf(fusingBytes.buffer, 'mm');
  const placements =
    historicalDxf && nativeMain
      ? await historicalFusingSelectedPlacements(
          source,
          mainRow,
          nativeMain,
          techCard.sizeIds,
          sizeId,
          sheet,
          historicalDxf,
          ownerBySourceIdentity,
          signal,
        )
      : sheet.blockPlacements.filter((placement) => placement.sizeId === sizeId);
  if (!placements.length)
    throw new Error('The generated fusing DXF has no coverage in this saved garment size.');
  const parts = placements.map((placement) => {
    const pieceLineKey = ownerBySourceIdentity.get(placement.sourceIdentity);
    if (!pieceLineKey) throw new Error('A generated fusing block lost its saved piece owner.');
    const block = savedFusing.dxf.blocks[placement.blockName];
    const { a, b, c, d, e, f } = placement.hostLocalToBlock;
    if (
      !block?.entities ||
      a !== 1 ||
      b !== 0 ||
      c !== 0 ||
      d !== 1 ||
      !Number.isFinite(e) ||
      !Number.isFinite(f)
    )
      throw new Error('A generated fusing block has no exact host-frame translation.');
    const loops = block.entities
      .filter((entity) => entity.layer === '1' && entity.type !== 'TEXT')
      .map((entity) => {
        const chain = entityToChain(entity, savedFusing.cmPerUnit * 10, NEST_DEFAULTS.tol);
        if (!chain?.closed || chain.pts.length < 3)
          throw new Error('A generated fusing cut ring is incomplete.');
        return Object.freeze(chain.pts.map(({ x, y }) => Object.freeze({ x: x - e, y: y - f })));
      });
    const [outer, ...holes] = loops;
    if (!outer || signedArea(outer) <= 0 || holes.some((hole) => signedArea(hole) >= 0))
      throw new Error('A generated fusing block has no unambiguous cut outline and holes.');
    return Object.freeze({
      pieceLineKey,
      blockName: placement.blockName,
      hostBlockIdentity: placement.sourceIdentity,
      sizeToken: placement.sizeToken,
      hostLocalToBlock: Object.freeze({ ...placement.hostLocalToBlock }),
      hostLocalCut: Object.freeze({ outer, holes: Object.freeze(holes) }),
    });
  });
  return Object.freeze({
    assemblySourceSha256: source.sourceSha256,
    serverAssemblyRevision: source.serverAssemblyRevision,
    mainRow: completeSavedAssemblyRowIdentityV1(mainRow),
    fusingRow: completeSavedAssemblyRowIdentityV1(fusingRow),
    selectedSizeId: sizeId,
    parts: Object.freeze(parts),
  });
}
