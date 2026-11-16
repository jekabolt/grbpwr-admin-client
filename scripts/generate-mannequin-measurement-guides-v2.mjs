import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '..');
const SOURCE_DIR = resolve(ROOT, 'src/assets/mannequin');
const OUTPUT_DIR = resolve(SOURCE_DIR, 'measurement-guides-v2');
const FULL_VIEWBOX = Object.freeze([0, 0, 240, 360]);
const CORAL = '#e85d4a';

const point = (x, y) => Object.freeze([x, y]);
const line = (path, points, view = 'front', arrows = false) =>
  Object.freeze({ path, points: Object.freeze(points), view, arrows });
const loop = (left, right, y, depth, view = 'front') =>
  Object.freeze({
    view,
    points: Object.freeze([point(left, y), point(right, y)]),
    rearPath: `M ${left} ${y} C ${left} ${y - depth} ${right} ${y - depth} ${right} ${y}`,
    path: `M ${right} ${y} C ${right} ${y + depth} ${left} ${y + depth} ${left} ${y}`,
  });

// Coordinates are deliberately authored against the shared 2:3 artwork rather than inferred from
// a body value. The output is a visual measuring guide, never an anatomical or fit claim.
const GUIDES = Object.freeze({
  BODY_MEASUREMENT_NAME_CHEST: loop(74, 166, 88, 8),
  BODY_MEASUREMENT_NAME_UNDER_BUST: loop(77, 163, 105, 7),
  BODY_MEASUREMENT_NAME_WAIST: loop(83, 157, 137, 6),
  BODY_MEASUREMENT_NAME_HIGH_HIP: loop(76, 164, 154, 7),
  BODY_MEASUREMENT_NAME_HIP: loop(68, 172, 170, 9),
  BODY_MEASUREMENT_NAME_NECK_BASE: loop(101, 139, 56, 5),
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: line('M 78 64 Q 120 52 162 64', [
    point(78, 64),
    point(162, 64),
  ]),
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: line('M 164 64 Q 168 105 170 143 Q 171 158 170 168', [
    point(164, 64),
    point(170, 168),
  ]),
  BODY_MEASUREMENT_NAME_BICEP: loop(145, 160, 94, 5),
  BODY_MEASUREMENT_NAME_WRIST: loop(157, 171, 168, 3.5),
  BODY_MEASUREMENT_NAME_INSEAM: line('M 120 181 Q 112 240 107 328', [
    point(120, 181),
    point(107, 328),
  ]),
  BODY_MEASUREMENT_NAME_THIGH: loop(72, 118, 203, 6),
  BODY_MEASUREMENT_NAME_KNEE: loop(79, 113, 238, 5),
  BODY_MEASUREMENT_NAME_CALF: loop(82, 111, 275, 5),
  BODY_MEASUREMENT_NAME_ANKLE: loop(86, 108, 325, 4),
  BODY_MEASUREMENT_NAME_HEIGHT: line('M 44 4 L 44 352 M 37 4 L 51 4 M 37 352 L 51 352', [
    point(44, 4),
    point(44, 352),
  ]),
  BODY_MEASUREMENT_NAME_HPS_HEIGHT: line('M 137 54 L 184 54 L 184 352 M 177 352 L 191 352', [
    point(137, 54),
    point(184, 352),
  ]),
  BODY_MEASUREMENT_NAME_HPS_TO_WAIST_FRONT: line('M 137 54 Q 143 94 145 137', [
    point(137, 54),
    point(145, 137),
  ]),
  BODY_MEASUREMENT_NAME_CF_NECK_TO_WAIST: line('M 120 55 Q 116 96 120 137', [
    point(120, 55),
    point(120, 137),
  ]),
  BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST: line(
    'M 120 55 Q 124 96 120 137',
    [point(120, 55), point(120, 137)],
    'back',
  ),
  BODY_MEASUREMENT_NAME_WAIST_HEIGHT: line('M 83 137 L 58 137 L 58 352 M 51 352 L 65 352', [
    point(83, 137),
    point(58, 352),
  ]),
  BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP: line(
    'M 102 137 L 148 137 M 102 154 L 148 154 M 148 137 L 148 154',
    [point(148, 137), point(148, 154)],
  ),
  BODY_MEASUREMENT_NAME_WAIST_TO_HIP: line(
    'M 102 137 L 148 137 M 102 170 L 148 170 M 148 137 L 148 170',
    [point(148, 137), point(148, 170)],
  ),
  BODY_MEASUREMENT_NAME_ACROSS_FRONT: line('M 82 84 Q 120 77 158 84', [
    point(82, 84),
    point(158, 84),
  ]),
  BODY_MEASUREMENT_NAME_ACROSS_BACK: line(
    'M 80 78 Q 120 68 160 78',
    [point(80, 78), point(160, 78)],
    'back',
  ),
  BODY_MEASUREMENT_NAME_CHEST_DEPTH: line(
    'M 92 122 L 150 122',
    [point(92, 122), point(150, 122)],
    'side',
    true,
  ),
  BODY_MEASUREMENT_NAME_WAIST_DEPTH: line(
    'M 95 164 L 145 164',
    [point(95, 164), point(145, 164)],
    'side',
    true,
  ),
  BODY_MEASUREMENT_NAME_HIP_DEPTH: line(
    'M 90 197 L 158 197',
    [point(90, 197), point(158, 197)],
    'side',
    true,
  ),
  BODY_MEASUREMENT_NAME_SHOULDER_LENGTH: line('M 137 54 Q 153 57 171 64', [
    point(137, 54),
    point(171, 64),
  ]),
  BODY_MEASUREMENT_NAME_SHOULDER_DROP: line('M 139 56 L 159 56 L 159 65', [
    point(139, 56),
    point(159, 65),
  ]),
  BODY_MEASUREMENT_NAME_ARMSCYE_DEPTH: line('M 137 54 L 137 108', [
    point(137, 54),
    point(137, 108),
  ]),
  BODY_MEASUREMENT_NAME_ARMSCYE_CIRCUMFERENCE: loop(142, 164, 86, 13),
  BODY_MEASUREMENT_NAME_BUST_APEX_TO_APEX: line('M 100 89 Q 120 92 140 89', [
    point(100, 89),
    point(140, 89),
  ]),
  BODY_MEASUREMENT_NAME_HPS_TO_BUST_APEX: line('M 137 54 Q 140 70 140 89', [
    point(137, 54),
    point(140, 89),
  ]),
});

const UPPER_TORSO_VIEWBOX = Object.freeze([60, 30, 120, 180]);
const TORSO_VIEWBOX = Object.freeze([55, 45, 130, 195]);
const ARM_VIEWBOX = Object.freeze([125, 50, 90, 135]);
const WRIST_VIEWBOX = Object.freeze([135, 115, 70, 105]);
const LOWER_BODY_VIEWBOX = Object.freeze([60, 165, 120, 180]);
const SIDE_TORSO_VIEWBOX = Object.freeze([65, 70, 120, 180]);

const GUIDE_VIEWBOXES = Object.freeze({
  BODY_MEASUREMENT_NAME_CHEST: TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_UNDER_BUST: TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_WAIST: TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_HIGH_HIP: TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_HIP: TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_NECK_BASE: UPPER_TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: UPPER_TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: ARM_VIEWBOX,
  BODY_MEASUREMENT_NAME_BICEP: ARM_VIEWBOX,
  BODY_MEASUREMENT_NAME_WRIST: WRIST_VIEWBOX,
  BODY_MEASUREMENT_NAME_INSEAM: LOWER_BODY_VIEWBOX,
  BODY_MEASUREMENT_NAME_THIGH: LOWER_BODY_VIEWBOX,
  BODY_MEASUREMENT_NAME_KNEE: LOWER_BODY_VIEWBOX,
  BODY_MEASUREMENT_NAME_CALF: LOWER_BODY_VIEWBOX,
  BODY_MEASUREMENT_NAME_ANKLE: LOWER_BODY_VIEWBOX,
  BODY_MEASUREMENT_NAME_HPS_TO_WAIST_FRONT: TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_CF_NECK_TO_WAIST: TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST: TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP: TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_WAIST_TO_HIP: TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_ACROSS_FRONT: UPPER_TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_ACROSS_BACK: UPPER_TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_CHEST_DEPTH: SIDE_TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_WAIST_DEPTH: SIDE_TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_HIP_DEPTH: SIDE_TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_SHOULDER_LENGTH: UPPER_TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_SHOULDER_DROP: UPPER_TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_ARMSCYE_DEPTH: UPPER_TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_ARMSCYE_CIRCUMFERENCE: UPPER_TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_BUST_APEX_TO_APEX: UPPER_TORSO_VIEWBOX,
  BODY_MEASUREMENT_NAME_HPS_TO_BUST_APEX: UPPER_TORSO_VIEWBOX,
});

const GENDERS = Object.freeze(['female', 'male', 'neutral']);

function sourcePath(gender, view) {
  const suffix = view === 'front' ? '' : view === 'side' ? '-side-arms-up' : '-back';
  return resolve(SOURCE_DIR, `measurement-guide-${gender}${suffix}.png`);
}

function svgFor(baseDataUrl, guide, viewBox) {
  const arrow = guide.arrows
    ? `<defs><marker id="arrow" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="3.5" markerHeight="3.5" orient="auto-start-reverse"><path d="M 8 0 L 0 4 L 8 8 Z" fill="${CORAL}"/></marker></defs>`
    : '';
  const halo = `<path d="${guide.path}" fill="none" stroke="#fff" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const rear = guide.rearPath
    ? `<path d="${guide.rearPath}" fill="none" stroke="#fff" stroke-width="4.6" stroke-linecap="round"/><path d="${guide.rearPath}" fill="none" stroke="${CORAL}" stroke-opacity="0.46" stroke-width="2" stroke-linecap="round" stroke-dasharray="2.4 3.2"/>`
    : '';
  const core = `<path d="${guide.path}" fill="none" stroke="${CORAL}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"${guide.arrows ? ' marker-start="url(#arrow)" marker-end="url(#arrow)"' : ''}/>`;
  const points = guide.arrows
    ? ''
    : guide.points
        .map(
          ([x, y]) =>
            `<circle cx="${x}" cy="${y}" r="3.1" fill="${CORAL}" stroke="#fff" stroke-width="1.5"/>`,
        )
        .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox.join(' ')}" width="512" height="768">
  ${arrow}
  <image x="0" y="0" width="240" height="360" preserveAspectRatio="none" xlink:href="${baseDataUrl}"/>
  <g>${rear}${halo}${core}${points}</g>
</svg>`;
}

async function renderGuide(tempDirectory, gender, measurementName, guide) {
  const base = await readFile(sourcePath(gender, guide.view));
  const baseDataUrl = `data:image/png;base64,${base.toString('base64')}`;
  const stem = `${gender}-${measurementName}`;
  const svgPath = join(tempDirectory, `${stem}.svg`);
  const pngPath = join(tempDirectory, `${stem}.png`);
  const genderDirectory = resolve(OUTPUT_DIR, gender);
  const webpPath = resolve(genderDirectory, `${measurementName}.webp`);
  await mkdir(genderDirectory, { recursive: true });
  await writeFile(
    svgPath,
    svgFor(baseDataUrl, guide, GUIDE_VIEWBOXES[measurementName] ?? FULL_VIEWBOX),
  );
  await execFileAsync('rsvg-convert', [
    '--width',
    '512',
    '--height',
    '768',
    '--output',
    pngPath,
    svgPath,
  ]);
  await execFileAsync('magick', [pngPath, '-strip', '-quality', '88', webpPath]);
  return webpPath;
}

async function main() {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'mannequin-measurement-guides-v2-'));
  try {
    const outputs = [];
    for (const gender of GENDERS) {
      for (const [measurementName, guide] of Object.entries(GUIDES)) {
        outputs.push(await renderGuide(tempDirectory, gender, measurementName, guide));
      }
    }
    process.stdout.write(
      `${outputs.length} measurement guide images written to ${basename(OUTPUT_DIR)}\n`,
    );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

await main();
