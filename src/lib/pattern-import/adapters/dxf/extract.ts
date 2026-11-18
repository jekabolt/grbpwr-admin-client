// F8 — DXF → canonical IR, losslessly, with provenance on every path and text.
//
// Units: everything leaves here in MILLIMETRES, y-up (DXF's own frame; no flip). Page frame =
// model space after INSERT expansion: CLO's blocks already sit in absolute world coordinates, so
// the page keeps the file's coordinates verbatim (extents in DxfMeta.extents, the page's width and
// height are the extents' size).
//
// Accounting: every record of BLOCKS/ENTITIES ends in exactly one bucket of the tally —
// rendered / structural / dropped-with-a-reason. Nothing disappears silently.

import type {
  Affine,
  ExtractFn,
  ExtractOpts,
  IRPage,
  IRPath,
  IRRaster,
  IRText,
  PathId,
  Progress,
  PtMm,
  SourceDoc,
  Style,
  StyleId,
} from '../../types';
import { PATIMPORT } from '../../types';
import { readManifestBytes } from '../../manifest';
import {
  createDxfCurveSampleV1,
  createDxfInsertInstancePathV1,
  createDxfPathProvenanceV1,
  createDxfSourceCurveIdV1,
  DXF_PATH_PROVENANCE_MAX_VERTICES_PER_CONTOUR_V1,
  type DxfCurveParameterSpaceV1,
  type DxfCurveSampleV1,
  type DxfPathProvenanceV1,
} from '../../dxf-path-provenance-v1';
import type {
  DxfSourceNativeStraightEdgeDecodedBlockerV1,
  DxfSourceNativeStraightEdgeDecodedCandidateV1,
  DxfSourceNativeStraightEdgeUnsupportedCodeV1,
} from '../../dxf-source-native-straight-edge-authority-v1';
import { budgetOf } from '../budget';
import {
  buildAst,
  int,
  numOf,
  numOr,
  rawStr,
  str,
  type RawBlock,
  type RawDxf,
  type RawEntity,
} from './ast';
import type {
  DxfDialect,
  DxfGroup,
  DxfMeta,
  DxfPathProvenanceDetailedReadResultV1,
  DxfPathProvenanceReadArtifactV1,
  DxfPathProvenanceReadBlockerCodeV1,
  DxfPathProvenanceReadBlockerV1,
  DxfPointAttrs,
  DxfRead,
  DxfUnits,
  TallyRow,
} from './dxf-types';
import { DXF_PATH_PROVENANCE_READ_V1 } from './dxf-types';
import {
  IDENTITY,
  apply,
  applyDir,
  arcPts,
  arcPointSamples,
  bboxOf,
  bulgePolyline,
  bulgePolylinePointSamples,
  catmullRom,
  ellipsePts,
  ellipsePointSamples,
  mul,
  nurbsAt,
  ocsToWcs,
  rotate,
  sampleAdaptive,
  sampleAdaptivePointSamples,
  scale,
  scaleOf,
  translate,
  type P,
  type DxfNativePointSample,
} from './geometry';
import { loadDxf, num, type Tag } from './tags';
import { decodeLabel, decodeMText, decodeTextValue, type DecodedLabel } from './text';

const MAX_DEPTH = 16;
const MAX_INSTANCES = 50_000;

export const INSUNITS_MM: Record<number, number> = {
  1: 25.4,
  2: 304.8,
  3: 1_609_344,
  4: 1,
  5: 10,
  6: 1000,
  7: 1_000_000,
  8: 2.54e-5,
  9: 0.0254,
  10: 914.4,
  11: 1e-7,
  12: 1e-6,
  13: 1e-3,
  14: 100,
};

// AutoCAD Color Index → RGB. 1–9 and the grey ramp exactly; 10–249 by the standard hue wheel.
function aciRgb(i: number): [number, number, number] {
  const base: Record<number, [number, number, number]> = {
    1: [255, 0, 0],
    2: [255, 255, 0],
    3: [0, 255, 0],
    4: [0, 255, 255],
    5: [0, 0, 255],
    6: [255, 0, 255],
    7: [0, 0, 0], // white-on-black in CAD; black ink on paper
    8: [128, 128, 128],
    9: [192, 192, 192],
    250: [51, 51, 51],
    251: [80, 80, 80],
    252: [105, 105, 105],
    253: [130, 130, 130],
    254: [190, 190, 190],
    255: [255, 255, 255],
  };
  if (base[i]) return base[i];
  if (i < 10 || i > 249) return [0, 0, 0];
  const hue = Math.floor((i - 10) / 10) * 15;
  const step = (i - 10) % 10;
  const v = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3][step];
  const s = step % 2 === 0 ? 1 : 0.5;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

type Ctx = {
  /** local drawing units → page mm */
  M: Affine;
  /** flattening tolerance in LOCAL units */
  tol: number;
  /** block the entity is defined in (null = model space) */
  block: string | null;
  /** effective layer of the INSERT (entities on layer 0 inside a block inherit it) */
  layer0: string | null;
  /** effective colour of the INSERT (BYBLOCK) */
  colorByBlock: number | null;
  group: DxfGroup;
  depth: number;
  /** Canonical nested INSERT/MINSERT lineage; empty in model space. */
  instancePath: readonly string[];
  /** DIMENSION or rejected identity in the ancestry blocks exact provenance only, not legacy IR. */
  instancePathBlocker: DxfPathProvenanceReadBlockerCodeV1 | null;
};

type SampledPoint = Readonly<{
  point: PtMm;
  parameterSpace: DxfCurveParameterSpaceV1;
  sourceCurveT: number;
  primitiveSegmentIndex: number;
  entityHandle: string | null;
  entityOp: number;
  sub: number;
}>;

type Emit = {
  pts: PtMm[];
  closed: boolean;
  sub: number;
  fill: boolean;
  width?: number;
  /** Present only when every point came directly from an exact source-native sampler. */
  sampled?: readonly SampledPoint[];
  /** Decoder-minted primitive classification. Never reconstructed from emitted endpoints. */
  straightEdgeFacts?: readonly NativeStraightEdgeFact[];
  provenanceBlocker?: DxfPathProvenanceReadBlockerCodeV1;
};

type NativeStraightEdgeFact =
  | Readonly<{
      kind: 'line';
      primitiveSegmentIndex: number;
      startPointIndex: number;
      endPointIndex: number;
      nativeStart: Readonly<P>;
      nativeEnd: Readonly<P>;
      sourceAffine: Readonly<Affine>;
    }>
  | Readonly<{
      kind: 'unsupported';
      primitiveSegmentIndex: number;
      code: DxfSourceNativeStraightEdgeUnsupportedCodeV1;
      detail: string;
    }>;

type ProvenanceCapture = {
  readonly sourceFileId: string;
  readonly paths: { pathId: PathId; provenance: DxfPathProvenanceV1 }[];
  readonly blockers: DxfPathProvenanceReadBlockerV1[];
};

type StraightEdgeCapture = {
  readonly sourceFileId: string;
  readonly candidates: DxfSourceNativeStraightEdgeDecodedCandidateV1[];
  readonly blockers: DxfSourceNativeStraightEdgeDecodedBlockerV1[];
  readonly identities: Set<string>;
  descriptorOverflow: boolean;
  blockerOverflow: boolean;
  /** Completeness ledger is independent of the capped presentation diagnostics. */
  readonly pathCoverage: Map<PathId, { pointCount: number; closed: boolean; rejected: boolean }>;
  globalCoverageFailure: boolean;
};

const MAX_STRAIGHT_EDGE_DESCRIPTORS = 100_000;
const MAX_STRAIGHT_EDGE_BLOCKERS = 4_096;
const MAX_STRAIGHT_EDGE_PATH_COVERAGE = 100_000;
const MAX_STRAIGHT_EDGE_COORDINATE_ABS_MM = 1_000_000_000;

class Builder {
  paths: IRPath[] = [];
  texts: IRText[] = [];
  rasters: IRRaster[] = [];
  styles: Style[] = [];
  styleKey = new Map<string, StyleId>();
  layers: string[] = [];
  layerSet = new Set<string>();
  pathEntity: string[] = [];
  textEntity: string[] = [];
  attribTag: Record<number, string> = {};
  points: Record<PathId, DxfPointAttrs> = {};
  groups: DxfGroup[] = [];
  /** record key → rendered */
  rendered = new Set<string>();
  /** record key → structural */
  structural = new Set<string>();
  /** record key → drop reason */
  dropped = new Map<string, string>();
  emitted = new Map<string, { p: number; t: number; r: number }>();
  warnings: string[] = [];
  budget = MAX_INSTANCES;
  budgetWarned = false;
  insertCount = 0;
  readonly duplicateEntityHandles = new Set<string>();

  constructor(
    readonly fileId: string,
    readonly raw: RawDxf,
    readonly units: DxfUnits,
    readonly opts: ExtractOpts,
    readonly provenanceCapture: ProvenanceCapture | null = null,
    readonly straightEdgeCapture: StraightEdgeCapture | null = null,
  ) {
    for (const l of raw.layers) this.addLayer(l.name);
    const handleCounts = new Map<string, number>();
    const countHandles = (entities: readonly RawEntity[]) => {
      for (const entity of entities) {
        if (entity.handle) {
          const handle = entity.handle.toUpperCase();
          handleCounts.set(handle, (handleCounts.get(handle) ?? 0) + 1);
        }
      }
    };
    countHandles(raw.entities);
    for (const block of raw.blockOrder) countHandles(block.entities);
    for (const [handle, count] of handleCounts)
      if (count > 1) this.duplicateEntityHandles.add(handle);
  }

  addLayer(name: string) {
    if (!this.layerSet.has(name)) {
      this.layerSet.add(name);
      this.layers.push(name);
    }
  }

  bumpEmit(type: string, k: 'p' | 't' | 'r') {
    const row = this.emitted.get(type) ?? { p: 0, t: 0, r: 0 };
    row[k]++;
    this.emitted.set(type, row);
  }

  style(e: RawEntity, ctx: Ctx, fill: boolean, widthUnits = 0): StyleId {
    const layer = this.layerOf(e, ctx);
    const layerRec = this.raw.layers.find((l) => l.name === layer);
    let color = int(e.tags, 62);
    const tc = int(e.tags, 420);
    let rgb: [number, number, number] | null = null;
    if (tc != null) rgb = [(tc >> 16) & 255, (tc >> 8) & 255, tc & 255];
    else {
      if (color === 0) color = ctx.colorByBlock;
      if (color == null || color === 256) {
        if (layerRec?.trueColor != null) {
          const t = layerRec.trueColor;
          rgb = [(t >> 16) & 255, (t >> 8) & 255, t & 255];
        } else color = layerRec ? Math.abs(layerRec.color) : 7;
      }
      if (!rgb && color != null) rgb = aciRgb(Math.abs(color));
    }
    let ltype = str(e.tags, 6);
    if (!ltype || /^bylayer$/i.test(ltype)) ltype = layerRec?.ltype ?? 'CONTINUOUS';
    const lt = this.raw.ltypes.get(ltype.toUpperCase());
    const ltscale = numOr(e.tags, 48, 1);
    const s = scaleOf(ctx.M);
    const dash =
      lt && lt.dash.length > 0 && lt.dash.some((d) => d > 0)
        ? lt.dash.map((d) => d * ltscale * s)
        : null;
    const lw = int(e.tags, 370);
    const widthMm = widthUnits > 0 ? widthUnits * s : lw != null && lw > 0 ? lw / 100 : 0;
    const key = JSON.stringify([rgb, widthMm, dash, layer, fill]);
    let id = this.styleKey.get(key);
    if (id == null) {
      id = this.styles.length;
      this.styles.push({ id, strokeRgb: rgb, widthMm, dash, layer, fill, clip: null });
      this.styleKey.set(key, id);
    }
    return id;
  }

  layerOf(e: RawEntity, ctx: Ctx): string {
    const l = e.layer === '0' && ctx.layer0 != null ? ctx.layer0 : e.layer;
    this.addLayer(l);
    return l;
  }

  private provenanceBlocker(
    pathId: PathId,
    e: RawEntity,
    code: DxfPathProvenanceReadBlockerCodeV1,
    detail: string,
  ): void {
    this.provenanceCapture?.blockers.push(
      Object.freeze({ code, pathId, entityType: e.type, entityOp: e.op, detail }),
    );
  }

  private capturePathProvenance(
    pathId: PathId,
    e: RawEntity,
    ctx: Ctx,
    em: Emit,
  ): DxfPathProvenanceV1 | null {
    const capture = this.provenanceCapture;
    if (!capture) return null;
    if (e.handle && this.duplicateEntityHandles.has(e.handle.toUpperCase())) {
      this.provenanceBlocker(
        pathId,
        e,
        'identity-rejected',
        'The DXF repeats an entity handle, so handle-or-op identity is ambiguous.',
      );
      return null;
    }
    if (ctx.instancePathBlocker) {
      this.provenanceBlocker(
        pathId,
        e,
        ctx.instancePathBlocker,
        'Exact provenance is unavailable through this block-instance ancestry.',
      );
      return null;
    }
    if (em.provenanceBlocker || !em.sampled) {
      this.provenanceBlocker(
        pathId,
        e,
        em.provenanceBlocker ?? 'native-parameter-unavailable',
        'The legacy path is preserved, but this entity has no exact pre-flatten native parameter trace.',
      );
      return null;
    }
    if (em.sampled.length !== em.pts.length) {
      this.provenanceBlocker(
        pathId,
        e,
        'sample-count-mismatch',
        'Native samples do not align one-to-one with the emitted path points.',
      );
      return null;
    }
    if (em.sampled.length > DXF_PATH_PROVENANCE_MAX_VERTICES_PER_CONTOUR_V1) {
      this.provenanceBlocker(
        pathId,
        e,
        'contour-limit-exceeded',
        'The emitted contour exceeds the assembly handoff vertex limit.',
      );
      return null;
    }
    const curveIds = new Map<number, string>();
    const samples: DxfCurveSampleV1[] = [];
    for (let index = 0; index < em.sampled.length; index += 1) {
      const native = em.sampled[index];
      let sourceCurveId = curveIds.get(native.primitiveSegmentIndex);
      if (!sourceCurveId) {
        const curve = createDxfSourceCurveIdV1({
          sourceFileId: capture.sourceFileId,
          instancePath: ctx.instancePath,
          entityHandle: native.entityHandle,
          entityOp: native.entityOp,
          sub: native.sub,
          primitiveSegmentIndex: native.primitiveSegmentIndex,
        });
        if (!curve.ok) {
          this.provenanceBlocker(pathId, e, 'identity-rejected', curve.errors.join('; '));
          return null;
        }
        sourceCurveId = curve.value;
        curveIds.set(native.primitiveSegmentIndex, sourceCurveId);
      }
      const sample = createDxfCurveSampleV1(
        sourceCurveId,
        index,
        native.parameterSpace,
        native.sourceCurveT,
      );
      if (!sample.ok) {
        this.provenanceBlocker(pathId, e, 'identity-rejected', sample.errors.join('; '));
        return null;
      }
      samples.push(sample.value);
    }
    const provenance = createDxfPathProvenanceV1({
      sourceFileId: capture.sourceFileId,
      instancePath: ctx.instancePath,
      samples,
      expectedPointCount: em.pts.length,
    });
    if (!provenance.ok) {
      const code =
        provenance.code === 'sample-count-mismatch' ? 'sample-count-mismatch' : 'identity-rejected';
      this.provenanceBlocker(pathId, e, code, provenance.errors.join('; '));
      return null;
    }
    capture.paths.push(Object.freeze({ pathId, provenance: provenance.value }));
    return provenance.value;
  }

  private straightEdgeBlocker(
    code: DxfSourceNativeStraightEdgeDecodedBlockerV1['code'],
    pathId: PathId | null,
    e: RawEntity | null,
    detail: string,
    sourceCurveId: string | null = null,
    primitiveSegmentIndex: number | null = null,
  ): void {
    const capture = this.straightEdgeCapture;
    if (!capture) return;
    // Never let the diagnostic cap erase a rejection on a later selected path.
    const coverage = pathId === null ? undefined : capture.pathCoverage.get(pathId);
    if (coverage) coverage.rejected = true;
    else capture.globalCoverageFailure = true;
    if (capture.blockerOverflow) return;
    if (capture.blockers.length >= MAX_STRAIGHT_EDGE_BLOCKERS) {
      capture.blockerOverflow = true;
      return;
    }
    if (capture.blockers.length >= MAX_STRAIGHT_EDGE_BLOCKERS - 1 && code !== 'bounds-exceeded') {
      capture.blockers.push(
        Object.freeze({
          code: 'bounds-exceeded',
          sourceFileId: capture.sourceFileId,
          sourcePathId: pathId,
          sourceCurveId: null,
          primitiveSegmentIndex: null,
          entityType: e?.type ?? null,
          detail: 'Straight-edge blocker capture reached its fixed extraction bound.',
        }),
      );
      capture.blockerOverflow = true;
      return;
    }
    capture.blockers.push(
      Object.freeze({
        code,
        sourceFileId: capture.sourceFileId,
        sourcePathId: pathId,
        sourceCurveId,
        primitiveSegmentIndex,
        entityType: e?.type ?? null,
        detail,
      }),
    );
    if (code === 'bounds-exceeded' && capture.blockers.length >= MAX_STRAIGHT_EDGE_BLOCKERS)
      capture.blockerOverflow = true;
  }

  private captureStraightEdgeAuthority(
    pathId: PathId,
    e: RawEntity,
    ctx: Ctx,
    em: Emit,
    provenance: DxfPathProvenanceV1 | null,
  ): void {
    const capture = this.straightEdgeCapture;
    if (!capture) return;
    if (
      capture.pathCoverage.size >= MAX_STRAIGHT_EDGE_PATH_COVERAGE ||
      capture.pathCoverage.has(pathId)
    )
      capture.globalCoverageFailure = true;
    else
      capture.pathCoverage.set(pathId, {
        pointCount: em.pts.length,
        closed: em.closed,
        rejected: false,
      });
    if (e.handle && this.duplicateEntityHandles.has(e.handle.toUpperCase())) {
      this.straightEdgeBlocker(
        'identity-rejected',
        pathId,
        e,
        'The DXF repeats an entity handle, so straight-edge identity is ambiguous.',
      );
      return;
    }
    if (ctx.instancePathBlocker) {
      this.straightEdgeBlocker(
        'identity-rejected',
        pathId,
        e,
        'Exact nested-instance identity is unavailable for this path.',
      );
      return;
    }
    const facts = em.straightEdgeFacts;
    if (!facts || facts.length === 0) {
      this.straightEdgeBlocker(
        'unsupported-entity-kind',
        pathId,
        e,
        'This emitted entity is outside the source-native straight-edge beta subset.',
      );
      return;
    }

    for (const fact of facts) {
      const curve = createDxfSourceCurveIdV1({
        sourceFileId: capture.sourceFileId,
        instancePath: ctx.instancePath,
        entityHandle: e.handle?.toUpperCase() ?? null,
        entityOp: e.op,
        sub: em.sub,
        primitiveSegmentIndex: fact.primitiveSegmentIndex,
      });
      if (!curve.ok) {
        this.straightEdgeBlocker(
          'identity-rejected',
          pathId,
          e,
          curve.errors.join('; '),
          null,
          fact.primitiveSegmentIndex,
        );
        continue;
      }
      const sourceCurveId = curve.value;
      if (fact.kind === 'unsupported') {
        this.straightEdgeBlocker(
          fact.code,
          pathId,
          e,
          fact.detail,
          sourceCurveId,
          fact.primitiveSegmentIndex,
        );
        continue;
      }
      if (!provenance) {
        this.straightEdgeBlocker(
          'path-provenance-unavailable',
          pathId,
          e,
          'A decoder-minted line exists, but its exact V1 path provenance was not admitted.',
          sourceCurveId,
          fact.primitiveSegmentIndex,
        );
        continue;
      }
      if (
        !Number.isSafeInteger(fact.startPointIndex) ||
        !Number.isSafeInteger(fact.endPointIndex) ||
        fact.startPointIndex < 0 ||
        fact.endPointIndex < 0 ||
        fact.startPointIndex >= em.pts.length ||
        fact.endPointIndex >= em.pts.length ||
        provenance.samples.length !== em.pts.length
      ) {
        this.straightEdgeBlocker(
          'identity-rejected',
          pathId,
          e,
          'The decoder-minted primitive indices do not exact-match the emitted path.',
          sourceCurveId,
          fact.primitiveSegmentIndex,
        );
        continue;
      }
      const startSample = provenance.samples[fact.startPointIndex];
      const endSample = provenance.samples[fact.endPointIndex];
      if (!startSample || !endSample || startSample.sourceCurveId !== sourceCurveId) {
        this.straightEdgeBlocker(
          'identity-rejected',
          pathId,
          e,
          'The line start does not own the exact decoder-minted source curve identity.',
          sourceCurveId,
          fact.primitiveSegmentIndex,
        );
        continue;
      }
      const startMm = apply(fact.sourceAffine, fact.nativeStart);
      const endMm = apply(fact.sourceAffine, fact.nativeEnd);
      const emittedStart = em.pts[fact.startPointIndex];
      const emittedEnd = em.pts[fact.endPointIndex];
      const affine = fact.sourceAffine;
      const finiteNumbers = [
        startMm.x,
        startMm.y,
        endMm.x,
        endMm.y,
        affine.a,
        affine.b,
        affine.c,
        affine.d,
        affine.e,
        affine.f,
      ];
      if (
        finiteNumbers.some(
          (value) =>
            !Number.isFinite(value) || Math.abs(value) > MAX_STRAIGHT_EDGE_COORDINATE_ABS_MM,
        ) ||
        startMm.x !== emittedStart.x ||
        startMm.y !== emittedStart.y ||
        endMm.x !== emittedEnd.x ||
        endMm.y !== emittedEnd.y
      ) {
        this.straightEdgeBlocker(
          'identity-rejected',
          pathId,
          e,
          'Exact affine line normalization does not match the emitted page-mm path.',
          sourceCurveId,
          fact.primitiveSegmentIndex,
        );
        continue;
      }
      if (startMm.x === endMm.x && startMm.y === endMm.y) {
        this.straightEdgeBlocker(
          'degenerate-line',
          pathId,
          e,
          'A zero-length source line cannot become Phase2 line authority.',
          sourceCurveId,
          fact.primitiveSegmentIndex,
        );
        continue;
      }
      if (e.type !== 'LINE' && e.type !== 'LWPOLYLINE' && e.type !== 'POLYLINE') {
        this.straightEdgeBlocker(
          'unsupported-entity-kind',
          pathId,
          e,
          'Only LINE and primitive straight polyline segments are admitted.',
          sourceCurveId,
          fact.primitiveSegmentIndex,
        );
        continue;
      }
      const identity = `${capture.sourceFileId}\0${pathId}\0${sourceCurveId}\0${fact.primitiveSegmentIndex}`;
      if (capture.identities.has(identity)) {
        this.straightEdgeBlocker(
          'duplicate-descriptor',
          pathId,
          e,
          'A duplicate source-native straight-edge descriptor was rejected.',
          sourceCurveId,
          fact.primitiveSegmentIndex,
        );
        continue;
      }
      if (capture.candidates.length >= MAX_STRAIGHT_EDGE_DESCRIPTORS) {
        if (!capture.descriptorOverflow) {
          capture.descriptorOverflow = true;
          this.straightEdgeBlocker(
            'bounds-exceeded',
            pathId,
            e,
            'Straight-edge descriptor capture reached its fixed extraction bound.',
            sourceCurveId,
            fact.primitiveSegmentIndex,
          );
        }
        continue;
      }
      capture.identities.add(identity);
      capture.candidates.push(
        Object.freeze({
          sourceFileId: capture.sourceFileId,
          sourceCurveId,
          instancePath: Object.freeze([...ctx.instancePath]),
          path: Object.freeze({
            sourcePathId: pathId,
            closed: em.closed,
            startPointIndex: fact.startPointIndex,
            endPointIndex: fact.endPointIndex,
          }),
          primitive: Object.freeze({
            entityType: e.type,
            entityHandle: e.handle?.toUpperCase() ?? null,
            entityOp: e.op,
            sub: em.sub,
            primitiveSegmentIndex: fact.primitiveSegmentIndex,
          }),
          startVertexId: startSample.vertexId,
          endVertexId: endSample.vertexId,
          startMm: Object.freeze([startMm.x, startMm.y]) as readonly [number, number],
          endMm: Object.freeze([endMm.x, endMm.y]) as readonly [number, number],
          nativeFrame: 'page-mm',
          normalization: Object.freeze({
            kind: 'exact-affine-line-to-page-mm',
            sourceAffine: Object.freeze({ ...affine }),
          }),
          native: Object.freeze({
            sourceCurveId,
            curveKind: 'line',
            parameterSpace: 'unit',
            sourceCurveTRange: Object.freeze([0, 1]) as readonly [0, 1],
            chordErrorBoundMm: 0,
            periodic: false,
            transform: Object.freeze({ kind: 'identity' }),
          }),
        }),
      );
    }
  }

  pushPath(e: RawEntity, ctx: Ctx, em: Emit, key: string): PathId {
    // C4: every point of every block instance is paid for (adapters/budget.ts)
    this.opts.budget?.spend(em.pts.length, 'the DXF entities (with block copies)');
    const id = this.paths.length;
    this.paths.push({
      id,
      pts: em.pts,
      closed: em.closed,
      style: this.style(e, ctx, em.fill, em.width ?? 0),
      src: {
        file: this.fileId,
        page: 0,
        op: e.op,
        sub: em.sub,
        handle: e.handle,
        block: ctx.block,
      },
    });
    this.pathEntity.push(e.type);
    const provenance = this.capturePathProvenance(id, e, ctx, em);
    this.captureStraightEdgeAuthority(id, e, ctx, em, provenance);
    ctx.group.paths.push(id);
    this.rendered.add(key);
    this.bumpEmit(e.type, 'p');
    return id;
  }

  pushText(
    e: RawEntity,
    ctx: Ctx,
    t: {
      text: string;
      anchor: PtMm;
      heightMm: number;
      rotDeg: number;
      widthMm: number;
      lines: number;
    },
    key: string,
  ): number {
    const id = this.texts.length;
    const r = (t.rotDeg * Math.PI) / 180;
    const ux = { x: Math.cos(r), y: Math.sin(r) };
    const uy = { x: -ux.y, y: ux.x };
    const h = t.heightMm;
    const corners = [
      { x: 0, y: -0.25 * h - (t.lines - 1) * 1.66 * h },
      { x: t.widthMm, y: -0.25 * h - (t.lines - 1) * 1.66 * h },
      { x: t.widthMm, y: h },
      { x: 0, y: h },
    ].map((c) => ({
      x: t.anchor.x + c.x * ux.x + c.y * uy.x,
      y: t.anchor.y + c.x * ux.y + c.y * uy.y,
    }));
    this.texts.push({
      id,
      text: t.text,
      anchor: t.anchor,
      bbox: bboxOf(corners),
      fontSizeMm: h,
      rotationDeg: ((t.rotDeg % 360) + 360) % 360,
      layer: this.layerOf(e, ctx),
      src: { file: this.fileId, page: 0, op: e.op, sub: 0, handle: e.handle, block: ctx.block },
    });
    this.textEntity.push(e.type);
    ctx.group.texts.push(id);
    this.rendered.add(key);
    this.bumpEmit(e.type, 't');
    return id;
  }

  drop(key: string, reason: string) {
    if (!this.rendered.has(key) && !this.structural.has(key)) {
      this.dropped.set(key, reason);
      // Paper-space exclusion is explicit. Any other unscoped source loss has no path identity
      // against which a selected-path consumer could prove completeness.
      if (this.straightEdgeCapture && reason !== 'paper-space entity (layout, not the drawing)')
        this.straightEdgeCapture.globalCoverageFailure = true;
    }
  }
}

// ── entity decoders ─────────────────────────────────────────────────────────────────────────

function ocsOf(tags: Tag[]): Affine {
  const nx = numOf(tags, 210);
  const ny = numOf(tags, 220);
  const nz = numOf(tags, 230);
  if (nx == null && ny == null && nz == null) return IDENTITY;
  return ocsToWcs(nx ?? 0, ny ?? 0, nz ?? 1);
}

function pt(tags: Tag[], cx: number, cy: number): P {
  return { x: numOr(tags, cx, 0), y: numOr(tags, cy, 0) };
}

/** LWPOLYLINE vertices in order: 10 opens a vertex, 20 its y, 42 its bulge. */
function lwVertices(tags: Tag[]): { x: number; y: number; bulge: number }[] {
  const v: { x: number; y: number; bulge: number }[] = [];
  for (const t of tags) {
    if (t.code === 10) v.push({ x: num(t), y: 0, bulge: 0 });
    else if (t.code === 20 && v.length) v[v.length - 1].y = num(t);
    else if (t.code === 42 && v.length) v[v.length - 1].bulge = num(t);
  }
  return v;
}

function linearPointSamples(points: readonly P[], closed: boolean): DxfNativePointSample[] {
  const finalPrimitive = Math.max(0, points.length - 2);
  const isOpenFinal = (index: number) =>
    !closed && points.length > 1 && index === points.length - 1;
  return points.map((point, index) => ({
    point,
    parameterSpace: 'unit',
    nativeT: isOpenFinal(index) ? 1 : 0,
    primitiveSegmentIndex: isOpenFinal(index) ? finalPrimitive : index,
  }));
}

function lineFact(
  primitiveSegmentIndex: number,
  startPointIndex: number,
  endPointIndex: number,
  nativeStart: Readonly<P>,
  nativeEnd: Readonly<P>,
  sourceAffine: Readonly<Affine>,
): NativeStraightEdgeFact {
  return Object.freeze({
    kind: 'line',
    primitiveSegmentIndex,
    startPointIndex,
    endPointIndex,
    nativeStart: Object.freeze({ ...nativeStart }),
    nativeEnd: Object.freeze({ ...nativeEnd }),
    sourceAffine: Object.freeze({ ...sourceAffine }),
  });
}

function unsupportedStraightEdgeFact(
  code: DxfSourceNativeStraightEdgeUnsupportedCodeV1,
  detail: string,
  primitiveSegmentIndex = 0,
): NativeStraightEdgeFact {
  return Object.freeze({ kind: 'unsupported', primitiveSegmentIndex, code, detail });
}

function polylineStraightEdgeFacts(
  vertices: readonly Readonly<{ x: number; y: number; bulge: number }>[],
  closed: boolean,
  samples: readonly DxfNativePointSample[],
  sourceAffine: Readonly<Affine>,
  splineFit: boolean,
): readonly NativeStraightEdgeFact[] {
  const segmentCount = closed ? vertices.length : Math.max(0, vertices.length - 1);
  const facts: NativeStraightEdgeFact[] = [];
  for (
    let primitiveSegmentIndex = 0;
    primitiveSegmentIndex < segmentCount;
    primitiveSegmentIndex++
  ) {
    if (splineFit) {
      facts.push(
        unsupportedStraightEdgeFact(
          'unsupported-spline-fit-polyline',
          'Spline-fit POLYLINE primitives are outside the straight-edge beta subset.',
          primitiveSegmentIndex,
        ),
      );
      continue;
    }
    const start = vertices[primitiveSegmentIndex];
    const end = vertices[(primitiveSegmentIndex + 1) % vertices.length];
    if (start.bulge !== 0) {
      facts.push(
        unsupportedStraightEdgeFact(
          'unsupported-bulge',
          'A non-zero polyline bulge is source-native curved geometry and is not a line.',
          primitiveSegmentIndex,
        ),
      );
      continue;
    }
    const startPointIndex = samples.findIndex(
      (sample) => sample.primitiveSegmentIndex === primitiveSegmentIndex,
    );
    const endPointIndex =
      primitiveSegmentIndex + 1 < segmentCount
        ? samples.findIndex((sample) => sample.primitiveSegmentIndex === primitiveSegmentIndex + 1)
        : closed
          ? 0
          : samples.length - 1;
    facts.push(
      lineFact(primitiveSegmentIndex, startPointIndex, endPointIndex, start, end, sourceAffine),
    );
  }
  return Object.freeze(facts);
}

function markUnsupportedStraightEdge(
  emitted: Emit,
  code: DxfSourceNativeStraightEdgeUnsupportedCodeV1,
  detail: string,
): Emit {
  emitted.straightEdgeFacts = Object.freeze([unsupportedStraightEdgeFact(code, detail)]);
  return emitted;
}

function sampledEmit(
  e: RawEntity,
  m: Affine,
  nativeSamples: readonly DxfNativePointSample[],
  options: Readonly<{
    closed: boolean;
    sub: number;
    fill: boolean;
    width?: number;
  }>,
): Emit {
  const sampled = nativeSamples.map((native) =>
    Object.freeze({
      point: apply(m, native.point),
      parameterSpace: native.parameterSpace,
      sourceCurveT: native.nativeT,
      primitiveSegmentIndex: native.primitiveSegmentIndex,
      entityHandle: e.handle?.toUpperCase() ?? null,
      entityOp: e.op,
      sub: options.sub,
    }),
  );
  return {
    pts: sampled.map(({ point }) => point),
    closed: options.closed,
    sub: options.sub,
    fill: options.fill,
    ...(options.width === undefined ? {} : { width: options.width }),
    sampled: Object.freeze(sampled),
  };
}

function decodeGeometry(e: RawEntity, ctx: Ctx, b: Builder): Emit[] | { drop: string } {
  const tg = e.tags;
  const tol = ctx.tol;
  const M = ctx.M;
  const toPage = (m: Affine, pts: P[]) => pts.map((p) => apply(m, p));
  switch (e.type) {
    case 'LINE': {
      const nativeStart = pt(tg, 10, 20);
      const nativeEnd = pt(tg, 11, 21);
      const emitted = sampledEmit(e, M, linearPointSamples([nativeStart, nativeEnd], false), {
        closed: false,
        sub: 0,
        fill: false,
      });
      emitted.straightEdgeFacts = Object.freeze([lineFact(0, 0, 1, nativeStart, nativeEnd, M)]);
      return [emitted];
    }
    case 'LWPOLYLINE': {
      const flags = int(tg, 70) ?? 0;
      const closed = (flags & 1) === 1;
      const v = lwVertices(tg);
      if (v.length === 0) return { drop: 'polyline without vertices' };
      const m = mul(M, ocsOf(tg));
      const nativeSamples = bulgePolylinePointSamples(v, closed, tol);
      const emitted = sampledEmit(e, m, nativeSamples, {
        closed,
        sub: 0,
        fill: false,
        width: numOr(tg, 43, 0),
      });
      if (v.length < 2) emitted.provenanceBlocker = 'native-parameter-unavailable';
      emitted.straightEdgeFacts = polylineStraightEdgeFacts(v, closed, nativeSamples, m, false);
      return [emitted];
    }
    case 'POLYLINE': {
      const flags = int(tg, 70) ?? 0;
      if (flags & 16) return { drop: 'polygon mesh (3D surface)' };
      if (flags & 64) return { drop: 'polyface mesh (3D surface)' };
      const closed = (flags & 1) === 1;
      const is3d = (flags & 8) === 8;
      type V = { x: number; y: number; bulge: number; f: number };
      let vs: V[] = e.children.map((c) => ({
        x: numOr(c.tags, 10, 0),
        y: numOr(c.tags, 20, 0),
        bulge: numOr(c.tags, 42, 0),
        f: int(c.tags, 70) ?? 0,
      }));
      const splineFit = vs.some((v) => v.f & 8);
      vs = splineFit ? vs.filter((v) => v.f & 8 || !(v.f & 16)) : vs.filter((v) => !(v.f & 16));
      if (vs.length === 0) return { drop: 'polyline without vertices' };
      const m = is3d ? M : mul(M, ocsOf(tg));
      const nativeSamples = bulgePolylinePointSamples(vs, closed, tol);
      const emitted = sampledEmit(e, m, nativeSamples, {
        closed,
        sub: 0,
        fill: false,
        width: numOr(tg, 40, 0),
      });
      if (vs.length < 2 || splineFit) emitted.provenanceBlocker = 'native-parameter-unavailable';
      emitted.straightEdgeFacts = polylineStraightEdgeFacts(
        vs,
        closed,
        nativeSamples,
        m,
        splineFit,
      );
      return [emitted];
    }
    case 'ARC': {
      const c = pt(tg, 10, 20);
      const r = numOr(tg, 40, 0);
      const a0 = (numOr(tg, 50, 0) * Math.PI) / 180;
      const a1 = (numOr(tg, 51, 360) * Math.PI) / 180;
      let sweep = a1 - a0;
      while (sweep <= 1e-12) sweep += 2 * Math.PI;
      return [
        markUnsupportedStraightEdge(
          sampledEmit(e, mul(M, ocsOf(tg)), arcPointSamples(c.x, c.y, r, a0, sweep, tol), {
            closed: false,
            sub: 0,
            fill: false,
          }),
          'unsupported-arc',
          'ARC is source-native curved geometry and is not admitted as a line.',
        ),
      ];
    }
    case 'CIRCLE': {
      const c = pt(tg, 10, 20);
      const r = numOr(tg, 40, 0);
      const samples = arcPointSamples(c.x, c.y, r, 0, 2 * Math.PI, tol);
      samples.pop();
      while (samples.length < 8) {
        // tiny circles: keep at least an octagon so drills stay recognisable
        const n = 8;
        samples.length = 0;
        for (let i = 0; i < n; i++)
          samples.push({
            point: {
              x: c.x + r * Math.cos((2 * Math.PI * i) / n),
              y: c.y + r * Math.sin((2 * Math.PI * i) / n),
            },
            parameterSpace: 'angle-radians',
            nativeT: (2 * Math.PI * i) / n,
            primitiveSegmentIndex: 0,
          });
      }
      return [
        markUnsupportedStraightEdge(
          sampledEmit(e, mul(M, ocsOf(tg)), samples, {
            closed: true,
            sub: 0,
            fill: false,
          }),
          'unsupported-circle',
          'CIRCLE is source-native curved geometry and is not admitted as a line.',
        ),
      ];
    }
    case 'ELLIPSE': {
      const nz = numOf(tg, 230) ?? 1;
      const { samples, full } = ellipsePointSamples(
        pt(tg, 10, 20),
        pt(tg, 11, 21),
        numOr(tg, 40, 1),
        numOr(tg, 41, 0),
        numOr(tg, 42, 2 * Math.PI),
        nz < 0 ? -1 : 1,
        tol,
      );
      return [
        markUnsupportedStraightEdge(
          sampledEmit(e, M, samples, { closed: full, sub: 0, fill: false }),
          'unsupported-ellipse',
          'ELLIPSE is source-native curved geometry and is not admitted as a line.',
        ),
      ];
    }
    case 'SPLINE': {
      const flags = int(tg, 70) ?? 0;
      const closed = (flags & 1) === 1;
      const degree = int(tg, 71) ?? 3;
      const knots = tg.filter((t) => t.code === 40).map(num);
      const weights = tg.filter((t) => t.code === 41).map(num);
      const ctrl: P[] = [];
      const fit: P[] = [];
      for (const t of tg) {
        if (t.code === 10) ctrl.push({ x: num(t), y: 0 });
        else if (t.code === 20 && ctrl.length) ctrl[ctrl.length - 1].y = num(t);
        else if (t.code === 11) fit.push({ x: num(t), y: 0 });
        else if (t.code === 21 && fit.length) fit[fit.length - 1].y = num(t);
      }
      if (ctrl.length >= degree + 1 && knots.length === ctrl.length + degree + 1) {
        const exactWeights = weights.length === 0 || weights.length === ctrl.length;
        const w = weights.length === ctrl.length ? weights : ctrl.map(() => 1);
        const t0 = knots[degree];
        const t1 = knots[ctrl.length];
        const samples = sampleAdaptivePointSamples(
          (t) => nurbsAt(degree, ctrl, w, knots, t),
          t0,
          t1,
          Math.max(4, ctrl.length - degree) * 2,
          tol,
          'knot-domain',
          0,
        );
        if (
          closed &&
          samples.length > 2 &&
          Math.hypot(
            samples[0].point.x - samples[samples.length - 1].point.x,
            samples[0].point.y - samples[samples.length - 1].point.y,
          ) < tol
        )
          samples.pop();
        const emitted = sampledEmit(e, M, samples, { closed, sub: 0, fill: false });
        if (!exactWeights) emitted.provenanceBlocker = 'native-parameter-unavailable';
        emitted.straightEdgeFacts = Object.freeze([
          unsupportedStraightEdgeFact(
            'unsupported-spline',
            'SPLINE is source-native curved geometry and is not admitted as a line.',
          ),
        ]);
        return [emitted];
      }
      if (fit.length >= 2) {
        const emitted: Emit = {
          pts: toPage(M, catmullRom(fit, closed, tol)),
          closed,
          sub: 0,
          fill: false,
          provenanceBlocker: 'native-parameter-unavailable',
          straightEdgeFacts: Object.freeze([
            unsupportedStraightEdgeFact(
              'unsupported-spline',
              'SPLINE is source-native curved geometry and is not admitted as a line.',
            ),
          ]),
        };
        return [emitted];
      }
      if (ctrl.length >= 2) {
        b.warnings.push(
          `SPLINE at line ${e.line}: malformed knot vector — its control polygon is used`,
        );
        return [
          {
            pts: toPage(M, ctrl),
            closed,
            sub: 0,
            fill: false,
            provenanceBlocker: 'native-parameter-unavailable',
            straightEdgeFacts: Object.freeze([
              unsupportedStraightEdgeFact(
                'unsupported-spline',
                'SPLINE is source-native curved geometry and is not admitted as a line.',
              ),
            ]),
          },
        ];
      }
      return { drop: 'spline without control or fit points' };
    }
    case 'POINT': {
      return [
        {
          pts: toPage(M, [pt(tg, 10, 20)]),
          closed: false,
          sub: 0,
          fill: false,
          provenanceBlocker: 'native-parameter-unavailable',
        },
      ];
    }
    case 'SOLID':
    case 'TRACE':
    case '3DFACE': {
      const c = [pt(tg, 10, 20), pt(tg, 11, 21), pt(tg, 12, 22), pt(tg, 13, 23)];
      const order = e.type === '3DFACE' ? [0, 1, 2, 3] : [0, 1, 3, 2];
      const pts = order.map((k) => c[k]);
      if (Math.hypot(pts[3].x - pts[2].x, pts[3].y - pts[2].y) < 1e-12) pts.pop();
      const m = e.type === '3DFACE' ? M : mul(M, ocsOf(tg));
      return [
        sampledEmit(e, m, linearPointSamples(pts, true), {
          closed: true,
          sub: 0,
          fill: e.type !== '3DFACE',
        }),
      ];
    }
    case 'LEADER': {
      const pts: P[] = [];
      for (const t of tg) {
        if (t.code === 10) pts.push({ x: num(t), y: 0 });
        else if (t.code === 20 && pts.length) pts[pts.length - 1].y = num(t);
      }
      if (pts.length < 1) return { drop: 'leader without vertices' };
      const emitted = sampledEmit(e, M, linearPointSamples(pts, false), {
        closed: false,
        sub: 0,
        fill: false,
      });
      if (pts.length < 2) emitted.provenanceBlocker = 'native-parameter-unavailable';
      return [emitted];
    }
    case 'HATCH':
      return hatchLoops(e, ctx);
    default:
      return { drop: `unsupported entity ${e.type}` };
  }
}

/** HATCH boundary loops → closed fill paths (one per loop, `sub` = loop index). */
function hatchLoops(e: RawEntity, ctx: Ctx): Emit[] | { drop: string } {
  const tg = e.tags;
  const m = mul(ctx.M, ocsOf(tg));
  const tol = ctx.tol;
  let i = tg.findIndex((t) => t.code === 91);
  if (i < 0) return { drop: 'hatch without boundary' };
  const nLoops = Math.trunc(num(tg[i]));
  i++;
  const next = (code: number): Tag | null => {
    while (i < tg.length && tg[i].code !== code) i++;
    if (i >= tg.length) return null;
    return tg[i++];
  };
  const out: Emit[] = [];
  for (let L = 0; L < nLoops; L++) {
    const ft = next(92);
    if (!ft) break;
    const flags = Math.trunc(num(ft));
    const pts: P[] = [];
    if (flags & 2) {
      const hasBulge = Math.trunc(num(next(72) ?? ft)) === 1;
      next(73);
      const n = Math.trunc(num(next(93) ?? ft));
      const v: { x: number; y: number; bulge: number }[] = [];
      for (let k = 0; k < n; k++) {
        const x = next(10);
        const y = next(20);
        if (!x || !y) break;
        let bulge = 0;
        if (hasBulge && tg[i]?.code === 42) bulge = num(tg[i++]);
        v.push({ x: num(x), y: num(y), bulge });
      }
      pts.push(...bulgePolyline(v, true, tol));
    } else {
      const nEdges = Math.trunc(num(next(93) ?? ft));
      for (let k = 0; k < nEdges; k++) {
        const typ = Math.trunc(num(next(72) ?? ft));
        const seg: P[] = [];
        if (typ === 1) {
          seg.push(
            { x: num(next(10)!), y: num(next(20)!) },
            { x: num(next(11)!), y: num(next(21)!) },
          );
        } else if (typ === 2) {
          const c = { x: num(next(10)!), y: num(next(20)!) };
          const r = num(next(40)!);
          const s = num(next(50)!);
          const en = num(next(51)!);
          const ccw = Math.trunc(num(next(73)!)) === 1;
          const a0 = ((ccw ? s : -s) * Math.PI) / 180;
          let sweep = ((ccw ? en - s : -(en - s)) * Math.PI) / 180;
          if (ccw) while (sweep <= 0) sweep += 2 * Math.PI;
          else while (sweep >= 0) sweep -= 2 * Math.PI;
          seg.push(...arcPts(c.x, c.y, r, a0, sweep, tol));
        } else if (typ === 3) {
          const c = { x: num(next(10)!), y: num(next(20)!) };
          const maj = { x: num(next(11)!), y: num(next(21)!) };
          const ratio = num(next(40)!);
          const s = (num(next(50)!) * Math.PI) / 180;
          const en = (num(next(51)!) * Math.PI) / 180;
          const ccw = Math.trunc(num(next(73)!)) === 1;
          seg.push(...ellipsePts(c, maj, ratio, ccw ? s : -en, ccw ? en : -s, 1, tol).pts);
          if (!ccw) seg.reverse();
        } else if (typ === 4) {
          const deg = Math.trunc(num(next(94)!));
          next(73);
          next(74);
          const nk = Math.trunc(num(next(95)!));
          const nc = Math.trunc(num(next(96)!));
          const knots: number[] = [];
          for (let q = 0; q < nk; q++) knots.push(num(next(40)!));
          const ctrl: P[] = [];
          const w: number[] = [];
          for (let q = 0; q < nc; q++) {
            ctrl.push({ x: num(next(10)!), y: num(next(20)!) });
            w.push(tg[i]?.code === 42 ? num(tg[i++]) : 1);
          }
          if (knots.length === nc + deg + 1 && nc > deg) {
            seg.push(
              ...sampleAdaptive(
                (t) => nurbsAt(deg, ctrl, w, knots, t),
                knots[deg],
                knots[nc],
                nc * 2,
                tol,
              ),
            );
          } else seg.push(...ctrl);
        } else {
          return { drop: `hatch edge type ${typ} not readable` };
        }
        for (const p of seg) {
          const last = pts[pts.length - 1];
          if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-9) pts.push(p);
        }
      }
      if (
        pts.length > 2 &&
        Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-9
      )
        pts.pop();
    }
    if (pts.length)
      out.push({
        pts: pts.map((p) => apply(m, p)),
        closed: true,
        sub: L,
        fill: true,
        provenanceBlocker: 'native-parameter-unavailable',
      });
  }
  if (out.length === 0) return { drop: 'hatch boundary unreadable' };
  return out;
}

function textOf(
  e: RawEntity,
  ctx: Ctx,
): {
  text: string;
  anchor: PtMm;
  heightMm: number;
  rotDeg: number;
  widthMm: number;
  lines: number;
} {
  const tg = e.tags;
  const s = scaleOf(ctx.M);
  if (e.type === 'MTEXT') {
    const chunks = tg.filter((t) => t.code === 3).map((t) => t.value);
    const v = chunks.join('') + (rawStr(tg, 1) ?? '');
    const text = decodeMText(v);
    const h = numOr(tg, 40, 2.5);
    const xd = numOf(tg, 11) != null ? pt(tg, 11, 21) : null;
    const localRot = xd ? Math.atan2(xd.y, xd.x) : numOr(tg, 50, 0); // 50 is radians for MTEXT
    const dir = applyDir(ctx.M, { x: Math.cos(localRot), y: Math.sin(localRot) });
    const lines = Math.max(1, text.split('\n').length);
    const longest = Math.max(1, ...text.split('\n').map((l) => l.length));
    const refW = numOr(tg, 41, 0);
    const wLocal = refW > 0 ? Math.min(refW, longest * 0.6 * h) : longest * 0.6 * h;
    const att = int(tg, 71) ?? 1;
    // insertion → baseline-left of the first line
    const col = (att - 1) % 3; // 0 left 1 centre 2 right
    const row = Math.floor((att - 1) / 3); // 0 top 1 middle 2 bottom
    const blockH = lines * h * 1.66;
    const dx = -[0, wLocal / 2, wLocal][col];
    const dy = [-h, blockH / 2 - h, blockH - h][row];
    const ins = pt(tg, 10, 20);
    const r = localRot;
    const local = {
      x: ins.x + dx * Math.cos(r) - dy * Math.sin(r),
      y: ins.y + dx * Math.sin(r) + dy * Math.cos(r),
    };
    return {
      text,
      anchor: apply(ctx.M, local),
      heightMm: h * s,
      rotDeg: (Math.atan2(dir.y, dir.x) * 180) / Math.PI,
      widthMm: wLocal * s,
      lines,
    };
  }
  // TEXT / ATTRIB / ATTDEF — OCS
  const m = mul(ctx.M, ocsOf(tg));
  const value =
    e.type === 'ATTDEF' && rawStr(tg, 1) === '' ? (str(tg, 2) ?? '') : (rawStr(tg, 1) ?? '');
  const text = decodeTextValue(value);
  const h = numOr(tg, 40, 2.5);
  const rot = (numOr(tg, 50, 0) * Math.PI) / 180;
  const dir = applyDir(m, { x: Math.cos(rot), y: Math.sin(rot) });
  const wf = numOr(tg, 41, 1) || 1;
  return {
    text,
    anchor: apply(m, pt(tg, 10, 20)),
    heightMm: h * s,
    rotDeg: (Math.atan2(dir.y, dir.x) * 180) / Math.PI,
    widthMm: Math.max(1, text.length) * 0.6 * h * wf * s,
    lines: 1,
  };
}

// ── walk ────────────────────────────────────────────────────────────────────────────────────

function insertTransform(e: RawEntity, block: RawBlock, ci: number, ri: number): Affine {
  const tg = e.tags;
  const pos = pt(tg, 10, 20);
  const sx = numOf(tg, 41) ?? 1;
  const sy = numOf(tg, 42) ?? 1;
  const rot = (numOr(tg, 50, 0) * Math.PI) / 180;
  const colSp = numOr(tg, 44, 0);
  const rowSp = numOr(tg, 45, 0);
  // OCS · T(pos) · R · T(array offset) · S · T(−base)
  return mul(
    ocsOf(tg),
    mul(
      translate(pos.x, pos.y),
      mul(
        rotate(rot),
        mul(
          translate(ci * colSp, ri * rowSp),
          mul(scale(sx || 1, sy || 1), translate(-block.base.x, -block.base.y)),
        ),
      ),
    ),
  );
}

function walk(list: RawEntity[], ctx: Ctx, b: Builder, newGroupPerInsert: boolean): void {
  for (const e of list) {
    const key = String(e.op);
    if (e.paper) {
      b.drop(key, 'paper-space entity (layout, not the drawing)');
      continue;
    }
    if (e.type === 'INSERT' || e.type === 'DIMENSION') {
      const name = str(e.tags, 2) ?? '';
      const block = b.raw.blocks.get(name);
      if (!block) {
        b.drop(
          key,
          e.type === 'INSERT'
            ? `INSERT of a missing block “${name}”`
            : 'DIMENSION without its block (measurement drawn nowhere)',
        );
        if (e.type === 'INSERT') b.warnings.push(`INSERT references a missing block “${name}”`);
        continue;
      }
      if (block.flags & 4) {
        b.drop(key, `external reference “${name}” (xref) — not embedded in this file`);
        continue;
      }
      if (ctx.depth >= MAX_DEPTH) {
        if (b.straightEdgeCapture) b.straightEdgeCapture.globalCoverageFailure = true;
        b.drop(key, `nested deeper than ${MAX_DEPTH} levels`);
        continue;
      }
      const cols = e.type === 'INSERT' ? Math.max(1, int(e.tags, 70) ?? 1) : 1;
      const rows = e.type === 'INSERT' ? Math.max(1, int(e.tags, 71) ?? 1) : 1;
      const layer = b.layerOf(e, ctx);
      const color = int(e.tags, 62);
      let placed = 0;
      for (let ci = 0; ci < cols; ci++) {
        for (let ri = 0; ri < rows; ri++) {
          if (b.budget <= 0) break;
          b.budget--;
          placed++;
          const T =
            e.type === 'INSERT'
              ? insertTransform(e, block, ci, ri)
              : translate(-block.base.x, -block.base.y);
          const M = mul(ctx.M, T);
          let instancePath = ctx.instancePath;
          let instancePathBlocker = ctx.instancePathBlocker;
          if (
            (b.provenanceCapture || b.straightEdgeCapture) &&
            e.type === 'INSERT' &&
            instancePathBlocker === null
          ) {
            if (e.handle && b.duplicateEntityHandles.has(e.handle.toUpperCase())) {
              instancePathBlocker = 'identity-rejected';
            }
            const step = createDxfInsertInstancePathV1([
              {
                blockName: name,
                insertHandle: e.handle?.toUpperCase() ?? null,
                insertOp: e.op,
                occurrenceIndex: ci * rows + ri,
                mInsertRow: ri,
                mInsertColumn: ci,
              },
            ]);
            if (instancePathBlocker === null) {
              if (step.ok) instancePath = Object.freeze([...ctx.instancePath, ...step.value]);
              else instancePathBlocker = 'identity-rejected';
            }
          } else if (
            (b.provenanceCapture || b.straightEdgeCapture) &&
            e.type === 'DIMENSION' &&
            instancePathBlocker === null
          ) {
            instancePathBlocker = 'instance-kind-unsupported';
          }
          let group = ctx.group;
          if (newGroupPerInsert && e.type === 'INSERT') {
            group = {
              index: b.groups.length,
              kind: 'insert',
              block: name,
              insertOp: e.op,
              insertHandle: e.handle,
              transform: M,
              paths: [],
              texts: [],
            };
            b.groups.push(group);
            b.insertCount++;
          }
          walk(
            block.entities,
            {
              M,
              tol: (b.opts.sagittaMm || PATIMPORT.sagittaMm) / scaleOf(M),
              block: name,
              layer0: layer,
              colorByBlock: color == null || color === 256 ? null : color,
              group,
              depth: ctx.depth + 1,
              instancePath,
              instancePathBlocker,
            },
            b,
            false,
          );
          // ATTRIBs are already placed in the INSERT's own space (not the block's).
          if (e.type === 'INSERT') {
            e.children.forEach((c, k) => {
              const ck = `${e.op}.${k}`;
              b.pushText(c, { ...ctx, group }, textOf(c, ctx), ck);
              const tag = str(c.tags, 2);
              if (tag) b.attribTag[b.texts.length - 1] = tag;
            });
          }
        }
      }
      if (placed < cols * rows) {
        if (b.straightEdgeCapture) b.straightEdgeCapture.globalCoverageFailure = true;
        if (!b.budgetWarned) {
          b.budgetWarned = true;
          b.warnings.push(`more than ${MAX_INSTANCES} block instances — the rest are not expanded`);
        }
        if (placed === 0) b.drop(key, `instance budget (${MAX_INSTANCES}) exhausted`);
      }
      if (placed > 0) b.structural.add(key);
      continue;
    }
    if (e.type === 'ATTDEF' && ctx.block != null) {
      // A template: drawn only through the ATTRIBs of each INSERT.
      b.structural.add(key);
      continue;
    }
    if (e.type === 'TEXT' || e.type === 'MTEXT' || e.type === 'ATTDEF') {
      b.pushText(e, ctx, textOf(e, ctx), key);
      continue;
    }
    if (e.type === 'IMAGE') {
      const p0 = pt(e.tags, 10, 20);
      const u = pt(e.tags, 11, 21);
      const v = pt(e.tags, 12, 22);
      const size = pt(e.tags, 13, 23);
      const corners = [
        p0,
        { x: p0.x + u.x * size.x, y: p0.y + u.y * size.x },
        { x: p0.x + u.x * size.x + v.x * size.y, y: p0.y + u.y * size.x + v.y * size.y },
        { x: p0.x + v.x * size.y, y: p0.y + v.y * size.y },
      ].map((p) => apply(ctx.M, p));
      const bb = bboxOf(corners);
      const wIn = (bb.maxX - bb.minX) / 25.4;
      b.rasters.push({
        id: b.rasters.length,
        page: 0,
        file: b.fileId,
        bbox: bb,
        widthPx: Math.round(size.x),
        heightPx: Math.round(size.y),
        dpi: wIn > 0 ? size.x / wIn : 0,
        pageCover: 0,
      });
      b.rendered.add(key);
      b.bumpEmit(e.type, 'r');
      continue;
    }
    const res = decodeGeometry(e, ctx, b);
    if ('drop' in res) {
      b.drop(key, res.drop);
      continue;
    }
    for (const em of res) {
      const id = b.pushPath(e, ctx, em, key);
      if (e.type === 'POINT') {
        const a = numOf(e.tags, 50);
        let angleDeg: number | null = null;
        if (a != null) {
          const d = applyDir(mul(ctx.M, ocsOf(e.tags)), {
            x: Math.cos((a * Math.PI) / 180),
            y: Math.sin((a * Math.PI) / 180),
          });
          angleDeg = ((((Math.atan2(d.y, d.x) * 180) / Math.PI) % 360) + 360) % 360;
        }
        b.points[id] = {
          path: id,
          at: em.pts[0],
          angleDeg,
          z: numOr(e.tags, 30, 0) * scaleOf(ctx.M),
          thickness: numOr(e.tags, 39, 0),
          layer: b.paths[id] ? (b.styles[b.paths[id].style].layer ?? e.layer) : e.layer,
        };
      }
    }
  }
}

// ── units, dialect ──────────────────────────────────────────────────────────────────────────

export function modelLabelsOf(raw: RawDxf): DecodedLabel[] {
  const out: DecodedLabel[] = [];
  for (const e of raw.entities) {
    if (e.type !== 'TEXT' && e.type !== 'MTEXT') continue;
    const v =
      e.type === 'MTEXT'
        ? decodeMText(rawStr(e.tags, 1) ?? '')
        : decodeTextValue(rawStr(e.tags, 1) ?? '');
    const l = decodeLabel(v);
    if (l) out.push(l);
  }
  return out;
}

export function unitsOf(raw: RawDxf, labels: DecodedLabel[]): DxfUnits {
  const ins = raw.header['$INSUNITS'];
  const insunits = ins?.[0] ? Math.trunc(num(ins[0])) : null;
  if (insunits != null && INSUNITS_MM[insunits]) {
    return {
      insunits,
      mmPerUnit: INSUNITS_MM[insunits],
      source: 'insunits',
      evidence: `$INSUNITS ${insunits}`,
    };
  }
  const u = labels.find((l) => l.key === 'units');
  if (u) {
    if (/metric|mm|millim/i.test(u.value))
      return { insunits, mmPerUnit: 1, source: 'units-text', evidence: `UNITS: ${u.value}` };
    if (/english|inch|imperial/i.test(u.value))
      return { insunits, mmPerUnit: 25.4, source: 'units-text', evidence: `UNITS: ${u.value}` };
    if (/cm|centim/i.test(u.value))
      return { insunits, mmPerUnit: 10, source: 'units-text', evidence: `UNITS: ${u.value}` };
  }
  const meas = raw.header['$MEASUREMENT'];
  if (meas?.[0] && Math.trunc(num(meas[0])) === 0) {
    return {
      insunits,
      mmPerUnit: 25.4,
      source: 'measurement',
      evidence: '$MEASUREMENT 0 (imperial)',
    };
  }
  return {
    insunits,
    mmPerUnit: 1,
    source: 'guess',
    evidence: 'no $INSUNITS and no UNITS text — millimetres assumed',
  };
}

function detectDialect(
  raw: RawDxf,
  labels: DecodedLabel[],
  manifest: boolean,
  version: string | null,
): DxfDialect {
  if (manifest) return 'grbpwr';
  const author = labels.find((l) => l.key === 'author')?.value ?? '';
  let pieceNames = 0;
  let bracketed = 0;
  let lwOnCut = 0;
  const sizeValues = new Set<string>();
  for (const bl of raw.blockOrder) {
    for (const e of bl.entities) {
      if (e.type === 'TEXT') {
        const l = decodeLabel(decodeTextValue(rawStr(e.tags, 1) ?? ''));
        if (l?.key === 'pieceName') pieceNames++;
        if (l?.key === 'size') {
          sizeValues.add(l.value.trim());
          if (/^<.*>$/.test(l.value.trim())) bracketed++;
        }
      }
      if (e.type === 'LWPOLYLINE' && (e.layer === '1' || e.layer === '14')) lwOnCut++;
    }
  }
  if (
    /clo virtual fashion/i.test(author) ||
    (version === 'AC1009' && /\bCLO\b/i.test(labels.find((l) => l.key === 'product')?.value ?? ''))
  ) {
    // CLO's Gerber target writes plain sizes; plain CLO-AAMA brackets one (`<S>`). A single-size
    // file carries no such evidence and stays plain CLO-AAMA.
    return bracketed === 0 && sizeValues.size >= 2 ? 'clo-aama-gerber' : 'clo-aama-r12';
  }
  if (pieceNames > 0) return 'aama';
  if (version && version >= 'AC1015' && lwOnCut > 0) return 'clo-r2000';
  return 'generic';
}

// ── tally ───────────────────────────────────────────────────────────────────────────────────

function tallyOf(raw: RawDxf, b: Builder, innerComments: number) {
  const rows = new Map<string, TallyRow>();
  const row = (type: string) => {
    let r = rows.get(type);
    if (!r) {
      r = {
        type,
        in: 0,
        rendered: 0,
        structural: 0,
        dropped: 0,
        reasons: {},
        emittedPaths: 0,
        emittedTexts: 0,
        emittedRasters: 0,
      };
      rows.set(type, r);
    }
    return r;
  };
  const reason = (r: TallyRow, why: string) => {
    r.dropped++;
    r.reasons[why] = (r.reasons[why] ?? 0) + 1;
  };
  const visit = (e: RawEntity, where: 'block-unused' | 'layout' | 'used') => {
    const key = String(e.op);
    const r = row(e.type);
    r.in++;
    let fate: 'rendered' | 'structural' | string;
    if (b.rendered.has(key)) fate = 'rendered';
    else if (b.structural.has(key)) fate = 'structural';
    else if (b.dropped.has(key)) fate = b.dropped.get(key)!;
    else if (where === 'block-unused') fate = 'inside a block that is never inserted';
    else if (where === 'layout') fate = 'content of a *Model_Space/*Paper_Space layout block';
    else fate = 'UNACCOUNTED';
    if (fate === 'rendered') r.rendered++;
    else if (fate === 'structural') r.structural++;
    else reason(r, fate);
    // children
    e.children.forEach((c, k) => {
      const cr = row(c.type);
      cr.in++;
      if (c.type === 'VERTEX') {
        if (fate === 'rendered') cr.structural++;
        else reason(cr, `vertex of a dropped ${e.type}: ${fate === 'structural' ? 'n/a' : fate}`);
      } else {
        const ck = `${e.op}.${k}`;
        if (b.rendered.has(ck)) cr.rendered++;
        else
          reason(
            cr,
            fate === 'structural' || fate === 'rendered'
              ? 'UNACCOUNTED'
              : `attribute of a dropped INSERT: ${fate}`,
          );
      }
    });
    if (e.seqend) {
      const sr = row('SEQEND');
      sr.in++;
      sr.structural++;
    }
  };
  const used = new Set<string>();
  for (const g of b.groups) if (g.block) used.add(g.block);
  // nested blocks reached through other blocks
  const reached = new Set<string>();
  const markReached = (name: string) => {
    if (reached.has(name)) return;
    reached.add(name);
    const bl = raw.blocks.get(name);
    if (!bl) return;
    for (const e of bl.entities)
      if ((e.type === 'INSERT' || e.type === 'DIMENSION') && b.structural.has(String(e.op)))
        markReached(str(e.tags, 2) ?? '');
  };
  for (const e of raw.entities)
    if ((e.type === 'INSERT' || e.type === 'DIMENSION') && b.structural.has(String(e.op)))
      markReached(str(e.tags, 2) ?? '');
  for (const bl of raw.blockOrder) {
    const r1 = row('BLOCK');
    r1.in++;
    r1.structural++;
    const r2 = row('ENDBLK');
    r2.in++;
    r2.structural++;
    const layout = /^\*(model|paper)_space/i.test(bl.name);
    const isFirst = raw.blocks.get(bl.name) === bl;
    for (const e of bl.entities) {
      const where = layout
        ? 'layout'
        : !isFirst
          ? 'block-unused'
          : reached.has(bl.name)
            ? 'used'
            : 'block-unused';
      visit(e, where);
    }
  }
  for (const e of raw.entities) visit(e, 'used');
  for (const [type, em] of b.emitted) {
    const r = row(type);
    r.emittedPaths = em.p;
    r.emittedTexts = em.t;
    r.emittedRasters = em.r;
  }
  const list = [...rows.values()].sort((a, c) => a.type.localeCompare(c.type));
  const balanced = list.every(
    (r) => r.in === r.rendered + r.structural + r.dropped && !r.reasons['UNACCOUNTED'],
  );
  // cross-check the parser's own walk count
  for (const r of list) {
    const parsed = raw.recordsByType[r.type] ?? 0;
    if (parsed !== r.in) b.warnings.push(`tally: ${r.type} parsed ${parsed} vs accounted ${r.in}`);
  }
  return {
    rows: list,
    innerComments,
    balanced: balanced && list.every((r) => (raw.recordsByType[r.type] ?? 0) === r.in),
  };
}

// ── public ──────────────────────────────────────────────────────────────────────────────────

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function readDxfInternal(
  file: { id: string; name: string; bytes: ArrayBuffer; generatedFusing?: boolean },
  opts: ExtractOpts,
  progress?: Progress,
  provenanceCapture: ProvenanceCapture | null = null,
  straightEdgeCapture: StraightEdgeCapture | null = null,
): Promise<DxfRead> {
  progress?.(0, 3, 'decode');
  const dec = loadDxf(file.bytes);
  const tok = dec.tok;
  const raw = buildAst(tok.tags);
  const manifest = dec.manifest;
  const modelLabels = modelLabelsOf(raw);
  const units = unitsOf(raw, modelLabels);
  const version = raw.header['$ACADVER']?.[0]?.value.trim() ?? null;
  progress?.(1, 3, 'expand');

  const b = new Builder(
    file.id,
    raw,
    units,
    {
      sagittaMm: opts.sagittaMm || PATIMPORT.sagittaMm,
      keepFills: opts.keepFills,
      pages: opts.pages,
      budget: budgetOf(opts),
    },
    provenanceCapture,
    straightEdgeCapture,
  );
  b.warnings.push(...raw.warnings);
  // Unscoped parser recovery cannot establish selected-path completeness.
  if (straightEdgeCapture && raw.warnings.length > 0)
    straightEdgeCapture.globalCoverageFailure = true;
  if (dec.fallback) b.warnings.push(`the file is not UTF-8 — decoded as ${dec.encoding}`);
  if (units.source === 'guess') b.warnings.push(units.evidence);
  const M0 = scale(units.mmPerUnit, units.mmPerUnit);
  const loose: DxfGroup = {
    index: -1,
    kind: 'loose',
    block: null,
    insertOp: null,
    transform: M0,
    paths: [],
    texts: [],
  };
  walk(
    raw.entities,
    {
      M: M0,
      tol: (opts.sagittaMm || PATIMPORT.sagittaMm) / units.mmPerUnit,
      block: null,
      layer0: null,
      colorByBlock: null,
      group: loose,
      depth: 0,
      instancePath: Object.freeze([]),
      instancePathBlocker: null,
    },
    b,
    true,
  );
  if (loose.paths.length || loose.texts.length) {
    loose.index = b.groups.length;
    b.groups.push(loose);
  }
  if (!opts.keepFills) {
    // contract: keepFills=false drops filled paths — explicitly, not silently
    const keep: IRPath[] = [];
    for (const p of b.paths) {
      if (b.styles[p.style].fill)
        b.warnings.push(`filled path ${p.id} (${b.pathEntity[p.id]}) dropped: keepFills=false`);
      else keep.push(p);
    }
    if (keep.length !== b.paths.length)
      b.warnings.push('keepFills=false: path ids are not renumbered; filled ids are absent');
    b.paths = keep;
  }
  progress?.(2, 3, 'tally');

  const allPts: PtMm[] = [];
  for (const p of b.paths) for (const q of p.pts) allPts.push(q);
  for (const t of b.texts)
    allPts.push({ x: t.bbox.minX, y: t.bbox.minY }, { x: t.bbox.maxX, y: t.bbox.maxY });
  for (const r of b.rasters)
    allPts.push({ x: r.bbox.minX, y: r.bbox.minY }, { x: r.bbox.maxX, y: r.bbox.maxY });
  const extents = allPts.length ? bboxOf(allPts) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const pageW = extents.maxX - extents.minX;
  const pageH = extents.maxY - extents.minY;
  for (const r of b.rasters) {
    const a = (r.bbox.maxX - r.bbox.minX) * (r.bbox.maxY - r.bbox.minY);
    r.pageCover = pageW * pageH > 0 ? Math.min(1, a / (pageW * pageH)) : 0;
  }
  const tally = tallyOf(raw, b, tok.innerComments);
  if (!tally.balanced) {
    b.warnings.push('entity tally does not balance — see meta.tally');
    if (straightEdgeCapture) straightEdgeCapture.globalCoverageFailure = true;
  }
  const dialect = detectDialect(raw, modelLabels, manifest, version);
  // A10: piece blocks with a boundary on layer 1 (AAMA / ASTM: 1 = cut line, 14 = sew line)
  const cutBlocks = raw.blockOrder.filter((bl) =>
    bl.entities.some((e) => (e.type === 'POLYLINE' || e.type === 'LWPOLYLINE') && e.layer === '1'),
  ).length;
  const author = modelLabels.find((l) => l.key === 'author')?.value;
  const product = modelLabels.find((l) => l.key === 'product')?.value;
  const ezdxf = /EZDXF/i.test(dec.probeText);
  const producer =
    [version, author, product, ezdxf ? 'ezdxf' : null].filter(Boolean).join(' · ') || null;

  const page: IRPage = {
    file: file.id,
    page: 0,
    widthMm: pageW,
    heightMm: pageH,
    styles: b.styles,
    paths: b.paths,
    texts: b.texts,
    rasters: b.rasters,
    layers: b.layers,
  };
  const doc: SourceDoc = {
    file: {
      id: file.id,
      name: file.name,
      bytes: file.bytes.byteLength,
      sha256: await sha256Hex(file.bytes),
      kind: 'dxf',
      pages: 1,
      producer: producer ?? undefined,
      dxf: { dialect, cutBlocks },
    },
    pages: [page],
    warnings: b.warnings,
  };
  let zeroAllowanceSeamBlocks: DxfMeta['zeroAllowanceSeamBlocks'];
  if (manifest && dec.binary === null && !file.generatedFusing && !dec.generatedFusing) {
    try {
      const conversion = readManifestBytes(file.bytes);
      const zeroAllowancePieces = new Set(
        conversion?.pieces
          .filter((piece) => piece.allowanceMm === 0)
          .map((piece) => piece.identity),
      );
      zeroAllowanceSeamBlocks = new Map(
        (conversion?.blocks ?? []).flatMap(({ block, contour, hasSeam, identity }) =>
          hasSeam && contour && zeroAllowancePieces.has(identity) ? [[block, contour]] : [],
        ),
      );
    } catch {
      // The native read follows the ordinary foreign-file rules if the manifest is invalid.
    }
  }
  const meta: DxfMeta = {
    version,
    dialect,
    producer,
    encoding: dec.encoding,
    encodingFallback: dec.fallback,
    binary: dec.binary,
    units,
    manifest,
    ...(zeroAllowanceSeamBlocks?.size ? { zeroAllowanceSeamBlocks } : {}),
    generatedFusing: dec.generatedFusing || file.generatedFusing === true,
    modelLabels,
    groups: b.groups,
    pathEntity: b.pathEntity,
    textEntity: b.textEntity,
    attribTag: b.attribTag,
    points: b.points,
    tally,
    extents,
    blockCount: raw.blockOrder.filter((x) => !/^\*(model|paper)_space/i.test(x.name)).length,
    insertCount: b.insertCount,
  };
  progress?.(3, 3, 'done');
  return { doc, meta };
}

export async function readDxf(
  file: { id: string; name: string; bytes: ArrayBuffer; generatedFusing?: boolean },
  opts: ExtractOpts,
  progress?: Progress,
): Promise<DxfRead> {
  return readDxfInternal(file, opts, progress);
}

function provenanceReadFailure(
  code: 'source-file-id-missing' | 'source-file-id-invalid',
  detail: string,
): DxfPathProvenanceDetailedReadResultV1 {
  return Object.freeze({
    ok: false as const,
    blockers: Object.freeze([
      Object.freeze({
        code,
        pathId: null,
        entityType: null,
        entityOp: null,
        detail,
      }),
    ]),
    productionReady: false as const,
  });
}

function explicitSourceFileId(
  optionsInput: unknown,
): string | DxfPathProvenanceDetailedReadResultV1 {
  if ((typeof optionsInput !== 'object' && typeof optionsInput !== 'function') || !optionsInput)
    return provenanceReadFailure(
      'source-file-id-missing',
      'The detailed read requires an explicit caller-owned sourceFileId.',
    );
  let prototype: object | null;
  let keys: readonly PropertyKey[];
  let descriptor: PropertyDescriptor | undefined;
  try {
    prototype = Object.getPrototypeOf(optionsInput);
    keys = Reflect.ownKeys(optionsInput);
    descriptor = Object.getOwnPropertyDescriptor(optionsInput, 'sourceFileId');
  } catch {
    return provenanceReadFailure(
      'source-file-id-invalid',
      'The detailed read options are inaccessible or hostile.',
    );
  }
  if (
    prototype !== Object.prototype ||
    keys.length !== 1 ||
    keys[0] !== 'sourceFileId' ||
    !descriptor ||
    !descriptor.enumerable ||
    !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined
  )
    return provenanceReadFailure(
      'source-file-id-invalid',
      'The detailed read options must be an exact data record containing only sourceFileId.',
    );
  const sourceFileId = descriptor.value;
  const probe = createDxfSourceCurveIdV1({
    sourceFileId,
    instancePath: [],
    entityHandle: null,
    entityOp: 0,
    sub: 0,
    primitiveSegmentIndex: 0,
  });
  if (!probe.ok) return provenanceReadFailure('source-file-id-invalid', probe.errors.join('; '));
  return sourceFileId as string;
}

/**
 * Opt-in pre-flatten provenance read. The sidecar is keyed only to original IR path ids and is not
 * propagated through PieceSpec clean/merge/offset stages in V1.
 */
export async function readDxfWithPathProvenanceV1(
  file: { id: string; name: string; bytes: ArrayBuffer; generatedFusing?: boolean },
  opts: ExtractOpts,
  provenanceOptions: unknown,
  progress?: Progress,
): Promise<DxfPathProvenanceDetailedReadResultV1> {
  const sourceFileId = explicitSourceFileId(provenanceOptions);
  if (typeof sourceFileId !== 'string') return sourceFileId;
  const capture: ProvenanceCapture = { sourceFileId, paths: [], blockers: [] };
  const read = await readDxfInternal(file, opts, progress, capture);
  const livePathIds = new Set(read.doc.pages.flatMap((page) => page.paths.map(({ id }) => id)));
  const provenance: DxfPathProvenanceReadArtifactV1 = Object.freeze({
    schemaVersion: DXF_PATH_PROVENANCE_READ_V1,
    sourceFileId,
    paths: Object.freeze(capture.paths.filter(({ pathId }) => livePathIds.has(pathId))),
    blockers: Object.freeze(
      capture.blockers.filter(({ pathId }) => pathId === null || livePathIds.has(pathId)),
    ),
    sharedVertexOwnership: 'outgoing-primitive-open-final-end' as const,
    productionReady: false as const,
    heuristicRecoveryUsed: false as const,
    pieceSpecIntegrated: false as const,
  });
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({ read, provenance }),
  });
}

/**
 * Internal fresh-replay seam for the opaque straight-edge owner. This decoder output is not public
 * authority: only the owning module can mint and consume the one-shot capability.
 */
export type DxfSourceNativeStraightEdgesInternalReadV1 = Readonly<{
  read: DxfRead;
  provenance: DxfPathProvenanceReadArtifactV1;
  candidates: readonly DxfSourceNativeStraightEdgeDecodedCandidateV1[];
  blockers: readonly DxfSourceNativeStraightEdgeDecodedBlockerV1[];
  /** Internal exact ledger; no public projection/capability can manufacture it. */
  selectedPathCoverage: Readonly<{
    globalFailure: boolean;
    paths: readonly Readonly<{
      sourcePathId: number;
      pointCount: number;
      closed: boolean;
      rejected: boolean;
    }>[];
  }>;
}>;

export async function decodeDxfSourceNativeStraightEdgesInternalV1(
  file: { id: string; name: string; bytes: ArrayBuffer; generatedFusing?: boolean },
  opts: ExtractOpts,
  sourceFileId: string,
  progress?: Progress,
): Promise<DxfSourceNativeStraightEdgesInternalReadV1> {
  const provenanceCapture: ProvenanceCapture = { sourceFileId, paths: [], blockers: [] };
  const straightEdgeCapture: StraightEdgeCapture = {
    sourceFileId,
    candidates: [],
    blockers: [],
    identities: new Set(),
    descriptorOverflow: false,
    blockerOverflow: false,
    pathCoverage: new Map(),
    globalCoverageFailure: false,
  };
  const read = await readDxfInternal(file, opts, progress, provenanceCapture, straightEdgeCapture);
  const livePathIds = new Set(read.doc.pages.flatMap((page) => page.paths.map(({ id }) => id)));
  const provenance: DxfPathProvenanceReadArtifactV1 = Object.freeze({
    schemaVersion: DXF_PATH_PROVENANCE_READ_V1,
    sourceFileId,
    paths: Object.freeze(provenanceCapture.paths.filter(({ pathId }) => livePathIds.has(pathId))),
    blockers: Object.freeze(
      provenanceCapture.blockers.filter(({ pathId }) => pathId === null || livePathIds.has(pathId)),
    ),
    sharedVertexOwnership: 'outgoing-primitive-open-final-end' as const,
    productionReady: false as const,
    heuristicRecoveryUsed: false as const,
    pieceSpecIntegrated: false as const,
  });
  return Object.freeze({
    read,
    provenance,
    candidates: Object.freeze(
      straightEdgeCapture.candidates.filter(({ path }) => livePathIds.has(path.sourcePathId)),
    ),
    blockers: Object.freeze(
      straightEdgeCapture.blockers.filter(
        ({ sourcePathId }) => sourcePathId === null || livePathIds.has(sourcePathId),
      ),
    ),
    selectedPathCoverage: Object.freeze({
      globalFailure:
        straightEdgeCapture.globalCoverageFailure || straightEdgeCapture.descriptorOverflow,
      paths: Object.freeze(
        [...straightEdgeCapture.pathCoverage]
          .filter(([id]) => livePathIds.has(id))
          .map(([sourcePathId, path]) => Object.freeze({ sourcePathId, ...path })),
      ),
    }),
  });
}

/** Contract entry point (08-CONTRACT §2): DXF → SourceDoc. Use `readDxf` to also get the
 * DXF side-channel (groups, POINT attributes, tally) the fast path needs. */
export const extractDxf: ExtractFn = async (file, opts, progress) =>
  (await readDxf(file, opts, progress)).doc;
