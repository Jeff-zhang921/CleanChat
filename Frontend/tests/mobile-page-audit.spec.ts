import { expect, test, devices, type Page, type Route } from "@playwright/test";

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

const HORIZONTAL_OVERFLOW_TOLERANCE_PX = 8;
const CHAT_REQUEST_ACCEPTED_MESSAGE_BODY =
  "__CLEANCHAT_CHAT_REQUEST_ACCEPTED__";
const viewer = {
  id: 1,
  name: "Jeff",
  email: "jeff@example.com",
  cleanId: "jeff_clean",
  avatar: "AVATAR_LEO",
  gender: "male",
  country: "United States",
  city: "San Francisco",
};

const partner = {
  id: 2,
  name: "Quiet Two",
  email: "quiet2@example.com",
  cleanId: "quiet_two",
  avatar: "AVATAR_SOPHIE",
  gender: "female",
  country: "Japan",
  city: "Tokyo",
};

const targetUser = {
  id: 7,
  name: "Quiet Seven",
  email: "seven@example.com",
  cleanId: "quiet_seven",
  avatar: "AVATAR_LEO",
  gender: "non_binary",
  country: "Canada",
  city: "Toronto",
};

const nowIso = () => new Date().toISOString();

const buildThreads = () => {
  const acceptedAt = nowIso();
  const acceptedThread = {
    id: 77,
    AID: viewer.id,
    BID: targetUser.id,
    lastMessageAt: acceptedAt,
    createdAt: acceptedAt,
    updatedAt: acceptedAt,
    UserA: viewer,
    UserB: targetUser,
    Messages: [
      {
        id: 770_001,
        body: CHAT_REQUEST_ACCEPTED_MESSAGE_BODY,
        createdAt: acceptedAt,
        senderId: targetUser.id,
      },
    ],
  };

  return [
    acceptedThread,
    ...Array.from({ length: 18 }, (_, index) => {
      const basePartnerId = index + 2;
      const partnerId =
        basePartnerId >= targetUser.id ? basePartnerId + 1 : basePartnerId;
      const createdAt = new Date(
        Date.now() - (index + 2) * 120_000,
      ).toISOString();
      const peer = {
        ...partner,
        id: partnerId,
        name: `Quiet ${partnerId}`,
        email: `quiet${partnerId}@example.com`,
        cleanId: `quiet_${partnerId}`,
      };

      return {
        id: partnerId,
        AID: viewer.id,
        BID: partnerId,
        lastMessageAt: createdAt,
        createdAt,
        updatedAt: createdAt,
        UserA: viewer,
        UserB: peer,
        Messages: [
          {
            id: 10_000 + partnerId,
            body: `Rendered message ${partnerId}`,
            createdAt,
            senderId: partnerId,
          },
        ],
      };
    }),
  ];
};

const buildThreadMessages = (threadId: number) => {
  if (threadId === 77) {
    return [
      {
        id: 770_001,
        threadId,
        senderId: targetUser.id,
        body: CHAT_REQUEST_ACCEPTED_MESSAGE_BODY,
        createdAt: nowIso(),
      },
    ];
  }

  return Array.from({ length: 64 }, (_, index) => ({
    id: threadId * 10_000 + index + 1,
    threadId,
    senderId: index % 2 === 0 ? viewer.id : partner.id,
    body: `History message ${index + 1}`,
    createdAt: new Date(Date.now() - (64 - index) * 35_000).toISOString(),
  }));
};

const groupAvatarUrl = "/icons/icon-192.png";

const groups = [
  {
    id: "alpha",
    name: "Alpha Room",
    description:
      "Long-running product discussion with enough content to scroll.",
    avatarKey: "orbit",
    avatarUrl: groupAvatarUrl,
    joined: true,
    isOwner: true,
    memberCount: 18,
    pendingRequestCount: 1,
    joinRequestStatus: "none",
    mutedByMe: false,
    lastMessagePreview: "Last group message",
    lastMessageAt: nowIso(),
  },
  {
    id: "beta",
    name: "Beta Lounge",
    description: "A discoverable room for smoke tests.",
    avatarKey: "pixel",
    avatarUrl: groupAvatarUrl,
    joined: false,
    isOwner: false,
    memberCount: 9,
    pendingRequestCount: 0,
    joinRequestStatus: "none",
    mutedByMe: false,
    lastMessagePreview: "",
    lastMessageAt: nowIso(),
  },
];

const buildGroupMessages = (groupId: string) =>
  Array.from({ length: 48 }, (_, index) => ({
    id: 80_000 + index,
    groupId,
    senderId: index % 2 === 0 ? viewer.id : partner.id,
    senderName: index % 2 === 0 ? viewer.name : partner.name,
    body: `Group history message ${index + 1}`,
    createdAt: new Date(Date.now() - (48 - index) * 42_000).toISOString(),
  }));

const directRequestEntry = {
  request: {
    id: 41,
    requesterId: targetUser.id,
    recipientId: viewer.id,
    note: "Can we connect?",
    status: "pending",
    acceptedThreadId: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    resolvedAt: null,
    direction: "incoming",
  },
  user: targetUser,
};

const groupInvitationEntry = {
  id: 71,
  groupId: "beta",
  createdAt: nowIso(),
  group: {
    ...groups[1],
    joined: false,
    joinRequestStatus: "none",
  },
  inviter: {
    id: partner.id,
    name: partner.name,
    email: partner.email,
    cleanId: partner.cleanId,
  },
};

const routeJson = async (route: Route, body: unknown, status = 200) => {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
};

const routeText = async (route: Route, body = "", status = 200) => {
  await route.fulfill({
    status,
    contentType: "text/plain",
    body,
  });
};

const handleBackendRoute = async (route: Route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  const method = request.method();

  if (path.startsWith("/socket.io")) {
    await route.abort("internetdisconnected");
    return;
  }

  if (path === "/auth/me") {
    await routeJson(route, { user: viewer });
    return;
  }

  if (path === "/auth/email/start" && method === "POST") {
    await routeJson(route, { message: "Code sent." });
    return;
  }

  if (path === "/auth/email/verify" && method === "POST") {
    await routeJson(route, { token: "playwright-token", isNewUser: false });
    return;
  }

  if (path === "/profile/me" && method === "GET") {
    await routeJson(route, { user: viewer });
    return;
  }

  if (path === "/profile/me" && method === "PATCH") {
    await routeJson(route, { user: viewer });
    return;
  }

  if (path === "/profile/clean-id" && method === "PATCH") {
    await routeJson(route, { ok: true });
    return;
  }

  if (path === "/profile/push/public-key") {
    await routeJson(
      route,
      {
        error: "Web push is not configured in mobile audit.",
        errorCode: "PUSH_NOT_CONFIGURED",
      },
      503,
    );
    return;
  }

  if (path === "/profile/feedback" && method === "POST") {
    await routeJson(
      route,
      {
        message: "Feedback sent.",
        recipient: "charlottkgonzal@gmail.com",
      },
      202,
    );
    return;
  }

  if (path === "/api/unread-count") {
    await routeJson(route, { counts: {} });
    return;
  }

  if (path === "/chat/mutes") {
    await routeJson(route, { keys: [] });
    return;
  }

  if (path === "/chat/unread/read" && method === "POST") {
    await routeJson(route, { ok: true });
    return;
  }

  if (path === "/chat/threads" && method === "GET") {
    await routeJson(route, buildThreads());
    return;
  }

  if (path === "/chat/threads" && method === "POST") {
    await routeJson(route, { thread: buildThreads()[0], threadId: 2 });
    return;
  }

  const threadMessagesMatch = path.match(/^\/chat\/threads\/(\d+)\/messages$/);
  if (threadMessagesMatch) {
    await routeJson(route, buildThreadMessages(Number(threadMessagesMatch[1])));
    return;
  }

  const threadSettingsMatch = path.match(/^\/chat\/threads\/(\d+)\/settings$/);
  if (threadSettingsMatch) {
    await routeJson(route, {
      threadId: Number(threadSettingsMatch[1]),
      otherUser: partner,
      blockedByMe: false,
      blockedMe: false,
      mutedByMe: false,
    });
    return;
  }

  if (
    /^\/chat\/threads\/\d+\/(?:block|mute)$/.test(path) &&
    method === "PATCH"
  ) {
    await routeJson(route, { ok: true, blockedByMe: false, mutedByMe: true });
    return;
  }

  if (
    (/^\/chat\/threads\/\d+$/.test(path) ||
      /^\/(?:api\/)?conversations\/\d+$/.test(path)) &&
    method === "DELETE"
  ) {
    const threadId = Number(path.match(/(\d+)$/)?.[1] ?? 0);
    await routeJson(route, {
      ok: true,
      conversationId: threadId,
      invalidatedRequests: 1,
    });
    return;
  }

  if (path === "/chat/groups" && method === "GET") {
    await routeJson(route, { groups });
    return;
  }

  if (path === "/chat/groups/invitations/received" && method === "GET") {
    await routeJson(route, { invitations: [groupInvitationEntry] });
    return;
  }

  if (path === "/chat/groups" && method === "POST") {
    await routeJson(route, {
      group: {
        ...groups[0],
        id: "created",
        name: "Created Group",
        joined: true,
        isOwner: true,
      },
    });
    return;
  }

  if (path === "/chat/users/search" && method === "GET") {
    await routeJson(route, {
      users: [
        {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          cleanId: targetUser.cleanId,
          avatar: targetUser.avatar,
          gender: targetUser.gender,
        },
      ],
    });
    return;
  }

  if (/^\/chat\/groups\/[^/]+\/invitations$/.test(path) && method === "POST") {
    await routeJson(
      route,
      {
        group: groups[0],
        invitation: {
          id: 72,
          groupId: "alpha",
          inviterUserId: viewer.id,
          targetUserId: targetUser.id,
          createdAt: nowIso(),
        },
        targetUser,
        alreadyInvited: false,
      },
      201,
    );
    return;
  }

  if (
    /^\/chat\/groups\/invitations\/\d+\/(?:accept|reject)$/.test(path) &&
    method === "POST"
  ) {
    await routeJson(route, {
      group: {
        ...groups[1],
        joined: true,
        joinRequestStatus: "none",
      },
    });
    return;
  }

  const groupMessagesMatch = path.match(/^\/chat\/groups\/([^/]+)\/messages$/);
  if (groupMessagesMatch) {
    await routeJson(route, {
      messages: buildGroupMessages(decodeURIComponent(groupMessagesMatch[1])),
    });
    return;
  }

  const groupSettingsMatch = path.match(/^\/chat\/groups\/([^/]+)\/settings$/);
  if (groupSettingsMatch) {
    const groupId = decodeURIComponent(groupSettingsMatch[1]);
    const group = groups.find((item) => item.id === groupId) ?? groups[0];
    await routeJson(route, {
      group,
      members: Array.from({ length: 16 }, (_, index) => ({
        ...partner,
        id: index + 2,
        name: `Member ${index + 2}`,
        cleanId: `member_${index + 2}`,
        email: `member${index + 2}@example.com`,
      })),
    });
    return;
  }

  const groupJoinRequestsMatch = path.match(
    /^\/chat\/groups\/([^/]+)\/join-requests$/,
  );
  if (groupJoinRequestsMatch) {
    await routeJson(route, {
      group: groups[0],
      requests: [
        {
          id: 51,
          groupId: decodeURIComponent(groupJoinRequestsMatch[1]),
          userId: targetUser.id,
          note: "Please let me in.",
          status: "pending",
          createdAt: nowIso(),
          updatedAt: nowIso(),
          user: targetUser,
        },
      ],
    });
    return;
  }

  if (
    /^\/chat\/groups\/[^/]+\/join-requests\/\d+\/(?:approve|reject)$/.test(
      path,
    ) &&
    method === "POST"
  ) {
    await routeJson(route, { ok: true });
    return;
  }

  if (/^\/chat\/groups\/[^/]+\/(?:join|leave|avatar|mute)$/.test(path)) {
    await routeJson(route, { ok: true, group: groups[0] });
    return;
  }

  const directTargetMatch = path.match(
    /^\/chat\/requests\/direct\/target\/(\d+)$/,
  );
  if (directTargetMatch) {
    const user =
      Number(directTargetMatch[1]) === partner.id ? partner : targetUser;
    await routeJson(route, {
      user,
      relationship: {
        existingThreadId: user.id === partner.id ? 2 : null,
        canDirectMessage: user.id === partner.id,
        accepted: user.id === partner.id,
        blockedByMe: false,
        blockedMe: false,
        latestRequest: null,
      },
    });
    return;
  }

  if (path === "/chat/requests/direct/received" && method === "GET") {
    await routeJson(route, {
      pending: [directRequestEntry],
      recent: [
        {
          ...directRequestEntry,
          request: {
            ...directRequestEntry.request,
            id: 42,
            status: "accepted",
            acceptedThreadId: 2,
            resolvedAt: nowIso(),
          },
        },
      ],
    });
    return;
  }

  if (path === "/chat/requests/direct" && method === "POST") {
    await routeJson(
      route,
      {
        request: {
          ...directRequestEntry.request,
          requesterId: viewer.id,
          recipientId: targetUser.id,
          direction: "outgoing",
        },
      },
      201,
    );
    return;
  }

  if (
    /^\/chat\/requests\/direct\/\d+\/(?:accept|reject)$/.test(path) &&
    method === "POST"
  ) {
    const accepted = path.endsWith("/accept");
    await routeJson(route, {
      request: {
        ...directRequestEntry.request,
        status: accepted ? "accepted" : "rejected",
        acceptedThreadId: accepted ? 77 : null,
        resolvedAt: nowIso(),
      },
      ...(accepted
        ? {
            thread: { id: 77 },
            user: targetUser,
          }
        : {}),
    });
    return;
  }

  if (path === "/chat/upload-image" && method === "POST") {
    await routeJson(route, { url: "https://utfs.io/f/smoke-image.png" });
    return;
  }

  await routeText(route, `Unhandled mocked route: ${method} ${path}`, 404);
};

const installSession = async (page: Page, authenticated: boolean) => {
  await page.addInitScript(
    ({ authenticated }) => {
      if (authenticated) {
        window.localStorage.setItem("cleanchat:auth-token", "playwright-token");
        return;
      }

      window.localStorage.removeItem("cleanchat:auth-token");
    },
    { authenticated },
  );
};

const installApiMocks = async (page: Page) => {
  await page.route("http://127.0.0.1:4000/**", handleBackendRoute);
  await page.route("http://localhost:4000/**", handleBackendRoute);
};

const waitForLayoutSettled = async (page: Page) => {
  await page.evaluate(async () => {
    await Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise((resolve) => window.setTimeout(resolve, 250)),
    ]);

    const finiteAnimations = document
      .getAnimations({ subtree: true })
      .filter((animation) => {
        const timing = animation.effect?.getTiming();
        return Boolean(
          timing &&
          timing.iterations !== Infinity &&
          timing.duration !== Infinity &&
          Number(timing.duration) <= 1200,
        );
      });

    await Promise.race([
      Promise.all(
        finiteAnimations.map((animation) =>
          animation.finished.catch(() => undefined),
        ),
      ),
      new Promise((resolve) => window.setTimeout(resolve, 450)),
    ]);
  });
};

const getVisibleChatBubbleTexts = async (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".chat-bubble"))
      .filter((bubble) => {
        const rect = bubble.getBoundingClientRect();
        return rect.bottom > 96 && rect.top < window.innerHeight - 96;
      })
      .map((bubble) => bubble.innerText.trim())
      .filter(Boolean),
  );

const expectChatHistoryScrollable = async (page: Page, label: string) => {
  const scroller = page.locator(".chat-virtuoso-scroller").first();
  await expect(scroller, `${label}: history scroller`).toBeVisible();

  await expect
    .poll(async () => (await getVisibleChatBubbleTexts(page)).length, {
      message: `${label}: visible chat messages before scroll`,
    })
    .toBeGreaterThan(0);
  const beforeTexts = await getVisibleChatBubbleTexts(page);

  let didMoveScrollPosition = false;
  const scrollBy = async (delta: number) => {
    const moved = await scroller.evaluate((element, delta) => {
      const before = element.scrollTop;
      element.scrollTop = Math.max(0, element.scrollTop + delta);
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
      return Math.abs(element.scrollTop - before) > 4;
    }, delta);
    didMoveScrollPosition = didMoveScrollPosition || moved;
    await page.waitForTimeout(260);
    return getVisibleChatBubbleTexts(page);
  };

  let afterTexts = await scrollBy(-1200);
  if (afterTexts.join("\n") === beforeTexts.join("\n")) {
    afterTexts = await scrollBy(1200);
  }
  if (afterTexts.join("\n") === beforeTexts.join("\n")) {
    const box = await scroller.boundingBox();
    if (box) {
      const x = box.x + box.width / 2;
      const startY = box.y + box.height * 0.72;
      const endY = box.y + box.height * 0.28;
      await page.mouse.move(x, startY);
      await page.mouse.down();
      await page.mouse.move(x, endY, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(260);
      didMoveScrollPosition =
        didMoveScrollPosition ||
        (await scroller.evaluate((element) => element.scrollTop > 4));
      afterTexts = await getVisibleChatBubbleTexts(page);
    }
  }

  await scroller.evaluate((element) => {
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  expect(
    didMoveScrollPosition || afterTexts.join("\n") !== beforeTexts.join("\n"),
    `${label}: history scroller moves or visible chat messages change`,
  ).toBe(true);
};

type PageTarget = {
  name: string;
  path: string;
  authenticated: boolean;
  readySelector: string;
  beforeGoto?: (page: Page) => Promise<void>;
  smoke?: (page: Page) => Promise<void>;
};

const pageTargets: PageTarget[] = [
  {
    name: "login",
    path: "/login",
    authenticated: false,
    readySelector: "#email",
    smoke: async (page) => {
      await page.locator("#email").fill("jeff@example.com");
      await page.locator("form").locator("button[type='submit']").click();
      await expect(page).toHaveURL(/\/verify/);
    },
  },
  {
    name: "verify",
    path: "/verify",
    authenticated: false,
    readySelector: "#code",
    beforeGoto: async (page) => {
      await page.addInitScript(() => {
        window.sessionStorage.setItem(
          "cleanchat:pending-email",
          "jeff@example.com",
        );
      });
    },
    smoke: async (page) => {
      await page.locator("#code").fill("123456");
      await page.locator("form").locator("button[type='submit']").click();
      await expect(page).toHaveURL(/\/conversations/);
      await expect(
        page.locator("[data-conversation-id]").first(),
      ).toBeVisible();
    },
  },
  {
    name: "basic-info",
    path: "/basic-info",
    authenticated: true,
    readySelector: "#nickname",
    smoke: async (page) => {
      await page.locator("#nickname").fill("Jeff Mobile");
      await page.locator("#cleanId").fill("jeff_mobile");
      await page.locator("form").locator("button[type='submit']").click();
      await expect(page).toHaveURL(/\/conversations/);
      await expect(
        page.locator("[data-conversation-id]").first(),
      ).toBeVisible();
    },
  },
  {
    name: "conversations",
    path: "/conversations",
    authenticated: true,
    readySelector: "[data-conversation-id]",
    smoke: async (page) => {
      const activeRoot = page.locator(".hybrid-root-view.is-active");
      await expect(activeRoot.locator('[data-conversation-id="direct-77"]')).toContainText(
        /聊天请求已通过|Chat request accepted/i,
      );
      await page.evaluate(() => {
        window.dispatchEvent(
          new CustomEvent("cleanchat:conversation-deleted", {
            detail: { threadId: 77 },
          }),
        );
      });
      await expect(activeRoot.locator('[data-conversation-id="direct-77"]')).toHaveCount(0);
      await activeRoot.locator(".search-launcher").click();
      await expect(
        activeRoot.locator(".search-input-wrap input"),
      ).toBeVisible();
      await activeRoot.locator(".search-input-wrap input").fill("quiet");
      await expect(activeRoot.locator('[data-conversation-user-id="7"]')).toContainText(
        /请求聊天|Request to Chat/i,
      );
      await activeRoot.locator(".search-dismiss").click();
    },
  },
  {
    name: "groups",
    path: "/groups",
    authenticated: true,
    readySelector: ".group-card",
    smoke: async (page) => {
      const activeRoot = page.locator(".hybrid-root-view.is-active");
      await expect(
        activeRoot.locator('.bottom-nav-link[href="/groups"] .bottom-nav-badge'),
      ).toHaveText("1");
      await activeRoot.locator(".search-launcher").click();
      await expect(
        activeRoot.locator(".search-input-wrap input"),
      ).toBeVisible();
      await activeRoot.locator(".search-input-wrap input").fill("alpha");
      await activeRoot.locator(".search-dismiss").click();

      await activeRoot.locator(".groups-invitations-trigger").click();
      await expect(page.locator(".groups-invitations-modal")).toBeVisible();
      await expect(page.locator(".groups-invitations-list li")).toHaveCount(1);
      await page.locator(".groups-invitations-actions .group-action.invite").click();
      await expect(page.locator(".groups-invitations-list li")).toHaveCount(0);
      await page.locator(".groups-invitations-modal .group-action.cancel").click();
      await expect(page.locator(".groups-invitations-modal")).toBeHidden();

      await activeRoot.locator(".group-action.invite:visible").first().click();
      await expect(page.locator(".groups-invite-modal")).toBeVisible();
      await page.locator(".groups-invite-field input[type='search']").fill("quiet");
      await expect(page.locator(".groups-invite-results li")).toHaveCount(1);
      await page.locator(".groups-invite-results .group-action.invite").click();
      await expect(page.locator(".groups-invite-status")).toBeVisible();
      await page.locator(".groups-invite-modal .group-action.cancel").click();
      await expect(page.locator(".groups-invite-modal")).toBeHidden();

      await activeRoot.locator(".group-action.create:visible").first().click();
      await expect(
        page.locator(".groups-create-modal .group-create-panel"),
      ).toBeVisible();
      await page
        .locator(".groups-create-modal .group-action.cancel")
        .click({ force: true });
      await expect(page.locator(".groups-create-modal")).toBeHidden();
    },
  },
  {
    name: "discover",
    path: "/discover",
    authenticated: true,
    readySelector: ".discover-page",
    smoke: async (page) => {
      await expect(page.locator(".discover-card")).toBeVisible();
      await expect(page.locator(".discover-card")).toContainText(
        /开发|development/i,
      );
    },
  },
  {
    name: "chat-direct",
    path: "/chat/2",
    authenticated: true,
    readySelector: ".chat-bubble",
    smoke: async (page) => {
      await expectChatHistoryScrollable(page, "direct chat");
      await page.locator(".chat-input input[type='text']").fill("mobile smoke");
      await page.locator(".send-button").click();
      await expect(
        page.locator(".chat-bubble").filter({ hasText: "mobile smoke" }),
      ).toBeVisible();
    },
  },
  {
    name: "chat-group",
    path: "/chat/group/alpha",
    authenticated: true,
    readySelector: ".chat-bubble",
    smoke: async (page) => {
      await expectChatHistoryScrollable(page, "group chat");
      await page.locator(".chat-input input[type='text']").fill("group smoke");
      await page.locator(".send-button").click();
      await expect(
        page.locator(".chat-bubble").filter({ hasText: "group smoke" }),
      ).toBeVisible();
    },
  },
  {
    name: "chat-settings",
    path: "/chat/settings?threadId=2",
    authenticated: true,
    readySelector: ".chat-settings-page",
    smoke: async (page) => {
      await expect(page.locator(".chat-settings-peer-region")).toContainText(
        "Japan",
      );
      await expect(page.locator(".chat-settings-peer-region")).toContainText(
        "Tokyo",
      );
      const muteSwitch = page.locator("[role='switch']").first();
      await expect(muteSwitch).toBeVisible();
      await muteSwitch.click();
      await page.locator(".chat-settings-danger-action").click();
      const deleteDialog = page.locator(".chat-settings-confirm-dialog");
      await expect(deleteDialog).toBeVisible();
      await expect(deleteDialog).toContainText(
        /重新请求验证|new request|新しいリクエスト|새 요청/i,
      );
      await page.locator(".chat-settings-confirm-delete").click();
      await expect(page).toHaveURL(/\/conversations/);
    },
  },
  {
    name: "group-settings",
    path: "/chat/group/settings?groupId=alpha",
    authenticated: true,
    readySelector: ".group-settings-page",
    smoke: async (page) => {
      const muteSwitch = page.locator("[role='switch']").first();
      await expect(muteSwitch).toBeVisible();
      await muteSwitch.click();
    },
  },
  {
    name: "profile",
    path: "/profile",
    authenticated: true,
    readySelector: ".profile-shell",
    smoke: async (page) => {
      await expect(page.locator(".profile-avatar-main")).toBeVisible();
      await expect(page.locator(".profile-region")).toContainText(
        "United States",
      );
      await expect(page.locator(".profile-region")).toContainText(
        "San Francisco",
      );
    },
  },
  {
    name: "profile-settings",
    path: "/profile/settings",
    authenticated: true,
    readySelector: ".profile-settings-page",
    smoke: async (page) => {
      await page.locator(".profile-settings-action").first().click();
      await expect(page.locator(".profile-settings-language-dialog")).toBeVisible();
      await expect(page.locator(".profile-settings-language-option")).toHaveCount(5);
      await page.locator(".profile-settings-language-close").click();
      await expect(page.locator(".profile-settings-language-dialog")).toBeHidden();
    },
  },
  {
    name: "feedback",
    path: "/profile/feedback",
    authenticated: true,
    readySelector: ".feedback-page",
    smoke: async (page) => {
      await page.locator(".feedback-type-toggle").click();
      await expect(page.locator(".feedback-type-options")).toBeVisible();
      await page.locator(".feedback-type-option").nth(1).click();
      await expect(page.locator(".feedback-type-options")).toBeHidden();
      await page.locator("#feedback-message").fill("Mobile feedback smoke.");
      await page.locator(".feedback-composer button[type='submit']").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog")).toContainText(
        /\u611f\u8c22\u4f60\u53d1\u9001\u53cd\u9988|Thank you for sending this/i,
      );
      await expect(page.getByRole("dialog")).toContainText(
        /\u5c3d\u5feb\u4e0e\u4f60\u4fdd\u6301\u8054\u7cfb|keep in touch/i,
      );
      await page.getByRole("dialog").getByRole("button").click();
      await expect(page.getByRole("dialog")).toBeHidden();
    },
  },
  {
    name: "profile-edit",
    path: "/profile/edit",
    authenticated: true,
    readySelector: ".profile-edit-page",
    smoke: async (page) => {
      await page.locator(".profile-edit-gender-trigger").click();
      await expect(page.locator(".profile-edit-gender-drawer")).toBeVisible();
      await page.locator(".profile-edit-gender-picker .gender-picker-option").nth(1).click();
      await page.locator(".profile-edit-gender-drawer-close").click();
      await expect(page.locator(".profile-edit-gender-drawer")).toBeHidden();
      await page.locator(".profile-edit-region-trigger").click();
      await expect(page.locator(".profile-edit-region-drawer")).toBeVisible();
      await page.locator(".profile-edit-region-tab").first().click();
      await page.locator(".profile-edit-region-option", { hasText: "United Kingdom" }).click();
      await expect(page.locator(".profile-edit-region-tab").nth(1)).toHaveClass(/is-active/);
      await page.locator(".profile-edit-region-option", { hasText: "London" }).click();
      await expect(page.locator(".profile-edit-region-drawer")).toBeHidden();
      await expect(page.locator(".profile-edit-region-trigger")).toContainText("United Kingdom");
      await expect(page.locator(".profile-edit-region-trigger")).toContainText("London");
      await expect(page.locator(".profile-edit-page .profile-avatar-grid")).toHaveCount(0);
      await page.locator(".profile-avatar-picker-trigger").click();
      await expect(page).toHaveURL(/\/profile\/avatar/);
      await expect(page.locator(".profile-avatar-style-card")).toHaveCount(3);
      await expect(page.locator(".profile-avatar-choice-grid")).toHaveCount(0);
      await page.locator(".profile-avatar-style-card").first().click();
      await expect(page.locator(".profile-avatar-choice-grid")).toBeVisible();
      await page.locator(".profile-avatar-choice").nth(1).click();
      await expect(page).toHaveURL(/\/profile\/edit/);
      await page.locator("#nickname").fill("Jeff Edited");
      const saveButton = page.locator(".profile-edit-action-primary").last();
      await saveButton.scrollIntoViewIfNeeded();
      await saveButton.click();
      await expect(page).toHaveURL(/\/profile/);
    },
  },
  {
    name: "profile-vault-redirect",
    path: "/profile/vault",
    authenticated: true,
    readySelector: ".profile-edit-page",
    smoke: async (page) => {
      await expect(page).toHaveURL(/\/profile\/edit/);
      await expect(page.locator(".profile-claim-editor")).toBeVisible();
      await expect(page.locator(".profile-edit-page .profile-avatar-grid")).toHaveCount(0);
      await expect(page.locator(".profile-avatar-picker-trigger")).toBeVisible();
    },
  },
  {
    name: "profile-avatar",
    path: "/profile/avatar",
    authenticated: true,
    readySelector: ".profile-avatar-page",
    smoke: async (page) => {
      await expect(page.locator(".profile-avatar-style-card")).toHaveCount(3);
      await expect(page.locator(".profile-avatar-choice-grid")).toHaveCount(0);
      await page.locator(".profile-avatar-style-card").nth(1).click();
      await expect(page.locator(".profile-avatar-choice-grid")).toBeVisible();
      await page.locator(".profile-avatar-style-return").click();
      await expect(page.locator(".profile-avatar-choice-grid")).toHaveCount(0);
    },
  },
  {
    name: "user-profile",
    path: "/profile/user/7",
    authenticated: true,
    readySelector: ".user-profile-page",
    smoke: async (page) => {
      await expect(page.locator(".user-profile-page")).toContainText(
        "Quiet Seven",
      );
    },
  },
  {
    name: "send-chat-request",
    path: "/profile/request-chat?targetUserId=7",
    authenticated: true,
    readySelector: ".send-request-page",
    smoke: async (page) => {
      await page.locator("textarea").fill("Hello from mobile audit.");
      const sendButton = page.locator(".send-request-action-primary");
      await sendButton.scrollIntoViewIfNeeded();
      await sendButton.tap();
      await expect(page.locator(".send-request-status")).toBeVisible();
    },
  },
  {
    name: "direct-requests",
    path: "/profile/requests/users",
    authenticated: true,
    readySelector: ".user-requests-page",
    smoke: async (page) => {
      await expect(page.locator(".user-requests-item").first()).toBeVisible();
      await page.locator(".user-requests-action-approve").first().click();
      await expect(page).toHaveURL(/\/chat/);
      await expect(
        page
          .locator(".chat-message-content")
          .filter({ hasText: /聊天请求已通过|Chat request accepted/i })
          .first(),
      ).toBeVisible();
    },
  },
  {
    name: "group-requests",
    path: "/profile/requests/groups",
    authenticated: true,
    readySelector: ".group-requests-page",
    smoke: async (page) => {
      await expect(page.locator(".group-requests-page")).toContainText("Alpha");
    },
  },
];

const assertPageUsable = async (page: Page, pageName: string) => {
  const audit = await page.evaluate(async (pageName) => {
    const root = document.documentElement;
    const body = document.body;
    const rootRect = root.getBoundingClientRect();
    const bodyTextLength = body.innerText.trim().length;
    const visibleElements = Array.from(
      document.querySelectorAll<HTMLElement>("body *"),
    ).filter((element) => {
      if (element.closest('[aria-hidden="true"]')) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) {
        return false;
      }

      const style = getComputedStyle(element);
      return style.visibility !== "hidden" && style.display !== "none";
    });
    const horizontalOffenders = visibleElements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className:
            typeof element.className === "string" ? element.className : "",
          leftOverflow: Math.max(0, -rect.left),
          rightOverflow: Math.max(0, rect.right - window.innerWidth),
          width: rect.width,
        };
      })
      .filter((item) => item.leftOverflow > 3 || item.rightOverflow > 3)
      .sort(
        (a, b) =>
          Math.max(b.leftOverflow, b.rightOverflow) -
          Math.max(a.leftOverflow, a.rightOverflow),
      )
      .slice(0, 6);
    const elementCandidates = Array.from(
      document.querySelectorAll<HTMLElement>("main, section, div"),
    ).filter((candidate) => {
      if (candidate.closest('[aria-hidden="true"]')) {
        return false;
      }

      const rect = candidate.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) {
        return false;
      }

      const style = getComputedStyle(candidate);
      return /auto|scroll|overlay/i.test(style.overflowY);
    });
    const candidates = [document.scrollingElement, ...elementCandidates].filter(
      (item): item is Element => Boolean(item),
    );

    let maxOverflow = 0;
    let scrollableCandidateCount = 0;
    let scrollWorkedCount = 0;
    const scrollCandidates: Array<{
      tag: string;
      className: string;
      overflow: number;
      worked: boolean;
      ignored: boolean;
    }> = [];

    for (const candidate of candidates) {
      const overflow = candidate.scrollHeight - candidate.clientHeight;
      maxOverflow = Math.max(maxOverflow, overflow);
      if (overflow <= 8) {
        continue;
      }

      let candidateWorked = false;

      if (candidate === document.scrollingElement) {
        window.scrollTo(0, 0);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const top = window.scrollY;
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const bottom = window.scrollY;
        candidateWorked = Math.abs(bottom - top) > 4;
      } else {
        const element = candidate as HTMLElement;
        element.scrollTop = 0;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const top = element.scrollTop;
        element.scrollTop = element.scrollHeight;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const bottom = element.scrollTop;
        candidateWorked = Math.abs(bottom - top) > 4;
      }

      if (candidate === document.scrollingElement && !candidateWorked) {
        scrollCandidates.push({
          tag: candidate.tagName.toLowerCase(),
          className: "",
          overflow,
          worked: candidateWorked,
          ignored: true,
        });
        continue;
      }

      const className =
        candidate instanceof HTMLElement ? candidate.className : "";
      if (
        typeof className === "string" &&
        className.includes("chat-virtuoso-scroller") &&
        !candidateWorked
      ) {
        scrollCandidates.push({
          tag: candidate.tagName.toLowerCase(),
          className,
          overflow,
          worked: candidateWorked,
          ignored: true,
        });
        continue;
      }

      scrollableCandidateCount += 1;
      scrollCandidates.push({
        tag: candidate.tagName.toLowerCase(),
        className,
        overflow,
        worked: candidateWorked,
        ignored: false,
      });
      if (candidateWorked) {
        scrollWorkedCount += 1;
      }
    }

    return {
      pageName,
      bodyTextLength,
      rootWidth: rootRect.width,
      viewportWidth: window.innerWidth,
      documentScrollWidth: root.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      horizontalOverflow:
        Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth,
      horizontalOffenders,
      primaryOverflow: maxOverflow,
      scrollableCandidateCount,
      scrollWorked: scrollableCandidateCount === 0 || scrollWorkedCount > 0,
      scrollCandidates,
      activeElementTag: document.activeElement?.tagName ?? "",
    };
  }, pageName);

  expect(audit.bodyTextLength, `${pageName}: rendered text`).toBeGreaterThan(
    20,
  );
  expect(
    audit.horizontalOverflow,
    `${pageName}: horizontal overflow ${JSON.stringify(audit.horizontalOffenders)}`,
  ).toBeLessThanOrEqual(HORIZONTAL_OVERFLOW_TOLERANCE_PX);
  expect(
    audit.scrollWorked,
    `${pageName}: scrollable container can scroll ${JSON.stringify(audit.scrollCandidates)}`,
  ).toBe(true);
};

const runPageAudit = (deviceName: string, device: typeof pixel7Device) => {
  test.describe(`${deviceName} mobile page audit`, () => {
    test.use({
      ...device,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });

    for (const target of pageTargets) {
      test(`${target.name} renders, scrolls, and basic controls work`, async ({
        page,
      }) => {
        test.setTimeout(60_000);
        await installApiMocks(page);
        await installSession(page, target.authenticated);
        await target.beforeGoto?.(page);

        await page.goto(target.path, { waitUntil: "domcontentloaded" });
        await expect(page.locator(target.readySelector).first()).toBeVisible({
          timeout: 10_000,
        });
        await waitForLayoutSettled(page);
        await assertPageUsable(page, `${deviceName}:${target.name}`);

        await target.smoke?.(page);
        await waitForLayoutSettled(page);
        await assertPageUsable(
          page,
          `${deviceName}:${target.name}:after-smoke`,
        );
      });
    }
  });
};

runPageAudit("pixel7", pixel7Device);
runPageAudit("ipad-pro-11", ipadPro11Device);
