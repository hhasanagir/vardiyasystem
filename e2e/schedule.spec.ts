import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Schedule Pages", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("should load MR plan page", async ({ page }) => {
    await page.goto("/app/mr-plan");
    await page.waitForLoadState("networkidle");
    const calendar = page.locator(".schedule-shell");
    await expect(calendar).toBeVisible();
  });

  test("should load BT plan page", async ({ page }) => {
    await page.goto("/app/bt-plan");
    await page.waitForLoadState("networkidle");
    const calendar = page.locator(".schedule-shell");
    await expect(calendar).toBeVisible();
  });

  test("should load Röntgen plan page", async ({ page }) => {
    await page.goto("/app/rontgen-plan");
    await page.waitForLoadState("networkidle");
    const calendar = page.locator(".schedule-shell");
    await expect(calendar).toBeVisible();
  });

  test("should load Nükleer Tıp plan page", async ({ page }) => {
    await page.goto("/app/nukleer-tip-plan");
    await page.waitForLoadState("networkidle");
    const calendar = page.locator(".schedule-shell");
    await expect(calendar).toBeVisible();
  });

  test("should navigate months on plan page", async ({ page }) => {
    await page.goto("/app/mr-plan");
    await page.waitForLoadState("networkidle");
    const nextBtn = page.locator('button[title="Sonraki Ay"]');
    const prevBtn = page.locator('button[title="Önceki Ay"]');
    await expect(nextBtn.first()).toBeVisible();
    await expect(prevBtn.first()).toBeVisible();
    if ((await nextBtn.count()) > 0) {
      await nextBtn.first().click();
      await page.waitForTimeout(500);
    }
    if ((await prevBtn.count()) > 0) {
      await prevBtn.first().click();
      await page.waitForTimeout(500);
    }
  });

  test("should display shift legend", async ({ page }) => {
    await page.goto("/app/mr-plan");
    await page.waitForLoadState("networkidle");
    const legend = page.locator(".kpi-legend");
    await expect(legend).toBeVisible();
  });
});
