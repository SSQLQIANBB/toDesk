import { type Server } from 'http';
import { Server as Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt';
import { GroupMessage, Message, User as UserModel } from '../models';

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

  io.on('connection', (socket) => {
    const socketId = socket.id;
    let currentUser: MeetingUser | null = null;

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

    socket.on('disconnect', () => {
      userMap.delete(socketId);
      socketToUserMap.delete(socketId);

      groupRooms.forEach((members, groupId) => {
        if (members.delete(socketId)) {
          socket.to(`group_${groupId}`).emit('group_member_left', { socketId, userId: currentUser?.id });
        }
      });

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

    socket.on('join_group', (data: { groupId: number }) => {
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
          answer: data.answer,
        });
      }
    });

    socket.on('group_webrtc_ice', (data) => {
      if (data.to) {
        socket.to(data.to).emit('group_webrtc_ice', {
          from: socketId,
          candidate: data.candidate,
        });
      }
    });

    socket.on('group_call_start', (data: { groupId: number; deviceType: number }) => {
      socket.to(`group_${data.groupId}`).emit('group_call_started', {
        from: socketId,
        groupId: data.groupId,
        deviceType: data.deviceType,
        user: currentUser,
      });
    });

    socket.on('group_call_end', (data: { groupId: number }) => {
      socket.to(`group_${data.groupId}`).emit('group_call_ended', {
        from: socketId,
        groupId: data.groupId,
      });
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
