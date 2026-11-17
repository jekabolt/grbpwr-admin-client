import { expect, test } from '@playwright/test';

const DEV_ROUTE = '/__model-form-personalized-preview-v1';
// Dev-only TanStack devtools button (absent from production builds) floats over the bottom-right.
const HIDE_DEVTOOLS = '.tsqd-parent-container { display: none !important; }';

// Phone width has no guided view since the phone layout (approved variant C) replaced guided and
// table there; guided lives on from `md` up and is proven on a tablet-width touch screen.
test.describe('tablet guided entry', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test('tablet guided measurements keep guide, field and navigation in one viewport', async ({
    page,
  }) => {
    await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: HIDE_DEVTOOLS });

    const form = page.getByTestId('model-form-personalized-preview-dev-page').locator('form');
    const guided = page.getByTestId('measurements-guided-entry');
    await expect(form).toBeVisible();
    await page.getByRole('radio', { name: 'guided', exact: true }).click();
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
    await expect(page.getByTestId('static-measurement-image')).toBeVisible();
    await expect(staticGuide).toHaveAttribute('data-guide-render', 'baked-image-v2');
    await expect(staticGuide.locator('svg')).toHaveCount(0);
    await expect(page.getByTestId('measurement-watertight-surface-v1-canvas')).toHaveCount(0);
    await expect(page.getByTestId('model-open-reference-direct-pose-control-v9')).toHaveCount(0);

    // From `md` up the save bar stays docked at the bottom; the guided block is read from its top.
    await guided.evaluate((element) => element.scrollIntoView({ block: 'start' }));
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
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBeforeStep)).toBeLessThan(
      8,
    );

    await page.getByRole('radio', { name: 'table', exact: true }).click();
    await expect(guided).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'chest', exact: true })).toHaveValue('935');
    await expect(form.locator('[data-model-measurement]')).toHaveCount(34);
    await expect(page.locator('[data-measurement-protocol-guide]')).toHaveCount(0);
    await expect(page.getByText(/repeat tolerance/iu)).toHaveCount(0);
    await expect(
      page.getByText(
        'Horizontal torso circumference through the fullest chest or bust level, under the arms.',
        { exact: true },
      ),
    ).toHaveCount(0);
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
    await expect(page.getByTestId('static-measurement-image')).toBeVisible();

    await page.getByRole('radio', { name: 'table', exact: true }).click();
    await page.getByRole('textbox', { name: 'chest depth', exact: true }).focus();
    await page.getByRole('radio', { name: 'guided', exact: true }).click();
    await expect(staticGuide).toHaveAttribute('data-guide-view', 'side');
    await expect(staticGuide.getByRole('img')).toHaveAttribute('alt', /side view/iu);

    await page.getByRole('radio', { name: 'table', exact: true }).click();
    await page.getByRole('textbox', { name: 'across back', exact: true }).focus();
    await page.getByRole('radio', { name: 'guided', exact: true }).click();
    await expect(staticGuide).toHaveAttribute('data-guide-view', 'back');
    await expect(staticGuide.getByRole('img')).toHaveAttribute('alt', /back view/iu);
  });

  test('create flow starts with a neutral static guide and keeps form values empty', async ({
    page,
  }) => {
    await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'show create form', exact: true }).click();
    await page.getByRole('radio', { name: 'guided', exact: true }).click();

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
    await page.getByRole('radio', { name: 'guided', exact: true }).click();
    const staticGuide = page.getByTestId('static-measurement-guide');
    await expect(staticGuide).toHaveAttribute('data-guide-gender', 'female');

    await page.getByRole('button', { name: 'switch to model beta', exact: true }).click();
    // A new model remounts the form, which opens on the tablet default (table).
    await page.getByRole('radio', { name: 'guided', exact: true }).click();
    await expect(staticGuide).toHaveAttribute('data-guide-gender', 'male');
    await expect(staticGuide.getByRole('img')).toHaveAttribute('alt', /^male mannequin/);
  });
});

test.describe('phone layout (variant C)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('phone keeps the mannequin over one group; the keyboard bar walks fields across groups', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: HIDE_DEVTOOLS });
    const form = page.getByTestId('model-form-personalized-preview-dev-page').locator('form');
    const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
    const dock = page.getByTestId('model-measurement-phone-dock');
    const editPose = page.getByRole('checkbox', { name: 'edit pose', exact: true });
    const cancel = page.getByRole('button', { name: 'cancel', exact: true });

    // Keyboard down: no guided / table switch, the mannequin, edit pose off, one group of eight.
    await expect(canvas).toBeVisible({ timeout: 180_000 });
    await expect(page.getByRole('radio', { name: 'guided', exact: true })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'table', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('measurements-guided-entry')).toHaveCount(0);
    await expect(
      page.getByRole('radiogroup', { name: 'measurement group' }).getByRole('radio'),
    ).toHaveCount(8);
    await expect(form.locator('[data-measurement-group]:visible')).toHaveCount(1);
    await expect(form.locator('[data-model-measurement]')).toHaveCount(34);
    await expect(editPose).not.toBeChecked();
    await expect(canvas).toHaveCSS('touch-action', 'pan-y');
    await expect(cancel).toBeVisible();
    await expect(dock).toHaveCount(0);

    // Keyboard up, emulated: the window shrinks to the ~474 px left visible above a keyboard.
    await page.setViewportSize({ width: 390, height: 474 });
    await page.getByRole('textbox', { name: 'chest', exact: true }).tap();
    await expect(dock).toBeVisible();
    await expect(dock).toContainText('chest');
    const dockBox = (await dock.boundingBox())!;
    expect(Math.round(dockBox.y + dockBox.height)).toBe(474);
    const chestBox = (await page
      .getByRole('textbox', { name: 'chest', exact: true })
      .boundingBox())!;
    expect(chestBox.y).toBeGreaterThanOrEqual(dockBox.y);
    expect(chestBox.y + chestBox.height).toBeLessThanOrEqual(dockBox.y + dockBox.height + 0.5);
    const stageBox = (await canvas.boundingBox())!;
    expect(Math.round(stageBox.width)).toBe(390);
    expect(Math.abs(stageBox.height - (474 - 64))).toBeLessThanOrEqual(2);
    await expect(editPose).toBeHidden();
    await expect(cancel).toBeHidden();
    const next = page.getByRole('button', { name: 'next field', exact: true });
    const previous = page.getByRole('button', { name: 'previous field', exact: true });
    await expect(next).toBeEnabled();
    expect(
      await next.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return hit === button || button.contains(hit);
      }),
    ).toBe(true);

    // › to the end of torso, › into arms, ‹ back: focus never leaves the measurement fields.
    const torso = form.locator('[data-measurement-group="torso"]');
    const arms = form.locator('[data-measurement-group="arms"]');
    const torsoFields = await torso.locator('[data-model-measurement]').count();
    for (let index = 1; index < torsoFields; index += 1) await next.tap();
    await expect(torso.locator('[data-model-measurement]').last()).toBeFocused();
    await next.tap();
    await expect(arms).toBeVisible();
    await expect(torso).toBeHidden();
    await expect(arms.locator('[data-model-measurement]').first()).toBeFocused();
    await expect(dock).toContainText(/arms · 1\/\d/iu);
    await page.keyboard.type('615');
    await previous.tap();
    await expect(torso).toBeVisible();
    await expect(torso.locator('[data-model-measurement]').last()).toBeFocused();
    await expect(arms.locator('[data-model-measurement]').first()).toHaveValue('615');

    // Keyboard down again: the bar goes, the save bar and the in-flow mannequin come back.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dock).toHaveCount(0);
    await expect(cancel).toBeVisible();
    await expect(editPose).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
