import type { common_Size, common_TechCard } from 'api/proto-http/admin';
import { sha256Hex } from 'lib/features/sha256';
import { buildFusingSheets } from 'lib/fusing-dxf/dxf';
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

import {
  completeSavedAssemblyRowIdentityV1,
  isVerifiedCompleteSavedAssemblySourceV1,
  type CompleteSavedAssemblySourceV1,
} from './saved-assembly-complete-source-rpc-v1';

type Member = CompleteSavedAssemblySourceV1['rows'][number];

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
    !loadDxf(fusingBytes.buffer).generatedFusing
  )
    throw new Error(
      'The downloaded main or generated fusing bytes differ from the saved Assembly.',
    );

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
    dictionary,
    techCard.sizeIds,
    techCard.baseSampleSizeId,
    Number(techCard.requiredSeamAllowanceMm?.value ?? NaN),
  );
  const mapped = await attachGradeMaps(
    prepared.pieces,
    techCard.baseSampleSizeId,
    async (jobs) => runGradeMapJobs(jobs),
    mainSha256,
  );
  signal.throwIfAborted();
  const rebuilt = buildFusingSheets({
    techCardId: mainRow.techCardId,
    style: techCard.styleNumber?.trim() || techCard.name?.trim() || `style-${mainRow.techCardId}`,
    createdAt: newestUpload([mainPattern]),
    baseSizeId: techCard.baseSampleSizeId,
    bomLines: [
      {
        bomLineKey: bomKey,
        code: line.supplierRef?.trim() || line.name?.trim() || bomKey.slice(0, 10),
        label: line.name?.trim() || line.supplierRef?.trim() || bomKey,
      },
    ],
    pieces: mapped.pieces,
  });
  const [sheet] = rebuilt.sheets;
  if (
    rebuilt.sheets.length !== 1 ||
    !sheet ||
    rebuilt.skippedSizes.length ||
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
  const placements = sheet.blockPlacements.filter((placement) => placement.sizeId === sizeId);
  if (!placements.length)
    throw new Error('The generated fusing DXF has no coverage in this saved garment size.');
  const savedFusing = parseDxf(fusingBytes.buffer, 'mm');
  const parts = placements.map((placement) => {
    const pieceLineKey = ownerBySourceIdentity.get(placement.sourceIdentity);
    if (!pieceLineKey) throw new Error('A generated fusing block lost its saved piece owner.');
    const block = savedFusing.dxf.blocks[placement.blockName];
    const { a, b, c, d, e, f } = placement.hostLocalToBlock;
    if (!block?.entities || a !== 1 || b !== 0 || c !== 0 || d !== 1)
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
