import { expect, test, type Page } from '@playwright/test';

const authenticatedRoutes = [
  '/remote',
  '/profile',
  '/groups',
  '/group-chat/7',
  '/group-video/7',
  '/group-screen/7',
];

const publicRoutes = ['/login', '/chat', '/socket', '/share'];

async function preparePage(page: Page, userId = 1) {
  await page.addInitScript(({ authenticatedUserId }) => {
    localStorage.setItem('token', 'layout-test-token');
    localStorage.setItem('user', JSON.stringify({
      id: authenticatedUserId,
      username: authenticatedUserId === 1 ? 'owner' : 'member',
      nickname: authenticatedUserId === 1 ? '测试用户' : '成员二',
      status: 'online',
    }));

    const stream = new MediaStream();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => stream,
        getDisplayMedia: async () => stream,
      },
    });

    class PeerConnectionStub {
      addTrack() {}
      close() {}
      setLocalDescription() { return Promise.resolve(); }
      setRemoteDescription() { return Promise.resolve(); }
      addIceCandidate() { return Promise.resolve(); }
      createOffer() { return Promise.resolve({ type: 'offer', sdp: '' }); }
      createAnswer() { return Promise.resolve({ type: 'answer', sdp: '' }); }
    }
    Object.defineProperty(window, 'RTCPeerConnection', {
      configurable: true,
      value: PeerConnectionStub,
    });
  }, { authenticatedUserId: userId });

  await page.route(/\/api\/(auth|groups|messages|invitations)(?:\/|\?|$)/, async (route) => {
    const url = route.request().url();
    let body: Record<string, unknown> = {};

    if (url.includes('/api/groups/my')) {
      body = {
        groups: [{
          id: 7,
          name: '响应式测试群组',
          description: '用于移动端布局检查',
          ownerId: 1,
          role: 'owner',
          memberCount: 2,
        }],
      };
    } else if (url.includes('/api/groups/7')) {
      body = {
        group: { id: 7, name: '响应式测试群组', ownerId: 1 },
        members: [
          { id: 1, username: 'owner', nickname: '测试用户', role: 'owner', canSpeak: true },
          { id: 2, username: 'member', nickname: '成员二', role: 'member', canSpeak: true },
        ],
        myRole: 'owner',
        myCanSpeak: true,
      };
    } else if (url.includes('/api/messages/group/7')) {
      body = { messages: [], hasMore: false };
    } else if (url.includes('/api/auth/users')) {
      body = { users: [] };
    } else if (url.includes('/api/messages')) {
      body = { messages: [], count: 0, hasMore: false };
    } else {
      body = { users: [], messages: [] };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(async () => page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const roots = [document.documentElement, document.body, document.querySelector('#app')]
      .filter((element): element is Element => Boolean(element));
    return roots.every((element) => element.scrollWidth <= viewportWidth + 1);
  })).toBe(true);
}

test.describe('响应式布局', () => {
  test('普通成员在手机端也能查看视频和共享的完整人员列表', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await preparePage(page, 2);

    for (const route of ['/group-video/7', '/group-screen/7']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: '群成员' }).click();
      await expect(page.getByText('群成员', { exact: true })).toBeVisible();
      await expect(page.locator('.n-drawer:visible').getByText('未参与').first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press('Escape');
    }
  });

  test('手机宽度下主要页面、弹窗和视频区域不会横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await preparePage(page);

    for (const route of [...publicRoutes, ...authenticatedRoutes]) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalOverflow(page);
      if (route === '/groups') {
        await page.getByRole('button', { name: '创建群组' }).first().click();
        await expectNoHorizontalOverflow(page);
        await page.keyboard.press('Escape');
      }
    }
  });

  test('桌面端原有页面仍保持可见且不会横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparePage(page);

    for (const route of authenticatedRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#app')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }

    await page.goto('/groups');
    await page.getByRole('button', { name: '创建群组' }).first().click();
    const createDialog = page.getByRole('dialog');
    await expect(createDialog).toBeVisible();
    await expect.poll(async () => (await createDialog.boundingBox())?.width).toBe(500);
    await page.keyboard.press('Escape');

    await page.getByText('响应式测试群组').first().click();
    const detailDialog = page.getByRole('dialog');
    await expect(detailDialog).toBeVisible();
    await expect.poll(async () => (await detailDialog.boundingBox())?.width).toBe(600);
  });
});
