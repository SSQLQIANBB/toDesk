# Remote Auth and Group Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Remote 连接通知和 Tab 恢复，统一 401 鉴权与登录跳转，并增加仅群主可执行的群组删除。

**Architecture:** 将 Socket 状态转换、Remote Tab 解析、鉴权失败协调和登录提交分别放入小型可测试模块，页面只负责绑定与清理。群组删除通过带依赖注入的服务完成权限和事务顺序，Controller 负责 Koa 响应及 Redis 清理。

**Tech Stack:** Vue 3、Vue Router、Socket.IO Client、Vitest、Vue Test Utils、Playwright、Koa、Sequelize、Redis。

---

## 文件职责

- `client-vue/src/services/connectionLifecycle.ts`：连接状态机和仅转换时通知。
- `client-vue/src/services/meetingSocket.ts`：将 Socket 原始事件接入状态机，暴露具名订阅。
- `client-vue/src/services/remoteTabState.ts`：解析和序列化 Remote Tab。
- `client-vue/src/services/authNavigation.ts`：安全 redirect 解析与鉴权失败跳转目标。
- `client-vue/src/services/loginController.ts`：登录并发锁、loading 和有序跳转。
- `client-vue/src/utils/request.ts`：共享刷新 Promise 和共享鉴权失败 Promise。
- `client-vue/src/stores/auth.ts`：同步本地清理与主动服务端登出分离。
- `backend-koa/src/services/groupDeletionService.ts`：删除权限与事务内清理顺序。
- `backend-koa/src/controller/groupController.ts`：删除接口响应和 Redis 清理。

### Task 1: Remote 连接状态转换

**Files:**
- Create: `client-vue/src/services/connectionLifecycle.ts`
- Create: `client-vue/src/services/connectionLifecycle.test.ts`
- Modify: `client-vue/src/services/meetingSocket.ts`
- Modify: `client-vue/src/views/remoteShare/index.vue`

- [ ] **Step 1: 写连接状态机失败测试**

测试构造 `ConnectionLifecycle`，覆盖：

```ts
const lifecycle = new ConnectionLifecycle();
const notified = vi.fn();
const unsubscribe = lifecycle.subscribeAuthenticated(notified);

lifecycle.transition('connecting');
lifecycle.transition('authenticated');
lifecycle.transition('authenticated');
expect(notified).toHaveBeenCalledTimes(1);

unsubscribe();
lifecycle.transition('disconnected');
lifecycle.transition('authenticated');
expect(notified).toHaveBeenCalledTimes(1);
```

另一个测试重新订阅已有 `authenticated` 状态，确认不回放；断线后重新认证确认新订阅者只收到一次。

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
pnpm --filter client-vue exec vitest run src/services/connectionLifecycle.test.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现最小状态机**

实现状态联合类型 `disconnected | connecting | authenticated`、`transition()`、`subscribeAuthenticated()`、`getStatus()` 和测试用 `getSubscriberCount()`。只有进入 `authenticated` 且旧状态不是 `authenticated` 时遍历订阅者。

- [ ] **Step 4: 接入共享 Socket 和 Remote 页面**

`meetingSocket.ts` 在 `connect`、`authenticated`、`disconnect` 事件中转换状态，连接已认证时不重复发送 `authenticate`。暴露：

```ts
export function subscribeMeetingAuthenticated(handler: () => void) {
  return connectionLifecycle.subscribeAuthenticated(handler);
}

export function getMeetingConnectionStatus() {
  return connectionLifecycle.getStatus();
}
```

Remote 页面使用具名 handler 注册原始业务事件；连接成功 toast 使用 `subscribeMeetingAuthenticated`。卸载时按 handler 调用 `off(event, handler)`，不关闭共享 Socket、不调用无 handler 的 `off(event)`。

- [ ] **Step 5: 运行测试确认 GREEN**

```bash
pnpm --filter client-vue exec vitest run src/services/connectionLifecycle.test.ts
```

Expected: PASS。

### Task 2: Remote Tab 路由状态

**Files:**
- Create: `client-vue/src/services/remoteTabState.ts`
- Create: `client-vue/src/services/remoteTabState.test.ts`
- Modify: `client-vue/src/views/remoteShare/index.vue`
- Create: `client-vue/tests/e2e/remote-state.spec.ts`

- [ ] **Step 1: 写 Tab 解析失败测试**

覆盖：

```ts
expect(parseRemoteTab(undefined)).toBe('users');
expect(parseRemoteTab('users')).toBe('users');
expect(parseRemoteTab('groups')).toBe('groups');
expect(parseRemoteTab('invalid')).toBe('users');
expect(getRemoteTabQuery('users')).toEqual({});
expect(getRemoteTabQuery('groups')).toEqual({ tab: 'groups' });
```

- [ ] **Step 2: 运行测试确认 RED**

```bash
pnpm --filter client-vue exec vitest run src/services/remoteTabState.test.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 Tab 工具并接入页面**

Remote 引入 `useRoute`，增加：

```ts
const activeTab = ref(parseRemoteTab(route.query.tab));

watch(activeTab, (tab) => {
  void router.replace({ path: '/remote', query: getRemoteTabQuery(tab) });
});
```

模板 `<n-tabs>` 增加 `v-model:value="activeTab"`。页面从群组和详情返回时由原历史 URL 恢复。

- [ ] **Step 4: 写 Playwright 路由测试**

真实导航测试：

- `/remote?tab=groups` 显示“我的群组”面板；
- 点击群组进入 `/group-chat/7`，浏览器返回后 URL 和 Tab 仍为 groups；
- `/remote` 默认 users；
- 连续两轮进入和返回保持 groups；
- `tab=invalid` 回退 users。

- [ ] **Step 5: 运行单元与 E2E 测试确认 GREEN**

```bash
pnpm --filter client-vue exec vitest run src/services/remoteTabState.test.ts
pnpm --filter client-vue exec playwright test tests/e2e/remote-state.spec.ts
```

Expected: PASS。

### Task 3: 群组删除后端

**Files:**
- Create: `backend-koa/src/services/groupDeletionService.ts`
- Create: `backend-koa/src/services/groupDeletionService.test.ts`
- Modify: `backend-koa/src/controller/groupController.ts`
- Modify: `backend-koa/src/router/group.ts`

- [ ] **Step 1: 写权限与事务失败测试**

依赖使用 Vitest mock，覆盖：

```ts
await expect(service.delete(7, 2)).rejects.toMatchObject({ status: 403 });
expect(deps.transaction).not.toHaveBeenCalled();
```

群主成功时断言事务内顺序调用：

```text
deleteMessages → deleteInvitations → deleteMembers → deleteGroup
```

群组不存在返回 404，普通成员和管理员均返回 403。

- [ ] **Step 2: 运行测试确认 RED**

```bash
pnpm --filter backend-koa exec vitest run src/services/groupDeletionService.test.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现删除服务**

定义 `GroupDeletionError(status, message)` 和依赖接口。先查成员，再查群组和 owner 角色，之后调用单个 `transaction(callback)`，所有 destroy 接收相同 transaction。

- [ ] **Step 4: 接入 Koa 路由和 Redis 清理**

新增：

```ts
router.delete('/:id', groupController.deleteGroup);
```

Controller 使用 Sequelize model adapters 调用服务。成功后调用现有 `redisService.delGroupInfo()`、`delGroupMembers()`、`delPattern('group:session:<id>:*')`。Redis 清理失败只记录错误，不把已经完成的数据库删除伪装成失败。

- [ ] **Step 5: 运行后端测试和类型检查**

```bash
pnpm --filter backend-koa test
pnpm --filter backend-koa typecheck
```

Expected: PASS。

### Task 4: 群组删除前端交互

**Files:**
- Modify: `client-vue/src/api/group.ts`
- Modify: `client-vue/src/views/groups.vue`
- Modify: `client-vue/src/services/groupSessionState.ts`
- Modify: `client-vue/src/services/groupSessionState.test.ts`
- Create: `client-vue/tests/e2e/group-delete.spec.ts`

- [ ] **Step 1: 写会话清理失败测试**

先建立同一群组的视频和共享状态，调用 `clearGroup(7)`，断言两个状态都为空且其他群组不受影响。

- [ ] **Step 2: 写删除交互失败 E2E 测试**

通过真实页面与 API interception 覆盖：

- owner 编辑弹窗可见“删除群组”；
- admin/member 不可见；
- 点击删除后取消，DELETE 请求计数为 0；
- 确认成功后群组卡片消失；
- DELETE 500 时错误信息出现，弹窗和群组卡片保留。

- [ ] **Step 3: 运行测试确认 RED**

```bash
pnpm --filter client-vue exec vitest run src/services/groupSessionState.test.ts
pnpm --filter client-vue exec playwright test tests/e2e/group-delete.spec.ts
```

Expected: FAIL，`clearGroup` 和删除入口不存在。

- [ ] **Step 4: 实现 API 和页面交互**

新增：

```ts
export function deleteGroup(groupId: number) {
  return http.delete<{ message: string }>(`/api/groups/${groupId}`);
}
```

编辑弹窗仅 `currentGroup?.role === 'owner'` 显示危险操作。使用 `dialog.warning` 二次确认；只有 positive callback 调用 API。成功后 `groupSessionState.clearGroup(id)`、关闭相关弹窗、从本地列表移除并 `await loadGroups()`；失败只 `message.error`。

- [ ] **Step 5: 运行测试确认 GREEN**

运行 Task 4 的两个命令，Expected: PASS。

### Task 5: 统一鉴权失败

**Files:**
- Create: `client-vue/src/services/authNavigation.ts`
- Create: `client-vue/src/services/authNavigation.test.ts`
- Modify: `client-vue/src/stores/auth.ts`
- Modify: `client-vue/src/utils/request.ts`
- Modify: `client-vue/src/router/index.ts`
- Create: `client-vue/src/utils/request.test.ts`

- [ ] **Step 1: 写 redirect 和并发 401 失败测试**

`authNavigation.test.ts` 覆盖安全站内路径、拒绝外部 URL、拒绝 login 自循环。

`request.test.ts` mock fetch、auth 和 router，覆盖：

- 两个并发普通请求 401 且刷新失败，只刷新一次、清理一次、replace 一次；
- refresh 成功后原请求重试并成功；
- 403 不清理；
- `/api/auth/login` 401 不刷新、不跳转；
- 无 refreshToken 时直接统一失败；
- redirect 使用 `router.currentRoute.value.fullPath`。

- [ ] **Step 2: 运行测试确认 RED**

```bash
pnpm --filter client-vue exec vitest run src/services/authNavigation.test.ts src/utils/request.test.ts
```

Expected: FAIL，安全跳转与单次鉴权失败协调尚不存在。

- [ ] **Step 3: 拆分本地清理**

`auth.ts` 增加同步 `clearAuthLocal()`，完整清除三个 ref 和三个 localStorage 项。现有 `clearAuth()` 保留服务端 logout 注释与逻辑，最终调用本地清理。

- [ ] **Step 4: 实现请求协调**

请求层保留一个 `refreshTokenPromise`，增加一个 `authFailurePromise`。被动失效只调用 `clearAuthLocal()` 和：

```ts
await router.replace({
  name: 'Login',
  query: { redirect: getAuthRedirect(router.currentRoute.value.fullPath) },
});
```

登录、注册、refresh-token URL 跳过自动恢复。401 重试一次仍失败则统一退出；403 直接抛业务错误。

- [ ] **Step 5: 修复路由守卫**

未登录访问受保护页面时携带 `to.fullPath`。恢复用户失败时同步清理本地状态，再返回登录目标；不发起 logout 请求。

- [ ] **Step 6: 运行测试确认 GREEN**

运行 Task 5 测试命令及前端类型检查，Expected: PASS。

### Task 6: 登录顺序、redirect 和 Loading

**Files:**
- Create: `client-vue/src/services/loginController.ts`
- Create: `client-vue/src/services/loginController.test.ts`
- Modify: `client-vue/src/views/login.vue`
- Create: `client-vue/src/views/login.test.ts`

- [ ] **Step 1: 写登录 Controller 失败测试**

使用可控 Promise 覆盖：

- 调用 submit 后立即 `loading === true`；
- Promise 未完成时第二次 submit 不调用 login；
- 成功调用顺序为 login、setAuth、navigate；
- redirect 合法时导航原页面，无 redirect 导航 `/remote`；
- login 拒绝和 navigate 抛错均在 finally 恢复 loading；
- 表单数据对象不被修改。

- [ ] **Step 2: 写按钮组件失败测试**

挂载登录页并 stub Naive UI，触发登录后断言按钮 props：

```ts
expect(button.attributes('data-loading')).toBe('true');
expect(button.attributes('disabled')).toBeDefined();
```

完成失败 Promise 后断言 loading 和 disabled 恢复。

- [ ] **Step 3: 运行测试确认 RED**

```bash
pnpm --filter client-vue exec vitest run src/services/loginController.test.ts src/views/login.test.ts
```

Expected: FAIL，Controller 不存在且按钮没有显式 disabled。

- [ ] **Step 4: 实现 Controller 并接入登录页**

Controller 使用 Vue `ref(false)`，在任何 await 前检查并设置 loading。登录页按钮增加 `:disabled="loading"`，`handleLogin()` 只调用 Controller；导航使用 `await router.replace(resolvePostLoginPath(route.query.redirect))`。

注册沿用现有 try/finally，但也增加并发 guard 和显式 disabled，避免共享 loading 下重复提交。

- [ ] **Step 5: 运行测试确认 GREEN**

运行 Task 6 测试命令，Expected: PASS。

### Task 7: 集成回归与发布

**Files:**
- Modify: `client-vue/tests/e2e/responsive.spec.ts`（仅在新交互影响 mock 时调整）
- Verify: all changed files

- [ ] **Step 1: 执行完整验证**

```bash
git diff --check
pnpm --filter backend-koa test
pnpm --filter backend-koa typecheck
pnpm --filter client-vue test
pnpm --filter client-vue typecheck
pnpm --filter client-vue test:e2e
pnpm --filter client-vue build
```

Expected: 所有命令退出码 0。

- [ ] **Step 2: 检查提交范围**

```bash
git status -sb
git diff --stat HEAD
git diff --check
```

确认没有 `.env`、测试输出、构建产物或无关文件。

- [ ] **Step 3: 提交并推送**

```bash
git add <本计划涉及的明确文件>
git commit -m "fix: stabilize remote auth and group management"
git push origin master
```

Expected: `origin/master` 更新到新提交。

