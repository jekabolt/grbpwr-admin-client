import { expect, test } from '@playwright/test';

const DEV_ROUTE = '/__model-form-personalized-preview-v1';

test('mobile guided measurements keep mannequin, field and navigation in one viewport', async ({
  page,
}) => {
  await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });

  const form = page.getByTestId('model-form-personalized-preview-dev-page').locator('form');
  const guided = page.getByTestId('measurements-guided-entry');
  await expect(form).toBeVisible();
  await expect(guided).toBeVisible();
  await expect(form.locator('[data-model-measurement]')).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'chest', exact: true })).toHaveValue('920');

  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(canvas).toBeVisible({ timeout: 180_000 });
  await expect(canvas).toHaveAttribute(
    'data-active-measurement-guide',
    'BODY_MEASUREMENT_NAME_CHEST',
  );
  await expect(canvas).toHaveAttribute('data-measurement-guide-status', 'visible');
  await expect(page.getByTestId('model-open-reference-direct-pose-control-v9')).toHaveCount(0);

  await guided.scrollIntoViewIfNeeded();
  const guidedBox = await guided.boundingBox();
  expect(guidedBox).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(guidedBox!.height).toBeLessThanOrEqual(viewport!.height);
  const next = page.getByRole('button', { name: 'next', exact: true });
  const chest = page.getByRole('textbox', { name: 'chest', exact: true });
  await expect(canvas).toBeInViewport();
  await expect(chest).toBeInViewport();
  await expect(next).toBeInViewport();
  const scrollBeforeStep = await page.evaluate(() => window.scrollY);

  await chest.fill('935');
  await next.tap();
  await expect(page.getByRole('textbox', { name: 'under bust', exact: true })).toBeVisible();
  await expect(form.locator('[data-model-measurement]')).toHaveCount(1);
  await expect(canvas).toHaveAttribute(
    'data-active-measurement-guide',
    'BODY_MEASUREMENT_NAME_UNDER_BUST',
  );
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBeforeStep)).toBeLessThan(8);

  await page.getByRole('radio', { name: 'table', exact: true }).click();
  await expect(guided).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'chest', exact: true })).toHaveValue('935');
  await expect(form.locator('[data-model-measurement]')).toHaveCount(34);
  await expect(page.getByTestId('model-open-reference-direct-pose-control-v9')).toBeVisible();

  await page.getByRole('textbox', { name: 'inseam', exact: true }).focus();
  await page.getByRole('radio', { name: 'guided', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'inseam', exact: true })).toBeVisible();
  const guideStatus = page.getByTestId('model-open-reference-measurement-guide-status');
  await expect(guideStatus).toHaveAttribute('data-guide-status', 'unsupported');
  await expect(guideStatus).toContainText('visual guide unavailable for inseam');
});

test('create flow starts with a labelled reference body and keeps form values empty', async ({
  page,
}) => {
  await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'show create form', exact: true }).click();

  const chest = page.getByRole('textbox', { name: 'chest', exact: true });
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  const referenceStatus = page.getByTestId('measurement-guided-reference-body-status');
  await expect(chest).toHaveValue('');
  await expect(referenceStatus).toHaveAttribute('data-reference-required-missing', '7');
  await expect(referenceStatus).toContainText('entered values replace the reference live');
  await expect(canvas).toBeVisible({ timeout: 180_000 });
  await expect(canvas).toHaveAttribute(
    'data-active-measurement-guide',
    'BODY_MEASUREMENT_NAME_CHEST',
  );
  await expect(canvas).toHaveAttribute('data-measurement-guide-status', 'visible');

  await chest.fill('955');
  await page.getByRole('button', { name: 'next', exact: true }).tap();
  await expect(referenceStatus).toHaveAttribute('data-reference-required-missing', '6');
  await expect(page.getByRole('textbox', { name: 'under bust', exact: true })).toBeVisible();
});

test('guided warning action moves field and visual guide together', async ({ page }) => {
  await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('radio', { name: 'table', exact: true }).click();
  await page.getByRole('textbox', { name: 'height', exact: true }).fill('');
  await page.getByRole('textbox', { name: 'chest', exact: true }).focus();
  await page.getByRole('radio', { name: 'guided', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'chest', exact: true })).toBeVisible();

  await page.getByRole('button', { name: /1 error/ }).click();
  await page
    .getByRole('button', { name: 'height: required for mannequin: focus height', exact: true })
    .click();

  await expect(page.getByRole('textbox', { name: 'height', exact: true })).toBeVisible();
  await expect(page.getByTestId('measurement-watertight-surface-v1-canvas')).toHaveAttribute(
    'data-active-measurement-guide',
    'BODY_MEASUREMENT_NAME_HEIGHT',
  );
});
