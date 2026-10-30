import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const sourceArg = args.find((arg) => arg !== '--check');
const sourcePath = sourceArg
  ? resolve(process.cwd(), sourceArg)
  : resolve(root, 'scripts/op-icons/full.html');
const generatedPath = resolve(root, 'src/components/managers/tech-card/op-icons/icons.gen.ts');
const contactPath = resolve(root, 'scripts/op-icons/contact.html');

const source = readFileSync(sourcePath, 'utf8');
const sheetHash = createHash('sha256').update(source).digest('hex');

const attrsOf = (raw) =>
  Object.fromEntries([...raw.matchAll(/([:\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const number = (value) => Number(value);
const compactNumber = (value) => `${Number(value)}`;

function ellipsePath({ cx, cy, rx, ry }) {
  const left = number(cx) - number(rx);
  const width = number(rx) * 2;
  return `M${compactNumber(left)} ${cy} a${rx} ${ry} 0 1 0 ${compactNumber(width)} 0 a${rx} ${ry} 0 1 0 -${compactNumber(width)} 0`;
}

function parseShapes(svgBody) {
  const shapes = [];
  for (const match of svgBody.matchAll(/<(path|circle|rect|ellipse)\b([^>]*)\/>/g)) {
    const [, tag, rawAttrs] = match;
    const attrs = attrsOf(rawAttrs);
    const dashed = /(?:^|\s)d(?:\s|$)/.test(attrs.class ?? '');
    if (tag === 'path') {
      shapes.push({ type: 'p', d: attrs.d, dashed });
    } else if (tag === 'circle') {
      shapes.push({
        type: 'c',
        cx: number(attrs.cx),
        cy: number(attrs.cy),
        r: number(attrs.r),
        dashed,
      });
    } else if (tag === 'rect') {
      shapes.push({
        type: 'r',
        x: number(attrs.x),
        y: number(attrs.y),
        w: number(attrs.width),
        h: number(attrs.height),
        rx: number(attrs.rx ?? 0),
        dashed,
      });
    } else {
      // The tuple contract deliberately has only paths, circles and rectangles. The sheet's
      // three repeated ellipses are represented by their exact two-arc SVG equivalent.
      shapes.push({ type: 'p', d: ellipsePath(attrs), dashed });
    }
  }
  if (shapes.length === 0) throw new Error('SVG has no supported shapes');
  return shapes;
}

function firstSvg(line) {
  const match = line.match(/<svg\b[^>]*>(.*?)<\/svg>/);
  if (!match) throw new Error(`card has no SVG: ${line.slice(0, 100)}`);
  return parseShapes(match[1]);
}

const valueIn = (line, className) => {
  const match = line.match(new RegExp(`<div class="${className}">(.*?)</div>`));
  if (!match) throw new Error(`card has no .${className}: ${line.slice(0, 100)}`);
  return match[1];
};

const cards = source
  .split(/\r?\n/)
  .filter((line) => line.startsWith('<div class="card">'))
  .map((line) => ({
    token: valueIn(line, 'tok'),
    label: valueIn(line, 'lab'),
    group: valueIn(line, 'grp'),
    shapes: firstSvg(line),
  }));

if (cards.length !== 202) throw new Error(`expected 202 sheet cards, got ${cards.length}`);
const cardByToken = new Map(cards.map((card) => [card.token, card]));
if (cardByToken.size !== cards.length) throw new Error('sheet card tokens are not unique');

const rejected = new Set(['double_fold (v2)', 'other (а)']);
const pressDemos = new Set(
  cards.filter((c) => c.token.startsWith('press_toward=')).map((c) => c.token),
);
const topstitchDemos = new Set([
  'topstitch_1 · topstitch_raw',
  'topstitch_2',
  'topstitch_3',
  'topstitch_4plus',
  'lapped ×2',
  'lapped ×3',
  'hem_turned ×2',
  'hem_turned ×3',
  'edge',
  'in_ditch',
  'parallel_to_seam',
]);

const cardKeys = new Map([
  ['raw · bound_tape', ['bound_tape']],
  ['single_fold · bound_open', ['bound_open']],
  ['double_fold · bound_closed', ['bound_closed']],
  ['frame · bound_frame', ['bound_frame']],
  ['seam_one_side · join_lockstitch', ['seam_one_side', 'join_lockstitch']],
  ['hem_closed · hem_turned', ['hem_closed', 'hem_turned']],
  ['edge_overlock · overlock_serge', ['edge_overlock', 'overlock_serge']],
  ['blind_hem · blindhem', ['blind_hem', 'blindhem']],
  ['casing · drawcord', ['casing']],
  ['cover_hem · coverstitch', ['cover_hem', 'coverstitch']],
  ['cross_x', ['button_cross_x']],
  ['parallel', ['button_parallel']],
  ['square', ['button_square']],
  ['u_shape', ['button_u_shape']],
  ['other (б)', ['button_other']],
  ['two_hole', ['button_two_hole']],
  ['not_stated', ['button_not_stated']],
  ['steam', ['press_steam']],
  ['final', ['press_final']],
  ['ease_in', ['press_ease_in']],
  ['stretch', ['press_stretch']],
  ['mould', ['press_mould']],
  ['to_one_side', ['press_to_one_side']],
  ['fuse_full · fuse', ['fuse_full', 'fuse']],
  ['ease_in_machine', ['ease_in']],
  ['topstitch_0', ['topstitch']],
]);

function keysFor(card) {
  if (rejected.has(card.token) || pressDemos.has(card.token) || topstitchDemos.has(card.token)) {
    return [];
  }
  return cardKeys.get(card.token) ?? [card.token];
}

const icons = new Map();
for (const card of cards) {
  for (const key of keysFor(card)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error(`invalid icon key ${key}`);
    if (icons.has(key)) throw new Error(`duplicate icon key ${key}`);
    icons.set(key, card.shapes);
  }
}

// These miniatures are deliberately authoritative for work icons. Several have a seam card alias,
// but the sheet says that the work keeps its own miniature drawing.
const miniatureKeys = [
  'join_lockstitch',
  'chainstitch',
  'coverstitch',
  'coverlock',
  'zigzag',
  'blindhem',
  'moscow_hem',
  'hem_turned',
  'overlock_serge',
  'tape_seam_hot_air',
  'ultrasonic_weld',
];
const titledSvg = new Map();
for (const match of source.matchAll(/<svg\b[^>]*>\s*<title>([^<]+)<\/title>([\s\S]*?)<\/svg>/g)) {
  if (!titledSvg.has(match[1])) titledSvg.set(match[1], parseShapes(match[2]));
}
for (const key of miniatureKeys) {
  const shapes = titledSvg.get(key);
  if (!shapes) throw new Error(`missing miniature ${key}`);
  icons.set(key, shapes);
}

// Parent work tokens introduced by SPEC-B1 and field-driven defaults intentionally point at an
// approved sheet drawing. The variant resolver replaces them when the narrower field is present.
const aliases = new Map([
  ['attach_hook', 'hook_eye'],
  ['attach_hook_loop', 'hook_loop_tape'],
  ['attach_patch', 'patch'],
  ['bind_tape_edge', 'bound_open'],
  ['button_attach', 'button_not_stated'],
  ['buttonhole', 'buttonhole_straight'],
  ['enclose_magnet', 'magnet_sewn'],
  ['gather_ease', 'gather'],
  ['insert_cord', 'cord_round'],
  ['pleat', 'pleat_knife'],
  ['pocket_welt', 'pocket_welt_single'],
  ['set_magnet', 'magnet_prong'],
  ['sew', 'join_lockstitch'],
]);
for (const [alias, target] of aliases) {
  const shapes = icons.get(target);
  if (!shapes) throw new Error(`alias ${alias} points at missing ${target}`);
  if (icons.has(alias)) throw new Error(`alias ${alias} collides with a sheet key`);
  icons.set(alias, shapes);
}

const shapeTuple = (shape) => {
  const dashed = shape.dashed ? ',1' : '';
  if (shape.type === 'p') return `['p',${quote(shape.d)}${dashed}]`;
  if (shape.type === 'c') return `['c',${shape.cx},${shape.cy},${shape.r}${dashed}]`;
  return `['r',${shape.x},${shape.y},${shape.w},${shape.h},${shape.rx}${dashed}]`;
};
const shapesTs = (shapes) => `[${shapes.map(shapeTuple).join(',')}]`;
const signature = (shapes) => shapes.map(shapeTuple).join('|');

function subtract(base, complete) {
  const counts = new Map();
  for (const shape of base) {
    const key = shapeTuple(shape);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return complete.filter((shape) => {
    const key = shapeTuple(shape);
    const count = counts.get(key) ?? 0;
    if (!count) return true;
    counts.set(key, count - 1);
    return false;
  });
}

function commonShapes(a, b) {
  const inB = new Map();
  for (const shape of b) {
    const key = shapeTuple(shape);
    inB.set(key, (inB.get(key) ?? 0) + 1);
  }
  return a.filter((shape) => {
    const key = shapeTuple(shape);
    const count = inB.get(key) ?? 0;
    if (!count) return false;
    inB.set(key, count - 1);
    return true;
  });
}

const shapesOf = (token) => {
  const card = cardByToken.get(token);
  if (!card) throw new Error(`missing card ${token}`);
  return card.shapes;
};

const pressBase = shapesOf('to_one_side');
const arrow = Object.fromEntries(
  [
    ['up', 'press_toward=up'],
    ['down', 'press_toward=down'],
    ['in', 'press_toward=toward_centre'],
    ['out', 'press_toward=away_from_centre'],
  ].map(([key, token]) => [key, subtract(pressBase, shapesOf(token))]),
);
const chip = Object.fromEntries(
  [
    ['F', 'front'],
    ['B', 'back'],
    ['SL', 'sleeve'],
    ['BD', 'body'],
    ['FC', 'facing'],
    ['SH', 'shell'],
    ['LN', 'lining'],
    ['?', 'other'],
  ].map(([key, token]) => [key, subtract(pressBase, shapesOf(`press_toward=${token}`))]),
);

const topstitchBase = shapesOf('topstitch_0');
const lappedBase = commonShapes(shapesOf('lapped ×2'), shapesOf('lapped ×3')).slice(0, 2);
const hemBase = commonShapes(shapesOf('hem_turned ×2'), shapesOf('hem_turned ×3')).slice(0, 1);
// A turned edge (collar, cuff, flap: two plies sewn face to face, turned, topstitched) and a single
// raw-edge hem have no row cards on the sheet: their bars are drawn here, across the whole edge,
// and the base drops the sheet's own one-row mark.
// The turned edge with rows is the owner's own drawing, not the catalog card: three full plies,
// two folds on the right joining ply 1–2 and 2–3 (a «3»), and the bars go straight through all
// three. The seam catalog keeps the faced_split card; only the rows base is this glyph.
const facedBase = [
  { type: 'p', d: 'M3 6 H22 a3 3 0 0 1 0 6 H3', dashed: false },
  { type: 'p', d: 'M22 12 a3 3 0 0 1 0 6 H3', dashed: false },
];
const hemRawBase = shapesOf('hem_raw').slice(0, 2);
const vbars = (xs, y0, y1) =>
  xs.map((x) => ({ type: 'p', d: `M${x} ${y0} V${y1}`, dashed: false }));
const bars = {
  faced: {
    1: vbars([18], 3, 21),
    2: vbars([18, 15], 3, 21),
    3: vbars([18, 15, 12], 3, 21),
  },
  hem_raw: {
    1: vbars([19], 6, 16),
    2: vbars([20.5, 17.5], 6, 16),
    3: vbars([21, 18.5, 16], 6, 16),
  },
  topstitch: {
    1: subtract(topstitchBase, shapesOf('topstitch_1 · topstitch_raw')),
    2: subtract(topstitchBase, shapesOf('topstitch_2')),
    3: subtract(topstitchBase, shapesOf('topstitch_3')),
  },
  lapped_raw: {
    1: subtract(lappedBase, cardByToken.get('lapped_raw').shapes),
    2: subtract(lappedBase, shapesOf('lapped ×2')),
    3: subtract(lappedBase, shapesOf('lapped ×3')),
  },
  hem_closed: {
    1: subtract(hemBase, cardByToken.get('hem_closed · hem_turned').shapes),
    2: subtract(hemBase, shapesOf('hem_turned ×2')),
    3: subtract(hemBase, shapesOf('hem_turned ×3')),
  },
};
const parallelBar = subtract(topstitchBase, shapesOf('parallel_to_seam')).slice(0, 1);
const parallelGuide = subtract([...topstitchBase, ...parallelBar], shapesOf('parallel_to_seam'));

// Duplicate geometry is allowed only through this explicit alias list. It catches a copied card
// receiving a new identity without a conscious resolver mapping.
const duplicateAliases = new Map(aliases);
duplicateAliases.set('fuse_full', 'fuse');
duplicateAliases.set('join_lockstitch', 'seam_one_side');
duplicateAliases.set('sew', 'seam_one_side');
duplicateAliases.set('hem_turned', 'hem_closed');
duplicateAliases.set('zigzag', 'hem_zigzag');
duplicateAliases.set('overlock_serge', 'edge_overlock');
duplicateAliases.set('blindhem', 'blind_hem');
duplicateAliases.set('coverstitch', 'cover_hem');
const byDrawing = new Map();
for (const [key, shapes] of icons) {
  const sig = signature(shapes);
  const group = byDrawing.get(sig) ?? [];
  group.push(key);
  byDrawing.set(sig, group);
}
for (const group of byDrawing.values()) {
  if (group.length < 2) continue;
  const roots = new Set(group.map((key) => duplicateAliases.get(key) ?? key));
  if (roots.size > 1) throw new Error(`identical undeclared drawings: ${group.join(', ')}`);
}

const compareKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const orderedIcons = [...icons].sort(([a], [b]) => compareKey(a, b));
const orderedAliases = [...duplicateAliases].sort(([a], [b]) => compareKey(a, b));

function quote(value) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

const recordTs = (record) =>
  Object.entries(record)
    .map(([key, shapes]) => `${quote(key)}:${shapesTs(shapes)}`)
    .join(',');
const barsTs = (families) =>
  Object.entries(families)
    .map(
      ([family, rows]) =>
        `${quote(family)}:{1:${shapesTs(rows[1])},2:${shapesTs(rows[2])},3:${shapesTs(rows[3])}}`,
    )
    .join(',');

const generated = `// generated — do not edit
// sheet sha256: ${sheetHash}

export type Shape =
  | readonly ['p', string, 1?]
  | readonly ['c', number, number, number, 1?]
  | readonly ['r', number, number, number, number, number, 1?];

const defineIcons = <K extends string>(icons: Record<K, readonly Shape[]>): Readonly<Record<K, readonly Shape[]>> => icons;

export const ICONS = defineIcons({${orderedIcons.map(([key, shapes]) => `${quote(key)}:${shapesTs(shapes)}`).join(',')}});

export type IconKey = keyof typeof ICONS;
export type BarFamily = 'topstitch' | 'lapped_raw' | 'hem_closed' | 'faced' | 'hem_raw';

export const ICON_ALIASES = {${orderedAliases.map(([alias, target]) => `${quote(alias)}:${quote(target)}`).join(',')}} as const;

export const OVERLAYS = {
  arrow:{${recordTs(arrow)}},
  chip:{${recordTs(chip)}},
  bars:{${barsTs(bars)}},
  mode:{
    edge:{dx:3,shapes:[]},
    in_ditch:{dx:7,shapes:[]},
    parallel_to_seam:{dx:-6,shapes:${shapesTs(parallelGuide)}},
  },
  moreAnchor:[23.5,5.5],
} as const;

export const BAR_BASE: Partial<Record<IconKey, { family: BarFamily; shapes: readonly Shape[]; zone: readonly [number, number, number, number] }>> = {
  seam_one_side:{family:'topstitch',shapes:ICONS.topstitch,zone:[10,17,7,22.5]},
  topstitch:{family:'topstitch',shapes:ICONS.topstitch,zone:[10,17,7,22.5]},
  lapped_raw:{family:'lapped_raw',shapes:${shapesTs(lappedBase)},zone:[13,19,8,17]},
  hem_closed:{family:'hem_closed',shapes:${shapesTs(hemBase)},zone:[12,18.5,6,16]},
  faced_split:{family:'faced',shapes:${shapesTs(facedBase)},zone:[12,18,3,21]},
  hem_raw:{family:'hem_raw',shapes:${shapesTs(hemRawBase)},zone:[16,21,6,16]},
};
`;

const escapeHtml = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const shapeHtml = (shape) => {
  const dashed = shape.dashed ? ' class="d"' : '';
  if (shape.type === 'p') return `<path d="${shape.d}"${dashed}/>`;
  if (shape.type === 'c')
    return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"${dashed}/>`;
  return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${shape.rx}"${dashed}/>`;
};
const svgHtml = (shapes, size, extra = '', transform = '') => {
  const width = size === 40 ? 53 : 32;
  const body = transform
    ? `${shapes.map(shapeHtml).join('')}<g transform="translate(${transform} 0)">${extra}</g>`
    : `${shapes.map(shapeHtml).join('')}${extra}`;
  return `<svg viewBox="0 0 32 24" width="${width}" height="${size}" aria-hidden="true">${body}</svg>`;
};
const pairHtml = (shapes, extra = '', transform = '') =>
  `<span class="pair">${svgHtml(shapes, 40, extra, transform)}${svgHtml(shapes, 24, extra, transform)}</span>`;
const itemHtml = (label, art) =>
  `<div class="item"><div class="art">${art}</div><code>${escapeHtml(label)}</code></div>`;

const iconItems = orderedIcons.map(([key, shapes]) => itemHtml(key, pairHtml(shapes))).join('\n');
const arrowItems = Object.entries(arrow)
  .map(([key, shapes]) =>
    itemHtml(`arrow ${key}`, pairHtml(pressBase, shapes.map(shapeHtml).join(''))),
  )
  .join('\n');
const chipItems = Object.entries(chip)
  .map(([key, shapes]) =>
    itemHtml(`chip ${key}`, pairHtml(pressBase, shapes.map(shapeHtml).join(''))),
  )
  .join('\n');
const barBase = {
  topstitch: topstitchBase,
  lapped_raw: lappedBase,
  hem_closed: hemBase,
  faced: facedBase,
  hem_raw: hemRawBase,
};
const barItems = Object.entries(bars)
  .flatMap(([family, rows]) =>
    [1, 2, 3, 4].map((row) => {
      const count = Math.min(row, 3);
      const extra = rows[count].map(shapeHtml).join('');
      const more = row > 3 ? '<text x="23.5" y="5.5" class="more">×4</text>' : '';
      return itemHtml(`${family} ×${row}`, pairHtml(barBase[family], `${extra}${more}`));
    }),
  )
  .join('\n');
const modeItems = Object.entries({ edge: 3, in_ditch: 7, parallel_to_seam: -6 })
  .map(([mode, dx]) => {
    const guide = mode === 'parallel_to_seam' ? parallelGuide.map(shapeHtml).join('') : '';
    const bar = bars.topstitch[1].map(shapeHtml).join('');
    const art = [40, 24]
      .map(
        (size) =>
          `<span>${svgHtml(topstitchBase, size, `${guide}<g transform="translate(${dx} 0)">${bar}</g>`)}</span>`,
      )
      .join('');
    return itemHtml(`mode ${mode}`, `<span class="pair">${art}</span>`);
  })
  .join('\n');
const genericChipItems = ['CTR', 'LAP', 'EXP', 'FLY']
  .map((label) => {
    const extra = `<rect x="18.5" y="2" width="12" height="9" rx="1.5"/><text x="24.5" y="7.5" class="chip">${label}</text>`;
    return itemHtml(`chip ${label}`, pairHtml(icons.get('set_zip'), extra));
  })
  .join('\n');

const contact = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Operation icon contact sheet</title>
<!-- generated — do not edit; sheet sha256: ${sheetHash} -->
<style>
*{box-sizing:border-box}body{margin:0;padding:20px;background:#f2f2f2;color:#000;font:12px/1.35 ui-monospace,monospace}h1{font-size:16px}h2{font-size:13px;margin-top:28px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}.item{background:#fff;border:1px solid #ccc;padding:8px;min-width:0}.art{display:flex;min-height:48px;align-items:center}.pair{display:flex;align-items:center;gap:12px}svg{display:block;overflow:visible;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}svg *{vector-effect:non-scaling-stroke}.d{stroke-dasharray:3 3}.more,.chip{fill:currentColor;stroke:none;font-family:ui-monospace,monospace}.more{font-size:4px}.chip{font-size:3.2px;text-anchor:middle}code{display:block;margin-top:5px;overflow-wrap:anywhere;font-size:10px}
</style>
<h1>Operation icons · ${orderedIcons.length} keys · 40 / 24 px</h1>
<p>sheet sha256 ${sheetHash}</p>
<h2>Keys</h2><div class="grid">${iconItems}</div>
<h2>Topstitch bars</h2><div class="grid">${barItems}${modeItems}</div>
<h2>Press arrows</h2><div class="grid">${arrowItems}</div>
<h2>Chips</h2><div class="grid">${chipItems}${genericChipItems}</div>
</html>
`;

const outputs = [
  [generatedPath, generated],
  [contactPath, contact],
];

if (check) {
  const stale = outputs.filter(
    ([path, contents]) => !existsSync(path) || readFileSync(path, 'utf8') !== contents,
  );
  if (stale.length) {
    for (const [path] of stale) console.error(`out of date: ${path.slice(root.length + 1)}`);
    process.exitCode = 1;
  } else {
    console.log(`op icons are current (${orderedIcons.length} keys, ${sheetHash})`);
  }
} else {
  for (const [path, contents] of outputs) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  console.log(`generated ${orderedIcons.length} icon keys from ${cards.length} sheet cards`);
}
