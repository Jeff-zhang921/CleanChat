import { expect, test, devices } from "@playwright/test";

const pixel7Device = (({
  viewport,
  userAgent,
  deviceScaleFactor,
  isMobile,
  hasTouch,
}) => ({
  viewport,
  userAgent,
  deviceScaleFactor,
  isMobile,
  hasTouch,
}))(devices["Pixel 7"]);

const ipadPro11Device = (({
  viewport,
  userAgent,
  deviceScaleFactor,
  isMobile,
  hasTouch,
}) => ({
  viewport,
  userAgent,
  deviceScaleFactor,
  isMobile,
  hasTouch,
}))(devices["iPad Pro 11"]);

const TRUST_CLEAR = {
  score: 100,
  band: "clear",
  title: "Clear signal",
  summary: "Stable, calm, and trusted.",
  detail: "This CleanID has a consistent and healthy communication history.",
  metrics: {
    accountAgeDays: 400,
    directThreads: 48,
    sentMessages: 1480,
    sustainedThreads: 28,
    recentMessages: 34,
    moderationPenalties: 0,
  },
} as const;

const viewer = {
  id: 1,
  name: "Jeff",
  email: "zjingxiang527@gmail.com",
  cleanId: "jeff",
  avatar: "AVATAR_LEO",
  trust: TRUST_CLEAR,
};

const buildThreads = () =>
  Array.from({ length: 12 }, (_, index) => {
    const partnerId = index + 2;
    const createdAt = new Date(
      Date.now() - (index + 2) * 120_000,
    ).toISOString();

    return {
      id: partnerId,
      AID: viewer.id,
      BID: partnerId,
      lastMessageAt: createdAt,
      createdAt,
      updatedAt: createdAt,
      UserA: viewer,
      UserB: {
        id: partnerId,
        name: `Quiet ${partnerId}`,
        email: `quiet${partnerId}@example.com`,
        cleanId: `quiet_${partnerId}`,
        avatar: "AVATAR_SOPHIE",
        trust: {
          ...TRUST_CLEAR,
          score: 84,
          band: partnerId % 3 === 0 ? "steady" : "clear",
          title: partnerId % 3 === 0 ? "Steady signal" : "Clear signal",
        },
      },
      Messages: [
        {
          id: 10_000 + partnerId,
          body: `Rendered message ${partnerId}`,
          createdAt,
          senderId: partnerId,
        },
      ],
    };
  });

const buildThreadMessages = (threadId: number) => {
  const now = Date.now();
  return Array.from({ length: 64 }, (_, index) => {
    const messageId = threadId * 10_000 + index + 1;
    const senderId = index % 2 === 0 ? viewer.id : threadId + 1;

    return {
      id: messageId,
      threadId,
      senderId,
      body: `History message ${index + 1}`,
      createdAt: new Date(now - (64 - index) * 35_000).toISOString(),
    };
  });
};

const readChatViewportMetrics = async (
  page: import("@playwright/test").Page,
) => {
  return page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(
      ".chat-virtuoso-scroller",
    );
    const bar = document.querySelector<HTMLElement>(".chat-bar");

    if (!scroller || !bar) {
      return null;
    }

    const distanceToBottom = Math.max(
      0,
      scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop,
    );
    const headerTop = bar.getBoundingClientRect().top;

    return {
      distanceToBottom,
      headerTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
    };
  });
};

const mockChatApis = async (page: import("@playwright/test").Page) => {
  const threads = buildThreads();

  await page.addInitScript(() => {
    window.localStorage.setItem("cleanchat:auth-token", "playwright-token");
  });

  await page.route("**/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: viewer }),
    });
  });

  await page.route("**/chat/threads", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(threads),
    });
  });

  await page.route("**/chat/threads/*/messages", async (route) => {
    const threadIdMatch = route
      .request()
      .url()
      .match(/\/chat\/threads\/(\d+)\/messages/);
    const threadId = threadIdMatch ? Number.parseInt(threadIdMatch[1], 10) : 1;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildThreadMessages(threadId)),
    });
  });

  await page.route("**/api/unread-count", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ counts: {} }),
    });
  });

  await page.route("**/chat/mutes", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ keys: [] }),
    });
  });

  await page.route("**/chat/unread/read", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route("**/chat/requests/direct/received", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ requests: [] }),
    });
  });

  await page.route("**/chat/groups", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ groups: [] }),
    });
  });

  await page.route("**/chat/users/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ users: [] }),
    });
  });

  await page.route("**/socket.io/**", async (route) => {
    await route.abort("internetdisconnected");
  });
};

const assertHeaderPinnedAfterKeyboardViewportChange = async (
  page: import("@playwright/test").Page,
) => {
  await page.goto("/conversations");
  await page.locator("[data-conversation-id]").first().click();
  await expect(page).toHaveURL(/\/chat/);

  await page.waitForSelector(".chat-virtuoso-scroller");

  await expect
    .poll(
      async () => {
        const metrics = await readChatViewportMetrics(page);
        if (!metrics) {
          return false;
        }

        const overflowHeight = metrics.scrollHeight - metrics.clientHeight;
        return overflowHeight > 300 && metrics.distanceToBottom <= 24;
      },
      {
        timeout: 3_000,
        intervals: [120, 180, 240],
      },
    )
    .toBe(true);

  const chatBar = page.locator(".chat-bar");
  const chatAvatar = page.locator(".chat-bar .avatar");
  const chatTitle = page.locator(".chat-title");
  const messageInput = page.locator('.chat-input input[type="text"]');

  await expect(chatBar).toBeVisible();
  await expect(chatAvatar).toBeVisible();
  await expect(chatTitle).toBeVisible();

  const entryMetrics = await readChatViewportMetrics(page);
  expect(entryMetrics).not.toBeNull();
  const entryOverflow =
    (entryMetrics?.scrollHeight ?? 0) - (entryMetrics?.clientHeight ?? 0);
  expect(entryOverflow).toBeGreaterThan(300);
  expect(entryMetrics?.distanceToBottom ?? 999).toBeLessThanOrEqual(24);

  const before = await chatBar.boundingBox();
  expect(before).not.toBeNull();
  const beforeTop = before?.y ?? 999;
  expect(beforeTop).toBeGreaterThanOrEqual(-1);
  expect(beforeTop).toBeLessThanOrEqual(10);

  await messageInput.focus();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const nextHeight = Math.max(420, (viewport?.height ?? 900) - 280);
  await page.setViewportSize({
    width: viewport?.width ?? 390,
    height: nextHeight,
  });

  await page.waitForTimeout(250);

  const afterMetrics = await readChatViewportMetrics(page);
  expect(afterMetrics).not.toBeNull();
  expect(afterMetrics?.distanceToBottom ?? 999).toBeLessThanOrEqual(24);

  const after = await chatBar.boundingBox();
  expect(after).not.toBeNull();
  const afterTop = after?.y ?? -999;
  expect(afterTop).toBeGreaterThanOrEqual(-1);
  expect(afterTop).toBeLessThanOrEqual(10);
  expect(Math.abs(afterTop - beforeTop)).toBeLessThanOrEqual(4.5);

  await expect(chatAvatar).toBeVisible();
  await expect(chatTitle).toBeVisible();

  const viewportSync = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".chat-shell");
    if (!shell) {
      return null;
    }

    const cssHeight = shell.style
      .getPropertyValue("--chat-visual-viewport-height")
      .trim();
    const cssTop = shell.style
      .getPropertyValue("--chat-visual-viewport-top")
      .trim();

    return {
      cssHeight,
      cssTop,
      visualViewportHeight: window.visualViewport?.height ?? window.innerHeight,
    };
  });

  expect(viewportSync).not.toBeNull();
  expect(viewportSync?.cssHeight).toMatch(/\d+px/);
  expect(viewportSync?.cssTop).toMatch(/\d+px/);
};

test.describe("android header lock under keyboard squeeze", () => {
  test.use({
    ...pixel7Device,
    serviceWorkers: "block",
  });

  test.beforeEach(async ({ page }) => {
    await mockChatApis(page);
  });

  test("keeps avatar and name pinned at top after input focus", async ({
    page,
  }) => {
    await assertHeaderPinnedAfterKeyboardViewportChange(page);
  });
});

test.describe("ipad header lock under keyboard squeeze", () => {
  test.use({
    ...ipadPro11Device,
    serviceWorkers: "block",
  });

  test.beforeEach(async ({ page }) => {
    await mockChatApis(page);
  });

  test("keeps avatar and name pinned at top after input focus", async ({
    page,
  }) => {
    await assertHeaderPinnedAfterKeyboardViewportChange(page);
  });
});
