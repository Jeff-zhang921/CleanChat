import { expect, test } from "@playwright/test";

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
  Array.from({ length: 40 }, (_, index) => {
    const partnerId = index + 2;
    const createdAt = new Date(
      Date.now() - (index + 1) * 120_000,
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

test("hybrid stack keeps list instant after 20 chat round-trips", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto("/conversations");
  await expect(page.locator("[data-conversation-id]").first()).toBeVisible();

  const nodeCounts: number[] = [];
  const heapSamples: number[] = [];

  for (let index = 0; index < 20; index += 1) {
    const threadId = index + 2;

    const scrollTopBeforeOpen = await page.evaluate((targetThreadId) => {
      const scroller = document.querySelector<HTMLElement>(
        ".conversations-scroll-shell",
      );
      const card = document.querySelector<HTMLElement>(
        `[data-conversation-id='direct-${targetThreadId}']`,
      );

      if (!scroller || !card) {
        return 0;
      }

      const anchorOffset = Math.max(90, Math.floor(window.innerHeight * 0.2));
      const nextTop = Math.max(0, card.offsetTop - anchorOffset);
      scroller.scrollTop = nextTop;
      return scroller.scrollTop;
    }, threadId);

    await page.waitForTimeout(30);

    const clicked = await page.evaluate((targetThreadId) => {
      const target = document.querySelector<HTMLButtonElement>(
        `[data-conversation-id='direct-${targetThreadId}']`,
      );
      if (!target) {
        return false;
      }
      target.click();
      return true;
    }, threadId);
    expect(clicked).toBe(true);
    await expect(page).toHaveURL(/\/chat/);
    await expect(page.locator(".chat-shell")).toBeVisible();

    const overlayState = await page.evaluate(() => {
      const chatShell = document.querySelector<HTMLElement>(".chat-shell");
      const sleepingRoot = document.querySelector<HTMLElement>(
        ".hybrid-root-view.is-active.is-sleeping",
      );
      const dormantList = document.querySelector<HTMLElement>(
        ".conversations-page.is-dormant",
      );

      return {
        chatBackground: chatShell
          ? getComputedStyle(chatShell).backgroundColor
          : "",
        sleepingRootPointerEvents: sleepingRoot
          ? getComputedStyle(sleepingRoot).pointerEvents
          : "",
        sleepingRootAriaHidden:
          sleepingRoot?.getAttribute("aria-hidden") ?? null,
        dormantListPointerEvents: dormantList
          ? getComputedStyle(dormantList).pointerEvents
          : "",
        dormantListAriaHidden: dormantList?.getAttribute("aria-hidden") ?? null,
      };
    });

    expect(overlayState.chatBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(overlayState.chatBackground).not.toBe("transparent");
    expect(overlayState.sleepingRootPointerEvents).toBe("none");
    expect(overlayState.sleepingRootAriaHidden).toBe("true");
    expect(overlayState.dormantListPointerEvents).toBe("none");
    expect(overlayState.dormantListAriaHidden).toBe("true");

    await page.getByRole("button", { name: "Go back" }).click();
    await expect(page).toHaveURL(/\/conversations/);
    await expect(
      page.locator(`[data-conversation-id='direct-${threadId}']`),
    ).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => document.querySelectorAll(".chat-shell").length),
      )
      .toBe(0);

    const metrics = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>(
        ".conversations-scroll-shell",
      );
      const usedHeap = (
        performance as Performance & {
          memory?: { usedJSHeapSize?: number };
        }
      ).memory?.usedJSHeapSize;

      return {
        scrollTop: scroller ? scroller.scrollTop : 0,
        nodeCount: document.getElementsByTagName("*").length,
        chatShellCount: document.querySelectorAll(".chat-shell").length,
        usedHeap: typeof usedHeap === "number" ? usedHeap : null,
      };
    });

    expect(
      Math.abs(metrics.scrollTop - scrollTopBeforeOpen),
    ).toBeLessThanOrEqual(2);
    expect(metrics.chatShellCount).toBe(0);

    nodeCounts.push(metrics.nodeCount);
    if (typeof metrics.usedHeap === "number") {
      heapSamples.push(metrics.usedHeap);
    }
  }

  const nodeSpan = Math.max(...nodeCounts) - Math.min(...nodeCounts);
  expect(nodeSpan).toBeLessThan(180);

  if (heapSamples.length >= 6) {
    const headWindow = [...heapSamples.slice(0, 3)].sort((a, b) => a - b);
    const tailWindow = [...heapSamples.slice(-3)].sort((a, b) => a - b);
    const headMedian = headWindow[Math.floor(headWindow.length / 2)];
    const tailMedian = tailWindow[Math.floor(tailWindow.length / 2)];
    expect(tailMedian).toBeLessThan(headMedian * 1.35);
  }
});
