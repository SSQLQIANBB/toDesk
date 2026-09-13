import crypto from 'crypto';
import redis from '../config/redis';

const key = (userId: number) => `auth:version:${userId}`;

export async function getTokenVersion(userId: number): Promise<string | null> {
  return redis.get(key(userId));
}

export async function invalidateUserTokens(userId: number): Promise<void> {
  await redis.set(key(userId), crypto.randomUUID());
}

export async function isTokenVersionCurrent(userId: number, version?: string | null): Promise<boolean> {
  return (version || null) === await getTokenVersion(userId);
}
