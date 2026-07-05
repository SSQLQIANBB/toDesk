import { expect, test, type Page } from '@playwright/test';

async function prepareRemote(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'remote-state-token');
    localStorage.setItem('refreshToken', 'remote-state-refresh-token');
    localStorage.setItem('user', JSON.stringify({
      id: 1,
      username: 'owner',
      nickname: '测试用户',
      status: 'online',
    }));
  });

  await page.route(/\/api\/(auth|groups|messages|invitations)(?:\/|\?|$)/, async route => {
    const url = route.request().url();
    let body: Record<string, unknown> = {};

    if (url.includes('/api/groups/my')) {
      body = {
        groups: [{
          id: 7,
          name: 'Remote Tab 测试群组',
          ownerId: 1,
          role: 'owner',
          memberCount: 2,
        }],
      };
    } else if (url.includes('/api/groups/7')) {
      body = {
        group: { id: 7, name: 'Remote Tab 测试群组', ownerId: 1 },
        members: [{ id: 1, username: 'owner', role: 'owner', canSpeak: true }],
        myRole: 'owner',
        myCanSpeak: true,
      };
    } else if (url.includes('/api/invitations')) {
      body = { invitations: [] };
    } else if (url.includes('/api/messages')) {
      body = { messages: [], count: 0, hasMore: false };
    } else {
      body = { users: [] };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test.describe('Remote Tab 路由状态', () => {
  test.beforeEach(async ({ page }) => {
    await prepareRemote(page);
  });

  test('从我的群组进入群聊，返回后仍停留在我的群组', async ({ page }) => {
    await page.goto('/remote?tab=groups');
    await expect(page.getByText('+ 创建/管理群组')).toBeVisible();

    await page.getByText('Remote Tab 测试群组').click();
    await expect(page).toHaveURL(/\/group-chat\/7$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/remote\?tab=groups$/);
    await expect(page.getByText('+ 创建/管理群组')).toBeVisible();
  });

  test('从在线用户进入个人中心，返回后仍停留在线用户', async ({ page }) => {
    await page.goto('/remote?tab=users');
    await expect(page.getByText(/在线用户 \(/)).toBeVisible();

    await page.getByRole('button', { name: '个人中心' }).click();
    await expect(page).toHaveURL(/\/profile$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/remote\?tab=users$/);
    await expect(page.getByText(/在线用户 \(/)).toBeVisible();
  });

  test('直接访问使用默认 Tab，非法 Tab 也回退在线用户', async ({ page }) => {
    await page.goto('/remote');
    await expect(page.getByText(/在线用户 \(/)).toBeVisible();

    await page.goto('/remote?tab=invalid');
    await expect(page.getByText(/在线用户 \(/)).toBeVisible();
  });

  test('连续多次进入群组和返回时保持我的群组', async ({ page }) => {
    await page.goto('/remote?tab=groups');

    for (let index = 0; index < 2; index += 1) {
      await page.getByText('Remote Tab 测试群组').click();
      await expect(page).toHaveURL(/\/group-chat\/7$/);
      await page.goBack();
      await expect(page.getByText('+ 创建/管理群组')).toBeVisible();
    }
  });
});
