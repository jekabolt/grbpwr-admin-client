import { Buffer } from 'node:buffer';
import { createThreePanelDxfMaterialCompileFixtureV1 } from 'lib/cloth/domain/dxf-garment-assembly-material-compile-stage-v1.test-fixture';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { writeAndGate } from 'lib/pattern-import/gate';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { withGradeMap } from 'lib/pattern-import/write/grade-map';
import * as blockRules from '../../nesting/block-code';
import { Session } from 'lib/pattern-import/worker/session';
import type {
  PieceSpec,
  WriteJob,
  StageIO,
  StageName,
  PatternImportOpenFile,
} from 'lib/pattern-import/types';
import type { CardContext, ImportClient, StageProgress } from '../client';
import { createPatternImportDxfPhaseESavedDxfReprocessHostV1 } from './saved-dxf-reprocess-host-v1';
import {
  createDxfProductSavedNativeReprocessOwnerV1,
  DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import {
  DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
  type DxfProductSavedRowIdentityV1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';
import {
  readSavedFullAssemblySnapshotV1,
  projectSavedFullAssemblySnapshotV1,
  disposeSavedFullAssemblySnapshotV1,
} from './saved-full-assembly-snapshot-production-v1';
import type { SavedFullAssemblyCompileRequestV1 } from './saved-full-assembly-compile-session-v1';

/** Actual worker/native decoder/writer/mesh fixture. Only persisted card/RPC/HTTP storage is synthetic. */
const IDS = ['FRONT', 'BACK', 'SIDE'] as const;
export const fullAssemblyFixtureRevision = `asm:v1:${'2'.repeat(32)}:4`;
export const fullAssemblyFixtureOperations = [
  {
    operationNumber: 10,
    work: 'join_lockstitch',
    inputKeys: ['line-FRONT', 'line-BACK'],
    outputUnitKey: '',
    outputUnitName: '',
    seamKeys: ['seam-ab'],
  },
  {
    operationNumber: 20,
    work: 'join_lockstitch',
    inputKeys: ['line-BACK', 'line-SIDE'],
    outputUnitKey: '',
    outputUnitName: '',
    seamKeys: ['seam-bc'],
  },
];
export const digestFullAssemblyFixture = async (bytes: Uint8Array) =>
  Buffer.from(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)).toString('hex');
export async function createSavedThreePanelFixtureV1(
  pieceCount: 2 | 3 = 3,
  options: { wizardExport?: boolean } = {},
) {
  const original = await createThreePanelDxfMaterialCompileFixtureV1();
  const ids = IDS.slice(0, pieceCount);
  const pieces: PieceSpec[] = ids.map((identity, index) => {
    const vertices = original.candidate.pieces[index].contours[0].vertices.map((v) => ({
      x: v.positionMm[0],
      y: v.positionMm[1],
    }));
    return {
      identity,
      code: identity,
      mods: [],
      displayName: identity,
      nameOrigin: 'operator',
      seed: index + 1,
      variant: null,
      pairHand: null,
      pairOf: null,
      unfoldedFold: false,
      piecesPerGarment: 1,
      allowance: {
        meaning: 'cut',
        allowanceMm: 0,
        origin: 'operator',
        evidence: ['explicit-test-zero-allowance'],
      },
      fabrics: ['main'],
      fused: false,
      ungraded: false,
      sizes: [
        {
          rank: 0,
          sizeToken: 'M',
          sizeId: 7,
          cut: vertices,
          seam: structuredClone(vertices),
          grain: {
            kind: 'grain',
            origin: 'operator',
            ranges: [],
            confidence: 1,
            a: { x: index * 100 + 50, y: 10 },
            b: { x: index * 100 + 50, y: 90 },
            angleDeg: 90,
          },
          notches: [],
          drills: [],
          internal: [],
          fold: null,
          offset: null,
          walls: [],
          bbox: { minX: index * 100, minY: 0, maxX: (index + 1) * 100, maxY: 100 },
          areaMm2: 10000,
        },
      ],
    };
  });
  const job: WriteJob = {
    techCardId: 156,
    scope: {
      scopeKey: 'main',
      fabricPurpose: 'main',
      bomLineKey: 'bom-main',
      label: 'main',
      isInterlining: false,
    },
    pieces,
    sizes: [{ token: 'M', sizeId: 7, name: 'Medium', sourceLabel: 'M', rank: 0 }],
    source: {
      files: [
        {
          name: 'three-explicit-panels.dxf',
          sha256: await digestFullAssemblyFixture(original.dxfBytes),
          bytes: original.dxfBytes.byteLength,
          kind: 'dxf',
          pages: 1,
        },
      ],
      scale: { method: 'none', factor: 1, measuredMm: null, declaredMm: null },
      sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
      sizeEncoding: 'single',
      variant: null,
    },
    generator: 'genuine-three-panel-saved-worker-fixture',
    dialect: 'r12',
  };
  const now = () => new Date('2026-11-17T00:00:00.000Z');
  if (options.wizardExport) {
    job.sizes.push({ token: 'L', sizeId: 8, name: 'Large', sourceLabel: 'L', rank: 1 });
    job.source.sizeEncoding = 'dxf-block';
    for (const piece of job.pieces) {
      const first = piece.sizes[0];
      const grow = (ring: typeof first.cut) => ring.map(({ x, y }) => ({ x, y: y * 1.04 }));
      piece.sizes.push({
        ...structuredClone(first),
        rank: 1,
        sizeToken: 'L',
        sizeId: 8,
        cut: grow(first.cut),
        seam: grow(first.seam!),
        bbox: { ...first.bbox, maxY: first.bbox.maxY * 1.04 },
        areaMm2: first.areaMm2 * 1.04,
      });
    }
  }
  let written = writeDxfDetailed(job, { now });
  if (options.wizardExport) {
    const gated = await writeAndGate(job, {
      rules: blockRules,
      sizeTokens: new Set(job.sizes.map(({ token }) => token)),
      now,
    });
    if (!gated.report.passed)
      throw new Error(JSON.stringify(gated.report.checks.filter(({ ok }) => !ok)));
    const graded = await withGradeMap(gated.dxfText, job.sizes);
    if (!graded.file) throw new Error('Graded wizard fixture emitted no grade map.');
    written = { ...gated.detail, dxfText: graded.text };
  }
  const bytes = new TextEncoder().encode(written.dxfText);
  const row: DxfProductSavedRowIdentityV1 = {
    techCardId: 156,
    scopeKey: 'main',
    patternLineKey: 'pattern-main-three-panel',
    revision: 4,
    cardLockVersion: 8,
    url: 'https://saved-full-assembly.invalid/three.dxf',
    sizeBytes: bytes.byteLength,
    sha256: await digestFullAssemblyFixture(bytes),
  };
  const card: CardContext = {
    techCardId: 156,
    sizes: job.sizes.map(({ sizeId, token, name, rank }) => ({
      sizeId,
      token,
      name,
      rank,
      spellings: [token, name],
    })),
    scopes: [job.scope],
    existingPieces: ids.map((name) => ({
      lineKey: `line-${name}`,
      name,
      cutSymmetry: 'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL',
      piecesPerGarment: 1,
    })),
    existingAliases: ids.map((name) => ({
      scopeKey: 'main',
      blockName: name,
      pieceLineKey: `line-${name}`,
    })),
    existingPatterns: [
      {
        scopeKey: 'main',
        filename: 'three.dxf',
        url: row.url,
        lineKey: row.patternLineKey,
        name: 'main',
        manifest: written.manifest,
      },
    ],
    styleLabel: 'three-panel',
    cardName: 'three-panel',
    styleNumber: '156',
  };
  return {
    original,
    job,
    written,
    bytes,
    row,
    card,
    ids,
    operations: fullAssemblyFixtureOperations.slice(0, pieceCount - 1),
  };
}
export type SavedThreePanelFixtureV1 = Awaited<ReturnType<typeof createSavedThreePanelFixtureV1>>;
class InProcessClient implements ImportClient {
  readonly kind = 'worker' as const;
  private readonly sessions = new Map<number, Session>();
  private next = 1;
  private cancelled = false;
  async open(files: PatternImportOpenFile[]) {
    const sessionId = this.next++;
    const s = new Session(sessionId, files);
    this.sessions.set(sessionId, s);
    return { sessionId, files: s.files };
  }
  async run<S extends StageName>(
    sessionId: number,
    stage: S,
    input: StageIO[S]['in'],
    progress?: (p: StageProgress) => void,
  ): Promise<StageIO[S]['out']> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('missing worker session');
    return session.runStage(stage, input, {
      checkCancel: () => {
        if (this.cancelled) throw new DOMException('cancelled', 'AbortError');
      },
      progress: (done, total, note) => progress?.({ done, total, note }),
    });
  }
  cancel() {
    this.cancelled = true;
  }
  async close(sessionId: number) {
    this.sessions.get(sessionId)?.close();
    this.sessions.delete(sessionId);
  }
  dispose() {
    for (const s of this.sessions.values()) s.close();
    this.sessions.clear();
  }
}
export async function createSavedThreePanelSourceV1(seed: SavedThreePanelFixtureV1) {
  const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
    resolveCard: async () => ({
      card: structuredClone(seed.card),
      cardLockVersion: seed.row.cardLockVersion,
    }),
    readAuthoritativeRow: async () => ({ row: seed.row, downloadUrl: seed.row.url }),
    createClient: () => new InProcessClient(),
    fetch: (async () =>
      new Response(seed.bytes.slice(), {
        status: 200,
        headers: { 'content-length': String(seed.bytes.length) },
      })) as typeof fetch,
  });
  const owner = createDxfProductSavedNativeReprocessOwnerV1(host);
  const native = await owner.run({
    schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
    row: seed.row,
  });
  if (!native.ok) {
    owner.dispose();
    host.dispose();
    throw new Error(JSON.stringify(native.blockers));
  }
  return {
    native,
    dispose: () => {
      owner.dispose();
      host.dispose();
    },
  };
}
export async function fullAssemblyFixtureWireV1(seed: SavedThreePanelFixtureV1, selected: number) {
  const op = seed.operations.find((o) => o.operationNumber === selected)!;
  const pair = selected === 10 ? ['FRONT', 'BACK'] : ['BACK', 'SIDE'];
  const anchor = (id: string) => ({
    pieceLineKey: `line-${id}`,
    edgeHint: 'explicit-authoring-echo',
    rangeFrom: 0,
    rangeTo: 1,
    lenMm: 100,
    contourSig: 'consistency-only',
    samples: [0, 0.25, 0.5, 0.75, 1].map((u) => ({ u, v: 0 })),
  });
  const selectedSeams = [
    {
      seamKey: op.seamKeys[0],
      status: 'TECH_CARD_SEAM_STATUS_CONFIRMED',
      stale: false,
      kind: 'TECH_CARD_SEAM_KIND_EDGE',
      direction: 'TECH_CARD_SEAM_DIRECTION_REVERSED',
      source: 'TECH_CARD_SEAM_SOURCE_MANUAL',
      anchoredSize: 'M',
      sideA: { parts: [anchor(pair[0])] },
      sideB: { parts: [anchor(pair[1])] },
    },
  ];
  const a = (v: ReturnType<typeof anchor>) => ({
    contourSig: v.contourSig,
    edgeHint: v.edgeHint,
    lenMm: v.lenMm,
    pieceLineKey: v.pieceLineKey,
    range: [v.rangeFrom, v.rangeTo],
    samples: v.samples.map((p) => [p.u, p.v]),
  });
  const payload = {
    operations: seed.operations.map((o) => ({
      authoringOperationId: null,
      number: o.operationNumber,
      work: o.work,
      phaseEKind: 'stitch',
      inputKeys: o.inputKeys,
      outputUnitKey: o.outputUnitKey,
      outputUnitName: o.outputUnitName,
      seamKeys: o.seamKeys,
    })),
    seams: selectedSeams.map((s) => ({
      anchoredSize: s.anchoredSize,
      direction: 'reversed',
      kind: 'edge',
      confirmed: true,
      seamKey: s.seamKey,
      sideA: s.sideA.parts.map(a),
      sideB: s.sideB.parts.map(a),
      source: 'manual',
      stale: false,
    })),
    selectedOperationNumber: selected,
  };
  const json = canonical(payload);
  return {
    row: { ...seed.row, savedRowRevision: seed.row.revision, downloadUrl: seed.row.url },
    selectedOperationNumber: selected,
    operations: structuredClone(seed.operations),
    selectedSeams,
    serverAssemblyRevision: fullAssemblyFixtureRevision,
    topologyCanonicalJson: Buffer.from(json).toString('base64'),
    assemblyTopologySha256: await digestFullAssemblyFixture(
      new TextEncoder().encode(`pattern-import-dxf-phase-e-saved-row-server-topology/1\0${json}`),
    ),
  };
}
export async function savedThreePanelCompileRequestV1(
  seed: SavedThreePanelFixtureV1,
  source: Awaited<ReturnType<typeof createSavedThreePanelSourceV1>>,
): Promise<SavedFullAssemblyCompileRequestV1> {
  const n = source.native;
  const selected = await selectPatternImportDxfProductDraftPhaseDSizeV1(
    n.draft,
    seed.row.scopeKey,
    'M',
  );
  if (!selected.ok) throw new Error(JSON.stringify(selected.blockers));
  const reader = await readSavedFullAssemblySnapshotV1({ row: seed.row, seedOperationNumber: 10 });
  let snapshot;
  try {
    snapshot = projectSavedFullAssemblySnapshotV1(reader);
  } finally {
    disposeSavedFullAssemblySnapshotV1(reader);
  }
  const side = (id: string, ordinal: number, direction: 'forward' | 'reverse') => {
    const p = selected.selection.pipeline.carrier!.pieces.find((p) => p.pieceId === id)!;
    const c = p.contours[0];
    return {
      pieceId: id,
      pieceLineKey: `line-${id}`,
      contourId: c.id,
      anchors: [
        c.sourceVertices[ordinal].vertexId,
        c.sourceVertices[(ordinal + 1) % c.sourceVertices.length].vertexId,
      ] as const,
      direction,
    };
  };
  const r = seed.original.request;
  const intent: SavedFullAssemblyCompileRequestV1['intent'] = {
    documentId: 'saved-three-panel-explicit-graph',
    revision: '1',
    sizeToken: 'M',
    physicalSurface: { mode: 'sewing-surface', seamAllowancePhysical: false },
    pieces: seed.ids.map((id, i) => ({
      pieceId: id,
      pieceLineKey: `line-${id}`,
      cutCount: 1,
      grainDegrees: 90,
      materialId: r.materials[i % 2].id,
      materialRevision: r.materials[i % 2].revision,
    })),
    operations: seed.operations.map((o, i) => ({
      clientOperationId: `authored-operation-${i}`,
      sourceOperationNumber: o.operationNumber,
      inputKeys: o.inputKeys,
      outputUnitKey: o.outputUnitKey,
      stage: i * 10,
      order: i,
      kind: 'stitch',
      seamIds: [o.seamKeys[0]],
    })),
    seams: [
      {
        id: 'seam-ab',
        sourceSeamKey: 'seam-ab',
        clientOperationId: 'authored-operation-0',
        mapping: 'equal',
        lengthRatio: 1,
        sides: [side('FRONT', 1, 'forward'), side('BACK', 3, 'reverse')],
      },
      ...(seed.ids.length === 3
        ? [
            {
              id: 'seam-bc',
              sourceSeamKey: 'seam-bc',
              clientOperationId: 'authored-operation-1',
              mapping: 'equal',
              lengthRatio: 1,
              sides: [side('BACK', 1, 'forward'), side('SIDE', 3, 'reverse')] as const,
            } as const,
          ]
        : []),
    ],
    compile: {
      targetEdgeMm: r.samplingRequest.targetEdgeMm,
      exactSeamToleranceMm: r.exactSeamToleranceMm,
      materialPolicy: r.materialPolicy,
      materials: r.materials,
      continuumMaterials: r.continuumMaterials,
      materialSolver: r.materialSolver,
    },
  };
  return {
    sourceOwner: n.sourceOwner,
    sourceRequest: {
      schemaVersion: DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
      sourceFileId: n.sourceFileId,
      sourceSha256: seed.row.sha256,
      techCardId: seed.row.techCardId,
      scopeKey: seed.row.scopeKey,
      patternLineKey: seed.row.patternLineKey,
      cardLockVersion: seed.row.cardLockVersion,
      draft: n.draft,
    },
    expected: {
      row: seed.row,
      serverAssemblyRevision: snapshot.serverAssemblyRevision,
      fullAssemblySnapshotSha256: snapshot.snapshotSha256,
    },
    seedOperationNumber: 10,
    intent,
  };
}
