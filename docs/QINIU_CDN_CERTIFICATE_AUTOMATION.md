# 七牛 Kodo CDN 与 Caddy 证书自动同步操作手册

本文记录 ToDesk 对象存储域名从首次创建到自动续期的完整流程。以后修改域名、
重建空间或更换服务器时，应按顺序执行，不要跳过验证步骤。

## 1. 最终架构

```text
浏览器
  ├─ https://files.sycsq.top         → 七牛 CDN → 公共 Kodo 空间
  └─ https://private-files.sycsq.top → 七牛 CDN → 私有 Kodo 空间

Caddy → AliDNS DNS-01 → Let's Encrypt 自动签发和续期
                       ↓
cert-sync → 上传新证书 → 更新两个七牛 CDN 域名
```

文件流量不会经过 ToDesk 服务器。Caddy 只负责通过 DNS-01 获取证书，
`cert-sync` 只在证书变化时调用七牛 API。

证书签发和续期不产生证书购买费用；七牛对象存储、CDN 流量、回源和请求仍按
七牛计费规则收费。

## 2. 当前生产域名

| 用途 | 域名 | 当前七牛 CDN CNAME |
| --- | --- | --- |
| 公共文件 | `files.sycsq.top` | `files-sycsq-top-idvs1br.qiniudns.com` |
| 私有文件 | `private-files.sycsq.top` | `private-files-sycsq-top-idvs1bs.qiniudns.com` |

删除并重新创建 CDN 域名后，七牛可能生成新的 CNAME。必须以控制台当次显示的值
为准，不能盲目复用上表。

## 3. 配置 AliDNS 最小权限账号

Caddy 需要临时创建和删除 `_acme-challenge` TXT 记录。创建独立 RAM 用户，
不要使用主账号 AccessKey，并绑定以下自定义策略。将 `<阿里云账号ID>` 和域名
替换为实际值：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "alidns:AddDomainRecord",
        "alidns:DeleteDomainRecord",
        "alidns:UpdateDomainRecord",
        "alidns:DescribeDomainRecords",
        "alidns:DescribeDomainRecordInfo",
        "alidns:DescribeSubDomainRecords"
      ],
      "Resource": "acs:alidns:*:<阿里云账号ID>:domain/sycsq.top"
    },
    {
      "Effect": "Allow",
      "Action": "alidns:DescribeDomains",
      "Resource": "*"
    }
  ]
}
```

创建 AccessKey 后立即保存 Secret；Secret 通常只显示一次。不要把密钥发到聊天、
截图、Git 或命令历史中。

## 4. 配置服务器环境变量

编辑 `/opt/todesk/.env.production`：

```dotenv
FILES_DOMAIN=files.sycsq.top
PRIVATE_FILES_DOMAIN=private-files.sycsq.top

ALIYUN_ACCESS_KEY_ID=<AliDNS RAM AccessKey ID>
ALIYUN_ACCESS_KEY_SECRET=<AliDNS RAM AccessKey Secret>

QINIU_ACCESS_KEY=<七牛 AccessKey>
QINIU_SECRET_KEY=<七牛 SecretKey>

CERT_SYNC_INTERVAL_SECONDS=21600
CERT_SYNC_RETRY_SECONDS=300
```

设置文件权限：

```bash
chmod 600 /opt/todesk/.env.production
```

阿里云密钥只用于 DNS-01，七牛密钥只用于上传证书和修改 CDN HTTPS 配置，
二者不能混用。

## 5. Caddy 自动签发证书

仓库的 `Dockerfile.caddy` 构建了带 AliDNS 插件的 Caddy。`Caddyfile` 中的文件
域名不会代理文件，只申请并续期证书：

```caddyfile
{$FILES_DOMAIN}, {$PRIVATE_FILES_DOMAIN} {
    tls {
        dns alidns {
            access_key_id {env.ALIYUN_ACCESS_KEY_ID}
            access_key_secret {env.ALIYUN_ACCESS_KEY_SECRET}
        }
    }

    respond 204
}
```

文件域名的 CNAME 可以一直指向七牛 CDN；DNS-01 不要求域名解析到 Caddy
服务器。

检查签发日志：

```bash
cd /opt/todesk
docker compose --env-file .env.production -f docker-compose.prod.yml \
  logs --tail=200 caddy
```

检查 Caddy 证书：

```bash
docker exec todesk-caddy find /data/caddy/certificates -type f \
  \( -name 'files.sycsq.top.crt' -o -name 'private-files.sycsq.top.crt' \)
```

## 6. 首次上传自有证书

首次创建 CDN 域名前，七牛还没有可选择的证书，需要先手动上传一次。以后由
`cert-sync` 自动更换。

在服务器导出两组证书和私钥：

```bash
cd /opt/todesk
mkdir -p cert-export
chmod 700 cert-export

CADDY_DATA="$(
  docker volume inspect todesk_caddy-data --format '{{ .Mountpoint }}'
)"

for domain in files.sycsq.top private-files.sycsq.top; do
  source_dir="$(
    find "$CADDY_DATA/caddy/certificates" -type d -path "*/$domain" \
      -print -quit
  )"
  test -n "$source_dir"
  install -m 600 "$source_dir/$domain.crt" "cert-export/$domain.crt"
  install -m 600 "$source_dir/$domain.key" "cert-export/$domain.key"

  cert_pub="$(
    openssl x509 -in "cert-export/$domain.crt" -pubkey -noout |
      openssl pkey -pubin -outform DER 2>/dev/null |
      sha256sum | cut -d' ' -f1
  )"
  key_pub="$(
    openssl pkey -in "cert-export/$domain.key" -pubout -outform DER 2>/dev/null |
      sha256sum | cut -d' ' -f1
  )"
  test "$cert_pub" = "$key_pub"
  echo "$domain: MATCH"
done

ls -l cert-export
```

通过阿里云 Workbench 左侧“文件管理”进入 `/opt/todesk/cert-export`，逐个下载
四个文件。不要展示或截图 `.key` 内容。

在七牛控制台进入“SSL 证书服务 → 上传自有证书”，分别上传：

- `files.sycsq.top.crt` 与 `files.sycsq.top.key`
- `private-files.sycsq.top.crt` 与 `private-files.sycsq.top.key`

证书内容必须是完整 PEM 证书链，私钥必须是未加密 PEM。

## 7. 创建 CDN 加速域名

分别进入公共空间和私有空间：

1. 打开“域名管理”。
2. 在“自定义 CDN 加速域名”中点击“绑定域名”。
3. 公共空间填写 `files.sycsq.top`，私有空间填写
   `private-files.sycsq.top`。
4. 源站选择对应的七牛 Kodo 空间。
5. 协议选择 HTTPS，并选择第 6 节上传的同名证书。
6. 缓存选择“自定义 → 使用推荐配置”。
7. 缓存参数选择“保留所有参数”。私有 URL 的 `e` 和 `token` 不能被忽略。
8. 私有空间确认已启用七牛私有空间要求的回源鉴权。

同一个域名不要长期同时作为源站域名和 CDN 域名。迁移期间可以临时保留源站
绑定用于回退，验证 CDN 后应解绑旧源站域名。

## 8. 完成域名所有权验证

七牛可能要求添加 TXT：

```text
记录类型：TXT
主机记录：verification
记录值：以七牛当次页面显示的 verify_... 为准
TTL：600
```

如果阿里云中已经存在 `verification`，直接修改旧值，不要新增多条不同值。保存后
等待 TTL，再点击七牛“验证”。可以在服务器检查：

```bash
dig TXT verification.sycsq.top +short
```

不要切换到文件验证，除非确实把七牛提供的验证文件部署到了根域名网站。

## 9. 切换 CDN CNAME

域名创建成功后，复制七牛当次生成的 CDN CNAME。在阿里云 DNS 中修改原 CNAME，
不要新增同名记录：

```text
files         CNAME  files-sycsq-top-idvs1br.qiniudns.com
private-files CNAME  private-files-sycsq-top-idvs1bs.qiniudns.com
```

检查权威 DNS：

```bash
dig CNAME files.sycsq.top +short
dig CNAME private-files.sycsq.top +short
```

确认 CDN 正常后，可解绑 Kodo 页面下方的同名“自定义源站域名”。只保留上方
“自定义 CDN 加速域名”。

## 10. 验证公共和私有文件

上传同名健康检查文件到两个空间，例如内容：

```text
ToDesk CDN health check
```

公共文件连续请求两次：

```bash
curl -i https://files.sycsq.top/qiniu-cdn-healthcheck.txt
curl -i https://files.sycsq.top/qiniu-cdn-healthcheck.txt
```

应先看到 `X-Cache-Status: MISS`，再看到 `X-Cache-Status: HIT` 和 `Age`。

私有文件必须使用后端或七牛工具生成的临时签名 URL：

```text
https://private-files.sycsq.top/<key>?e=<deadline>&token=<downloadToken>
```

有效签名应返回 `200`；去掉 `e` 和 `token` 后必须返回 `401` 或 `403`。必须在
文件已经进入 CDN 缓存后再次验证无签名访问，确认缓存不会绕过鉴权。

## 11. 自动同步工作方式

生产 Compose 中的 `cert-sync` 服务：

- 只读挂载 Caddy 的 `caddy-data` 卷。
- 每 6 小时检查两个域名的证书。
- 校验证书域名、证书与私钥是否匹配，并确保剩余有效期不少于 30 天。
- 使用证书 SHA-256 指纹判断是否发生续期。
- 新证书先上传七牛，再更新 CDN HTTPS 配置。
- 保留原有强制 HTTPS、HTTP/2 和 TLS 版本配置。
- API 失败时不会更换线上证书；5 分钟后重试。
- 状态保存在 `cert-sync-state` 卷，避免重复上传同一证书。

七牛 CDN 配置更新通常需要 5 至 10 分钟。同步服务不会自动删除旧证书，避免误删
仍被其他域名使用的证书；可定期在七牛证书管理中手动删除确认未绑定的旧证书。

## 12. 部署和检查自动同步

代码推送后，GitHub Actions 会构建并传输 `todesk-cert-sync` 镜像。部署前必须先
把七牛 AK/SK 写入服务器 `.env.production`，否则工作流会主动失败，避免出现
“看似部署成功但证书没有续期”的状态。

查看服务：

```bash
cd /opt/todesk
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker logs --tail=200 todesk-cert-sync
docker inspect --format '{{ .State.Health.Status }}' todesk-cert-sync
```

只验证本地证书，不调用七牛 API：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm --no-deps cert-sync --once --dry-run
```

让同步服务立即重新检查一次：

```bash
docker restart todesk-cert-sync
docker logs -f todesk-cert-sync
```

成功日志应包含两个域名、证书指纹、七牛证书 ID，以及
`requested Qiniu CDN certificate update`。下一个检查周期会确认七牛域名已经使用
该证书，并把状态改为 `deployed`。

## 13. 故障排查

### Caddy 没有签发证书

```bash
docker logs --tail=300 todesk-caddy
dig TXT _acme-challenge.files.sycsq.top +short
dig TXT _acme-challenge.private-files.sycsq.top +short
```

检查 AliDNS RAM 权限、AK/SK、服务器时间和 443/80 安全组配置。DNS-01 本身不
要求文件域名指向服务器。

### 同步容器不健康

```bash
docker inspect --format '{{ json .State.Health }}' todesk-cert-sync
docker logs --tail=300 todesk-cert-sync
```

常见原因：

- 七牛 AK/SK 错误或无权管理 CDN。
- CDN 域名不存在或尚未创建完成。
- Caddy 证书不足 30 天且续期失败。
- 证书链不完整或证书与私钥不匹配。
- 服务器 UTC 时间偏差过大导致七牛 API 鉴权失败。

### 七牛证书已经上传但域名仍显示旧证书

七牛配置异步下发通常需要 5 至 10 分钟。先检查同步日志和 CDN 域名操作状态，
不要反复上传证书。超过 10 分钟仍失败时，再重启同步容器触发重试。

### 重建同步状态

删除 `cert-sync-state` 会导致当前 Caddy 证书重新上传一次，通常没有必要。不要在
日常部署中执行 `docker compose down -v`，该命令还会删除 Caddy 证书和其他业务
数据卷。

## 14. 定期维护

每月至少检查一次：

1. `todesk-caddy` 和 `todesk-cert-sync` 均为运行且健康状态。
2. 两个线上域名证书的到期时间一致且已延长。
3. 公共文件第二次访问命中 CDN。
4. 私有文件无签名访问仍返回 `401/403`。
5. 七牛中没有大量未绑定的历史证书。
6. 阿里云和七牛密钥未出现在 Git、日志或聊天记录中。

轮换任一密钥后，更新 `/opt/todesk/.env.production` 并重新创建对应容器：

```bash
cd /opt/todesk
docker compose --env-file .env.production -f docker-compose.prod.yml \
  up -d --force-recreate caddy cert-sync
```
