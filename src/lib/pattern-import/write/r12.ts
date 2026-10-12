// The "AAMA R12" dialect (AC1009) — ASTM D6673 / AAMA-DXF, the flavour CLO, Gerber AccuMark,
// Optitex, Lectra Modaris and Valentina exchange (10-CLO-DXF-FORMAT.md §1.9, ULMUS-DIAG §6). The
// wizard writes it (use-import-session `dialect: 'r12'`): what leaves the card goes to other CADs.
// Our own readers take it back: the card parser (POLYLINE / LINE notches / LINE grain; manifest),
// the pattern-import DXF adapter. `mergeDxfSheets` refuses R12 — the merge door is for CLO's
// per-size R2000 exports, never for our output.
//
// W3 — every layer says one thing, and only the AAMA layers are used:
//    1  boundary = the CUT line (allowance included) + the piece's AAMA text attributes
//       (`Piece Name:` `Size:` `Quantity:` `Material:` `Category:` `Annotation:`) — where AAMA puts
//       them and where CLO-AAMA / Gerber / Valentina write and read them
//    4  notches: one LINE from the cut line inward, length = depth (AAMA slit notch; the notch type
//       layers 80–83 are not used: we never know the type)
//    6  mirror line — only on a piece written as its half ("cut on fold", not unfolded)
//    7  grain line: 2-point LINE, 180 mm
//    8  internal lines (darts, placements, an unfolded piece's fold as reference); CLO's 10 × 10
//       drill square stays here too (CLO reads drills there, the card counts them there)
//   13  drill holes: POINT at the centre
//   14  sew line
//   15  annotation text: the piece's human name, "CUT ON FOLD"
// TABLES declare every layer (LTYPE BYBLOCK/BYLAYER/CONTINUOUS + DASHED for the sew line, STYLE
// STANDARD); POLYLINEs carry no header point (as CLO-AAMA writes them, and our readers expect); text is
// ASCII by transliteration (`asciiText`), never `\U+` escapes (R2000+ only).

import type { PtMm } from '../types';
import type { PlannedBlock } from './plan';
import { GRAIN_SHAFT_MM } from './plan';
import { drillSquare, insertsOf, labelAnchor } from './r2000';
import { type Tag, asciiText, num, serialize } from './format';

/** AAMA layers we write: name, ACI colour, linetype, what the layer means. */
export const AAMA_LAYERS: readonly { name: string; color: number; ltype: string }[] = [
  { name: '0', color: 7, ltype: 'CONTINUOUS' },
  { name: '1', color: 7, ltype: 'CONTINUOUS' }, // boundary (cut line) + piece attributes
  { name: '4', color: 1, ltype: 'CONTINUOUS' }, // notches
  { name: '6', color: 3, ltype: 'CONTINUOUS' }, // mirror line
  { name: '7', color: 2, ltype: 'CONTINUOUS' }, // grain line
  { name: '8', color: 5, ltype: 'CONTINUOUS' }, // internal lines
  { name: '13', color: 6, ltype: 'CONTINUOUS' }, // drill holes
  { name: '14', color: 4, ltype: 'DASHED' }, // sew line
  { name: '15', color: 8, ltype: 'CONTINUOUS' }, // annotation text
];

/** Text height (mm) and line pitch of the piece attributes / annotations. */
export const R12_TEXT_HEIGHT = 3;
export const R12_TEXT_PITCH = 5;

/** The AAMA piece text attributes (layer 1), in the standard's spelling. */
export function aamaAttributes(b: PlannedBlock): string[] {
  const out = [
    `Piece Name: ${b.identity}`,
    `Size: ${b.labelSize}`,
    `Quantity: ${b.quantity}`,
    `Material: ${b.material}`,
  ];
  if (b.category) out.push(`Category: ${b.category}`);
  if (b.annotation.length) out.push(`Annotation: ${b.annotation.join(' ')}`);
  return out;
}

/** Free annotation text (layer 15): what a person reads on the piece. */
export function aamaAnnotations(b: PlannedBlock): string[] {
  const out: string[] = [];
  const name = b.displayName.trim();
  if (name && name.toUpperCase() !== b.identity.toUpperCase()) out.push(name);
  if (b.foldIsMirror) out.push('CUT ON FOLD');
  return out;
}

export function writeR12(
  blocks: readonly PlannedBlock[],
  meta: { styleName: string; createdAt: string; sampleSize: string },
): string {
  const T: Tag[] = [];
  const E = (c: number, v: string) => {
    T.push([c, v]);
  };
  const t12 = (s: string) => asciiText(s);
  E(0, 'SECTION');
  E(2, 'HEADER');
  E(9, '$ACADVER');
  E(1, 'AC1009');
  // Not an R12 variable (R12 readers skip it); our card parser reads it instead of guessing units
  // (the model-space `Units: METRIC` says the same for AAMA readers).
  E(9, '$INSUNITS');
  E(70, '4');
  E(0, 'ENDSEC');

  // TABLES — every layer, linetype and text style the entities name is declared.
  E(0, 'SECTION');
  E(2, 'TABLES');
  E(0, 'TABLE');
  E(2, 'LTYPE');
  E(70, '4');
  for (const reserved of ['BYBLOCK', 'BYLAYER']) {
    E(0, 'LTYPE');
    E(2, reserved);
    E(70, '0');
    E(3, '');
    E(72, '65');
    E(73, '0');
    E(40, num(0));
  }
  E(0, 'LTYPE');
  E(2, 'CONTINUOUS');
  E(70, '0');
  E(3, 'Solid line');
  E(72, '65');
  E(73, '0');
  E(40, num(0));
  E(0, 'LTYPE');
  E(2, 'DASHED');
  E(70, '0');
  E(3, 'Dashed __ __ __');
  E(72, '65');
  E(73, '2');
  E(40, num(9));
  E(49, num(6));
  E(49, num(-3));
  E(0, 'ENDTAB');
  E(0, 'TABLE');
  E(2, 'LAYER');
  E(70, String(AAMA_LAYERS.length));
  for (const l of AAMA_LAYERS) {
    E(0, 'LAYER');
    E(2, l.name);
    E(70, '0');
    E(62, String(l.color));
    E(6, l.ltype);
  }
  E(0, 'ENDTAB');
  E(0, 'TABLE');
  E(2, 'STYLE');
  E(70, '1');
  E(0, 'STYLE');
  E(2, 'STANDARD');
  E(70, '0');
  E(40, num(0));
  E(41, num(1));
  E(50, num(0));
  E(71, '0');
  E(42, num(R12_TEXT_HEIGHT));
  E(3, 'txt');
  E(4, '');
  E(0, 'ENDTAB');
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
      E(30, num(0));
    }
    E(0, 'SEQEND');
    E(8, layer);
  };
  const line = (layer: string, a: PtMm, b: PtMm) => {
    E(0, 'LINE');
    E(8, layer);
    E(10, num(a.x));
    E(20, num(a.y));
    E(30, num(0));
    E(11, num(b.x));
    E(21, num(b.y));
    E(31, num(0));
  };
  const text = (layer: string, p: PtMm, height: number, value: string) => {
    E(0, 'TEXT');
    E(8, layer);
    E(10, num(p.x));
    E(20, num(p.y));
    E(30, num(0));
    E(40, num(height));
    E(1, t12(value));
    E(50, num(0));
    E(7, 'STANDARD');
  };
  for (const b of blocks) {
    const name = t12(b.name);
    E(0, 'BLOCK');
    E(8, '0');
    E(2, name);
    E(70, '0');
    E(10, num(0));
    E(20, num(0));
    E(30, num(0));
    E(3, name);
    pl('1', b.cut, true);
    if (b.seam) pl('14', b.seam, true);
    if (b.grain) {
      // a 2-point axis, 180 mm, no barb
      const g = b.grain;
      line('7', g.tail, {
        x: g.tail.x + GRAIN_SHAFT_MM * g.u.x,
        y: g.tail.y + GRAIN_SHAFT_MM * g.u.y,
      });
    }
    // internal lines; the fold line of a HALF is the mirror line (layer 6). Open lines keep their
    // midpoint (plan.ts densifyOpen2): a 2-point open line is a grain candidate for the card.
    const firstFold = b.internal.length - b.foldLines;
    b.internal.forEach((ip, i) =>
      pl(b.foldIsMirror && i >= firstFold ? '6' : '8', ip.pts, ip.closed),
    );
    for (const d of b.drills) {
      pl('8', drillSquare(d), true);
      E(0, 'POINT');
      E(8, '13');
      E(10, num(d.x));
      E(20, num(d.y));
      E(30, num(0));
    }
    for (const n of b.notches) line('4', n.a, n.b);
    const mid = labelAnchor(b);
    const lines: [layer: string, text: string][] = aamaAttributes(b).map((s) => ['1', s]);
    for (const s of aamaAnnotations(b)) lines.push(['15', s]);
    lines.forEach(([layer, s], k) =>
      text(layer, { x: mid.x, y: mid.y - R12_TEXT_PITCH * k }, R12_TEXT_HEIGHT, s),
    );
    E(0, 'ENDBLK');
    E(8, '0');
  }
  E(0, 'ENDSEC');
  E(0, 'SECTION');
  E(2, 'ENTITIES');
  for (const ins of insertsOf(blocks)) {
    E(0, 'INSERT');
    E(8, '0');
    E(2, t12(ins.name));
    E(10, num(ins.x));
    E(20, num(0));
    E(30, num(0));
  }
  const d = new Date(meta.createdAt);
  const valid = !Number.isNaN(d.getTime());
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = valid
    ? `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`
    : '';
  const time = valid ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : '';
  // the AAMA file header, model-space text on layer 1 (as CLO-AAMA and Gerber write it)
  for (const s of [
    `Style Name: ${meta.styleName}`,
    `Creation Date: ${date}`,
    `Creation Time: ${time}`,
    'Author: GRBPWR',
    'Product: grbpwr pattern-import',
    'Version: 3',
    `Sample Size: ${meta.sampleSize}`,
    'Units: METRIC',
  ])
    text('1', { x: 0, y: 0 }, 0.25, s);
  E(0, 'ENDSEC');
  E(0, 'EOF');
  return serialize(T);
}
