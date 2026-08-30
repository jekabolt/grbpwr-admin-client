#!/usr/bin/env node
// CURVES IN THE STROKE MODEL, AND THE SVG THAT BRINGS THEM IN.
//
// Four claims are measured here, and each one is a way the feature could be quietly wrong:
//
//  1. EVERY SEGMENT TYPE IS READ, absolute and relative, with implicit repeats, glued numbers and
//     unseparated arc flags. A path grammar that reads nine commands out of ten does not fail — it
//     imports a drawing with a piece missing.
//  2. WHAT IS NOT UNDERSTOOD IS REFUSED. The probe asserts refusals as hard as it asserts successes,
//     because the failure this task exists to prevent is «loaded fine» over a lost line.
//  3. AN ARC IS CONVERTED HONESTLY, AND THAT IS MEASURED AGAINST GEOMETRY THIS FILE COMPUTES ITSELF
//     — a circle whose centre and radius are known by construction, checked by radius, by length and
//     by area from points sampled here. Asking the converter to confirm its own arc would agree with
//     its own defect; this repository has been bitten by exactly that with a polygon library.
//  4. A LAYER SAVED BEFORE ANY OF THIS STILL READS AND STILL WRITES THE SAME BYTES. Backward
//     compatibility is asserted as a string comparison, not as a shrug.
//
//   node scripts/svg-import-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const modals = resolve(root, 'src/components/managers/tech-card/components/design/modals');
const outfile = resolve(tmpdir(), `svg-import-${process.pid}.mjs`);

await build({
  stdin: {
    contents: `export * from './svg-import';\nexport * from './vector-strokes';\n`,
    resolveDir: modals,
    sourcefile: 'probe-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});

const {
  importSvg,
  parsePathData,
  arcToCubics,
  readLayer,
  writeLayer,
  strokeGeometry,
  strokePolyline,
  hasSegments,
  STITCHES,
  FORMAT_VERSION,
} = await import(pathToFileURL(outfile).href);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ── INDEPENDENT ARITHMETIC ─────────────────────────────────────────────────────────────────────
//
// Written HERE, on purpose, and not imported. These four lines are the measuring instrument; taking
// them from the module under test would make every measurement below a tautology.
const cubic = (p0, c1, c2, p3, t) => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
  };
};

/** Every sampled point of a parsed subpath, in the subpath's own coordinates. */
function samplePath(sub, steps = 400) {
  const out = [{ x: sub.pts[0][0] ?? sub.pts[0].x, y: sub.pts[0][1] ?? sub.pts[0].y }];
  const pt = (p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p);
  for (let i = 0; i < sub.pts.length - 1; i++) {
    const a = pt(sub.pts[i]);
    const b = pt(sub.pts[i + 1]);
    const s = sub.segs[i];
    if (!s) {
      out.push(b);
      continue;
    }
    for (let k = 1; k <= steps; k++) {
      out.push(cubic(a, { x: s[0], y: s[1] }, { x: s[2], y: s[3] }, b, k / steps));
    }
  }
  return out;
}

const polylineLength = (pts) => {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) sum += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return sum;
};

/** Shoelace area of a closed loop of sampled points. */
const shoelace = (pts) => {
  let a2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a2 += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a2) / 2;
};

const ok = (r, label) => {
  if (r && r.ok !== false && !('ok' in r && r.ok === false)) return r;
  console.error(`✗ ${label} — refused: ${r?.reason ?? 'unknown'}`);
  fail++;
  return null;
};

const parsed = (d, label) => {
  const r = parsePathData(d);
  if (r.subs) return r.subs;
  console.error(`✗ ${label} — refused: ${r.reason}`);
  fail++;
  return null;
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE PATH GRAMMAR — every command, both cases
// ═══════════════════════════════════════════════════════════════════════════════════════════════

{
  const subs = parsed('M 10 20 L 30 40', 'absolute line');
  check('M/L: one subpath, two anchors', subs?.length === 1 && subs[0].pts.length === 2);
  check('M/L: coordinates land', near(subs[0].pts[1].x, 30) && near(subs[0].pts[1].y, 40));
  check('M/L: the interval is straight', subs[0].segs[0] === null);
}

{
  // Relative, glued decimals, no separators before a minus, an exponent, and implicit repeats.
  const subs = parsed('m10 10l10 0 0 10M.5.5L-1-1 1e2 2E1', 'relative and glued');
  check('m/l: relative move and line', near(subs[0].pts[0].x, 10) && near(subs[0].pts[1].x, 20));
  check('l repeats implicitly', subs[0].pts.length === 3 && near(subs[0].pts[2].y, 20));
  check('glued decimals «.5.5» are two numbers', near(subs[1].pts[0].x, 0.5) && near(subs[1].pts[0].y, 0.5));
  check('«-1-1» is two numbers', near(subs[1].pts[1].x, -1) && near(subs[1].pts[1].y, -1));
  check('exponents parse', near(subs[1].pts[2].x, 100) && near(subs[1].pts[2].y, 20));
}

{
  const subs = parsed('M0 0 H50 V50 h-25 v-25', 'H/V');
  const p = subs[0].pts;
  check('H/V/h/v walk the box', p.length === 5 && near(p[2].x, 50) && near(p[2].y, 50) && near(p[4].x, 25) && near(p[4].y, 25));
  check('H/V produce straight intervals', subs[0].segs.every((s) => s === null));
}

{
  const subs = parsed('M0 0 C10 0 20 10 20 20', 'C');
  check('C stores its own control points', subs[0].segs[0] && near(subs[0].segs[0][0], 10) && near(subs[0].segs[0][3], 10));
  const rel = parsed('M0 0 c10 0 20 10 20 20', 'c');
  check('c is the same curve as C', JSON.stringify(rel[0]) === JSON.stringify(subs[0]));
}

{
  // S reflects the previous cubic's second control point about the current point.
  const subs = parsed('M0 0 C10 0 20 10 20 20 S40 40 40 20', 'S');
  const s = subs[0].segs[1];
  check('S reflects the previous handle', s && near(s[0], 20) && near(s[1], 30), JSON.stringify(s));
  const first = parsed('M0 0 S10 10 20 20', 'S with nothing before it');
  check('S with no curve before it starts at the current point', near(first[0].segs[0][0], 0) && near(first[0].segs[0][1], 0));
  const relS = parsed('M0 0 C10 0 20 10 20 20 s20 20 20 0', 's');
  check('s equals S', JSON.stringify(relS[0].segs[1]) === JSON.stringify(s));
}

{
  // A quadratic raised to a cubic is EXACT — the probe checks the raise by evaluating both.
  const subs = parsed('M0 0 Q50 100 100 0', 'Q');
  const seg = subs[0].segs[0];
  const p0 = { x: 0, y: 0 };
  const p2 = { x: 100, y: 0 };
  const q = { x: 50, y: 100 };
  let worst = 0;
  for (let k = 0; k <= 100; k++) {
    const t = k / 100;
    const u = 1 - t;
    const truth = {
      x: u * u * p0.x + 2 * u * t * q.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * q.y + t * t * p2.y,
    };
    const got = cubic(p0, { x: seg[0], y: seg[1] }, { x: seg[2], y: seg[3] }, p2, t);
    worst = Math.max(worst, Math.hypot(truth.x - got.x, truth.y - got.y));
  }
  check('Q raised to a cubic is the same curve at every t', worst < 1e-12, `worst ${worst}`);

  const t = parsed('M0 0 Q50 100 100 0 T200 0', 'T');
  const ts = t[0].segs[1];
  // T's implied quadratic control is the reflection of (50,100) about (100,0) = (150,-100);
  // raised: c1 = p0 + ⅔(q−p0) = (100,0) + ⅔(50,−100) = (133.333, −66.667).
  check('T reflects the previous quadratic handle', near(ts[0], 100 + (2 / 3) * 50, 1e-9) && near(ts[1], (2 / 3) * -100, 1e-9), JSON.stringify(ts));
}

{
  const subs = parsed('M10 10 L20 10 L20 20 Z', 'Z');
  check('Z closes back to the subpath start', subs[0].pts.length === 4 && near(subs[0].pts[3].x, 10) && near(subs[0].pts[3].y, 10));
  const after = parsed('M10 10 L20 10 Z L30 30', 'a command after Z');
  check('after Z a new subpath starts at the first point', after.length === 2 && near(after[1].pts[0].x, 10) && near(after[1].pts[1].x, 30));
}

{
  // Unseparated arc flags: «a1 1 0 011 1» is rx=1 ry=1 rot=0 large=0 sweep=1 x=1 y=1.
  const subs = parsed('M0 0a1 1 0 011 1', 'glued arc flags');
  check('glued arc flags parse', subs && subs.length === 1 && near(subs[0].pts[1].x, 1) && near(subs[0].pts[1].y, 1));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2 · REFUSALS — measured as hard as the successes
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const refusedPath = (d, label) => {
  const r = parsePathData(d);
  check(`refuses: ${label}`, r.ok === false && typeof r.reason === 'string' && r.reason.length > 10, JSON.stringify(r).slice(0, 120));
};

refusedPath('M0 0 B10 10', 'an unknown path command');
refusedPath('M0 0 C1 1 2 2', 'a cubic missing its endpoint');
refusedPath('M0 0 A50 50 0 1 1 100', 'an arc missing its final coordinate');
refusedPath('M0 0 A50 50 0 2 1 100 0', 'an arc flag that is neither 0 nor 1');
refusedPath('L10 10', 'a path that does not begin with a move');
refusedPath('M0 0 Z 5 5', 'a number after the close of a subpath');
refusedPath('M0 0 L', 'a line with no coordinates');

const svg = (body, attrs = 'viewBox="0 0 100 100"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

// A REFUSAL HAS TO BE THE REFUSAL IT CLAIMS. `naming` is the word that must appear in the reason —
// without it a file refused for the wrong cause («nothing drawable here») passes for a file refused
// for the right one, and the check stops measuring anything. Every case below is also wrapped in a
// file that WOULD import: an element that refuses only because it happens to be alone in the
// document proves nothing about whether the importer noticed it.
const GOOD = '<path d="M0 0L50 50"/>';
const refusedDoc = (text, label, naming) => {
  const r = importSvg(text);
  const named = !naming || (r.reason ?? '').toLowerCase().includes(naming.toLowerCase());
  check(`refuses: ${label}`, r.ok === false && typeof r.reason === 'string' && r.reason.length > 10 && named, JSON.stringify(r).slice(0, 200));
  return r;
};

refusedDoc(svg(`${GOOD}<text x="10" y="10">FRONT</text>`), 'a text element beside a good path', 'text');
refusedDoc(svg(`${GOOD}<use href="#a"/>`), 'a use instance beside a good path', 'use');
refusedDoc(svg(`${GOOD}<switch><path d="M0 0L1 1"/></switch>`), 'a switch beside a good path', 'switch');
refusedDoc(svg(`${GOOD}<blorp/>`), 'an element nobody has heard of, beside a good path', 'blorp');
refusedDoc(svg(`${GOOD}<foreignObject width="10" height="10"/>`), 'a foreignObject beside a good path', 'foreignobject');
refusedDoc(svg(`${GOOD}<animate attributeName="x"/>`), 'an animation beside a good path', 'animation');
refusedDoc(svg(`${GOOD}<path d="M0 0L1 1" transform="warp(3)"/>`), 'a transform function that does not exist', 'transform');
refusedDoc(svg(`${GOOD}<g transform="skew(3)"><path d="M0 0L1 1"/></g>`), 'a transform on a group that does not exist', 'transform');
refusedDoc(svg(GOOD, 'width="50%" height="50%"'), 'a file with no frame', 'viewbox');
refusedDoc(svg(`<svg viewBox="0 0 10 10">${GOOD}</svg>`), 'a nested svg', 'nest');
refusedDoc(svg(`${GOOD}<path d="M0 0 L400 400"/>`), 'geometry outside the artboard', 'artboard');
refusedDoc('<html><body>not a drawing</body></html>', 'a file that is not an SVG at all', 'not an SVG');
refusedDoc(svg(''), 'a file with nothing drawable in it', 'nothing drawable');
refusedDoc(svg(`${GOOD}<polyline points="1 2 3"/>`), 'a polyline with half a point', 'polyline');
refusedDoc(svg(`${GOOD}<path d="M0 0 B10 10"/>`), 'a path command nobody has heard of', 'command');

// A REFUSAL IS WHOLE, NOT PARTIAL: one bad element must not import the good ones beside it.
{
  const r = importSvg(svg('<path d="M0 0L50 50"/><text x="1" y="1">x</text><path d="M0 50L50 0"/>'));
  check('one refused element refuses the whole file', r.ok === false && !('strokes' in r));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3 · ARCS — measured against geometry this file computes itself
// ═══════════════════════════════════════════════════════════════════════════════════════════════

{
  // A QUARTER CIRCLE WHOSE CENTRE AND RADIUS ARE KNOWN BY CONSTRUCTION, not by the converter:
  // from (100,0) to (0,100) the sweep-positive small arc of r=100 is centred on the origin.
  const subs = parsed('M100 0 A100 100 0 0 1 0 100', 'quarter circle');
  const pts = samplePath(subs[0], 2000);
  let worstR = 0;
  for (const p of pts) worstR = Math.max(worstR, Math.abs(Math.hypot(p.x, p.y) - 100));
  check('quarter circle: every point sits on r = 100', worstR < 0.03, `worst radial error ${worstR.toExponential(3)} of 100`);
  check('quarter circle: the error is the textbook 2.7e-4·r or better', worstR / 100 < 3e-4, `${(worstR / 100).toExponential(3)}·r`);

  // LENGTH AND AREA ARE MEASURED WITH A SIGN, NOT JUST A SIZE, and the bounds below are the ones the
  // textbook construction earns rather than round numbers picked to make the probe green. The cubic
  // bows OUTWARD of the true arc by at most 2.7·10⁻⁴·r, so it must come out slightly LONGER and
  // enclose slightly MORE area — and by an amount that follows from that same figure: length by
  // about half of it (the average deviation, not the peak), area by about twice it (a shell of that
  // thickness around a quarter of the circumference). Both are asserted from BELOW as well as from
  // above, so a construction that is merely different — a chord, a polyline, a wrong handle length —
  // fails here instead of sliding under a generous ceiling.
  const len = polylineLength(pts);
  const truth = (Math.PI * 100) / 2;
  const lenErr = (len - truth) / truth;
  check('quarter circle: length is the true one, long by the textbook margin', lenErr > 0 && lenErr < 3e-4, `${len.toFixed(5)} against ${truth.toFixed(5)} (${lenErr.toExponential(2)})`);

  const area = shoelace([{ x: 0, y: 0 }, ...pts]);
  const areaTruth = (Math.PI * 100 * 100) / 4;
  const areaErr = (area - areaTruth) / areaTruth;
  check('quarter circle: swept area is πr²/4, over by the textbook margin', areaErr > 0 && areaErr < 6e-4, `${area.toFixed(3)} against ${areaTruth.toFixed(3)} (${areaErr.toExponential(2)})`);

  // POSITIVE CONTROL — the measurement has to be able to FAIL. A straight chord between the same
  // endpoints is what «approximate it with a polyline» looks like at its cheapest; if the length
  // test above cannot tell it from the arc, the test proves nothing about the arc either.
  const chord = Math.hypot(100, 100);
  check('the length test rejects a straight chord between the same endpoints', Math.abs(chord - truth) / truth > 3e-4, `chord ${chord.toFixed(4)} against ${truth.toFixed(4)}`);

  // EXACT EQUALITY, NOT «near». The last piece must end on the coordinate the FILE stated, not on
  // the ellipse point recomputed from the angle: those differ in the last bits, and the difference
  // is a hairline gap between this arc and whatever the file draws next — invisible until somebody
  // scales the drawing up. A tolerance here would let that regression through, so there is none.
  check('quarter circle: the stated endpoint is EXACT, to the bit', subs[0].pts[1].x === 0 && subs[0].pts[1].y === 100, `${subs[0].pts[1].x}, ${subs[0].pts[1].y}`);
  check('quarter circle: split into one cubic per quarter turn', subs[0].segs.length === 1);
}

{
  // A FULL CIRCLE as the <circle> element: r and centre known by construction.
  const r = ok(importSvg(svg('<circle cx="50" cy="50" r="40"/>')), 'circle element');
  const stroke = r.strokes[0];
  // Back out of the normalisation: the frame is 100×100, so a fraction times 100 is user units.
  const sub = { pts: stroke.pts.map(([x, y]) => ({ x: x * 100, y: y * 100 })), segs: stroke.segs.map((s) => (s ? [s[0] * 100, s[1] * 100, s[2] * 100, s[3] * 100] : null)) };
  const pts = samplePath(sub, 1000);
  let worstR = 0;
  for (const p of pts) worstR = Math.max(worstR, Math.abs(Math.hypot(p.x - 50, p.y - 50) - 40));
  check('circle: every point sits on r = 40', worstR / 40 < 3e-4, `worst ${(worstR / 40).toExponential(3)}·r`);
  const len = polylineLength(pts);
  check('circle: circumference matches 2πr', Math.abs(len - 2 * Math.PI * 40) / (2 * Math.PI * 40) < 3e-4, `${len.toFixed(4)} against ${(2 * Math.PI * 40).toFixed(4)}`);
  check('circle: area matches πr²', Math.abs(shoelace(pts) - Math.PI * 1600) / (Math.PI * 1600) < 6e-4, `${shoelace(pts).toFixed(3)} against ${(Math.PI * 1600).toFixed(3)}`);
  check('circle: four cubics, not a polygon', stroke.segs.filter(Boolean).length === 4, `${stroke.segs.filter(Boolean).length} curves`);
}

{
  // A ROTATED ELLIPSE, checked against its own implicit equation with a centre known a priori.
  const cx = 100, cy = 100, rx = 60, ry = 25, phi = 30 * (Math.PI / 180);
  const p0 = { x: cx + rx * Math.cos(phi), y: cy + rx * Math.sin(phi) };
  const p1 = { x: cx - rx * Math.cos(phi), y: cy - rx * Math.sin(phi) };
  const d = `M${p0.x} ${p0.y} A${rx} ${ry} 30 1 1 ${p1.x} ${p1.y} A${rx} ${ry} 30 1 1 ${p0.x} ${p0.y}`;
  const subs = parsed(d, 'rotated ellipse');
  const pts = samplePath(subs[0], 1000);
  let worst = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const X = dx * Math.cos(-phi) - dy * Math.sin(-phi);
    const Y = dx * Math.sin(-phi) + dy * Math.cos(-phi);
    // Radial deviation, not the raw implicit residual: a residual is unitless and hides its size.
    const k = Math.hypot(X / rx, Y / ry);
    worst = Math.max(worst, Math.abs(k - 1) * Math.min(rx, ry));
  }
  check('rotated ellipse: every point sits on it', worst / ry < 5e-4, `worst ${(worst / ry).toExponential(3)}·ry`);
  check('rotated ellipse: area matches πab', Math.abs(shoelace(pts) - Math.PI * rx * ry) / (Math.PI * rx * ry) < 6e-4, `${shoelace(pts).toFixed(2)} against ${(Math.PI * rx * ry).toFixed(2)}`);
}

{
  // The four flag combinations between the same endpoints, and the F.6.6 radius correction.
  const between = (large, sweep) => {
    const subs = parsed(`M0 0 A60 60 0 ${large} ${sweep} 100 0`, `arc ${large}${sweep}`);
    return samplePath(subs[0], 800);
  };
  const l0s0 = polylineLength(between(0, 0));
  const l1s0 = polylineLength(between(1, 0));
  const l0s1 = polylineLength(between(0, 1));
  const l1s1 = polylineLength(between(1, 1));
  check('large-arc chooses the long way round', l1s0 > l0s0 && l1s1 > l0s1, `${l0s0.toFixed(2)} / ${l1s0.toFixed(2)}`);
  check('the two sweeps are mirror images of equal length', near(l0s0, l0s1, 1e-6) && near(l1s0, l1s1, 1e-6));
  check('sweep puts the arc on the other side', Math.sign(between(0, 0)[400].y) === -Math.sign(between(0, 1)[400].y));
  check('the whole circle is accounted for', Math.abs(l0s0 + l1s0 - 2 * Math.PI * 60) / (2 * Math.PI * 60) < 3e-4, `${(l0s0 + l1s0).toFixed(4)} against ${(2 * Math.PI * 60).toFixed(4)}`);

  // F.6.6: radii too small to reach both ends are scaled up until they exactly reach — the result
  // is a semicircle of r = 50, whose length is known without asking the converter.
  const small = samplePath(parsed('M0 0 A10 10 0 0 1 100 0', 'undersized radii')[0], 800);
  check('undersized radii are scaled up to reach, not clipped', Math.abs(polylineLength(small) - Math.PI * 50) / (Math.PI * 50) < 3e-4, `${polylineLength(small).toFixed(4)} against ${(Math.PI * 50).toFixed(4)}`);

  const zero = parsed('M0 0 A0 50 0 0 1 100 0', 'zero radius');
  check('a zero radius is a straight line, as the specification says', zero[0].segs[0] === null && zero[0].pts.length === 2);

  const same = arcToCubics({ x: 5, y: 5 }, 20, 20, 0, 1, 1, { x: 5, y: 5 });
  check('an arc back to its own start is omitted entirely', same.length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4 · THE DOCUMENT — transforms, shapes, frames, normalisation
// ═══════════════════════════════════════════════════════════════════════════════════════════════

{
  const r = ok(importSvg(svg('<g transform="translate(10 20)"><path d="M0 0L10 0"/></g>')), 'translate');
  check('translate moves the line', near(r.strokes[0].pts[0][0], 0.1) && near(r.strokes[0].pts[0][1], 0.2));

  const nested = ok(importSvg(svg('<g transform="translate(10 0)"><g transform="scale(2)"><path d="M0 0L10 10"/></g></g>')), 'nested transforms');
  // scale first, then translate: (10,10) → (20,20) → (30,20), i.e. 0.3 / 0.2 of a 100-unit frame.
  check('transforms compose outermost-last', near(nested.strokes[0].pts[1][0], 0.3) && near(nested.strokes[0].pts[1][1], 0.2), JSON.stringify(nested.strokes[0].pts));

  const rot = ok(importSvg(svg('<path d="M0 0L10 0" transform="rotate(90 50 50)"/>')), 'rotate about a point');
  check('rotate about a centre lands where trigonometry says', near(rot.strokes[0].pts[0][0], 1) && near(rot.strokes[0].pts[0][1], 0), JSON.stringify(rot.strokes[0].pts[0]));

  const m = ok(importSvg(svg('<path d="M0 0C10 0 20 10 20 20" transform="matrix(2 0 0 2 5 5)"/>')), 'matrix on a curve');
  check('a matrix maps the control points, not a resampling', near(m.strokes[0].segs[0][0], 0.25) && near(m.strokes[0].segs[0][1], 0.05), JSON.stringify(m.strokes[0].segs[0]));
  check('a transformed curve is still one cubic', m.strokes[0].segs.length === 1);
}

{
  const r = ok(importSvg(svg('<defs><path d="M0 0L99 99"/></defs><path d="M0 0L50 50"/>')), 'defs are skipped');
  check('a path inside defs draws nothing and is not imported', r.strokes.length === 1 && near(r.strokes[0].pts[1][0], 0.5));

  const img = ok(importSvg(svg('<image href="http://x/y.png" x="0" y="0" width="100" height="100"/><path d="M0 0L50 50"/>')), 'image ignored');
  check('a placed image is ignored, and said so', img.strokes.length === 1 && img.notes.some((n) => n.includes('image')));

  const hid = ok(importSvg(svg('<path d="M0 0L9 9" display="none"/><path d="M0 0L50 50"/>')), 'hidden path');
  check('a hidden element is skipped, and said so', hid.strokes.length === 1 && hid.notes.some((n) => n.includes('hidden')));
}

{
  const r = ok(importSvg(svg('<rect x="10" y="10" width="80" height="40"/>')), 'rect');
  check('rect: four corners and a close', r.strokes[0].pts.length === 5 && r.strokes[0].segs.every((s) => s === null));
  const rounded = ok(importSvg(svg('<rect x="10" y="10" width="80" height="40" rx="10"/>')), 'rounded rect');
  check('rounded rect: four corner curves', rounded.strokes[0].segs.filter(Boolean).length === 4);
  const line = ok(importSvg(svg('<line x1="0" y1="0" x2="100" y2="100"/>')), 'line');
  check('line: two anchors corner to corner', line.strokes[0].pts.length === 2 && near(line.strokes[0].pts[1][0], 1));
  const poly = ok(importSvg(svg('<polygon points="0,0 100,0 100,100"/>')), 'polygon');
  check('polygon closes itself', poly.strokes[0].pts.length === 4 && near(poly.strokes[0].pts[3][0], 0));
}

{
  // NORMALISATION IS THE PROPERTY THAT LETS THE RASTER UNDERNEATH BE REPLACED. Two files drawing
  // the same shape at different scales must arrive as the same fractions.
  const small = ok(importSvg(svg('<path d="M25 25L75 50"/>', 'viewBox="0 0 100 100"')), 'small frame');
  const big = ok(importSvg(svg('<path d="M250 250L750 500"/>', 'viewBox="0 0 1000 1000"')), 'big frame');
  check('the same drawing at two scales normalises identically', JSON.stringify(small.strokes[0].pts) === JSON.stringify(big.strokes[0].pts), JSON.stringify(small.strokes[0].pts));
  check('every coordinate is a fraction of the frame', small.strokes[0].pts.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1));

  const offset = ok(importSvg(svg('<path d="M100 100L200 200"/>', 'viewBox="100 100 200 200"')), 'offset viewBox');
  check('a viewBox origin other than 0,0 is honoured', near(offset.strokes[0].pts[0][0], 0) && near(offset.strokes[0].pts[1][0], 0.5));

  const sized = ok(importSvg(svg('<path d="M0 0L40 20"/>', 'width="80" height="40"')), 'width/height instead of viewBox');
  check('a file with width and height but no viewBox still has a frame', near(sized.ratio, 2) && near(sized.strokes[0].pts[1][0], 0.5));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5 · BACKWARD COMPATIBILITY — a layer written before curves existed
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// A layer exactly as the previous bundle wrote it: version 1, no `segs` key anywhere.
const LEGACY =
  '{"v":1,"ratio":0.8,"strokes":[' +
  '{"tool":"line","brush":"lock","weight":"bold","dashed":false,"pts":[[0.1,0.2],[0.3,0.4]]},' +
  '{"tool":"freehand","brush":"cover","weight":"hairline","dashed":true,"pts":[[0.5,0.5],[0.6,0.55],[0.7,0.5]]}' +
  ']}';

{
  const doc = readLayer(LEGACY, 0.75);
  check('a legacy layer is readable', doc.unreadable === false && doc.strokes.length === 2);
  check('a legacy layer keeps its ratio', near(doc.ratio, 0.8));
  check('a legacy stroke has no segment list at all', doc.strokes.every((s) => s.segs === undefined));
  check('a legacy stroke keeps its stitch, weight and dash', doc.strokes[0].brush === 'lock' && doc.strokes[0].weight === 'bold' && doc.strokes[1].dashed === true);
  // THE STRING COMPARISON IS THE CLAIM: read then written, a legacy layer is the SAME BYTES.
  check('a legacy layer round-trips byte for byte', writeLayer(doc.strokes, doc.ratio) === LEGACY, writeLayer(doc.strokes, doc.ratio));
  check('a drawing with no curves is still written as v1', JSON.parse(writeLayer(doc.strokes, doc.ratio)).v === 1);
}

{
  // The drawn path of a legacy stroke is unchanged: two points give a straight L, three give the
  // Catmull-Rom cubics `inkPath` has always produced — recomputed here from the classic weights.
  const line = strokeGeometry({ tool: 'line', brush: 'plain', weight: 'thin', dashed: false, pts: [[0, 0], [0.5, 0.5]] }, 200, 200);
  check('a two-point legacy stroke still draws as one straight L', line.d === 'M0,0 L100,100', line.d);

  const pts = [[0.1, 0.1], [0.5, 0.4], [0.9, 0.1]].map(([x, y]) => ({ x: Math.round(x * 200 * 100) / 100, y: Math.round(y * 200 * 100) / 100 }));
  let expected = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    expected += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
  }
  const trace = strokeGeometry({ tool: 'freehand', brush: 'plain', weight: 'thin', dashed: false, pts: [[0.1, 0.1], [0.5, 0.4], [0.9, 0.1]] }, 200, 200);
  check('a legacy freehand stroke still draws its Catmull-Rom smoothing', trace.d === expected, `${trace.d} against ${expected}`);

  check('a legacy stroke hit-tests against its own anchors, unchanged', JSON.stringify(strokePolyline({ tool: 'line', brush: 'plain', weight: 'thin', dashed: false, pts: [[0, 0], [1, 1]] }, 10, 10)) === JSON.stringify([{ x: 0, y: 0 }, { x: 10, y: 10 }]));
}

{
  // A DOCUMENT THIS BUNDLE CANNOT LINE UP IS UNREADABLE, NOT THINNER — the writers must stop.
  const shortSegs = '{"v":2,"ratio":0.8,"strokes":[{"tool":"curve","brush":"plain","weight":"thin","dashed":false,"pts":[[0,0],[0.5,0.5],[1,1]],"segs":[null]}]}';
  check('a segment list of the wrong length makes the layer unreadable', readLayer(shortSegs, 0.8).unreadable === true);
  const badSeg = '{"v":2,"ratio":0.8,"strokes":[{"tool":"curve","brush":"plain","weight":"thin","dashed":false,"pts":[[0,0],[1,1]],"segs":[[1,2,3]]}]}';
  check('a segment that is not four numbers makes the layer unreadable', readLayer(badSeg, 0.8).unreadable === true);
  // A LOST ANCHOR IS THE SUBTLE ONE. On a polyline a malformed point has always been thrown away and
  // the line simply goes round it; on a curve the intervals after the gap would then describe the
  // wrong ones, and every curve past that point would be drawn somewhere nobody put it — silently,
  // and with the drawing still looking plausible.
  // The segment list is deliberately sized for the SURVIVING anchors, so that swallowing the lost
  // point would leave a document that lines up perfectly and describes the wrong curve. That is the
  // only version of this case worth testing: a mismatch the length check would catch anyway proves
  // nothing about the anchor guard.
  const lostAnchor = '{"v":2,"ratio":0.8,"strokes":[{"tool":"curve","brush":"plain","weight":"thin","dashed":false,"pts":[[0,0],"junk",[1,1]],"segs":[[0.1,0.1,0.2,0.2]]}]}';
  check('a lost anchor on a curved stroke makes the layer unreadable', readLayer(lostAnchor, 0.8).unreadable === true, JSON.stringify(readLayer(lostAnchor, 0.8)));
  // …and the SAME malformed point on a plain polyline is still simply skipped, as it always was.
  const lostOnPolyline = '{"v":1,"ratio":0.8,"strokes":[{"tool":"freehand","brush":"plain","weight":"thin","dashed":false,"pts":[[0,0],"junk",[1,1]]}]}';
  const skipped = readLayer(lostOnPolyline, 0.8);
  check('the same lost point on a legacy polyline is still just skipped', skipped.unreadable === false && skipped.strokes[0].pts.length === 2);
  check('a version from the future is still unreadable', readLayer('{"v":' + (FORMAT_VERSION + 1) + ',"ratio":0.8,"strokes":[]}', 0.8).unreadable === true);
  check('nonsense is unreadable, an empty blob is not', readLayer('{{{', 0.8).unreadable === true && readLayer('', 0.8).unreadable === false);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 6 · CURVES THROUGH THE WHOLE MACHINE — storage, drawing, hit-testing, the nine stitches
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const CURVE = {
  tool: 'curve',
  brush: 'plain',
  weight: 'thin',
  dashed: false,
  pts: [
    [0.1, 0.5],
    [0.9, 0.5],
  ],
  segs: [[0.3, 0.1, 0.7, 0.1]],
};

{
  const wire = writeLayer([CURVE], 0.8);
  check('a drawing that holds a curve is written as v2', JSON.parse(wire).v === FORMAT_VERSION);
  const back = readLayer(wire, 0.8);
  check('a curve survives the round trip', back.unreadable === false && JSON.stringify(back.strokes[0].segs) === JSON.stringify(CURVE.segs));
  check('a curve is not thinned on the way out', back.strokes[0].pts.length === CURVE.pts.length);

  // THE THINNING RULE IS THE ONE PLACE THE TWO SHAPES OF STROKE MUST PART WAYS, so both halves are
  // measured on a stroke long enough for it to matter — 300 anchors, well past the 240-point ceiling
  // a freehand trace is held to. A curve keeps every one: its anchors are the ends of stored cubics,
  // and dropping one without dropping the matching interval leaves the two lists describing
  // different shapes. A freehand trace of the same length must still be thinned, or the ceiling that
  // keeps a layer inside 512 KB has quietly stopped existing.
  const many = {
    tool: 'curve',
    brush: 'plain',
    weight: 'thin',
    dashed: false,
    pts: Array.from({ length: 300 }, (_, i) => [i / 299, 0.5 + 0.2 * Math.sin(i / 7)]),
    segs: Array.from({ length: 299 }, (_, i) => [i / 299 + 0.001, 0.5, i / 299 + 0.002, 0.5]),
  };
  const longBack = readLayer(writeLayer([many], 0.8), 0.8);
  // GUARDED BEFORE IT IS READ. A thinned curve comes back with its two lists out of step, which
  // `readLayer` correctly calls unreadable — and an unguarded `strokes[0].pts` would then throw and
  // report itself as a crash rather than as the failed claim it is.
  check('a 300-anchor curve is readable at all', longBack.unreadable === false && longBack.strokes.length === 1, JSON.stringify(longBack).slice(0, 120));
  check('a 300-anchor curve keeps every anchor', longBack.strokes[0]?.pts.length === 300, `${longBack.strokes[0]?.pts.length} anchors`);
  check('and every interval beside them', longBack.strokes[0]?.segs.length === 299, `${longBack.strokes[0]?.segs.length} intervals`);
  const longTrace = { tool: 'freehand', brush: 'plain', weight: 'thin', dashed: false, pts: many.pts };
  const traceBack = readLayer(writeLayer([longTrace], 0.8), 0.8);
  check('a 300-point freehand trace is STILL thinned to the ceiling', traceBack.strokes[0].pts.length <= 240, `${traceBack.strokes[0].pts.length} points`);
  check('hasSegments tells the two shapes of stroke apart', hasSegments(CURVE) === true && hasSegments({ ...CURVE, segs: undefined }) === false);

  // A control point outside the frame is legal and must NOT be clamped — clamping bends the curve.
  const reaching = { ...CURVE, segs: [[0.3, -0.4, 0.7, -0.4]] };
  const readBack = readLayer(writeLayer([reaching], 0.8), 0.8);
  check('a control point outside the frame survives storage', near(readBack.strokes[0].segs[0][1], -0.4), JSON.stringify(readBack.strokes[0].segs));
}

{
  const g = strokeGeometry(CURVE, 200, 200);
  check('a curve is drawn as a cubic, not as a chain of straight pieces', g.d.includes('C') && !g.d.includes('L'), g.d);
  check('the drawn path scales into the box', g.d.startsWith('M20,100') && g.d.endsWith('180,100'), g.d);

  // Hit-testing follows the CURVE, not the chord. The cubic above bulges to y ≈ 0.2 of the frame at
  // its middle; the chord sits at y = 0.5. A polyline of the anchors alone would miss it entirely.
  const poly = strokePolyline(CURVE, 1, 1);
  const mid = poly[Math.floor(poly.length / 2)];
  check('the hit-test polyline follows the bulge', Math.abs(mid.y - 0.5) > 0.2, `middle at y=${mid.y}`);
  check('the hit-test polyline starts and ends on the anchors', near(poly[0].x, 0.1) && near(poly[poly.length - 1].x, 0.9));
  // …and it is a faithful flattening: measured against this file's own cubic arithmetic.
  let worst = 0;
  for (const p of poly) {
    let best = Infinity;
    for (let k = 0; k <= 2000; k++) {
      const q = cubic({ x: 0.1, y: 0.5 }, { x: 0.3, y: 0.1 }, { x: 0.7, y: 0.1 }, { x: 0.9, y: 0.5 }, k / 2000);
      best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y));
    }
    worst = Math.max(worst, best);
  }
  check('every flattened point lies on the curve', worst < 1e-6, `worst ${worst.toExponential(3)}`);
}

{
  // THE NINE MACHINE KINDS MUST NOT NOTICE THE DIFFERENCE. Weight, dash rhythm and the second row
  // of a two-needle machine are stated about the PATH, so a cubic wears them exactly as a polyline.
  const flat = { tool: 'line', brush: 'plain', weight: 'thin', dashed: false, pts: [[0.1, 0.5], [0.9, 0.5]] };
  let same = 0;
  for (const s of STITCHES) {
    for (const weight of ['hairline', 'thin', 'bold']) {
      for (const dashed of [false, true]) {
        const a = strokeGeometry({ ...flat, brush: s.key, weight, dashed }, 200, 200);
        const b = strokeGeometry({ ...CURVE, brush: s.key, weight, dashed }, 200, 200);
        if (
          a.strokeWidth === b.strokeWidth &&
          a.dash === b.dash &&
          JSON.stringify(a.offsets) === JSON.stringify(b.offsets) &&
          b.d.includes('C')
        ) {
          same++;
        } else {
          check(`stitch ${s.key} (${weight}${dashed ? ', construction' : ''}) behaves the same on a curve`, false, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
        }
      }
    }
  }
  check('all nine stitches × three weights × dashed behave identically on a curve', same === STITCHES.length * 6, `${same} of ${STITCHES.length * 6}`);

  const two = strokeGeometry({ ...CURVE, brush: 'double' }, 200, 200);
  check('a two-needle machine still draws two rows over a curve', two.offsets.length === 2 && two.offsets[0] === 0 && two.offsets[1] > 0);

  // THE PEN-UP CONVENTION SURVIVES ON A CURVE. A duplicated anchor has always meant «the pen left
  // the paper here»; a curved stroke has to break the same way, or the drawn path would bridge the
  // gap with a line nobody drew. And the emitted `d` has to be a path — it is handed to `Path2D`
  // for the raster and written into the downloadable file, so it is fed back through this module's
  // own parser here rather than eyeballed.
  const penUp = {
    tool: 'curve',
    brush: 'plain',
    weight: 'thin',
    dashed: false,
    pts: [
      [0.1, 0.1],
      [0.4, 0.4],
      [0.4, 0.4],
      [0.6, 0.6],
      [0.9, 0.9],
    ],
    segs: [[0.2, 0.15, 0.3, 0.3], null, null, [0.7, 0.65, 0.8, 0.8]],
  };
  const gap = strokeGeometry(penUp, 200, 200);
  check('a lifted pen breaks a curved stroke into two subpaths', (gap.d.match(/M/g) ?? []).length === 2, gap.d);
  const reparsed = parsePathData(gap.d);
  check('the path this renderer emits parses as SVG path data', !!reparsed.subs && reparsed.subs.length === 2, JSON.stringify(reparsed).slice(0, 140));
}

{
  // THE ROUND TRIP THE MODAL PROMISES: our own downloaded SVG read back in. Geometry survives;
  // the machine kinds do not, and the notes say so rather than letting somebody assume otherwise.
  const { layerSvg } = await import(pathToFileURL(outfile).href);
  const file = layerSvg([CURVE], { width: 800, height: 1000 });
  const back = ok(importSvg(file), 'our own download read back');
  check('our own file comes back with its curve', back.strokes.length === 1 && back.strokes[0].segs.filter(Boolean).length === 1);
  check('and lands on the same fractions it left on', near(back.strokes[0].pts[0][0], 0.1, 1e-3) && near(back.strokes[0].pts[1][0], 0.9, 1e-3), JSON.stringify(back.strokes[0].pts));
  check('the notes state that the machine kind is not carried', back.notes.some((n) => n.includes('machine kind')));
}

console.log(`${pass} of ${pass + fail} checks passed`);
process.exit(fail === 0 ? 0 : 1);
