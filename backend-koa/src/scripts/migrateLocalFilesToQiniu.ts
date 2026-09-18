import fs from 'fs/promises'
import path from 'path'
import { Op, type Transaction } from 'sequelize'
import sequelize, { initDatabase } from '../config/database'
import { File, Group, GroupMessage, Message, User } from '../models'
import {
  createStorageReference,
  qiniuStorage,
  type QiniuStorageScope
} from '../services/qiniuStorageService'

const legacyUploadDirectory = path.join(process.cwd(), 'uploads')

async function replaceMessageUrl(
  model: any,
  oldUrl: string,
  storageRef: string,
  transaction: Transaction
) {
  const rows = await model.findAll({
    where: { message: { [Op.like]: `%${oldUrl}%` } } as any,
    transaction
  })

  for (const row of rows) {
    await row.update(
      { message: row.message.split(oldUrl).join(storageRef) },
      { transaction }
    )
  }
}

async function migrateFile(file: File) {
  const legacyUrl = file.fileUrl
  const localFile = path.join(legacyUploadDirectory, path.basename(file.fileName))
  await fs.access(localFile)

  const publicKey = `legacy/avatar/${path.basename(file.fileName)}`
  const publicUrl = qiniuStorage.resolveUrl(createStorageReference('public', publicKey))
  const [userAvatarCount, groupAvatarCount] = await Promise.all([
    User.count({ where: { avatar: { [Op.in]: [legacyUrl, publicUrl] } } }),
    Group.count({ where: { avatar: { [Op.in]: [legacyUrl, publicUrl] } } })
  ])
  const scope: QiniuStorageScope = userAvatarCount + groupAvatarCount > 0 ? 'public' : 'private'
  const key = scope === 'public'
    ? publicKey
    : `legacy/file/${path.basename(file.fileName)}`
  const uploaded = await qiniuStorage.uploadFile(
    localFile,
    key,
    scope,
    file.mimeType,
    file.fileSize
  )

  await sequelize.transaction(async (transaction) => {
    if (scope === 'public') {
      await Promise.all([
        User.update({ avatar: uploaded.fileUrl }, { where: { avatar: legacyUrl }, transaction }),
        Group.update({ avatar: uploaded.fileUrl }, { where: { avatar: legacyUrl }, transaction })
      ])
    }

    await Promise.all([
      replaceMessageUrl(Message, legacyUrl, uploaded.storageRef, transaction),
      replaceMessageUrl(GroupMessage, legacyUrl, uploaded.storageRef, transaction),
      GroupMessage.update(
        { fileUrl: uploaded.storageRef },
        { where: { fileUrl: legacyUrl }, transaction }
      )
    ])

    await file.update(
      { filePath: uploaded.key, fileUrl: uploaded.storageRef },
      { transaction }
    )
  })
}

async function main() {
  await initDatabase()
  const files = await File.findAll({
    where: { fileUrl: { [Op.like]: '/uploads/%' } },
    order: [['id', 'ASC']]
  })

  let migrated = 0
  let missing = 0
  for (const file of files) {
    try {
      await migrateFile(file)
      migrated++
      console.log(`✓ 已迁移文件 #${file.id}: ${file.originalName}`)
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        missing++
        console.warn(`- 跳过缺失文件 #${file.id}: ${file.originalName}`)
        continue
      }
      throw error
    }
  }

  console.log(`七牛迁移完成：成功 ${migrated}，本地缺失 ${missing}，待处理 ${files.length}`)
}

main()
  .catch((error) => {
    console.error('七牛迁移失败:', error)
    process.exitCode = 1
  })
  .finally(() => sequelize.close())
