import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  const user = { id: 1, username: 'owner', nickname: 'Prometheus', status: 'online' };
  const group = { id: 7, name: '同学群', ownerId: 1, role: 'owner', memberCount: 3 };
  await page.addInitScript(() => localStorage.setItem('__STORAGE_PERSIST_AUTH_', JSON.stringify({ token: 'ui-test', refreshToken: 'ui-refresh' })));
  await page.route('**/meeting/**', route => route.abort());
  await page.route(/\/api\/(auth|groups|messages|invitations)(?:\/|\?|$)/, route => {
    const url = route.request().url();
    let body: unknown = { invitations: [], messages: [], count: 0, hasMore: false, cursors: {} };
    if (url.includes('/auth/me')) body = { user };
    else if (url.includes('/auth/users')) body = { users: [user, { id: 4, username: 'monkey', nickname: '猴子他爹' }, { id: 5, username: 'asd' }] };
    else if (url.includes('/messages/private?')) body = { messages: [
      { id: 91, fromUserId: 4, toUserId: 1, message: '一起开始远程协作吧', messageType: 'text', createdAt: '2026-09-20T04:00:00Z', isRead: true },
      { id: 92, fromUserId: 4, toUserId: 1, message: '', messageType: 'call', call: { type: 'audio', status: 'completed', durationSeconds: 15 }, createdAt: '2026-09-20T04:01:00Z', isRead: true },
      { id: 93, fromUserId: 1, toUserId: 4, message: '好的，稍后发起屏幕共享', messageType: 'text', createdAt: '2026-09-20T04:02:00Z', isRead: true },
    ] };
    else if (url.includes('/groups/my')) body = { groups: [group] };
    else if (/\/groups\/7$/.test(url)) body = { group, members: [{ ...user, role: 'owner', canSpeak: true }, { id: 2, username: '师绍卿', role: 'member', canSpeak: true }, { id: 3, username: 'mu', role: 'member', canSpeak: false }], myRole: 'owner', myCanSpeak: true };
    return route.fulfill({ json: body });
  });
}

for (const width of [1440, 375]) {
  test(`设计稿布局与邀请选择 ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await expect(page.locator('.login-card')).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('login.png') });
    await prepare(page);
    await page.goto('/remote');
    await expect(page.getByText('开启高效远程协作')).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('empty.png') });
    await page.getByRole('button', { name: '打开联系人列表', exact: true }).click();
    await expect(page.locator('.contact-item').first()).toBeVisible();
    if (width < 768) {
      await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('drawer.png') });
      await page.locator('.sidebar-backdrop').click({ position: { x: width - 5, y: 400 } });
      await expect(page.locator('.sidebar-backdrop')).toHaveCount(0);
      await page.getByRole('button', { name: '打开联系人列表', exact: true }).click();
    }
    await page.locator('.contact-item').first().click();
    await expect(page.getByText('一起开始远程协作吧')).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('chat.png') });
    const editor = page.getByRole('textbox', { name: '消息', exact: true });
    await expect(editor).toBeVisible();
    await expect(page.locator('.header-icon')).toHaveCount(0);
    await expect(page.locator('.message-time')).toHaveCount(0);
    await expect(page.getByText('通话时长 00:15')).toBeVisible();
    const image = page.getByRole('button', { name: '发送图片', exact: true });
    const send = page.getByRole('button', { name: '发送', exact: true });
    const imageBox = (await image.boundingBox())!;
    const editorBox = (await editor.boundingBox())!;
    const sendBox = (await send.boundingBox())!;
    expect(Math.abs(imageBox.y + imageBox.height / 2 - editorBox.y - editorBox.height / 2)).toBeLessThan(2);
    expect(Math.abs(sendBox.y + sendBox.height / 2 - editorBox.y - editorBox.height / 2)).toBeLessThan(2);
    await expect(send).toBeDisabled();
    await editor.fill('测试发送');
    await send.click();
    await expect(page.locator('.message-bubble').getByText('测试发送', { exact: true })).toBeVisible();
    await expect(editor).toBeEmpty();
    await page.goto('/groups');
    await expect(page.locator('.group-card')).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('groups.png') });
    await page.getByRole('button', { name: '创建群组', exact: true }).click();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('create.png') });
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.locator('.group-card-title').click();
    await page.getByText('成员管理 (3)', { exact: true }).click();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('members.png') });
    await page.getByRole('button', { name: '邀请成员', exact: true }).click();
    const modal = page.locator('.group-invite-modal');
    await expect(modal.getByRole('button', { name: '确认邀请' })).toBeDisabled();
    await modal.getByText('猴子他爹', { exact: true }).click();
    await modal.getByPlaceholder('搜索联系人姓名...').fill('asd');
    await expect(modal.locator('.invite-row')).toHaveCount(1);
    await expect(modal.locator('.selected-members')).toContainText('猴子他爹');
    await modal.getByText('asd', { exact: true }).click();
    await modal.getByPlaceholder('搜索联系人姓名...').clear();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('invite.png') });
    await expect(modal.locator('.invite-row input:checked')).toHaveCount(2);
    const invitation = page.waitForRequest(request => request.url().endsWith('/api/groups/7/invite') && request.method() === 'POST');
    await modal.getByRole('button', { name: '确认邀请', exact: true }).click();
    expect((await invitation).postDataJSON()).toEqual({ userIds: [4, 5] });
    await expect(modal).toHaveCount(0);
    await page.getByRole('button', { name: '邀请成员', exact: true }).click();
    await expect(modal.locator('.invite-row input:checked')).toHaveCount(0);
    await modal.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '删除群组', exact: true }).click();
    await expect(page.getByText('确认删除群组？')).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('delete.png') });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}


test('退出登录需确认，取消保留会话', async ({ page }) => {
  await prepare(page);
  await page.goto('/remote');
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByText('确认退出当前账号吗？')).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page).toHaveURL(/remote/);
  await expect(page.locator('.n-dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.locator('.n-dialog').getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page).toHaveURL(/login/);
});

test('登录自动填充保持深色输入框', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('.login-card input').first()).toBeVisible();
  const session = await page.context().newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const { root } = await session.send('DOM.getDocument');
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.login-card input' });
  await session.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['autofill'] });
  await expect.poll(() => page.locator('.login-card input').first().evaluate(input => getComputedStyle(input).webkitTextFillColor)).toBe('rgb(255, 255, 255)');
  const style = await page.locator('.login-card input').first().evaluate(input => {
    const style = getComputedStyle(input);
    return { shadow: style.boxShadow, text: style.webkitTextFillColor };
  });
  expect(style.shadow).toContain('rgb(17, 26, 46)');
  expect(style.text).toBe('rgb(255, 255, 255)');
});
