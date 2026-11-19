import { readManifestBytes } from '../manifest';
import type { DxfPieceSpecContourBoundaryV1 } from '../dxf-piece-spec-provenance-bridge-v1';
import { readProtectedLineSplit } from '../write/read-protected-line-split';
import type {
  RetainedLineSplit,
  ReviewedAddPointOpen,
  ReviewedAddPointAtWrite,
  WriteJob,
} from '../types';

function requireReview(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`Reviewed Add point worker refused: ${message}.`);
}

/** A fresh native PathId must be the exact path retained by ordinary semantics for the emitted block. */
export async function identifyReviewedAddPoint(input: {
  bytes: ArrayBuffer;
  fileId: string;
  wire: ReviewedAddPointOpen;
  atWrite?: ReviewedAddPointAtWrite;
  job: WriteJob;
  sourceOf: Record<string, string>;
  contours: readonly DxfPieceSpecContourBoundaryV1[] | null;
}): Promise<RetainedLineSplit> {
  const { bytes, fileId, wire: w, job, sourceOf, contours } = input;
  const manifest = readManifestBytes(bytes);
  const tagged = manifest?.blocks.filter((b) => b.protectedLineSplit);
  const entry = tagged?.[0],
    record = entry?.protectedLineSplit,
    size = job.sizes[0];
  requireReview(
    manifest && tagged?.length === 1 && entry && record,
    'one embedded occurrence is required',
  );
  requireReview(
    job.techCardId === w.techCardId &&
      manifest.techCardId === w.techCardId &&
      job.scope.scopeKey === w.scopeKey &&
      job.scope.fabricPurpose === manifest.scope.fabricPurpose &&
      job.scope.bomLineKey === manifest.scope.bomLineKey &&
      job.sizes.length === 1 &&
      size?.sizeId === w.sizeId &&
      size.token === w.sizeToken &&
      size.rank === w.rank &&
      entry.block === w.block &&
      entry.identity === w.identity &&
      entry.sizeId === w.sizeId &&
      entry.sizeToken === w.sizeToken &&
      (w.authority === 'verified-saved-read'
        ? w.fileSha256 === w.rowSha256
        : w.authority === undefined && record.sourceSha256 === w.rowSha256) &&
      record.ringSha256 === w.ringSha256 &&
      record.entityId === w.entityId,
    'card, scope, size, input block or locked occurrence changed',
  );
  const auth = input.atWrite;
  requireReview(
    auth &&
      auth.authority === w.authority &&
      auth.fileSha256 === w.fileSha256 &&
      auth.techCardId === w.techCardId &&
      auth.scopeKey === w.scopeKey &&
      auth.pieceLineKey === w.pieceLineKey,
    'current phase has no matching card-line authorization',
  );
  const aliases = auth.aliases;
  requireReview(
    Array.isArray(aliases) &&
      aliases.length > 0 &&
      aliases.length <= 2 &&
      new Set(aliases.map((a) => a.blockName)).size === aliases.length &&
      typeof w.pieceLineKey === 'string' &&
      !!w.pieceLineKey &&
      aliases.every(
        (a) =>
          a.scopeKey === w.scopeKey &&
          a.pieceLineKey === w.pieceLineKey &&
          (a.blockName === entry.identity || a.blockName === entry.block),
      ),
    'missing or ambiguous current card alias',
  );
  requireReview(
    Object.hasOwn(sourceOf, w.identity) &&
      sourceOf[w.identity] === entry.identity &&
      job.pieces.filter((p) => p.identity === w.identity).length === 1,
    'original and emitted block identities differ',
  );
  const proof = await readProtectedLineSplit(bytes, fileId, {
    fileSha256: w.fileSha256,
    block: entry.block,
    record,
  });
  const hits = contours?.filter((c) => c.lineage.sourcePathIds.includes(proof.pathId));
  const c = hits?.[0],
    line = c?.lineage;
  requireReview(
    hits?.length === 1 &&
      c &&
      line &&
      c.pieceId === entry.identity &&
      c.sizeToken === w.sizeToken &&
      c.closed &&
      c.geometry.kind === record.role &&
      line.sourcePathIds.length === 1 &&
      line.uniformPositiveScale === 1 &&
      line.cyclicShift === 0 &&
      line.direction === 'forward' &&
      line.mutations.length === 0,
    'ordinary semantics did not map the original native PathId to the same unchanged piece, size and boundary',
  );
  return {
    block: w.block,
    identity: w.identity,
    sizeId: w.sizeId,
    sizeToken: w.sizeToken,
    rank: w.rank,
    record,
  };
}
