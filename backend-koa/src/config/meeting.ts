import { type Server } from 'http';
import { Server as Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt';
import { GroupMessage, Message, User as UserModel } from '../models';
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

type PresenceStatus = 'online' | 'offline' | 'busy';

type MeetingUser = {
  id: number;
  socketId: string;
  username: string;
  nickname?: string;
  avatar?: string;
  status: PresenceStatus;
};

const userMap = new Map<string, MeetingUser>();
const socketToUserMap = new Map<string, number>();
const groupRooms = new Map<number, Set<string>>();
const mediaRooms = new MediaRoomRegistry();
const groupSessionService = new GroupSessionService(new RedisGroupSessionStore());
const screenAnnotationService = new ScreenAnnotationService(new RedisScreenAnnotationStore());

function getSessionType(deviceType: number): GroupSessionType {
  return deviceType === 2 ? 'screen' : 'video';
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

  function emitUserList() {
    io.emit('user_list', getPublicUsers());
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
        const dbUser = await UserModel.findByPk(payload.userId);
        const status = (dbUser?.status || 'online') as PresenceStatus;

        currentUser = {
          id: payload.userId,
          socketId,
          username: payload.username,
          nickname: data.nickname || dbUser?.nickname || payload.username,
          avatar: data.avatar || dbUser?.avatar,
          status,
        };

        userMap.set(socketId, currentUser);
        socketToUserMap.set(socketId, payload.userId);

        socket.emit('authenticated', currentUser);
        emitUserList();
      } catch (error) {
        socket.emit('auth_error', { message: 'Authentication failed' });
        console.error('meeting authentication failed:', error);
      }
    });

    socket.on('status_update', async (data: { status: PresenceStatus }) => {
      if (!currentUser || !['online', 'offline', 'busy'].includes(data.status)) return;

      currentUser.status = data.status;
      userMap.set(socketId, currentUser);
      await UserModel.update({ status: data.status }, { where: { id: currentUser.id } });
      emitUserList();
    });

    socket.on('disconnect', async () => {
      userMap.delete(socketId);
      socketToUserMap.delete(socketId);

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
          io.to(`group_${session.groupId}`).emit('group_call_ended', {
            from: socketId,
            groupId: session.groupId,
            type: session.type,
            deviceType: session.type === 'screen' ? 2 : 1,
          });
        }
      }

      emitUserList();
    });

    socket.on('private_message', async (data: { to?: MeetingUser; message?: string }) => {
      if (!currentUser || !data.to?.id || !data.message?.trim()) return;

      try {
        const receiverSockets = getUserSockets(data.to.id);
        const savedMessage = await Message.create({
          fromUserId: currentUser.id,
          toUserId: data.to.id,
          message: data.message,
          isRead: receiverSockets.length > 0,
        });

        const payload = {
          id: savedMessage.id,
          from: socketId,
          fromUserId: currentUser.id,
          toUserId: data.to.id,
          message: data.message,
          time: savedMessage.createdAt?.toLocaleString() || new Date().toLocaleString(),
          createdAt: savedMessage.createdAt,
          sender: currentUser,
        };

        receiverSockets.forEach((targetSocketId) => {
          socket.to(targetSocketId).emit('private_message', payload);
        });
      } catch (error) {
        console.error('save private message failed:', error);
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
      if (data.to?.socketId) {
        socket.to(data.to.socketId).emit('webrtc_call_request', {
          from: socketId,
          deviceType: data.deviceType,
        });
      }
    });

    socket.on('webrtc_call_response', (data) => {
      if (data.to?.socketId) {
        socket.to(data.to.socketId).emit('webrtc_call_response', {
          from: socketId,
          accepted: data.accepted,
        });
      }
    });

    socket.on('webrtc_hangup', (data) => {
      if (data.to?.socketId) {
        socket.to(data.to.socketId).emit('webrtc_hangup', {
          from: socketId,
        });
      }
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

    socket.on('group_message', async (data: { groupId: number; message?: string }) => {
      if (!currentUser || !data.groupId || !data.message?.trim()) return;

      try {
        const groupMessage = await GroupMessage.create({
          groupId: data.groupId,
          userId: currentUser.id,
          message: data.message,
        });

        const payload = {
          id: groupMessage.id,
          from: socketId,
          groupId: data.groupId,
          userId: currentUser.id,
          message: data.message,
          time: groupMessage.createdAt?.toLocaleString() || new Date().toLocaleString(),
          createdAt: groupMessage.createdAt,
          user: currentUser,
          sender: currentUser,
        };

        socket.to(`group_${data.groupId}`).emit('group_message', payload);
      } catch (error) {
        console.error('save group message failed:', error);
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
        io.to(`group_${data.groupId}`).emit('group_call_started', {
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
          : ['video', 'screen'];

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
        io.to(`group_${data.groupId}`).emit('group_call_ended', {
          from: socketId,
          groupId: data.groupId,
          type,
          deviceType: type === 'screen' ? 2 : 1,
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
