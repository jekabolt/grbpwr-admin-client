import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  GARMENT_FAMILIES,
  GARMENT_SHAPES,
  familyFor,
  pictogramPaths,
  type FamilyInput,
  type GarmentFamily,
  type PictogramView,
} from '../src/components/managers/tech-card/components/design/garment-pictograms';
import {
  GARMENT_PARTS,
  PART_LABEL,
  partViewBox,
  type PartKey,
} from '../src/components/managers/tech-card/components/design/garment-parts';
import {
  HARDWARE_KINDS,
  HARDWARE_LABEL,
  HardwareIcon,
  hardwareOf,
  type HardwareKind,
} from '../src/components/managers/tech-card/components/design/hardware-icons';

const familyCases: Array<[FamilyInput, GarmentFamily | '']> = [
  [{ top: 'outerwear', sub: 'coats' }, 'coat'],
  [{ top: 'outerwear', sub: 'vests' }, 'vest'],
  [{ top: 'outerwear', sub: 'jackets' }, 'jacket'],
  [{ top: 'tops', sub: 'shirts' }, 'shirt'],
  [{ top: 'tops', sub: 'blouses' }, 'shirt'],
  [{ top: 'tops', sub: 'polos' }, 'shirt'],
  [{ top: 'tops', sub: 'sweaters_knits' }, 'knit'],
  [{ top: 'tops', sub: 'hoodies_sweatshirts' }, 'hoodie'],
  [{ top: 'tops', sub: 'tshirts' }, 'tee'],
  [{ top: 'bottoms', sub: 'jumpsuits' }, 'jumpsuit'],
  [{ top: 'bottoms', sub: 'shorts' }, 'shorts'],
  [{ top: 'bottoms', sub: 'skirts' }, 'skirt'],
  [{ top: 'bottoms', sub: 'leggings' }, 'trousers'],
  [{ top: 'dresses' }, 'dress'],
  [{ top: 'loungewear_sleepwear', sub: 'swimwear_m' }, 'briefs'],
  [{ top: 'loungewear_sleepwear', sub: 'swimwear_w' }, 'bra'],
  [{ top: 'loungewear_sleepwear', sub: 'robes' }, 'coat'],
  [{ top: 'loungewear_sleepwear', sub: 'sets' }, 'tee'],
  [{ top: 'accessories', sub: 'hats', type: 'caps' }, 'cap'],
  [{ top: 'accessories', sub: 'hats', type: 'beanies' }, 'hat'],
  [{ top: 'accessories', sub: 'jewelry' }, 'necklace'],
  [{ top: 'shoes', sub: 'boots' }, 'boot'],
  [{ top: 'shoes', sub: 'sandals' }, 'sandal'],
  [{ top: 'shoes', sub: 'mules_clogs' }, 'sandal'],
  [{ top: 'shoes', sub: 'sneakers' }, 'shoe'],
  [{ top: 'bags' }, 'bag'],
  [{ top: 'objects' }, 'object'],
  [{ top: 'new_server_category' }, ''],
];
for (const [input, expected] of familyCases) {
  const actual = familyFor(input);
  if (actual !== expected) {
    throw new Error(`familyFor(${JSON.stringify(input)}) returned ${actual}, expected ${expected}`);
  }
}

const hardwareCases: Array<[string, HardwareKind | null]> = [
  ['buttons', 'hw_button'],
  ['zip', 'hw_zip'],
  ['snaps', 'hw_snap'],
  ['magnetic snap', 'hw_magnet'],
  ['corduroy', null],
  ['snapshot', null],
];
for (const [label, expected] of hardwareCases) {
  const actual = hardwareOf(label);
  if (actual !== expected) {
    throw new Error(
      `hardwareOf(${JSON.stringify(label)}) returned ${actual}, expected ${expected}`,
    );
  }
}

const CELL_WIDTH = 84;
const LABEL_WIDTH = 92;
const VIEW_ROW_HEIGHT = 82;
const PART_ROW_HEIGHT = 122;
const HARDWARE_ROW_HEIGHT = 122;
const HEADER_HEIGHT = 34;
const GAP_HEIGHT = 18;
const familyPartCount = GARMENT_FAMILIES.reduce(
  (sum, family) => sum + Object.keys(GARMENT_PARTS[family]).length,
  0,
);
const maxParts = Math.max(
  ...GARMENT_FAMILIES.map((family) => Object.keys(GARMENT_PARTS[family]).length),
);
const viewCode = { front: 'f', back: 'b', side_l: 's' } as const;
const partTable = GARMENT_FAMILIES.map((family) => {
  const parts = Object.entries(GARMENT_PARTS[family]).map(
    ([part, detail]) => `${part}:${viewCode[detail.view]}${detail.zone ? '(z)' : ''}`,
  );
  return `${family} ${parts.join(' ')}`;
}).join('\n');
const width = LABEL_WIDTH + Math.max(maxParts, HARDWARE_KINDS.length, 4) * CELL_WIDTH;
const viewHeight = GARMENT_FAMILIES.length * VIEW_ROW_HEIGHT;
const partsTop = HEADER_HEIGHT + viewHeight + GAP_HEIGHT;
const hardwareTop = partsTop + GARMENT_FAMILIES.length * PART_ROW_HEIGHT;
const height = hardwareTop + HARDWARE_ROW_HEIGHT;
const views: PictogramView[] = ['front', 'back', 'side_l', 'side_r'];

const escapeText = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const path = (d: string, extra = ''): string =>
  `<path d="${d}" vector-effect="non-scaling-stroke" ${extra}/>`;

function basePictogram(family: GarmentFamily, view: PictogramView): string {
  const transform = view === 'side_r' ? ' transform="matrix(-1 0 0 1 64 0)"' : '';
  return `<g${transform} fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round">${pictogramPaths(
    family,
    view,
  )
    .map((d) => path(d))
    .join('')}</g>`;
}

function viewCell(family: GarmentFamily, view: PictogramView, x: number, y: number): string {
  return `<g transform="translate(${x + 10} ${y + 2}) scale(.65)">${basePictogram(
    family,
    view,
  )}</g><text x="${x + CELL_WIDTH / 2}" y="${y + 75}" text-anchor="middle">${view}</text>`;
}

function partCell(family: GarmentFamily, part: PartKey, x: number, y: number): string {
  const detail = GARMENT_PARTS[family][part];
  if (!detail) return '';
  const label = `<text x="${x + CELL_WIDTH / 2}" y="${y + 111}" text-anchor="middle">`;
  if (part === 'whole') {
    // whole → the plain garment, full ink, no highlight (same rule as PartPictogram)
    return `<svg x="${x + 10}" y="${y + 3}" width="64" height="96" viewBox="0 0 64 96">${basePictogram(
      family,
      detail.view,
    )}</svg>${label}${escapeText(PART_LABEL[part])}</text>`;
  }
  const { viewBox, zoom } = partViewBox(detail.d);
  const [vx, vy, vw, vh] = viewBox.split(' ');
  const highlight = detail.d
    .map((d) => path(d, `fill="currentColor" fill-opacity="${detail.zone ? '.12' : '.14'}"`))
    .join('');
  return `<svg x="${x + 10}" y="${y + 3}" width="64" height="96" viewBox="${viewBox}" overflow="hidden">
    <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#fff" stroke="#ddd"/>
    <g opacity=".35">${basePictogram(family, detail.view)}</g>
    <g stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${highlight}</g>
  </svg>${label}${escapeText(PART_LABEL[part])}${zoom > 1 ? ` ×${zoom.toFixed(1)}` : ''}</text>`;
}

function hardwareCell(kind: HardwareKind, x: number, y: number): string {
  const icon = renderToStaticMarkup(createElement(HardwareIcon, { kind, size: 64 }));
  return `<g transform="translate(${x + 10} ${y + 19})">${icon}</g>
    <text x="${x + CELL_WIDTH / 2}" y="${y + 111}" text-anchor="middle">${escapeText(HARDWARE_LABEL[kind])}</text>`;
}

const rows: string[] = [];
GARMENT_FAMILIES.forEach((family, familyIndex) => {
  const y = HEADER_HEIGHT + familyIndex * VIEW_ROW_HEIGHT;
  rows.push(
    `<rect x="0" y="${y}" width="${width}" height="${VIEW_ROW_HEIGHT}" fill="#fff" stroke="#ccc"/>`,
    `<text class="family" x="8" y="${y + 43}">${family}</text>`,
    ...views.map((view, viewIndex) =>
      viewCell(family, view, LABEL_WIDTH + viewIndex * CELL_WIDTH, y),
    ),
  );
});

GARMENT_FAMILIES.forEach((family, familyIndex) => {
  const y = partsTop + familyIndex * PART_ROW_HEIGHT;
  const parts = Object.keys(GARMENT_PARTS[family]) as PartKey[];
  rows.push(
    `<rect x="0" y="${y}" width="${width}" height="${PART_ROW_HEIGHT}" fill="#fff" stroke="#ccc"/>`,
    `<text class="family" x="8" y="${y + 61}">${family}</text>`,
    ...parts.map((part, partIndex) =>
      partCell(family, part, LABEL_WIDTH + partIndex * CELL_WIDTH, y),
    ),
  );
});

rows.push(
  `<rect x="0" y="${hardwareTop}" width="${width}" height="${HARDWARE_ROW_HEIGHT}" fill="#fff" stroke="#ccc"/>`,
  `<text class="family" x="8" y="${hardwareTop + 61}">hardware</text>`,
  ...HARDWARE_KINDS.map((kind, index) =>
    hardwareCell(kind, LABEL_WIDTH + index * CELL_WIDTH, hardwareTop),
  ),
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" color="#000">
  <metadata data-families="${GARMENT_FAMILIES.length}" data-parts="${familyPartCount}" data-shapes="${Object.keys(GARMENT_SHAPES).length}" data-hardware="${HARDWARE_KINDS.length}"/>
  <!-- O6\n${partTable}\n-->
  <style>
    text { fill: #333; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }
    .family { fill: #000; font-weight: 700; }
  </style>
  <rect width="100%" height="100%" fill="#f2f2f2"/>
  <text class="family" x="0" y="18">GARMENT PICTOGRAMS · ${GARMENT_FAMILIES.length} FAMILIES · ${familyPartCount} PART MARKS · ${HARDWARE_KINDS.length} HARDWARE</text>
  ${rows.join('\n')}
</svg>`;

process.stdout.write(svg);
