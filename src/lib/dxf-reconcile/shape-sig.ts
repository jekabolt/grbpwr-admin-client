// Подпись формы детали и стоимость пары «старый блок ↔ новый блок» на ОДНОМ размере.
//
// Подпись: площадь, периметр, габарит (см), надсечки (слой 4 AAMA) и контур в единичном квадрате
// габарита — тот же кадр, что у lib/seams/frame.ts. Сравнение: 64 точки через равные доли длины,
// кадры asis/rot180/mirrorU/mirrorV тем же `inFrame`, что у переноса швов, 64 сдвига начала обхода
// и затем доводка фазы на долю шага — экспорт волен начать контур с любой вершины и отзеркалить
// деталь, и это та же деталь, а не «другая форма» на полшага выборки.
//
// Форма = rms точек в единичном квадрате + L1 turning function (угол хорды между соседними
// точками) / π. Габарит по осям (dW/dH) в форму не входит — единичный квадрат его снимает, — он
// в отдельных членах: ×1.10 по ширине даёт dW = 0.10 при форме ≈ 0.
//
// Стоимость (01-PLAN §2.1): 0.5·форма + 0.3·|ΔS|/S + 0.2·|ΔP|/P + 0.03·|Δнадсечек|.
import { FRAMES, inFrame, rmsFit } from 'lib/seams/frame';
import type { Frame } from 'lib/seams/types';
import type { PieceDTO } from 'lib/nesting/types';

import type { ShapeDelta } from './types';

type Pt2 = [number, number];

export const SAMPLES = 64;
/** Доводка фазы: столько долей шага выборки пробуется вокруг лучшего сдвига. */
const PHASES = 16;
/** Слой надсечек AAMA/ASTM. */
export const NOTCH_LAYER = '4';

export type ShapeSig = {
  areaCm2: number;
  perimCm: number;
  w: number;
  h: number;
  notches: number;
  /** вершины контура в единичном квадрате габарита, CCW */
  ring: Pt2[];
};

const dist = (a: Pt2, b: Pt2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function areaOf(pts: readonly Pt2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

function perimOf(pts: readonly Pt2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length]);
  return s;
}

function notchCount(p: PieceDTO): number {
  const seen = new Set<string>();
  for (const path of p.inner ?? []) {
    if ((path.layer ?? '').trim() !== NOTCH_LAYER || path.pts.length === 0) continue;
    let x = 0;
    let y = 0;
    for (const q of path.pts) {
      x += q.x;
      y += q.y;
    }
    seen.add(`${Math.round((x / path.pts.length) * 10)}:${Math.round((y / path.pts.length) * 10)}`);
  }
  return seen.size;
}

const sigCache = new WeakMap<PieceDTO, ShapeSig>();

export function shapeSigOf(p: PieceDTO): ShapeSig {
  const hit = sigCache.get(p);
  if (hit) return hit;
  let pts: Pt2[] = (p.poly ?? []).map((q) => [q.x, q.y]);
  if (pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 1e-9) pts.pop();
  if (areaOf(pts) < 0) pts = pts.reverse();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const w = pts.length ? maxX - minX : 0;
  const h = pts.length ? maxY - minY : 0;
  const ring: Pt2[] = pts.map(([x, y]) => [w > 0 ? (x - minX) / w : 0, h > 0 ? (y - minY) / h : 0]);
  const sig = {
    areaCm2: Math.abs(areaOf(pts)),
    perimCm: perimOf(pts),
    w,
    h,
    notches: notchCount(p),
    ring,
  };
  sigCache.set(p, sig);
  return sig;
}

/** Подпись, растянутая на множитель единиц (весь лист ×10 и т.п.). Контур в квадрате не меняется. */
export function scaleSig(s: ShapeSig, k: number): ShapeSig {
  if (k === 1) return s;
  return { ...s, areaCm2: s.areaCm2 * k * k, perimCm: s.perimCm * k, w: s.w * k, h: s.h * k };
}

/** n точек через равные доли длины замкнутого контура, начиная с доли `phase` шага от вершины 0. */
function resample(ring: readonly Pt2[], n: number, phase: number): Pt2[] {
  const m = ring.length;
  if (m < 3) return [];
  const seg: number[] = [];
  let L = 0;
  for (let i = 0; i < m; i++) {
    const l = dist(ring[i], ring[(i + 1) % m]);
    seg.push(l);
    L += l;
  }
  if (L <= 0) return [];
  const out: Pt2[] = [];
  let k = 0;
  let acc = 0;
  for (let j = 0; j < n; j++) {
    let target = (L * (j + phase)) / n;
    if (target < 0) target += L;
    if (target < acc) {
      k = 0;
      acc = 0;
    }
    while (k < m - 1 && acc + seg[k] < target) {
      acc += seg[k];
      k++;
    }
    const a = ring[k];
    const b = ring[(k + 1) % m];
    const t = seg[k] > 0 ? Math.min(1, Math.max(0, (target - acc) / seg[k])) : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

const wrapPi = (a: number) => {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x < -Math.PI) x += 2 * Math.PI;
  return x;
};

function chordAngles(pts: readonly Pt2[]): number[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    return Math.atan2(q[1] - p[1], q[0] - p[0]);
  });
}

function formOf(a: readonly Pt2[], aTurn: readonly number[], b: readonly Pt2[], shift: number) {
  const n = a.length;
  const shifted: Pt2[] = new Array(n);
  for (let i = 0; i < n; i++) shifted[i] = b[(i + shift) % n];
  const rms = rmsFit(a, shifted);
  const bTurn = chordAngles(shifted);
  let l1 = 0;
  for (let i = 0; i < n; i++) l1 += Math.abs(wrapPi(aTurn[i] - bTurn[i]));
  const turnL1 = l1 / n / Math.PI;
  return { rms, turnL1, form: rms + turnL1 };
}

const rel = (a: number, b: number) => (a > 0 ? (b - a) / a : b > 0 ? 1 : 0);

export type SigCompare = ShapeDelta & {
  /** форма без размеров: rms + turning */
  form: number;
  rms: number;
  turnL1: number;
};

/**
 * Лучшее совмещение b с a. Перебор в фиксированном порядке (кадр, сдвиг, фаза), побеждает строго
 * меньшая форма — при равенстве asis и меньший сдвиг: результат не зависит от того, что и в каком
 * порядке сравнивали раньше.
 */
export function compareSigs(a: ShapeSig, b: ShapeSig, size = ''): SigCompare {
  const n = SAMPLES;
  const as = resample(a.ring, n, 0);
  let best = { frame: 'asis' as Frame, shift: 0, phase: 0, rms: 1, turnL1: 1, form: Infinity };
  if (as.length === n && b.ring.length >= 3) {
    const aTurn = chordAngles(as);
    for (const frame of FRAMES) {
      const ring = inFrame(b.ring, frame) as Pt2[];
      const bs = resample(ring, n, 0);
      let fb = { frame, shift: 0, phase: 0, rms: 1, turnL1: 1, form: Infinity };
      for (let shift = 0; shift < n; shift++) {
        const f = formOf(as, aTurn, bs, shift);
        if (f.form < fb.form - 1e-12) fb = { frame, shift, phase: 0, ...f };
      }
      // Доводка фазы вокруг лучшего сдвига КАЖДОГО кадра: на нулевой фазе симметричная деталь
      // может проиграть зеркалу полшага выборки, а это не повод считать её отражённой.
      for (let k = 1; k < PHASES; k++) {
        const phase = k / PHASES - 0.5;
        const ps = resample(ring, n, phase);
        for (const shift of [(fb.shift + n - 1) % n, fb.shift, (fb.shift + 1) % n]) {
          const f = formOf(as, aTurn, ps, shift);
          if (f.form < fb.form - 1e-12) fb = { ...fb, shift, phase, ...f };
        }
      }
      if (fb.form < best.form - 1e-9) best = fb;
    }
  }
  const dArea = rel(a.areaCm2, b.areaCm2);
  const dPerim = rel(a.perimCm, b.perimCm);
  const dNotches = b.notches - a.notches;
  const form = Number.isFinite(best.form) ? best.form : 1;
  const cost =
    0.5 * form + 0.3 * Math.abs(dArea) + 0.2 * Math.abs(dPerim) + 0.03 * Math.abs(dNotches);
  return {
    cost,
    size,
    dArea,
    dPerim,
    dW: rel(a.w, b.w),
    dH: rel(a.h, b.h),
    dNotches,
    frame: best.frame,
    form,
    rms: best.rms,
    turnL1: best.turnL1,
  };
}
