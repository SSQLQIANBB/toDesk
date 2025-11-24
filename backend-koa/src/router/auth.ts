import Router from 'koa-router';
import * as authController from '../controller/authController';
import { authMiddleware } from '../middleware/auth';

const router = new Router({ prefix: '/api/auth' });

// 公开路由
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken); // 刷新 token

// 需要认证的路由
router.get('/me', authMiddleware, authController.getCurrentUser);
router.put('/me', authMiddleware, authController.updateUser);
router.post('/logout', authMiddleware, authController.logout);
router.post('/change-password', authMiddleware, authController.changePassword);
router.get('/users', authMiddleware, authController.getUserList);

export default router;

