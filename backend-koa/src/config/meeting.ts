import { type Server } from 'http';
import { Server as Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt';
import { File, GroupMember, GroupMessage, Message, User as UserModel } from '../models';
import { saveReliableMessage } from '../services/reliableMessageService';
import { isTokenVersionCurrent } from '../services/tokenVersionService';
import {
  GroupSessionService,
  type GroupSession,
  type GroupSessionType,
} from '../services/groupSessionService';
import { MediaRoomRegistry } from '../services/mediaRoomRegistry';
import { RedisGroupSessionStore } from '../services/redisGroupSessionStore';
import { RedisScreenAnnotationStore } from '../services/redisScreenAnnotationStore';
import {
  ScreenAnnotationService,
  type AnnotationAction,
  type AnnotationDraft,
} from '../services/screenAnnotationService';
import {
  createCallHistoryMessage,
  PrivateCallTracker,
  serializeChatMessage,
  type CallHistoryType,
  type PrivateCallHistoryRecord,
} from '../services/callHistoryService';
import {
  createChatMediaMessage,
  type ChatMediaMessage,
} from '../services/chatMediaMessageService';

type PresenceStatus = 'online' | 'offline' | 'busy';

type MeetingUser = {
  id: number;
  socketId: string;
  username: string;
  nickname?: string;
  avatar?: string;
  status: PresenceStatus;
  bio?: string;
};

const userMap = new Map<string, MeetingUser>();
const socketToUserMap = new Map<string, number>();
const groupRooms = new Map<number, Set<string>>();
const mediaRooms = new MediaRoomRegistry();
const groupSessionService = new GroupSessionService(new RedisGroupSessionStore());
const screenAnnotationService = new ScreenAnnotationService(new RedisScreenAnnotationStore());

function getSessionType(deviceType: number): GroupSessionType {
  if (deviceType === 3) return 'audio';
  return deviceType === 2 ? 'screen' : 'video';
}

function getSessionDeviceType(type: GroupSessionType) {
  if (type === 'screen') return 2;
  return type === 'audio' ? 3 : 1;
}

function getPrivateCallType(deviceType: number): CallHistoryType | null {
  if (deviceType === 0) return 'video';
  if (deviceType === 1) return 'screen';
  if (deviceType === 2) return 'audio';
  return null;
}

async function getMessageContent(
  data: { message?: string; messageType?: string; media?: ChatMediaMessage['media'] },
  userId: number,
  groupId?: number,
) {
  if (data.messageType === 'image' || data.messageType === 'voice') {
    const fileId = data.media?.fileId;
    if (!Number.isSafeInteger(fileId)) throw new Error('媒体文件无效');

    const file = await File.findOne({ where: { id: fileId, userId } });
    const belongsToTarget = groupId === undefined
      ? file?.groupId == null
      : Number(file?.groupId) === groupId;
    if (!file || !belongsToTarget) throw new Error('媒体文件无效');

    return createChatMediaMessage({
      type: data.messageType,
      media: { ...data.media, url: file.fileUrl },
    });
  }
  const message = data.message?.trim();
  if (!message || message.length > 10000) throw new Error('消息无效');
  return message;
}

function getPublicUsers() {
  const users = new Map<number, MeetingUser>();

  for (const user of userMap.values()) {
    if (user.status !== 'offline') {
      users.set(user.id, user);
    }
  }

  return [...users.values()];
}

function getPublicUser(userId: number): MeetingUser | undefined {
  return getPublicUsers().find(user => user.id === userId);
}

function samePublicUser(left?: MeetingUser, right?: MeetingUser) {
  if (!left || !right) return left === right;
  return left.socketId === right.socketId
    && left.status === right.status
    && left.username === right.username
    && left.nickname === right.nickname
    && left.avatar === right.avatar
    && left.bio === right.bio;
}

function getUserSockets(userId: number) {
  return [...socketToUserMap.entries()]
    .filter(([, mappedUserId]) => mappedUserId === userId)
    .map(([socketId]) => socketId);
}

const initialMeeting = (server: Server) => {
  const io = new Socket(server, {
    path: '/meeting',
    cors: {
      origin: '*',
    },
  });

  const messageWriteMs: number[] = [];
  const privateCallTracker = new PrivateCallTracker();
  let messageWriteFailures = 0;
  const metricsTimer = setInterval(() => {
    const transports = { websocket: 0, polling: 0 };
    for (const client of io.sockets.sockets.values()) {
      if (client.conn.transport.name === 'websocket') transports.websocket++;
      else transports.polling++;
    }
    const latencies = messageWriteMs.splice(0).sort((a, b) => a - b);
    const p95 = latencies.length ? latencies[Math.ceil(latencies.length * 0.95) - 1] : null;
    console.info('realtime_metrics', JSON.stringify({
      connections: io.engine.clientsCount, transports,
      messageWrites: latencies.length, messageWriteP95Ms: p95,
      messageWriteFailures,
    }));
    messageWriteFailures = 0;
  }, 60_000);
  metricsTimer.unref();

  async function emitGroupSessionEvent(groupId: number, event: string, payload: unknown) {
    const members = await GroupMember.findAll({ where: { groupId } });
    const socketIds = members.flatMap(member => getUserSockets(member.userId));
    if (socketIds.length) io.to(socketIds).emit(event, payload);
  }

  async function savePrivateCallHistory(record: PrivateCallHistoryRecord) {
    const saved = await Message.create({
      fromUserId: record.callerUserId,
      toUserId: record.calleeUserId,
      message: createCallHistoryMessage(record),
      isRead: true,
    });
    const payload = serializeChatMessage(saved);
    const socketIds = [...new Set([
      ...getUserSockets(record.callerUserId),
      ...getUserSockets(record.calleeUserId),
    ])];
    if (socketIds.length) io.to(socketIds).emit('private_call_history', payload);
  }

  async function saveGroupCallHistory(session: GroupSession, user?: MeetingUser | null) {
    const durationSeconds = Math.max(
      1,
      Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000),
    );
    const saved = await GroupMessage.create({
      groupId: session.groupId,
      userId: session.ownerUserId,
      message: createCallHistoryMessage({
        type: session.type,
        status: 'completed',
        durationSeconds,
      }),
      messageType: 'system',
    });
    io.to(`group_${session.groupId}`).emit('group_message', {
      ...serializeChatMessage(saved),
      groupId: session.groupId,
      userId: session.ownerUserId,
      user: user || getPublicUser(session.ownerUserId),
      time: saved.createdAt?.toLocaleString() || new Date().toLocaleString(),
      createdAt: saved.createdAt,
    });
  }

  async function recordPrivateCall(record: PrivateCallHistoryRecord | null) {
    if (!record) return;
    try {
      await savePrivateCallHistory(record);
    } catch (error) {
      console.error('save private call history failed:', error);
    }
  }

  async function recordGroupCall(session: GroupSession, user?: MeetingUser | null) {
    try {
      await saveGroupCallHistory(session, user);
    } catch (error) {
      console.error('save group call history failed:', error);
    }
  }

  function emitPresenceChange(userId: number, previous?: MeetingUser) {
    const next = getPublicUser(userId);
    if (samePublicUser(previous, next)) return;
    io.emit('user_presence', next ? { userId, user: next } : { userId });
  }

  function emitMediaPresence(session: GroupSession) {
    io.to(session.channelId).emit('group_call_presence', {
      groupId: session.groupId,
      type: session.type,
      channelId: session.channelId,
      userIds: mediaRooms.getUserIds(session.channelId),
    });
  }

  function emitEmptyMediaPresence(session: GroupSession) {
    io.to(`group_${session.groupId}`).emit('group_call_presence', {
      groupId: session.groupId,
      type: session.type,
      channelId: session.channelId,
      userIds: [],
    });
  }

  function removeFromMediaRoom(socketId: string, session: GroupSession, userId?: number) {
    if (!mediaRooms.leave(session.channelId, socketId)) return;

    io.to(session.channelId).emit('group_call_member_left', {
      groupId: session.groupId,
      type: session.type,
      channelId: session.channelId,
      socketId,
      userId,
    });
    emitMediaPresence(session);
  }

  io.on('connection', (socket) => {
    const socketId = socket.id;
    let currentUser: MeetingUser | null = null;
    const joinedMediaSessions = new Map<string, GroupSession>();
    const ownedSessions = new Map<string, GroupSession>();

    socket.on('authenticate', async (data: { token: string; nickname?: string; avatar?: string }) => {
      try {
        const payload = verifyToken(data.token);
        if (!await isTokenVersionCurrent(payload.userId, payload.authVersion)) throw new Error('token 已失效');
        const dbUser = await UserModel.findByPk(payload.userId);
        const status = (dbUser?.status || 'online') as PresenceStatus;
        const previous = getPublicUser(payload.userId);

        currentUser = {
          id: payload.userId,
          socketId,
          username: payload.username,
          nickname: data.nickname || dbUser?.nickname || payload.username,
          avatar: data.avatar || dbUser?.avatar,
          status,
          bio: dbUser?.bio,
        };

        userMap.set(socketId, currentUser);
        socketToUserMap.set(socketId, payload.userId);

        socket.emit('authenticated', currentUser);
        socket.emit('user_list', getPublicUsers());
        emitPresenceChange(payload.userId, previous);
      } catch (error) {
        socket.emit('auth_error', { message: 'Authentication failed' });
        console.error('meeting authentication failed:', error);
      }
    });

    socket.on('status_update', async (data: { status: PresenceStatus }) => {
      if (!currentUser || !['online', 'offline', 'busy'].includes(data.status)) return;
      if (currentUser.status === data.status) return;

      const publicUser = getPublicUser(currentUser.id);
      const previous = publicUser ? { ...publicUser } : undefined;
      currentUser.status = data.status;
      userMap.set(socketId, currentUser);
      await UserModel.update({ status: data.status }, { where: { id: currentUser.id } });
      emitPresenceChange(currentUser.id, previous);
    });

    socket.on('disconnect', async () => {
      const previous = currentUser ? getPublicUser(currentUser.id) : undefined;
      userMap.delete(socketId);
      socketToUserMap.delete(socketId);
      if (currentUser) emitPresenceChange(currentUser.id, previous);

      await Promise.all(privateCallTracker.finishForSocket(socketId).map(recordPrivateCall));

      groupRooms.forEach((members, groupId) => {
        if (members.delete(socketId)) {
          socket.to(`group_${groupId}`).emit('group_member_left', { socketId, userId: currentUser?.id });
        }
      });

      for (const session of joinedMediaSessions.values()) {
        removeFromMediaRoom(socketId, session, currentUser?.id);
      }

      for (const session of ownedSessions.values()) {
        const ended = currentUser
          ? await groupSessionService.end(session.groupId, session.type, currentUser.id)
          : false;
        if (ended) {
          if (session.type === 'screen') {
            await screenAnnotationService.end(session);
            io.to(session.channelId).emit('screen_annotation_clear', {
              groupId: session.groupId,
              startedAt: session.startedAt,
            });
          }
          emitEmptyMediaPresence(session);
          mediaRooms.clear(session.channelId);
          await recordGroupCall(session, currentUser);
          await emitGroupSessionEvent(session.groupId, 'group_call_ended', {
            from: socketId,
            groupId: session.groupId,
            type: session.type,
            deviceType: getSessionDeviceType(session.type),
          });
        }
      }

    });

    socket.on('private_message', async (data: { to?: MeetingUser; message?: string; messageType?: string; media?: ChatMediaMessage['media']; clientMessageId?: string }, ack?: (result: unknown) => void) => {
      if (!currentUser || !data.to?.id) {
        ack?.({ ok: false, error: '消息无效' }); return;
      }

      try {
        const messageContent = await getMessageContent(data, currentUser.id);
        const writeStartedAt = Date.now();
        const receiverSockets = getUserSockets(data.to.id);
        const { saved: savedMessage, duplicate } = await saveReliableMessage({
          kind: 'private', userId: currentUser.id, targetId: data.to.id,
          message: messageContent, clientMessageId: data.clientMessageId,
        });
        if (messageWriteMs.length < 10_000) messageWriteMs.push(Date.now() - writeStartedAt);

        const payload = {
          ...serializeChatMessage(savedMessage),
          from: socketId,
          fromUserId: currentUser.id,
          toUserId: data.to.id,
          time: savedMessage.createdAt?.toLocaleString() || new Date().toLocaleString(),
          createdAt: savedMessage.createdAt,
          sender: currentUser,
        };

        if (!duplicate) receiverSockets.forEach((targetSocketId) => {
          socket.to(targetSocketId).emit('private_message', payload);
        });
        ack?.({ ok: true, id: savedMessage.id, clientMessageId: data.clientMessageId });
      } catch (error) {
        messageWriteFailures++;
        console.error('save private message failed:', error);
        ack?.({ ok: false, error: '发送失败' });
      }
    });

    socket.on('webrtc_offer', (data) => {
      if (data.to?.socketId) {
        socket.to(data.to.socketId).emit('webrtc_offer', {
          from: socketId,
          offer: data.offer,
          deviceType: data.deviceType,
        });
      }
    });

    socket.on('webrtc_answer', (data) => {
      if (data.to?.socketId) {
        socket.to(data.to.socketId).emit('webrtc_answer', {
          from: socketId,
          answer: data.answer,
        });
      }
    });

    socket.on('webrtc_ice', (data) => {
      if (data.to?.socketId) {
        socket.to(data.to.socketId).emit('webrtc_ice', {
          from: socketId,
          candidate: data.candidate,
        });
      }
    });

    socket.on('webrtc_call_request', (data) => {
      const type = getPrivateCallType(data.deviceType);
      const calleeUserId = data.to?.socketId ? socketToUserMap.get(data.to.socketId) : undefined;
      if (!currentUser || !type || !data.to?.socketId || !calleeUserId) return;

      privateCallTracker.request({
        callerSocketId: socketId,
        calleeSocketId: data.to.socketId,
        callerUserId: currentUser.id,
        calleeUserId,
        type,
      });
      socket.to(data.to.socketId).emit('webrtc_call_request', {
        from: socketId,
        deviceType: data.deviceType,
        user: currentUser,
      });
    });

    socket.on('webrtc_call_response', async (data) => {
      if (!data.to?.socketId) return;
      socket.to(data.to.socketId).emit('webrtc_call_response', {
        from: socketId,
        accepted: data.accepted,
      });
      await recordPrivateCall(
        privateCallTracker.respond(data.to.socketId, socketId, data.accepted === true),
      );
    });

    socket.on('webrtc_call_connected', (data) => {
      if (!data.to?.socketId) return;
      privateCallTracker.connected(socketId, data.to.socketId);
    });

    socket.on('webrtc_hangup', async (data) => {
      if (!data.to?.socketId) return;
      socket.to(data.to.socketId).emit('webrtc_hangup', {
        from: socketId,
      });
      await recordPrivateCall(privateCallTracker.finish(socketId, data.to.socketId));
    });

    socket.on('join_group', async (data: { groupId: number }) => {
      if (!currentUser || !data.groupId) return;
      const roomName = `group_${data.groupId}`;

      socket.join(roomName);

      if (!groupRooms.has(data.groupId)) {
        groupRooms.set(data.groupId, new Set());
      }
      groupRooms.get(data.groupId)!.add(socketId);

      const members = Array.from(groupRooms.get(data.groupId)!)
        .map((sid) => userMap.get(sid))
        .filter(Boolean);

      socket.emit('group_members', { groupId: data.groupId, members });
      socket.emit('group_call_state', {
        groupId: data.groupId,
        sessions: await groupSessionService.getGroupState(data.groupId),
      });
      socket.to(roomName).emit('group_member_joined', {
        groupId: data.groupId,
        member: currentUser,
      });
    });

    socket.on('leave_group', (data: { groupId: number }) => {
      const roomName = `group_${data.groupId}`;
      const room = groupRooms.get(data.groupId);

      socket.leave(roomName);
      room?.delete(socketId);

      if (room?.size === 0) {
        groupRooms.delete(data.groupId);
      }

      socket.to(roomName).emit('group_member_left', { socketId, userId: currentUser?.id });
    });

    socket.on('group_message', async (data: { groupId: number; message?: string; messageType?: string; media?: ChatMediaMessage['media']; clientMessageId?: string }, ack?: (result: unknown) => void) => {
      if (!currentUser || !Number.isInteger(data.groupId)) {
        ack?.({ ok: false, error: '消息无效' }); return;
      }

      try {
        const messageContent = await getMessageContent(data, currentUser.id, data.groupId);
        const writeStartedAt = Date.now();
        const member = await GroupMember.findOne({ where: { groupId: data.groupId, userId: currentUser.id } });
        if (!member || member.canSpeak === false) { ack?.({ ok: false, error: '无发送权限' }); return; }
        const { saved: groupMessage, duplicate } = await saveReliableMessage({
          kind: 'group', userId: currentUser.id, targetId: data.groupId,
          message: messageContent, clientMessageId: data.clientMessageId,
        });
        if (messageWriteMs.length < 10_000) messageWriteMs.push(Date.now() - writeStartedAt);

        const payload = {
          ...serializeChatMessage(groupMessage),
          from: socketId,
          groupId: data.groupId,
          userId: currentUser.id,
          time: groupMessage.createdAt?.toLocaleString() || new Date().toLocaleString(),
          createdAt: groupMessage.createdAt,
          user: currentUser,
          sender: currentUser,
        };

        if (!duplicate) socket.to(`group_${data.groupId}`).emit('group_message', payload);
        ack?.({ ok: true, id: groupMessage.id, clientMessageId: data.clientMessageId });
      } catch (error) {
        messageWriteFailures++;
        console.error('save group message failed:', error);
        ack?.({ ok: false, error: '发送失败' });
      }
    });

    socket.on('group_webrtc_offer', (data) => {
      if (data.to) {
        socket.to(data.to).emit('group_webrtc_offer', {
          from: socketId,
          fromUser: currentUser,
          offer: data.offer,
          deviceType: data.deviceType,
          groupId: data.groupId,
        });
      }
    });

    socket.on('group_webrtc_answer', (data) => {
      if (data.to) {
        socket.to(data.to).emit('group_webrtc_answer', {
          from: socketId,
          fromUser: currentUser,
          answer: data.answer,
          deviceType: data.deviceType,
          groupId: data.groupId,
        });
      }
    });

    socket.on('group_webrtc_ice', (data) => {
      if (data.to) {
        socket.to(data.to).emit('group_webrtc_ice', {
          from: socketId,
          fromUser: currentUser,
          candidate: data.candidate,
          deviceType: data.deviceType,
          groupId: data.groupId,
        });
      }
    });

    socket.on('group_call_start', async (data: { groupId: number; deviceType: number }) => {
      if (!currentUser || !data.groupId) return;
      const type = getSessionType(data.deviceType);
      const result = await groupSessionService.start(data.groupId, type, currentUser);
      if (result.created) {
        ownedSessions.set(result.session.channelId, result.session);
        await emitGroupSessionEvent(data.groupId, 'group_call_started', {
          from: socketId,
          ...result.session,
          deviceType: data.deviceType,
          user: currentUser,
        });
      }
      socket.emit('group_call_state', {
        groupId: data.groupId,
        sessions: await groupSessionService.getGroupState(data.groupId),
      });
    });

    socket.on('group_call_end', async (data: { groupId: number; deviceType?: number; type?: GroupSessionType }) => {
      if (!currentUser || !data.groupId) return;
      const types: GroupSessionType[] = data.type
        ? [data.type]
        : data.deviceType
          ? [getSessionType(data.deviceType)]
          : ['video', 'audio', 'screen'];

      for (const type of types) {
        const session = await groupSessionService.get(data.groupId, type);
        const ended = await groupSessionService.end(data.groupId, type, currentUser.id);
        if (!ended || !session) continue;

        ownedSessions.delete(session.channelId);
        if (type === 'screen') {
          await screenAnnotationService.end(session);
          io.to(session.channelId).emit('screen_annotation_clear', {
            groupId: session.groupId,
            startedAt: session.startedAt,
          });
        }
        emitEmptyMediaPresence(session);
        mediaRooms.clear(session.channelId);
        await recordGroupCall(session, currentUser);
        await emitGroupSessionEvent(data.groupId, 'group_call_ended', {
          from: socketId,
          groupId: data.groupId,
          type,
          deviceType: getSessionDeviceType(type),
        });
      }
    });

    socket.on('join_group_call', async (data: { groupId: number; deviceType: number }) => {
      if (!currentUser || !data.groupId) return;
      const type = getSessionType(data.deviceType);
      const session = await groupSessionService.get(data.groupId, type);
      if (!session) {
        socket.emit('group_call_error', { groupId: data.groupId, type, message: '会话不存在或已结束' });
        return;
      }

      socket.join(session.channelId);
      const { alreadyJoined } = mediaRooms.join(
        session.channelId,
        socketId,
        currentUser.id,
      );
      joinedMediaSessions.set(session.channelId, session);

      const members = mediaRooms.getSocketIds(session.channelId)
        .map((sid) => userMap.get(sid))
        .filter(Boolean);

      socket.emit('group_call_members', {
        groupId: data.groupId,
        type,
        channelId: session.channelId,
        members,
      });
      if (type === 'screen') {
        socket.emit('screen_annotation_snapshot', {
          groupId: session.groupId,
          startedAt: session.startedAt,
          actions: await screenAnnotationService.getSnapshot(session),
        });
      }
      if (!alreadyJoined) {
        socket.to(session.channelId).emit('group_call_member_joined', {
          groupId: data.groupId,
          type,
          channelId: session.channelId,
          member: currentUser,
        });
      }
      emitMediaPresence(session);
    });

    socket.on('leave_group_call', async (data: { groupId: number; deviceType: number }) => {
      const type = getSessionType(data.deviceType);
      const session = joinedMediaSessions.get(`group:${data.groupId}:${type}`);
      if (!session) return;

      removeFromMediaRoom(socketId, session, currentUser?.id);
      socket.leave(session.channelId);
      joinedMediaSessions.delete(session.channelId);
    });

    socket.on('screen_annotation_draft', async (data: {
      groupId: number;
      startedAt: string;
      action: AnnotationDraft;
    }) => {
      const session = await groupSessionService.get(data.groupId, 'screen');
      if (
        !currentUser
        || !session
        || session.startedAt !== data.startedAt
      ) return;

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

    socket.on('screen_annotation_complete', async (data: {
      groupId: number;
      startedAt: string;
      action: AnnotationDraft;
    }) => {
      const session = await groupSessionService.get(data.groupId, 'screen');
      if (
        !currentUser
        || !session
        || session.startedAt !== data.startedAt
      ) return;

      try {
        const action: AnnotationAction = {
          ...data.action,
          userId: currentUser.id,
          createdAt: new Date().toISOString(),
        };
        const saved = await screenAnnotationService.complete(session, currentUser.id, action);
        io.to(session.channelId).emit('screen_annotation_complete', {
          groupId: session.groupId,
          startedAt: session.startedAt,
          action: saved,
        });
      } catch (error) {
        socket.emit('screen_annotation_error', {
          message: error instanceof Error ? error.message : '标注失败',
        });
      }
    });

    socket.on('screen_annotation_undo', async (data: {
      groupId: number;
      startedAt: string;
    }) => {
      const session = await groupSessionService.get(data.groupId, 'screen');
      if (!currentUser || !session || session.startedAt !== data.startedAt) return;

      try {
        const actionId = await screenAnnotationService.undo(session, currentUser.id);
        io.to(session.channelId).emit('screen_annotation_undo', {
          groupId: session.groupId,
          startedAt: session.startedAt,
          actionId,
        });
      } catch (error) {
        socket.emit('screen_annotation_error', {
          message: error instanceof Error ? error.message : '撤销标注失败',
        });
      }
    });

    socket.on('screen_annotation_clear', async (data: {
      groupId: number;
      startedAt: string;
    }) => {
      const session = await groupSessionService.get(data.groupId, 'screen');
      if (!currentUser || !session || session.startedAt !== data.startedAt) return;

      try {
        await screenAnnotationService.clear(session, currentUser.id);
        io.to(session.channelId).emit('screen_annotation_clear', {
          groupId: session.groupId,
          startedAt: session.startedAt,
        });
      } catch (error) {
        socket.emit('screen_annotation_error', {
          message: error instanceof Error ? error.message : '清空标注失败',
        });
      }
    });

    socket.on('control_member_mic', (data: { groupId: number; targetSocketId: string; canSpeak: boolean }) => {
      socket.to(data.targetSocketId).emit('mic_permission_changed', {
        groupId: data.groupId,
        canSpeak: data.canSpeak,
      });
    });

    socket.on('toggle_mic', (data: { groupId: number; muted: boolean }) => {
      socket.to(`group_${data.groupId}`).emit('member_mic_changed', {
        socketId,
        muted: data.muted,
      });
    });
  });
};

export default initialMeeting;
