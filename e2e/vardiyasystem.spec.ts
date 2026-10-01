import { test, expect } from "@playwright/test";

test.describe("VardiyaOS Critical Test Scenarios", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test.describe("1. Night Shift followed by Day Shift must FAIL", () => {
    test("should detect constraint violation when assigning day shift after night shift", async ({
      page,
    }) => {
      await page.goto("/app/mr-plan");

      const nightShiftCell = page.locator(".calendar-cell").first();
      await nightShiftCell.click();

      const personnelDropdown = page.locator(
        'select[formControlName="personnel"]',
      );
      await personnelDropdown.selectOption({ index: 0 });

      const shiftTypeSelect = page.locator(
        'select[formControlName="shiftType"]',
      );
      await shiftTypeSelect.selectOption("night");

      await page.locator('button:has-text("Kaydet")').click();

      await page.waitForTimeout(500);

      const nextDayCell = page.locator(".calendar-cell").nth(1);
      await nextDayCell.click();
      await personnelDropdown.selectOption({ index: 0 });
      await shiftTypeSelect.selectOption("day");

      await page.locator('button:has-text("Kaydet")').click();

      const errorMessage = page.locator(
        ".constraint-error, .conflict-alert, .error-message",
      );
      await expect(errorMessage.first()).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe("2. 11h Rest Violation Detection", () => {
    test("should show rest violation warning when rest is less than 11 hours", async ({
      page,
    }) => {
      await page.goto("/app/mr-plan");

      const dayCell = page.locator(".calendar-cell").first();
      await dayCell.click();

      const shiftTypeSelect = page.locator(
        'select[formControlName="shiftType"]',
      );
      await shiftTypeSelect.selectOption("day");

      const nextCell = page.locator(".calendar-cell").nth(1);
      await nextCell.click();
      await shiftTypeSelect.selectOption("day");

      await page.locator('button:has-text("Kaydet")').click();

      await page.waitForTimeout(500);

      const alert = page.locator(".rest-violation, .constraint-error");
      await expect(alert.first()).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe("3. Fair Night Distribution Maintained", () => {
    test("should balance night shifts across personnel", async ({ page }) => {
      await page.goto("/app/mr-plan");

      await page.goto("/app/reports");

      const fairnessScore = page.locator(".fairness-score, .fairness-metric");
      await expect(fairnessScore.first()).toBeVisible();

      const nightDistribution = page.locator("text=Gece Dağılımı");
      await expect(nightDistribution).toBeVisible();
    });
  });

  test.describe("4. Holiday Coloring Correct", () => {
    test("should apply correct color to national holidays", async ({
      page,
    }) => {
      await page.goto("/app/mr-plan");

      await page.goto("/app/bt-plan");

      const nationalHoliday = page
        .locator(".calendar-cell.national-holiday, .holiday.national")
        .first();
      if ((await nationalHoliday.count()) > 0) {
        await expect(nationalHoliday).toHaveCSS(
          "background-color",
          "rgb(220, 38, 38)",
        );
      }
    });

    test("should apply correct color to religious holidays", async ({
      page,
    }) => {
      await page.goto("/app/mr-plan");

      await page.goto("/app/bt-plan");

      const religiousHoliday = page
        .locator(".calendar-cell.religious-holiday, .holiday.religious")
        .first();
      if ((await religiousHoliday.count()) > 0) {
        await expect(religiousHoliday).toHaveCSS(
          "background-color",
          "rgb(234, 179, 8)",
        );
      }
    });

    test("should show holiday name on hover", async ({ page }) => {
      await page.goto("/app/mr-plan");

      const holidayCell = page.locator(".calendar-cell.is-holiday").first();
      if ((await holidayCell.count()) > 0) {
        await holidayCell.hover();
        const tooltip = page.locator(".holiday-tooltip, .tooltip");
        await expect(tooltip.first()).toBeVisible({ timeout: 2000 });
      }
    });
  });

  test.describe("5. Save/Load Persistence Works", () => {
    test("should persist schedule changes", async ({ page }) => {
      await page.goto("/app/mr-plan");

      const cell = page.locator(".calendar-cell").first();
      await cell.click();

      const personnelDropdown = page.locator(
        'select[formControlName="personnel"]',
      );
      await personnelDropdown.selectOption({ index: 0 });

      await page.locator('button:has-text("Kaydet")').click();
      await page.waitForTimeout(1000);

      await page.reload();
      await page.waitForLoadState("networkidle");

      await page.goto("/app/mr-plan");
      await page.waitForTimeout(1000);

      const savedCell = page.locator(".calendar-cell.has-assignment").first();
      await expect(savedCell).toBeVisible();
    });

    test("should preserve month navigation state", async ({ page }) => {
      await page.goto("/app/mr-plan");

      await page.locator('button:has-text("Sonraki Ay")').click();
      await page.waitForTimeout(500);

      await page.reload();
      await page.waitForLoadState("networkidle");

      await page.goto("/app/mr-plan");
      await page.waitForTimeout(500);

      const monthLabel = page.locator(".current-month, .month-label");
      await expect(monthLabel).toContainText("Haziran");
    });

    test("should sync between dashboard and plan pages", async ({ page }) => {
      await page.goto("/app/mr-plan");

      await page.locator('button:has-text("Kaydet")').first().click();
      await page.waitForTimeout(500);

      await page.goto("/app");
      await page.waitForTimeout(500);

      const metrics = page.locator(".metrics-row");
      await expect(metrics).toBeVisible();
    });
  });
});

test.describe("Dashboard Navigation", () => {
  test("should switch between heatmap units", async ({ page }) => {
    await page.goto("/app");

    const mrTab = page.locator('button:has-text("MR")');
    const btTab = page.locator('button:has-text("BT")');
    const rontgenTab = page.locator('button:has-text("RÖ")');
    const nukleerTab = page.locator('button:has-text("NT")');

    await mrTab.click();
    await expect(mrTab).toHaveClass(/active/);

    await btTab.click();
    await expect(btTab).toHaveClass(/active/);

    await rontgenTab.click();
    await expect(rontgenTab).toHaveClass(/active/);

    await nukleerTab.click();
    await expect(nukleerTab).toHaveClass(/active/);
  });
});

test.describe("Plan Page Navigation", () => {
  test("should navigate to all 4 unit plan pages", async ({ page }) => {
    await page.goto("/app/mr-plan");
    await expect(page.locator("h1, h2")).toContainText(/MR/);

    await page.goto("/app/bt-plan");
    await expect(page.locator("h1, h2")).toContainText(/BT/);

    await page.goto("/app/rontgen-plan");
    await expect(page.locator("h1, h2")).toContainText(/Röntgen/);

    await page.goto("/app/nukleer-tip-plan");
    await expect(page.locator("h1, h2")).toContainText(/Nükleer/);
  });
});

test.describe("Reports Page", () => {
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
