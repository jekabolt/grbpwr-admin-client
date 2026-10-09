import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  GARMENT_MANIFEST,
  type CardDetail,
} from '../src/components/managers/tech-card/components/design/garment-manifest';
import {
  GARMENT_FAMILIES,
  GARMENT_SHAPES,
  UNDRAWN_FAMILIES,
  familyFor,
  pictogramPaths,
  type FamilyInput,
  type GarmentFamily,
  type PictogramView,
} from '../src/components/managers/tech-card/components/design/garment-pictograms';
import {
  GARMENT_PARTS,
  PART_LABEL,
  PartPictogram,
  SeamPartPictogram,
  partViewBox,
  type PartKey,
} from '../src/components/managers/tech-card/components/design/garment-parts';
import {
  HARDWARE_KINDS,
  HARDWARE_LABEL,
  HardwareIcon,
  LABEL_KINDS,
  LABEL_LABEL,
  LabelIcon,
  hardwareOf,
  labelOf,
  type HardwareKind,
  type LabelKind,
} from '../src/components/managers/tech-card/components/design/hardware-icons';
import {
  EDGE_KINDS,
  PaletteIcon,
  SEAM_KINDS,
  SEAM_LABEL,
  SeamIcon,
  isPaletteKey,
  seamClassOf,
  seamOf,
  swatchOf,
  type SeamKind,
} from '../src/components/managers/tech-card/components/design/seam-icons';
import { partLabel } from '../src/components/managers/tech-card/components/design/quiz-model';

// The manifest's shared vectors (the backend runs the same rows) + the owner's card (95 §1.3).
const familyCases: Array<[FamilyInput, GarmentFamily | '', CardDetail[]?]> = [
  ...GARMENT_MANIFEST.vectors.map((v): [FamilyInput, GarmentFamily | '', CardDetail[]] => [
    { top: v.top, sub: v.sub, type: v.type },
    v.family as GarmentFamily | '',
    Object.entries(('details' in v ? v.details : undefined) ?? {}).map(([key, text]) => ({
      key,
      text: String(text),
    })),
  ]),
  [{ top: 'tops', sub: 'blouses' }, 'cami', [{ key: 'silhouette', text: 'sleeveless, strappy' }]],
  [{ top: 'tops', sub: 'tanks' }, 'tank', [{ key: 'collar', text: 'strappy' }]],
  [{ top: 'tops', sub: 'crop' }, 'tank', [{ key: 'sleeveCuff', text: 'Sleeveless' }]],
  [{ top: 'tops', sub: 'blouses' }, 'blouse', [{ key: 'fabric', text: 'sleeveless' }]],
];
for (const [input, expected, details] of familyCases) {
  const actual = familyFor(input, details);
  if (actual !== expected) {
    throw new Error(
      `familyFor(${JSON.stringify(input)}, ${JSON.stringify(details)}) returned ${actual}, expected ${expected}`,
    );
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

const labelCases: Array<[string, LabelKind | null]> = [
  ['brand label', 'lbl_brand'],
  ['care label', 'lbl_care'],
  ['size tab', 'lbl_size'],
  ['side label', 'lbl_flag'],
  ['rubber patch', 'lbl_patch'],
  ['swing tag', 'lbl_hang_tag'],
  ['label', 'lbl_brand'],
  ['labelling', null],
];
for (const [label, expected] of labelCases) {
  const actual = labelOf(label);
  if (actual !== expected) {
    throw new Error(`labelOf(${JSON.stringify(label)}) returned ${actual}, expected ${expected}`);
  }
}

const seamCases: Array<[string, SeamKind | null]> = [
  ['Hong Kong finish (bias-bound edges)', 'sm_hong_kong'],
  ['plain seam overlocked together', 'sm_plain_overlock'],
  ['bound neckline', 'sm_hem_bound'],
  ['rolled edge', 'sm_hem_rolled'],
  ['cord piping', 'sm_piping'],
  ['ribbing', 'sm_rib_band'],
  ['band finish', 'sm_self_band'],
  ['elastic waist', 'sm_casing_elastic'],
  ['tunnel', 'sm_casing_drawcord'],
  ['merrow edge', 'sm_edge_overlocked'],
  ['lettuce hem', 'sm_hem_lettuce'],
  ['seam allowance 1 cm', null],
  ['corduroy', null],
];
for (const [label, expected] of seamCases) {
  const actual = seamOf(label);
  if (actual !== expected) {
    throw new Error(`seamOf(${JSON.stringify(label)}) returned ${actual}, expected ${expected}`);
  }
}
if (seamClassOf('sm_french') !== 'TECH_CARD_SEAM_CLASS_SS_FRENCH') {
  throw new Error('seamClassOf(sm_french) did not return SS_FRENCH');
}
if (seamClassOf('sm_bonded') !== 'TECH_CARD_SEAM_CLASS_OTHER') {
  throw new Error('seamClassOf(sm_bonded) did not return OTHER');
}
for (const kind of EDGE_KINDS) {
  if (partLabel(kind) !== `edge: ${SEAM_LABEL[kind]}`) {
    throw new Error(`partLabel(${kind}) did not use the edge prefix`);
  }
}
if (!isPaletteKey('col_palette') || isPaletteKey('palette')) {
  throw new Error('isPaletteKey did not accept only col_palette');
}
for (const [label, expected] of [
  ['olive drab', 'olivedrab'],
  ['two', null],
] as const) {
  const actual = swatchOf(label);
  if (actual !== expected) {
    throw new Error(`swatchOf(${JSON.stringify(label)}) returned ${actual}, expected ${expected}`);
  }
}

const genericLabel = renderToStaticMarkup(
  createElement(PartPictogram, { family: '', part: 'label' }),
);
const careLabel = renderToStaticMarkup(
  createElement(PartPictogram, { family: '', part: 'lbl_care' }),
);
if (!genericLabel.includes('data-label-kind="lbl_brand"')) {
  throw new Error('PartPictogram label did not render lbl_brand without a family');
}
if (!careLabel.includes('data-label-kind="lbl_care"')) {
  throw new Error('PartPictogram lbl_care did not render without a family');
}

const CELL_WIDTH = 84;
const LABEL_WIDTH = 92;
const VIEW_ROW_HEIGHT = 82;
const PART_ROW_HEIGHT = 122;
const HARDWARE_ROW_HEIGHT = 122;
const SEAM_CELL_WIDTH = 180;
const SEAM_ROW_HEIGHT = 184;
const HEADER_HEIGHT = 34;
const GAP_HEIGHT = 18;
const familyPartCount = GARMENT_FAMILIES.reduce(
  (sum, family) => sum + Object.keys(GARMENT_PARTS[family]).length,
  0,
);
const maxParts = Math.max(
  ...GARMENT_FAMILIES.map((family) => Object.keys(GARMENT_PARTS[family]).length),
);
const closeupCount = HARDWARE_KINDS.length + LABEL_KINDS.length;
const seamCount = SEAM_KINDS.length + 1;
const viewCode = { front: 'f', back: 'b', side_l: 's' } as const;
const partTable = GARMENT_FAMILIES.map((family) => {
  const parts = Object.entries(GARMENT_PARTS[family]).map(
    ([part, detail]) => `${part}:${viewCode[detail.view]}${detail.zone ? '(z)' : ''}`,
  );
  return `${family} ${parts.join(' ')}`;
}).join('\n');
const width =
  LABEL_WIDTH +
  Math.max(Math.max(maxParts, closeupCount, 4) * CELL_WIDTH, seamCount * SEAM_CELL_WIDTH);
const viewHeight = GARMENT_FAMILIES.length * VIEW_ROW_HEIGHT;
const partsTop = HEADER_HEIGHT + viewHeight + GAP_HEIGHT;
const hardwareTop = partsTop + GARMENT_FAMILIES.length * PART_ROW_HEIGHT;
const seamsTop = hardwareTop + HARDWARE_ROW_HEIGHT;
const height = seamsTop + SEAM_ROW_HEIGHT;
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

function labelCell(kind: LabelKind, x: number, y: number): string {
  const icon = renderToStaticMarkup(createElement(LabelIcon, { kind, size: 64 }));
  return `<g transform="translate(${x + 10} ${y + 19})">${icon}</g>
    <text x="${x + CELL_WIDTH / 2}" y="${y + 111}" text-anchor="middle">${escapeText(LABEL_LABEL[kind])}</text>`;
}

function seamCell(kind: SeamKind, x: number, y: number): string {
  const composite = renderToStaticMarkup(createElement(SeamPartPictogram, { kind }));
  const icon48 = renderToStaticMarkup(createElement(SeamIcon, { kind, size: 48, band: true }));
  const icon14 = renderToStaticMarkup(createElement(SeamIcon, { kind, size: 14 }));
  const words = SEAM_LABEL[kind].split(' ');
  const cut = Math.max(1, Math.ceil(words.length / 2));
  const lines = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')].filter(Boolean);
  return `<g transform="translate(${x + 7} ${y + 3})">${composite}</g>
    <g transform="translate(${x + 82} ${y + 10})">${icon48}</g>
    <g transform="translate(${x + 151} ${y + 18})">${icon14}</g>
    <rect x="${x + 78}" y="${y + 50}" width="70" height="38" fill="#111"/>
    <g transform="translate(${x + 89} ${y + 54})" color="#fff">${icon48}</g>
    <text class="detail" x="${x + 110}" y="${y + 98}" text-anchor="middle">48 band · 14 · selected</text>
    <text x="${x + SEAM_CELL_WIDTH / 2}" y="${y + 123}" text-anchor="middle">${kind}</text>
    ${lines
      .map(
        (line, index) =>
          `<text class="detail" x="${x + SEAM_CELL_WIDTH / 2}" y="${y + 140 + index * 11}" text-anchor="middle">${escapeText(line)}</text>`,
      )
      .join('')}`;
}

function paletteCell(x: number, y: number): string {
  const icon64 = renderToStaticMarkup(createElement(PaletteIcon, { size: 64 }));
  const icon14 = renderToStaticMarkup(createElement(PaletteIcon, { size: 14 }));
  return `<g transform="translate(${x + 34} ${y + 19})">${icon64}</g>
    <g transform="translate(${x + 125} ${y + 55})">${icon14}</g>
    <text x="${x + SEAM_CELL_WIDTH / 2}" y="${y + 123}" text-anchor="middle">col_palette</text>
    <text class="detail" x="${x + SEAM_CELL_WIDTH / 2}" y="${y + 140}" text-anchor="middle">colourway palette</text>`;
}

function seamRow(y: number, rowWidth: number): string[] {
  return [
    `<rect x="0" y="${y}" width="${rowWidth}" height="${SEAM_ROW_HEIGHT}" fill="#fff" stroke="#ccc"/>`,
    `<text class="family" x="8" y="${y + 82}">seams · palette</text>`,
    ...SEAM_KINDS.map((kind, index) => seamCell(kind, LABEL_WIDTH + index * SEAM_CELL_WIDTH, y)),
    paletteCell(LABEL_WIDTH + SEAM_KINDS.length * SEAM_CELL_WIDTH, y),
  ];
}

const SEAM_GRID_COLUMNS = 6;
const seamGridRows = Math.ceil(SEAM_KINDS.length / SEAM_GRID_COLUMNS);
const seamGridWidth = LABEL_WIDTH + SEAM_GRID_COLUMNS * SEAM_CELL_WIDTH;
const seamGridHeight = seamGridRows * SEAM_ROW_HEIGHT;

function seamGrid(): string[] {
  const grid: string[] = [];
  for (let row = 0; row < seamGridRows; row++) {
    const y = row * SEAM_ROW_HEIGHT;
    grid.push(
      `<rect x="0" y="${y}" width="${seamGridWidth}" height="${SEAM_ROW_HEIGHT}" fill="#fff" stroke="#ccc"/>`,
      `<text class="family" x="8" y="${y + 82}">seams/edges ${row + 1}/${seamGridRows}</text>`,
    );
  }
  SEAM_KINDS.forEach((kind, index) => {
    const column = index % SEAM_GRID_COLUMNS;
    const row = Math.floor(index / SEAM_GRID_COLUMNS);
    grid.push(seamCell(kind, LABEL_WIDTH + column * SEAM_CELL_WIDTH, row * SEAM_ROW_HEIGHT));
  });
  return grid;
}

const rows: string[] = [];
GARMENT_FAMILIES.forEach((family, familyIndex) => {
  const y = HEADER_HEIGHT + familyIndex * VIEW_ROW_HEIGHT;
  rows.push(
    `<rect x="0" y="${y}" width="${width}" height="${VIEW_ROW_HEIGHT}" fill="#fff" stroke="#ccc"/>`,
    `<text class="family" x="8" y="${y + 43}">${family}</text>`,
    ...(UNDRAWN_FAMILIES.includes(family)
      ? [
          `<text class="detail" x="8" y="${y + 56}">base: ${GARMENT_MANIFEST.families[family].base}</text>`,
        ]
      : []),
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
  `<text class="family" x="8" y="${hardwareTop + 61}">hardware · labels</text>`,
  ...HARDWARE_KINDS.map((kind, index) =>
    hardwareCell(kind, LABEL_WIDTH + index * CELL_WIDTH, hardwareTop),
  ),
  ...LABEL_KINDS.map((kind, index) =>
    labelCell(kind, LABEL_WIDTH + (HARDWARE_KINDS.length + index) * CELL_WIDTH, hardwareTop),
  ),
);

rows.push(...seamRow(seamsTop, width));

const seamsOnly = process.env.SEAMS_ONLY === '1';
const outputWidth = seamsOnly ? seamGridWidth : width;
const outputHeight = seamsOnly ? seamGridHeight : height;
const outputRows = seamsOnly ? seamGrid() : rows;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${outputWidth} ${outputHeight}" color="#000">
  <metadata data-families="${GARMENT_FAMILIES.length}" data-parts="${familyPartCount}" data-shapes="${Object.keys(GARMENT_SHAPES).length}" data-manifest="${Object.keys(GARMENT_MANIFEST.families).length}" data-undrawn="${UNDRAWN_FAMILIES.length}" data-hardware="${HARDWARE_KINDS.length}" data-labels="${LABEL_KINDS.length}" data-seams="${SEAM_KINDS.length}" data-palettes="1"/>
  <!-- O6\n${partTable}\n-->
  <style>
    text { fill: #333; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }
    .detail { fill: #666; font-size: 8px; }
    .family { fill: #000; font-weight: 700; }
  </style>
  <rect width="100%" height="100%" fill="#f2f2f2"/>
  ${seamsOnly ? '' : `<text class="family" x="0" y="18">GARMENT PICTOGRAMS · ${GARMENT_FAMILIES.length} FAMILIES · ${familyPartCount} PART MARKS · ${HARDWARE_KINDS.length} HARDWARE · ${LABEL_KINDS.length} LABELS · ${SEAM_KINDS.length} SEAMS · 1 PALETTE</text>`}
  ${outputRows.join('\n')}
</svg>`;

process.stdout.write(svg);
