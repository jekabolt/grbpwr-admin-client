#!/usr/bin/env node
// PATTERN-IMPORT · F12 — synthetic PLT/HPGL, SVG, AI and EPS fixtures with KNOWN geometry.
// There are no owner samples for these formats, so the shapes below are written out the way the
// garment-CAD exporters write them (Gerber/AccuMark HP-GL/1, Lectra with IP/SC user units,
// Optitex-style HP-GL/2 in a PJL/PCL wrapper with PE polylines, Inkscape mm/layers, Illustrator
// 72-dpi px + CSS classes + entities + switch/foreignObject, Qt/Seamly2D QSvgGenerator, a bare
// px-only SVG) from ONE truth (mm, y-up page frame). This generator shares no code with the
// adapters: its own arc maths, its own PE encoder, its own y-flip.
//   node scripts/pattern-import/f12-fixtures.mjs           → writes corpus/synthetic/*
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const OUT = resolve(CORPUS, 'synthetic');
mkdirSync(OUT, { recursive: true });

const rad = (d) => (d * Math.PI) / 180;
const add = (p, o) => [p[0] + o[0], p[1] + o[1]];
const r4 = (v) => Math.round(v * 1e4) / 1e4;

// ── truth shapes (relative to an origin; mm, y-up) ─────────────────────────────────────────
// FRONT: hem, side seam, armhole (quarter circle, CCW), shoulder, neckline (quarter circle, CW), CF.
const FRONT = [
  { t: 'L', a: [0, 0], b: [260, 0] },
  { t: 'L', a: [260, 0], b: [280, 380] },
  { t: 'A', c: [180, 380], r: 100, a0: 0, a1: 90 },
  { t: 'L', a: [180, 480], b: [100, 560] },
  { t: 'A', c: [0, 560], r: 100, a0: 0, a1: -90 },
  { t: 'L', a: [0, 460], b: [0, 0] },
];
// BACK: as FRONT with a cubic back neckline.
const BACK_NECK = [
  [90, 580],
  [60, 560],
  [30, 555],
  [0, 555],
];
const BACK = [
  { t: 'L', a: [0, 0], b: [250, 0] },
  { t: 'L', a: [250, 0], b: [270, 400] },
  { t: 'A', c: [170, 400], r: 100, a0: 0, a1: 90 },
  { t: 'L', a: [170, 500], b: [90, 580] },
  { t: 'C', p: BACK_NECK },
  { t: 'L', a: [0, 555], b: [0, 0] },
];

const moveSegs = (segs, o) =>
  segs.map((s) =>
    s.t === 'L'
      ? { ...s, a: add(s.a, o), b: add(s.b, o) }
      : s.t === 'A'
        ? { ...s, c: add(s.c, o) }
        : { ...s, p: s.p.map((q) => add(q, o)) },
  );
const segStart = (s) =>
  s.t === 'L'
    ? s.a
    : s.t === 'A'
      ? [s.c[0] + s.r * Math.cos(rad(s.a0)), s.c[1] + s.r * Math.sin(rad(s.a0))]
      : s.p[0];
const segEnd = (s) =>
  s.t === 'L'
    ? s.b
    : s.t === 'A'
      ? [s.c[0] + s.r * Math.cos(rad(s.a1)), s.c[1] + s.r * Math.sin(rad(s.a1))]
      : s.p[3];
const cubicAt = (p, t) => {
  const u = 1 - t;
  return [0, 1].map(
    (k) =>
      u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k],
  );
};
/** Dense points of a segment, excluding its start (for pre-flattened exports). */
function sampleSeg(s, sagMm) {
  if (s.t === 'L') return [s.b];
  if (s.t === 'A') {
    const step = 2 * Math.acos(1 - sagMm / s.r);
    const n = Math.ceil(Math.abs(rad(s.a1 - s.a0)) / step);
    const out = [];
    for (let i = 1; i <= n; i++) {
      const a = rad(s.a0 + ((s.a1 - s.a0) * i) / n);
      out.push([s.c[0] + s.r * Math.cos(a), s.c[1] + s.r * Math.sin(a)]);
    }
    return out;
  }
  const n = 256;
  const out = [];
  for (let i = 1; i <= n; i++) out.push(cubicAt(s.p, i / n));
  return out;
}
/** Cubic approximation of a circular arc (≤ 90°) — what Illustrator writes instead of `A`. */
function arcToCubics(s, parts) {
  const out = [];
  const da = (s.a1 - s.a0) / parts;
  for (let k = 0; k < parts; k++) {
    const t0 = rad(s.a0 + da * k);
    const t1 = rad(s.a0 + da * (k + 1));
    const kap = (4 / 3) * Math.tan((t1 - t0) / 4);
    const P0 = [s.c[0] + s.r * Math.cos(t0), s.c[1] + s.r * Math.sin(t0)];
    const P3 = [s.c[0] + s.r * Math.cos(t1), s.c[1] + s.r * Math.sin(t1)];
    const P1 = [P0[0] - kap * s.r * Math.sin(t0), P0[1] + kap * s.r * Math.cos(t0)];
    const P2 = [P3[0] + kap * s.r * Math.sin(t1), P3[1] - kap * s.r * Math.cos(t1)];
    out.push({ t: 'C', p: [P0, P1, P2, P3], arcPart: k });
  }
  return out;
}

const truth = {
  generatedBy: 'scripts/pattern-import/f12-fixtures.mjs',
  units: 'mm, y-up page frame',
  fixtures: {},
};
const write = (name, data, t) => {
  writeFileSync(resolve(OUT, name), typeof data === 'string' ? Buffer.from(data, 'latin1') : data);
  truth.fixtures[name] = t;
};

// Common features of FRONT relative to its origin.
const frontFeatures = (o, layers) => ({
  polylines: [
    { name: 'grain', pts: [add([130, 100], o), add([130, 400], o)], ...layers.grain },
    { name: 'hip line (dashed)', pts: [add([10, 200], o), add([250, 200], o)], ...layers.hip },
    { name: 'hem notch', pts: [add([130, 0], o), add([130, 6], o)], ...layers.notch },
    { name: 'side notch', pts: [add([270, 190], o), add([264, 190], o)], ...layers.notch },
  ],
  circles: [{ name: 'drill', c: add([130, 300], o), r: 1.5, ...layers.drill }],
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. Gerber AccuMark-style HP-GL/1 — 40 units/mm, absolute, AA arcs, SP pens, LB with ETX.
// ═════════════════════════════════════════════════════════════════════════════════════════════
{
  const O = [50, 50];
  const segs = moveSegs(FRONT, O);
  const pu = (p) => `${Math.round(p[0] * 40)},${Math.round(p[1] * 40)}`;
  let s = 'IN;CO "Gerber AccuMark plot -- PIECE FRONT 38";\nIP;SP1;\n';
  s += `PU${pu(segStart(segs[0]))};`;
  for (const g of segs) {
    if (g.t === 'L') s += `PD${pu(g.b)};\n`;
    else s += `AA${pu(g.c)},${g.a1 - g.a0};\n`;
  }
  s += 'PU;\n';
  // notches in the cut pen (lower-case on purpose: some plot spoolers lower-case everything)
  s += `pu${pu(add([130, 0], O))};pd${pu(add([130, 6], O))};pu;\n`;
  s += `PU${pu(add([270, 190], O))};PD${pu(add([264, 190], O))};PU;\n`;
  // internal: grain pen 3; hip line pen 2 dashed, absolute 5 mm pattern
  s += `SP3;PU${pu(add([130, 100], O))};PD${pu(add([130, 400], O))};PU;\n`;
  s += `SP2;LT2,5,1;PU${pu(add([10, 200], O))};PD${pu(add([250, 200], O))};PU;LT;\n`;
  // drill: CI at the centre, 1.5 mm
  s += `SP4;PU${pu(add([130, 300], O))};CI60;PU;\n`;
  // labels
  s += `SP1;SI0.6,1.0;DI1,0;PU${pu(add([100, 250], O))};LBFRONT\x03\n`;
  s += `SI0.3,0.5;PU${pu(add([100, 230], O))};LBSIZE 38\r\nCUT 2\x03\n`;
  s += `SI0.24,0.4;DI0,1;PU${pu(add([125, 150], O))};LBGRAIN\x03DI;\n`;
  s += 'SP0;PG;\n';
  write('gerber-front.plt', s, {
    adapter: 'hpgl',
    sniff: 'hpgl',
    pieces: [{ name: 'FRONT', segs, layer: 'pen 1', rgb: [0, 0, 0], widthMm: 0.35, dash: null }],
    ...frontFeatures(O, {
      grain: { layer: 'pen 3' },
      hip: { layer: 'pen 2', dash: [2.5, 2.5], rgb: [255, 0, 0] },
      notch: { layer: 'pen 1' },
      drill: { layer: 'pen 4' },
    }),
    labels: [
      { text: 'FRONT', anchor: add([100, 250], O), rot: 0, size: 10, tolMm: 0.05 },
      { text: 'SIZE 38', anchor: add([100, 230], O), rot: 0, size: 5, tolMm: 0.05 },
      { text: 'CUT 2', anchor: add([100, 220], O), rot: 0, size: 5, tolMm: 0.05 },
      { text: 'GRAIN', anchor: add([125, 150], O), rot: 90, size: 4, tolMm: 0.05 },
    ],
    styleCount: { min: 4 },
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. Lectra-style: IP/SC user units = mm, PR relative moves with decimals, AR relative arcs,
//    the cubic pre-flattened by the exporter, DT$ terminator, LO5 centred label, relative LT.
// ═════════════════════════════════════════════════════════════════════════════════════════════
{
  const O = [400, 50];
  const segs = moveSegs(BACK, O);
  const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  let s = 'IN;IP0,0,40000,40000;SC0,1000,0,1000;DT$,1;SP1;\n';
  let cur = segStart(segs[0]);
  s += `PA;PU${f2(cur[0])},${f2(cur[1])};PD;PR;\n`;
  // Relative output with decimals accumulates rounding: track the plotted position, not the truth.
  const rel = (p) => {
    const dx = Math.round((p[0] - cur[0]) * 100) / 100;
    const dy = Math.round((p[1] - cur[1]) * 100) / 100;
    cur = [cur[0] + dx, cur[1] + dy];
    return `${f2(dx)},${f2(dy)}`;
  };
  for (const g of segs) {
    if (g.t === 'L') s += `PD${rel(g.b)};\n`;
    else if (g.t === 'A') {
      const c = [g.c[0] - cur[0], g.c[1] - cur[1]];
      s += `AR${f2(c[0])},${f2(c[1])},${g.a1 - g.a0};\n`;
      cur = segEnd(g);
    } else s += 'PD' + sampleSeg(g, 0.005).map(rel).join(',') + ';\n';
  }
  s += 'PU;PA;\n';
  s += `SP2;LT2;PU${f2(O[0] + 10)},${f2(O[1] + 250)};PD${f2(O[0] + 240)},${f2(O[1] + 250)};PU;LT;\n`;
  s += `SP1;SI0.5,0.8;LO5;PU${f2(O[0] + 125)},${f2(O[1] + 300)};LBBACK$LO1;\n`;
  s += `SI0.3,0.5;PU${f2(O[0] + 100)},${f2(O[1] + 270)};LBSIZE 40$\n`;
  s += 'SP0;\n';
  const ipDiagMm = Math.hypot(40000, 40000) / 40;
  write('lectra-back-sc.plt', s, {
    adapter: 'hpgl',
    sniff: 'hpgl',
    pieces: [{ name: 'BACK', segs, layer: 'pen 1' }],
    polylines: [
      {
        name: 'hip line (LT2 relative, IP diag)',
        pts: [add([10, 250], O), add([240, 250], O)],
        layer: 'pen 2',
        dash: [0.02 * ipDiagMm, 0.02 * ipDiagMm],
      },
    ],
    circles: [],
    labels: [
      { text: 'BACK', center: add([125, 300], O), rot: 0, size: 8, tolMm: 0.05 },
      { text: 'SIZE 40', anchor: add([100, 270], O), rot: 0, size: 5, tolMm: 0.05 },
    ],
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. Optitex-style HP-GL/2: PJL + PCL wrapper, BP, PW/PC, PE (8-bit, fractional bits, absolute
//    move, pen select), PE 7-bit, plus PA/PD + AA + BZ for the second piece.
// ═════════════════════════════════════════════════════════════════════════════════════════════
function peValue(n, sevenBit) {
  let v = n >= 0 ? 2 * n : 2 * -n + 1;
  const base = sevenBit ? 32 : 64;
  let out = '';
  while (v >= base) {
    out += String.fromCharCode((v % base) + 63);
    v = Math.floor(v / base);
  }
  out += String.fromCharCode(v + (sevenBit ? 95 : 191));
  return out;
}
{
  const OF = [50, 50];
  const OB = [400, 50];
  const fsegs = moveSegs(FRONT, OF);
  const bsegs = moveSegs(BACK, OB);
  const ESC = '\x1b';
  let s = `${ESC}%-12345X@PJL JOB NAME="optitex"\r\n@PJL ENTER LANGUAGE=PCL\r\n${ESC}E${ESC}&l0O${ESC}*b4W\x00\xff\x00\xff${ESC}%1B`;
  s += 'BP1,"OPTITEX MARKER";IN;PW0.5,1;PW0.25,2;PC2,200,30,30;NP8;\n';
  // FRONT via PE, 8-bit, 2 fractional bits; arcs pre-flattened at 0.005 mm by the exporter.
  const F = 2;
  const q = (mm) => Math.round(mm * 40 * 2 ** F); // quarter plotter units
  let pts = [segStart(fsegs[0])];
  for (const g of fsegs) pts.push(...sampleSeg(g, 0.005));
  let body = ':' + peValue(1, false) + '>' + peValue(F, false);
  let at = [q(pts[0][0]), q(pts[0][1])];
  body += '<=' + peValue(at[0], false) + peValue(at[1], false);
  for (let k = 1; k < pts.length; k++) {
    const nx = q(pts[k][0]);
    const ny = q(pts[k][1]);
    body += peValue(nx - at[0], false) + peValue(ny - at[1], false);
    at = [nx, ny];
  }
  s += `PE${body};\n`;
  // grain via PE 7-bit (no fractional bits), pen 3 — `7` must lead the body.
  const g0 = add([130, 100], OF).map((v) => Math.round(v * 40));
  const g1 = add([130, 400], OF).map((v) => Math.round(v * 40));
  s += `PE7:${peValue(3, true)}<=${peValue(g0[0], true)}${peValue(g0[1], true)}${peValue(g1[0] - g0[0], true)}${peValue(g1[1] - g0[1], true)};\n`;
  // BACK via PA/PD + AA + BZ, pen 2 (colour from PC, width from PW)
  const pu = (p) => `${Math.round(p[0] * 40)},${Math.round(p[1] * 40)}`;
  s += `SP2;PA;PU${pu(segStart(bsegs[0]))};PD;`;
  for (const g of bsegs) {
    if (g.t === 'L') s += `PD${pu(g.b)};`;
    else if (g.t === 'A') s += `AA${pu(g.c)},${g.a1 - g.a0};`;
    else s += `BZ${pu(g.p[1])},${pu(g.p[2])},${pu(g.p[3])};`;
  }
  s += 'PU;\n';
  s += `SP1;SI0.5,0.8;DI1,0;PA;PU${pu(add([100, 250], OF))};LBFRONT\x03PU${pu(add([100, 250], OB))};LBBACK\x03\n`;
  s += `${ESC}%0A${ESC}E${ESC}%-12345X@PJL EOJ\r\n`;
  write('optitex-hpgl2-pe.plt', s, {
    adapter: 'hpgl',
    sniff: 'hpgl',
    pieces: [
      { name: 'FRONT (PE 8-bit)', segs: fsegs, layer: 'pen 1', widthMm: 0.5, rgb: [0, 0, 0] },
      { name: 'BACK (AA+BZ)', segs: bsegs, layer: 'pen 2', widthMm: 0.25, rgb: [200, 30, 30] },
    ],
    polylines: [
      { name: 'grain (PE 7-bit)', pts: [add([130, 100], OF), add([130, 400], OF)], layer: 'pen 3' },
    ],
    circles: [],
    labels: [
      { text: 'FRONT', anchor: add([100, 250], OF), rot: 0, size: 8, tolMm: 0.05 },
      { text: 'BACK', anchor: add([100, 250], OB), rot: 0, size: 8, tolMm: 0.05 },
    ],
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. Inkscape 1.x: mm document, layers (one hidden), layer transform, nested rotated group,
//    relative/compact path syntax, rounded rect, circle, dasharray, multi-line text.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const PH_INK = 700;
{
  const OF = [50, 50];
  const OB = [400, 50];
  const fsegs = moveSegs(FRONT, OF);
  const bsegs = moveSegs(BACK, OB);
  const down = (p) => [p[0], PH_INK - p[1]]; // page y-down (user units = mm)
  const LAYER_T = [10, -5];
  const inLayer = (p) => {
    const d = down(p);
    return [d[0] - LAYER_T[0], d[1] - LAYER_T[1]];
  };
  // FRONT: absolute M, then relative commands; arcs with compact flags.
  let cur = inLayer(segStart(fsegs[0]));
  let d = `M ${r4(cur[0])},${r4(cur[1])}`;
  for (const g of fsegs) {
    const e = inLayer(segEnd(g));
    const dx = r4(e[0] - cur[0]);
    const dy = r4(e[1] - cur[1]);
    if (g.t === 'L') d += ` l ${dx},${dy}`;
    else {
      const sweep = g.a1 > g.a0 ? 0 : 1; // CCW in y-up is negative-angle in y-down
      d += ` a${g.r},${g.r} 0 0${sweep}${dx},${dy}`;
    }
    cur = [cur[0] + dx, cur[1] + dy];
  }
  d += ' z';
  // BACK inside <g transform="translate(560,300) rotate(-30)">: local = R(+30)·(layerPt − T).
  const T = [560, 300];
  const loc = (p) => {
    const l = inLayer(p);
    const x = l[0] - T[0];
    const y = l[1] - T[1];
    const c = Math.cos(rad(30));
    const sn = Math.sin(rad(30));
    return [r4(c * x - sn * y), r4(sn * x + c * y)];
  };
  let db = `M ${loc(segStart(bsegs[0])).join(',')}`;
  for (const g of bsegs) {
    if (g.t === 'L') db += ` L ${loc(g.b).join(',')}`;
    else if (g.t === 'A')
      db += ` A ${g.r} ${g.r} 0 0 ${g.a1 > g.a0 ? 0 : 1} ${loc(segEnd(g)).join(',')}`;
    else db += ` C ${loc(g.p[1]).join(',')} ${loc(g.p[2]).join(',')} ${loc(g.p[3]).join(',')}`;
  }
  db += ' Z';
  const pd = (p) => down(p).map(r4).join(',');
  // Label box: rounded rect (90..200, 205..265) y-up, r = 3.
  const box = { x0: 90 + OF[0], y0: 205 + OF[1], x1: 200 + OF[0], y1: 265 + OF[1], r: 3 };
  const boxSegs = [
    { t: 'L', a: [box.x0 + 3, box.y0], b: [box.x1 - 3, box.y0] },
    { t: 'A', c: [box.x1 - 3, box.y0 + 3], r: 3, a0: -90, a1: 0 },
    { t: 'L', a: [box.x1, box.y0 + 3], b: [box.x1, box.y1 - 3] },
    { t: 'A', c: [box.x1 - 3, box.y1 - 3], r: 3, a0: 0, a1: 90 },
    { t: 'L', a: [box.x1 - 3, box.y1], b: [box.x0 + 3, box.y1] },
    { t: 'A', c: [box.x0 + 3, box.y1 - 3], r: 3, a0: 90, a1: 180 },
    { t: 'L', a: [box.x0, box.y1 - 3], b: [box.x0, box.y0 + 3] },
    { t: 'A', c: [box.x0 + 3, box.y0 + 3], r: 3, a0: 180, a1: 270 },
  ];
  const grainTxt = down(add([125, 150], OF)); // rotate(-90): local (x,y) = (−Y, X)
  const svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Created with Inkscape (http://www.inkscape.org/) -->

<svg
   width="1000mm"
   height="700mm"
   viewBox="0 0 1000 700"
   version="1.1"
   id="svg5"
   inkscape:version="1.3.2 (091e20e, 2023-11-25)"
   sodipodi:docname="front-back-38.svg"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:svg="http://www.w3.org/2000/svg">
  <sodipodi:namedview
     id="namedview7"
     pagecolor="#ffffff"
     inkscape:document-units="mm" />
  <defs
     id="defs2" />
  <g
     inkscape:label="Cut lines"
     inkscape:groupmode="layer"
     id="layer1"
     transform="translate(${LAYER_T[0]},${LAYER_T[1]})">
    <path
       style="fill:none;stroke:#000000;stroke-width:0.5;stroke-linecap:butt;stroke-linejoin:miter"
       d="${d}"
       id="front" />
    <g
       id="g12"
       transform="translate(${T[0]},${T[1]}) rotate(-30)">
      <path
         style="fill:none;stroke:#000000;stroke-width:0.5"
         d="${db}"
         id="back" />
    </g>
  </g>
  <g
     inkscape:groupmode="layer"
     id="layer2"
     inkscape:label="Internal">
    <path
       style="fill:none;stroke:#0000ff;stroke-width:0.35"
       d="M ${pd(add([130, 100], OF))} V ${r4(PH_INK - (400 + OF[1]))}"
       id="grain" />
    <path
       style="fill:none;stroke:#000000;stroke-width:0.3;stroke-dasharray:5, 3;stroke-dashoffset:0"
       d="m ${pd(add([10, 200], OF))} h 240"
       id="hip" />
    <polyline
       points="${pd(add([130, 0], OF))} ${pd(add([130, 6], OF))}"
       style="fill:none;stroke:#000000;stroke-width:0.5" id="notch1" />
    <polyline
       points="${pd(add([270, 190], OF))} ${pd(add([264, 190], OF))}"
       style="fill:none;stroke:#000000;stroke-width:0.5" id="notch2" />
  </g>
  <g
     inkscape:groupmode="layer"
     id="layer3"
     inkscape:label="Drill">
    <circle
       style="fill:none;stroke:#ff0000;stroke-width:0.25"
       id="drill"
       cx="${r4(130 + OF[0])}"
       cy="${r4(PH_INK - (300 + OF[1]))}"
       r="1.5" />
  </g>
  <g
     inkscape:groupmode="layer"
     id="layer4"
     inkscape:label="Labels">
    <rect
       style="fill:none;stroke:#808080;stroke-width:0.2"
       id="labelbox"
       width="${box.x1 - box.x0}"
       height="${box.y1 - box.y0}"
       x="${box.x0}"
       y="${PH_INK - box.y1}"
       rx="3" />
    <text
       xml:space="preserve"
       style="font-size:10px;line-height:1.25;font-family:sans-serif;stroke-width:0.264583"
       x="${100 + OF[0]}"
       y="${PH_INK - (250 + OF[1])}"
       id="text1"><tspan
         sodipodi:role="line"
         id="tspan1"
         x="${100 + OF[0]}"
         y="${PH_INK - (250 + OF[1])}">FRONT</tspan><tspan
         sodipodi:role="line"
         id="tspan2"
         style="font-size:5px"
         x="${100 + OF[0]}"
         y="${PH_INK - (230 + OF[1])}">SIZE 38</tspan><tspan
         sodipodi:role="line"
         id="tspan3"
         style="font-size:5px"
         x="${100 + OF[0]}"
         y="${PH_INK - (220 + OF[1])}">CUT &amp; 2</tspan></text>
    <text
       xml:space="preserve"
       transform="rotate(-90)"
       style="font-size:4px;font-family:sans-serif"
       x="${-grainTxt[1]}"
       y="${grainTxt[0]}"
       id="text2">GRAIN</text>
  </g>
  <g
     inkscape:groupmode="layer"
     id="layer5"
     inkscape:label="Old construction"
     style="display:none">
    <rect style="fill:none;stroke:#000000;stroke-width:1" id="hidden" width="950" height="650" x="25" y="25" />
  </g>
</svg>
`;
  write('inkscape-pieces-mm.svg', Buffer.from(svg, 'utf8'), {
    adapter: 'svg',
    sniff: 'svg',
    page: { w: 1000, h: 700 },
    pieces: [
      {
        name: 'FRONT (layer translate, relative, compact arc flags)',
        segs: fsegs,
        layer: 'Cut lines',
        rgb: [0, 0, 0],
        widthMm: 0.5,
      },
      { name: 'BACK (nested rotate(-30), A + C)', segs: bsegs, layer: 'Cut lines' },
      { name: 'label box (rounded rect)', segs: boxSegs, layer: 'Labels' },
    ],
    ...frontFeatures(OF, {
      grain: { layer: 'Internal', rgb: [0, 0, 255] },
      hip: { layer: 'Internal', dash: [5, 3], widthMm: 0.3 },
      notch: { layer: 'Internal' },
      drill: { layer: 'Drill', rgb: [255, 0, 0] },
    }),
    labels: [
      {
        text: 'FRONT',
        anchor: add([100, 250], OF),
        rot: 0,
        size: 10,
        tolMm: 0.05,
        layer: 'Labels',
      },
      { text: 'SIZE 38', anchor: add([100, 230], OF), rot: 0, size: 5, tolMm: 0.05 },
      { text: 'CUT & 2', anchor: add([100, 220], OF), rot: 0, size: 5, tolMm: 0.05 },
      { text: 'GRAIN', anchor: add([125, 150], OF), rot: 90, size: 4, tolMm: 0.05 },
    ],
    absent: [{ name: 'hidden layer rect', minWidthMm: 900 }],
    layers: ['Cut lines', 'Internal', 'Drill', 'Labels'],
    noWarning: 'px',
    producer: /Inkscape 1\.3/.source,
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5. Adobe Illustrator SVG export: 72-dpi "px", DOCTYPE entities, CSS classes, _x5F_ ids,
//    data-name, switch/foreignObject/i:pgf, cubic arcs (c + s), polygon, matrix text, clip-path.
// ═════════════════════════════════════════════════════════════════════════════════════════════
{
  const PH = 800; // mm
  const PT = 72 / 25.4;
  const O = [50, 50];
  const segsTrue = moveSegs(BACK, O);
  // Illustrator writes the armhole as two 45° cubics: truth = those cubics.
  const segs = segsTrue.flatMap((g) => (g.t === 'A' ? arcToCubics(g, 2) : [g]));
  const px = (p) => [r4(p[0] * PT), r4((PH - p[1]) * PT)];
  let cur = px(segStart(segs[0]));
  let d = `M${cur[0]},${cur[1]}`;
  const relP = (p) => {
    const q = px(p);
    return [r4(q[0] - cur[0]), r4(q[1] - cur[1])];
  };
  for (const g of segs) {
    if (g.t === 'L') {
      const q = px(g.b);
      d += `L${q[0]},${q[1]}`;
      cur = q;
      continue;
    }
    const c2 = relP(g.p[2]);
    const e = relP(g.p[3]);
    if (g.arcPart === 1) d += `s${c2[0]},${c2[1]},${e[0]},${e[1]}`;
    else {
      const c1 = relP(g.p[1]);
      d += `c${c1[0]},${c1[1]},${c2[0]},${c2[1]},${e[0]},${e[1]}`;
    }
    cur = [r4(cur[0] + e[0]), r4(cur[1] + e[1])];
  }
  d += 'z';
  // `s` is exact for the second half of the armhole: a circle split in equal parts is tangent-symmetric.
  const pocket = [
    [700, 100],
    [860, 100],
    [860, 280],
    [700, 280],
  ];
  const ppx = pocket
    .map(px)
    .map((q) => q.join(','))
    .join(' ');
  const t1 = px(add([100, 250], O));
  const t2 = px(add([125, 150], O));
  const W = r4(1000 * PT);
  const H = r4(PH * PT);
  const svg = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generator: Adobe Illustrator 27.5.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [
	<!ENTITY ns_extend "http://ns.adobe.com/Extensibility/1.0/">
	<!ENTITY ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">
	<!ENTITY ns_graphs "http://ns.adobe.com/Graphs/1.0/">
	<!ENTITY ns_vars "http://ns.adobe.com/Variables/1.0/">
	<!ENTITY ns_imrep "http://ns.adobe.com/ImageReplacement/1.0/">
	<!ENTITY ns_sfw "http://ns.adobe.com/SaveForWeb/1.0/">
	<!ENTITY ns_custom "http://ns.adobe.com/GenericCustomNamespace/1.0/">
	<!ENTITY ns_adobe_xpath "http://ns.adobe.com/XPath/1.0/">
	<!ENTITY ns_svg "http://www.w3.org/2000/svg">
	<!ENTITY ns_xlink "http://www.w3.org/1999/xlink">
]>
<svg version="1.1" id="Layer_1" xmlns:x="&ns_extend;" xmlns:i="&ns_ai;" xmlns:graph="&ns_graphs;"
	 xmlns="&ns_svg;" xmlns:xlink="&ns_xlink;" x="0px" y="0px" width="${W}px" height="${H}px"
	 viewBox="0 0 ${W} ${H}" style="enable-background:new 0 0 ${W} ${H};" xml:space="preserve">
<style type="text/css">
	.st0{fill:none;stroke:#E30613;stroke-width:0.7087;stroke-miterlimit:10;}
	.st1{fill:none;stroke:#000000;stroke-width:0.5;stroke-miterlimit:10;stroke-dasharray:4.2520,2.8346;}
	.st2{font-family:'ArialMT';}
	.st3{font-size:28.3465px;}
	.st4{clip-path:url(#SVGID_2_);fill:none;stroke:#1D1D1B;stroke-width:0.7087;}
</style>
<switch>
	<foreignObject requiredExtensions="&ns_ai;" x="0" y="0" width="1" height="1">
		<i:pgfRef  xlink:href="#adobe_illustrator_pgf">
		</i:pgfRef>
	</foreignObject>
	<g i:extraneous="self">
		<g id="CUT_x5F_LINE">
			<path class="st0" d="${d}"/>
			<g>
				<defs>
					<rect id="SVGID_1_" x="0" y="0" width="${W}" height="${H}"/>
				</defs>
				<clipPath id="SVGID_2_">
					<use xlink:href="#SVGID_1_"  style="overflow:visible;"/>
				</clipPath>
				<polygon class="st4" points="${ppx}"/>
			</g>
		</g>
		<g id="Seam_line" data-name="Seam line">
			<line class="st1" x1="${px(add([10, 250], O))[0]}" y1="${px(add([10, 250], O))[1]}" x2="${px(add([240, 250], O))[0]}" y2="${px(add([240, 250], O))[1]}"/>
		</g>
		<g id="TEXT">
			<text transform="matrix(1 0 0 1 ${t1[0]} ${t1[1]})" class="st2 st3">BACK</text>
			<text transform="matrix(0 -1 1 0 ${t2[0]} ${t2[1]})" class="st2" style="font-size:11.3386px">GRAIN</text>
		</g>
	</g>
</switch>
<i:pgf  id="adobe_illustrator_pgf">
	<![CDATA[
	eJzsvWuTHMeRIPh5x2z/Q90HmZG2Q6rygcxS3tqaVdaDwzGQhBGgSI1sjNYEmmTv9AOLR0j9t/f9
	]]>
</i:pgf>
</svg>
`;
  write('illustrator-back-72dpi.svg', Buffer.from(svg, 'utf8'), {
    adapter: 'svg',
    sniff: 'svg',
    page: { w: 1000, h: 800 },
    pieces: [
      {
        name: 'BACK (c/s cubics, 72-dpi px, CSS class)',
        segs,
        layer: 'CUT_LINE',
        rgb: [227, 6, 19],
        widthMm: 0.25,
      },
      {
        name: 'POCKET (polygon, clip-path)',
        segs: pocket.map((p, k) => ({ t: 'L', a: p, b: pocket[(k + 1) % 4] })),
        layer: 'CUT_LINE',
        clip: 'SVGID_2_',
      },
    ],
    polylines: [
      {
        name: 'seam (line, dasharray)',
        pts: [add([10, 250], O), add([240, 250], O)],
        layer: 'Seam line',
        dash: [1.5, 1],
      },
    ],
    circles: [],
    labels: [
      { text: 'BACK', anchor: add([100, 250], O), rot: 0, size: 10, tolMm: 0.05, layer: 'TEXT' },
      { text: 'GRAIN', anchor: add([125, 150], O), rot: 90, size: 4, tolMm: 0.05 },
    ],
    layers: ['CUT_LINE', 'Seam line', 'TEXT'],
    warning: 'px',
    producer: /Adobe Illustrator 27\.5\.0/.source,
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6. Qt QSvgGenerator (Seamly2D / Valentina "export as SVG"): mm size + 96-dpi viewBox.
// ═════════════════════════════════════════════════════════════════════════════════════════════
{
  const PH = 210;
  const k = 96 / 25.4;
  const px = (p) => [r4(p[0] * k), r4((PH - p[1]) * k)];
  const coll = [
    { t: 'L', a: [20, 20], b: [220, 20] },
    { t: 'L', a: [220, 20], b: [220, 60] },
    {
      t: 'C',
      p: [
        [220, 60],
        [150, 90],
        [90, 90],
        [20, 60],
      ],
    },
    { t: 'L', a: [20, 60], b: [20, 20] },
  ];
  const d =
    `M${px([20, 20]).join(',')} L${px([220, 20]).join(',')} L${px([220, 60]).join(',')} ` +
    `C${px([150, 90]).join(',')} ${px([90, 90]).join(',')} ${px([20, 60]).join(',')} L${px([20, 20]).join(',')}`;
  const tp = px([60, 35]);
  const svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="297mm" height="210mm"
 viewBox="0 0 ${r4(297 * k)} ${r4(210 * k)}"
 xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"  version="1.2" baseProfile="tiny">
<title>Seamly2D layout</title>
<desc>Exported by Seamly2D</desc>
<defs>
</defs>
<g fill="none" stroke="black" stroke-width="1" fill-rule="evenodd" stroke-linecap="square" stroke-linejoin="bevel" >

<g fill="none" stroke="#000000" stroke-opacity="1" stroke-width="3.77953" stroke-linecap="round" stroke-linejoin="round" transform="matrix(1,0,0,1,0,0)"
font-family="MS Shell Dlg 2" font-size="7.8" font-weight="400" font-style="normal"
>
<path vector-effect="none" fill-rule="evenodd" d="${d}"/>
</g>

<g fill="#000000" fill-opacity="1" stroke="none" transform="matrix(1,0,0,1,0,0)"
font-family="Arial" font-size="37.7953" font-weight="400" font-style="normal"
>
<text fill="#000000" fill-opacity="1" stroke="none" xml:space="preserve" x="${tp[0]}" y="${tp[1]}" font-family="Arial" font-size="37.7953" font-weight="400" font-style="normal"
 >COLLAR</text>
</g>
</g>
</svg>
`;
  write('seamly2d-qt-collar.svg', Buffer.from(svg, 'utf8'), {
    adapter: 'svg',
    sniff: 'svg',
    page: { w: 297, h: 210 },
    pieces: [
      { name: 'COLLAR (mm size, 96-dpi viewBox)', segs: coll, rgb: [0, 0, 0], widthMm: 1.0 },
    ],
    polylines: [],
    circles: [],
    labels: [{ text: 'COLLAR', anchor: [60, 35], rot: 0, size: 10, tolMm: 0.05 }],
    noWarning: 'px',
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 7. px-only SVG (no width/height): 1 user unit = 1 px @ 96 dpi, flagged uncertain.
// ═════════════════════════════════════════════════════════════════════════════════════════════
{
  const k = 25.4 / 96;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect x="100" y="100" width="100" height="100" fill="none" stroke="black"/></svg>\n`;
  const sq = [
    [100 * k, (600 - 200) * k],
    [200 * k, (600 - 200) * k],
    [200 * k, (600 - 100) * k],
    [100 * k, (600 - 100) * k],
  ];
  write('px-only-square.svg', Buffer.from(svg, 'utf8'), {
    adapter: 'svg',
    sniff: 'svg',
    page: { w: 800 * k, h: 600 * k },
    pieces: [
      {
        name: '100 px square = 26.4583 mm',
        segs: sq.map((p, i) => ({ t: 'L', a: p, b: sq[(i + 1) % 4] })),
        widthMm: k,
      },
    ],
    polylines: [],
    circles: [],
    labels: [],
    warning: 'no physical size',
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 8. Refusals and routing: EPS, DOS-binary EPS, Illustrator 8 (PostScript), PDF-compatible AI,
//    PDF in a PostScript wrapper, binary garbage, HTML named .svg, malformed PE.
// ═════════════════════════════════════════════════════════════════════════════════════════════
{
  const eps =
    '%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: CorelDRAW\n%%BoundingBox: 0 0 283 283\n%%EndComments\nnewpath 10 10 moveto 273 273 lineto stroke\nshowpage\n%%EOF\n';
  write('postscript-only.eps', eps, { refusal: 'eps-postscript', sniff: null });

  const ps = Buffer.from(eps, 'latin1');
  const hdr = Buffer.alloc(30);
  hdr.writeUInt32BE(0xc5d0d3c6, 0);
  hdr.writeUInt32LE(30, 4);
  hdr.writeUInt32LE(ps.length, 8);
  write('dos-binary-header.eps', Buffer.concat([hdr, ps]), {
    refusal: 'eps-postscript',
    sniff: null,
  });

  const ai8 =
    '%!PS-Adobe-3.0 \n%%Creator: Adobe Illustrator(TM) 8.0\n%%For: (pattern room)\n%%BoundingBox: 0 0 595 842\n%AI5_FileFormat 4.0\n%%EndComments\n' +
    '%%BeginProlog\n%%EndProlog\n%%BeginSetup\n%%EndSetup\n0 A\n100 100 m\n400 100 L\n400 700 L\nS\n%%PageTrailer\n%%Trailer\n%%EOF\n';
  write('illustrator8-postscript.ai', ai8, { refusal: 'ai-postscript', sniff: null });

  const pdf = minimalPdf();
  write('pdf-compatible.ai', pdf, { routeAi: true, sniff: 'pdf', kind: 'ai', pdfOffset: 0 });
  const wrapper = '%!PS-Adobe-3.0\n%%Creator: Adobe Illustrator(R) 24.0\n%%EndComments\n';
  write('ps-wrapped-pdf.ai', Buffer.concat([Buffer.from(wrapper, 'latin1'), pdf]), {
    routeAi: true,
    sniff: 'pdf',
    kind: 'ai',
    pdfOffset: wrapper.length,
  });

  // Seeded garbage (xorshift), named as a plot file.
  let x = 0x9e3779b9;
  const g = Buffer.alloc(4096);
  for (let i = 0; i < g.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    g[i] = x & 0xff;
  }
  write('binary-garbage.plt', g, { refusal: 'not-hpgl', sniff: null, adapter: 'hpgl' });

  write('not-really.svg', '<!DOCTYPE html>\n<html><body><p>pattern</p></body></html>\n', {
    refusal: 'not-svg',
    sniff: null,
    adapter: 'svg',
  });
  write('pe-malformed.plt', 'IN;SP1;PE<=\x40\x41;PU;\n', {
    refusal: 'hpgl-pe-malformed',
    sniff: 'hpgl',
    adapter: 'hpgl',
  });
}

function minimalPdf() {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /PieceInfo << /Illustrator << /Private 5 0 R >> >> >>',
    null,
    '<< /AIMetaData 6 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  const content = '0 0 0 RG 1 w 100 100 m 400 100 l 400 700 l S\n';
  objs[3] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;
  let out = '%PDF-1.6\n%\xe2\xe3\xcf\xd3\n';
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offs) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

writeFileSync(resolve(OUT, 'f12-truth.json'), JSON.stringify(truth, null, 1));
console.log(`wrote ${Object.keys(truth.fixtures).length} fixtures + f12-truth.json → ${OUT}`);
