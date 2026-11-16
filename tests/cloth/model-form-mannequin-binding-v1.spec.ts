import { expect, test } from '@playwright/test';

test('BUILD PREVIEW performs no API write and serializes no mannequin mesh', async ({ page }) => {
  const requests: Array<{ method: string; postData: string | null; url: string }> = [];
  page.on('request', (request) => {
    requests.push({
      method: request.method(),
      postData: request.postData(),
      url: request.url(),
    });
  });
  await page.goto('/__model-open-reference-preview-v1?basis=female');
  requests.length = 0;

  await page.getByRole('button', { name: /build preview/i }).click();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready',
  );

  expect(requests.filter(({ url }) => new URL(url).pathname.startsWith('/api/'))).toEqual([]);
  expect(
    requests.filter(({ method }) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)),
  ).toEqual([]);
  expect(requests.map(({ postData }) => postData ?? '').join('\n')).not.toMatch(
    /(?:displayMesh|rendererDisplayMesh|positions|indices)/,
  );
  await expect(
    page.locator('input[name*="mesh"], textarea[name*="mesh"], input[name*="pose"]'),
  ).toHaveCount(0);
});
