import { expect, test } from "@playwright/test";

const viewer = {
  id: 1,
  name: "Jeff",
  email: "jeff@example.com",
  cleanId: "jeff_clean",
  avatar: "AVATAR_LEO",
  gender: "male",
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

test("profile edit contains CleanID claim controls and unlocked avatars", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.locator(".profile-shell")).toBeVisible();

  await page.locator(".profile-action-row").first().click();
  await expect(page).toHaveURL(/\/profile\/edit/);
  await expect(page.locator(".profile-edit-page")).toBeVisible();

  await expect(page.locator(".profile-claim-editor")).toBeVisible();
  await expect(page.locator(".profile-edit-page .profile-avatar-grid")).toHaveCount(0);
  await page.locator(".profile-avatar-picker-trigger").click();
  await expect(page.locator(".profile-avatar-picker-dialog")).toBeVisible();
  await expect(page.locator(".profile-avatar-picker-dialog .profile-avatar-grid")).toBeVisible();
});
