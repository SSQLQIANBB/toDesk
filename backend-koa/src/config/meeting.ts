import { type Server } from "http";
import { Server as Socket } from "socket.io";
import { v4 as uuidv4 } from 'uuid';
import { verifyToken } from '../utils/jwt';
import { Message } from '../models';

type User = {
  id: number; // 数据库用户ID
  socketId: string;
  username: string;
  nickname?: string;
  avatar?: string;
}

const userMap = new Map<User['socketId'], User>();
const socketToUserMap = new Map<string, number>(); // socketId -> userId映射

// 群组通话房间
const groupRooms = new Map<number, Set<string>>(); // groupId -> Set<socketId>
const initialMeeting = (server: Server) => {
  const io = new Socket(server, {
    path: '/meeting',
    cors: {
      origin: '*'
    }
  })

  io.on('connection', (socket) => {
    console.log('meeting-connection:', socket.id)

    const socketId = socket.id;
    let currentUser: User | null = null;

    // 认证连接
    socket.on('authenticate', (data: { token: string; nickname?: string; avatar?: string }) => {
      try {
        const payload = verifyToken(data.token);
        
        currentUser = {
          id: payload.userId,
          socketId,
          username: payload.username,
          nickname: data.nickname || payload.username,
          avatar: data.avatar,
        };

        userMap.set(socketId, currentUser);
        socketToUserMap.set(socketId, payload.userId);

        // 当前登录用户信息
        socket.emit('authenticated', currentUser);

        // 通知当前所有登录用户
        io.emit('user_list', [...userMap.values()]);

        console.log('用户已认证:', currentUser.username);
      } catch (error) {
        socket.emit('auth_error', { message: '认证失败' });
        console.error('认证失败:', error);
      }
    });

    // disconnect
    socket.on('disconnect', () => {
      userMap.delete(socketId);
      socketToUserMap.delete(socketId);
      
      // 从所有群组房间中移除
      groupRooms.forEach((members, groupId) => {
        if (members.has(socketId)) {
          members.delete(socketId);
          // 通知群组其他成员
          socket.to(`group_${groupId}`).emit('group_member_left', { socketId });
        }
      });

      const userList = [...userMap.values()];
      console.log('online-user:', userList);
      io.emit('user_list', userList);
    })

    // private message
    socket.on('private_message', async (data) => {
      console.log('private_message', data)
      
      const fromUser = currentUser;
      const toSocketId = data.to?.socketId;
      const toUserId = socketToUserMap.get(toSocketId);
      
      if (toSocketId && userMap.has(toSocketId)) {
        // 接收者在线，直接发送
        socket.to(toSocketId).emit('private_message', {
          from: socket.id,
          message: data.message,
          time: new Date().toLocaleString()
        })
      } else if (fromUser && toUserId) {
        // 接收者离线，保存到数据库
        try {
          await Message.create({
            fromUserId: fromUser.id,
            toUserId: toUserId,
            message: data.message,
            isRead: false,
          });
          console.log('离线消息已保存');
        } catch (error) {
          console.error('保存离线消息失败:', error);
        }
      }
    })

    // WebRTC信令转发 - offer
    socket.on('webrtc_offer', (data) => {
      console.log('webrtc_offer:', socket.id, '->', data.to?.socketId)
      if (data.to?.socketId) {
        socket.to(data.to.socketId).emit('webrtc_offer', {
          from: socket.id,
          offer: data.offer,
          deviceType: data.deviceType
        })
      }
    })

    // WebRTC信令转发 - answer
    socket.on('webrtc_answer', (data) => {
      console.log('webrtc_answer:', socket.id, '->', data.to?.socketId)
      if (data.to?.socketId) {
        socket.to(data.to.socketId).emit('webrtc_answer', {
          from: socket.id,
          answer: data.answer
        })
      }
    })

    // WebRTC信令转发 - ice candidate
    socket.on('webrtc_ice', (data) => {
      console.log('webrtc_ice:', socket.id, '->', data.to?.socketId)
      if (data.to?.socketId) {
        socket.to(data.to.socketId).emit('webrtc_ice', {
          from: socket.id,
          candidate: data.candidate
        })
      }
    })

    // WebRTC呼叫请求
    socket.on('webrtc_call_request', (data) => {
      console.log('webrtc_call_request:', socket.id, '->', data.to?.socketId)
      if (data.to?.socketId) {
        socket.to(data.to.socketId).emit('webrtc_call_request', {
          from: socket.id,
          deviceType: data.deviceType
        })
      }
    })

    // WebRTC呼叫响应
    socket.on('webrtc_call_response', (data) => {
      console.log('webrtc_call_response:', socket.id, '->', data.to?.socketId)
      if (data.to?.socketId) {
        socket.to(data.to.socketId).emit('webrtc_call_response', {
          from: socket.id,
          accepted: data.accepted
        })
      }
    })

    // WebRTC挂断
    socket.on('webrtc_hangup', (data) => {
      console.log('webrtc_hangup:', socket.id, '->', data.to?.socketId)
      if (data.to?.socketId) {
        socket.to(data.to.socketId).emit('webrtc_hangup', {
          from: socket.id
        })
      }
    })

    // ========== 群组功能 ==========

    // 加入群组房间
    socket.on('join_group', (data: { groupId: number }) => {
      const { groupId } = data;
      const roomName = `group_${groupId}`;
      
      socket.join(roomName);
      
      if (!groupRooms.has(groupId)) {
        groupRooms.set(groupId, new Set());
      }
      groupRooms.get(groupId)!.add(socketId);

      // 获取房间内的其他成员
      const members = Array.from(groupRooms.get(groupId)!).map(sid => userMap.get(sid)).filter(Boolean);
      
      // 通知当前用户房间内的所有成员
      socket.emit('group_members', { groupId, members });
      
      // 通知其他成员有新成员加入
      socket.to(roomName).emit('group_member_joined', { 
        groupId, 
        member: currentUser 
      });

      console.log(`用户 ${socketId} 加入群组 ${groupId}`);
    });

    // 离开群组房间
    socket.on('leave_group', (data: { groupId: number }) => {
      const { groupId } = data;
      const roomName = `group_${groupId}`;
      
      socket.leave(roomName);
      
      const room = groupRooms.get(groupId);
      if (room) {
        room.delete(socketId);
        if (room.size === 0) {
          groupRooms.delete(groupId);
        }
      }

      // 通知其他成员
      socket.to(roomName).emit('group_member_left', { socketId });

      console.log(`用户 ${socketId} 离开群组 ${groupId}`);
    });

    // 群组消息
    socket.on('group_message', (data) => {
      console.log('group_message', data);
      const roomName = `group_${data.groupId}`;
      
      socket.to(roomName).emit('group_message', {
        from: socketId,
        groupId: data.groupId,
        message: data.message,
        time: new Date().toLocaleString(),
        user: currentUser,
      });
    });

    // ========== 群组WebRTC ==========

    // 群组视频/屏幕共享 - offer
    socket.on('group_webrtc_offer', (data) => {
      console.log('group_webrtc_offer:', socketId, '->', data.to);
      if (data.to) {
        socket.to(data.to).emit('group_webrtc_offer', {
          from: socketId,
          offer: data.offer,
          deviceType: data.deviceType,
          groupId: data.groupId,
        });
      }
    });

    // 群组视频/屏幕共享 - answer
    socket.on('group_webrtc_answer', (data) => {
      console.log('group_webrtc_answer:', socketId, '->', data.to);
      if (data.to) {
        socket.to(data.to).emit('group_webrtc_answer', {
          from: socketId,
          answer: data.answer,
        });
      }
    });

    // 群组视频/屏幕共享 - ice candidate
    socket.on('group_webrtc_ice', (data) => {
      if (data.to) {
        socket.to(data.to).emit('group_webrtc_ice', {
          from: socketId,
          candidate: data.candidate,
        });
      }
    });

    // 群组视频/屏幕共享开始通知
    socket.on('group_call_start', (data: { groupId: number; deviceType: number }) => {
      const roomName = `group_${data.groupId}`;
      socket.to(roomName).emit('group_call_started', {
        from: socketId,
        groupId: data.groupId,
        deviceType: data.deviceType,
        user: currentUser,
      });
      console.log(`群组${data.groupId}通话开始，发起人: ${socketId}`);
    });

    // 群组通话结束
    socket.on('group_call_end', (data: { groupId: number }) => {
      const roomName = `group_${data.groupId}`;
      socket.to(roomName).emit('group_call_ended', {
        from: socketId,
        groupId: data.groupId,
      });
      console.log(`群组${data.groupId}通话结束，发起人: ${socketId}`);
    });

    // 控制成员麦克风权限
    socket.on('control_member_mic', (data: { groupId: number; targetSocketId: string; canSpeak: boolean }) => {
      socket.to(data.targetSocketId).emit('mic_permission_changed', {
        groupId: data.groupId,
        canSpeak: data.canSpeak,
      });
      console.log(`群组${data.groupId}麦克风权限控制: ${data.targetSocketId} -> ${data.canSpeak}`);
    });

    // 切换麦克风状态
    socket.on('toggle_mic', (data: { groupId: number; muted: boolean }) => {
      const roomName = `group_${data.groupId}`;
      socket.to(roomName).emit('member_mic_changed', {
        socketId,
        muted: data.muted,
      });
    });
  })
}

export default initialMeeting;