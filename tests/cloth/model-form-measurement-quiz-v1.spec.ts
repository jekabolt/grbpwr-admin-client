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
    await expect(form.locator('[data-model-measurement]')).toHaveCount(35);
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
    await expect(form.locator('[data-model-measurement]')).toHaveCount(35);
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

  // Live beta 17.11, model 12 on a phone: › / ‹ sometimes did nothing and sometimes the typing
  // layout dropped away. Taps come back to back (each lands while the posed guide of the last step
  // is still being built), off the 44 px buttons, on the bar's label, on the first field's ‹ and
  // while the camera turns; the walk must visit every field once per tap, in order, and never
  // leave the typing layout except when the keyboard is put down on purpose.
  test('the keyboard bar walks every field there and back twice under fast, stray and early taps', async ({
    page,
  }) => {
    test.setTimeout(900_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${DEV_ROUTE}?fixture=m12`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: HIDE_DEVTOOLS });
    const form = page.getByTestId('model-form-personalized-preview-dev-page').locator('form');
    const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
    const dock = page.getByTestId('model-measurement-phone-dock');
    const fields = form.locator('[data-model-measurement]');
    await expect(canvas).toBeVisible({ timeout: 180_000 });
    const names = await fields.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).dataset.modelMeasurement ?? ''),
    );
    expect(names).toHaveLength(35);

    type BarLog = {
      focus: string[];
      leaves: number;
      dockRemovals: number;
      clicks: number;
      clicksWhileTurning: number;
    };
    await form.evaluate((element) => {
      const log: BarLog = {
        focus: [],
        leaves: 0,
        dockRemovals: 0,
        clicks: 0,
        clicksWhileTurning: 0,
      };
      (window as unknown as { __bar: BarLog }).__bar = log;
      // Every removal counts, also one undone within the same task.
      new MutationObserver((records) => {
        for (const record of records) if (record.oldValue !== null) log.leaves += 1;
      }).observe(element, {
        attributes: true,
        attributeFilter: ['data-mq-phone-typing'],
        attributeOldValue: true,
      });
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.removedNodes)
            if (
              node instanceof Element &&
              (node.matches('[data-mq-phone-dock]') || node.querySelector('[data-mq-phone-dock]'))
            )
              log.dockRemovals += 1;
      }).observe(element, { childList: true, subtree: true });
      document.addEventListener('focusin', (event) => {
        const name = (event.target as HTMLElement | null)?.dataset?.modelMeasurement;
        if (name) log.focus.push(name);
      });
      document.addEventListener(
        'click',
        (event) => {
          if (!(event.target instanceof Element) || !event.target.closest('[data-mq-phone-dock]'))
            return;
          log.clicks += 1;
          const stage = document.querySelector<HTMLElement>(
            '[data-testid="measurement-watertight-surface-v1-canvas"]',
          );
          if (stage?.dataset.measurementGuideCameraMotion === 'moving') log.clicksWhileTurning += 1;
        },
        true,
      );
    });
    const barLog = () => page.evaluate(() => (window as unknown as { __bar: BarLog }).__bar);

    // Keyboard up, emulated: about 474 px stay visible above it.
    await page.setViewportSize({ width: 390, height: 474 });
    await fields.first().tap();
    await expect(dock).toBeVisible();
    await expect(dock).toHaveCSS('touch-action', 'manipulation');
    // The posed model's own guide is drawn, so every step below builds a posed guide.
    await expect(canvas).toHaveAttribute('data-active-measurement-guide', names[0]!, {
      timeout: 180_000,
    });
    const expected = [names[0]!];

    const dockBox = (await dock.boundingBox())!;
    const nextBox = (await page
      .getByRole('button', { name: 'next field', exact: true })
      .boundingBox())!;
    const previousBox = (await page
      .getByRole('button', { name: 'previous field', exact: true })
      .boundingBox())!;
    const middleY = dockBox.y + dockBox.height / 2;
    // Thumb spots per arrow: the button's middle, 4 px under the bar's top edge (above the 44 px
    // button), the screen edge beside it, the bar's bottom corner on the inner side.
    const nextSpots = [
      { x: nextBox.x + nextBox.width / 2, y: middleY },
      { x: nextBox.x + nextBox.width / 2, y: dockBox.y + 4 },
      { x: dockBox.x + dockBox.width - 3, y: middleY },
      { x: nextBox.x + 3, y: dockBox.y + dockBox.height - 4 },
    ];
    const previousSpots = [
      { x: previousBox.x + previousBox.width / 2, y: middleY },
      { x: previousBox.x + previousBox.width / 2, y: dockBox.y + 4 },
      { x: dockBox.x + 3, y: middleY },
      { x: previousBox.x + previousBox.width - 3, y: dockBox.y + dockBox.height - 4 },
    ];
    const labelSpot = { x: previousBox.x + previousBox.width + 40, y: middleY };

    // ‹ on the first field and a tap on the label: nothing moves, nothing closes.
    await page.touchscreen.tap(previousSpots[0]!.x, previousSpots[0]!.y);
    await page.touchscreen.tap(labelSpot.x, labelSpot.y);
    await page.touchscreen.tap(labelSpot.x, labelSpot.y);
    await expect(fields.first()).toBeFocused();
    await expect(dock).toBeVisible();

    let at = 0;
    const walk = async (direction: 1 | -1) => {
      const spots = direction === 1 ? nextSpots : previousSpots;
      for (let step = 0; step < names.length - 1; step += 1) {
        const spot = spots[step % spots.length]!;
        await page.touchscreen.tap(spot.x, spot.y);
        at += direction;
        expected.push(names[at]!);
        // When this step turns the camera, the next tap lands mid-turn.
        await page
          .waitForFunction(
            () =>
              document.querySelector<HTMLElement>(
                '[data-testid="measurement-watertight-surface-v1-canvas"]',
              )?.dataset.measurementGuideCameraMotion === 'moving',
            undefined,
            { polling: 'raf', timeout: 400 },
          )
          .catch(() => undefined);
      }
      await expect(fields.nth(at)).toBeFocused();
      await expect(dock).toBeVisible();
    };

    await walk(1);
    await walk(-1);

    // Keyboard down on purpose and up again: the only leave the walk allows.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dock).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 474 });
    await fields.first().tap();
    expected.push(names[0]!);
    await expect(dock).toBeVisible();

    await walk(1);
    await walk(-1);

    const log = await barLog();
    console.info(
      `MANNEQUIN_PHONE_BAR_WALK=${JSON.stringify({
        taps: log.clicks,
        tapsWhileTurning: log.clicksWhileTurning,
        leaves: log.leaves,
        dockRemovals: log.dockRemovals,
        focusMoves: log.focus.length,
      })}`,
    );
    expect(log.focus, 'one field per tap, in order, none skipped or repeated').toEqual(expected);
    expect(log.leaves, 'typing layout left only when the keyboard went down').toBe(1);
    expect(log.dockRemovals, 'bar unmounted only when the keyboard went down').toBe(1);
    expect(log.clicksWhileTurning, 'taps landed while the camera turned').toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
  });
});
