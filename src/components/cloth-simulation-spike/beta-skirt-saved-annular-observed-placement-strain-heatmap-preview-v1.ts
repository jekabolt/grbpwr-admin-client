import * as THREE from 'three';
import {
  getBetaSkirtSavedAnnularObservedPlacementRuntimeSourceLifetimeV1 as sourceLifetime,
  projectBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1 as projectSource,
} from './beta-skirt-saved-annular-observed-placement-runtime-source-v1';
import {
  getBetaSkirtSavedAnnularObservedPlacement32FrameContactLifetimeV1 as frameLifetime,
  projectBetaSkirtSavedAnnularObservedPlacement32FrameContactV1 as projectFrame,
} from './beta-skirt-saved-annular-observed-placement-32-frame-contact-v1';
import { buildBetaSkirtCanonicalMediumStrainHeatmapGeometryV1 } from './beta-skirt-canonical-medium-webgpu-16-frame-strain-heatmap-preview-v1';

const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const nativeAdd = EventTarget.prototype.addEventListener;
const nativeRemove = EventTarget.prototype.removeEventListener;
const aborted = (signal: AbortSignal) => nativeAborted.call(signal) as boolean;
const cancelled = () =>
  new DOMException('Observed cloth preview is no longer current.', 'AbortError');

/** Fixed projectors authenticate both owners. No caller geometry becomes simulation authority. */
export async function projectSavedObservedStrainHeatmapV1(
  sourceOwner: unknown,
  frameOwner: unknown,
  signal?: AbortSignal,
) {
  const sourceLife = sourceLifetime(sourceOwner);
  const frameLife = frameLifetime(frameOwner);
  if (!sourceLife || !frameLife)
    throw new TypeError('Current observed runtime and 32-frame owners are required.');
  const current = () => {
    if (
      (signal && aborted(signal)) ||
      sourceLifetime(sourceOwner) !== sourceLife ||
      frameLifetime(frameOwner) !== frameLife ||
      aborted(sourceLife) ||
      aborted(frameLife)
    )
      throw cancelled();
    if (signal && aborted(signal)) throw cancelled();
  };
  current();
  const source = await projectSource(sourceOwner, signal);
  current();
  const frame = await projectFrame(frameOwner, signal);
  current();
  if (
    !source ||
    !frame ||
    frame.report.status !== 'diagnostic-completed' ||
    frame.report.bindings.runtimeSourceReportSha256 !== source.report.reportSha256 ||
    frame.report.bindings.normalizedV5AggregateSha256 !==
      source.normalizedV5.seal.aggregateSha256 ||
    !frame.strainValues ||
    !frame.strainFlags ||
    frame.strainUnits !== 'dimensionless' ||
    frame.normalizedTriangles.length !== source.normalizedTriangles.length ||
    frame.normalizedTriangles.some((value, index) => value !== source.normalizedTriangles[index])
  )
    throw new TypeError(
      'The exact observed 32-frame postgates and matching strain output must pass before rendering.',
    );
  const heatmap = buildBetaSkirtCanonicalMediumStrainHeatmapGeometryV1({
    positions: frame.finalPositions3M,
    topology: frame.normalizedTriangles,
    triangleValues: frame.strainValues,
    validityFlags: frame.strainFlags,
  });
  current();
  return Object.freeze({
    sourceReportSha256: source.report.reportSha256,
    frameReportSha256: frame.report.reportSha256,
    bodyPositionsM: source.collisionInput.bodyPositionsM,
    bodyTriangles: source.collisionInput.bodyTriangles,
    heatmap,
    finalPositions3M: frame.finalPositions3M,
    normalizedTriangles: frame.normalizedTriangles,
    claims: Object.freeze({
      units: 'dimensionless' as const,
      stressPaComputed: false as const,
      visibleHeatmapRendered: false as const,
      runtimeAuthority: false as const,
      fitAuthority: false as const,
      productionAuthority: false as const,
    }),
  });
}

/** One static view of the exact current body and frame32 cloth; simulation remains WebGPU-owned. */
export async function createSavedObservedStrainHeatmapPreviewV1(
  canvas: HTMLCanvasElement,
  sourceOwner: unknown,
  frameOwner: unknown,
  signal?: AbortSignal,
) {
  const sourceLife = sourceLifetime(sourceOwner);
  const frameLife = frameLifetime(frameOwner);
  if (!sourceLife || !frameLife) throw new TypeError('A genuine observed result is required.');
  if (typeof HTMLCanvasElement === 'undefined' || !(canvas instanceof HTMLCanvasElement))
    throw new TypeError('A real display canvas is required.');
  const links = [sourceLife, frameLife, ...(signal ? [signal] : [])];
  const attached: AbortSignal[] = [];
  const lifetime = new AbortController();
  let disposed = false;
  let renderer: THREE.WebGLRenderer | null = null;
  const resources: { dispose(): void }[] = [];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const life of attached) nativeRemove.call(life, 'abort', dispose);
    attached.length = 0;
    nativeRemove.call(canvas, 'webglcontextlost', contextLost);
    try {
      renderer?.clear(true, true, true);
    } catch {
      /* Continue releasing owned resources. */
    }
    for (const resource of resources) {
      try {
        resource.dispose();
      } catch {
        /* One failed resource cannot retain the others. */
      }
    }
    try {
      renderer?.dispose();
    } catch {
      /* All other owned resources are already released. */
    }
    try {
      delete canvas.dataset.observedStrainFrameSha256;
    } catch {
      /* Receipt lifetime still ends. */
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
      sourceLifetime(sourceOwner) !== sourceLife ||
      frameLifetime(frameOwner) !== frameLife ||
      disposed ||
      links.some(aborted)
    )
      throw cancelled();
  };
  const own = <T extends { dispose(): void }>(value: T): T => {
    resources.push(value);
    return value;
  };
  try {
    nativeAdd.call(canvas, 'webglcontextlost', contextLost);
    for (const life of links) {
      nativeAdd.call(life, 'abort', dispose, { once: true });
      attached.push(life);
    }
    current();
    const input = await projectSavedObservedStrainHeatmapV1(sourceOwner, frameOwner, signal);
    current();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f2f2f2');
    const bodyGeometry = own(new THREE.BufferGeometry());
    bodyGeometry.setAttribute('position', new THREE.BufferAttribute(input.bodyPositionsM, 3));
    bodyGeometry.setIndex(new THREE.BufferAttribute(input.bodyTriangles, 1));
    bodyGeometry.computeVertexNormals();
    const garmentGeometry = own(new THREE.BufferGeometry());
    garmentGeometry.setAttribute('position', new THREE.BufferAttribute(input.heatmap.positions, 3));
    garmentGeometry.setAttribute('color', new THREE.BufferAttribute(input.heatmap.colors, 3));
    garmentGeometry.computeVertexNormals();
    const bodyMaterial = own(
      new THREE.MeshStandardMaterial({ color: '#bcbcbc', roughness: 0.88, side: THREE.FrontSide }),
    );
    const garmentMaterial = own(
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.68,
        side: THREE.DoubleSide,
      }),
    );
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.name = 'exact-current-observed-body';
    const garmentMesh = new THREE.Mesh(garmentGeometry, garmentMaterial);
    garmentMesh.name = 'exact-observed-frame32-strain-utilization';
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
    const size = bounds.getSize(new THREE.Vector3());
    const width = Math.max(canvas.clientWidth || canvas.width || 640, 1);
    const height = Math.max(canvas.clientHeight || canvas.height || 720, 1);
    const aspect = width / height;
    const distance =
      (Math.max(size.y, size.x / aspect) * 1.16) / (2 * Math.tan(THREE.MathUtils.degToRad(27 / 2)));
    const camera = new THREE.PerspectiveCamera(27, aspect, 0.01, Math.max(12, distance * 4));
    camera.position.set(center.x + 0.1, center.y + 0.02, center.z + distance);
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
    canvas.dataset.observedStrainFrameSha256 = input.frameReportSha256;
    return Object.freeze({
      receipt: Object.freeze({
        sourceReportSha256: input.sourceReportSha256,
        frameReportSha256: input.frameReportSha256,
        frames: 32 as const,
        quantity: 'normalized-green-strain-utilization' as const,
        units: 'dimensionless' as const,
        minimumUtilization: input.heatmap.minimumUtilization,
        maximumUtilization: input.heatmap.maximumUtilization,
        triangleCountAtOrAboveDisplayClamp: input.heatmap.triangleCountAtOrAboveDisplayClamp,
        displayClampMaximum: 2 as const,
        visibleHeatmapRendered: true as const,
        stressPaComputed: false as const,
        fitAuthority: false as const,
        productionAuthority: false as const,
      }),
      dispose,
      lifetime: lifetime.signal,
    });
  } catch (error) {
    dispose();
    throw error;
  }
}
