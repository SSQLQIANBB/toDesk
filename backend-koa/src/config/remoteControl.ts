import type { Server } from 'socket.io';
import { validateAuthenticatedSession } from '../services/loginSessionService';
import { getRemoteControlCapabilities } from '../services/remoteControlPolicy';

/** Dedicated namespace: legacy chat signalling is never an authority for OS control. */
export function initializeRemoteControl(io: Server) {
  const namespace = io.of('/remote-control');
  namespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error('AUTH_REQUIRED');
      await validateAuthenticatedSession(token);
      const policy = getRemoteControlCapabilities();
      // Deliberate release gate: there is no native consent/media proof path to authorize yet.
      // Do not accept hosts or input using a client-supplied capability boolean.
      const error = new Error(policy.reason) as Error & { data?: unknown };
      error.data = { code: policy.reason };
      next(error);
    } catch {
      const error = new Error('AUTH_REVOKED') as Error & { data?: unknown };
      error.data = { code: 'AUTH_REVOKED' };
      next(error);
    }
  });
  return namespace;
}
