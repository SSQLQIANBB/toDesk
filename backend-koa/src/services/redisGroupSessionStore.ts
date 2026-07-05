import redis from '../config/redis';
import {
  type GroupSession,
  type GroupSessionStore,
} from './groupSessionService';

const GROUP_SESSION_TTL_SECONDS = 12 * 60 * 60;

export class RedisGroupSessionStore implements GroupSessionStore {
  async create(key: string, session: GroupSession) {
    const result = await redis.set(
      key,
      JSON.stringify(session),
      'EX',
      GROUP_SESSION_TTL_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  async get(key: string) {
    const value = await redis.get(key);
    return value ? JSON.parse(value) as GroupSession : null;
  }

  async delete(key: string) {
    return (await redis.del(key)) > 0;
  }
}
