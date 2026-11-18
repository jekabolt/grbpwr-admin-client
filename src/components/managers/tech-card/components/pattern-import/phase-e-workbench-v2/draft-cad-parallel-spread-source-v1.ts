import {
  projectDxfSourceNativeStraightEdgeSelectedPathsV1,
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
} from 'lib/pattern-import/dxf-source-native-straight-edge-authority-v1';
import type { consumeDxfProductSavedNativeCompilerSourceV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import type { PtMm } from 'lib/pattern-import/types';
type Source = Extract<
  ReturnType<typeof consumeDxfProductSavedNativeCompilerSourceV1>,
  { ok: true }
>['value'];
const one = <T>(items: readonly T[]) => (items.length === 1 ? items[0] : undefined);
function requireSource(ok: unknown, detail: string): asserts ok {
  if (!ok) throw Error(detail);
}
function ringMatches(ring: readonly PtMm[], native: readonly PtMm[]) {
  const first = ring[0];
  if (!first || ring.length !== native.length) return false;
  const start = native.findIndex((p) => p.x === first.x && p.y === first.y);
  return (
    start >= 0 &&
    ring.every(
      (p, i) =>
        p.x === native[(start + i) % ring.length]!.x &&
        p.y === native[(start + i) % ring.length]!.y,
    )
  );
}
/** Every affected size must be a single original block with the same complete straight cut and hole rings. */
export async function checkSavedParallelSpreadSourceV1(source: Source, pieceId: string) {
  const { draft, nativeRead, row, sourceFileId } = source;
  const scope = one(draft.scopes.filter((s) => s.target.scopeKey === row.scopeKey));
  const piece = one(scope?.writerReplay?.job.pieces.filter((p) => p.identity === pieceId) ?? []);
  requireSource(
    scope && piece && !scope.writerReplay?.retainedLineSplit,
    'The original saved piece is unavailable.',
  );
  const blocks = scope.manifest.blocks.filter((b) => b.identity === pieceId);
  requireSource(
    blocks.length === piece.sizes.length &&
      !scope.manifest.blocks.some((b) => b.protectedLineSplit),
    'The saved size blocks are ambiguous or contain a protected vertex.',
  );
  const page = nativeRead.read.doc.pages[0]!,
    paths = new Map(page.paths.map((p) => [p.id, p]));
  const counts = new Map<number, number>();
  for (const size of piece.sizes) {
    const b = one(blocks.filter((b) => b.sizeToken === size.sizeToken && b.sizeId === size.sizeId));
    const rank = one(
      scope.manifest.sizes.filter((s) => s.token === size.sizeToken && s.sizeId === size.sizeId),
    );
    const group =
      b &&
      one(nativeRead.read.meta.groups.filter((g) => g.kind === 'insert' && g.block === b.block));
    requireSource(
      b &&
        rank?.rank === size.rank &&
        group &&
        group.transform.a === 1 &&
        group.transform.b === 0 &&
        group.transform.c === 0 &&
        group.transform.d === 1,
      'A saved size block or its native coordinate frame changed.',
    );
    const all = group.paths
      .map((id) => paths.get(id))
      .filter((p) => p && page.styles[p.style]?.layer === '1');
    const rings = [size.cut, ...(size.cutLoops ?? [])];
    requireSource(all.length === rings.length, 'The native cut or hole count changed.');
    for (const ring of rings) {
      const path = one(
        all.filter((p) => p?.closed && p.src.block === b.block && ringMatches(ring, p.pts)),
      );
      requireSource(
        path && !counts.has(path.id),
        'A cut or hole lost its exact directed native ring.',
      );
      counts.set(path.id, ring.length);
    }
  }
  const edges = await projectDxfSourceNativeStraightEdgeSelectedPathsV1(nativeRead.owner, {
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
    sourceFileId,
    sourceSha256: row.sha256,
    sourcePathIds: [...counts.keys()].sort((a, b) => a - b),
  });
  requireSource(
    edges.ok && edges.projection.complete,
    'Every affected outline must consist of original native straight edges.',
  );
  const indices = new Map<number, Set<number>>();
  for (const edge of edges.projection.descriptors) {
    const p = edge.path,
      n = counts.get(p.sourcePathId);
    requireSource(
      n &&
        p.closed &&
        p.startPointIndex >= 0 &&
        p.startPointIndex < n &&
        p.endPointIndex === (p.startPointIndex + 1) % n,
      'An original native interval changed.',
    );
    const set = indices.get(p.sourcePathId) ?? new Set<number>();
    requireSource(!set.has(p.startPointIndex), 'A native cut interval occurs twice.');
    set.add(p.startPointIndex);
    indices.set(p.sourcePathId, set);
  }
  requireSource(
    [...counts].every(([id, n]) => indices.get(id)?.size === n),
    'The saved original cut or hole has missing intervals.',
  );
}
