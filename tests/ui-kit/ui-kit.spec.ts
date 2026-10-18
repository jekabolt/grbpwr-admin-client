import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Hidden on purpose: the kit shows only what new screens may use.
const LEGACY = new Set(['Selector', 'FieldsGroupContainer', 'Overlay', 'Loader', 'SegmentedField']);

/** Component exports of the barrel: PascalCase values, minus types, helpers, CONSTANTS, legacy. */
function barrelComponents(): string[] {
  const src = readFileSync(fileURLToPath(new URL('../../src/ui/index.ts', import.meta.url)), 'utf8');
  const names: string[] = [];
  for (const [, list] of src.matchAll(/export\s*\{([^}]*)\}\s*from/g)) {
    for (const raw of list.split(',')) {
      const spec = raw.replace(/\/\/.*$/gm, '').trim();
      if (!spec || spec.startsWith('type ')) continue;
      const name = spec.split(/\s+as\s+/).pop()!.trim();
      if (/^[A-Z][a-z]/.test(name) && !LEGACY.has(name)) names.push(name);
    }
  }
  return names;
}

async function open(page: import('@playwright/test').Page) {
  // The kit is static: anything leaving this server is a bug, and must not reach a real backend.
  await page.route(/^(?!http:\/\/localhost:\d+\/)/, (route) => route.abort());
  await page.goto('/ui-kit');
  await page.locator('#Button').waitFor();
  await page.evaluate(() => document.fonts.ready);
}

test('every barrel component has a block', async ({ page }) => {
  const names = barrelComponents();
  expect(names.length).toBeGreaterThan(60);
  await open(page);
  const missing = await page.evaluate(
    (ids) => ids.filter((id) => !document.getElementById(id)),
    names,
  );
  expect(missing).toEqual([]);
});

test('find filters rail and blocks', async ({ page }) => {
  await open(page);
  const find = page.getByRole('textbox', { name: 'find' });
  await find.fill('combo');
  await expect(page.locator('#Combobox')).toBeVisible();
  await expect(page.locator('#ComboField')).toBeVisible();
  await expect(page.locator('#Button')).toHaveCount(0);
  for (const word of ['divider', 'rule', 'hairline']) {
    await find.fill(word);
    await expect(page.locator('#rules')).toBeVisible();
  }
  for (const word of ['neighbours', 'соседство', 'gap', 'nest']) {
    await find.fill(word);
    await expect(page.locator('#neighbours')).toBeVisible();
  }
  await find.fill('zzzz');
  await expect(page.getByText('none', { exact: true }).first()).toBeVisible();
});

test('full page screenshot', async ({ page }) => {
  await open(page);
  await expect(page).toHaveScreenshot('ui-kit.png', {
    fullPage: true,
    // Dev-only floating button of the React Query devtools.
    stylePath: fileURLToPath(new URL('./hide-devtools.css', import.meta.url)),
  });
});
