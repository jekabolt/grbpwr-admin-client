import { expect, test } from '@playwright/test';

const DEV_ROUTE = '/__model-create-pose-handoff-v1';

async function expectCounts(
  page: import('@playwright/test').Page,
  expected: { add: string; put: string; leave: string },
) {
  await expect(page.getByTestId('create-pose-add-calls')).toHaveText(expected.add);
  await expect(page.getByTestId('create-pose-put-calls')).toHaveText(expected.put);
  await expect(page.getByTestId('create-pose-leave-calls')).toHaveText(expected.leave);
}

test('create form hands off dirty pose, skips neutral pose and retries only PUT', async ({
  page,
}) => {
  await page.goto(DEV_ROUTE);
  await expect(page.getByTestId('model-create-pose-handoff-dev-page')).toBeVisible();

  await page.getByRole('button', { name: 'add model' }).click();
  await expectCounts(page, { add: '1', put: '1', leave: '1' });

  await page.getByRole('button', { name: 'neutral pose' }).click();
  await expect(page.getByTestId('create-pose-scenario')).toHaveText('neutral');
  await page.getByRole('button', { name: 'add model' }).click();
  await expectCounts(page, { add: '1', put: '0', leave: '1' });

  await page.getByRole('button', { name: 'pose retry' }).click();
  await expect(page.getByTestId('create-pose-scenario')).toHaveText('pose-retry');
  await page.getByRole('button', { name: 'add model' }).click();
  await expectCounts(page, { add: '1', put: '1', leave: '0' });
  await expect(
    page.getByText('Retry saves only the current pose to this model', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Model fields are locked and are not resubmitted.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId('model-create-fields')).toHaveAttribute('disabled', '');
  await expect(page.getByRole('textbox', { name: 'name', exact: true })).toBeDisabled();

  const retryPose = page.getByRole('button', { name: 'retry pose' });
  await retryPose.focus();
  await retryPose.press('Enter');
  await expectCounts(page, { add: '1', put: '2', leave: '1' });
});
