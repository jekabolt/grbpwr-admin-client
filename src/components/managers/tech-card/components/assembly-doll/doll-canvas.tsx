// THE DOLL ON SCREEN (01-DESIGN-L0 §5.4, §6): one WebGL canvas, orbit + four preset cameras, the
// paper in two greys (outside light, inside darker), seams by state in WEIGHT (closed thin ink,
// proposed dashed, open heavy ink and named in words), POM lines lifted from the flat pattern (grey
// 2 px all, the hovered one 4 px ink with «chest · 54.0 cm»). A faint floor grid and axis only —
// no mannequin (design §8 q1).
//
// Rendering is ON DEMAND: a frame is drawn when the camera moves, a solve frame arrives or a hover
// changes — an idle doll costs nothing. While the worker solves, its frames stream in through the
// store's `live` slot and are laid on the mesh topology it posted first (the doll closing).

import type { DollMesh, DollReport, DollSeamReport, Vec3 } from 'lib/doll/types';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

import { useDollStore } from './doll-store';

export type CameraPreset = 'front' | 'back' | 'left' | 'right';

export type PomLine = { code: string; label: string; paths: Vec3[][] };

/** A word pinned to a point of the doll (an open seam, the hovered measure). */
type Pin = { id: string; text: string; at: Vec3 };

const INK = 0x000000;
const GREY = 0x666666;

/** Direction from the target to the camera for each preset: the doll faces +z, its left is +x. */
const PRESET_DIR: Record<CameraPreset, [number, number, number]> = {
  front: [0, 0.08, 1],
  back: [0, 0.08, -1],
  left: [1, 0.08, 0],
  right: [-1, 0.08, 0],
};

type Topology = { panels: { offset: number; count: number; tris: Uint32Array; float: boolean }[] };

const topologyOf = (src: DollReport | DollMesh): Topology => ({
  panels: src.panels.map((p) => ({
    offset: p.offset,
    count: p.count,
    tris: p.tris,
    float: p.group === 'FLOAT',
  })),
});

function pathPoints(positions: Float32Array, path: Uint32Array): number[] {
  const out: number[] = [];
  for (const v of path) out.push(positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]);
  return out;
}

function midOf(positions: Float32Array, path: Uint32Array): Vec3 | null {
  if (!path.length) return null;
  const v = path[Math.floor(path.length / 2)];
  return [positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]];
}

export function DollCanvas({
  solveKey,
  report,
  pomLines,
  showPom,
  hoverPom,
  camera,
  onCameraLeft,
  onFrame,
}: {
  /** The solve on screen (frames of an unfinished solve are read from the store by this key). */
  solveKey: string | null;
  report: DollReport | null;
  pomLines: readonly PomLine[];
  showPom: boolean;
  hoverPom: string | null;
  /** A preset to move to; null = wherever the orbit left it. */
  camera: CameraPreset | null;
  /** The person orbited away from the preset. */
  onCameraLeft: () => void;
  /** Every drawn frame (the stand counts them for the fps budget). */
  onFrame?: () => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const pinsHost = useRef<HTMLDivElement | null>(null);
  const api = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    cam: THREE.PerspectiveCamera;
    controls: OrbitControls;
    cloth: THREE.Group;
    seams: THREE.Group;
    poms: THREE.Group;
    pins: Pin[];
    request: () => void;
    fitted: string | null;
    /** The person turned the doll since the last fit: the settled doll does not move the camera. */
    moved: boolean;
    /** Line materials by the group that owns them: clearing a group disposes them, used or not. */
    materials: Map<LineMaterial, THREE.Group>;
    topoKey: string | null;
    geom: THREE.BufferGeometry | null;
  } | null>(null);
  const leftRef = useRef(onCameraLeft);
  leftRef.current = onCameraLeft;
  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;

  // ── the scene, once ──
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0xffffff, 1);
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.setAttribute('data-doll-gl', '');

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(-0.6, 1, 1.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.5);
    rim.position.set(0.8, 0.4, -1.2);
    scene.add(rim);

    const cam = new THREE.PerspectiveCamera(28, 1, 10, 20000);
    cam.position.set(0, 400, 3000);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = false;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.8;

    const cloth = new THREE.Group();
    const seams = new THREE.Group();
    const poms = new THREE.Group();
    scene.add(cloth, seams, poms);

    let queued = false;
    const draw = () => {
      queued = false;
      renderer.render(scene, cam);
      // Pins follow their points; behind the doll's centre they fade to the label grey.
      const ph = pinsHost.current;
      const a = api.current;
      if (ph && a) {
        const w = renderer.domElement.clientWidth;
        const h = renderer.domElement.clientHeight;
        // Pins never sit on each other: the hovered measure first, then the seams top-down; a pin
        // that would overlap one already placed moves down a row.
        const placed: { x: number; y: number; w: number; h: number }[] = [];
        const order = [...a.pins].sort(
          (p, q) => Number(q.id.startsWith('pom:')) - Number(p.id.startsWith('pom:')),
        );
        for (const p of order) {
          const node = ph.querySelector<HTMLElement>(`[data-pin="${CSS.escape(p.id)}"]`);
          if (!node) continue;
          const v = new THREE.Vector3(...p.at).project(cam);
          const vis = v.z < 1 && Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05;
          node.style.display = vis ? '' : 'none';
          if (!vis) continue;
          const bw = node.offsetWidth;
          const bh = node.offsetHeight;
          const x = ((v.x + 1) / 2) * w + 6;
          let y = ((1 - v.y) / 2) * h - 6 - bh;
          for (let k = 0; k < 12; k++) {
            const hit = placed.find(
              (r) => x < r.x + r.w && r.x < x + bw && y < r.y + r.h && r.y < y + bh,
            );
            if (!hit) break;
            y = hit.y + hit.h + 2;
          }
          placed.push({ x, y, w: bw, h: bh });
          node.style.transform = `translate(${x}px, ${y}px)`;
        }
      }
      frameRef.current?.();
    };
    const request = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(draw);
    };
    controls.addEventListener('change', request);
    controls.addEventListener('start', () => {
      if (api.current) api.current.moved = true;
      leftRef.current();
    });

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      for (const m of api.current?.materials.keys() ?? []) m.resolution.set(w, h);
      request();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // A faint floor grid and the vertical axis — orientation only (§8 q1).
    const grid = new THREE.GridHelper(2000, 20, 0xe6e6e6, 0xf0f0f0);
    grid.name = 'floor';
    scene.add(grid);

    api.current = {
      renderer,
      scene,
      cam,
      controls,
      cloth,
      seams,
      poms,
      pins: [],
      request,
      fitted: null,
      moved: false,
      materials: new Map(),
      topoKey: null,
      geom: null,
    };
    resize();
    return () => {
      ro.disconnect();
      for (const g of [cloth, seams, poms]) clear(g);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);

  const lineMat = (
    owner: THREE.Group,
    o: { width: number; color: number; dashed?: boolean; opacity?: number },
  ) => {
    const a = api.current!;
    const m = new LineMaterial({
      color: o.color,
      linewidth: o.width,
      dashed: !!o.dashed,
      dashSize: 8,
      gapSize: 6,
      transparent: o.opacity !== undefined,
      opacity: o.opacity ?? 1,
      depthTest: true,
    });
    // A line lies ON the cloth: pulled towards the camera in depth so the surface does not eat it.
    m.polygonOffset = true;
    m.polygonOffsetFactor = -4;
    m.polygonOffsetUnits = -8;
    m.resolution.set(a.renderer.domElement.clientWidth, a.renderer.domElement.clientHeight);
    a.materials.set(m, owner);
    return m;
  };
  const line = (pts: number[], m: LineMaterial) => {
    const g = new LineGeometry();
    g.setPositions(pts);
    const l = new Line2(g, m);
    if (m.dashed) l.computeLineDistances();
    l.renderOrder = 2;
    return l;
  };
  const clear = (g: THREE.Group) => {
    for (const c of [...g.children]) {
      g.remove(c);
      const o = c as THREE.Mesh;
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) if (!(m instanceof LineMaterial)) m.dispose();
    }
    const reg = api.current?.materials;
    for (const [m, owner] of reg ?? [])
      if (owner === g) {
        m.dispose();
        reg!.delete(m);
      }
  };

  /** Cloth geometry for a topology + positions; reused while only positions change (frames). */
  const layCloth = (topoKey: string, fitKey: string, topo: Topology, positions: Float32Array) => {
    const a = api.current;
    if (!a) return;
    if (a.topoKey !== topoKey || !a.geom) {
      clear(a.cloth);
      const idx: number[] = [];
      const floatIdx: number[] = [];
      for (const p of topo.panels)
        for (const t of p.tris) (p.float ? floatIdx : idx).push(p.offset + t);
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      geom.setIndex(idx);
      const outside = new THREE.MeshStandardMaterial({
        color: 0xe4e4e4,
        roughness: 0.95,
        metalness: 0,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const inside = new THREE.MeshStandardMaterial({
        color: 0x8f8f8f,
        roughness: 1,
        metalness: 0,
        side: THREE.BackSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      a.cloth.add(new THREE.Mesh(geom, outside), new THREE.Mesh(geom, inside));
      if (floatIdx.length) {
        const fg = new THREE.BufferGeometry();
        fg.setAttribute('position', geom.getAttribute('position'));
        fg.setIndex(floatIdx);
        fg.computeVertexNormals();
        a.cloth.add(
          new THREE.Mesh(
            fg,
            new THREE.MeshStandardMaterial({
              color: 0xcfcfcf,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.5,
            }),
          ),
        );
      }
      a.geom = geom;
      a.topoKey = topoKey;
    } else {
      const attr = a.geom.getAttribute('position') as THREE.BufferAttribute;
      (attr.array as Float32Array).set(positions);
      attr.needsUpdate = true;
    }
    a.geom.computeVertexNormals();
    // Fit once per solve: the camera frames the doll (pieces drawn apart — floating — are not the
    // doll and do not shrink it), the floor sits under its hem.
    // The first frame frames the doll; the settled one reframes it unless the person has turned it.
    const sameSolve = a.fitted?.slice(2) === fitKey.slice(2);
    if (a.fitted !== fitKey && !(sameSolve && a.moved)) {
      const b = new THREE.Box3();
      const v = new THREE.Vector3();
      for (const p of topo.panels) {
        if (p.float) continue;
        for (let i = p.offset; i < p.offset + p.count; i++)
          b.expandByPoint(v.set(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]));
      }
      if (b.isEmpty()) a.geom.computeBoundingBox();
      if (b.isEmpty() && a.geom.boundingBox) b.copy(a.geom.boundingBox);
      const c = b.getCenter(new THREE.Vector3());
      const size = b.getSize(new THREE.Vector3());
      const floor = a.scene.getObjectByName('floor');
      if (floor) floor.position.set(c.x, b.min.y - 40, c.z);
      a.controls.target.copy(c);
      // Fit height and width alike: the view is wider than tall, the doll's sleeves are wide.
      const r = Math.max(size.y * 1.1, (size.x * 1.1) / Math.max(0.3, a.cam.aspect), 300);
      const dist = r / 2 / Math.tan(THREE.MathUtils.degToRad(a.cam.fov / 2)) + size.z;
      a.cam.near = dist / 50;
      a.cam.far = dist * 20;
      a.cam.updateProjectionMatrix();
      const d = PRESET_DIR[camera ?? 'front'];
      a.cam.position.copy(c).add(new THREE.Vector3(...d).normalize().multiplyScalar(dist * 1.08));
      a.controls.update();
      a.fitted = fitKey;
      a.moved = false;
    }
    a.request();
  };

  // ── another solve on screen: nothing of the previous one stays (a size switch must never show
  // the old size under the new label while the new one has not posted its first frame) ──
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    clear(a.cloth);
    clear(a.seams);
    clear(a.poms);
    a.geom = null;
    a.topoKey = null;
    a.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solveKey]);

  // ── a finished solve: its report ──
  useEffect(() => {
    if (!report || !solveKey) return;
    // The report's own triangles: their winding is final (a mirrored panel is turned outside out).
    layCloth(`r:${solveKey}`, `r:${solveKey}`, topologyOf(report), report.positions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, solveKey]);

  // ── an unfinished solve: its frames, imperatively ──
  useEffect(() => {
    if (report || !solveKey) return;
    let topoKey: string | null = null;
    let topo: Topology | null = null;
    // The closing is drawn at ≤ 12 frames a second: the worker posts faster than that, and every
    // drawn frame is main-thread time the solve's own worker may want (a laptop's cores are few).
    let last = 0;
    let timer = 0;
    const apply = () => {
      timer = 0;
      const live = useDollStore.getState().live;
      if (!live || live.key !== solveKey || !live.mesh || !live.positions) return;
      if (!topo) {
        topo = topologyOf(live.mesh);
        topoKey = `l:${solveKey}`;
      }
      last = performance.now();
      layCloth(topoKey!, `l:${solveKey}`, topo, live.positions);
    };
    apply();
    const unsub = useDollStore.subscribe((s, prev) => {
      if (s.live === prev.live || timer) return;
      timer = window.setTimeout(apply, Math.max(0, 80 - (performance.now() - last)));
    });
    return () => {
      unsub();
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, solveKey]);

  // ── seams by state, and the words pinned to the open ones ──
  const [seamPins, setSeamPins] = useState<Pin[]>([]);
  const [pomPins, setPomPins] = useState<Pin[]>([]);
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    a.pins = [...seamPins, ...pomPins];
    a.request();
  }, [seamPins, pomPins]);
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    clear(a.seams);
    const pins: Pin[] = [];
    if (report) {
      const P = report.positions;
      const closed = lineMat(a.seams, { width: 1.2, color: INK });
      const dashed = lineMat(a.seams, { width: 1.4, color: INK, dashed: true });
      const heavy = lineMat(a.seams, { width: 3, color: INK });
      for (const s of report.seams as DollSeamReport[]) {
        if (s.origin === 'layer') continue;
        const open = s.state === 'open' || s.state === 'twisted';
        const m = open ? heavy : s.state === 'proposed' ? dashed : closed;
        for (const path of open ? [s.pathA, s.pathB] : [s.pathA])
          if (path.length >= 2) a.seams.add(line(pathPoints(P, path), m));
        if (open) {
          const at = midOf(P, s.pathA);
          if (at)
            pins.push({
              id: `seam:${s.id}`,
              text: `${s.state} · ${Math.round(s.residualMaxMm)} mm`,
              at,
            });
        }
      }
    }
    setSeamPins(pins);
    a.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  /**
   * A lifted line lies exactly on the cloth; it is drawn 2 mm off it along the nearest vertex's
   * normal (outside of the garment), so the cloth in front of it does not swallow it.
   */
  const outward = (path: Vec3[]): Vec3[] => {
    const g = api.current?.geom;
    const pos = g?.getAttribute('position') as THREE.BufferAttribute | undefined;
    const nor = g?.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (!pos || !nor) return path;
    const P = pos.array as Float32Array;
    const Nn = nor.array as Float32Array;
    return path.map(([x, y, z]) => {
      let best = -1;
      let bd = Infinity;
      for (let i = 0; i < P.length; i += 3) {
        const d = (P[i] - x) ** 2 + (P[i + 1] - y) ** 2 + (P[i + 2] - z) ** 2;
        if (d < bd) [bd, best] = [d, i];
      }
      if (best < 0) return [x, y, z];
      return [x + 2 * Nn[best], y + 2 * Nn[best + 1], z + 2 * Nn[best + 2]];
    });
  };

  // ── POM lines: all grey 2 px when shown, the hovered one 4 px ink with its value ──
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    clear(a.poms);
    const pins: Pin[] = [];
    const grey = lineMat(a.poms, { width: 2, color: GREY, opacity: 0.9 });
    const ink = lineMat(a.poms, { width: 4, color: INK });
    for (const l of pomLines) {
      const hot = l.code === hoverPom;
      if (!hot && !showPom) continue;
      for (const path of l.paths) {
        if (path.length < 2) continue;
        const ln = line(outward(path).flat(), hot ? ink : grey);
        ln.renderOrder = hot ? 4 : 3;
        // The hovered line reads through the cloth: a measure across the back is still a measure.
        if (hot) (ln.material as LineMaterial).depthTest = false;
        a.poms.add(ln);
      }
      if (hot) {
        const longest = [...l.paths].sort((x, y) => y.length - x.length)[0];
        if (longest?.length) {
          const at = longest[Math.floor(longest.length / 2)];
          pins.push({ id: `pom:${l.code}`, text: l.label, at });
        }
      }
    }
    setPomPins(pins);
    a.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomLines, showPom, hoverPom]);

  // ── preset cameras ──
  useEffect(() => {
    const a = api.current;
    if (!a || !camera || !a.geom) return;
    const target = a.controls.target.clone();
    const dist = a.cam.position.distanceTo(target);
    const to = target
      .clone()
      .add(new THREE.Vector3(...PRESET_DIR[camera]).normalize().multiplyScalar(dist));
    const from = a.cam.position.clone();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      a.cam.position.copy(to);
      a.controls.update();
      return;
    }
    // 220 ms ease-out-quart along the sphere around the target.
    const t0 = performance.now();
    const fromDir = from.clone().sub(target).normalize();
    const toDir = to.clone().sub(target).normalize();
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 220);
      const k = 1 - Math.pow(1 - t, 4);
      const dir = fromDir.clone().lerp(toDir, k);
      if (dir.lengthSq() < 1e-6) dir.copy(toDir);
      a.cam.position.copy(target).add(dir.normalize().multiplyScalar(dist));
      a.controls.update();
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [camera]);

  const pins = [...seamPins, ...pomPins];
  return (
    <div className='relative h-full w-full overflow-hidden' data-doll-canvas=''>
      <div ref={host} className='absolute inset-0' />
      <div ref={pinsHost} className='pointer-events-none absolute inset-0' aria-hidden>
        {pins.map((p) => (
          <span
            key={p.id}
            data-pin={p.id}
            className='absolute left-0 top-0 whitespace-nowrap border border-textColor bg-bgColor px-1 py-px text-micro uppercase tracking-pill text-textColor'
          >
            {p.text}
          </span>
        ))}
      </div>
    </div>
  );
}
