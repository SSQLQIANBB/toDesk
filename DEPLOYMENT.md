# ToDesk 新服务器部署

本方案将服务拆成两个独立部分：

- 服务器级共享基础设施：MySQL、Redis 和 `shared-services` Docker 网络。
- ToDesk 应用：Caddy、Web、后端、上传文件和 HTTPS 证书。

共享 MySQL/Redis 可以减少每个项目重复运行数据库进程和保存镜像带来的内存、
磁盘占用。代价是维护或故障会同时影响多个项目，因此基础设施必须独立部署、
备份，不能跟随某个业务项目一起删除。

## 1. 准备服务器

安装 Docker Engine 和 Docker Compose 插件，并在云平台安全组及服务器防火墙
开放：

- `22/tcp`：SSH。
- `80/tcp`：Caddy 申请证书及 HTTP 跳转。
- `443/tcp`：HTTPS。

不要向公网开放 MySQL 3306、Redis 6379 或后端 3000。

## 2. 部署共享 MySQL 和 Redis

在服务器创建独立目录：

```bash
sudo mkdir -p /opt/shared-services
cd /opt/shared-services
```

将仓库中的 `docker-compose.infrastructure.yml` 和
`.env.infrastructure.example` 上传到该目录，然后创建真实环境文件：

```bash
cp .env.infrastructure.example .env.infrastructure
chmod 600 .env.infrastructure
```

生成三个不同的随机密码：

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

编辑 `/opt/shared-services/.env.infrastructure`：

```dotenv
MYSQL_ROOT_PASSWORD=<第一个随机密码>
INITIAL_DB_NAME=todesk
INITIAL_DB_USER=todesk
INITIAL_DB_PASSWORD=<第二个随机密码>
REDIS_PASSWORD=<第三个随机密码>
```

启动并检查：

```bash
docker compose \
  --env-file .env.infrastructure \
  -f docker-compose.infrastructure.yml \
  up -d

docker compose \
  --env-file .env.infrastructure \
  -f docker-compose.infrastructure.yml \
  ps

docker network inspect shared-services
```

MySQL 和 Redis 应显示为 `healthy`。这套 Compose 只在首次安装、升级或维护基础
设施时操作，不应加入 ToDesk 的日常发布流程。

## 3. 配置 ToDesk

创建应用目录：

```bash
sudo mkdir -p /opt/todesk
cd /opt/todesk
```

创建 `/opt/todesk/.env.production` 并限制权限：

```bash
touch .env.production
chmod 600 .env.production
```

填写以下内容：

```dotenv
NODE_ENV=production
PORT=3000

DOMAIN=desk.example.com
SHARED_SERVICES_NETWORK=shared-services

DB_HOST=shared-mysql
DB_PORT=3306
DB_NAME=todesk
DB_USER=todesk
DB_PASSWORD=<与 INITIAL_DB_PASSWORD 相同>
DB_AUTO_CREATE=false
DB_SYNC_ALTER=false
DB_LOGGING=false

REDIS_HOST=shared-redis
REDIS_PORT=6379
REDIS_PASSWORD=<与共享 Redis 密码相同>
REDIS_DB=1

JWT_SECRET=<新的随机密钥>
REFRESH_TOKEN_SECRET=<另一个新的随机密钥>
```

`DOMAIN` 只填写域名，不要添加 `http://`、`https://` 或路径。

JWT 密钥可使用以下命令分别生成：

```bash
openssl rand -hex 32
```

不要复用仓库历史中出现过的数据库、Redis 或 JWT 密钥。

## 4. 配置 GitHub Actions

在 GitHub 仓库的 Actions secrets 中更新：

- `SERVER_HOST`：新服务器公网 IP。
- `SERVER_USER`：专用 SSH 部署用户。
- `SERVER_SSH_KEY`：专用部署用户的 SSH 私钥。
- `SERVER_SSH_FINGERPRINT`：服务器 SSH ED25519 主机密钥指纹。
- `DOCKERHUB_USERNAME`：Docker Hub 用户名。
- `DOCKERHUB_TOKEN`：Docker Hub 访问令牌。

工作流会将应用镜像推送到 Docker Hub，同时把相同镜像导出并通过 SSH 上传到
服务器。服务器使用 `docker load` 导入镜像后启动 ToDesk，不需要直接访问
Docker Hub 或 ACR。它只检查共享 MySQL/Redis 是否可访问，不会启停共享
基础设施。

## 5. 切换域名并启用 HTTPS

在域名 DNS 控制台：

1. 将目标域名的 `A` 记录改为新服务器公网 IPv4。
2. 如果新服务器没有 IPv6，删除仍指向旧服务器的 `AAAA` 记录。
3. 等待 DNS 查询返回新 IP。

检查：

```bash
dig +short desk.example.com
```

DNS 生效后触发 GitHub Actions，或在服务器手动启动：

```bash
cd /opt/todesk
docker compose \
  --env-file .env.production \
  -f docker-compose.prod.yml \
  up -d
```

Caddy 会自动申请受浏览器信任的证书、将 HTTP 跳转到 HTTPS，并在到期前自动
续期。证书存放在 `caddy-data` 卷中，不要删除该卷。

查看状态和日志：

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.prod.yml \
  ps

docker compose \
  --env-file .env.production \
  -f docker-compose.prod.yml \
  logs -f caddy backend

curl -I https://desk.example.com
```

确认 HTTPS、注册登录、聊天、Socket.IO 和文件上传正常后，再关闭旧服务器。

## 6. 让未来项目复用 MySQL 和 Redis

未来项目的后端容器只需加入外部网络：

```yaml
services:
  backend:
    networks:
      - app-internal
      - shared-services

networks:
  app-internal:
    driver: bridge
  shared-services:
    external: true
    name: shared-services
```

连接地址固定为：

```dotenv
DB_HOST=shared-mysql
DB_PORT=3306
REDIS_HOST=shared-redis
REDIS_PORT=6379
```

每个新项目必须：

1. 创建独立的 MySQL 数据库。
2. 创建独立 MySQL 用户，并且只授权该数据库。
3. 使用不同的 Redis DB 编号；ToDesk 已使用 DB 1。
4. 不映射数据库端口到宿主机公网。

创建新项目数据库和用户时，进入共享 MySQL：

```bash
cd /opt/shared-services
docker compose \
  --env-file .env.infrastructure \
  -f docker-compose.infrastructure.yml \
  exec mysql mysql -uroot -p
```

然后执行，其中名称和密码替换为新项目自己的值：

```sql
CREATE DATABASE new_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'new_app'@'%' IDENTIFIED BY 'new-random-password';
GRANT ALL PRIVILEGES ON new_app.* TO 'new_app'@'%';
FLUSH PRIVILEGES;
```

Redis DB 是逻辑隔离，共享同一个 Redis 密码、内存限制和故障域。不要在业务
项目中执行 `FLUSHALL`。安全隔离要求较高的项目应使用独立 Redis 实例。

## 7. 数据卷与备份

不要执行会删除卷的命令，例如：

```text
docker compose down -v
```

需要重点备份：

- 共享 MySQL 数据。
- `todesk-uploads` 上传文件。
- `/opt/shared-services/.env.infrastructure`。
- `/opt/todesk/.env.production`。

Caddy 证书可自动重新申请，但保留 `caddy-data` 可以避免无意义的重复申请和
证书签发频率限制。
