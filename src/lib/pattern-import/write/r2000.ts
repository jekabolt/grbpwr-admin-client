// The "CLO-DXF R2000" dialect (AC1015) — 10-CLO-DXF-FORMAT.md §1.3–1.7, transcribed from K2's
// golden writer (tmp/plans/pdf-to-dxf/k2-work/write-golden.mjs). Every tag outside geometry is
// deterministic; `golden-min.dxf` is the structural fixture (scripts/pattern-import/f6-entry.ts).

import type { PtMm } from '../types';
import type { PlannedBlock } from './plan';
import { DRILL_SQUARE_MM } from './plan';
import { type Tag, hex, num, serialize, txt } from './format';

/** CLO's 8 layers (name, ACI colour). */
export const CLO_LAYERS: readonly [string, number][] = [
  ['0', 7],
  ['1', 1],
  ['4', 1],
  ['7', 2],
  ['8', 5],
  ['11', 3],
  ['14', 7],
  ['19', 7],
];

/** Label lines on layer 1, CLO-AAMA offsets plus one line (§1.6). */
export const LABEL_DY = [0, -5, -15, -20, -25, -30];
export const LABEL_HEIGHT = 3;

export function drillSquare(c: PtMm, s = DRILL_SQUARE_MM): PtMm[] {
  return [
    { x: c.x - s / 2, y: c.y - s / 2 },
    { x: c.x + s / 2, y: c.y - s / 2 },
    { x: c.x + s / 2, y: c.y + s / 2 },
    { x: c.x - s / 2, y: c.y + s / 2 },
  ];
}

export function labelLines(b: PlannedBlock): string[] {
  const lines = [
    `PIECE NAME: ${b.identity}`,
    `SIZE: ${b.labelSize}`,
    `QUANTITY: ${b.quantity}`,
    `MATERIAL: ${b.material}`,
  ];
  if (b.annotation.length) lines.push(`ANNOTATION: ${b.annotation.join(' ')}`);
  return lines;
}

export function labelAnchor(b: PlannedBlock): PtMm {
  if (b.grain) {
    return { x: (b.grain.tail.x + b.grain.tip.x) / 2, y: (b.grain.tail.y + b.grain.tip.y) / 2 };
  }
  const xs = b.cut.map((p) => p.x);
  const ys = b.cut.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

export function writeR2000(blocks: readonly PlannedBlock[]): string {
  const T: Tag[] = [];
  const E = (c: number, v: string) => {
    T.push([c, v]);
  };

  // HEADER — CLO writes exactly these four variables.
  E(0, 'SECTION');
  E(2, 'HEADER');
  E(9, '$ACADVER');
  E(1, 'AC1015');
  E(9, '$DWGCODEPAGE');
  E(3, 'UTF-8');
  E(9, '$INSUNITS');
  E(70, '4');
  E(9, '$HANDSEED');
  const seedAt = T.length;
  E(5, 'FFFF');
  E(0, 'ENDSEC');

  // CLASSES
  E(0, 'SECTION');
  E(2, 'CLASSES');
  for (const [n, cpp] of [
    ['ACDBDICTIONARYWDFLT', 'AcDbDictionaryWithDefault'],
    ['ACDBPLACEHOLDER', 'AcDbPlaceHolder'],
    ['LAYOUT', 'AcDbLayout'],
  ]) {
    E(0, 'CLASS');
    E(1, n);
    E(2, cpp);
    E(3, 'ObjectDBX Classes');
    E(90, '0');
    E(280, '0');
    E(281, '0');
  }
  E(0, 'ENDSEC');

  // Handles (dxflib order): 1–9 table heads, A/B model/paper BLOCK_RECORD, C VPORT, D–13
  // objects, 14… piece BLOCK_RECORDs, then table records, BLOCK/ENDBLK, entities, INSERTs.
  let h = 0x14;
  const br = blocks.map(() => h++);
  const tableHead = (name: string, handle: number, count: number, extra?: string) => {
    E(0, 'TABLE');
    E(2, name);
    E(5, hex(handle));
    E(330, '0');
    E(100, 'AcDbSymbolTable');
    E(70, String(count));
    if (extra) E(100, extra);
  };
  const rec = (sub: string, owner: number) => {
    E(330, hex(owner));
    E(100, 'AcDbSymbolTableRecord');
    E(100, sub);
  };

  E(0, 'SECTION');
  E(2, 'TABLES');
  tableHead('VPORT', 1, 1);
  E(0, 'VPORT');
  E(5, 'C');
  rec('AcDbViewportTableRecord', 1);
  E(2, '*ACTIVE');
  E(70, '0');
  for (const [c, v] of [
    [10, 0],
    [20, 0],
    [11, 1],
    [21, 1],
    [12, 500],
    [22, 500],
    [13, 0],
    [23, 0],
    [14, 10],
    [24, 10],
    [15, 10],
    [25, 10],
    [16, 0],
    [26, 0],
    [36, 1],
    [17, 0],
    [27, 0],
    [37, 0],
    [40, 1000],
    [41, 1.7731],
    [42, 50],
    [43, 0],
    [44, 0],
    [50, 0],
    [51, 0],
  ] as const) {
    E(c, num(v));
  }
  for (const [c, v] of [
    [71, 0],
    [72, 20000],
    [73, 1],
    [74, 1],
    [75, 0],
    [76, 0],
    [77, 0],
    [78, 0],
  ] as const) {
    E(c, String(v));
  }
  E(0, 'ENDTAB');
  tableHead('LTYPE', 2, 3);
  for (const [n, d] of [
    ['ByBlock', ''],
    ['ByLayer', ''],
    ['CONTINUOUS', 'Solid line'],
  ]) {
    E(0, 'LTYPE');
    E(5, hex(h++));
    rec('AcDbLinetypeTableRecord', 2);
    E(2, n);
    E(70, '0');
    E(3, d);
    E(72, '65');
    E(73, '0');
    E(40, num(0));
  }
  E(0, 'ENDTAB');
  tableHead('LAYER', 3, CLO_LAYERS.length);
  for (const [n, c] of CLO_LAYERS) {
    E(0, 'LAYER');
    E(5, hex(h++));
    rec('AcDbLayerTableRecord', 3);
    E(2, n);
    E(70, '0');
    E(62, String(c));
    E(6, 'CONTINUOUS');
    E(370, '-3');
    E(390, '11');
  }
  E(0, 'ENDTAB');
  tableHead('STYLE', 4, 1);
  E(0, 'STYLE');
  E(5, hex(h++));
  rec('AcDbTextStyleTableRecord', 4);
  E(2, 'Standard');
  E(70, '0');
  E(40, num(0));
  E(41, num(1));
  E(50, num(0));
  E(71, '0');
  E(42, num(3));
  E(3, 'txt');
  E(4, '');
  E(0, 'ENDTAB');
  tableHead('VIEW', 5, 0);
  E(0, 'ENDTAB');
  tableHead('UCS', 6, 0);
  E(0, 'ENDTAB');
  tableHead('APPID', 7, 1);
  E(0, 'APPID');
  E(5, hex(h++));
  rec('AcDbRegAppTableRecord', 7);
  E(2, 'ACAD');
  E(70, '0');
  E(0, 'ENDTAB');
  tableHead('DIMSTYLE', 8, 1, 'AcDbDimStyleTable');
  E(0, 'DIMSTYLE');
  E(105, hex(h++));
  rec('AcDbDimStyleTableRecord', 8);
  E(2, 'Standard');
  E(70, '0');
  E(0, 'ENDTAB');
  tableHead('BLOCK_RECORD', 9, blocks.length + 2);
  const brRec = (handle: number, name: string, layout: string) => {
    E(0, 'BLOCK_RECORD');
    E(5, hex(handle));
    rec('AcDbBlockTableRecord', 9);
    E(2, name);
    E(340, layout);
  };
  brRec(0xa, '*Model_Space', '13');
  brRec(0xb, '*Paper_Space', '12');
  blocks.forEach((b, i) => brRec(br[i], txt(b.name), '0'));
  E(0, 'ENDTAB');
  E(0, 'ENDSEC');

  // BLOCKS
  E(0, 'SECTION');
  E(2, 'BLOCKS');
  const blockBegin = (owner: number, name: string, paper: boolean, desc: string) => {
    E(0, 'BLOCK');
    E(5, hex(h++));
    E(330, hex(owner));
    E(100, 'AcDbEntity');
    if (paper) E(67, '1');
    E(8, '0');
    E(100, 'AcDbBlockBegin');
    E(2, name);
    E(70, '0');
    E(10, num(0));
    E(20, num(0));
    E(30, num(0));
    E(3, desc);
    E(1, '');
  };
  const blockEnd = (owner: number, paper: boolean) => {
    E(0, 'ENDBLK');
    E(5, hex(h++));
    E(330, hex(owner));
    E(100, 'AcDbEntity');
    if (paper) E(67, '1');
    E(8, '0');
    E(100, 'AcDbBlockEnd');
  };
  blockBegin(0xa, '*Model_Space', false, '');
  blockEnd(0xa, false);
  blockBegin(0xb, '*Paper_Space', true, '');
  blockEnd(0xb, true);
  const ent = (type: string, owner: number, layer: string, sub: string) => {
    E(0, type);
    E(5, hex(h++));
    E(330, hex(owner));
    E(100, 'AcDbEntity');
    E(8, layer);
    E(100, sub);
  };
  const lw = (owner: number, layer: string, pts: readonly PtMm[], closed: boolean) => {
    ent('LWPOLYLINE', owner, layer, 'AcDbPolyline');
    E(90, String(pts.length));
    E(70, closed ? '1' : '0');
    E(43, num(0));
    for (const p of pts) {
      E(10, num(p.x));
      E(20, num(p.y));
    }
  };
  const text = (owner: number, layer: string, p: PtMm, height: number, value: string) => {
    ent('TEXT', owner, layer, 'AcDbText');
    E(10, num(p.x));
    E(20, num(p.y));
    E(30, num(0));
    E(40, num(height));
    E(1, txt(value));
    E(50, num(0));
    E(100, 'AcDbText');
  };
  blocks.forEach((b, i) => {
    const o = br[i];
    const name = txt(b.name);
    blockBegin(o, name, false, name);
    if (b.seam) lw(o, '14', b.seam, true); // seam line first, as CLO does
    lw(o, '1', b.cut, true); // final cutting line
    for (const ip of b.internal) lw(o, '8', ip.pts, ip.closed);
    for (const d of b.drills) lw(o, '8', drillSquare(d), true);
    if (b.grain) lw(o, '7', [b.grain.tail, b.grain.tip, b.grain.barb], false);
    for (const n of b.notches) {
      ent('LINE', o, '4', 'AcDbLine');
      E(10, num(n.a.x));
      E(20, num(n.a.y));
      E(30, num(0));
      E(11, num(n.b.x));
      E(21, num(n.b.y));
      E(31, num(0));
    }
    const mid = labelAnchor(b);
    labelLines(b).forEach((s, k) =>
      text(
        o,
        '1',
        { x: mid.x, y: mid.y + LABEL_DY[Math.min(k, LABEL_DY.length - 1)] },
        LABEL_HEIGHT,
        s,
      ),
    );
    blockEnd(o, false);
  });
  E(0, 'ENDSEC');

  // ENTITIES — one INSERT per block at the origin, no scale/rotation/extrusion.
  E(0, 'SECTION');
  E(2, 'ENTITIES');
  for (const b of blocks) {
    E(0, 'INSERT');
    E(5, hex(h++));
    E(330, 'A');
    E(100, 'AcDbEntity');
    E(8, '0');
    E(100, 'AcDbBlockReference');
    E(2, txt(b.name));
    E(10, num(0));
    E(20, num(0));
    E(30, num(0));
  }
  E(0, 'ENDSEC');

  // OBJECTS — CLO's seven, verbatim.
  E(0, 'SECTION');
  E(2, 'OBJECTS');
  const R = (owner: string) => {
    E(102, '{ACAD_REACTORS');
    E(330, owner);
    E(102, '}');
    E(330, owner);
  };
  E(0, 'DICTIONARY');
  E(5, 'D');
  E(330, '0');
  E(100, 'AcDbDictionary');
  E(281, '1');
  E(3, 'ACAD_GROUP');
  E(350, 'E');
  E(3, 'ACAD_LAYOUT');
  E(350, 'F');
  E(3, 'ACAD_PLOTSTYLENAME');
  E(350, '10');
  E(0, 'DICTIONARY');
  E(5, 'E');
  R('D');
  E(100, 'AcDbDictionary');
  E(281, '1');
  E(0, 'DICTIONARY');
  E(5, 'F');
  R('D');
  E(100, 'AcDbDictionary');
  E(281, '1');
  E(3, 'Layout1');
  E(350, '12');
  E(3, 'Model');
  E(350, '13');
  E(0, 'ACDBDICTIONARYWDFLT');
  E(5, '10');
  R('D');
  E(100, 'AcDbDictionary');
  E(281, '1');
  E(3, 'Normal');
  E(350, '11');
  E(100, 'AcDbDictionaryWithDefault');
  E(340, '11');
  E(0, 'ACDBPLACEHOLDER');
  E(5, '11');
  R('10');
  const layout = (
    handle: string,
    name: string,
    flags70: number,
    tab71: number,
    flags74: number,
    flags75: number,
    owner: string,
  ) => {
    E(0, 'LAYOUT');
    E(5, handle);
    R('F');
    E(100, 'AcDbPlotSettings');
    E(1, '');
    E(2, 'none_device');
    E(4, '');
    E(6, '');
    for (const c of [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 140, 141]) E(c, num(0));
    E(142, num(1));
    E(143, num(1));
    E(70, String(flags70));
    E(72, '0');
    E(73, '0');
    E(74, String(flags74));
    E(7, '');
    E(75, String(flags75));
    E(147, num(1));
    E(148, num(0));
    E(149, num(0));
    E(100, 'AcDbLayout');
    E(1, name);
    E(70, '1');
    E(71, String(tab71));
    E(10, num(0));
    E(20, num(0));
    E(11, num(12));
    E(21, num(9));
    E(12, num(0));
    E(22, num(0));
    E(32, num(0));
    E(14, num(1e20));
    E(24, num(1e20));
    E(34, num(1e20));
    E(15, num(-1e20));
    E(25, num(-1e20));
    E(35, num(-1e20));
    E(146, num(0));
    E(13, num(0));
    E(23, num(0));
    E(33, num(0));
    E(16, num(1));
    E(26, num(0));
    E(36, num(0));
    E(17, num(0));
    E(27, num(1));
    E(37, num(0));
    E(76, '0');
    E(330, owner);
  };
  layout('12', 'Layout1', 688, 1, 5, 16, 'B');
  layout('13', 'Model', 1712, 0, 0, 0, 'A');
  E(331, 'C');
  E(0, 'ENDSEC');
  E(0, 'EOF');

  // $HANDSEED: CLO's constant FFFF, unless we actually ran past it.
  if (h > 0xffff) T[seedAt] = [5, hex(h)];
  return serialize(T);
}
