import { sha256Hex } from '../adapters/vector/builder';
import {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
  projectDxfSourceNativeStraightEdgeSelectedPathsV1,
  readDxfWithSourceNativeStraightEdgeAuthorityV1,
} from '../dxf-source-native-straight-edge-authority-v1';
import { readManifestBytes } from '../manifest';
import { parseProtectedLineSplit } from '../manifest/protected-line-split';
import type { ManifestProtectedLineSplit } from '../types';

const same = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1];
function verify(claim: unknown, reason: string): asserts claim {
  if (!claim) throw new Error(`Protected line split readback failed: ${reason}.`);
}
/** Read-only geometry evidence. The caller separately owns the expected file and selection identity. */
export async function readProtectedLineSplit(
  inputBytes: ArrayBuffer,
  fileId: string,
  expected: {
    fileSha256: string;
    block: string;
    record: ManifestProtectedLineSplit;
  },
) {
  const bytes = inputBytes.slice(0);
  const { fileSha256, block } = expected;
  const record = parseProtectedLineSplit(expected.record);
  verify(record, 'expected occurrence is malformed');
  const manifest = readManifestBytes(bytes);
  const written = manifest?.blocks.filter((b) => b.protectedLineSplit);
  verify(
    written?.length === 1 &&
      written[0]!.block === block &&
      JSON.stringify(written[0]!.protectedLineSplit) === JSON.stringify(record),
    'manifest occurrence or expected record differs',
  );
  const read = await readDxfWithSourceNativeStraightEdgeAuthorityV1(
    { id: fileId, name: 'protected.dxf', bytes },
    { sagittaMm: 0.05, keepFills: true },
    { sourceFileId: fileId },
  );
  verify(read.ok && read.value.read.doc.file.sha256 === fileSha256, 'file bytes differ');
  const doc = read.value.read.doc,
    page = doc.pages[0];
  verify(page && doc.pages.length === 1, 'expected one page');
  const layer = record.role === 'cut' ? '1' : '14';
  const paths = page.paths.filter(
    (p) =>
      p.closed &&
      p.src.block === block &&
      page.styles.find((s) => s.id === p.style)?.layer === layer,
  );
  verify(paths.length === 1, 'native block or layer is ambiguous');
  const pathId = paths[0]!.id;
  const selected = await projectDxfSourceNativeStraightEdgeSelectedPathsV1(read.value.owner, {
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
    sourceFileId: fileId,
    sourceSha256: fileSha256,
    sourcePathIds: [pathId],
  });
  verify(
    selected.ok && selected.projection.complete,
    'native straight-edge coverage is incomplete',
  );
  const edges = selected.projection.descriptors
    .slice()
    .sort((a, b) => a.path.startPointIndex - b.path.startPointIndex);
  verify(
    edges.length === record.ringPointCount &&
      edges.every((e, i) => {
        const next = edges[(i + 1) % edges.length]!,
          t = e.normalization.sourceAffine;
        return (
          e.path.startPointIndex === i &&
          e.path.endPointIndex === (i + 1) % edges.length &&
          same(e.endMm, next.startMm) &&
          e.native.curveKind === 'line' &&
          e.native.sourceCurveTRange[0] === 0 &&
          e.native.sourceCurveTRange[1] === 1 &&
          t.a === 1 &&
          t.b === 0 &&
          t.c === 0 &&
          t.d === 1 &&
          t.e === 0 &&
          t.f === 0
        );
      }),
    'native directed ring or transform differs',
  );
  const ringSha256 = await sha256Hex(
    new TextEncoder().encode(JSON.stringify(edges.map((e) => e.startMm))).buffer,
  );
  verify(ringSha256 === record.ringSha256, 'written ring digest differs');
  const left = edges[(record.pointIndex + edges.length - 1) % edges.length]!,
    right = edges[record.pointIndex]!;
  verify(
    left.path.endPointIndex === right.path.startPointIndex &&
      left.endVertexId === right.startVertexId &&
      left.sourceCurveId !== right.sourceCurveId &&
      same(left.startMm, record.fromMm) &&
      same(left.endMm, record.pointMm) &&
      same(right.startMm, record.pointMm) &&
      same(right.endMm, record.toMm),
    'the two directed native intervals do not meet at the authored vertex',
  );
  return Object.freeze({ fileSha256, pathId, ringSha256, left, right });
}
