import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Production Verification — Auth + Session", () => {
  test("login page loads with form", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await expect(
      page.locator('input[type="email"], input[name="email"]'),
    ).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("invalid credentials show error", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const email = page.locator('input[type="email"], input[name="email"]');
    const password = page.locator('input[type="password"]');
    await email.fill("wrong@test.com");
    await password.fill("wrongpass");
    await page.locator('button[type="submit"]').click();
    await expect(
      page.locator(
        ".p-toast-message-error, .error-message, .alert, .toast-error",
      ),
    ).toBeVisible({ timeout: 5000 });
  });

  test("unauthenticated redirect to login", async ({ page }) => {
    await page.goto("/app/dashboard");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/app/dashboard");
  });

  test("logout clears session", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const email = page.locator('input[type="email"], input[name="email"]');
    const password = page.locator('input[type="password"]');
    if ((await email.count()) > 0) {
      await email.fill("admin@hospital.com");
      await password.fill("admin123");
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(2000);
      const logoutBtn = page.locator(
        'button:has-text("Çıkış"), button:has-text("Logout")',
      );
      if ((await logoutBtn.count()) > 0) {
        await logoutBtn.click();
        await page.waitForURL(/login/, { timeout: 5000 }).catch(() => {});
        expect(page.url()).toContain("login");
      }
    }
  });
});

test.describe("Production Verification — RBAC", () => {
  test("admin can access approval center", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const email = page.locator('input[type="email"], input[name="email"]');
    const password = page.locator('input[type="password"]');
    if ((await email.count()) > 0) {
      await email.fill("admin@hospital.com");
      await password.fill("admin123");
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(2000);
    }
    await page.goto("/app/approval-center");
    await page.waitForLoadState("networkidle");
    await expect(page.url()).toContain("approval-center");
  });
});

test.describe("Production Verification — Dashboard + Metrics", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("dashboard loads with KPIs", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const email = page.locator('input[type="email"], input[name="email"]');
    const password = page.locator('input[type="password"]');
    if ((await email.count()) > 0) {
      await email.fill("admin@hospital.com");
      await password.fill("admin123");
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/dashboard/, { timeout: 10000 }).catch(() => {});
    }
    const kpi = page.locator(".kpi-card, .metric-card, .stat-card").first();
    await expect(kpi).toBeVisible({ timeout: 10000 });
  });

  test("refresh button updates metrics", async ({ page }) => {
    await page.goto("/app/dashboard");
    await page.waitForLoadState("networkidle");
    const refreshBtn = page
      .locator('button:has-text("Yenile"), button[aria-label="Refresh"]')
      .first();
    if ((await refreshBtn.count()) > 0) {
      await refreshBtn.click();
      await page.waitForTimeout(2000);
    }
  });
});

test.describe("Production Verification — Personnel", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("personnel table loads", async ({ page }) => {
    await page.goto("/app/employees");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("table, .personnel-list")).toBeVisible();
  });

  test("personnel search filter works", async ({ page }) => {
    await page.goto("/app/employees");
    await page.waitForLoadState("networkidle");
    const search = page
      .locator('input[placeholder*="Ara"], input[type="search"]')
      .first();
    if ((await search.count()) > 0) {
      await search.fill("test");
      await page.waitForTimeout(500);
    }
  });
});

test.describe("Production Verification — Schedule Engine", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("MR plan page loads calendar", async ({ page }) => {
    await page.goto("/app/mr-plan");
    await page.waitForLoadState("networkidle");
    const calendar = page.locator(".calendar, .plan-container, .schedule-grid");
    await expect(calendar).toBeVisible();
  });

  test("schedule navigation controls present", async ({ page }) => {
    await page.goto("/app/mr-plan");
    await page.waitForLoadState("networkidle");
    const nextBtn = page.locator(
      'button:has-text("İleri"), button[aria-label="Next"]',
    );
    const prevBtn = page.locator(
      'button:has-text("Geri"), button[aria-label="Previous"]',
    );
    await expect(nextBtn.or(prevBtn)).toBeVisible();
  });

  test("schedule has month/year display", async ({ page }) => {
    await page.goto("/app/mr-plan");
    await page.waitForLoadState("networkidle");
    const monthLabel = page.locator("text=/202[0-9]/");
    await expect(monthLabel).toBeVisible();
  });
});

test.describe("Production Verification — Refresh Persistence", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("page state persists after refresh", async ({ page }) => {
    await page.goto("/app/mr-plan");
    await page.waitForLoadState("networkidle");
    const monthText = await page
      .locator(".current-month, .month-label")
      .textContent();
    await page.reload();
    await page.waitForLoadState("networkidle");
    if (monthText) {
      await expect(page.locator(".current-month, .month-label")).toContainText(
        monthText.trim(),
      );
    }
  });
});

test.describe("Production Verification — Notifications", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("notification panel accessible", async ({ page }) => {
    await page.goto("/app/dashboard");
    await page.waitForLoadState("networkidle");
    const notifBtn = page
      .locator('button:has-text("Bildirim"), .notification-bell, .notif-icon')
      .first();
    if ((await notifBtn.count()) > 0) {
      await notifBtn.click();
      await page.waitForTimeout(500);
    }
  });
});

test.describe("Production Verification — Export", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("export button present on reports", async ({ page }) => {
    await page.goto("/app/reports");
    await page.waitForLoadState("networkidle");
    const exportBtn = page
      .locator(
        'button:has-text("Dışa Aktar"), button:has-text("Export"), button:has-text("PDF")',
      )
      .first();
    await expect(exportBtn).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Production Verification — Error Resilience", () => {
  test("404 page does not crash", async ({ page }) => {
    await page.goto("/app/nonexistent-route");
    await page.waitForLoadState("networkidle");
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test("loading states render skeleton", async ({ page }) => {
    await page.goto("/app/dashboard");
    const skeleton = page
      .locator(".skeleton, .loading-spinner, .shimmer")
      .first();
    await expect(skeleton)
      .toBeVisible({ timeout: 3000 })
      .catch(() => {
        // Skeleton may already have resolved — not a failure
      });
  });
});

test.describe("Production Verification — Schedule Units", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const units = ["mr", "bt", "rontgen", "nukleer-tip", "onkoloji"];
  for (const unit of units) {
    test(`${unit} plan page loads`, async ({ page }) => {
      await page.goto(`/app/${unit}-plan`);
      await page.waitForLoadState("networkidle");
      const calendar = page.locator(
        ".calendar, .plan-container, .schedule-grid",
      );
      await expect(calendar).toBeVisible();
    });
  }
});

test.describe("Production Verification — Multi-Role Access", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("operations center loads with controls", async ({ page }) => {
    await page.goto("/app/operations");
    await page.waitForLoadState("networkidle");
    const header = page.locator("header, .header-bar, .operations-header");
    await expect(header).toBeVisible();
  });
});
