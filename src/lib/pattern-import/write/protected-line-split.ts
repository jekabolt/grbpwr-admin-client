import { sha256Hex } from '../adapters/vector/builder';
import {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
  projectDxfSourceNativeStraightEdgeSelectedPathsV1,
  readDxfWithSourceNativeStraightEdgeAuthorityV1,
} from '../dxf-source-native-straight-edge-authority-v1';
import { readManifestBytes } from '../manifest';
import { parseProtectedLineSplit } from '../manifest/protected-line-split';
import type { ManifestProtectedLineSplit, PtMm, WriteJob } from '../types';
import { applyAffine } from './geom';
import { num } from './format';
import type { Plan } from './plan';

/** A saved own-format file and a directed interval of that file's selected native path. */
export type AuthoredLineSplitInput = {
  file: { id: string; name: string; bytes: ArrayBuffer };
  sourceSha256: string;
  scopeKey: string;
  identity: string;
  sizeId: number;
  sizeToken: string;
  rank: number;
  role: 'cut' | 'seam';
  sourcePathId: number;
  sourceCurveId: string;
  startVertexId: string;
  endVertexId: string;
  /** Index of the already authored point in the edited job, in its source frame. */
  jobPointIndex: number;
  /** Unit parameter in the original native segment's direction. */
  progress: number;
  entityId: string;
};

const mm = (p: PtMm): [number, number] => [p.x, p.y];
const same = (p: PtMm, q: PtMm) => p.x === q.x && p.y === q.y;
function requireSplit(claim: unknown, detail: string): asserts claim {
  if (!claim) throw new Error(`Cannot preserve added vertex: ${detail}.`);
}
function unique<T>(items: T[], detail: string): T {
  requireSplit(items.length === 1, detail);
  return items[0]!;
}

/** The directed ring can begin at a different vertex or have its winding normalized by the planner. */
function sameRing(a: PtMm[], b: PtMm[]): boolean {
  if (a.length !== b.length || !a.length) return false;
  const first = b.findIndex((p) => same(p, a[0]!));
  if (first < 0) return false;
  return [1, -1].some((direction) =>
    a.every((p, i) => same(p, b[(first + b.length + direction * i) % b.length]!)),
  );
}

export async function preserveAuthoredLineSplit(
  job: WriteJob,
  plan: Plan,
  input: AuthoredLineSplitInput,
): Promise<void> {
  const { role, file } = input;
  requireSplit(role === 'cut' || role === 'seam', 'unrecognized ring role');
  const size = job.sizes[0];
  requireSplit(
    job.scope.scopeKey === input.scopeKey &&
      job.sizes.length === 1 &&
      size &&
      size.sizeId === input.sizeId &&
      size.token === input.sizeToken &&
      size.rank === input.rank,
    'scope or single selected size differs',
  );
  const piece = unique(
    job.pieces.filter((p) => p.identity === input.identity),
    'piece is missing or ambiguous',
  );
  requireSplit(
    piece.sizes.length === 1 && !piece.ungraded,
    'only a single explicitly graded size is supported',
  );
  const edited = piece.sizes[0]!;
  requireSplit(
    edited.sizeId === size.sizeId && edited.sizeToken === size.token && edited.rank === size.rank,
    'piece size differs',
  );
  const block = unique(
    plan.blocks.filter((b) => b.identity === piece.identity),
    'planned block is missing or ambiguous',
  );
  const tr = block.transform;
  requireSplit(
    block.sizeId === size.sizeId &&
      block.sizeToken === size.token &&
      block.rank === size.rank &&
      !block.derivedFrom &&
      !plan.blocks.some((b) => b.derivedFrom === piece.identity) &&
      !block.cutLoops.length &&
      tr.a === 1 &&
      tr.b === 0 &&
      tr.c === 0 &&
      tr.d === 1 &&
      Number.isFinite(tr.e) &&
      Number.isFinite(tr.f),
    'unsupported block, loop or transform',
  );
  const inputManifest = readManifestBytes(file.bytes);
  requireSplit(
    inputManifest &&
      inputManifest.techCardId === job.techCardId &&
      inputManifest.scope.fabricPurpose === job.scope.fabricPurpose &&
      inputManifest.scope.bomLineKey === job.scope.bomLineKey &&
      inputManifest.sizes.length === 1 &&
      inputManifest.sizes[0]?.sizeId === size.sizeId &&
      inputManifest.sizes[0]?.token === size.token &&
      inputManifest.sizes[0]?.rank === size.rank &&
      !inputManifest.blocks.some((b) => b.protectedLineSplit),
    'original manifest differs or already carries a protected vertex',
  );
  const original = unique(
    inputManifest.blocks.filter((b) => b.block === block.name),
    'original block is missing or ambiguous',
  );
  requireSplit(
    original.identity === piece.identity &&
      original.sizeId === size.sizeId &&
      original.sizeToken === size.token &&
      (role === 'cut' || original.hasSeam),
    'original block identity or role differs',
  );

  const native = await readDxfWithSourceNativeStraightEdgeAuthorityV1(
    file,
    { sagittaMm: 0.05, keepFills: true },
    { sourceFileId: file.id },
  );
  requireSplit(
    native.ok && native.value.read.doc.file.sha256 === input.sourceSha256,
    'original bytes do not match',
  );
  const [page] = native.value.read.doc.pages;
  requireSplit(page && native.value.read.doc.pages.length === 1, 'requires a single DXF page');
  const layer = role === 'cut' ? '1' : '14';
  const path = unique(
    page.paths.filter(
      (p) =>
        p.closed &&
        p.src.block === block.name &&
        page.styles.find((s) => s.id === p.style)?.layer === layer,
    ),
    'native ring is missing or ambiguous',
  );
  requireSplit(path.id === input.sourcePathId, 'selected native path differs from block and layer');
  // Some Draft commands also split a coincident cut/seam twin. One record cannot preserve both.
  const otherRole = role === 'cut' ? 'seam' : 'cut';
  const peer = edited[otherRole];
  const peerLayer = otherRole === 'cut' ? '1' : '14';
  const peerPaths = page.paths.filter(
    (p) =>
      p.closed &&
      p.src.block === block.name &&
      page.styles.find((s) => s.id === p.style)?.layer === peerLayer,
  );
  if (peer) {
    const peerPath = unique(peerPaths, 'other boundary is missing or ambiguous');
    const peerPts = peerPath.pts;
    const open =
      peerPts.length > 1 && same(peerPts[0]!, peerPts[peerPts.length - 1]!)
        ? peerPts.slice(0, -1)
        : peerPts;
    requireSplit(
      sameRing(
        peer.map((p) => applyAffine(tr, p)),
        open,
      ),
      'other boundary also changed',
    );
  } else {
    requireSplit(peerPaths.length === 0, 'original other boundary is missing from the job');
  }
  const selected = await projectDxfSourceNativeStraightEdgeSelectedPathsV1(native.value.owner, {
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
    sourceFileId: file.id,
    sourceSha256: input.sourceSha256,
    sourcePathIds: [path.id],
  });
  requireSplit(
    selected.ok && selected.projection.complete,
    'original ring lacks complete native line coverage',
  );
  const segments = selected.projection.descriptors;
  requireSplit(
    segments.every(
      ({ normalization: { sourceAffine: t } }) =>
        t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1 && t.e === 0 && t.f === 0,
    ),
    'source DXF instance uses an unsupported transform',
  );
  const segment = unique(
    segments.filter(
      (s) =>
        s.sourceCurveId === input.sourceCurveId &&
        s.startVertexId === input.startVertexId &&
        s.endVertexId === input.endVertexId,
    ),
    'directed native interval differs',
  );
  const ring = block[role];
  const local = edited[role];
  requireSplit(
    ring &&
      local &&
      ring.length >= 3 &&
      local.length === ring.length + 1 &&
      segments.length === ring.length,
    'the job must contain exactly one additional vertex',
  );
  // Match the complete ordered native outline before any geometry mutation. Equal corner pairs alone
  // cannot prove a source path, role, exact incidence or unchanged remainder of this ring.
  const startIndex = segment.path.startPointIndex;
  requireSplit(
    segments.every((s) => {
      const i = s.path.startPointIndex;
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      return (
        a &&
        b &&
        s.path.endPointIndex === (i + 1) % ring.length &&
        s.startMm[0] === a.x &&
        s.startMm[1] === a.y &&
        s.endMm[0] === b.x &&
        s.endMm[1] === b.y
      );
    }),
    'planned ordered ring differs from the original native ring',
  );
  const pointIndex = input.jobPointIndex;
  requireSplit(
    Number.isSafeInteger(pointIndex) && pointIndex >= 0 && pointIndex < local.length,
    'authored vertex index is out of bounds',
  );
  const written = local.map((p) => applyAffine(tr, p));
  const from = ring[startIndex]!,
    to = ring[(startIndex + 1) % ring.length]!,
    point = written[pointIndex]!;
  const previous = written[(pointIndex + written.length - 1) % written.length]!,
    next = written[(pointIndex + 1) % written.length]!;
  requireSplit(
    ((same(previous, from) && same(next, to)) || (same(previous, to) && same(next, from))) &&
      new Set(written.map((p) => JSON.stringify(mm(p)))).size === written.length &&
      sameRing(
        written.filter((_, i) => i !== pointIndex),
        ring,
      ),
    'authored vertex has different neighbors or the remaining ring differs',
  );
  const protectedRing = [...ring.slice(0, startIndex + 1), point, ...ring.slice(startIndex + 1)];
  const coords = protectedRing.map(mm);
  requireSplit(
    coords.every((p) => p.every((n) => Number(num(n)) === n)),
    'ring exceeds written coordinate precision',
  );
  const record = parseProtectedLineSplit({
    v: 1,
    entityId: input.entityId,
    role,
    sourceSha256: input.sourceSha256,
    sourcePathId: path.id,
    sourceStartPointIndex: startIndex,
    pointIndex: startIndex + 1,
    ringPointCount: coords.length,
    ringSha256: await sha256Hex(new TextEncoder().encode(JSON.stringify(coords)).buffer),
    fromMm: mm(from),
    pointMm: mm(point),
    toMm: mm(to),
    progress: input.progress,
  } satisfies ManifestProtectedLineSplit);
  requireSplit(record, 'split is inexact at written precision or its entity is invalid');
  block[role] = protectedRing;
  block.size[role] = protectedRing;
  block.protectedLineSplit = record;
}
