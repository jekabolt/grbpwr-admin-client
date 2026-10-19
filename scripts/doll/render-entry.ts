// yarn doll:check — browser half: the solved doll as SHADED WebGL (three), four cameras on one
// canvas (front · back · three-quarter · side), flat grey cloth, soft light, seams as thin lines on
// top: closed = ink, proposed = dashed ink, open = red. Headless Chrome screenshots this page.

import * as THREE from 'three';

type Scene = {
  title: string;
  honesty: string;
  lines: string[];
  panels: { key: string; group: string; pos: number[]; tris: number[]; boundary: number[] }[];
  seams: { state: string; kind: string; a: number[]; b: number[] }[];
};
const S = (window as unknown as { __DOLL__: Scene }).__DOLL__;
const view = new URLSearchParams(location.search).get('view') ?? 'all';

const W = window.innerWidth;
const H = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.setClearColor(0xf4f4f2, 1);
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const front = new THREE.MeshStandardMaterial({
  color: 0xdedcd8,
  roughness: 0.92,
  metalness: 0,
  side: THREE.FrontSide,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});
const back = new THREE.MeshStandardMaterial({
  color: 0x8d8b88,
  roughness: 1,
  metalness: 0,
  side: THREE.BackSide,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});
const floatMat = new THREE.MeshStandardMaterial({
  color: 0xc9c6c0,
  roughness: 1,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.55,
});

const box = new THREE.Box3();
const normalsOf = new Map<string, Float32Array>();
for (const p of S.panels) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
  g.setIndex(p.tris);
  g.computeVertexNormals();
  normalsOf.set(p.key, g.getAttribute('normal').array as Float32Array);
  if (p.group === 'FLOAT') {
    scene.add(new THREE.Mesh(g, floatMat));
    continue;
  }
  scene.add(new THREE.Mesh(g, front));
  scene.add(new THREE.Mesh(g, back));
  g.computeBoundingBox();
  box.union(g.boundingBox!);
  // Free contour: a hairline so the garment's edges read.
  const outline: number[] = [];
  const nrm = normalsOf.get(p.key)!;
  const at = (i: number) => [
    p.pos[3 * i] + nrm[3 * i] * 0.8,
    p.pos[3 * i + 1] + nrm[3 * i + 1] * 0.8,
    p.pos[3 * i + 2] + nrm[3 * i + 2] * 0.8,
  ];
  for (let k = 0; k < p.boundary.length; k++)
    outline.push(...at(p.boundary[k]), ...at(p.boundary[(k + 1) % p.boundary.length]));
  const og = new THREE.BufferGeometry();
  og.setAttribute('position', new THREE.Float32BufferAttribute(outline, 3));
  scene.add(
    new THREE.LineSegments(
      og,
      new THREE.LineBasicMaterial({ color: 0x77736d, transparent: true, opacity: 0.55 }),
    ),
  );
}

// Seams on top.
const center = new THREE.Vector3();
box.getCenter(center);
const ink = new THREE.LineBasicMaterial({ color: 0x1d1d1b });
const dash = new THREE.LineDashedMaterial({ color: 0x1d1d1b, dashSize: 7, gapSize: 5 });
const red = new THREE.LineBasicMaterial({ color: 0xe0281e });
const amber = new THREE.LineBasicMaterial({ color: 0xc98a12 });
const redDash = new THREE.LineDashedMaterial({ color: 0xe0281e, dashSize: 6, gapSize: 4 });
const push = (arr: number[]) => {
  // Nudge 1.2 mm away from the doll's vertical axis so lines sit on the cloth.
  const out = [...arr];
  for (let i = 0; i < out.length; i += 3) {
    const dx = out[i] - center.x;
    const dz = out[i + 2] - center.z;
    const l = Math.hypot(dx, dz) || 1;
    out[i] += (dx / l) * 1.2;
    out[i + 2] += (dz / l) * 1.2;
  }
  return out;
};
for (const s of S.seams) {
  const open = s.state === 'open' || s.state === 'twisted';
  const proposed = s.state === 'proposed' || s.kind === 'closure-not-seam';
  const mat = open
    ? s.kind === 'facing-free'
      ? redDash
      : red
    : proposed
      ? dash
      : s.state === 'stretched'
        ? amber
        : ink;
  for (const side of open ? [s.a, s.b] : [s.a.length ? s.a : s.b]) {
    if (side.length < 6) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(push(side), 3));
    const line = new THREE.Line(g, mat);
    if (mat instanceof THREE.LineDashedMaterial) line.computeLineDistances();
    scene.add(line);
  }
}

// Light: soft sky + key from front-left-top + fill + rim.
scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b4ae, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 1.9);
key.position.set(-0.6, 1.0, 0.9);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.6);
fill.position.set(0.9, 0.2, 0.4);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.7);
rim.position.set(0.2, 0.6, -1);
scene.add(rim);
const grid = new THREE.GridHelper(2400, 24, 0xd6d4cf, 0xe4e2de);
grid.position.set(center.x, box.min.y - 40, center.z);
scene.add(grid);

const size = new THREE.Vector3();
box.getSize(size);
const views: Record<string, [number, number, string]> = {
  front: [0, 0, 'front'],
  back: [180, 0, 'back'],
  tq: [35, 12, 'three-quarter'],
  side: [90, 0, 'side (left)'],
  // Close-ups on the neck: three-quarter front and three-quarter back, from a little above.
  ctq: [35, 22, 'collar · three-quarter front'],
  cbk: [150, 22, 'collar · three-quarter back'],
};
// The collar box: stand / collar panels, else the top fifth of the body.
const neckBox = new THREE.Box3();
for (const p of S.panels) {
  if (p.group !== 'STAND' && p.group !== 'COLLAR') continue;
  for (let i = 0; i < p.pos.length; i += 3)
    neckBox.expandByPoint(new THREE.Vector3(p.pos[i], p.pos[i + 1], p.pos[i + 2]));
}
if (neckBox.isEmpty()) {
  neckBox.copy(box);
  neckBox.min.y = box.max.y - 0.2 * size.y;
}
neckBox.expandByScalar(70);
const order =
  view === 'all' ? ['front', 'back', 'tq', 'side'] : view === 'collar' ? ['ctq', 'cbk'] : [view];
const cols = order.length === 1 ? 1 : 2;
const rows = Math.ceil(order.length / cols);
const top = 64;
const cw = W / cols;
const ch = (H - top) / rows;
renderer.clear();
order.forEach((v, i) => {
  const [az, el, label] = views[v];
  const close = v === 'ctq' || v === 'cbk';
  const cam = new THREE.PerspectiveCamera(24, cw / ch, 10, 20000);
  const c = new THREE.Vector3();
  const sz = new THREE.Vector3();
  (close ? neckBox : box).getCenter(c);
  (close ? neckBox : box).getSize(sz);
  const R =
    (Math.max(sz.y, Math.max(sz.x, sz.z) * (ch / cw) * 0.9) / 2 / Math.tan((12 * Math.PI) / 180)) *
    (close ? 1.15 : 1.08);
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  cam.position.set(
    c.x + R * Math.sin(a) * Math.cos(e),
    c.y + R * Math.sin(e),
    c.z + R * Math.cos(a) * Math.cos(e),
  );
  cam.lookAt(c);
  const x = (i % cols) * cw;
  const y = H - top - (Math.floor(i / cols) + 1) * ch;
  renderer.setViewport(x, y, cw, ch);
  renderer.setScissor(x, y, cw, ch);
  renderer.setScissorTest(true);
  renderer.render(scene, cam);
  const tag = document.createElement('div');
  tag.textContent = label;
  tag.style.cssText = `position:absolute;left:${x + 14}px;top:${top + Math.floor(i / cols) * ch + 10}px;font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#55524d`;
  document.body.appendChild(tag);
});
const head = document.createElement('div');
head.style.cssText =
  'position:absolute;left:0;top:0;right:0;height:64px;padding:10px 16px;box-sizing:border-box;background:#fff;border-bottom:1px solid #ccc;font:12px/1.45 ui-monospace,Menlo,monospace;color:#222';
head.innerHTML = `<b style="font-size:13px">${S.title}</b> &nbsp;·&nbsp; ${S.lines.join(' &nbsp;·&nbsp; ')}<br><span style="color:#666">${S.honesty} &nbsp;·&nbsp; ink = closed · dashed = proposed by the doll / closure · <span style="color:#c98a12">amber = closes only by stretching</span> · <span style="color:#e0281e">red = open</span></span>`;
document.body.appendChild(head);
document.title = 'ready';
