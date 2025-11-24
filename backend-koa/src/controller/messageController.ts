import { Context } from 'koa';
import { Message, User } from '../models';

/**
 * 获取离线消息
 */
export async function getOfflineMessages(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;

    const messages = await Message.findAll({
      where: { toUserId: userId, isRead: false },
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'username', 'nickname', 'avatar'],
        },
      ],
      order: [['createdAt', 'ASC']],
    });

    ctx.body = { messages };
  } catch (error: any) {
    console.error('获取离线消息失败:', error);
    ctx.status = 500;
    ctx.body = { error: '获取离线消息失败: ' + error.message };
  }
}

/**
 * 标记消息为已读
 */
export async function markMessagesAsRead(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;
    const { messageIds } = ctx.request.body as any;

    if (!messageIds || !Array.isArray(messageIds)) {
      ctx.status = 400;
      ctx.body = { error: 'messageIds必须是数组' };
      return;
    }

    await Message.update(
      { isRead: true },
      {
        where: {
          id: messageIds,
          toUserId: userId,
        },
      }
    );

    ctx.body = { message: '消息已标记为已读' };
  } catch (error: any) {
    console.error('标记消息已读失败:', error);
    ctx.status = 500;
    ctx.body = { error: '标记消息已读失败: ' + error.message };
  }
}

/**
 * 获取未读消息数量
 */
export async function getUnreadCount(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;

    const count = await Message.count({
      where: { toUserId: userId, isRead: false },
    });

    ctx.body = { count };
  } catch (error: any) {
    console.error('获取未读消息数量失败:', error);
    ctx.status = 500;
    ctx.body = { error: '获取未读消息数量失败: ' + error.message };
  }
}

