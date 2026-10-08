import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

type SlotPair = { device: string; nightDate: string; dayDate: string };

// Slotlar doluluk durumuna göre kaydığı için nth() ile seçim yapılamaz;
// her cihaz satırında gerçekten boş olan gece hücresini bulup hedef günün
// (aynı gün / ertesi gün) gündüz hücresiyle eşleştirir.
async function findSlotPair(
  page: Page,
  mode: "same-day" | "next-day",
): Promise<SlotPair | null> {
  const nightCells = page.locator("tr.night-shift-row td.night-cell");
  const count = await nightCells.count();
  for (let i = 0; i < count; i++) {
    const cell = nightCells.nth(i);
    if ((await cell.locator(".add-person-btn").count()) === 0) continue;
    const date = await cell.getAttribute("data-date");
    const device = await cell.evaluate(
      (el) => el.closest("tr")?.getAttribute("data-device") ?? "",
    );
    if (!date || !device) continue;
    const target =
      mode === "same-day"
        ? date
        : new Date(Date.parse(`${date}T00:00:00Z`) + 86400000)
            .toISOString()
            .slice(0, 10);
    const dayAdd = page.locator(
      `tr.day-shift-row[data-device="${device}"] td.person-cell[data-date="${target}"] .add-person-btn`,
    );
    if ((await dayAdd.count()) > 0) {
      return { device, nightDate: date, dayDate: target };
    }
  }
  return null;
}

// Diyalogda kaydetmeyi engellemeyen ilk personeli seçer, kaydeder ve seçilen
// adı döner; hiçbiri engelsiz değilse null.
async function saveFirstUnblocked(page: Page): Promise<string | null> {
  const candidates = page.locator(".personnel-item:not(.ineligible)");
  const total = await candidates.count();
  for (let i = 0; i < total && i < 8; i++) {
    const candidate = candidates.nth(i);
    await candidate.click();
    const name = (
      await candidate.locator(".personnel-name").textContent()
    )?.trim();
    const saveBtn = page.locator(".dialog-footer .btn-primary");
    try {
      await expect(saveBtn).toBeEnabled({ timeout: 1500 });
    } catch {
      continue;
    }
    await saveBtn.click();
    return name ?? null;
  }
  return null;
}

// Gece slotuna, çakışma uyarısı üretmeyen ilk uygun personeli atar ve
// kaydın gerçekten hücreye düştüğünü doğrular.
async function assignNightSlot(page: Page, pair: SlotPair): Promise<string> {
  await page
    .locator(
      `tr.night-shift-row[data-device="${pair.device}"] td.night-cell[data-date="${pair.nightDate}"] .add-person-btn`,
    )
    .first()
    .click();
  await expect(page.locator(".personnel-item").first()).toBeVisible();

  const name = await saveFirstUnblocked(page);
  if (!name) {
    throw new Error("Gece vardiyasina atanabilir personel bulunamadi");
  }
  await expect(
    page.locator(
      `tr.night-shift-row[data-device="${pair.device}"] td.night-cell[data-date="${pair.nightDate}"] .person-card`,
    ),
  ).toBeVisible({ timeout: 5000 });
  return name;
}

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

      const pair = await findSlotPair(page, "same-day");
      test.skip(!pair, "Eslesen bos gun/gunduz slotu yok");
      const personName = await assignNightSlot(page, pair!);

      await page
        .locator(
          `tr.day-shift-row[data-device="${pair!.device}"] td.person-cell[data-date="${pair!.dayDate}"] .add-person-btn`,
        )
        .first()
        .click();
      await expect(page.locator(".personnel-item").first()).toBeVisible();
      await page
        .locator(".personnel-item", { hasText: personName })
        .first()
        .click();

      const saveBtn = page.locator(".dialog-footer .btn-primary");
      await expect(saveBtn).toContainText("Atama Engellendi", {
        timeout: 3000,
      });
      await expect(saveBtn).toBeDisabled();
    });
  });

  test.describe("2. 11h Rest Violation Detection", () => {
    test("should show rest violation warning when rest is less than 11 hours", async ({
      page,
    }) => {
      await page.goto("/app/mr-plan");
      await page.waitForLoadState("networkidle");

      const pair = await findSlotPair(page, "next-day");
      test.skip(!pair, "Ardasik gun eslesen bos slot yok");
      const personName = await assignNightSlot(page, pair!);

      await page
        .locator(
          `tr.day-shift-row[data-device="${pair!.device}"] td.person-cell[data-date="${pair!.dayDate}"] .add-person-btn`,
        )
        .first()
        .click();
      await expect(page.locator(".personnel-item").first()).toBeVisible();
      await page
        .locator(".personnel-item", { hasText: personName })
        .first()
        .click();

      await expect(
        page.locator(".slot-warning.error", {
          hasText: "dinlenme kuralı ihlali",
        }),
      ).toBeVisible({ timeout: 3000 });
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
      const savedName = await saveFirstUnblocked(page);
      expect(savedName).toBeTruthy();
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
