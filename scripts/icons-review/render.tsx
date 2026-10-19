// ICONS-UNIFY review stand: renders every placeholder / quiz / measurement icon to static markup.
// Bundled by run.mjs against one checkout (before = origin/beta, after = this worktree); prints
// one JSON array of {family, name, variant, svg, w, h} to stdout. Every module is imported as a
// namespace and every member is looked up at run time, so a checkout that lacks a component
// renders an `error` row instead of failing the bundle.
//
// Private glyphs (PhotoGlyph, ModelGlyph, PenGlyph, the GENERATE draw glyph, the measurement
// table) are reached through `__stand_*` exports that run.mjs appends to those modules at bundle
// time — the source files are not edited.
import { createElement, type ComponentType, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import * as mediaSlot from 'components/managers/media/components/media-slot';
import * as measurement from 'components/managers/model/components/measurement-pictograms';
import * as twoHalf from 'components/managers/tech-card/components/design/core/two-half-slot';
import * as parts from 'components/managers/tech-card/components/design/garment-parts';
import * as garment from 'components/managers/tech-card/components/design/garment-pictograms';
import * as hardware from 'components/managers/tech-card/components/design/hardware-icons';
import * as fabrics from 'components/managers/tech-card/components/design/pattern/fabrics-hardware';
import * as trims from 'components/managers/tech-card/components/design/pattern/trim-pictograms';
import * as seams from 'components/managers/tech-card/components/design/seam-icons';
import * as model from 'components/managers/tech-card/components/design/threed/model-upload-cell';
import * as marker from 'components/managers/tech-card/components/nesting/marker-quiz/pictures';

type Row = {
  family: string;
  name: string;
  variant: string;
  svg: string;
  /** Call-site box, px. */
  w: number;
  h: number;
  error?: string;
};

type AnyProps = Record<string, unknown>;

const rows: Row[] = [];

function member<T>(mod: object, name: string): T | undefined {
  return (mod as Record<string, unknown>)[name] as T | undefined;
}

function add(
  family: string,
  name: string,
  variant: string,
  size: [number, number],
  render: () => ReactElement | null,
) {
  const [w, h] = size;
  try {
    const element = render();
    rows.push({ family, name, variant, w, h, svg: element ? renderToStaticMarkup(element) : '' });
  } catch (e) {
    rows.push({ family, name, variant, w, h, svg: '', error: String((e as Error)?.message ?? e) });
  }
}

function el(mod: object, name: string, props: AnyProps = {}): ReactElement {
  const component = member<ComponentType<AnyProps>>(mod, name);
  if (!component) throw new Error(`${name} is not exported`);
  return createElement(component, props);
}

// ─── placeholder glyphs (24 grid, 20 px at the call site) ────────────────────────────────────
add('placeholder', 'PhotoGlyph', 'media slot', [20, 20], () => el(mediaSlot, '__stand_PhotoGlyph'));
add('placeholder', 'ModelGlyph', '3d model cell', [20, 20], () => el(model, '__stand_ModelGlyph'));
add('placeholder', 'PenGlyph', 'two-half slot', [20, 20], () => el(twoHalf, '__stand_PenGlyph'));
add('placeholder', 'drawGlyph', 'generate ✦', [20, 20], () => el(fabrics, '__stand_drawGlyph'));

// ─── trim pictograms (64 tile) ───────────────────────────────────────────────────────────────
const TRIM_KINDS = [
  'fabric',
  'button',
  'zipper',
  'zipper-pull',
  'label',
  'snap',
  'buckle',
  'eyelet',
  'cord',
  'velcro',
  'rivet',
  'packaging',
  'artwork',
  'generic',
];
for (const kind of TRIM_KINDS) {
  add('trim', 'TrimPictogram', kind, [64, 64], () => el(trims, 'TrimPictogram', { kind }));
}
const TRIM_SLOTS = [
  { family: 'fabric', kind: 'shell', section: 'TECH_CARD_BOM_SECTION_FABRIC', name: 'shell' },
  { family: 'hardware', kind: 'button', section: '', name: 'button' },
  { family: 'hardware', kind: 'zipper', section: '', name: 'zip' },
  { family: 'hardware', kind: 'label', section: '', name: 'brand label' },
];
for (const slot of TRIM_SLOTS) {
  add('trim', 'TrimPictogramBackdrop', slot.name, [96, 96], () =>
    el(trims, 'TrimPictogramBackdrop', { slot }),
  );
}

// ─── garment pictograms (64×96 figure) ───────────────────────────────────────────────────────
const allFamilies = member<readonly string[]>(garment, 'GARMENT_FAMILIES') ?? [];
const undrawn = new Set(member<readonly string[]>(garment, 'UNDRAWN_FAMILIES') ?? []);
const drawn = allFamilies.filter((f) => !undrawn.has(f));
const FAMILY_COUNT = 12;
const families = Array.from(
  { length: Math.min(FAMILY_COUNT, drawn.length) },
  (_, i) => drawn[Math.floor((i * drawn.length) / Math.min(FAMILY_COUNT, drawn.length))],
);
for (const family of families) {
  for (const view of ['front', 'back']) {
    add('garment', 'GarmentPictogram', `${family} · ${view}`, [64, 96], () =>
      el(garment, 'GarmentPictogram', { family, view }),
    );
  }
}
for (const family of families.slice(0, 3)) {
  add('garment', 'PictogramBackdrop', `${family} · front`, [96, 144], () =>
    el(garment, 'PictogramBackdrop', { family, view: 'front' }),
  );
}

// ─── measurement pictograms (64×96 figure, h-36 w-24) ────────────────────────────────────────
const geometry = member<Record<string, unknown>>(measurement, '__stand_MEASUREMENT_GEOMETRY') ?? {};
for (const key of Object.keys(geometry)) {
  add('measurement', 'MeasurementPictogram', key, [96, 144], () =>
    el(measurement, 'MeasurementPictogram', {
      measurementName: `BODY_MEASUREMENT_NAME_${key.toUpperCase()}`,
    }),
  );
}
add('measurement', 'MeasurementPictogram', 'fallback', [96, 144], () =>
  el(measurement, 'MeasurementPictogram', { label: 'unknown measurement' }),
);

// ─── garment parts ───────────────────────────────────────────────────────────────────────────
const partTable = member<Record<string, Record<string, unknown>>>(parts, 'GARMENT_PARTS') ?? {};
for (const family of families.slice(0, 3)) {
  const keys = Object.keys(partTable[family] ?? {}).slice(0, 5);
  for (const part of keys) {
    add('parts', 'PartPictogram', `${family} · ${part}`, [64, 96], () =>
      el(parts, 'PartPictogram', { family, part }),
    );
  }
}
add('parts', 'PartPictogram', 'label', [64, 96], () =>
  el(parts, 'PartPictogram', { family: '', part: 'lbl_care' }),
);
const seamKinds = member<readonly string[]>(seams, 'SEAM_KINDS') ?? [];
for (const kind of seamKinds.slice(0, 4)) {
  add('parts', 'SeamPartPictogram', kind, [64, 96], () => el(parts, 'SeamPartPictogram', { kind }));
}

// ─── quiz tiles: seams, palette, hardware, labels ────────────────────────────────────────────
for (const kind of seamKinds) {
  add('seams', 'SeamIcon', kind, [48, 30], () =>
    el(seams, 'SeamIcon', { kind, size: 48, band: true }),
  );
}
add('seams', 'PaletteIcon', 'col_palette', [64, 64], () => el(seams, 'PaletteIcon', { size: 64 }));
for (const kind of member<readonly string[]>(hardware, 'HARDWARE_KINDS') ?? []) {
  add('hardware', 'HardwareIcon', kind, [64, 64], () =>
    el(hardware, 'HardwareIcon', { kind, size: 64 }),
  );
}
for (const kind of member<readonly string[]>(hardware, 'LABEL_KINDS') ?? []) {
  add('hardware', 'LabelIcon', kind, [64, 64], () => el(hardware, 'LabelIcon', { kind, size: 64 }));
}

// ─── marker quiz pictures (svg only; the HTML text labels over them are not part of the line) ─
function sketchSvg(markup: string): string {
  const start = markup.indexOf('<svg');
  const end = markup.lastIndexOf('</svg>');
  return start < 0 || end < 0 ? markup : markup.slice(start, end + '</svg>'.length);
}
function markerSize(svg: string): [number, number] {
  const box = /viewBox="([^"]+)"/.exec(svg)?.[1].split(/\s+/).map(Number);
  if (!box || box.length !== 4) return [320, 240];
  const [, , w, h] = box;
  return [Math.min(720, Math.round((240 * w) / h)), 240];
}
const MARKER: Array<[string, string, AnyProps]> = [
  ['SpreadChoicePicture', 'single', { kind: 'single' }],
  ['SpreadChoicePicture', 'table', { kind: 'table' }],
  ['TablePicture', '300 × 150', { lengthCm: 300, widthCm: 150, maxStackCm: 12 }],
  ['TablePicture', 'length only', { lengthCm: 250, widthCm: null }],
  ['KnifePicture', 'max 12 · stack 6', { maxStackCm: 12, stackCm: 6 }],
  [
    'LayersPicture',
    '6 layers ok',
    {
      tableLengthCm: 300,
      layCm: 220,
      plies: 6,
      plySizes: ['S', 'M', 'L'],
      stackCm: 1.2,
      stackOk: true,
      faceToFace: false,
    },
  ],
  [
    'LayersPicture',
    '10 face-to-face over',
    {
      tableLengthCm: 300,
      layCm: 260,
      plies: 10,
      plySizes: ['M'],
      stackCm: 14,
      stackOk: false,
      faceToFace: true,
    },
  ],
  [
    'LayersPicture',
    'single',
    {
      tableLengthCm: 300,
      layCm: 180,
      plies: 1,
      plySizes: ['M'],
      stackCm: 0,
      stackOk: true,
      faceToFace: false,
    },
  ],
  ['EndsPicture', '2 cm each end', { endLossCm: 2, layCm: 220, tableLengthCm: 300 }],
];
for (const [name, variant, props] of MARKER) {
  const before = rows.length;
  add('marker', name, variant, [320, 240], () => el(marker, name, props));
  const row = rows[before];
  if (row && !row.error) {
    row.svg = sketchSvg(row.svg);
    [row.w, row.h] = markerSize(row.svg);
  }
}

process.stdout.write(JSON.stringify(rows));
