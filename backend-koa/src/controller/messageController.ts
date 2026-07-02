import { Context } from 'koa';
import { Op } from 'sequelize';
import { GroupMessage, Message, User } from '../models';

const MESSAGE_CACHE_DAYS = 30;

function getMessageCacheStartDate() {
  return new Date(Date.now() - MESSAGE_CACHE_DAYS * 24 * 60 * 60 * 1000);
}

export async function getOfflineMessages(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;

    const messages = await Message.findAll({
      where: {
        toUserId: userId,
        isRead: false,
        createdAt: { [Op.gte]: getMessageCacheStartDate() },
      },
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
    console.error('get offline messages failed:', error);
    ctx.status = 500;
    ctx.body = { error: `Get offline messages failed: ${error.message}` };
  }
}

export async function markMessagesAsRead(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;
    const { messageIds } = ctx.request.body as any;

    if (!Array.isArray(messageIds)) {
      ctx.status = 400;
      ctx.body = { error: 'messageIds must be an array' };
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

    ctx.body = { message: 'Messages marked as read' };
  } catch (error: any) {
    console.error('mark messages as read failed:', error);
    ctx.status = 500;
    ctx.body = { error: `Mark messages as read failed: ${error.message}` };
  }
}

export async function getUnreadCount(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;

    const count = await Message.count({
      where: {
        toUserId: userId,
        isRead: false,
        createdAt: { [Op.gte]: getMessageCacheStartDate() },
      },
    });

    ctx.body = { count };
  } catch (error: any) {
    console.error('get unread count failed:', error);
    ctx.status = 500;
    ctx.body = { error: `Get unread count failed: ${error.message}` };
  }
}

export async function getPrivateMessages(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;
    const { contactUserId, limit = 50, offset = 0 } = ctx.query;
    const contactId = Number(contactUserId);

    if (!contactId) {
      ctx.status = 400;
      ctx.body = { error: 'contactUserId is required' };
      return;
    }

    const messages = await Message.findAll({
      where: {
        createdAt: { [Op.gte]: getMessageCacheStartDate() },
        [Op.or]: [
          { fromUserId: userId, toUserId: contactId },
          { fromUserId: contactId, toUserId: userId },
        ],
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
      limit: Number(limit),
      offset: Number(offset),
    });

    ctx.body = {
      messages: messages.reverse(),
      hasMore: messages.length === Number(limit),
    };
  } catch (error: any) {
    console.error('get private messages failed:', error);
    ctx.status = 500;
    ctx.body = { error: `Get private messages failed: ${error.message}` };
  }
}

export async function getGroupMessages(ctx: Context) {
  try {
    const { groupId } = ctx.params;
    const { limit = 50, offset = 0, search } = ctx.query;

    const whereClause: any = {
      groupId: Number(groupId),
      createdAt: { [Op.gte]: getMessageCacheStartDate() },
    };

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
      limit: Number(limit),
      offset: Number(offset),
    });

    ctx.body = {
      messages: messages.reverse(),
      hasMore: messages.length === Number(limit),
    };
  } catch (error: any) {
    console.error('get group messages failed:', error);
    ctx.status = 500;
    ctx.body = { error: `Get group messages failed: ${error.message}` };
  }
}

export async function saveGroupMessage(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;
    const { groupId, message, messageType = 'text', fileUrl, fileName, fileSize } = ctx.request.body as any;

    if (!groupId || !message) {
      ctx.status = 400;
      ctx.body = { error: 'groupId and message are required' };
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
      message: 'Message saved',
      data: savedMessage,
    };
  } catch (error: any) {
    console.error('save group message failed:', error);
    ctx.status = 500;
    ctx.body = { error: `Save group message failed: ${error.message}` };
  }
}

export async function searchMessages(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;
    const { keyword, type = 'all', limit = 20 } = ctx.query;

    if (!keyword) {
      ctx.status = 400;
      ctx.body = { error: 'keyword is required' };
      return;
    }

    const results: any = {
      privateMessages: [],
      groupMessages: [],
    };

    if (type === 'all' || type === 'private') {
      results.privateMessages = await Message.findAll({
        where: {
          createdAt: { [Op.gte]: getMessageCacheStartDate() },
          [Op.or]: [{ fromUserId: userId }, { toUserId: userId }],
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
        limit: Number(limit),
      });
    }

    if (type === 'all' || type === 'group') {
      results.groupMessages = await GroupMessage.findAll({
        where: {
          createdAt: { [Op.gte]: getMessageCacheStartDate() },
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
        limit: Number(limit),
      });
    }

    ctx.body = results;
  } catch (error: any) {
    console.error('search messages failed:', error);
    ctx.status = 500;
    ctx.body = { error: `Search messages failed: ${error.message}` };
  }
}
