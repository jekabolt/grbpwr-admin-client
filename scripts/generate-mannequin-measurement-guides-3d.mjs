import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const execFileAsync = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT_DIR = resolve(ROOT, 'src/assets/mannequin/measurement-guides-v2');
const GENDERS = Object.freeze(['female', 'male', 'neutral']);
const MEASUREMENTS = Object.freeze([
  'BODY_MEASUREMENT_NAME_CHEST',
  'BODY_MEASUREMENT_NAME_UNDER_BUST',
  'BODY_MEASUREMENT_NAME_WAIST',
  'BODY_MEASUREMENT_NAME_HIGH_HIP',
  'BODY_MEASUREMENT_NAME_HIP',
  'BODY_MEASUREMENT_NAME_BICEP',
  'BODY_MEASUREMENT_NAME_WRIST',
  'BODY_MEASUREMENT_NAME_THIGH',
  'BODY_MEASUREMENT_NAME_KNEE',
  'BODY_MEASUREMENT_NAME_CALF',
  'BODY_MEASUREMENT_NAME_ANKLE',
  'BODY_MEASUREMENT_NAME_NECK',
]);
// `--only=NAME,NAME` re-renders a subset and leaves the other committed images untouched.
const ONLY = process.argv
  .find((argument) => argument.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',')
  .filter(Boolean);
const SELECTED = ONLY ? MEASUREMENTS.filter((name) => ONLY.includes(name)) : MEASUREMENTS;
if (SELECTED.length === 0) throw new Error('--only selected no known measurement.');

const server = await createServer({
  cacheDir: 'node_modules/.cache/mannequin-measurement-guide-capture-vite',
  optimizeDeps: {
    include: ['three/examples/jsm/controls/TransformControls.js'],
    esbuildOptions: { target: 'esnext' },
  },
  server: { hmr: false, host: '127.0.0.1', port: 4574, strictPort: false },
});

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'mannequin-measurement-guides-3d-'));
let browser;
try {
  await server.listen();
  const origin = server.resolvedUrls?.local?.[0];
  if (!origin) throw new Error('The local 3D capture server did not publish an origin.');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 514, height: 804 },
    deviceScaleFactor: 2,
  });

  let count = 0;
  for (const gender of GENDERS) {
    const genderDirectory = resolve(OUTPUT_DIR, gender);
    await mkdir(genderDirectory, { recursive: true });
    for (const measurement of SELECTED) {
      const url = new URL('/__model-measurement-guide-capture-v1', origin);
      url.searchParams.set('gender', gender);
      url.searchParams.set('measurement', measurement);
      url.searchParams.set('view', 'front');
      await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const canvas = page.locator('canvas[data-active-measurement-guide]');
      await canvas.waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForFunction(
        () => {
          const element = document.querySelector('canvas[data-active-measurement-guide]');
          return (
            element?.dataset.measurementGuideStatus === 'visible' &&
            Number(element.dataset.renderCount ?? 0) >= 5
          );
        },
        undefined,
        { timeout: 30_000 },
      );
      await page.waitForTimeout(250);

      const pngPath = join(temporaryDirectory, `${gender}-${measurement}.png`);
      const webpPath = resolve(genderDirectory, `${measurement}.webp`);
      await canvas.screenshot({ path: pngPath });
      await execFileAsync('magick', [
        pngPath,
        '-filter',
        'Lanczos',
        '-resize',
        '512x768!',
        '-strip',
        '-quality',
        '90',
        webpPath,
      ]);
      count += 1;
      process.stdout.write(`captured ${count}/${GENDERS.length * SELECTED.length}\r`);
    }
  }
  process.stdout.write(`\n${count} exact 3D surface guide images written\n`);
} finally {
  await browser?.close();
  await server.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
}
