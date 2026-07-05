# Shared Screen Annotations and Live Participants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让屏幕共享者的标注实时同步给当前参与者和后加入者，并让视频、共享页面以服务端房间快照实时标记全部群成员的参与状态。

**Architecture:** 后端使用独立的标注会话服务管理 Redis 历史，meeting Socket 只负责权限校验后的事件转发；媒体房间注册表按 socket 保存用户并生成按 `userId` 去重的参与快照。前端用两个小型状态模块分别合并标注事件和参与快照，页面只负责绑定 Socket 与展示。

**Tech Stack:** Vue 3、TypeScript、Naive UI、Canvas、Socket.IO、Koa、Redis/ioredis、Vitest、Vue Test Utils、Playwright。

**Repository constraint:** 用户要求不得自行提交代码，因此计划中的每个阶段只检查 `git diff`，不执行 `git commit` 或 `git push`；只有用户明确要求后才提交。

---

## 文件结构

### 新增文件

- `backend-koa/src/services/screenAnnotationService.ts`：标注类型、输入校验、共享者权限和历史状态变更。
- `backend-koa/src/services/screenAnnotationService.test.ts`：标注历史、权限、去重、撤销和清空测试。
- `backend-koa/src/services/redisScreenAnnotationStore.ts`：Redis 标注历史适配器。
- `backend-koa/src/services/mediaRoomRegistry.ts`：按频道维护 socket 与 userId，并生成去重参与者快照。
- `backend-koa/src/services/mediaRoomRegistry.test.ts`：加入、退出、多 socket 和房间隔离测试。
- `client-vue/src/services/screenAnnotationState.ts`：客户端标注快照、临时动作和完整动作合并。
- `client-vue/src/services/screenAnnotationState.test.ts`：后加入恢复、动作去重、撤销、清空测试。
- `client-vue/src/services/mediaParticipantState.ts`：按群组、类型和频道保存参与用户集合。
- `client-vue/src/services/mediaParticipantState.test.ts`：快照应用、旧频道过滤和断线清理测试。
- `client-vue/src/components/ScreenAnnotation.test.ts`：编辑权限、规范化坐标和组件事件测试。

### 修改文件

- `backend-koa/src/config/meeting.ts`：接入标注服务、参与者快照和销毁清理。
- `client-vue/src/components/ScreenAnnotation.vue`：改为外部权威动作驱动，支持编辑与只读两种模式。
- `client-vue/src/views/groupScreen.vue`：挂载标注层、绑定标注事件、展示共享参与状态。
- `client-vue/src/views/groupVideo.vue`：展示视频参与状态。
- `client-vue/tests/e2e/responsive.spec.ts`：覆盖手机和桌面标注层、工具栏及参与标签布局。

---

### Task 1: 后端标注会话服务

**Files:**
- Create: `backend-koa/src/services/screenAnnotationService.test.ts`
- Create: `backend-koa/src/services/screenAnnotationService.ts`

- [ ] **Step 1: 编写共享者权限和历史恢复失败测试**

测试使用内存 Store，不连接真实 Redis：

```ts
import { describe, expect, it } from 'vitest';
import {
  ScreenAnnotationService,
  type AnnotationAction,
  type ScreenAnnotationStore,
} from './screenAnnotationService';
import type { GroupSession } from './groupSessionService';

class MemoryStore implements ScreenAnnotationStore {
  records = new Map<string, AnnotationAction[]>();

  async get(key: string) {
    return this.records.get(key) ?? [];
  }

  async set(key: string, actions: AnnotationAction[]) {
    this.records.set(key, structuredClone(actions));
  }

  async delete(key: string) {
    this.records.delete(key);
  }
}

const session: GroupSession = {
  groupId: 7,
  type: 'screen',
  channelId: 'group:7:screen',
  ownerUserId: 1,
  ownerSocketId: 'owner-socket',
  startedAt: '2026-07-05T10:00:00.000Z',
};

const action: AnnotationAction = {
  actionId: 'action-1',
  tool: 'pen',
  points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
  color: '#FF0000',
  lineWidth: 0.005,
  userId: 1,
  createdAt: '2026-07-05T10:00:01.000Z',
};

describe('ScreenAnnotationService', () => {
  it('只允许当前共享者写入并让后加入者恢复历史', async () => {
    const service = new ScreenAnnotationService(new MemoryStore());

    await expect(service.complete(session, 2, action))
      .rejects.toThrow('只有当前屏幕共享者可以标注');
    await service.complete(session, 1, action);

    await expect(service.getSnapshot(session)).resolves.toEqual([action]);
  });

  it('相同 actionId 重复到达时只保存一次', async () => {
    const service = new ScreenAnnotationService(new MemoryStore());
    await service.complete(session, 1, action);
    await service.complete(session, 1, action);

    await expect(service.getSnapshot(session)).resolves.toHaveLength(1);
  });

  it('共享者可以撤销最后一笔并清空当前会话', async () => {
    const service = new ScreenAnnotationService(new MemoryStore());
    await service.complete(session, 1, action);
    await service.complete(session, 1, { ...action, actionId: 'action-2' });

    await expect(service.undo(session, 1)).resolves.toBe('action-2');
    await expect(service.getSnapshot(session)).resolves.toHaveLength(1);

    await service.clear(session, 1);
    await expect(service.getSnapshot(session)).resolves.toEqual([]);
  });

  it('不同 startedAt 的共享会话不复用旧标注', async () => {
    const service = new ScreenAnnotationService(new MemoryStore());
    await service.complete(session, 1, action);

    await expect(service.getSnapshot({
      ...session,
      startedAt: '2026-07-05T11:00:00.000Z',
    })).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run:

```bash
cd backend-koa
pnpm vitest run src/services/screenAnnotationService.test.ts
```

Expected: FAIL，提示无法解析 `./screenAnnotationService`。

- [ ] **Step 3: 实现最小标注服务**

定义稳定协议并集中校验：

```ts
import type { GroupSession } from './groupSessionService';

export type AnnotationPoint = { x: number; y: number };
export type AnnotationTool = 'pen' | 'arrow' | 'rect' | 'text' | 'eraser';

export type AnnotationAction = {
  actionId: string;
  tool: AnnotationTool;
  points: AnnotationPoint[];
  color: string;
  lineWidth: number;
  text?: string;
  userId: number;
  createdAt: string;
};

export interface ScreenAnnotationStore {
  get(key: string): Promise<AnnotationAction[]>;
  set(key: string, actions: AnnotationAction[]): Promise<void>;
  delete(key: string): Promise<void>;
}

const MAX_ACTIONS = 1000;
const MAX_POINTS = 5000;
const HEX_COLOR = /^#[0-9A-F]{6}$/i;

export class ScreenAnnotationService {
  constructor(private readonly store: ScreenAnnotationStore) {}

  private key(session: GroupSession) {
    return `group:annotation:${session.groupId}:${session.startedAt}`;
  }

  assertOwner(session: GroupSession, userId: number) {
    if (session.type !== 'screen' || session.ownerUserId !== userId) {
      throw new Error('只有当前屏幕共享者可以标注');
    }
  }

  validateAction(action: AnnotationAction) {
    if (!action.actionId || action.points.length === 0 || action.points.length > MAX_POINTS) {
      throw new Error('标注数据无效');
    }
    if (!HEX_COLOR.test(action.color) || action.lineWidth <= 0 || action.lineWidth > 0.05) {
      throw new Error('标注样式无效');
    }
    if (action.text && action.text.length > 500) throw new Error('标注文字过长');
    if (action.points.some(point => point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) {
      throw new Error('标注坐标无效');
    }
  }

  async getSnapshot(session: GroupSession) {
    return this.store.get(this.key(session));
  }

  async complete(session: GroupSession, userId: number, action: AnnotationAction) {
    this.assertOwner(session, userId);
    this.validateAction(action);
    const actions = await this.getSnapshot(session);
    if (actions.some(item => item.actionId === action.actionId)) return action;
    if (actions.length >= MAX_ACTIONS) throw new Error('标注数量已达上限，请先清空');
    const saved = { ...action, userId };
    await this.store.set(this.key(session), [...actions, saved]);
    return saved;
  }

  async undo(session: GroupSession, userId: number) {
    this.assertOwner(session, userId);
    const actions = await this.getSnapshot(session);
    const removed = actions.pop();
    await this.store.set(this.key(session), actions);
    return removed?.actionId ?? null;
  }

  async clear(session: GroupSession, userId: number) {
    this.assertOwner(session, userId);
    await this.store.delete(this.key(session));
  }

  async end(session: GroupSession) {
    await this.store.delete(this.key(session));
  }
}
```

- [ ] **Step 4: 运行测试确认变绿**

Run:

```bash
cd backend-koa
pnpm vitest run src/services/screenAnnotationService.test.ts
```

Expected: 4 tests PASS。

- [ ] **Step 5: 检查阶段差异**

Run:

```bash
git diff --check
git status --short
```

Expected: 无空白错误；只有本任务与设计、计划文件处于未提交状态。

---

### Task 2: Redis 标注 Store

**Files:**
- Create: `backend-koa/src/services/redisScreenAnnotationStore.ts`
- Create: `backend-koa/src/services/redisScreenAnnotationStore.test.ts`

- [ ] **Step 1: 编写 Redis 读写、TTL 和删除失败测试**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

vi.mock('../config/redis', () => ({ default: redis }));

import { RedisScreenAnnotationStore } from './redisScreenAnnotationStore';

const action = {
  actionId: 'action-1',
  tool: 'pen' as const,
  points: [{ x: 0.1, y: 0.2 }],
  color: '#FF0000',
  lineWidth: 0.005,
  userId: 1,
  createdAt: '2026-07-05T10:00:01.000Z',
};

describe('RedisScreenAnnotationStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('使用 12 小时 TTL 保存并恢复标注', async () => {
    const store = new RedisScreenAnnotationStore();
    redis.get.mockResolvedValue(JSON.stringify([action]));

    await store.set('annotation-key', [action]);
    await expect(store.get('annotation-key')).resolves.toEqual([action]);

    expect(redis.set).toHaveBeenCalledWith(
      'annotation-key',
      JSON.stringify([action]),
      'EX',
      12 * 60 * 60,
    );
  });

  it('没有历史时返回空数组，并可删除会话历史', async () => {
    const store = new RedisScreenAnnotationStore();
    redis.get.mockResolvedValue(null);

    await expect(store.get('annotation-key')).resolves.toEqual([]);
    await store.delete('annotation-key');

    expect(redis.del).toHaveBeenCalledWith('annotation-key');
  });
});
```

- [ ] **Step 2: 运行测试并确认适配器模块不存在**

Run:

```bash
cd backend-koa
pnpm vitest run src/services/redisScreenAnnotationStore.test.ts
```

Expected: FAIL，提示无法解析 `./redisScreenAnnotationStore`。

- [ ] **Step 3: 实现 Redis Store**

```ts
import redis from '../config/redis';
import {
  type AnnotationAction,
  type ScreenAnnotationStore,
} from './screenAnnotationService';

const ANNOTATION_TTL_SECONDS = 12 * 60 * 60;

export class RedisScreenAnnotationStore implements ScreenAnnotationStore {
  async get(key: string) {
    const value = await redis.get(key);
    return value ? JSON.parse(value) as AnnotationAction[] : [];
  }

  async set(key: string, actions: AnnotationAction[]) {
    await redis.set(key, JSON.stringify(actions), 'EX', ANNOTATION_TTL_SECONDS);
  }

  async delete(key: string) {
    await redis.del(key);
  }
}
```

- [ ] **Step 4: 运行服务测试与类型检查**

Run:

```bash
cd backend-koa
pnpm vitest run src/services/redisScreenAnnotationStore.test.ts src/services/screenAnnotationService.test.ts
pnpm typecheck
```

Expected: Redis Store 与标注服务测试 PASS，TypeScript 无错误。

---

### Task 3: 媒体房间参与者注册表

**Files:**
- Create: `backend-koa/src/services/mediaRoomRegistry.test.ts`
- Create: `backend-koa/src/services/mediaRoomRegistry.ts`

- [ ] **Step 1: 编写加入、退出和多连接失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { MediaRoomRegistry } from './mediaRoomRegistry';

describe('MediaRoomRegistry', () => {
  it('按 userId 去重并返回参与者快照', () => {
    const registry = new MediaRoomRegistry();
    registry.join('group:7:video', 'socket-a', 1);
    registry.join('group:7:video', 'socket-b', 2);
    registry.join('group:7:video', 'socket-c', 2);

    expect(registry.getUserIds('group:7:video')).toEqual([1, 2]);
  });

  it('同一用户最后一个 socket 离开后才变为未参与', () => {
    const registry = new MediaRoomRegistry();
    registry.join('group:7:screen', 'socket-a', 2);
    registry.join('group:7:screen', 'socket-b', 2);

    registry.leave('group:7:screen', 'socket-a');
    expect(registry.getUserIds('group:7:screen')).toEqual([2]);

    registry.leave('group:7:screen', 'socket-b');
    expect(registry.getUserIds('group:7:screen')).toEqual([]);
  });

  it('断线时从所有媒体房间移除 socket 且房间互不污染', () => {
    const registry = new MediaRoomRegistry();
    registry.join('group:7:video', 'socket-a', 1);
    registry.join('group:7:screen', 'socket-a', 1);
    registry.join('group:8:video', 'socket-b', 2);

    expect(registry.leaveSocket('socket-a')).toEqual([
      'group:7:screen',
      'group:7:video',
    ]);
    expect(registry.getUserIds('group:8:video')).toEqual([2]);
  });
});
```

- [ ] **Step 2: 运行测试并确认模块不存在**

Run:

```bash
cd backend-koa
pnpm vitest run src/services/mediaRoomRegistry.test.ts
```

Expected: FAIL，提示无法解析 `./mediaRoomRegistry`。

- [ ] **Step 3: 实现注册表**

```ts
export class MediaRoomRegistry {
  private readonly rooms = new Map<string, Map<string, number>>();

  join(channelId: string, socketId: string, userId: number) {
    const room = this.rooms.get(channelId) ?? new Map<string, number>();
    const alreadyJoined = room.has(socketId);
    room.set(socketId, userId);
    this.rooms.set(channelId, room);
    return { alreadyJoined, userIds: this.getUserIds(channelId) };
  }

  leave(channelId: string, socketId: string) {
    const room = this.rooms.get(channelId);
    if (!room?.delete(socketId)) return false;
    if (room.size === 0) this.rooms.delete(channelId);
    return true;
  }

  leaveSocket(socketId: string) {
    const changed: string[] = [];
    for (const channelId of [...this.rooms.keys()].sort()) {
      if (this.leave(channelId, socketId)) changed.push(channelId);
    }
    return changed;
  }

  getSocketIds(channelId: string) {
    return [...(this.rooms.get(channelId)?.keys() ?? [])];
  }

  getUserIds(channelId: string) {
    return [...new Set(this.rooms.get(channelId)?.values() ?? [])].sort((a, b) => a - b);
  }

  clear(channelId: string) {
    this.rooms.delete(channelId);
  }
}
```

- [ ] **Step 4: 运行测试确认变绿**

Run:

```bash
cd backend-koa
pnpm vitest run src/services/mediaRoomRegistry.test.ts
```

Expected: 3 tests PASS。

---

### Task 4: meeting Socket 接入参与快照与标注协议

**Files:**
- Modify: `backend-koa/src/config/meeting.ts`
- Modify: `backend-koa/src/services/screenAnnotationService.test.ts`

- [ ] **Step 1: 增加临时动作校验失败测试**

在服务测试中锁定临时事件也必须验证共享者和坐标：

```ts
it('临时动作同样校验共享者权限和输入范围', () => {
  const service = new ScreenAnnotationService(new MemoryStore());
  expect(() => service.validateDraft(session, 2, {
    actionId: 'draft-1',
    tool: 'pen',
    points: [{ x: 0.2, y: 0.3 }],
    color: '#FF0000',
    lineWidth: 0.005,
  })).toThrow('只有当前屏幕共享者可以标注');

  expect(() => service.validateDraft(session, 1, {
    actionId: 'draft-1',
    tool: 'pen',
    points: [{ x: 2, y: 0.3 }],
    color: '#FF0000',
    lineWidth: 0.005,
  })).toThrow('标注坐标无效');
});
```

- [ ] **Step 2: 运行测试确认 `validateDraft` 缺失**

Run:

```bash
cd backend-koa
pnpm vitest run src/services/screenAnnotationService.test.ts
```

Expected: FAIL，提示 `validateDraft` 不存在。

- [ ] **Step 3: 实现 `validateDraft` 并运行测试**

在 `screenAnnotationService.ts` 增加不落库的校验：

```ts
export type AnnotationDraft = Omit<AnnotationAction, 'userId' | 'createdAt'>;

validateDraft(session: GroupSession, userId: number, draft: AnnotationDraft) {
  this.assertOwner(session, userId);
  this.validateAction({
    ...draft,
    userId,
    createdAt: new Date().toISOString(),
  });
  return draft;
}
```

Run:

```bash
cd backend-koa
pnpm vitest run src/services/screenAnnotationService.test.ts
```

Expected: tests PASS。

- [ ] **Step 4: 在 meeting Socket 中替换裸 `mediaRooms` Map**

创建：

```ts
const mediaRooms = new MediaRoomRegistry();
const screenAnnotationService = new ScreenAnnotationService(
  new RedisScreenAnnotationStore(),
);
```

增加统一快照函数：

```ts
function emitPresence(session: GroupSession) {
  io.to(session.channelId).emit('group_call_presence', {
    groupId: session.groupId,
    type: session.type,
    channelId: session.channelId,
    userIds: mediaRooms.getUserIds(session.channelId),
  });
}
```

在 `join_group_call` 中调用 `mediaRooms.join(...)`，通过 `getSocketIds()` 生成现有成员，并在加入完成后调用 `emitPresence(session)`。在主动离开、disconnect 和会话结束时调用 `leave`/`clear` 并发送最新快照或空快照。

- [ ] **Step 5: 增加命名标注事件**

事件载荷固定为：

```ts
type AnnotationRequest = {
  groupId: number;
  startedAt: string;
  action: AnnotationDraft | AnnotationAction;
};
```

处理规则：

```ts
socket.on('screen_annotation_draft', async data => {
  const session = await groupSessionService.get(data.groupId, 'screen');
  if (!currentUser || !session || session.startedAt !== data.startedAt) return;
  try {
    const action = screenAnnotationService.validateDraft(session, currentUser.id, data.action);
    socket.to(session.channelId).emit('screen_annotation_draft', {
      groupId: session.groupId,
      startedAt: session.startedAt,
      action,
    });
  } catch (error) {
    socket.emit('screen_annotation_error', {
      message: error instanceof Error ? error.message : '标注失败',
    });
  }
});
```

以相同权限规则增加：

- `screen_annotation_complete`：调用 `complete`，向整个频道广播规范动作。
- `screen_annotation_undo`：调用 `undo`，广播被删除的 `actionId`。
- `screen_annotation_clear`：调用 `clear`，广播清空。

成员加入 screen 媒体房间后发送：

```ts
socket.emit('screen_annotation_snapshot', {
  groupId: session.groupId,
  startedAt: session.startedAt,
  actions: await screenAnnotationService.getSnapshot(session),
});
```

共享结束或共享者断线结束会话时，先调用 `screenAnnotationService.end(session)`，再广播 `screen_annotation_clear`。

- [ ] **Step 6: 运行后端测试和类型检查**

Run:

```bash
cd backend-koa
pnpm test
pnpm typecheck
```

Expected: 全部后端测试 PASS，TypeScript 无错误。

---

### Task 5: 前端标注状态与参与状态

**Files:**
- Create: `client-vue/src/services/screenAnnotationState.test.ts`
- Create: `client-vue/src/services/screenAnnotationState.ts`
- Create: `client-vue/src/services/mediaParticipantState.test.ts`
- Create: `client-vue/src/services/mediaParticipantState.ts`

- [ ] **Step 1: 编写标注状态失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { createScreenAnnotationState } from './screenAnnotationState';

const action = {
  actionId: 'action-1',
  tool: 'pen' as const,
  points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
  color: '#FF0000',
  lineWidth: 0.005,
  userId: 1,
  createdAt: '2026-07-05T10:00:01.000Z',
};

describe('screenAnnotationState', () => {
  it('后加入者从快照恢复，重复完成事件不会产生重复标注', () => {
    const state = createScreenAnnotationState();
    state.applySnapshot([action]);
    state.applyComplete(action);
    expect(state.actions()).toEqual([action]);
  });

  it('完整动作替换同 actionId 的临时轨迹', () => {
    const state = createScreenAnnotationState();
    state.applyDraft({ ...action, points: [action.points[0]!] });
    state.applyComplete(action);
    expect(state.drafts()).toEqual([]);
    expect(state.actions()).toEqual([action]);
  });

  it('撤销和清空同步更新画布状态', () => {
    const state = createScreenAnnotationState();
    state.applyComplete(action);
    state.applyUndo('action-1');
    expect(state.actions()).toEqual([]);
    state.applyDraft(action);
    state.clear();
    expect(state.drafts()).toEqual([]);
  });
});
```

- [ ] **Step 2: 编写参与快照失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { createMediaParticipantState } from './mediaParticipantState';

describe('mediaParticipantState', () => {
  it('按视频和共享频道分别保存参与用户', () => {
    const state = createMediaParticipantState();
    state.apply({ groupId: 7, type: 'video', channelId: 'group:7:video', userIds: [1, 2] });
    state.apply({ groupId: 7, type: 'screen', channelId: 'group:7:screen', userIds: [2] });
    expect(state.isParticipating(7, 'video', 1)).toBe(true);
    expect(state.isParticipating(7, 'screen', 1)).toBe(false);
  });

  it('会话频道切换后忽略旧频道迟到快照', () => {
    const state = createMediaParticipantState();
    state.setChannel(7, 'screen', 'current-channel');
    state.apply({ groupId: 7, type: 'screen', channelId: 'old-channel', userIds: [1] });
    expect(state.userIds(7, 'screen')).toEqual([]);
  });

  it('断线或会话结束时清除对应参与状态', () => {
    const state = createMediaParticipantState();
    state.apply({ groupId: 7, type: 'video', channelId: 'group:7:video', userIds: [1] });
    state.clear(7, 'video');
    expect(state.userIds(7, 'video')).toEqual([]);
  });
});
```

- [ ] **Step 3: 运行测试并确认两个模块不存在**

Run:

```bash
cd client-vue
pnpm vitest run src/services/screenAnnotationState.test.ts src/services/mediaParticipantState.test.ts
```

Expected: FAIL，提示两个 service 模块无法解析。

- [ ] **Step 4: 实现标注状态**

```ts
import { shallowRef, triggerRef } from 'vue';

export function createScreenAnnotationState() {
  const completed = shallowRef(new Map<string, AnnotationAction>());
  const temporary = shallowRef(new Map<string, AnnotationDraft>());

  const touch = () => {
    triggerRef(completed);
    triggerRef(temporary);
  };

  return {
    actions: () => [...completed.value.values()],
    drafts: () => [...temporary.value.values()],
    applySnapshot(actions: AnnotationAction[]) {
      completed.value = new Map(actions.map(action => [action.actionId, action]));
      temporary.value = new Map();
    },
    applyDraft(action: AnnotationDraft) {
      if (!completed.value.has(action.actionId)) temporary.value.set(action.actionId, action);
      touch();
    },
    applyComplete(action: AnnotationAction) {
      temporary.value.delete(action.actionId);
      completed.value.set(action.actionId, action);
      touch();
    },
    applyUndo(actionId: string | null) {
      if (actionId) completed.value.delete(actionId);
      touch();
    },
    clear() {
      completed.value = new Map();
      temporary.value = new Map();
    },
  };
}
```

将 `AnnotationAction`、`AnnotationDraft` 和相关点、工具类型作为该文件导出的共享前端协议类型。

- [ ] **Step 5: 实现参与状态**

使用 `groupId:type` 作为键，并单独保存当前频道：

```ts
export type MediaType = 'video' | 'screen';
export type ParticipantSnapshot = {
  groupId: number;
  type: MediaType;
  channelId: string;
  userIds: number[];
};

export function createMediaParticipantState() {
  const channels = new Map<string, string>();
  const participants = new Map<string, Set<number>>();
  const key = (groupId: number, type: MediaType) => `${groupId}:${type}`;

  return {
    setChannel(groupId: number, type: MediaType, channelId: string) {
      channels.set(key(groupId, type), channelId);
    },
    apply(snapshot: ParticipantSnapshot) {
      const stateKey = key(snapshot.groupId, snapshot.type);
      const channel = channels.get(stateKey);
      if (channel && channel !== snapshot.channelId) return false;
      channels.set(stateKey, snapshot.channelId);
      participants.set(stateKey, new Set(snapshot.userIds));
      return true;
    },
    isParticipating(groupId: number, type: MediaType, userId: number) {
      return participants.get(key(groupId, type))?.has(userId) ?? false;
    },
    userIds(groupId: number, type: MediaType) {
      return [...(participants.get(key(groupId, type)) ?? [])];
    },
    clear(groupId: number, type: MediaType) {
      participants.delete(key(groupId, type));
      channels.delete(key(groupId, type));
    },
  };
}
```

- [ ] **Step 6: 运行两个测试确认变绿**

Run:

```bash
cd client-vue
pnpm vitest run src/services/screenAnnotationState.test.ts src/services/mediaParticipantState.test.ts
```

Expected: 6 tests PASS。

---

### Task 6: 将 ScreenAnnotation 改为可同步的受控组件

**Files:**
- Create: `client-vue/src/components/ScreenAnnotation.test.ts`
- Modify: `client-vue/src/components/ScreenAnnotation.vue`

- [ ] **Step 1: 编写只读权限与规范坐标失败测试**

在测试 setup 中 mock Canvas 2D 上下文，并挂载组件：

```ts
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ScreenAnnotation from './ScreenAnnotation.vue';

describe('ScreenAnnotation', () => {
  it('共享者完成绘制时发出 0 到 1 的相对坐标', async () => {
    const wrapper = mount(ScreenAnnotation, {
      props: { editable: true, actions: [], drafts: [], showToolbar: true },
    });
    const canvas = wrapper.get('canvas');
    vi.spyOn(canvas.element, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 100,
      right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
    });

    await canvas.trigger('pointerdown', { clientX: 20, clientY: 20, pointerId: 1 });
    await canvas.trigger('pointermove', { clientX: 100, clientY: 50, pointerId: 1 });
    await canvas.trigger('pointerup', { clientX: 100, clientY: 50, pointerId: 1 });

    expect(wrapper.emitted('complete')?.[0]?.[0]).toMatchObject({
      points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.5 }],
    });
  });

  it('观看者画布不接收绘制操作', async () => {
    const wrapper = mount(ScreenAnnotation, {
      props: { editable: false, actions: [], drafts: [], showToolbar: false },
    });
    await wrapper.get('canvas').trigger('pointerdown', { clientX: 20, clientY: 20 });
    expect(wrapper.emitted('complete')).toBeUndefined();
    expect(wrapper.get('canvas').classes()).toContain('annotation-canvas--readonly');
  });
});
```

- [ ] **Step 2: 运行测试确认旧组件接口不满足**

Run:

```bash
cd client-vue
pnpm vitest run src/components/ScreenAnnotation.test.ts
```

Expected: FAIL，提示缺少 `editable/actions/drafts` 行为或未发出 `complete`。

- [ ] **Step 3: 最小改造组件数据流**

Props：

```ts
const props = withDefaults(defineProps<{
  actions: AnnotationAction[];
  drafts: AnnotationDraft[];
  editable: boolean;
  showToolbar?: boolean;
}>(), {
  showToolbar: false,
});
```

Emits：

```ts
const emit = defineEmits<{
  close: [];
  draft: [action: AnnotationDraft];
  complete: [action: AnnotationDraft];
  undo: [];
  clear: [];
}>();
```

关键规则：

- 删除组件内部权威 `history`，`redraw()` 遍历 `props.actions` 和 `props.drafts`。
- `getPoint()` 使用 `getBoundingClientRect()` 将像素转为 `0..1`。
- 实际绘制时将相对点乘以 canvas 宽高。
- `editable === false` 时所有 pointer handler 立即返回。
- pointer move 将新增点缓存在本地，并用一个 50ms 节流器发出 `draft`。
- pointer up 取消节流器并发出一次完整 `complete`。
- `undo` 和 `clear` 只 emit 意图，不直接修改外部历史。
- 只读 canvas 设置 `pointer-events: none`，不遮挡视频和页面控制。
- 将现有错误的卸载代码 `window.addEventListener('resize', handleResize)` 改为 `removeEventListener`，同时清理节流定时器。
- 保留现有工具、注释和视觉样式。

- [ ] **Step 4: 运行组件测试与现有前端测试**

Run:

```bash
cd client-vue
pnpm vitest run src/components/ScreenAnnotation.test.ts
pnpm test
```

Expected: 新测试和全部现有前端测试 PASS。

---

### Task 7: 在共享页面接入标注同步

**Files:**
- Modify: `client-vue/src/views/groupScreen.vue`
- Modify: `client-vue/src/services/screenAnnotationState.test.ts`

- [ ] **Step 1: 增加旧会话事件过滤失败测试**

将客户端状态绑定当前 `startedAt`：

```ts
it('忽略上一次共享会话迟到的标注事件', () => {
  const state = createScreenAnnotationState();
  state.startSession('2026-07-05T11:00:00.000Z');

  expect(state.applyComplete(
    '2026-07-05T10:00:00.000Z',
    action,
  )).toBe(false);
  expect(state.actions()).toEqual([]);
});
```

- [ ] **Step 2: 运行测试确认缺少会话过滤**

Run:

```bash
cd client-vue
pnpm vitest run src/services/screenAnnotationState.test.ts
```

Expected: FAIL，提示 `startSession` 不存在或 `applyComplete` 签名不匹配。

- [ ] **Step 3: 在状态模块中实现会话边界**

增加 `startedAt`，所有 apply 方法接收事件的 `startedAt`；只有与当前会话一致才更新。`startSession(next)` 在标识变化时先清空旧动作。

- [ ] **Step 4: 在共享视频容器上挂载标注层**

```vue
<ScreenAnnotation
  v-if="screenSession && (isSharing || annotationActions.length || annotationDrafts.length)"
  class="absolute inset-0"
  :actions="annotationActions"
  :drafts="annotationDrafts"
  :editable="isSharing && showAnnotation"
  :show-toolbar="isSharing && showAnnotation"
  @draft="sendAnnotationDraft"
  @complete="sendAnnotationComplete"
  @undo="sendAnnotationUndo"
  @clear="sendAnnotationClear"
  @close="showAnnotation = false"
/>
```

只有 `isSharing` 时显示顶栏“开启标注”按钮；观看者不显示编辑入口，但始终接收并渲染标注。

- [ ] **Step 5: 使用命名函数绑定和解绑全部标注事件**

绑定：

- `screen_annotation_snapshot`
- `screen_annotation_draft`
- `screen_annotation_complete`
- `screen_annotation_undo`
- `screen_annotation_clear`
- `screen_annotation_error`

所有 handler 同时验证 `groupId` 与 `startedAt`。发送函数从 `groupSessionState.getSession(groupId, 'screen')` 读取当前 `startedAt`，不从页面临时生成会话标识。

`handleCallEnded`、disconnect 和 cleanup 中调用标注状态 `clear()`；`unbindSocketEvents()` 用相同函数引用解除监听。

- [ ] **Step 6: 运行标注状态、组件测试和类型检查**

Run:

```bash
cd client-vue
pnpm vitest run src/services/screenAnnotationState.test.ts src/components/ScreenAnnotation.test.ts
pnpm typecheck
```

Expected: tests PASS，Vue TypeScript 无错误。

---

### Task 8: 视频与共享页面展示全部成员的实时参与状态

**Files:**
- Modify: `client-vue/src/views/groupVideo.vue`
- Modify: `client-vue/src/views/groupScreen.vue`
- Modify: `client-vue/src/services/mediaParticipantState.test.ts`

- [ ] **Step 1: 增加重复快照和响应式版本失败测试**

```ts
it('重复快照保持唯一 userId 并触发一次可观察更新', () => {
  const state = createMediaParticipantState();
  const before = state.version.value;
  state.apply({
    groupId: 7,
    type: 'video',
    channelId: 'group:7:video',
    userIds: [1, 1, 2],
  });

  expect(state.userIds(7, 'video')).toEqual([1, 2]);
  expect(state.version.value).toBe(before + 1);
});
```

- [ ] **Step 2: 运行测试并确认缺少响应式版本**

Run:

```bash
cd client-vue
pnpm vitest run src/services/mediaParticipantState.test.ts
```

Expected: FAIL，提示 `version` 不存在。

- [ ] **Step 3: 完成参与状态模块的响应式版本**

导出 `const version = ref(0)`；`apply()` 使用 `new Set(snapshot.userIds)` 替换当前集合后执行 `version.value += 1`，`clear()` 实际删除状态时也递增。页面 computed 先读取 `version.value`，再调用 `userIds()` 或 `isParticipating()`，确保 Vue 能可靠更新。

- [ ] **Step 4: 两个页面接收参与者快照**

添加命名 handler：

```ts
function handleCallPresence(data: ParticipantSnapshot) {
  if (data.groupId !== groupId.value || data.type !== pageMediaType) return;
  participantState.apply(data);
}
```

在 init 中 `on('group_call_presence', handleCallPresence)`，在 cleanup 中对应 `off`。disconnect、call ended 清空当前类型参与状态。

- [ ] **Step 5: 全部群成员显示参与标签**

视频页顶栏人数改为当前参与人数：

```vue
<div class="text-xs text-gray-400">
  {{ participantUserIds.length }} 人参与通话
</div>
```

视频成员抽屉和共享参与者侧栏都遍历现有 `members` 全量数据，并增加：

```vue
<n-tag
  :type="isMemberParticipating(member.id) ? 'success' : 'default'"
  size="tiny"
>
  {{ isMemberParticipating(member.id) ? '参与中' : '未参与' }}
</n-tag>
```

共享页人数也使用共享参与集合，不再使用 `members.length`。保留 `member.id` 作为列表 key。

- [ ] **Step 6: 运行相关测试和类型检查**

Run:

```bash
cd client-vue
pnpm vitest run src/services/mediaParticipantState.test.ts src/services/remotePeerRegistry.test.ts
pnpm typecheck
```

Expected: tests PASS，Vue TypeScript 无错误。

---

### Task 9: 响应式页面回归与完整验证

**Files:**
- Modify: `client-vue/tests/e2e/responsive.spec.ts`

- [ ] **Step 1: 先增加标注层和参与标签的页面失败测试**

在 Playwright 的 meeting socket mock 中让共享页进入活跃会话，并发送一份参与者快照与标注快照。新增断言：

```ts
test('手机宽度下标注层、工具栏和成员状态不会横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await preparePage(page);
  await page.goto('/group-screen/7');

  await expect(page.getByText('参与中').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('桌面端共享者工具栏保持在视频区域内', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await preparePage(page);
  await page.goto('/group-screen/7');

  await page.getByRole('button', { name: '开启标注' }).click();
  await expect(page.locator('.annotation-toolbar')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
```

- [ ] **Step 2: 运行 E2E 并确认新场景因 mock/功能缺失失败**

Run:

```bash
cd client-vue
pnpm playwright test tests/e2e/responsive.spec.ts
```

Expected: 新标注或参与标签断言 FAIL，现有响应式测试仍通过。

- [ ] **Step 3: 完善 Socket mock 与移动端工具栏样式**

Socket mock 必须复用生产事件名，不在测试中绕过页面状态。工具栏在手机端使用：

- 最大宽度 `calc(100vw - 24px)`。
- 横向工具区允许内部滚动或换行。
- 按钮保持可点击尺寸。
- 标注 canvas 与视频容器同尺寸，不增加页面 scrollWidth。

- [ ] **Step 4: 运行完整后端验证**

Run:

```bash
cd backend-koa
pnpm test
pnpm typecheck
```

Expected: 全部测试 PASS，类型检查成功。

- [ ] **Step 5: 运行完整前端验证**

Run:

```bash
cd client-vue
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm build
```

Expected: 单元/组件/E2E 全部 PASS；类型检查和 Vite 生产构建成功。

- [ ] **Step 6: 最终差异与注释检查**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

人工确认：

- 原有注释未删除，核心标注协议和权限判断有简洁中文注释。
- 没有 `setTimeout` 形式的竞态绕过；唯一计时器是 50ms 绘制批处理，并在卸载时清理。
- 所有新增 Socket、resize、pointer 监听均在销毁时解除。
- 未执行 commit 或 push。
