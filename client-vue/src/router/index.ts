import { createWebHistory, createRouter } from 'vue-router';
import { useAuth } from '@/stores/auth';
import {
  getAuthRedirect,
  resolvePostLoginPath,
} from '@/services/authNavigation';
import { getCurrentUser } from '@/api/auth';

const routes = [
  {
    name: 'Login',
    path: '/login',
    component: () => import('@/views/login.vue'),
    meta: { requiresAuth: false }
  },
  {
    name: 'Remote',
    path: '/remote',
    component: () => import('@/views/remoteShare/index.vue'),
    meta: { requiresAuth: true }
  },
  {
    name: 'Profile',
    path: '/profile',
    component: () => import('@/views/profile.vue'),
    meta: { requiresAuth: true }
  },
  {
    name: 'Groups',
    path: '/groups',
    component: () => import('@/views/groups.vue'),
    meta: { requiresAuth: true }
  },
  {
    name: 'GroupChat',
    path: '/group-chat/:id',
    component: () => import('@/views/groupChat.vue'),
    meta: { requiresAuth: true }
  },
  {
    name: 'GroupVideo',
    path: '/group-video/:id',
    component: () => import('@/views/groupVideo.vue'),
    meta: { requiresAuth: true }
  },
  {
    name: 'GroupScreen',
    path: '/group-screen/:id',
    component: () => import('@/views/groupScreen.vue'),
    meta: { requiresAuth: true }
  },
  //#region 测试功能路由
  {
    name: 'Chat',
    path: '/chat',
    component: () => import('@/views/chat.vue'),
    meta: { requiresAuth: false }
  },
  {
    name: 'Socket',
    path: '/socket',
    component: () => import('@/views/socket.vue'),
    meta: { requiresAuth: false }
  },
  {
    name: 'Share',
    path: '/share',
    component: () => import('@/views/share.vue'),
    meta: { requiresAuth: false }
  },
  //#endregion 测试功能路由
  {
    path: '/',
    redirect: '/login'
  }
]

const router = createRouter({
  routes,
  history: createWebHistory(),
});

// 路由守卫
router.beforeEach(async (to, _from, next) => {
  const { isAuthenticated, token, currentUser, clearAuthLocal, restoreUser } = useAuth();
  
  // 如果有token但没有用户信息，尝试恢复用户信息
  if (token.value && !currentUser.value && to.path !== '/login') {
    try {
      const { user } = await getCurrentUser({ skipAuthRedirect: true });
      restoreUser(user);
    } catch (error) {
      console.error('恢复用户信息失败:', error);
      clearAuthLocal();
      const redirect = getAuthRedirect(to.fullPath);
      next({
        name: 'Login',
        query: redirect ? { redirect } : {},
      });
      return;
    }
  }
  
  // 需要认证的路由
  if (to.meta.requiresAuth && !isAuthenticated.value) {
    const redirect = getAuthRedirect(to.fullPath);
    next({
      name: 'Login',
      query: redirect ? { redirect } : {},
    });
  } else if (to.path === '/login' && isAuthenticated.value) {
    next(resolvePostLoginPath(to.query.redirect));
  } else {
    next();
  }
});

export default router;
