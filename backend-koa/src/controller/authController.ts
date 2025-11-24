import { Context } from 'koa';
import { User } from '../models';
import { hashPassword, verifyPassword } from '../utils/crypto';
import { generateTokenPair, verifyRefreshToken } from '../utils/jwt';
import redisService from '../services/redisService';

/**
 * 用户注册
 */
export async function register(ctx: Context) {
  try {
    const { username, password, nickname, email, phone } = ctx.request.body as any;

    // 验证必填字段
    if (!username || !password) {
      ctx.status = 400;
      ctx.body = { error: '用户名和密码不能为空' };
      return;
    }

    // 检查用户名是否已存在
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      ctx.status = 400;
      ctx.body = { error: '用户名已存在' };
      return;
    }

    // 创建用户
    const hashedPassword = hashPassword(password);
    const user = await User.create({
      username,
      password: hashedPassword,
      nickname: nickname || username,
      email,
      phone,
    });

    // 生成 token 对
    const tokens = generateTokenPair({
      userId: user.id!,
      username,
    });

    // 保存 refresh token 到 Redis
    await redisService.setRefreshToken(user.id!, tokens.refreshToken);

    ctx.body = {
      message: '注册成功',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        username: username,
        nickname: nickname || username,
        avatar: null,
        email: email || null,
        phone: phone || null,
      },
    };
  } catch (error: any) {
    console.error('注册失败:', error);
    ctx.status = 500;
    ctx.body = { error: '注册失败: ' + error.message };
  }
}

/**
 * 用户登录
 */
export async function login(ctx: Context) {
  try {
    const { username, password } = ctx.request.body as any;

    // 验证必填字段
    if (!username || !password) {
      ctx.status = 400;
      ctx.body = { error: '用户名和密码不能为空' };
      return;
    }

    // 查找用户
    const user = await User.findOne({ where: { username } });
    if (!user) {
      ctx.status = 401;
      ctx.body = { error: '用户名或密码错误' };
      return;
    }

    // 验证密码（使用 get() 获取普通对象）
    const userData = user.get({ plain: true });
    if (!verifyPassword(password, userData.password)) {
      ctx.status = 401;
      ctx.body = { error: '用户名或密码错误' };
      return;
    }

    // 更新最后登录时间和在线状态
    await user.update({ lastLoginAt: new Date(), status: 'online' });

    // 生成 token 对
    const tokens = generateTokenPair({
      userId: userData.id!,
      username: userData.username,
    });

    // 保存 refresh token 到 Redis
    await redisService.setRefreshToken(userData.id!, tokens.refreshToken);

    ctx.body = {
      message: '登录成功',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: userData.id,
        username: userData.username,
        nickname: userData.nickname,
        avatar: userData.avatar,
        email: user.email,
        phone: user.phone,
        status: user.status,
      },
    };
  } catch (error: any) {
    console.error('登录失败:', error);
    ctx.status = 500;
    ctx.body = { error: '登录失败: ' + error.message };
  }
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;
    
    // 先尝试从Redis获取
    let userData = await redisService.getUserInfo(userId);
    
    if (!userData) {
      // Redis中没有，从数据库获取
      const user = await User.findByPk(userId);
      if (!user) {
        ctx.status = 404;
        ctx.body = { error: '用户不存在' };
        return;
      }

      userData = user.get({ plain: true });
      
      // 缓存到Redis
      await redisService.setUserInfo(userId, {
        id: userData.id,
        username: userData.username,
        nickname: userData.nickname,
        avatar: userData.avatar,
        email: userData.email,
        phone: userData.phone,
        status: userData.status,
      });
    }

    ctx.body = {
      user: {
        id: userData.id,
        username: userData.username,
        nickname: userData.nickname,
        avatar: userData.avatar,
        email: userData.email,
        phone: userData.phone,
        status: userData.status,
      },
    };
  } catch (error: any) {
    console.error('获取用户信息失败:', error);
    ctx.status = 500;
    ctx.body = { error: '获取用户信息失败: ' + error.message };
  }
}

/**
 * 更新用户信息
 */
export async function updateUser(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;
    const { nickname, email, phone, avatar, bio, status } = ctx.request.body as any;

    const user = await User.findByPk(userId);
    if (!user) {
      ctx.status = 404;
      ctx.body = { error: '用户不存在' };
      return;
    }

    // 更新用户信息
    const updateData: any = {};
    if (nickname !== undefined) updateData.nickname = nickname;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (bio !== undefined) updateData.bio = bio;
    if (status !== undefined) updateData.status = status;

    await user.update(updateData);

    const userData = user.get({ plain: true });
    
    // 更新Redis缓存
    await redisService.setUserInfo(userId, {
      id: userData.id,
      username: userData.username,
      nickname: userData.nickname,
      avatar: userData.avatar,
      email: userData.email,
      phone: userData.phone,
      bio: userData.bio,
      status: userData.status,
    });

    ctx.body = {
      message: '更新成功',
      user: {
        id: userData.id,
        username: userData.username,
        nickname: userData.nickname,
        avatar: userData.avatar,
        email: userData.email,
        phone: userData.phone,
        bio: userData.bio,
        status: userData.status,
      },
    };
  } catch (error: any) {
    console.error('更新用户信息失败:', error);
    ctx.status = 500;
    ctx.body = { error: '更新用户信息失败: ' + error.message };
  }
}

/**
 * 获取用户列表
 */
export async function getUserList(ctx: Context) {
  try {
    const users = await User.findAll({
      attributes: ['id', 'username', 'nickname', 'avatar', 'status'],
    });

    ctx.body = { users };
  } catch (error: any) {
    console.error('获取用户列表失败:', error);
    ctx.status = 500;
    ctx.body = { error: '获取用户列表失败: ' + error.message };
  }
}

/**
 * 用户登出
 */
export async function logout(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;

    const user = await User.findByPk(userId);
    if (user) {
      await user.update({ status: 'offline' });
    }

    // 更新Redis中的用户状态
    await redisService.setUserStatus(userId, 'offline');
    
    // 删除用户Socket映射
    await redisService.delUserSocket(userId);

    // 删除 refresh token
    await redisService.delRefreshToken(userId);

    ctx.body = {
      message: '登出成功',
    };
  } catch (error: any) {
    console.error('登出失败:', error);
    ctx.status = 500;
    ctx.body = { error: '登出失败: ' + error.message };
  }
}

/**
 * 刷新 access token
 */
export async function refreshToken(ctx: Context) {
  try {
    const { refreshToken: clientRefreshToken } = ctx.request.body as any;

    if (!clientRefreshToken) {
      ctx.status = 400;
      ctx.body = { error: 'refresh token 不能为空' };
      return;
    }

    // 验证 refresh token
    let payload;
    try {
      payload = verifyRefreshToken(clientRefreshToken);
    } catch (error) {
      ctx.status = 401;
      ctx.body = { error: 'refresh token 无效或已过期' };
      return;
    }

    // 验证 refresh token 是否在 Redis 中存在且匹配
    const isValid = await redisService.verifyRefreshToken(payload.userId, clientRefreshToken);
    if (!isValid) {
      ctx.status = 401;
      ctx.body = { error: 'refresh token 已失效' };
      return;
    }

    // 生成新的 token 对
    const tokens = generateTokenPair({
      userId: payload.userId,
      username: payload.username,
    });

    // 更新 Redis 中的 refresh token
    await redisService.setRefreshToken(payload.userId, tokens.refreshToken);

    ctx.body = {
      message: 'token 刷新成功',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  } catch (error: any) {
    console.error('刷新 token 失败:', error);
    ctx.status = 500;
    ctx.body = { error: '刷新 token 失败: ' + error.message };
  }
}

/**
 * 修改密码
 */
export async function changePassword(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;
    const { oldPassword, newPassword } = ctx.request.body as any;

    if (!oldPassword || !newPassword) {
      ctx.status = 400;
      ctx.body = { error: '旧密码和新密码不能为空' };
      return;
    }

    const user = await User.findByPk(userId);
    if (!user) {
      ctx.status = 404;
      ctx.body = { error: '用户不存在' };
      return;
    }

    // 验证旧密码
    if (!verifyPassword(oldPassword, user.password)) {
      ctx.status = 401;
      ctx.body = { error: '旧密码错误' };
      return;
    }

    // 更新密码
    const hashedPassword = hashPassword(newPassword);
    await user.update({ password: hashedPassword });

    ctx.body = {
      message: '密码修改成功',
    };
  } catch (error: any) {
    console.error('修改密码失败:', error);
    ctx.status = 500;
    ctx.body = { error: '修改密码失败: ' + error.message };
  }
}

