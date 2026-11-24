const CELL = 3;

export class Grid {
  g = new Map();
  seg = []; // ax ay bx by
  tag = [];
  add(a, b, tag) {
    const i = this.tag.length;
    this.seg.push(a.x, a.y, b.x, b.y);
    this.tag.push(tag);
    const x0 = Math.floor(Math.min(a.x, b.x) / CELL), x1 = Math.floor(Math.max(a.x, b.x) / CELL);
    const y0 = Math.floor(Math.min(a.y, b.y) / CELL), y1 = Math.floor(Math.max(a.y, b.y) / CELL);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4000) {
      // a very long segment: walk it instead of filling its bounding box
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / CELL) + 1;
      const seen = new Set();
      for (let k = 0; k <= n; k++) {
        const gx = Math.floor((a.x + ((b.x - a.x) * k) / n) / CELL), gy = Math.floor((a.y + ((b.y - a.y) * k) / n) / CELL);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const key = `${gx + dx},${gy + dy}`;
          if (seen.has(key)) continue;
          seen.add(key);
          (this.g.get(key) ?? this.g.set(key, []).get(key)).push(i);
        }
      }
      return;
    }
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const key = `${gx},${gy}`;
      (this.g.get(key) ?? this.g.set(key, []).get(key)).push(i);
    }
  }
  /** every tag within r of p, with its distance */
  near(px, py, r) {
    const best = new Map();
    for (let gx = Math.floor((px - r) / CELL); gx <= Math.floor((px + r) / CELL); gx++)
      for (let gy = Math.floor((py - r) / CELL); gy <= Math.floor((py + r) / CELL); gy++)
        for (const i of this.g.get(`${gx},${gy}`) ?? []) {
          const ax = this.seg[i * 4], ay = this.seg[i * 4 + 1], bx = this.seg[i * 4 + 2], by = this.seg[i * 4 + 3];
          const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
          const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
          const d = Math.hypot(ax + t * dx - px, ay + t * dy - py);
          if (d <= r && d < (best.get(this.tag[i]) ?? Infinity)) best.set(this.tag[i], d);
        }
    return best;
  }
}

