import { Context } from 'koa';
import { Message, GroupMessage, User } from '../models';
import { Op } from 'sequelize';

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

/**
 * 获取私聊历史消息
 */
export async function getPrivateMessages(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;
    const { contactUserId, limit = 50, offset = 0 } = ctx.query;

    if (!contactUserId) {
      ctx.status = 400;
      ctx.body = { error: '缺少contactUserId参数' };
      return;
    }

    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { fromUserId: userId, toUserId: parseInt(contactUserId as string) },
          { fromUserId: parseInt(contactUserId as string), toUserId: userId },
        ],
      },
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'username', 'nickname', 'avatar'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    ctx.body = {
      messages: messages.reverse(), // 反转顺序，从旧到新
      hasMore: messages.length === parseInt(limit as string),
    };
  } catch (error: any) {
    console.error('获取私聊历史消息失败:', error);
    ctx.status = 500;
    ctx.body = { error: '获取私聊历史消息失败: ' + error.message };
  }
}

/**
 * 获取群组历史消息
 */
export async function getGroupMessages(ctx: Context) {
  try {
    const { groupId } = ctx.params;
    const { limit = 50, offset = 0, search } = ctx.query;

    const whereClause: any = { groupId: parseInt(groupId) };
    
    // 搜索功能
    if (search) {
      whereClause.message = {
        [Op.like]: `%${search}%`,
      };
    }

    const messages = await GroupMessage.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'username', 'nickname', 'avatar'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    ctx.body = {
      messages: messages.reverse(), // 反转顺序，从旧到新
      hasMore: messages.length === parseInt(limit as string),
    };
  } catch (error: any) {
    console.error('获取群组历史消息失败:', error);
    ctx.status = 500;
    ctx.body = { error: '获取群组历史消息失败: ' + error.message };
  }
}

/**
 * 保存群组消息
 */
export async function saveGroupMessage(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;
    const { groupId, message, messageType = 'text', fileUrl, fileName, fileSize } = ctx.request.body as any;

    if (!groupId || !message) {
      ctx.status = 400;
      ctx.body = { error: '缺少必要参数' };
      return;
    }

    const groupMessage = await GroupMessage.create({
      groupId,
      userId,
      message,
      messageType,
      fileUrl,
      fileName,
      fileSize,
    });

    const savedMessage = await GroupMessage.findByPk(groupMessage.id, {
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'username', 'nickname', 'avatar'],
        },
      ],
    });

    ctx.body = {
      message: '消息保存成功',
      data: savedMessage,
    };
  } catch (error: any) {
    console.error('保存群组消息失败:', error);
    ctx.status = 500;
    ctx.body = { error: '保存群组消息失败: ' + error.message };
  }
}

/**
 * 搜索消息
 */
export async function searchMessages(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;
    const { keyword, type = 'all', limit = 20 } = ctx.query;

    if (!keyword) {
      ctx.status = 400;
      ctx.body = { error: '缺少搜索关键词' };
      return;
    }

    const results: any = {
      privateMessages: [],
      groupMessages: [],
    };

    // 搜索私聊消息
    if (type === 'all' || type === 'private') {
      const privateMessages = await Message.findAll({
        where: {
          [Op.or]: [
            { fromUserId: userId },
            { toUserId: userId },
          ],
          message: {
            [Op.like]: `%${keyword}%`,
          },
        },
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'username', 'nickname', 'avatar'],
          },
          {
            model: User,
            as: 'receiver',
            attributes: ['id', 'username', 'nickname', 'avatar'],
          },
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit as string),
      });
      results.privateMessages = privateMessages;
    }

    // 搜索群组消息
    if (type === 'all' || type === 'group') {
      const groupMessages = await GroupMessage.findAll({
        where: {
          message: {
            [Op.like]: `%${keyword}%`,
          },
        },
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'username', 'nickname', 'avatar'],
          },
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit as string),
      });
      results.groupMessages = groupMessages;
    }

    ctx.body = results;
  } catch (error: any) {
    console.error('搜索消息失败:', error);
    ctx.status = 500;
    ctx.body = { error: '搜索消息失败: ' + error.message };
  }
}

