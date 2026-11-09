import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { SIZE_CHART_ICON_FILES, generateSizeChartIcons } from './gen-size-chart-icons.mjs';

test('generator emits the typed icon shape and maps front-rise', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'size-chart-icons-'));
  const fixture = {
    sample: {
      label: 'Sample',
      vb: '0 0 100 200',
      inner: '<g stroke="#000"><path d="M0 0L1 1"/></g>',
      lines: [
        { type: 'horizontal', name: 'front-rise', y: 2, xStart: 1, xEnd: 3 },
        {
          type: 'vertical',
          view: 'diagonal',
          name: 'length',
          x: 4,
          xEnd: 5,
          yStart: 6,
          yEnd: 7,
        },
      ],
    },
  };
  for (const [index, file] of SIZE_CHART_ICON_FILES.entries()) {
    await writeFile(join(dir, file), JSON.stringify(index === 0 ? fixture : {}));
  }
  const output = join(dir, 'icons.ts');
  const catalog = await generateSizeChartIcons(dir, output);
  const moduleText = await readFile(output, 'utf8');

  assert.deepEqual(Object.keys(catalog.sample), ['label', 'viewBox', 'inner', 'lines']);
  assert.equal(catalog.sample.viewBox, '0 0 100 200');
  assert.equal(catalog.sample.lines[0].name, 'rise');
  assert.equal(catalog.sample.lines[1].xEnd, 5);
  assert.match(catalog.sample.inner, /currentColor/);
  assert.match(moduleText, /Record<string, SizeChartIcon>/);
  assert.match(moduleText, /export type SizeChartIconLine/);
});
