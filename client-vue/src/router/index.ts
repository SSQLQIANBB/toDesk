import { createWebHistory, createRouter } from 'vue-router';

const routes = [
  {
    name: 'Chat',
    path: '/chat',
    component: () => import('@/views/chat.vue')
  },
  {
    name: 'Socket',
    path: '/socket',
    component: () => import('@/views/socket.vue')
  },
  {
    name: 'Share',
    path: '/share',
    component: () => import('@/views/share.vue')
  },
  {
    name: 'Remote',
    path: '/remote',
    component: () => import('@/views/remoteShare/index.vue')
  }
]

export default createRouter({
  routes,
  history: createWebHistory(),
})