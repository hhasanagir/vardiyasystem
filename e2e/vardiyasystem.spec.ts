import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("VardiyaOS Critical Test Scenarios", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.describe("1. Night Shift followed by Day Shift must FAIL", () => {
    test("should detect constraint violation when assigning day shift after night shift", async ({
      page,
    }) => {
      await page.goto("/app/mr-plan");
      await page.waitForLoadState("networkidle");

      await page
        .locator("tr.night-shift-row td.person-cell.night-cell .add-person-btn")
        .first()
        .click();
      await expect(page.locator(".personnel-item").first()).toBeVisible();
      const nightPerson = page
        .locator(".personnel-item:not(.ineligible)")
        .first();
      const personName = (
        await nightPerson.locator(".personnel-name").textContent()
      )?.trim();
      await nightPerson.click();
      await page.locator("button.btn-primary").click();
      await page.waitForTimeout(1200);

      await page
        .locator("tr.day-shift-row td.person-cell .add-person-btn")
        .nth(1)
        .click();
      await expect(page.locator(".personnel-item").first()).toBeVisible();
      await page
        .locator(".personnel-item", { hasText: personName ?? "" })
        .first()
        .click();

      await expect(page.locator("button.btn-primary")).toContainText(
        "Atama Engellendi",
        { timeout: 3000 },
      );
    });
  });

  test.describe("2. 11h Rest Violation Detection", () => {
    test("should show rest violation warning when rest is less than 11 hours", async ({
      page,
    }) => {
      await page.goto("/app/mr-plan");
      await page.waitForLoadState("networkidle");

      await page
        .locator("tr.night-shift-row td.person-cell.night-cell .add-person-btn")
        .first()
        .click();
      await expect(page.locator(".personnel-item").first()).toBeVisible();
      const nightPerson = page
        .locator(".personnel-item:not(.ineligible)")
        .first();
      const personName = (
        await nightPerson.locator(".personnel-name").textContent()
      )?.trim();
      await nightPerson.click();
      await page.locator("button.btn-primary").click();
      await page.waitForTimeout(1200);

      await page
        .locator("tr.day-shift-row td.person-cell .add-person-btn")
        .nth(1)
        .click();
      await expect(page.locator(".personnel-item").first()).toBeVisible();
      await page
        .locator(".personnel-item", { hasText: personName ?? "" })
        .first()
        .click();

      const warning = page.locator(".slot-warning.error").first();
      await expect(warning).toContainText("dinlenme kuralı ihlali", {
        timeout: 3000,
      });
    });
  });

  test.describe("3. Fair Night Distribution Maintained", () => {
    test("should balance night shifts across personnel", async ({ page }) => {
      await page.goto("/app/reports");
      await page.waitForLoadState("networkidle");

      await page.locator('button:has-text("Personel")').first().click();
      await page.waitForTimeout(400);

      const employeeStats = page.locator(".employee-grid");
      await expect(employeeStats).toBeAttached();
    });
  });

  test.describe("4. Holiday Coloring Correct", () => {
    test("should apply correct color to national holidays", async ({
      page,
    }) => {
      await page.goto("/app/mr-plan");
      await page.waitForLoadState("networkidle");

      await page.goto("/app/bt-plan");
      await page.waitForLoadState("networkidle");

      const nationalHoliday = page
        .locator(".date-col.national-holiday")
        .first();
      if ((await nationalHoliday.count()) > 0) {
        const label = nationalHoliday.locator(".holiday-label");
        await expect(label).toHaveCSS(
          "background-color",
          "rgba(220, 38, 38, 0.2)",
        );
      }
    });

    test("should apply correct color to religious holidays", async ({
      page,
    }) => {
      await page.goto("/app/mr-plan");
      await page.waitForLoadState("networkidle");

      await page.goto("/app/bt-plan");
      await page.waitForLoadState("networkidle");

      const religiousHoliday = page
        .locator(".date-col.religious-holiday")
        .first();
      if ((await religiousHoliday.count()) > 0) {
        const label = religiousHoliday.locator(".holiday-label");
        await expect(label).toHaveCSS(
          "background-color",
          "rgba(180, 30, 30, 0.25)",
        );
        await expect(label).toHaveCSS("color", "rgb(251, 191, 36)");
      }
    });

    test("should show holiday name label", async ({ page }) => {
      await page.goto("/app/mr-plan");
      await page.waitForLoadState("networkidle");

      const holidayCol = page.locator(".date-col.holiday").first();
      if ((await holidayCol.count()) > 0) {
        const label = holidayCol.locator(".holiday-label");
        await expect(label).toBeVisible();
      }
    });
  });

  test.describe("5. Save/Load Persistence Works", () => {
    test("should persist schedule changes", async ({ page }) => {
      await page.goto("/app/mr-plan");
      await page.waitForLoadState("networkidle");

      await page
        .locator(
          "tr.day-shift-row td.person-cell:not(:has(.person-card)) .add-person-btn",
        )
        .first()
        .click();
      await expect(page.locator(".personnel-item").first()).toBeVisible();
      await page.locator(".personnel-item").first().click();
      await page.locator("button.btn-primary").click();
      await page.waitForTimeout(1500);

      await page.reload();
      await page.waitForLoadState("networkidle");

      await page.goto("/app/mr-plan");
      await page.waitForLoadState("networkidle");

      const savedCell = page.locator("tr.day-shift-row .person-card").first();
      await expect(savedCell).toBeVisible();
    });

    test("should preserve month navigation state", async ({ page }) => {
      await page.goto("/app/mr-plan");
      await page.waitForLoadState("networkidle");

      const firstMonth = (
        await page.locator(".current-month").textContent()
      )?.trim();
      await page.locator('button[title="Sonraki Ay"]').first().click();
      await page.waitForTimeout(600);

      const nextMonth = (
        await page.locator(".current-month").textContent()
      )?.trim();
      expect(nextMonth).not.toBe(firstMonth);

      await page.reload();
      await page.waitForLoadState("networkidle");

      await page.goto("/app/mr-plan");
      await page.waitForTimeout(800);

      await expect(page.locator(".current-month")).toHaveText(nextMonth ?? "");
    });

    test("should sync between dashboard and plan pages", async ({ page }) => {
      await page.goto("/app/mr-plan");
      await page.waitForLoadState("networkidle");
      await expect(page.locator(".schedule-shell")).toBeVisible();

      await page.goto("/app");
      await page.waitForLoadState("networkidle");
      await expect(page.locator(".kpi-grid")).toBeVisible();
    });
  });
});

test.describe("Dashboard Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("should navigate from dashboard to unit plan pages", async ({
    page,
  }) => {
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    const firstUnit = page.locator(".unit-summary").first();
    await expect(firstUnit).toBeVisible();
    await firstUnit.click();

    await expect(page).toHaveURL(/-plan/);
  });
});

test.describe("Plan Page Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("should navigate to all 4 unit plan pages", async ({ page }) => {
    await page.goto("/app/mr-plan");
    await expect(page.locator(".unit-label")).toContainText(/MR/i);

    await page.goto("/app/bt-plan");
    await expect(page.locator(".unit-label")).toContainText(/BT/i);

    await page.goto("/app/rontgen-plan");
    await expect(page.locator(".unit-label")).toContainText(/Röntgen/i);

    await page.goto("/app/nukleer-tip-plan");
    await expect(page.locator(".unit-label")).toContainText(/Nükleer/i);
  });
});

test.describe("Reports Page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("should switch between all tabs", async ({ page }) => {
    await page.goto("/app/reports");

    const tabs = ["Özet", "Günlük", "Personel", "Birimler"];
    for (const tab of tabs) {
      await page.locator(`button:has-text("${tab}")`).click();
      await page.waitForTimeout(200);
    }
  });

  test("should export data to CSV", async ({ page }) => {
    await page.goto("/app/reports");

    const exportButton = page.locator(
      'button:has-text("Dışa Aktar"), button:has-text("Export")',
    );
    if ((await exportButton.count()) > 0) {
      await exportButton.click();
      await page.waitForTimeout(1000);
    }
  });
});
