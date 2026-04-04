import { expect, test } from "@playwright/test";

const isIdentityTransform = (value: string) =>
  value === "none" || value === "matrix(1, 0, 0, 1, 0, 0)";

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

const profileUser = {
  id: 1,
  name: "Jeff",
  email: "zjingxiang527@gmail.com",
  cleanId: "jeff",
  avatar: "AVATAR_LEO",
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
      body: JSON.stringify({ user: profileUser }),
    });
  });

  await page.route("**/chat/groups", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ groups: [] }),
    });
  });

  await page.route("**/socket.io/**", async (route) => {
    await route.abort("internetdisconnected");
  });
});

test("profile shell is edge-to-edge with no scale residue", async ({
  page,
}) => {
  await page.goto("/profile");
  await expect(page.locator(".profile-shell")).toBeVisible();
  await page.waitForTimeout(420);

  const audit = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".profile-shell");
    const stage = document.querySelector<HTMLElement>(".app-route-stage");

    if (!shell) {
      return null;
    }

    const rect = shell.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const nearCorners = [
      document.elementFromPoint(1, 1)?.closest(".profile-shell") !== null,
      document
        .elementFromPoint(viewportWidth - 2, 1)
        ?.closest(".profile-shell") !== null,
      document
        .elementFromPoint(1, viewportHeight - 2)
        ?.closest(".profile-shell") !== null,
      document
        .elementFromPoint(viewportWidth - 2, viewportHeight - 2)
        ?.closest(".profile-shell") !== null,
    ];

    return {
      left: rect.left,
      top: rect.top,
      rightGap: viewportWidth - rect.right,
      bottomGap: viewportHeight - rect.bottom,
      shellTransform: getComputedStyle(shell).transform,
      stageTransform: stage ? getComputedStyle(stage).transform : "none",
      overflowDelta:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      cornersCovered: nearCorners,
    };
  });

  expect(audit).not.toBeNull();
  expect(Math.abs(audit!.left)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(audit!.top)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(audit!.rightGap)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(audit!.bottomGap)).toBeLessThanOrEqual(0.5);
  expect(audit!.shellTransform).toBe("none");
  expect(isIdentityTransform(audit!.stageTransform)).toBe(true);
  expect(audit!.overflowDelta).toBeLessThanOrEqual(0);
  expect(audit!.cornersCovered.every(Boolean)).toBe(true);

  await page.screenshot({
    path: "test-results/profile-native-shell-audit.png",
    fullPage: false,
  });
});
