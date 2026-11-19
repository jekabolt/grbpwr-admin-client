import {
  consumeDxfProductSavedNativeCompilerSourceV1,
  type DxfProductSavedNativeCompilerSourceRequestV1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import {
  validateAndRedactSavedDxfDraftV1,
  type DxfProductSavedRowIdentityV1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { aliasKey, normBlock } from 'lib/pattern-import/fabrics/draft';
import { bboxOf, signedArea } from 'lib/pattern-import/semantics/geom';
import { transformSizeSpec } from 'lib/pattern-import/semantics/pairs';
import type { PieceSpec, PtMm } from 'lib/pattern-import/types';
import type { CardContext } from '../client';
import { readSavedNativeCutEdgesV1 } from './draft-cad-parallel-spread-source-v1';
import type { PatternImportDxfPhaseEDraftCadSessionV1 } from './draft-cad-session-v1';
import {
  selectMatchingSavedDraftV1,
  sameSavedDraftRowV1,
} from './draft-cad-saved-source-selection-v1';

type PickedEdge = {
  pieceId: string;
  pieceLineKey: string;
  sourceCurveId: string;
  startVertexId: string;
  endVertexId: string;
};
export type JoinSelection = {
  row: DxfProductSavedRowIdentityV1;
  sizeToken: string;
  fixed: PickedEdge;
  moving: PickedEdge;
  translateMovingMm: PtMm;
  newIdentity: string;
};

export type RegisteredJoinSelection = Omit<
  JoinSelection,
  'fixed' | 'moving' | 'translateMovingMm'
> & {
  fixed: Pick<PickedEdge, 'pieceId' | 'pieceLineKey'>;
  moving: Pick<PickedEdge, 'pieceId' | 'pieceLineKey'>;
};
function check(value: unknown, detail: string): asserts value {
  if (!value) throw new Error(detail);
}
const same = (a: PtMm, b: PtMm) => a.x === b.x && a.y === b.y;

// The first supported source has two axis-aligned rectangular cut pieces. This gives an
// exact proof of common boundary and disjoint interiors without snapping or polygon repair.
function rectangle(ring: PtMm[]) {
  const bounds = bboxOf(ring);
  const { minX, minY, maxX, maxY } = bounds;
  const corners = ring.every((p) => [minX, maxX].includes(p.x) && [minY, maxY].includes(p.y));
  return (
    ring.length === 4 &&
    corners &&
    minX < maxX &&
    minY < maxY &&
    signedArea(ring) === (maxX - minX) * (maxY - minY)
  );
}

const lineKey = (value: string) => value.trim().toLowerCase();

function checkCurrent(card: CardContext, intent: JoinSelection | RegisteredJoinSelection) {
  const { fixed, moving, row, newIdentity } = intent;
  check(
    card.techCardId === row.techCardId &&
      !card.shapesPending &&
      card.sizes.filter((r) => r.token === intent.sizeToken).length === 1 &&
      card.existingPatterns?.filter((p) => p.scopeKey === row.scopeKey).length === 1 &&
      card.existingPatterns.some(
        (p) => p.scopeKey === row.scopeKey && p.lineKey === row.patternLineKey && p.url === row.url,
      ),
    'The current saved row differs.',
  );
  check(
    fixed.pieceId !== moving.pieceId &&
      lineKey(fixed.pieceLineKey) !== lineKey(moving.pieceLineKey) &&
      /^[A-Z]{2,6}$/.test(newIdentity) &&
      ![fixed.pieceId, moving.pieceId].includes(newIdentity) &&
      !card.existingPieces.some((p) => p.name.trim().toUpperCase() === newIdentity) &&
      !card.existingAliases?.some(
        (a) =>
          normBlock(a.blockName).toUpperCase() === newIdentity ||
          normBlock(a.blockName)
            .toUpperCase()
            .startsWith(newIdentity + '_'),
      ),
    'Select two distinct pieces and a new unused identity.',
  );
  const keys = new Set([fixed.pieceLineKey, moving.pieceLineKey].map(lineKey));
  check(
    card.assembly &&
      !card.assembly.ops.some((o) => o.inputKeys.some((k) => keys.has(lineKey(k)))) &&
      !card.assembly.seams.some(
        (s) =>
          s.pieces.some((k) => keys.has(lineKey(k))) ||
          ('sideA' in s && [...s.sideA, ...s.sideB].some((a) => keys.has(lineKey(a.pieceLineKey)))),
      ),
    'Both source lines must be unused in the current Assembly context.',
  );
  for (const p of [fixed, moving]) {
    const names = [p.pieceId, p.pieceId + '_' + intent.sizeToken];
    const targetNames = new Set(names.map((name) => aliasKey(row.scopeKey, name)));
    const alias = card.existingAliases?.filter(
      (a) =>
        lineKey(a.pieceLineKey) === lineKey(p.pieceLineKey) ||
        targetNames.has(aliasKey(a.scopeKey, a.blockName)),
    );
    const lines = card.existingPieces.filter((x) => lineKey(x.lineKey) === lineKey(p.pieceLineKey));
    check(
      alias?.length &&
        alias.every(
          (a) =>
            a.scopeKey === row.scopeKey &&
            a.pieceLineKey === p.pieceLineKey &&
            names.includes(a.blockName),
        ) &&
        new Set(alias.map((a) => a.blockName)).size === alias.length &&
        lines.length === 1 &&
        lines[0]!.lineKey === p.pieceLineKey &&
        lines[0]!.piecesPerGarment === 1 &&
        lines[0]!.cutSymmetry === 'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL' &&
        !lines[0]!.fused,
      'A source line or scoped alias differs.',
    );
  }
}

/** Read-only geometry preparation. Applying this replacement additionally requires a two-line retirement contract. */
export async function prepareSavedJoinBoundaryV1(input: {
  session?: PatternImportDxfPhaseEDraftCadSessionV1;
  sourceOwner: unknown;
  sourceRequest: DxfProductSavedNativeCompilerSourceRequestV1;
  selection: JoinSelection | RegisteredJoinSelection;
  readCurrent: () => { card: CardContext; row: DxfProductSavedRowIdentityV1 };
}) {
  const selected = structuredClone(input.selection);
  const current = () => {
    const live = input.readCurrent();
    check(sameSavedDraftRowV1(live.row, selected.row), 'The saved row changed during Join.');
    checkCurrent(live.card, selected);
    return live.card;
  };
  current();
  const native = consumeDxfProductSavedNativeCompilerSourceV1(
    input.sourceOwner,
    input.sourceRequest,
  );
  check(
    native.ok &&
      !native.value.reconstruction &&
      !native.value.nativeRead.scope &&
      sameSavedDraftRowV1(native.value.row, selected.row),
    'Join requires the complete exact saved source.',
  );
  // The published card draft is editable. The source capability proves the original read,
  // not later mutations of the public replay job (e.g. removal of a drill).
  const stable = await validateAndRedactSavedDxfDraftV1(
    structuredClone(native.value.draft),
    selected.row,
    native.value.sourceFileId,
    globalThis.crypto,
  );
  check(stable.ok, 'The writer replay no longer reproduces the exact saved bytes.');
  if (input.session) {
    const session = input.session;
    check(
      session.source.phaseD.sourceFileId === native.value.sourceFileId &&
        session.source.phaseD.sourceSha256 === selected.row.sha256,
      'The open Draft source does not match this saved file.',
    );
    const views = [stable.draft],
      sewing = native.value.nativeSewingReplay;
    if (sewing?.replayReady)
      views.push({
        ...stable.draft,
        dxfProvenance: sewing.pipeline,
        dxfPhaseDReplay: sewing.replay,
      });
    let matched = false;
    for (const view of views) {
      if (
        await selectMatchingSavedDraftV1(view, selected.row.scopeKey, selected.sizeToken, session)
      ) {
        matched = true;
        break;
      }
    }
    check(matched, 'The open Draft rank or piece catalog changed.');
  }
  const source = { ...native.value, draft: stable.draft };
  const registered = await readSavedNativeCutEdgesV1(source, [
    selected.fixed.pieceId,
    selected.moving.pieceId,
  ]);
  function boundary(index: number, side: 'fixed' | 'moving') {
    const rank = registered[index]?.edges[0];
    const choice = selected[side];
    const candidates = rank?.descriptors.filter(
      (e) =>
        e.startMm[0] === e.endMm[0] &&
        (side === 'fixed' ? e.startMm[1] < e.endMm[1] : e.startMm[1] > e.endMm[1]),
    );
    check(
      candidates?.length === 1,
      'Select the full right boundary of the fixed piece and the full left boundary of the moving piece.',
    );
    const e = candidates[0]!;
    return {
      pick: {
        ...choice,
        sourceCurveId: e.sourceCurveId,
        startVertexId: e.startVertexId,
        endVertexId: e.endVertexId,
      },
      edge: e,
    };
  }
  let intent: JoinSelection;
  if ('translateMovingMm' in selected) intent = selected;
  else {
    const a = boundary(0, 'fixed'),
      b = boundary(1, 'moving');
    intent = {
      ...selected,
      fixed: a.pick,
      moving: b.pick,
      translateMovingMm: {
        x: a.edge.startMm[0] - b.edge.endMm[0],
        y: a.edge.startMm[1] - b.edge.endMm[1],
      },
    };
  }
  const card = current();
  function resolve(p: PickedEdge, { piece, scope, edges }: (typeof registered)[number]) {
    const rank = edges[0],
      size = rank?.size;
    const job = scope.writerReplay!.job;
    const currentRank = card.sizes.find((r) => r.token === intent.sizeToken);

    check(
      rank &&
        size &&
        edges.length === 1 &&
        job.sizes.length === 1 &&
        size.sizeToken === intent.sizeToken &&
        currentRank?.sizeId === size.sizeId &&
        currentRank.rank === size.rank &&
        card.scopes.filter((sc) => sc.scopeKey === intent.row.scopeKey).length === 1 &&
        card.scopes.some(
          (sc) =>
            sc.scopeKey === intent.row.scopeKey &&
            sc.fabricPurpose === job.scope.fabricPurpose &&
            sc.bomLineKey === job.scope.bomLineKey &&
            !sc.isInterlining,
        ) &&
        piece.fabrics.includes(job.scope.fabricPurpose) &&
        piece.fabrics.every(
          (f) =>
            f === job.scope.scopeKey || f === job.scope.fabricPurpose || f === job.scope.bomLineKey,
        ) &&
        !piece.fused &&
        !piece.ungraded &&
        piece.piecesPerGarment === 1 &&
        !piece.pairOf &&
        !piece.pairHand &&
        !piece.unfoldedFold &&
        !piece.halfFold &&
        !piece.variant &&
        !piece.notchVariant &&
        !piece.gradeIntended?.length &&
        !piece.shapeFixes?.length &&
        !size.fold &&
        !size.repair &&
        !size.continuity &&
        !size.kinks?.length &&
        !size.removedByOperator &&
        piece.allowance.allowanceMm === 0 &&
        size.seam &&
        size.seam.length === size.cut.length &&
        size.cut.every((pt, i) => same(pt, size.seam![i]!)) &&
        rectangle(size.cut) &&
        !size.notches.length,
      'Join requires one identical grade, rectangular native outlines, zero allowance and unpaired pieces without notches.',
    );
    const found = rank.descriptors.filter(
      (e) =>
        e.sourceCurveId === p.sourceCurveId &&
        e.startVertexId === p.startVertexId &&
        e.endVertexId === p.endVertexId,
    );
    const edge = found[0];
    check(found.length === 1 && edge, 'The selected complete directed native boundary differs.');
    const index = size.cut.findIndex(
      (v, i) =>
        v.x === edge.startMm[0] &&
        v.y === edge.startMm[1] &&
        size.cut[(i + 1) % size.cut.length]!.x === edge.endMm[0] &&
        size.cut[(i + 1) % size.cut.length]!.y === edge.endMm[1],
    );
    check(index >= 0, 'The selected native boundary is not on this source outline.');
    const { minX, minY, maxX, maxY } = bboxOf(size.cut);
    const interior = (v: PtMm) => v.x > minX && v.x < maxX && v.y > minY && v.y < maxY;
    check(
      (size.cutLoops ?? []).every((r) => signedArea(r) < 0 && r.every(interior)) &&
        size.drills.every((d) => interior(d.at)) &&
        size.internal.every((m) => m.pts.every(interior)) &&
        (size.pointMarks ?? []).every((m) => interior(m.at)) &&
        (size.textMarks ?? []).every((m) => interior(m.at)),
      'Join requires holes and marks strictly inside their source outlines.',
    );
    return { piece, size, index, job };
  }
  const a = resolve(intent.fixed, registered[0]!),
    b = resolve(intent.moving, registered[1]!);
  check(
    a.job === b.job &&
      !a.job.pieces.some((p) => p.identity === intent.newIdentity) &&
      a.size.rank === b.size.rank &&
      a.size.sizeId === b.size.sizeId,
    'The source rank, row, or new identity differs.',
  );
  const delta = intent.translateMovingMm;
  check(
    Number.isFinite(delta.x) && Number.isFinite(delta.y),
    'Provide a finite explicit translation.',
  );
  const moved = transformSizeSpec(b.size, { a: 1, b: 0, c: 0, d: 1, e: delta.x, f: delta.y });
  const from = a.size.cut[a.index]!,
    to = a.size.cut[(a.index + 1) % 4]!;
  check(
    same(from, moved.cut[(b.index + 1) % 4]!) && same(to, moved.cut[b.index]!),
    'The explicit translation does not register both directed endpoints.',
  );
  check(
    a.size.grain &&
      moved.grain &&
      same(a.size.grain.a, moved.grain.a) &&
      same(a.size.grain.b, moved.grain.b),
    'The registered directed grain lines must coincide.',
  );
  const box = bboxOf([...a.size.cut, ...moved.cut]);
  const { minX, minY, maxX, maxY } = box;
  const cut = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  check(
    signedArea(cut) === signedArea(a.size.cut) + signedArea(moved.cut),
    'The two source interiors do not make a single rectangle.',
  );
  const cutLoops = [...(a.size.cutLoops ?? []), ...(moved.cutLoops ?? [])];
  const joined: PieceSpec = {
    ...structuredClone(a.piece),
    identity: intent.newIdentity,
    code: intent.newIdentity,
    mods: [],
    displayName: intent.newIdentity,
    nameOrigin: 'operator',
    seed: Math.max(...a.job.pieces.map((p) => p.seed)) + 1,
    sizes: [
      {
        ...structuredClone(a.size),
        cut,
        seam: structuredClone(cut),
        cutLoops,
        bbox: box,
        areaMm2: signedArea(cut) + cutLoops.reduce((sum, r) => sum + signedArea(r), 0),
        walls: [],
        offset: null,
        internal: [...a.size.internal, ...moved.internal],
        drills: [...a.size.drills, ...moved.drills],
        pointMarks: [...(a.size.pointMarks ?? []), ...(moved.pointMarks ?? [])],
        textMarks: [...(a.size.textMarks ?? []), ...(moved.textMarks ?? [])],
      },
    ],
  };
  return structuredClone({
    selection: intent,
    job: {
      ...a.job,
      pieces: [...a.job.pieces.filter((p) => p !== a.piece && p !== b.piece), joined],
    },
  });
}
