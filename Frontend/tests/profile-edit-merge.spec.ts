import { expect, test } from "@playwright/test";

const TRUST_CLEAR = {
  score: 96,
  band: "clear",
  title: "Clear signal",
  summary: "Stable, calm, and trusted.",
  detail: "This CleanID has a consistent and healthy communication history.",
  metrics: {
    accountAgeDays: 380,
    directThreads: 42,
    sentMessages: 1320,
    sustainedThreads: 24,
    recentMessages: 28,
    moderationPenalties: 0,
  },
} as const;

const viewer = {
  id: 1,
  name: "Jeff",
  email: "jeff@example.com",
  cleanId: "jeff_clean",
  avatar: "AVATAR_LEO",
  gender: "male",
  trust: TRUST_CLEAR,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("cleanchat:auth-token", "playwright-token");
  });

  await page.route("**/profile/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: viewer }),
    });
  });

  await page.route("**/chat/groups", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ groups: [] }),
    });
  });

  await page.route("**/api/unread-count", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ counts: {} }),
    });
  });

  await page.route("**/socket.io/**", async (route) => {
    await route.abort("internetdisconnected");
  });
});

test("purity edit entry opens merged profile edit", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.locator(".profile-shell")).toBeVisible();

  await page.locator(".profile-aura-button").click();
  await expect(page).toHaveURL(/\/profile\/purity/);
  await expect(page.locator(".purity-detail-page")).toBeVisible();

  await page.locator(".purity-resonance-cta").click();
  await expect(page).toHaveURL(/\/profile\/edit/);
  await expect(page.locator(".profile-edit-page")).toBeVisible();

  await expect(page.locator(".profile-claim-editor-focus")).toBeVisible();
  await expect(page.locator("#cleanId")).toBeFocused();

  await expect(page.locator(".profile-avatar-grid").first()).toBeVisible();
});
