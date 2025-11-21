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
  })
}

export default initialMeeting;