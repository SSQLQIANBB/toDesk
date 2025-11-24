import Router from 'koa-router';
import * as messageController from '../controller/messageController';
import { authMiddleware } from '../middleware/auth';

const router = new Router({ prefix: '/api/messages' });

// 所有路由都需要认证
router.get('/offline', authMiddleware, messageController.getOfflineMessages);
router.post('/mark-read', authMiddleware, messageController.markMessagesAsRead);
router.get('/unread-count', authMiddleware, messageController.getUnreadCount);

export default router;