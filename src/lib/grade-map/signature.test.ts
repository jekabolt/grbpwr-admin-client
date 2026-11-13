import { describe, expect, it } from 'vitest';

import {
  contourMeasures,
  contourSignature,
  decodeContourSignature,
  sameContourSignature,
  type SigPt,
} from './signature';

// A front-panel-like contour in mm: straight edges plus a densely sampled armhole curve.
function panel(): SigPt[] {
  const out: SigPt[] = [
    { x: 12.3, y: 40.7 },
    { x: 312.6, y: 40.7 },
    { x: 330.2, y: 250.1 },
  ];
  const c = { x: 330.2, y: 250.1 };
  const k = { x: 300, y: 330 };
  const d = { x: 150.4, y: 330.9 };
  for (let i = 1; i < 40; i++) {
    const t = i / 40;
    out.push({
      x: (1 - t) ** 2 * c.x + 2 * (1 - t) * t * k.x + t * t * d.x,
      y: (1 - t) ** 2 * c.y + 2 * (1 - t) * t * k.y + t * t * d.y,
    });
  }
  out.push(d, { x: 60.5, y: 420.2 }, { x: 12.3, y: 300.4 });
  return out;
}

// Deterministic pseudo-random jitter in [-amp, amp].
function jitter(points: SigPt[], amp: number, seed = 7): SigPt[] {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return (s / 2147483648) * 2 - 1;
  };
  return points.map((p) => ({ x: p.x + rnd() * amp, y: p.y + rnd() * amp }));
}

describe('contour signature', () => {
  const base = panel();
  const sig = contourSignature(base)!;

  it('is short, versioned and decodable', () => {
    expect(sig.startsWith('v1:')).toBe(true);
    expect(sig.length).toBeLessThanOrEqual(64);
    const m = decodeContourSignature(sig)!;
    const exact = contourMeasures(base)!;
    expect(Math.abs(m[0] - exact[0])).toBeLessThanOrEqual(0.5);
    for (let i = 1; i < m.length; i++) expect(Math.abs(m[i] - exact[i])).toBeLessThanOrEqual(0.03);
  });

  it('does not depend on the start vertex or the direction', () => {
    for (const start of [1, 5, 17, base.length - 1]) {
      const rotated = [...base.slice(start), ...base.slice(0, start)];
      expect(contourSignature(rotated)).toBe(sig);
      expect(contourSignature([...rotated].reverse())).toBe(sig);
    }
    expect(contourSignature([...base, base[0]])).toBe(sig);
  });

  it('matches through 0.04 mm jitter and 0.1 mm rounding', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(sameContourSignature(sig, contourSignature(jitter(base, 0.04, seed))!)).toBe(true);
    }
    const rounded = base.map((p) => ({
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
    }));
    expect(sameContourSignature(sig, contourSignature(rounded)!)).toBe(true);
  });

  it('a coarse rectangle (long edges: the noisiest area) matches through rounding + jitter', () => {
    const rect = [
      { x: 100.04, y: 50.06 },
      { x: 500.02, y: 50.01 },
      { x: 500.07, y: 650.03 },
      { x: 100.01, y: 650.08 },
    ];
    const rs = contourSignature(rect)!;
    for (let seed = 1; seed <= 50; seed++) {
      const noisy = jitter(
        rect.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })),
        0.04,
        seed,
      );
      expect(sameContourSignature(rs, contourSignature(noisy)!), `seed ${seed}`).toBe(true);
    }
  });

  it('changes when one corner moves 2 mm, in any direction', () => {
    // The corners between straight edges (index 2 is where the dense curve starts: one sample of a
    // curve moved alone is a 2 mm spike a few mm wide, below what twelve region measures can see).
    const corners = [0, 1, base.length - 2, base.length - 1];
    for (const i of corners) {
      for (const [dx, dy] of [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
        [1.42, 1.42],
        [-1.42, 1.42],
      ]) {
        const moved = base.map((p, j) => (j === i ? { x: p.x + dx, y: p.y + dy } : p));
        expect(
          sameContourSignature(sig, contourSignature(moved)!),
          `corner ${i} by ${dx},${dy}`,
        ).toBe(false);
      }
    }
  });

  it('changes when a stretch of the contour moves 0.5 mm', () => {
    const curve = base.map((p, j) => (j >= 3 && j <= 41 ? { x: p.x + 0.5, y: p.y + 0.5 } : p));
    const hem = base.map((p, j) => (j <= 1 ? { x: p.x, y: p.y + 0.5 } : p));
    expect(sameContourSignature(sig, contourSignature(curve)!)).toBe(false);
    expect(sameContourSignature(sig, contourSignature(hem)!)).toBe(false);
  });

  it('changes when the piece moves in its frame (the markup frame)', () => {
    const shifted = base.map((p) => ({ x: p.x + 1, y: p.y }));
    expect(sameContourSignature(sig, contourSignature(shifted)!)).toBe(false);
  });

  it('refuses degenerate contours and unreadable signatures', () => {
    expect(contourSignature([])).toBeNull();
    expect(
      contourSignature([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBeNull();
    expect(sameContourSignature('v0:abc', 'v0:abc')).toBe(false);
    expect(sameContourSignature(sig, 'v1:####')).toBe(false);
  });
});
