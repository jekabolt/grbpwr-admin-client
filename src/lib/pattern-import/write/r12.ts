// The secondary "CLO-AAMA R12" dialect (AC1009) — 10-CLO-DXF-FORMAT.md §1.9. Opt-in for
// AAMA/ASTM importers. Our own parser reads it, but drops POINT notches (K2 pitfall 2) and
// `mergeDxfSheets` refuses R12 — so the card path stays on R2000.

import type { PtMm } from '../types';
import type { PlannedBlock } from './plan';
import { GRAIN_SHAFT_MM } from './plan';
import { LABEL_DY, LABEL_HEIGHT, drillSquare, insertsOf, labelAnchor, labelLines } from './r2000';
import { type Tag, num, serialize, txt } from './format';

export function writeR12(
  blocks: readonly PlannedBlock[],
  meta: { styleName: string; createdAt: string; sampleSize: string },
): string {
  const T: Tag[] = [];
  const E = (c: number, v: string) => {
    T.push([c, v]);
  };
  E(0, 'SECTION');
  E(2, 'HEADER');
  E(9, '$ACADVER');
  E(1, 'AC1009');
  E(9, '$INSUNITS');
  E(70, '4');
  E(0, 'ENDSEC');
  E(0, 'SECTION');
  E(2, 'BLOCKS');
  const pl = (layer: string, pts: readonly PtMm[], closed: boolean) => {
    E(0, 'POLYLINE');
    E(8, layer);
    E(66, '1');
    E(70, closed ? '1' : '0');
    for (const p of pts) {
      E(0, 'VERTEX');
      E(8, layer);
      E(10, num(p.x));
      E(20, num(p.y));
    }
    E(0, 'SEQEND');
  };
  const text = (layer: string, p: PtMm, height: number, value: string) => {
    E(0, 'TEXT');
    E(8, layer);
    E(10, num(p.x));
    E(20, num(p.y));
    E(40, num(height));
    E(50, num(0));
    E(1, txt(value));
    E(7, 'STANDARD');
  };
  for (const b of blocks) {
    E(0, 'BLOCK');
    E(8, '1');
    E(2, txt(b.name));
    E(70, '64');
    E(10, num(0));
    E(20, num(0));
    pl('1', b.cut, true);
    if (b.grain) {
      // R12: a 2-point axis, 180 mm, no barb.
      const g = b.grain;
      const tip = { x: g.tail.x + GRAIN_SHAFT_MM * g.u.x, y: g.tail.y + GRAIN_SHAFT_MM * g.u.y };
      E(0, 'LINE');
      E(8, '7');
      E(10, num(g.tail.x));
      E(20, num(g.tail.y));
      E(11, num(tip.x));
      E(21, num(tip.y));
    }
    if (b.seam) pl('14', b.seam, true);
    for (const ip of b.internal) pl('8', ip.pts, ip.closed);
    for (const d of b.drills) pl('8', drillSquare(d), true);
    for (const n of b.notches) {
      E(0, 'POINT');
      E(8, '4');
      E(10, num(n.a.x));
      E(20, num(n.a.y));
      E(30, num(n.depthMm));
      E(39, num(0));
      E(50, num(((n.angleDeg % 360) + 360) % 360));
    }
    const mid = labelAnchor(b);
    labelLines(b).forEach((s, k) =>
      text(
        '1',
        { x: mid.x, y: mid.y + LABEL_DY[Math.min(k, LABEL_DY.length - 1)] },
        LABEL_HEIGHT,
        s,
      ),
    );
    E(0, 'ENDBLK');
  }
  E(0, 'ENDSEC');
  E(0, 'SECTION');
  E(2, 'ENTITIES');
  for (const ins of insertsOf(blocks)) {
    E(0, 'INSERT');
    E(8, '1');
    E(2, txt(ins.name));
    E(10, num(ins.x));
    E(20, num(0));
  }
  const d = new Date(meta.createdAt);
  const valid = !Number.isNaN(d.getTime());
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = valid
    ? `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`
    : '';
  const time = valid ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : '';
  for (const s of [
    `STYLE NAME: ${meta.styleName}`,
    `CREATION DATE: ${date}`,
    `CREATION TIME: ${time}`,
    'AUTHOR: GRBPWR',
    'PRODUCT: grbpwr pattern-import',
    'VERSION: 3',
    `SAMPLE SIZE: ${meta.sampleSize}`,
    'UNITS: METRIC',
  ]) {
    E(0, 'TEXT');
    E(8, '1');
    E(10, num(0));
    E(20, num(0));
    E(40, num(0.25));
    E(50, num(0));
    E(1, txt(s));
    E(7, 'STANDARD');
  }
  E(0, 'ENDSEC');
  E(0, 'EOF');
  return serialize(T);
}
