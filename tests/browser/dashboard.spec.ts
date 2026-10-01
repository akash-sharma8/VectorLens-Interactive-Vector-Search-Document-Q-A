import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { pdfFixture } from '../fixtures/pdf.ts';
async function register(page: Page) {
  const email = `browser-${randomUUID()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('browser-password-123');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.locator('#statsLabel')).toContainText('20 vectors');
  return email;
}
test('private dashboard, PDF citation, saved history, logout/login and responsive layout', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const email = await register(page);
  await page.getByLabel('Search query', { exact: true }).fill('binary tree');
  await page.locator('.query-section button').click();
  await expect(page.locator('.rcard')).toHaveCount(5);
  await page.getByRole('button', { name: 'KD-TREE', exact: true }).click();
  await page.getByLabel('Distance metric').selectOption('manhattan');
  await page.getByRole('tab', { name: 'DOCUMENTS', exact: true }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'algorithms.pdf',
      mimeType: 'application/pdf',
      buffer: pdfFixture(['Binary search uses a sorted list.', 'Time complexity is logarithmic.']),
    });
  await page.getByRole('button', { name: 'Upload & embed PDF', exact: true }).click();
  await expect(page.locator('.dcard')).toHaveCount(1, { timeout: 15000 });
  await page.getByRole('tab', { name: 'ASK AI', exact: true }).click();
  await page.getByLabel('Question for AI').fill('What is binary search?');
  await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
  await expect(page.locator('.chat-a')).toHaveCount(1);
  await expect(page.locator('.rag-projection canvas')).toBeVisible();
  await expect(page.locator('.rag-projection canvas')).toHaveAttribute(
    'aria-label',
    /1 highlighted matches/,
  );
  await expect(page.locator('.projection-summary')).toContainText('Query: What is binary search?');
  await page.getByRole('button', { name: 'Open source 1 for this answer' }).click();
  await expect(page.locator('.source-card')).toHaveAttribute('open', '');
  await expect(page.locator('.source-card')).toContainText('PDF pages 1');
  await expect(page.locator('.source-text')).toContainText('Binary search');
  await page.getByLabel('Question for AI').fill('What is its complexity?');
  await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
  await expect(page.locator('.chat-a')).toHaveCount(2);
  await expect(page.locator('.projection-summary')).toContainText('Query: What is its complexity?');
  await page.getByRole('button', { name: 'Show sources on PCA', exact: true }).first().click();
  await expect(page.locator('.projection-summary')).toContainText('Query: What is binary search?');
  await page.getByLabel('Conversation title').fill('Saved algorithms');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved algorithms', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/chat-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('browser-password-123');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('tab', { name: 'ASK AI', exact: true }).click();
  await page.getByRole('button', { name: 'Saved algorithms', exact: true }).click();
  await expect(page.locator('.chat-a')).toHaveCount(2);
  await page.getByRole('tab', { name: 'DOCUMENTS', exact: true }).click();
  await page.getByRole('button', { name: /Delete chunk/ }).click();
  await expect(page.locator('.dcard')).toHaveCount(0);
  await page.getByRole('tab', { name: 'ASK AI', exact: true }).click();
  await page.getByRole('button', { name: 'Saved algorithms', exact: true }).click();
  await expect(page.locator('.source-card').first()).toContainText('Deleted source');
  await expect(page.locator('.rag-projection canvas')).toHaveAttribute(
    'aria-label',
    /0 highlighted matches/,
  );
  await expect(page.locator('.projection-summary')).toContainText('Saved sources are no longer');
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(page.locator('.projection-summary')).toContainText('Ask a question to highlight');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.rag-projection canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/chat-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('failed generation retains message and retry, session expiry returns to login', async ({
  page,
}) => {
  await register(page);
  await page.getByRole('tab', { name: 'ASK AI', exact: true }).click();
  await page.getByLabel('Only answer from my documents').uncheck();
  await page.getByLabel('Question for AI').fill('fixture-generation-failure');
  await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry message' })).toBeVisible();
  await expect(page.locator('.chat-q')).toHaveCount(1);
  await page.getByRole('button', { name: 'Retry message' }).click();
  await expect(page.locator('.chat-a')).toHaveCount(1);
  await expect(page.locator('.chat-q')).toHaveCount(1);
  await page.route('**/api/conversations', (route) =>
    route.fulfill({ status: 401, json: { error: 'Session expired. Please sign in.' } }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('single navbar and persistent light/dark theme including PCA canvas', async ({ page }) => {
  const email = await register(page);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(page.locator('header')).toHaveCount(1);
  await expect(nav.getByRole('heading', { name: 'AI Flow' })).toBeVisible();
  await expect(nav.getByLabel(`Signed in as ${email}`)).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
  const assertRedLogout = async () => {
    const [r, g, b] = await nav
      .getByRole('button', { name: 'Log out', exact: true })
      .evaluate((button) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = getComputedStyle(button).backgroundColor;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data);
      });
    expect(r).toBeGreaterThan(150);
    expect(r).toBeGreaterThan(g * 1.8);
    expect(r).toBeGreaterThan(b * 1.8);
  };
  await assertRedLogout();
  await nav.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await assertRedLogout();
  await expect
    .poll(() =>
      page
        .locator('#scatter')
        .evaluate((node) =>
          Array.from(
            (node as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 1, 1).data,
          ).slice(0, 3),
        ),
    )
    .toEqual([251, 252, 255]);
  await page.screenshot({ path: 'test-results/navbar-light-desktop.png', fullPage: true });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(nav.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
  await page.getByRole('tab', { name: 'ASK AI', exact: true }).click();
  await page.screenshot({ path: 'test-results/chat-light-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(nav.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/navbar-light-mobile.png', fullPage: true });
  await nav.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(() =>
      page
        .locator('#scatter')
        .evaluate((node) =>
          Array.from(
            (node as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 1, 1).data,
          ).slice(0, 3),
        ),
    )
    .toEqual([11, 13, 18]);
});
