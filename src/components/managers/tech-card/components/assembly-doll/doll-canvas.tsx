// THE DOLL ON SCREEN (01-DESIGN-L0 §5.4, §6): one WebGL canvas, orbit + four preset cameras, the
// paper in two greys (outside light, inside darker). By default the only lines are the seams the
// doll could not close (open, twisted: both sides, 3 px); `showSeams` adds the closed ones thin
// grey and the proposed or guessed ones grey dashed. Hovering an open seam draws it 4 px, greys the
// rest and pins one word at its middle («258 mm»), only while that point is in view (one ray past
// the cloth). POM lines are lifted from the flat pattern (grey 2 px all, the hovered one 4 px ink
// with «chest · 54.0 cm»). No floor, no mannequin (design §8 q1).
//
// Navigation (doll-nav.ts holds the numbers): left drag orbits, middle/right drag pans, the wheel
// and the pinch zoom to the cursor, a two-finger swipe orbits (with shift it pans), a double click
// on the cloth orbits round that point and on the void fits. Every fit leashes the camera (zoom
// 0.25–3 × the fit, the target near the doll) so the doll cannot be lost.
//
// Rendering is ON DEMAND: a frame is drawn when the camera moves, a solve frame arrives or a hover
// changes, and while the damping settles; an idle doll costs nothing. While the worker solves,
// its frames stream in through the store's `live` slot and are laid on the mesh topology it
// posted first (the doll closing).

import type { DollMesh, DollReport, DollSeamReport, Vec3 } from 'lib/doll/types';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

import {
  easeOut,
  fitOf,
  isDoubleTap,
  limitsOf,
  pickPolyline,
  MAX_POLAR,
  MIN_POLAR,
  padOrbit,
  PIVOT_MS,
  PRESET_PHI,
  PRESET_THETA,
  presetPath,
  VIEW_MS,
  wheelKind,
  type Sph,
} from './doll-nav';
import { useDollStore } from './doll-store';

export type CameraPreset = 'front' | 'back' | 'left' | 'right';

export type PomLine = { code: string; label: string; paths: Vec3[][] };

/** A word pinned to a point of the doll (the hovered open seam, the hovered measure). */
type Pin = { id: string; text: string; at: Vec3 };

/** An open seam on screen: its id, its word, the point the word sits at, both sides' points. */
type OpenSeam = { id: string; text: string; at: Vec3; paths: THREE.Vector3[][] };

const INK = 0x000000;
const GREY = 0x666666;

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
  fitSignal = 0,
  showSeams = false,
  openColor = INK,
  hoverSeam: hoverSeamProp,
  onHoverSeam,
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
  /** Bumped to fit the doll again (the `fit` chip, the F key). */
  fitSignal?: number;
  /** Draw the closed seams too (thin grey) and the proposed or guessed ones (grey dashed). */
  showSeams?: boolean;
  /** The colour of an open seam's line. */
  openColor?: number;
  /** The hovered open seam's id when a list beside the doll owns it; omitted, the canvas does. */
  hoverSeam?: string | null;
  onHoverSeam?: (id: string | null) => void;
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
    /** Open seams of the report on screen, for the pointer to find. */
    open: OpenSeam[];
    request: () => void;
    /** Frame the doll (`ms` 0 = at once); a view turns to that preset on the way. */
    refit: (ms: number, view?: CameraPreset) => void;
    /** The doll's box (floating pieces left out); null until a solve's first frame. */
    box: THREE.Box3 | null;
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
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const [hoverOwn, setHoverOwn] = useState<string | null>(null);
  const hover = hoverSeamProp !== undefined ? hoverSeamProp : hoverOwn;
  const hoverRef = useRef<(id: string | null) => void>(() => {});
  hoverRef.current = (id) => {
    if (id === hover) return;
    setHoverOwn(id);
    onHoverSeam?.(id);
  };

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
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 1;
    controls.zoomSpeed = 1;
    controls.zoomToCursor = true;
    controls.minPolarAngle = MIN_POLAR;
    controls.maxPolarAngle = MAX_POLAR;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    const gl = renderer.domElement;

    // ── the camera on its sphere round the target ──
    const sph = new THREE.Spherical();
    const off = new THREE.Vector3();
    const current = (): Sph => {
      sph.setFromVector3(off.copy(cam.position).sub(controls.target));
      return { r: sph.radius, phi: sph.phi, theta: sph.theta };
    };
    /**
     * The point is in view: in the frame and not behind the cloth (one ray from the camera; the
     * normals are not asked, a mirrored panel has them turned inside out).
     */
    const seenRay = new THREE.Raycaster();
    const seen = (p: THREE.Vector3) => {
      const v = p.clone().project(cam);
      if (v.z >= 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return false;
      const d = cam.position.distanceTo(p);
      seenRay.set(cam.position, p.clone().sub(cam.position).normalize());
      seenRay.near = 0;
      seenRay.far = Math.max(0, d - (5 + d * 0.004));
      return seenRay.intersectObjects(cloth.children, false).length === 0;
    };
    const place = (target: THREE.Vector3, s: Sph) => {
      controls.target.copy(target);
      sph.set(s.r, s.phi, s.theta);
      cam.position.setFromSpherical(sph).add(target);
      cam.lookAt(target);
    };
    /**
     * The damping's leftover turn is spent at once and the camera put back: an animation or a
     * swipe that writes the camera must not be fought by a decaying drag.
     */
    const flushDamping = () => {
      const p = cam.position.clone();
      const t = controls.target.clone();
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = true;
      cam.position.copy(p);
      controls.target.copy(t);
      cam.lookAt(t);
    };
    let anim: {
      t0: number;
      ms: number;
      from: THREE.Vector3;
      to: THREE.Vector3;
      path: (t: number) => Sph;
    } | null = null;
    const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const animateTo = (target: THREE.Vector3, s: Sph, ms: number) => {
      flushDamping();
      if (ms <= 0 || reduced()) {
        anim = null;
        place(target, s);
      } else
        anim = {
          t0: performance.now(),
          ms,
          from: controls.target.clone(),
          to: target.clone(),
          path: presetPath(current(), s),
        };
      request();
    };
    const stepAnim = (now: number) => {
      if (!anim) return;
      const t = Math.min(1, Math.max(0, (now - anim.t0) / anim.ms));
      place(anim.from.clone().lerp(anim.to, easeOut(t)), anim.path(t));
      if (t >= 1) anim = null;
    };

    const cloth = new THREE.Group();
    const seams = new THREE.Group();
    const poms = new THREE.Group();
    scene.add(cloth, seams, poms);

    let queued = false;
    let raf = 0;
    const draw = () => {
      queued = false;
      // An animation steps every frame; the damping asks for the next frame until it settles
      // (`update()` is true while the camera still moves); at rest no frame is drawn.
      const animating = !!anim;
      stepAnim(performance.now());
      const changed = controls.update();
      renderer.render(scene, cam);
      // Pins follow their points and hide behind the cloth.
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
          const at = new THREE.Vector3(...p.at);
          const vis = seen(at);
          const v = at.project(cam);
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
      if (animating || changed) request();
    };
    function request() {
      if (queued) return;
      queued = true;
      raf = requestAnimationFrame(draw);
    }
    const leave = () => {
      if (api.current) api.current.moved = true;
      leftRef.current();
    };
    controls.addEventListener('change', request);
    controls.addEventListener('start', () => {
      anim = null;
      leave();
    });

    // ── fit: the doll at 85 % of the canvas, the leash round it ──
    const refit = (ms: number, view?: CameraPreset) => {
      const a = api.current;
      if (!a?.box) return;
      const b = a.box;
      const box = { min: b.min.toArray(), max: b.max.toArray() };
      const f = fitOf(box, cam.fov, cam.aspect);
      const lim = limitsOf(box, f.dist);
      controls.minDistance = lim.minDistance;
      controls.maxDistance = lim.maxDistance;
      controls.maxTargetRadius = lim.maxTargetRadius;
      controls.cursor.set(...f.target);
      cam.near = f.dist / 50;
      cam.far = f.dist * 20;
      cam.updateProjectionMatrix();
      const s = current();
      animateTo(
        new THREE.Vector3(...f.target),
        {
          r: f.dist,
          phi: view ? PRESET_PHI : s.phi,
          theta: view ? PRESET_THETA[view] : s.theta,
        },
        ms,
      );
      a.moved = false;
    };

    // ── the trackpad: a pinch zooms (OrbitControls), a two-finger swipe orbits, with shift pans;
    // a mouse wheel zooms (OrbitControls). Heard before OrbitControls, on the way down. ──
    let lastPad = -Infinity;
    const onWheel = (e: WheelEvent) => {
      const now = performance.now();
      if (wheelKind(e, now, lastPad) !== 'pad') return;
      lastPad = now;
      e.preventDefault();
      e.stopPropagation();
      anim = null;
      flushDamping();
      if (!api.current?.moved) leave();
      const h = gl.clientHeight || 1;
      const s = current();
      if (e.shiftKey) {
        // One pixel of swipe is one pixel of the screen at the target's depth.
        const k = (2 * s.r * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / h;
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
        const d = right.multiplyScalar(e.deltaX * k).add(up.multiplyScalar(-e.deltaY * k));
        controls.target.add(d);
        cam.position.add(d);
      } else place(controls.target.clone(), padOrbit(s, e.deltaX, e.deltaY, h));
      controls.update();
      request();
    };
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });

    // ── double click / double tap: on the cloth the target moves to that point, on the void the
    // doll is fitted. The double tap is counted by hand: `dblclick` under touch-action:none is
    // unreliable on iOS. ──
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pivotOrFit = (x: number, y: number) => {
      const r = gl.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObjects(cloth.children, false)[0];
      if (!hit) return refit(VIEW_MS);
      flushDamping();
      sph.setFromVector3(off.copy(cam.position).sub(hit.point));
      animateTo(hit.point.clone(), { r: sph.radius, phi: sph.phi, theta: sph.theta }, PIVOT_MS);
      leave();
    };
    // ── hover: the open seam nearest the pointer (≤ 10 px, ≤ 18 px for a finger) that is in view ──
    const hoverAt = (x: number, y: number, touch: boolean) => {
      const a = api.current;
      if (!a) return;
      const r = gl.getBoundingClientRect();
      const p = { x: x - r.left, y: y - r.top };
      const v = new THREE.Vector3();
      // Every side of every open seam, on screen, with the seam and the 3D points it came from.
      const lines: { x: number; y: number }[][] = [];
      const from: { seam: OpenSeam; pts: THREE.Vector3[] }[] = [];
      for (const seam of a.open)
        for (const pts of seam.paths) {
          lines.push(
            pts.map((q) => {
              v.copy(q).project(cam);
              return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
            }),
          );
          from.push({ seam, pts });
        }
      // The nearest few by distance; the first whose nearest point is in view wins.
      for (const h of pickPolyline(lines, p, touch ? 18 : 10).slice(0, 4)) {
        const scr = lines[h.index];
        let k = 0;
        for (let i = 1; i < scr.length; i++)
          if (
            Math.hypot(scr[i].x - p.x, scr[i].y - p.y) < Math.hypot(scr[k].x - p.x, scr[k].y - p.y)
          )
            k = i;
        if (seen(from[h.index].pts[k])) return hoverRef.current(from[h.index].seam.id);
      }
      hoverRef.current(null);
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons || e.pointerType === 'touch') return;
      hoverAt(e.clientX, e.clientY, false);
    };
    const onLeaveGl = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') hoverRef.current(null);
    };
    let pointerType = 'mouse';
    let down: { x: number; y: number } | null = null;
    let lastTap: { t: number; x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      pointerType = e.pointerType;
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !down) return;
      const tap = { t: performance.now(), x: e.clientX, y: e.clientY };
      const still = Math.hypot(tap.x - down.x, tap.y - down.y) < 10;
      down = null;
      if (!still) {
        lastTap = null;
        return;
      }
      if (isDoubleTap(lastTap, tap)) {
        lastTap = null;
        pivotOrFit(tap.x, tap.y);
      } else {
        lastTap = tap;
        hoverAt(tap.x, tap.y, true);
      }
    };
    const onDbl = (e: MouseEvent) => {
      if (pointerType !== 'touch') pivotOrFit(e.clientX, e.clientY);
    };
    gl.addEventListener('pointerdown', onDown);
    gl.addEventListener('pointerup', onUp);
    gl.addEventListener('dblclick', onDbl);
    gl.addEventListener('pointermove', onMove);
    gl.addEventListener('pointerleave', onLeaveGl);

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
      // Untouched, the doll stays fitted when the canvas turns or changes height.
      if (api.current && !api.current.moved && !anim) refit(0);
      request();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    api.current = {
      renderer,
      scene,
      cam,
      controls,
      cloth,
      seams,
      poms,
      pins: [],
      open: [],
      request,
      refit,
      box: null,
      fitted: null,
      moved: false,
      materials: new Map(),
      topoKey: null,
      geom: null,
    };
    resize();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      el.removeEventListener('wheel', onWheel, { capture: true });
      gl.removeEventListener('pointerdown', onDown);
      gl.removeEventListener('pointerup', onUp);
      gl.removeEventListener('dblclick', onDbl);
      gl.removeEventListener('pointermove', onMove);
      gl.removeEventListener('pointerleave', onLeaveGl);
      for (const g of [cloth, seams, poms]) clear(g);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);

  const lineMat = (
    owner: THREE.Group,
    o: { width: number; color: number; dashed?: boolean; opacity?: number; xray?: boolean },
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
      depthTest: !o.xray,
      depthWrite: !o.xray,
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
    // doll and do not shrink it).
    // The first frame frames the doll; the settled one reframes it unless the person has turned it.
    const sameSolve = a.fitted?.slice(2) === fitKey.slice(2);
    if (a.fitted !== fitKey && !(sameSolve && a.moved)) {
      const b = new THREE.Box3();
      const v = new THREE.Vector3();
      // Nothing but floating pieces (an item laid out flat — not a garment): frame them all.
      const allFloat = topo.panels.every((p) => p.float);
      for (const p of topo.panels) {
        if (p.float && !allFloat) continue;
        for (let i = p.offset; i < p.offset + p.count; i++)
          b.expandByPoint(v.set(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]));
      }
      if (b.isEmpty()) a.geom.computeBoundingBox();
      if (b.isEmpty() && a.geom.boundingBox) b.copy(a.geom.boundingBox);
      a.box = b;
      // A new solve opens on its preset; the settled frame keeps the untouched view's angle.
      a.refit(0, sameSolve ? cameraRef.current ?? undefined : cameraRef.current ?? 'front');
      a.fitted = fitKey;
    }
    // The raycasts (double click, the label's view) read the cloth where it is now.
    for (const m of a.cloth.children) (m as THREE.Mesh).geometry.computeBoundingSphere();
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
    a.box = null;
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

  // ── seams: the open ones always, the rest on `showSeams`; the hovered open one named ──
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
    a.open = [];
    const pins: Pin[] = [];
    if (report) {
      const P = report.positions;
      // A hovered seam or the measure lines on: every other seam line steps back to grey.
      const dim = hover != null || showPom;
      const open = lineMat(a.seams, { width: 3, color: dim ? GREY : openColor });
      const hot = lineMat(a.seams, { width: 4, color: openColor });
      // An open seam often runs along the silhouette (a side seam seen from the front), half
      // behind the cloth. Its hidden part shows through faintly so the gap still reads.
      const behind = lineMat(a.seams, {
        width: 3,
        color: dim ? GREY : openColor,
        opacity: 0.3,
        xray: true,
      });
      const closed = showSeams ? lineMat(a.seams, { width: 1, color: GREY }) : null;
      const dashed = showSeams ? lineMat(a.seams, { width: 1, color: GREY, dashed: true }) : null;
      const stitch = lineMat(a.seams, { width: 1, color: INK });
      for (const s of report.seams as DollSeamReport[]) {
        if (s.origin === 'layer') continue;
        if (s.state === 'open' || s.state === 'twisted') {
          const paths = [s.pathA, s.pathB].filter((p) => p.length >= 2);
          for (const path of paths) {
            const pts = pathPoints(P, path);
            const under = line(pts, behind);
            under.renderOrder = 1;
            a.seams.add(under, line(pts, s.id === hover ? hot : open));
          }
          const at = midOf(P, s.pathA);
          if (!at) continue;
          const o: OpenSeam = {
            id: s.id,
            text: `${Math.round(s.residualMaxMm)} mm`,
            at,
            paths: paths.map((path) =>
              Array.from(path, (v) => new THREE.Vector3(P[3 * v], P[3 * v + 1], P[3 * v + 2])),
            ),
          };
          a.open.push(o);
          if (s.id === hover) pins.push({ id: `seam:${s.id}`, text: o.text, at });
          continue;
        }
        const m = s.guessed || s.state === 'proposed' ? dashed : closed;
        if (m && s.pathA.length >= 2) a.seams.add(line(pathPoints(P, s.pathA), m));
      }
      for (const turned of report.turned ?? [])
        if (turned.stitch && turned.stitch.length >= 2)
          a.seams.add(line(turned.stitch.flat(), stitch));
    }
    setSeamPins(pins);
    a.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, hover, showSeams, showPom, openColor]);

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

  // ── preset cameras: refit, turning to the preset by the shortest way round the side ──
  useEffect(() => {
    const a = api.current;
    if (!a || !camera || !a.box) return;
    a.refit(VIEW_MS, camera);
  }, [camera]);

  // ── fit on demand (the `fit` chip, the F key) ──
  useEffect(() => {
    if (fitSignal) api.current?.refit(VIEW_MS);
  }, [fitSignal]);

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
