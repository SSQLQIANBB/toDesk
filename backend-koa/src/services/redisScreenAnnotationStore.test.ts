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
