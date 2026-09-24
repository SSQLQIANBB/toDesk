import { expect, test, type Page } from '@playwright/test';

const defaults = {
  desktopEnabled: true, messagePreview: true, notifyPrivateMessage: true, notifyGroupMessage: true,
  notifyCall: true, notifyInvitation: true, messageEnabled: true, callEnabled: true,
  messageTone: 'default', callTone: 'default',
};

async function prepare(page: Page, server: { settings: typeof defaults }) {
  await page.addInitScript(() => localStorage.setItem('__STORAGE_PERSIST_AUTH_', JSON.stringify({ token: 'test', refreshToken: 'test' })));
  await page.route('**/meeting/**', route => route.abort());
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/auth/notification-settings') {
      if (route.request().method() === 'PUT') Object.assign(server.settings, route.request().postDataJSON());
      return route.fulfill({ json: { settings: server.settings } });
    }
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: { user: { id: 1, username: 'tester', nickname: '测试用户', ...route.request().postDataJSON() } } });
    if (url.pathname === '/api/auth/email') return route.fulfill({ json: { email: null } });
    if (url.pathname === '/api/auth/users') return route.fulfill({ json: { users: [{ id: 2, username: '测试联系人' }] } });
    if (url.pathname === '/api/groups/7') return route.fulfill({ json: { group: { id: 7, name: '测试群', ownerId: 1 }, members: [{ id: 1, canSpeak: true }], myRole: 'owner', myCanSpeak: true } });
    return route.fulfill({ json: { messages: [], invitations: [], groups: [], count: 0, hasMore: false, cursors: {} } });
  });
}

test('账号通知设置在新浏览器会话恢复，保存失败保持原值', async ({ page, browser }, testInfo) => {
  const server = { settings: { ...defaults } };
  await prepare(page, server);
  await page.goto('/profile');
  await page.getByText('通知设置', { exact: true }).click();
  await page.getByRole('switch', { name: '私聊消息', exact: true }).click();
  await expect(page.getByRole('switch', { name: '私聊消息', exact: true })).toHaveAttribute('aria-checked', 'false');
  const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const other = await second.newPage();
    await prepare(other, server);
    await other.goto('/profile');
    await other.getByText('通知设置', { exact: true }).click();
    await expect(other.getByRole('switch', { name: '私聊消息', exact: true })).toHaveAttribute('aria-checked', 'false');
    await other.route('**/api/auth/notification-settings', route => route.fulfill({ status: 500, json: { error: '测试保存失败' } }));
    await other.getByRole('switch', { name: '群组消息', exact: true }).click();
    await expect(other.getByRole('alert')).toContainText('保存失败');
    await expect(other.getByRole('switch', { name: '群组消息', exact: true })).toHaveAttribute('aria-checked', 'true');
    expect(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await other.screenshot({ path: testInfo.outputPath('mobile-notifications.png') });
  } finally { await second.close(); }
});

for (const width of [1440, 390]) {
  test(`头像裁剪、取消及上传 ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await prepare(page, { settings: { ...defaults } });
    await page.goto('/profile');
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 400;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#2563eb'; context.fillRect(0, 0, 400, 400);
      context.fillStyle = '#f97316'; context.fillRect(400, 0, 400, 400);
      return canvas.toDataURL('image/png').split(',')[1]!;
    });
    const file = { name: 'crop.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') };
    let uploaded = false;
    await page.route('**/api/files/upload', route => {
      uploaded = true;
      const body = route.request().postDataBuffer()!.toString('latin1');
      expect(body).toContain('filename="avatar.jpg"');
      expect(body).toContain('image/jpeg');
      expect(body).toContain('avatar');
      return route.fulfill({ json: { file: { fileUrl: '/cropped-avatar.jpg' } } });
    });
    await page.locator('input[type="file"]').setInputFiles(file);
    const crop = page.locator('.avatar-crop-modal');
    await expect(crop.getByRole('button', { name: '确认裁剪并上传' })).toBeEnabled();
    await crop.getByRole('button', { name: '取消', exact: true }).click();
    await expect(crop).toHaveCount(0);
    expect(uploaded).toBe(false);
    await page.locator('input[type="file"]').setInputFiles(file);
    await crop.getByRole('slider', { name: '头像缩放' }).fill('2');
    const bounds = (await crop.locator('canvas').boundingBox())!;
    await page.mouse.move(bounds.x + 100, bounds.y + 100);
    await page.mouse.down(); await page.mouse.move(bounds.x + 170, bounds.y + 100); await page.mouse.up();
    expect(await crop.locator('canvas').evaluate(canvas => Array.from((canvas as HTMLCanvasElement).getContext('2d')!.getImageData(256, 256, 1, 1).data))).toEqual([37, 99, 235, 255]);
    await page.screenshot({ path: testInfo.outputPath('avatar-crop.png') });
    await crop.getByRole('button', { name: '确认裁剪并上传' }).click();
    await expect(crop).toHaveCount(0);
    expect(uploaded).toBe(true);
    const save = page.waitForRequest(request => request.url().endsWith('/api/auth/me') && request.method() === 'PUT');
    await page.getByRole('button', { name: '保存修改' }).click();
    expect((await save).postDataJSON().avatar).toBe('/cropped-avatar.jpg');
    await expect(page.getByText('保存成功', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '保存修改' })).toHaveCSS('--n-color', '#2563eb');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('损坏图片不上传，上传失败保留裁剪窗口并允许重试', async ({ page }) => {
  await prepare(page, { settings: { ...defaults } });
  await page.goto('/profile');
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken image') });
  const crop = page.locator('.avatar-crop-modal');
  await expect(crop.getByRole('alert')).toContainText('图片无法读取');
  await expect(crop.getByRole('button', { name: '确认裁剪并上传' })).toBeDisabled();
  await crop.getByRole('button', { name: '取消', exact: true }).click();
  const png = await page.evaluate(() => document.createElement('canvas').toDataURL().split(',')[1]!);
  await input.setInputFiles({ name: 'valid.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  let attempts = 0;
  await page.route('**/api/files/upload', route => {
    attempts++;
    return route.fulfill(attempts === 1
      ? { status: 500, json: { error: '测试上传失败' } }
      : { json: { file: { fileUrl: '/cropped-avatar.jpg' } } });
  });
  await crop.getByRole('button', { name: '确认裁剪并上传' }).click();
  await expect(page.getByText('上传失败: 测试上传失败', { exact: true })).toBeVisible();
  await expect(crop).toBeVisible();
  await crop.getByRole('button', { name: '确认裁剪并上传' }).click();
  await expect(crop).toHaveCount(0);
  expect(attempts).toBe(2);
});

test.describe('移动端首次触摸发送', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const path of ['/remote', '/group-chat/7']) {
    test(path, async ({ page }, testInfo) => {
      await prepare(page, { settings: { ...defaults } });
      await page.goto(path);
      if (path === '/remote') {
        await page.getByRole('button', { name: '打开联系人列表', exact: true }).click();
        await page.locator('.contact-item').first().click();
      }
      const editor = page.getByRole('textbox', { name: '消息', exact: true });
      await editor.fill('首次点击发送');
      await page.getByRole('button', { name: '发送', exact: true }).tap();
      await expect(page.getByText('首次点击发送', { exact: true })).toHaveCount(1);
      await expect(editor).toBeEmpty();
      await expect(editor).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath('mobile-send.png') });
    });
  }
});
