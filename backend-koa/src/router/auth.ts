import Router from 'koa-router';
import * as authController from '../controller/authController';
import * as emailController from '../controller/authEmailController';
import { authMiddleware } from '../middleware/auth';

const router = new Router({ prefix: '/api/auth' });

// 公开路由
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken); // 刷新 token
router.post('/email-code/register', emailController.sendRegistrationCode);
router.post('/email-code/reset', emailController.sendResetCode);
router.post('/reset-password', emailController.resetPassword);

// 需要认证的路由
router.get('/me', authMiddleware, authController.getCurrentUser);
router.put('/me', authMiddleware, authController.updateUser);
router.post('/logout', authMiddleware, authController.logout);
router.post('/change-password', authMiddleware, authController.changePassword);
router.get('/email', authMiddleware, emailController.getEmailStatus);
router.post('/email-code/bind', authMiddleware, emailController.sendBindCode);
router.post('/email-code/change-password', authMiddleware, emailController.sendPasswordChangeCode);
router.post('/bind-email', authMiddleware, emailController.bindEmail);
router.get('/users', authMiddleware, authController.getUserList);

export default router;

