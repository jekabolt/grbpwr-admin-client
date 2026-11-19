import { sha256Hex } from '../adapters/vector/builder';
import { parseProtectedLineSplit } from '../manifest/protected-line-split';
import type { RetainedLineSplit, WriteJob } from '../types';
import { applyAffine } from './geom';
import type { Plan } from './plan';

function requireRetention(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error(`Reviewed vertex cannot be retained: ${reason}.`);
}

/** Restores a point only from the current job's own complete, byte-precision ring. */
export async function retainReviewedLineSplit(
  job: WriteJob,
  plan: Plan,
  retained: RetainedLineSplit,
) {
  const { identity, sizeId, sizeToken, rank } = retained,
    record = parseProtectedLineSplit(retained.record);
  requireRetention(record, 'malformed occurrence');
  const size = job.sizes[0];
  requireRetention(
    job.sizes.length === 1 &&
      size?.sizeId === sizeId &&
      size.token === sizeToken &&
      size.rank === rank,
    'size or rank changed',
  );
  const pieces = job.pieces.filter((p) => p.identity === identity);
  const blocks = plan.blocks.filter((b) => b.name === retained.block || b.identity === identity);
  const piece = pieces[0],
    block = blocks[0];
  requireRetention(
    pieces.length === 1 &&
      blocks.length === 1 &&
      piece &&
      !piece.ungraded &&
      piece.sizes.length === 1 &&
      block?.name === retained.block &&
      block.identity === identity &&
      block.sizeId === sizeId &&
      block.sizeToken === sizeToken &&
      block.rank === rank &&
      !block.derivedFrom &&
      !plan.blocks.some((b) => b.derivedFrom === identity) &&
      !block.cutLoops.length,
    'exact emitted piece or block changed',
  );
  const local = piece.sizes[0]!,
    t = block.transform;
  requireRetention(
    local.sizeId === sizeId &&
      local.sizeToken === sizeToken &&
      local.rank === rank &&
      t.a === 1 &&
      t.d === 1 &&
      t.b === 0 &&
      t.c === 0,
    'piece rank or affine changed',
  );
  const localRing = local[record.role],
    planned = block[record.role];
  requireRetention(
    localRing?.length === record.ringPointCount && planned?.length === record.ringPointCount - 1,
    'ordinary semantics or simplification changed the ring',
  );
  const written = localRing.map((p) => applyAffine(t, p));
  const coords = written.map((p) => [p.x, p.y]);
  requireRetention(
    coords.every((p) => p.every((v) => Number.isFinite(v) && v === Number(v.toFixed(6)))) &&
      (await sha256Hex(new TextEncoder().encode(JSON.stringify(coords)).buffer)) ===
        record.ringSha256,
    'current ordered geometry or written precision changed',
  );
  const i = record.pointIndex,
    len = coords.length;
  const equal = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1];
  requireRetention(
    equal(coords[(i + len - 1) % len]!, record.fromMm) &&
      equal(coords[i]!, record.pointMm) &&
      equal(coords[(i + 1) % len]!, record.toMm),
    'authored incidence changed',
  );
  requireRetention(
    planned.every((p, j) => equal([p.x, p.y], coords[j < i ? j : j + 1]!)),
    'normal writer modified another vertex or selected a different frame',
  );
  block[record.role] = written;
  block.size[record.role] = written;
  block.protectedLineSplit = record;
}
