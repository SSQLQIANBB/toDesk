import { Server } from 'http';
import { Server as SocketServer } from 'socket.io';

export default function initializeSocket(server: Server) {
  const io = new SocketServer(server, {
    path: '/connect',
    cors: {
        origin: "*"
      }
  })

  io.on('connection', (socket) => {
    console.log('socket connect success', socket.id)
    socket.on('join', data => {
      console.log(data)
    })

    socket.on('disconnect', () => {
      console.log('socket disconnect')
    })
  })
}