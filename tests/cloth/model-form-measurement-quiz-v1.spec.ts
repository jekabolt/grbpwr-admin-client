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

  const staticGuide = page.getByTestId('static-measurement-guide');
  await expect(staticGuide).toBeVisible();
  await expect(staticGuide).toHaveAttribute('data-guide-gender', 'female');
  await expect(staticGuide).toHaveAttribute(
    'data-guide-measurement',
    'BODY_MEASUREMENT_NAME_CHEST',
  );
  await expect(page.getByTestId('static-measurement-marker')).toBeVisible();
  await expect(page.getByTestId('measurement-watertight-surface-v1-canvas')).toHaveCount(0);
  await expect(page.getByTestId('model-open-reference-direct-pose-control-v9')).toHaveCount(0);

  await guided.scrollIntoViewIfNeeded();
  const guidedBox = await guided.boundingBox();
  expect(guidedBox).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(guidedBox!.height).toBeLessThanOrEqual(viewport!.height);
  const next = page.getByRole('button', { name: 'next', exact: true });
  const chest = page.getByRole('textbox', { name: 'chest', exact: true });
  await expect(staticGuide).toBeInViewport();
  await expect(chest).toBeInViewport();
  await expect(next).toBeInViewport();
  await expect(page.getByRole('button', { name: 'cancel', exact: true })).toBeHidden();
  await expect
    .poll(() =>
      next.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        return (
          document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) ===
          button
        );
      }),
    )
    .toBe(true);
  const scrollBeforeStep = await page.evaluate(() => window.scrollY);

  await chest.fill('935');
  await next.tap();
  await expect(page.getByRole('textbox', { name: 'under bust', exact: true })).toBeVisible();
  await expect(form.locator('[data-model-measurement]')).toHaveCount(1);
  await expect(staticGuide).toHaveAttribute(
    'data-guide-measurement',
    'BODY_MEASUREMENT_NAME_UNDER_BUST',
  );
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBeforeStep)).toBeLessThan(8);

  await page.getByRole('radio', { name: 'table', exact: true }).click();
  await expect(guided).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'chest', exact: true })).toHaveValue('935');
  await expect(form.locator('[data-model-measurement]')).toHaveCount(34);
  await expect(page.getByTestId('model-open-reference-direct-pose-control-v9')).toBeVisible();
  await expect(page.getByRole('button', { name: 'cancel', exact: true })).toBeVisible();
  await expect(page.getByTestId('measurement-watertight-surface-v1-canvas')).toBeVisible({
    timeout: 180_000,
  });

  await page.getByRole('textbox', { name: 'inseam', exact: true }).focus();
  await page.getByRole('radio', { name: 'guided', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'inseam', exact: true })).toBeVisible();
  await expect(staticGuide).toHaveAttribute(
    'data-guide-measurement',
    'BODY_MEASUREMENT_NAME_INSEAM',
  );
  await expect(page.getByTestId('static-measurement-marker')).toBeVisible();
});

test('create flow starts with a neutral static guide and keeps form values empty', async ({
  page,
}) => {
  await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'show create form', exact: true }).click();

  const chest = page.getByRole('textbox', { name: 'chest', exact: true });
  const staticGuide = page.getByTestId('static-measurement-guide');
  await expect(chest).toHaveValue('');
  await expect(staticGuide).toHaveAttribute('data-guide-gender', 'neutral');
  await expect(staticGuide).toHaveAttribute(
    'data-guide-measurement',
    'BODY_MEASUREMENT_NAME_CHEST',
  );
  await expect(page.getByTestId('measurement-guided-reference-body-status')).toHaveCount(0);
  await expect(page.getByTestId('measurement-watertight-surface-v1-canvas')).toHaveCount(0);

  await chest.fill('955');
  await page.getByRole('button', { name: 'next', exact: true }).tap();
  await expect(page.getByRole('textbox', { name: 'under bust', exact: true })).toBeVisible();
  await expect(staticGuide).toHaveAttribute(
    'data-guide-measurement',
    'BODY_MEASUREMENT_NAME_UNDER_BUST',
  );
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
  await expect(page.getByTestId('static-measurement-guide')).toHaveAttribute(
    'data-guide-measurement',
    'BODY_MEASUREMENT_NAME_HEIGHT',
  );
});

test('static artwork follows the selected female and male model gender', async ({ page }) => {
  await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
  const staticGuide = page.getByTestId('static-measurement-guide');
  await expect(staticGuide).toHaveAttribute('data-guide-gender', 'female');

  await page.getByRole('button', { name: 'switch to model beta', exact: true }).click();
  await expect(staticGuide).toHaveAttribute('data-guide-gender', 'male');
  await expect(staticGuide.getByRole('img')).toHaveAttribute('alt', /^male mannequin/);
});
