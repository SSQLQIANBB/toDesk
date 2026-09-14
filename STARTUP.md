# 本地启动指南

项目由 Vue / Vite 前端、Koa 后端、MySQL 和 Redis 组成。日常开发优先连接本机已有的 MySQL 和 Redis，以免误连到空的容器数据库。

## 安装依赖

需要 Node.js 22 和 pnpm 10.14.0。在仓库根目录运行：

```bash
pnpm install --frozen-lockfile
```

## 启动本地 MySQL 和 Redis

先检查服务及端口；当前后端默认连接 MySQL `127.0.0.1:3306`、Redis `127.0.0.1:6379`：

```bash
lsof -nP -iTCP:3306 -sTCP:LISTEN
lsof -nP -iTCP:6379 -sTCP:LISTEN
```

如果使用 Homebrew 安装，可按安装时的服务名启动：

```bash
brew services start mysql
brew services start redis
```

如果使用 `/usr/local/mysql` 安装的 MySQL，可用安装包自带脚本启动：

```bash
sudo /usr/local/mysql/support-files/mysql.server start
```

确认连接到存放原数据的实例，别仅凭端口判断。用交互式密码登录，并检查数据库：

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p
```

```sql
SHOW DATABASES;
USE todesk;
SELECT COUNT(*) FROM users;
```

Redis 检查：

```bash
redis-cli -h 127.0.0.1 -p 6379 ping
```

应返回 `PONG`。如果本机安装方式不同，请使用该安装方式提供的启动命令。不要初始化或覆盖已有 MySQL 数据目录。

## 启动后端

在新的终端从仓库根目录运行，按实际实例设置连接参数：

```bash
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_NAME=todesk
export DB_USER=root
read -s 'DB_PASSWORD?请输入本地 MySQL 密码：'
export DB_PASSWORD
export REDIS_HOST=127.0.0.1
export REDIS_PORT=6379
pnpm run server
```

`read -s` 适用于 macOS 默认的 zsh；其他 shell 可运行 `read -s DB_PASSWORD`。后端不会自动加载 `.env.production`。如本地数据库或 Redis 使用不同端口，请修改对应环境变量。`DB_AUTO_CREATE` 和 `DB_SYNC_ALTER` 默认关闭，连接旧库时不要随意启用。

本地邮件配置可写在 `backend-koa/.env.local`（该文件被 Git 忽略）。使用 Node.js 22 启动 `pnpm run server` 时，后端开发脚本会自动加载此文件；例如填写 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASSWORD` 和 `SMTP_FROM`。授权码只保存在本机，文件权限建议为 `600`。已有环境变量优先于文件中的同名值。

后端默认监听 `http://localhost:3000`。

## 启动前端

再打开一个终端，在仓库根目录运行：

```bash
pnpm run client
```

浏览器打开 `http://localhost:5173/`。Vite 将 `/api`、`/meeting` 和 `/uploads` 代理到后端的 3000 端口。修改后端端口时，还需修改 `client-vue/vite.config.ts` 的代理目标。

## 检查与停止

```bash
curl -I http://localhost:5173/
curl -i http://localhost:3000/api/auth/me
```

前端应返回 200；未登录时 `/api/auth/me` 返回 401 是正常的。前后端在各自终端按 `Ctrl+C` 停止。本地 MySQL 和 Redis 由各自的服务管理器停止。

如果登录后看不到原有用户数据，请先核对 `DB_HOST`、`DB_PORT`、`DB_NAME`，再核对 MySQL 数据目录和登录账号；切换到 Docker 的新数据库通常会看到空表。生产部署另见 [DEPLOYMENT.md](./DEPLOYMENT.md)。
