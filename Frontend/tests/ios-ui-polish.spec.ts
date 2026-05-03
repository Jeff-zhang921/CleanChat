import { expect, test } from "@playwright/test";
const viewer = {
  id: 1,
  name: "Jeff",
  email: "zjingxiang527@gmail.com",
  cleanId: "jeff",
  avatar: "AVATAR_LEO",
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

  await page.route("**/chat/threads/*/messages", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 1,
          threadId: 1,
          senderId: 2,
          body: "Hello from history",
          createdAt: new Date().toISOString(),
        },
      ]),
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

test("ios polish disables tap highlight and applies damping transitions", async ({
  page,
}) => {
  await page.goto("/conversations");
  await expect(page.locator(".bottom-nav-link").first()).toBeVisible();

  const appCssResponse = await page.request.get("/src/App.css");
  const navCssResponse = await page.request.get(
    "/src/components/BottomNav.css",
  );
  const chatCssResponse = await page.request.get("/src/pages/chatPage.css");

  expect(appCssResponse.ok()).toBe(true);
  expect(navCssResponse.ok()).toBe(true);
  expect(chatCssResponse.ok()).toBe(true);

  const appCss = await appCssResponse.text();
  const navCss = await navCssResponse.text();
  const chatCss = await chatCssResponse.text();

  expect(appCss).toContain(":root");
  expect(appCss).toContain("-webkit-tap-highlight-color: transparent");
  expect(appCss).toContain(
    "--motion-ios-spring: cubic-bezier(0.32, 0.72, 0, 1)",
  );
  expect(appCss).toContain("@keyframes hybrid-root-view-enter");

  expect(navCss).toContain(".bottom-nav-link:active");
  expect(navCss).toContain("transform: scale(0.92)");
  expect(navCss).toContain("opacity: 0.7");
  expect(navCss).toContain("transition: all 0.1s ease");

  expect(chatCss).toContain(
    "--chat-overlay-curve: var(--motion-ios-spring, cubic-bezier(0.32, 0.72, 0, 1))",
  );
  expect(chatCss).toContain(
    "chat-overlay-in var(--chat-overlay-duration) var(--chat-overlay-curve) both",
  );
  expect(chatCss).toContain(
    "chat-overlay-out var(--chat-overlay-duration) var(--chat-overlay-curve) forwards",
  );

  const navTransition = await page
    .locator(".bottom-nav-link")
    .first()
    .evaluate((node) => getComputedStyle(node).transition);
  expect(navTransition).toContain("cubic-bezier(0.32, 0.72, 0, 1)");

  await page.getByRole("link", { name: "Join Group" }).click();
  await expect(page).toHaveURL(/\/groups/);

  const rootMotion = await page.evaluate(() => {
    const activeRoot = document.querySelector<HTMLElement>(
      ".hybrid-root-view.is-active",
    );
    if (!activeRoot) {
      return null;
    }

    const style = getComputedStyle(activeRoot);
    return {
      animationName: style.animationName,
      animationTimingFunction: style.animationTimingFunction,
    };
  });

  expect(rootMotion).not.toBeNull();
  expect(rootMotion?.animationName).toContain("hybrid-root-view-enter");
  expect(rootMotion?.animationTimingFunction).toContain(
    "cubic-bezier(0.32, 0.72, 0, 1)",
  );

  await page.getByRole("link", { name: "Chats" }).click();
  await expect(page).toHaveURL(/\/conversations/);

  await page.locator("[data-conversation-id]").first().click();
  await expect(page).toHaveURL(/\/chat/);
  await expect(page.locator(".chat-shell")).toBeVisible();

  const detailMotion = await page.evaluate(() => {
    const chatShell = document.querySelector<HTMLElement>(".chat-shell");
    if (!chatShell) {
      return null;
    }

    const style = getComputedStyle(chatShell);
    return {
      animationName: style.animationName,
      animationTimingFunction: style.animationTimingFunction,
      animationDuration: style.animationDuration,
    };
  });

  expect(detailMotion).not.toBeNull();
  expect(detailMotion?.animationName).toContain("chat-overlay-in");
  expect(detailMotion?.animationTimingFunction).toContain(
    "cubic-bezier(0.32, 0.72, 0, 1)",
  );
  expect(detailMotion?.animationDuration).toBe("0.3s");

  await page.getByRole("button", { name: "Go back" }).click();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const chatShell = document.querySelector<HTMLElement>(
          ".chat-shell.is-closing",
        );
        if (!chatShell) {
          return "";
        }

        const style = getComputedStyle(chatShell);
        return `${style.animationName}|${style.animationTimingFunction}|${style.animationDuration}`;
      }),
    )
    .toContain("chat-overlay-out");

  await expect(page).toHaveURL(/\/conversations/);
});
