import { Context } from 'koa';
import { File, User, Group } from '../models';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

// 文件上传目录
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// 确保上传目录存在
async function ensureUploadDir() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * 上传文件
 */
export async function uploadFile(ctx: Context) {
  try {
    await ensureUploadDir();

    const userId = ctx.state.user?.userId;
    const { groupId } = ctx.request.body as any;
    const file = ctx.request.files?.file;

    if (!file || Array.isArray(file)) {
      ctx.status = 400;
      ctx.body = { error: '请选择一个文件' };
      return;
    }

    // 生成唯一文件名
    const ext = path.extname(file.originalFilename || '');
    const fileName = `${uuidv4()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, fileName);
    const fileUrl = `/uploads/${fileName}`;

    // 移动文件
    await fs.rename(file.filepath, filePath);

    // 保存文件记录
    const fileRecord = await File.create({
      userId,
      groupId: groupId ? parseInt(groupId) : undefined,
      fileName,
      originalName: file.originalFilename || fileName,
      fileSize: file.size,
      mimeType: file.mimetype || 'application/octet-stream',
      filePath,
      fileUrl,
    });

    ctx.body = {
      message: '文件上传成功',
      file: {
        id: fileRecord.id,
        originalName: fileRecord.originalName,
        fileSize: fileRecord.fileSize,
        mimeType: fileRecord.mimeType,
        fileUrl: fileRecord.fileUrl,
        createdAt: fileRecord.createdAt,
      },
    };
  } catch (error: any) {
    console.error('文件上传失败:', error);
    ctx.status = 500;
    ctx.body = { error: '文件上传失败: ' + error.message };
  }
}

/**
 * 获取文件列表
 */
export async function getFiles(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;
    const { groupId, limit = 50, offset = 0 } = ctx.query;

    const whereClause: any = {};
    
    if (groupId) {
      whereClause.groupId = parseInt(groupId as string);
    } else {
      whereClause.userId = userId;
    }

    const files = await File.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'username', 'nickname', 'avatar'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    ctx.body = {
      files,
      hasMore: files.length === parseInt(limit as string),
    };
  } catch (error: any) {
    console.error('获取文件列表失败:', error);
    ctx.status = 500;
    ctx.body = { error: '获取文件列表失败: ' + error.message };
  }
}

/**
 * 下载文件
 */
export async function downloadFile(ctx: Context) {
  try {
    const { fileId } = ctx.params;

    const file = await File.findByPk(parseInt(fileId));
    if (!file) {
      ctx.status = 404;
      ctx.body = { error: '文件不存在' };
      return;
    }

    // 更新下载次数
    await file.update({ downloadCount: file.downloadCount + 1 });

    // 检查文件是否存在
    try {
      await fs.access(file.filePath);
    } catch {
      ctx.status = 404;
      ctx.body = { error: '文件已被删除' };
      return;
    }

    // 设置响应头
    ctx.set('Content-Type', file.mimeType);
    ctx.set('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    ctx.set('Content-Length', file.fileSize.toString());

    // 读取并返回文件
    ctx.body = await fs.readFile(file.filePath);
  } catch (error: any) {
    console.error('下载文件失败:', error);
    ctx.status = 500;
    ctx.body = { error: '下载文件失败: ' + error.message };
  }
}

/**
 * 删除文件
 */
export async function deleteFile(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;
    const { fileId } = ctx.params;

    const file = await File.findByPk(parseInt(fileId));
    if (!file) {
      ctx.status = 404;
      ctx.body = { error: '文件不存在' };
      return;
    }

    // 检查权限
    if (file.userId !== userId) {
      ctx.status = 403;
      ctx.body = { error: '无权删除此文件' };
      return;
    }

    // 删除物理文件
    try {
      await fs.unlink(file.filePath);
    } catch (error) {
      console.error('删除物理文件失败:', error);
    }

    // 删除数据库记录
    await file.destroy();

    ctx.body = { message: '文件删除成功' };
  } catch (error: any) {
    console.error('删除文件失败:', error);
    ctx.status = 500;
    ctx.body = { error: '删除文件失败: ' + error.message };
  }
}

