import { type Server } from "http";
import { Server as Socket } from "socket.io";
import { v4 as uuidv4 } from 'uuid';

type User = {
  id: string;
  socketId: string;
  // name: string
}

const userMap = new Map<User['socketId'], User>();
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

    const user = {
      id: socketId,
      socketId,
    }

    // 当前登录用户信息
    socket.emit('connected', user);

    userMap.set(socketId, user);
    // 通知当前所有登录用户
    io.emit('user_list', [...userMap.values()])

    // disconnect
    socket.on('disconnect', () => {
      userMap.delete(socketId)
      const userList = [...userMap.values()]
      console.log('online-user:', userList)
      io.emit('user_list', userList)
    })

    // private message
    socket.on('private_message', (data) => {
      console.log('private_message', data)
      if (data.to?.socketId) {
        socket.to(data.to?.socketId).emit('private_message', {
          from: socket.id,
          message: data.message,
          time: new Date().toLocaleString()
        })
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
  })
}

export default initialMeeting;