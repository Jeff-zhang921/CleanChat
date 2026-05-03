import { expect, test } from "@playwright/test";
const viewer = {
  id: 1,
  name: "Jeff",
  email: "zjingxiang527@gmail.com",
  cleanId: "jeff",
  avatar: "AVATAR_LEO",
};

const buildThreads = () =>
  Array.from({ length: 10 }, (_, index) => {
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

test.beforeEach(async ({ page }) => {
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
});

test("new messages prepend with fluid transition and premium unread badge", async ({
  page,
}) => {
  const targetThreadId = 11;

  await page.goto("/conversations");
  await expect(page.locator("[data-conversation-id]").first()).toBeVisible();

  await page.waitForTimeout(350);
  await page.screenshot({
    path: "test-results/conversations-fluid-before.png",
    fullPage: false,
  });

  await page.evaluate((threadId) => {
    window.dispatchEvent(
      new CustomEvent("cleanchat:simulate-inbox", {
        detail: {
          chatType: "direct",
          threadId,
          senderId: 999,
          body: "Inbox refreshed",
          createdAt: new Date().toISOString(),
        },
      }),
    );
  }, targetThreadId);

  await page.waitForTimeout(90);
  await page.screenshot({
    path: "test-results/conversations-fluid-during.png",
    fullPage: false,
  });

  await page.waitForTimeout(520);
  await page.screenshot({
    path: "test-results/conversations-fluid-after.png",
    fullPage: false,
  });

  const firstConversationId = await page
    .locator("[data-conversation-id]")
    .first()
    .getAttribute("data-conversation-id");

  expect(firstConversationId).toBe(`direct-${targetThreadId}`);
  await expect(
    page.locator(
      `[data-conversation-id='direct-${targetThreadId}'] .conversation-unread-dot`,
    ),
  ).toBeVisible();
});
