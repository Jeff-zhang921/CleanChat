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
  Array.from({ length: 180 }, (_, index) => {
    const partnerId = index + 2;
    const minuteOffset = index + 1;
    const createdAt = new Date(Date.now() - minuteOffset * 60_000).toISOString();
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

  await page.route("**/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: viewer }),
    });
  });

  await page.route("**/chat/threads", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ thread: { id: 9999 } }),
      });
      return;
    }

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

test("conversation header and cards survive repeated high-speed upward flicks", async ({ page }) => {
  await page.goto("/conversations");

  const scrollShell = page.getByTestId("conversations-list-scroller");
  const header = page.locator(".conversations-stage-header");

  await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible();
  await expect.poll(async () => page.locator("[data-conversation-id]").count()).toBeGreaterThan(3);

  await scrollShell.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });

  await expect.poll(async () => {
    return page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-conversation-id]")).filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight && rect.height > 88;
      }).length
    );
  }).toBeGreaterThan(1);

  const initialHeaderTop = await header.evaluate((node) => Math.round(node.getBoundingClientRect().top));

  for (let swipeIndex = 0; swipeIndex < 5; swipeIndex += 1) {
    await scrollShell.evaluate(async (node, payload) => {
      const { distance, durationMs } = payload;
      const startTop = node.scrollTop;

      await new Promise<void>((resolve) => {
        const startedAt = performance.now();

        const step = (timestamp: number) => {
          const progress = Math.min(1, (timestamp - startedAt) / durationMs);
          node.scrollTop = Math.max(0, startTop - distance * progress);
          if (progress < 1) {
            window.requestAnimationFrame(step);
            return;
          }
          resolve();
        };

        window.requestAnimationFrame(step);
      });
    }, { distance: 900, durationMs: 180 });

    const frame = await page.evaluate(() => {
      const visibleCards = Array.from(document.querySelectorAll<HTMLElement>("[data-conversation-id]")).filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight && rect.height > 88;
      });

      const blankCards = visibleCards.filter((node) => {
        const title = node.querySelector("h3")?.textContent?.trim() ?? "";
        const preview = node.querySelector(".preview")?.textContent?.trim() ?? "";
        return !title || !preview;
      });

      const headerNode = document.querySelector<HTMLElement>(".conversations-stage-header");

      return {
        blankCards: blankCards.length,
        headerConnected: Boolean(headerNode?.isConnected),
        headerTop: headerNode ? Math.round(headerNode.getBoundingClientRect().top) : null,
        viewportScrollY: Math.round(window.scrollY),
        visibleCards: visibleCards.length,
      };
    });

    expect(frame.headerConnected).toBe(true);
    expect(frame.headerTop).toBe(initialHeaderTop);
    expect(frame.viewportScrollY).toBe(0);
    expect(frame.visibleCards).toBeGreaterThan(1);
    expect(frame.blankCards).toBe(0);
  }

  await page.screenshot({ path: "test-results/conversations-fast-flick-frame.png", fullPage: false });
});
