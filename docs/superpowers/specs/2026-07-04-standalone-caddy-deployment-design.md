# ToDesk 独立部署与 Caddy HTTPS 设计

## 目标

将 ToDesk 部署到一台全新服务器，不迁移旧服务器数据，也不再依赖 bill
项目。MySQL 和 Redis 作为服务器级共享基础设施独立运行，供 ToDesk 与未来
项目复用。现有域名将解析到新服务器，并由 Caddy 自动申请和续期公网可信的
HTTPS 证书。

## 总体架构

生产环境拆成两个生命周期独立的 Docker Compose 栈。

服务器级共享基础设施栈：

- `mysql`：共享 MySQL 8.4，不向公网暴露端口；每个项目使用独立数据库和账号。
- `redis`：共享 Redis 7.4，不向公网暴露端口；每个项目使用独立 Redis DB。
- `shared-services`：供各业务后端加入的外部 Docker 网络。

ToDesk 应用栈：

- `caddy`：唯一公网入口，监听 80 和 443，完成 HTTPS、HTTP 跳转及反向代理。
- `web`：现有 Vue 静态站点和内部 Nginx，只在 Docker 内部监听 80。
- `backend`：现有 Koa、HTTP API 和 Socket.IO 服务，只在 Docker 内部监听 3000。

请求链路为：

```text
域名 -> Caddy:443 -> web:80 -> backend:3000
                                      |
                         shared-services 网络
                                      |
                              MySQL / Redis
```

`web` 中现有 Nginx 继续处理 Vue History 路由，并将 `/api/`、`/meeting`
和 `/connect` 转发给后端。Caddy 将所有流量转发给 `web`，不重复维护这些
路径规则。

## Compose 修改

新增的 `docker-compose.infrastructure.yml` 将：

1. 管理带健康检查的共享 `mysql` 和 `redis` 服务。
2. 创建名称固定为 `shared-services` 的 Docker 网络。
3. 使用 `shared-mysql-data` 和 `shared-redis-data` 数据卷。
4. 为服务设置稳定的网络别名 `shared-mysql` 和 `shared-redis`。

`docker-compose.prod.yml` 将：

1. 删除外部 `bill-network` 及 `BILL_DOCKER_NETWORK`。
2. 让 `backend` 同时加入 `todesk-internal` 和外部 `shared-services`。
3. 保留 `todesk-uploads` 数据卷。
4. 新增 `caddy-data` 和 `caddy-config` 数据卷。
5. 取消 `web` 的 `8080:80` 映射，改为只在内部暴露 80。
6. 新增 `caddy` 服务，并仅由它映射宿主机 80 和 443。

MySQL、Redis 和后端端口不得暴露到公网。

## Caddy 与 HTTPS

仓库新增 `Caddyfile`：

```caddyfile
{$DOMAIN} {
    reverse_proxy web:80
}
```

生产环境通过 `DOMAIN` 指定不含协议的完整域名。Caddy 的 `/data` 和
`/config` 目录使用命名卷持久化，以保留证书、私钥和续期状态。

Caddy 仅管理自己通过 ACME 获取的证书；不复制旧服务器的手工证书。申请与
续期要求域名解析到新服务器，且公网 80、443 端口始终可达。

## 环境变量与密钥

`.env.production.example` 仅保留变量名和无敏感信息的示例值，新增：

- `DOMAIN`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `REDIS_PASSWORD`
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`

共享基础设施另提供 `.env.infrastructure.example`，包含 MySQL root 密码、
首个数据库和账号、Redis 密码；变量名不绑定具体业务。后端使用网络别名
`shared-mysql` 和 `shared-redis` 连接共享容器。Redis 服务启用密码，ToDesk
固定使用单独的 `REDIS_DB`，未来项目必须选择其他 DB 编号。

共享服务可以减少每个项目各运行一套数据库进程带来的内存和镜像占用，但也
会扩大故障影响范围。因此共享栈独立发布、独立备份，业务项目不得控制其
启停，也不得共用 MySQL 数据库或账号。

当前被 Git 跟踪的 `.env.production` 含有效密钥。实施时将：

1. 从 Git 索引中移除该文件，但保留开发者本地副本。
2. 在 `.gitignore` 中忽略 `.env.production`。
3. 要求新服务器生成全新的数据库密码、Redis 密码和 JWT 密钥。

旧密钥视为已泄露，不在新服务器复用。

## CI/CD

共享基础设施由服务器管理员首次部署到 `/opt/shared-services`，不由 ToDesk
的日常 CI/CD 启停。现有 GitHub Actions 继续构建并推送后端与 Web 镜像到
Docker Hub，同时将相同镜像导出压缩，通过 SSH 上传到服务器。服务器使用
`docker load` 导入，不直接从 Docker Hub 或 ACR 拉取应用镜像。部署前要求
`/opt/todesk/.env.production` 已存在，并检查 `shared-services` 网络可用。

部署流程使用生产 Compose 拉取镜像并启动 ToDesk。健康检查从旧的
`127.0.0.1:8080` 改为对配置域名执行 HTTPS 请求。GitHub 仓库中的
`SERVER_HOST` 更新为新服务器 IP；服务器登录凭据同步更新。

## 域名切换步骤

1. 新服务器安装 Docker，开放 22、80、443。
2. 在 `/opt/shared-services` 创建基础设施环境文件并启动共享 MySQL/Redis。
3. 为 ToDesk 创建 `/opt/todesk/.env.production`。
4. 更新 GitHub Actions 的新服务器连接信息。
5. 将域名的 A 记录改为新服务器公网 IP。
6. 若新服务器没有 IPv6，删除仍指向旧服务器的 AAAA 记录。
7. 触发部署，等待 Caddy 获得证书。
8. 验证首页、登录注册、API、Socket.IO、文件上传以及 HTTPS。
9. 验证完成后关闭旧服务器。

DNS 切换期间旧服务器可继续运行，以降低解析缓存造成的中断。

## 数据与恢复

这是全新部署，不迁移旧 MySQL、Redis 或上传文件。共享 MySQL、Redis 使用
基础设施栈命名卷；上传文件和 Caddy 证书使用 ToDesk 栈命名卷。容器升级和
重建不得删除这些卷。

生产备份至少应覆盖共享 MySQL 数据卷和 `todesk-uploads`。Redis 主要承载
缓存、在线状态和刷新令牌，不作为唯一业务数据来源。

## 错误处理

- 共享 MySQL 或 Redis 不可用时，后端启动失败并输出连接错误。
- Caddy 申请证书失败时保持运行并重试，排查重点为 DNS、80/443、防火墙和
  Caddy 数据目录权限。
- 后端健康检查失败时，CI 输出 Compose 状态与相关服务日志后失败。
- DNS 尚未生效时不得删除旧服务器。

## 验证标准

- 基础设施 Compose 显示 MySQL、Redis 健康，ToDesk Compose 显示三个服务
  正常运行。
- `https://<DOMAIN>` 返回站点，HTTP 自动跳转 HTTPS。
- 浏览器显示受信任证书，无安全警告。
- 注册、登录、刷新令牌、私聊和群聊正常。
- `/meeting` 与 `/connect` 的 WebSocket 连接正常。
- 上传文件在后端容器重建后仍存在。
- Compose 配置和仓库中不再出现 `bill-network` 或
  `BILL_DOCKER_NETWORK`。
- ToDesk 仅能访问自己的 MySQL 数据库，并使用约定的独立 Redis DB。

## 暂不包含

本次不部署 TURN 服务。现有公共 STUN 配置保留；在严格 NAT 网络中 WebRTC
仍可能失败，Coturn 可作为后续独立改进。
