import type { Server } from 'http';
import redis from '../config/redis';
import { RedisRemoteSessionStore } from './redisRemoteSessionStore';
import { RemoteSessionHistory } from './remoteSessionHistory';
import { RemoteControlService } from './remoteControlService';
import { RemoteControlRuntime } from './remoteControlRuntime';

/** This runs cleanup/audit while admission and native media release remain disabled. */
export function initializeRemoteControlRuntime(server: Server) {
  const store = new RedisRemoteSessionStore(redis);
  const history = new RemoteSessionHistory();
  const service = new RemoteControlService(store, Date.now, history);
  const runtime = new RemoteControlRuntime(service, store, history);
  runtime.start();
  server.once('close', () => { void runtime.stop(); });
  return runtime;
}
