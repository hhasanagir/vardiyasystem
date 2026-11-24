import { test, expect } from '@playwright/test';
import { signedInContext } from './fixtures/auth';

/**
 * The plan pages are the product's main surface, so these assertions are about
 * real navigation state: the month label the user sees has to actually change
 * when they step through the month, and "Bugün" has to bring them back.
 */
const PLANS = [
  { slug: 'mr', label: 'MR' },
  { slug: 'bt', label: 'BT' },
  { slug: 'rontgen', label: 'Röntgen' },
  { slug: 'nukleer-tip', label: 'Nükleer' },
];

test.describe('Plan pages', () => {
  test('each unit plan page renders with its own unit badge', async ({ browser }) => {
    const context = await signedInContext(browser, 'supervisor');

    for (const plan of PLANS) {
      const page = await context.newPage();
      await page.goto(`/app/${plan.slug}-plan`);

      await expect(page.locator('.plan-page')).toBeVisible();
      await expect(page.locator('.unit-label')).toHaveText(new RegExp(plan.label.slice(0, 3), 'i'));
      await expect(page.locator('.current-month')).toBeVisible();

      await page.close();
    }

    await context.close();
  });

  test('month navigation moves forward and back', async ({ browser }) => {
    const context = await signedInContext(browser, 'supervisor');
    const page = await context.newPage();
    await page.goto('/app/mr-plan');

    const label = page.locator('.current-month');
    const start = (await label.textContent())?.trim();
    expect(start).toBeTruthy();

    await page.locator('button[title="Sonraki Ay"]').click();
    await expect(label).not.toHaveText(start as string);

    await page.locator('button[title="Önceki Ay"]').click();
    await expect(label).toHaveText(start as string);

    // A second forward step then "Bugün" must land back on the starting month.
    await page.locator('button[title="Sonraki Ay"]').click();
    await expect(label).not.toHaveText(start as string);
    await page.locator('button[title="Bugüne Git"]').click();
    await expect(label).toHaveText(start as string);

    await context.close();
  });

  test('the month picker jumps to a chosen month and can be cancelled', async ({ browser }) => {
    const context = await signedInContext(browser, 'supervisor');
    const page = await context.newPage();
    await page.goto('/app/mr-plan');

    await page.locator('button[title="Ay Seç"]').click();
    await expect(page.locator('.month-picker-panel')).toBeVisible();

    // Cancelling must leave the visible month untouched.
    await page.locator('.month-picker-panel select[name="planPickerMonth"]').selectOption('10');
    await page.getByRole('button', { name: 'İptal' }).click();
    await expect(page.locator('.month-picker-panel')).toHaveCount(0);
    await expect(page.locator('.current-month')).not.toContainText('Ekim');

    // Committing the same choice has to move the plan to that month.
    await page.locator('button[title="Ay Seç"]').click();
    await page.locator('.month-picker-panel select[name="planPickerYear"]').selectOption('2026');
    await page.locator('.month-picker-panel select[name="planPickerMonth"]').selectOption('10');
    await page.getByRole('button', { name: 'Git' }).click();

    await expect(page.locator('.month-picker-panel')).toHaveCount(0);
    await expect(page.locator('.current-month')).toHaveText('Ekim 2026');

    await context.close();
  });

  test('the national holiday in the chosen month is marked in the grid', async ({ browser }) => {
    const context = await signedInContext(browser, 'supervisor');
    const page = await context.newPage();
    await page.goto('/app/mr-plan');

    await page.locator('button[title="Ay Seç"]').click();
    await page.locator('.month-picker-panel select[name="planPickerYear"]').selectOption('2026');
    await page.locator('.month-picker-panel select[name="planPickerMonth"]').selectOption('10');
    await page.getByRole('button', { name: 'Git' }).click();
    await expect(page.locator('.current-month')).toHaveText('Ekim 2026');

    // 29 October is a national holiday in the shipped calendar, so the grid has
    // to flag that column by name and type.
    const holiday = page.locator('th.date-col.national-holiday .holiday-label.national');
    await expect(holiday.first()).toBeVisible();
    await expect(holiday.first()).toHaveText('Cumhuriyet Bayramı');

    await context.close();
  });

  test('the plan page is reloaded without a session bounce', async ({ browser }) => {
    const context = await signedInContext(browser, 'supervisor');
    const page = await context.newPage();
    await page.goto('/app/mr-plan');
    await expect(page.locator('.plan-page')).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(/\/app\/mr-plan$/);
    await expect(page.locator('.plan-page')).toBeVisible();

    await context.close();
  });
});
