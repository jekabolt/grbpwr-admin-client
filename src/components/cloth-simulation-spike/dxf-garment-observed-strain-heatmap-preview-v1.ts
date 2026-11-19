import * as THREE from 'three';
import type { DxfGarmentObservedBoundaryEdgeV1 } from './dxf-garment-observed-unsewn-edges-v1';
import { CAD_WORKBENCH_SEAM_SIDE_COLORS } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-workbench-seam-colors-v1';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {
  getDxfGarmentObservedWebgpuReplayLifetimeV1,
  projectDxfGarmentObservedWebgpuRenderV1,
} from './dxf-garment-observed-webgpu-replay-v1';
import { buildBetaSkirtCanonicalMediumStrainHeatmapGeometryV1 } from './beta-skirt-canonical-medium-webgpu-16-frame-strain-heatmap-preview-v1';

const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const add = EventTarget.prototype.addEventListener;
const remove = EventTarget.prototype.removeEventListener;
const aborted = (signal: AbortSignal) => nativeAborted.call(signal) as boolean;
const cancelled = () => new DOMException('The garment frame is no longer current.', 'AbortError');

/** Pure content conversion only. Continuum coloring order is a permutation of render triangles,
 * not their ordinal identity. This helper does not authenticate input or create a runtime owner. */
export function buildDxfGarmentObservedStrainHeatmapGeometryV1(input: {
  finalPositions3M: Float32Array;
  garmentTriangles: Uint32Array;
  strain: {
    values: Float32Array;
    flags: Uint32Array;
    renderTriangleIndices: Uint32Array;
  };
}) {
  const count = input.garmentTriangles.length / 3;
  const { values, flags, renderTriangleIndices } = input.strain;
  if (
    !Number.isSafeInteger(count) ||
    count <= 0 ||
    count > 1_000_000 ||
    values.length !== count * 4 ||
    flags.length !== count ||
    renderTriangleIndices.length !== count
  )
    throw new RangeError('Strain and render triangle dimensions differ.');
  const orderedValues = new Float32Array(count * 4);
  const orderedFlags = new Uint32Array(count);
  const seen = new Uint8Array(count);
  for (let ordinal = 0; ordinal < count; ordinal++) {
    const render = renderTriangleIndices[ordinal]!;
    if (render >= count || seen[render])
      throw new RangeError('Strain render mapping must be an exact triangle permutation.');
    seen[render] = 1;
    orderedFlags[render] = flags[ordinal]!;
    for (let axis = 0; axis < 4; axis++) {
      const value = values[ordinal * 4 + axis]!;
      if (!Number.isFinite(value)) throw new RangeError('Strain values must be finite.');
      orderedValues[render * 4 + axis] = value;
    }
  }
  return buildBetaSkirtCanonicalMediumStrainHeatmapGeometryV1({
    positions: input.finalPositions3M,
    topology: input.garmentTriangles,
    triangleValues: orderedValues,
    validityFlags: orderedFlags,
  });
}

/** Fixed genuine replay projection; no supplied body, topology, projector or strain callback. */
export async function projectDxfGarmentObservedStrainHeatmapV1(
  replayOwner: unknown,
  signal?: AbortSignal,
) {
  const lifetime = getDxfGarmentObservedWebgpuReplayLifetimeV1(replayOwner);
  if (!lifetime) throw new TypeError('A genuine current numeric replay is required.');
  const current = () => {
    if (
      aborted(lifetime) ||
      (signal && aborted(signal)) ||
      getDxfGarmentObservedWebgpuReplayLifetimeV1(replayOwner) !== lifetime ||
      aborted(lifetime) ||
      (signal && aborted(signal))
    )
      throw cancelled();
  };
  current();
  const input = await projectDxfGarmentObservedWebgpuRenderV1(replayOwner, signal);
  current();
  if (
    !input ||
    input.report.status !== 'diagnostic-completed' ||
    !input.report.reportSha256 ||
    !input.report.finalValidation?.ok ||
    !input.strain.passed ||
    input.strain.units !== 'dimensionless' ||
    input.strain.stressPaComputed !== false ||
    (input.frameCount === 32 && input.report.checkpoint16Matched !== true)
  )
    throw new TypeError('Matching final geometry, physical gates and strain are required.');
  const heatmap = buildDxfGarmentObservedStrainHeatmapGeometryV1(input);
  current();
  return Object.freeze({ ...input, heatmap });
}

function deformedPieceBoundary(
  positions: Float32Array,
  triangles: Uint32Array,
  range: Readonly<{ triangleOffset: number; triangleCount: number }>,
): Float32Array {
  const vertexCount = positions.length / 3;
  const edges = new Map<number, { from: number; to: number; incidence: number }>();
  const lastIndex = (range.triangleOffset + range.triangleCount) * 3;
  for (let firstIndex = range.triangleOffset * 3; firstIndex < lastIndex; firstIndex += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const a = triangles[firstIndex + corner]!;
      const b = triangles[firstIndex + ((corner + 1) % 3)]!;
      const from = Math.min(a, b);
      const to = Math.max(a, b);
      const key = from * vertexCount + to;
      const previous = edges.get(key);
      if (previous) previous.incidence++;
      else edges.set(key, { from, to, incidence: 1 });
    }
  }
  const segments: number[] = [];
  for (const { from, to, incidence } of edges.values()) {
    if (incidence !== 1) continue;
    for (const vertex of [from, to]) {
      const offset = vertex * 3;
      segments.push(positions[offset]!, positions[offset + 1]!, positions[offset + 2]!);
    }
  }
  return Float32Array.from(segments);
}

export type DxfGarmentObservedPreviewSeamSideV1 = Readonly<{
  runtimeSeamId: string;
  sideIndex: 0 | 1;
}>;

export type DxfGarmentObservedPreviewSurfacePointV1 = Readonly<{
  vertexIndices: readonly [number, number, number];
  positionM: readonly [number, number, number];
}>;

export type DxfGarmentObservedPreviewHitV1 = Readonly<{
  frameReportSha256: string;
  triangleIndex: number;
}> &
  (
    | Readonly<{
        kind: 'garment';
        pieceId: string;
        seamSide?: DxfGarmentObservedPreviewSeamSideV1;
        surfacePoint?: DxfGarmentObservedPreviewSurfacePointV1;
      }>
    | Readonly<{
        kind: 'body';
        persistedModel: Readonly<{ id: number; updatedAt: string; revision: string }>;
        observedBodyContentSha256: string;
      }>
  );

/** One static view of a genuine16/32 numeric frame. Does not start another solver or GPU device.
 * The WebGL display belongs to this preview and is released independently of the borrowed replay.
 * A product host must additionally retain its durable source and edit-generation lifetimes. */
export async function createDxfGarmentObservedStrainHeatmapPreviewV1(
  canvas: HTMLCanvasElement,
  replayOwner: unknown,
  signal?: AbortSignal,
) {
  const replayLife = getDxfGarmentObservedWebgpuReplayLifetimeV1(replayOwner);
  if (!replayLife) throw new TypeError('A genuine current numeric replay is required.');
  if (typeof HTMLCanvasElement === 'undefined' || !(canvas instanceof HTMLCanvasElement))
    throw new TypeError('A real display canvas is required.');
  const links = [replayLife, ...(signal ? [signal] : [])];
  const attached: AbortSignal[] = [];
  const lifetime = new AbortController();
  const resources: { dispose(): void }[] = [];
  let renderer: THREE.WebGLRenderer | null = null;
  let outline: LineSegments2 | null = null;
  let outlinedPieceId: string | null = null;
  let outlinedSeamSide: DxfGarmentObservedPreviewSeamSideV1 | undefined;
  let outlinedEdge: DxfGarmentObservedBoundaryEdgeV1 | undefined;
  const clearOutline = () => {
    const old = outline;
    outline = null;
    outlinedPieceId = null;
    outlinedSeamSide = undefined;
    outlinedEdge = undefined;
    if (!old) return;
    old.removeFromParent();
    try {
      old.geometry.dispose();
    } finally {
      old.material.dispose();
    }
  };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const link of attached) remove.call(link, 'abort', dispose);
    attached.length = 0;
    remove.call(canvas, 'webglcontextlost', contextLost);
    try {
      clearOutline();
    } catch {
      /* Release the original display even if a selection resource has failed. */
    }
    try {
      renderer?.clear(true, true, true);
    } catch {
      /* Context loss does not prevent releasing the other owned resources. */
    }
    for (const resource of resources) {
      try {
        resource.dispose();
      } catch {
        /* Release all resources even if one renderer object has failed. */
      }
    }
    try {
      renderer?.dispose();
    } catch {
      /* The preview lifetime still ends. */
    }
    try {
      delete canvas.dataset.genericObservedStrainFrameSha256;
    } catch {
      /* Even a detached or replaced display cannot keep this preview alive. */
    }
    lifetime.abort();
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    dispose();
  };
  const current = () => {
    if (
      disposed ||
      links.some(aborted) ||
      getDxfGarmentObservedWebgpuReplayLifetimeV1(replayOwner) !== replayLife ||
      disposed ||
      links.some(aborted)
    )
      throw cancelled();
  };
  const own = <T extends { dispose(): void }>(resource: T): T => {
    resources.push(resource);
    return resource;
  };
  try {
    add.call(canvas, 'webglcontextlost', contextLost);
    for (const link of links) {
      add.call(link, 'abort', dispose, { once: true });
      attached.push(link);
    }
    current();
    const input = await projectDxfGarmentObservedStrainHeatmapV1(replayOwner, lifetime.signal);
    current();
    const tapeAnchors = new WeakMap<
      DxfGarmentObservedPreviewSurfacePointV1,
      Readonly<{
        triangleIndex: number;
        barycentric: readonly [number, number, number];
        pieceRange: (typeof input.pieceRanges)[number];
      }>
    >();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf2f2f2);
    const bodyGeometry = own(new THREE.BufferGeometry());
    bodyGeometry.setAttribute('position', new THREE.BufferAttribute(input.bodyPositionsM, 3));
    bodyGeometry.setIndex(new THREE.BufferAttribute(input.bodyTriangles, 1));
    bodyGeometry.computeVertexNormals();
    const garmentGeometry = own(new THREE.BufferGeometry());
    garmentGeometry.setAttribute('position', new THREE.BufferAttribute(input.heatmap.positions, 3));
    garmentGeometry.setAttribute('color', new THREE.BufferAttribute(input.heatmap.colors, 3));
    garmentGeometry.computeVertexNormals();
    const bodyMaterial = own(
      new THREE.MeshStandardMaterial({ color: 0xbcbcbc, roughness: 0.88, side: THREE.FrontSide }),
    );
    const garmentMaterial = own(
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.68,
        side: THREE.DoubleSide,
      }),
    );
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.name = 'generic-exact-current-observed-body';
    const garmentMesh = new THREE.Mesh(garmentGeometry, garmentMaterial);
    garmentMesh.name = 'generic-exact-frame-' + input.frameCount + '-strain-utilization';
    scene.add(bodyMesh, garmentMesh);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x535353, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 3.8);
    key.position.set(3.2, 4.4, 4.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 1.2);
    fill.position.set(-3, 1.8, 2.2);
    scene.add(fill);
    const bounds = new THREE.Box3()
      .setFromObject(bodyMesh)
      .union(new THREE.Box3().setFromObject(garmentMesh));
    const center = bounds.getCenter(new THREE.Vector3());
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const width = Math.max(canvas.clientWidth || canvas.width || 640, 1);
    const height = Math.max(canvas.clientHeight || canvas.height || 720, 1);
    const aspect = width / height;
    const verticalHalfFov = THREE.MathUtils.degToRad(27 / 2);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
    // Include the full depth too: arbitrary explicit placements may be far in front of the body.
    // Camera fitting changes only the view, never source/physical mesh scale or transforms.
    const distance = Math.max(
      0.01,
      (sphere.radius * 1.16) / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov)),
    );
    const near = Math.max(0.001, distance - sphere.radius * 1.5);
    const far = Math.max(near + 0.01, distance + sphere.radius * 2 + 0.1);
    const camera = new THREE.PerspectiveCamera(27, aspect, near, far);
    camera.position
      .copy(center)
      .addScaledVector(new THREE.Vector3(0.02, 0.004, 1).normalize(), distance);
    camera.lookAt(center);
    current();
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    current();
    const display = renderer;
    display.render(scene, camera);
    current();
    const setSelectedPiece = (
      pieceId: string | null,
      seamSide?: DxfGarmentObservedPreviewSeamSideV1,
      edge?: DxfGarmentObservedBoundaryEdgeV1,
    ): boolean => {
      try {
        current();
        const range = input.pieceRanges.find((piece) => piece.pieceId === pieceId);
        const nextPieceId = range?.pieceId ?? null;
        const seamEdges =
          range && seamSide && !edge
            ? input.seamEdges.filter(
                (edge) =>
                  edge.pieceId === range.pieceId &&
                  edge.runtimeSeamId === seamSide.runtimeSeamId &&
                  edge.sideIndex === seamSide.sideIndex,
              )
            : [];
        const nextSeamSide = seamEdges.length ? seamSide : undefined;
        const matchingEdges =
          range && edge && !seamSide
            ? input.unsewnEdges.filter(
                (entry) =>
                  entry.pieceId === range.pieceId &&
                  entry.contourId === edge.contourId &&
                  entry.boundaryVertexIds.every(
                    (id, index) => id === edge.boundaryVertexIds[index],
                  ),
              )
            : [];
        const nextEdge = matchingEdges.length === 1 ? matchingEdges[0] : undefined;
        const exactSelection =
          nextPieceId === pieceId && (!seamSide || !!nextSeamSide) && (!edge || !!nextEdge);
        if (
          nextPieceId === outlinedPieceId &&
          nextSeamSide?.runtimeSeamId === outlinedSeamSide?.runtimeSeamId &&
          nextSeamSide?.sideIndex === outlinedSeamSide?.sideIndex &&
          nextEdge === outlinedEdge
        )
          return exactSelection;
        clearOutline();
        if (range) {
          const edgePairs = nextEdge
            ? nextEdge.vertexIndices
                .slice(1)
                .map((to, index) => [nextEdge.vertexIndices[index]!, to])
            : seamEdges.map(({ vertexIndices }) => vertexIndices);
          const segments = edgePairs.length
            ? Float32Array.from(
                edgePairs.flatMap((pair) =>
                  pair.flatMap((vertex) =>
                    Array.from(input.finalPositions3M.subarray(vertex * 3, vertex * 3 + 3)),
                  ),
                ),
              )
            : deformedPieceBoundary(input.finalPositions3M, input.garmentTriangles, range);
          if (segments.length > 0) {
            // Use a depth-tested screen-space stroke, as in the mannequin measurement stage.
            const material = new LineMaterial({
              color: nextSeamSide
                ? CAD_WORKBENCH_SEAM_SIDE_COLORS[nextSeamSide.sideIndex === 0 ? 'A' : 'B']
                : 0x311eee,
              linewidth: nextSeamSide || nextEdge ? 4 : 3,
              depthWrite: false,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              polygonOffsetUnits: -1,
              toneMapped: false,
            });
            const geometry = new LineSegmentsGeometry();
            try {
              outline = new LineSegments2(geometry, material);
              geometry.setPositions(segments);
              material.resolution.set(width, height);
              outline.name = 'generic-observed-selected-piece-outline';
              outline.renderOrder = 1;
              scene.add(outline);
              outlinedPieceId = nextPieceId;
              outlinedSeamSide = nextSeamSide && { ...nextSeamSide };
              outlinedEdge = nextEdge;
            } catch (error) {
              if (outline) clearOutline();
              else {
                try {
                  geometry.dispose();
                } finally {
                  material.dispose();
                }
              }
              throw error;
            }
          }
        }
        current();
        try {
          display.render(scene, camera);
        } catch {
          dispose();
          return false;
        }
        current();
        return exactSelection && outlinedPieceId === pieceId;
      } catch {
        return false;
      }
    };
    const frameReportSha256 = input.report.reportSha256!;
    canvas.dataset.genericObservedStrainFrameSha256 = frameReportSha256;
    const raycaster = new THREE.Raycaster();
    const pick = (
      clientX: number,
      clientY: number,
      runtimeSeamId?: string,
      measureSurface = false,
    ): DxfGarmentObservedPreviewHitV1 | null => {
      try {
        current();
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        // The preview bitmap keeps the aspect of the camera used for its sole rendered frame.
        const scale = Math.min(rect.width / width, rect.height / height);
        const contentWidth = width * scale;
        const contentHeight = height * scale;
        const x = (clientX - rect.left - (rect.width - contentWidth) / 2) / contentWidth;
        const y = (clientY - rect.top - (rect.height - contentHeight) / 2) / contentHeight;
        if (x < 0 || x > 1 || y < 0 || y > 1) return null;
        raycaster.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera);
        const hit = raycaster.intersectObjects([bodyMesh, garmentMesh], false)[0];
        current();
        if (!hit || hit.faceIndex == null) return null;
        const triangleIndex = hit.faceIndex;
        if (hit.object === garmentMesh) {
          const range = input.pieceRanges.find(
            ({ triangleOffset, triangleCount }) =>
              triangleIndex >= triangleOffset && triangleIndex < triangleOffset + triangleCount,
          );
          if (!range) return null;
          if (measureSurface) {
            if (input.frameCount !== 32) return null;
            const offset = triangleIndex * 3;
            const vertexIndices = [
              input.garmentTriangles[offset]!,
              input.garmentTriangles[offset + 1]!,
              input.garmentTriangles[offset + 2]!,
            ] as const;
            if (
              !vertexIndices.every(
                (index) =>
                  Number.isSafeInteger(index) &&
                  index >= range.vertexOffset &&
                  index < range.vertexOffset + range.vertexCount &&
                  index * 3 + 2 < input.finalPositions3M.length,
              )
            )
              return null;
            const [a, b, c] = vertexIndices.map((index) =>
              new THREE.Vector3().fromArray(input.finalPositions3M, index * 3),
            );
            // Resolve the displayed face hit against the retained indexed frame, in metres.
            const weights = new THREE.Triangle(a, b, c).getBarycoord(
              hit.point,
              new THREE.Vector3(),
            );
            if (
              !weights ||
              ![weights.x, weights.y, weights.z].every(
                (weight) => weight >= -1e-7 && weight <= 1 + 1e-7,
              )
            )
              return null;
            const position = a!
              .multiplyScalar(weights.x)
              .addScaledVector(b!, weights.y)
              .addScaledVector(c!, weights.z);
            current();
            const surfacePoint = Object.freeze({
              vertexIndices: Object.freeze(vertexIndices),
              positionM: Object.freeze([position.x, position.y, position.z] as const),
            });
            tapeAnchors.set(surfacePoint, {
              triangleIndex,
              barycentric: [weights.x, weights.y, weights.z],
              pieceRange: range,
            });
            return Object.freeze({
              kind: 'garment',
              frameReportSha256,
              triangleIndex,
              pieceId: range.pieceId,
              surfacePoint,
            });
          }
          // Test only a compiler-identified boundary of the frontmost hit face. Screen distance
          // sets the input tolerance; identity never comes from a closest CAD or mesh match.
          const seamEdge = runtimeSeamId
            ? input.seamEdges.find((edge) => {
                if (
                  edge.runtimeSeamId !== runtimeSeamId ||
                  edge.triangleIndex !== triangleIndex ||
                  edge.pieceId !== range.pieceId
                )
                  return false;
                const from = new THREE.Vector3()
                  .fromArray(input.finalPositions3M, edge.vertexIndices[0] * 3)
                  .project(camera);
                const to = new THREE.Vector3()
                  .fromArray(input.finalPositions3M, edge.vertexIndices[1] * 3)
                  .project(camera);
                const dx = ((to.x - from.x) * contentWidth) / 2;
                const dy = ((from.y - to.y) * contentHeight) / 2;
                const px = (x - (from.x + 1) / 2) * contentWidth;
                const py = (y - (1 - from.y) / 2) * contentHeight;
                const lengthSquared = dx * dx + dy * dy;
                if (lengthSquared === 0) return false;
                const t = THREE.MathUtils.clamp((px * dx + py * dy) / lengthSquared, 0, 1);
                return Math.hypot(px - t * dx, py - t * dy) <= 6;
              })
            : null;
          return Object.freeze({
            kind: 'garment',
            frameReportSha256,
            triangleIndex,
            pieceId: range.pieceId,
            ...(seamEdge && {
              seamSide: Object.freeze({
                runtimeSeamId: seamEdge.runtimeSeamId,
                sideIndex: seamEdge.sideIndex,
              }),
            }),
          });
        }
        const body = input.report.bodyBinding;
        return body
          ? Object.freeze({
              kind: 'body',
              frameReportSha256,
              triangleIndex,
              persistedModel: body.persistedModel,
              observedBodyContentSha256: body.observedBodyContentSha256,
            })
          : null;
      } catch {
        return null;
      }
    };
    return Object.freeze({
      receipt: Object.freeze({
        frameReportSha256,
        sourceBindingSha256: input.report.sourceBindingSha256!,
        finalStateSha256: input.report.finalStateSha256!,
        strainRenderMappingSha256: input.strain.renderMappingSha256,
        frames: input.frameCount,
        quantity: 'normalized-green-strain-utilization' as const,
        units: 'dimensionless' as const,
        minimumUtilization: input.heatmap.minimumUtilization,
        maximumUtilization: input.heatmap.maximumUtilization,
        triangleCountAtOrAboveDisplayClamp: input.heatmap.triangleCountAtOrAboveDisplayClamp,
        displayClampMaximum: 2 as const,
        visibleHeatmapRendered: true as const,
        stressPaComputed: false as const,
        numericReplayOnly: true as const,
        productAuthority: false as const,
        fitAuthority: false as const,
      }),
      lifetime: lifetime.signal,
      pick,
      async measureTape(
        first: DxfGarmentObservedPreviewSurfacePointV1,
        second: DxfGarmentObservedPreviewSurfacePointV1,
      ): Promise<number | null> {
        try {
          current();
          const start = tapeAnchors.get(first);
          const end = tapeAnchors.get(second);
          if (!start || !end || start.pieceRange !== end.pieceRange) return null;
          const { measureDeformedClothSurfaceTapeV1 } = await import(
            './deformed-cloth-surface-tape-v1'
          );
          current();
          const measured = measureDeformedClothSurfaceTapeV1({
            positionsM: input.finalPositions3M,
            triangles: input.garmentTriangles,
            pieceRange: start.pieceRange,
            start: { triangleIndex: start.triangleIndex, barycentric: start.barycentric },
            end: { triangleIndex: end.triangleIndex, barycentric: end.barycentric },
          });
          current();
          return measured;
        } catch {
          return null;
        }
      },
      setSelectedPiece,
      dispose,
    });
  } catch (error) {
    dispose();
    throw error;
  }
}
