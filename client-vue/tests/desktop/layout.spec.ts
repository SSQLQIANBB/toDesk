import { test, expect } from '@playwright/test';

test('桌面聊天布局在不同窗口尺寸下铺满可用内容区', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('__STORAGE_PERSIST_AUTH_', JSON.stringify({ token: 'desktop-test', refreshToken: 'test' }));
  });
  await page.routeWebSocket(/\/meeting\//, socket => socket.close());
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: { user: { id: 1, username: 'desktop', nickname: '桌面测试用户' } } });
    if (url.pathname === '/api/auth/notification-settings') return route.fulfill({ json: { settings: {} } });
    return route.fulfill({ json: { users: [], messages: [], invitations: [], groups: [], count: 0, hasMore: false, cursors: {} } });
  });
  await page.goto('/#/remote');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 800, height: 600 }]) {
    await page.setViewportSize(viewport);
    const shell = page.locator('.remote-shell');
    await expect(shell).toBeVisible();
    const bounds = await shell.boundingBox();
    const titlebar = page.getByRole('banner', { name: '窗口标题栏' });
    if (await titlebar.count()) {
      const bar = await titlebar.boundingBox();
      expect(bar).toMatchObject({ x: 0, y: 0, width: viewport.width, height: 44 });
      expect(bounds!.y).toBe(bar!.height);
      await expect(titlebar).toHaveAttribute('data-tauri-drag-region', '');
    } else {
      expect(bounds!.y).toBe(0);
    }
    expect(bounds!.x).toBe(0);
    expect(bounds!.width).toBe(viewport.width);
    expect(bounds!.y + bounds!.height).toBe(viewport.height);
    await expect(shell).toHaveCSS('border-radius', '0px');
    await expect(shell).toHaveCSS('box-shadow', 'none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(viewport.height);
  }
  await page.screenshot({ path: testInfo.outputPath('desktop-full-window.png') });
});
