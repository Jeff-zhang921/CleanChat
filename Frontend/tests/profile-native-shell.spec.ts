import { expect, test } from "@playwright/test";

const isIdentityTransform = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "none") return true;

  const nearly = (actual: number, expected: number, epsilon = 0.001) =>
    Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon;

  if (trimmed.startsWith("matrix3d(")) {
    const parts = trimmed
      .slice("matrix3d(".length, -1)
      .split(",")
      .map((part) => Number.parseFloat(part.trim()));
    if (parts.length !== 16) return false;
    return parts.every((value, index) => {
      const expected =
        index === 0 || index === 5 || index === 10 || index === 15 ? 1 : 0;
      return nearly(value, expected);
    });
  }

  if (trimmed.startsWith("matrix(")) {
    const parts = trimmed
      .slice("matrix(".length, -1)
      .split(",")
      .map((part) => Number.parseFloat(part.trim()));
    if (parts.length !== 6) return false;
    return (
      nearly(parts[0], 1) &&
      nearly(parts[1], 0) &&
      nearly(parts[2], 0) &&
      nearly(parts[3], 1) &&
      nearly(parts[4], 0) &&
      nearly(parts[5], 0)
    );
  }

  return false;
};

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
  await expect
    .poll(
      async () => {
        const transform = await page.evaluate(() => {
          const stage = document.querySelector<HTMLElement>(".app-route-stage");
          return stage ? getComputedStyle(stage).transform : "";
        });
        return isIdentityTransform(transform);
      },
      { timeout: 2500 },
    )
    .toBe(true);

  const audit = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".profile-shell");
    const stage = document.querySelector<HTMLElement>(".app-route-stage");
    const nav = document.querySelector<HTMLElement>(".bottom-nav");
    const firstCard = document.querySelector<HTMLElement>(
      ".profile-entry-card",
    );

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
      shellPaddingLeft: Number.parseFloat(getComputedStyle(shell).paddingLeft),
      shellPaddingRight: Number.parseFloat(
        getComputedStyle(shell).paddingRight,
      ),
      shellPaddingTop: Number.parseFloat(getComputedStyle(shell).paddingTop),
      shellTransform: getComputedStyle(shell).transform,
      stageTransform: stage ? getComputedStyle(stage).transform : "none",
      navLeft: nav ? nav.getBoundingClientRect().left : null,
      navRightGap: nav
        ? viewportWidth - nav.getBoundingClientRect().right
        : null,
      firstCardLeft: firstCard ? firstCard.getBoundingClientRect().left : null,
      firstCardRightGap: firstCard
        ? viewportWidth - firstCard.getBoundingClientRect().right
        : null,
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
  expect(audit!.shellPaddingLeft).toBeLessThanOrEqual(1.5);
  expect(audit!.shellPaddingRight).toBeLessThanOrEqual(1.5);
  expect(audit!.shellPaddingTop).toBeLessThanOrEqual(1.5);
  expect(audit!.shellTransform).toBe("none");
  expect(isIdentityTransform(audit!.stageTransform)).toBe(true);
  expect(Math.abs(audit!.navLeft ?? 0)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(audit!.navRightGap ?? 0)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(audit!.firstCardLeft ?? 0)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(audit!.firstCardRightGap ?? 0)).toBeLessThanOrEqual(0.5);
  expect(audit!.overflowDelta).toBeLessThanOrEqual(0);
  expect(audit!.cornersCovered.every(Boolean)).toBe(true);

  await page.screenshot({
    path: "test-results/profile-native-shell-audit.png",
    fullPage: false,
  });
});
