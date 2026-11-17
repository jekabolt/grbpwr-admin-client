import * as THREE from 'three';
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
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const link of attached) remove.call(link, 'abort', dispose);
    attached.length = 0;
    remove.call(canvas, 'webglcontextlost', contextLost);
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
    renderer.render(scene, camera);
    current();
    canvas.dataset.genericObservedStrainFrameSha256 = input.report.reportSha256!;
    return Object.freeze({
      receipt: Object.freeze({
        frameReportSha256: input.report.reportSha256!,
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
      dispose,
    });
  } catch (error) {
    dispose();
    throw error;
  }
}
