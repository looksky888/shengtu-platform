<h1 align="center">ChatGPT2API</h1>



## shengtu 4.5 版本说明

本目录为 **shengtu 4.5** 发布版源码（基于 4.3 稳定基线，版本标记 `4.5-20261017-security-remediation`）。

- 优化与安全修复见上级 `CHANGELOG.md` 与仓库根 `OPTIMIZATION_CHECKLIST.md`。
- 运维要点（重启、健康检查、CORS、发布包）：见 `docs/SHENGTU_3X_OPS.md`。
- **干净部署 / 净包 / 测试隔离**：见 `docs/CLEAN_DEPLOY.md`。
- 号池模式 vs 中转站：设置页 `image_provider` = `account_pool` / `proxy_api`。
- 默认角色仅创作台+图片库；积分扣费见设置「积分成本」。
- Compose 默认仅监听 `127.0.0.1:3004`，镜像标签 `shengtu:4.5-20261017-security-remediation`。
- 图片媒体支持服务器本地或 Cloudflare R2；R2 模式使用 SQL 媒体索引、私有桶临时地址和持久化上传重试。
- Grok 默认生图模型 `grok-imagine-image` 使用 Basic/Lite 通道；质量模型使用新版 Imagine WebSocket 原生批次和兼容事件收集器。
- 共享 429 不再触发账号轮换或重放；只有明确的 `usage_limit_reached` 才在请求内换号。

<p align="center">
  ChatGPT2API 是一个面向自托管场景的 ChatGPT 官网能力封装服务，提供 OpenAI 兼容图片 API、在线创作台、账号池调度、图片库、日志治理、RBAC 权限管理和 Docker 部署能力。
</p>

> [!WARNING]
> 本项目涉及对 ChatGPT 官网文本生成、图片生成、图片编辑等接口的逆向研究，仅供个人学习、技术研究与非商业性技术交流使用。
>
> - 严禁用于商业用途、盈利性使用、批量操作、自动化滥用、规模化调用、倒卖服务或恶意竞争。
> - 严禁用于违反 OpenAI 服务条款、当地法律法规或平台规则的行为。
> - 严禁用于生成、传播或协助生成违法、暴力、色情、未成年人相关内容，以及诈骗、欺诈、骚扰等非法或不当用途。
> - 使用者需自行承担账号受限、临时封禁、永久封禁、数据损失和法律责任等全部风险。
> - 使用本项目即表示你已理解并同意本声明；因滥用、违规或违法使用造成的后果均由使用者自行承担。

> [!CAUTION]
> 公网部署时请务必添加外部访问控制，不要暴露敏感配置、账号 Token、数据库连接串或管理端入口。旧版本可能存在已知漏洞，请尽快升级到最新版本。

## 目录

- [项目能力](#项目能力)
- [快速部署](#快速部署)
- [升级与在线更新](#升级与在线更新)
- [配置说明](#配置说明)
- [本地开发](#本地开发)
- [发布流程](#发布流程)
- [API 接入](#api-接入)
- [截图](#截图)
- [规划与状态](#规划与状态)
- [社区与鸣谢](#社区与鸣谢)

## 项目能力

### 后端服务

- Go 单体服务，容器内启动 `/app/chatgpt2api`。
- 前端构建产物嵌入 Go 二进制，由 Go 服务直接托管。
- 支持 Docker / Docker Compose 部署。
- 支持 SQLite、JSON 文件和 PostgreSQL 存储后端。
- 支持全局 HTTP / HTTPS / SOCKS5 / SOCKS5H 代理。
- 支持 DockerHub 默认版本检查，以及非 Docker Release 构建的在线更新和回滚。

### 管理端

- React 19 + Vite 管理端。
- 登录页、创作台、号池管理、图片库、用户管理、角色权限、日志管理和设置页。
- 本地账号密码登录，不再把部署密钥当作后台登录密钥。
- 首次启动自动初始化管理员；未配置密码时写入一次性文件 `data/bootstrap-admin.txt`（改密后自动删除，不写明文到日志）。
- 内置 RBAC，统一管理菜单权限和 API 权限。
- 支持个人 API 令牌管理。

### 创作与兼容接口

- OpenAI 兼容图片生成接口：`POST /v1/images/generations`。
- OpenAI 兼容图片编辑接口：`POST /v1/images/edits`。
- 面向图片场景的 Chat Completions：`POST /v1/chat/completions`。
- 面向图片工具调用场景的 Responses：`POST /v1/responses`。
- Anthropic Messages 风格入口：`POST /v1/messages`。
- 异步创作任务资源：`/api/creation-tasks`。
- 支持 `gpt-image-2`、`grok-imagine-image*`、`auto` 和多个 `gpt-5*` 文本/图片场景模型选项。

### 账号池与导入

- 支持账号可用性、邮箱、类型、额度、恢复时间刷新。
- 支持轮询可用账号执行图片生成和图片编辑。
- 支持 Token 失效后自动剔除无效账号。
- 支持账号搜索、筛选、批量刷新、导出、编辑和清理。
- 支持本地 CPA JSON 文件导入、远程 CPA 服务器导入、Sub2API 服务器导入和 access token 直接导入。

### 图片媒体存储

- 默认继续使用服务器本地目录，不改变现有部署行为。
- 可在「设置 → 媒体存储」配置 Cloudflare R2 私有桶；原图与缩略图保存到 R2，权限、公开状态和分页索引保存在 SQL 数据库。
- R2 上传失败时先写入 `data/media-spool` 并持久化为 `pending`，后台重试期间图片仍可从缓冲读取。
- 迁移顺序：保持 `local` → 保存 R2 凭据 → 测试连接 → 迁移旧图片 → 再切换为 `r2` 并重启。
- R2 模式要求 `STORAGE_BACKEND=sqlite`、`postgres` 或 `mysql`；旧本地图片迁移后仍会保留，确认稳定后再按运维计划清理。

## 快速部署

### 1. 获取部署文件

```bash
git clone https://github.com/ZyphrZero/chatgpt2api.git
cd chatgpt2api
cp .env.example .env
```

编辑 `.env`。`INTERNAL_SERVICE_TOKEN` 必填，须使用至少 32 字符的强随机值；管理员密码建议显式设置：

```env
INTERNAL_SERVICE_TOKEN=<openssl rand -hex 32 生成的随机值>
CHATGPT2API_ADMIN_USERNAME=admin
CHATGPT2API_ADMIN_PASSWORD=change_me_please
```

如果不设置 `CHATGPT2API_ADMIN_PASSWORD`，服务首次启动会生成一次性管理员密码并写入 `data/bootstrap-admin.txt`，不会写入日志。

### 2. 启动服务

```bash
docker compose up -d --build
```

默认 Compose 配置：

- 服务：主应用、FlareSolverr、Grok runtime；iCloud 服务通过 `--profile icloud` 启用
- 镜像：`shengtu:4.5-20261017-security-remediation`
- 端口：默认 `127.0.0.1:3004` -> 容器 `80`
- 数据目录：`./data:/app/data`
- 环境文件：Compose 只读取宿主机 `.env` 并注入进程，不再挂载到容器
- 后台可修改设置：持久化到 `./data/settings.env`
- 运行用户：三个项目镜像使用 UID/GID `10001`，不以 root 运行
- 默认资源边界：主应用/Grok runtime 各 2 CPU、2GB；FlareSolverr 1 CPU、512MB；iCloud 0.5 CPU、256MB，均可通过 `.env` 覆盖
- 重启策略：`restart: unless-stopped`

访问：

```text
http://localhost:3004
```

查看日志（需要在 `docker-compose.yml` 所在目录执行）：

```bash
docker compose logs -f app
```

从旧版本升级到非 root 镜像前，停止项目并把现有数据目录所有权交给运行 UID；该操作只调整权限，不改数据库和媒体内容：

```bash
docker compose down
sudo chown -R 10001:10001 ./data
docker compose up -d
```

回滚到旧镜像时通常不需要恢复所有权；如旧部署明确要求 root 所有，可在停机并核对绝对路径后执行 `sudo chown -R root:root ./data`。

### 首次管理员密码（一次性）

服务**不会**把明文密码写进日志。首次自动生成管理员时，密码写入容器/数据目录：

```text
data/bootstrap-admin.txt
```

文件权限为 `0600`，内容类似：

```text
username=admin
password=生成的密码
```

读取密码并登录后，请立即在「个人资料」修改密码；**修改密码成功后该文件会自动删除**。

查看路径示例：

```bash
# Docker Compose（宿主机挂载 ./data）
cat ./data/bootstrap-admin.txt

# 或进入容器
docker compose exec app cat /app/data/bootstrap-admin.txt
```

如果已经通过环境变量设置了固定密码：

```bash
grep -n "^CHATGPT2API_ADMIN_PASSWORD=" .env
```

则不会生成随机密码，也不会创建 `bootstrap-admin.txt`。管理员账号已存在时，改 `.env` 中的 `CHATGPT2API_ADMIN_PASSWORD` 不会覆盖现有密码。

默认 Compose 仅监听 `127.0.0.1:3004`（容器内 80），镜像标签：`shengtu:4.5-20261017-security-remediation`。公网部署应由 TLS 反向代理转发到该地址；只有明确需要直接监听公网时，才设置 `CHATGPT2API_BIND_ADDR=0.0.0.0` 并配置防火墙。

<details>
<summary>重置本地管理员密码</summary>

默认 SQLite 部署可按下面步骤重置本地登录账号数据。该操作会删除本地后台登录用户（包括管理员和普通本地用户），但不会删除账号池数据；执行前会先备份 `data` 目录。

```bash
cd /opt/chatgpt2api
# 编辑 .env，设置一个新的已知管理员密码：
# CHATGPT2API_ADMIN_PASSWORD=your_new_password

docker compose down
cp -a data "data.bak.$(date +%Y%m%d-%H%M%S)"
python3 - <<'PY'
import sqlite3
from pathlib import Path

db = Path("data/chatgpt2api.db")
if not db.exists():
    raise SystemExit(f"{db} not found")

con = sqlite3.connect(db)
cur = con.execute("DELETE FROM json_documents WHERE name = ?", ("auth_users.json",))
con.commit()
print(f"removed auth_users.json rows: {cur.rowcount}")
con.close()
PY
docker compose up -d
```

如果使用 `STORAGE_BACKEND=json`，本地登录账号保存在 `data/auth_users.json`，可在备份后删除该文件再重启：

```bash
docker compose down
cp -a data "data.bak.$(date +%Y%m%d-%H%M%S)"
rm -f data/auth_users.json
docker compose up -d
```

</details>

### 3. 自建镜像

如果需要从当前源码构建本地镜像：

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

## 升级与在线更新

### Docker 镜像升级

Docker 部署的推荐升级方式：

```bash
docker compose pull
docker compose up -d
```

默认 Compose 使用 DockerHub 公共镜像，普通用户不需要配置 GitHub Release 源、GitHub Token，也不需要登录 GitHub。也可以按需将 `docker-compose.yml` 的 `image` 改为 GHCR：

```yaml
image: ghcr.io/zyphrzero/chatgpt2api:latest
```

可用镜像：

```text
zyphrzero/chatgpt2api:latest
ghcr.io/zyphrzero/chatgpt2api:latest
```

### 管理端版本检查

设置页的“版本更新”卡片会按部署方式选择更新来源：

- Docker 镜像：默认匿名检查 DockerHub 公共镜像标签，升级方式是 `docker compose pull && docker compose up -d`。
- Release 二进制：检查项目 GitHub Release，只有这种非 Docker 部署会显示“立即更新”并替换当前 `chatgpt2api` 二进制。

Release 二进制在线更新流程：

1. 后端请求项目 latest release。
2. 比较当前版本和最新版本。
3. 下载当前平台匹配的 Release 压缩包。
4. 校验 `checksums.txt`。
5. 替换当前 `chatgpt2api` 二进制。
6. 保留 `.backup` 以支持回滚。
7. 前端提示重启服务。

重要说明：

- Docker 部署默认从 DockerHub 拉取镜像，不需要填写 GitHub Release 源或 GitHub Token。
- Docker 容器内不会执行二进制替换；请用 `docker compose pull && docker compose up -d` 更新镜像。
- 在线二进制替换只在非 Docker 的 `BuildType=release` 构建中开放。
- 前端资源已嵌入 Release 二进制，在线更新只替换 `chatgpt2api` 这一个运行文件。
- 检查更新访问 DockerHub / Release API 可通过 `CHATGPT2API_UPDATE_PROXY_URL` 配置代理；未设置时复用 `CHATGPT2API_PROXY`。
- 正式 Release archive 只发布 Linux `amd64` / `arm64` 构建；Windows 和 macOS 不提供在线更新压缩包。
- 简化发布只推送 Docker 镜像，不上传二进制压缩包时，在线更新无法找到可下载的 Release archive。

### 源码部署升级

源码部署请使用 Git 和本地构建流程：

```bash
git pull
npm ci --prefix web
npm run build --prefix web
npm run verify:dist --prefix web
go test ./...
go build -tags=embed -ldflags "-X chatgpt2api/internal/version.Version=1.0.0" -o chatgpt2api ./cmd/chatgpt2api
```

## 配置说明

运行时配置统一写入 `.env`。容器部署时，平台环境变量也可以覆盖 `.env` 中的同名变量。

### 基础配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CHATGPT2API_ADMIN_USERNAME` | `admin` | 初始管理员用户名 |
| `CHATGPT2API_ADMIN_PASSWORD` | 空 | 初始管理员密码；为空时首次启动自动生成一次性密码 |
| `CHATGPT2API_REGISTRATION_ENABLED` | `false` | 是否开放登录页邮箱验证码注册入口；还需在“设置 → 邮件服务”启用 SMTP |
| `CHATGPT2API_EMAIL_SETTINGS_KEY` | 自动生成 | SMTP 密码加密主密钥；未设置时生成 `data/email_settings.secret`，备份恢复须一并保留 |
| `CHATGPT2API_BASE_URL` | 空 | 用于生成图片 URL 的外部访问地址 |
| `CHATGPT2API_PROXY` | 空 | 全局代理，支持 `http`、`https`、`socks5`、`socks5h` |
| `CHATGPT2API_UPDATE_PROXY_URL` | 空 | 检查更新访问 DockerHub / Release API 的代理；为空时复用全局代理 |
| `CHATGPT2API_REFRESH_ACCOUNT_INTERVAL_MINUTE` | `5` | 限流账号检查间隔，单位分钟 |
| `CHATGPT2API_IMAGE_CONCURRENT_LIMIT` | `4` | 全局同时生成图片任务数量 |
| `CHATGPT2API_IMAGE_TASK_TIMEOUT_SECONDS` | `600` | 图片任务超时时间，单位秒；覆盖 Images 2.5 异步结果恢复窗口 |
| `CHATGPT2API_USER_DEFAULT_CONCURRENT_LIMIT` | `0` | 普通用户默认并发限制，`0` 表示不限制 |
| `CHATGPT2API_USER_DEFAULT_RPM_LIMIT` | `0` | 普通用户默认图片任务 RPM 限制，`0` 表示不限制 |
| `CHATGPT2API_IMAGE_RETENTION_DAYS` | `30` | 服务端缓存图片保留天数 |
| `CHATGPT2API_LOG_RETENTION_DAYS` | `7` | 业务日志保留天数 |
| `CHATGPT2API_AUTO_REMOVE_INVALID_ACCOUNTS` | `true` | 是否自动移除失效账号 |
| `CHATGPT2API_AUTO_REMOVE_RATE_LIMITED_ACCOUNTS` | `false` | 是否自动移除限流账号 |
| `CHATGPT2API_LOG_LEVELS` | 空 | 日志级别过滤，多个值用逗号分隔：`debug,info,warning,error` |

3.7 起，已有本地账号继续使用用户名和密码登录；新公开用户必须完成邮箱验证码注册，并使用邮箱和密码登录。新账号内部用户名由系统自动生成，不作为登录凭据。

### 存储后端

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `STORAGE_BACKEND` | `sqlite` | 存储后端，可选 `sqlite`、`json`、`postgres` |
| `DATABASE_URL` | 自动 | SQLite 或 PostgreSQL 连接串 |

SQLite 示例：

```env
STORAGE_BACKEND=sqlite
DATABASE_URL=sqlite:////app/data/chatgpt2api.db
```

PostgreSQL 示例：

```env
STORAGE_BACKEND=postgres
DATABASE_URL=postgresql://user:password@host:5432/chatgpt2api
```

JSON 文件存储迁移到 SQLite：

```bash
docker compose down
python3 scripts/migrate-json-to-sqlite.py --data-dir ./data --db ./data/chatgpt2api.db
# 编辑 .env：STORAGE_BACKEND=sqlite，DATABASE_URL=sqlite:////app/data/chatgpt2api.db
docker compose up -d
```

迁移脚本会导入 `data` 下的 JSON 文件、账号和 auth key 数据。历史 `logs.jsonl` 不迁移，新日志会在 SQLite 后端启用后写入数据库。目标库已存在时，脚本会先生成同目录 `.bak-时间戳` 备份。

## 本地开发

### 后端

```bash
npm ci --prefix web
npm run build --prefix web
npm run verify:dist --prefix web
go test ./...
go build -tags=embed -ldflags "-X chatgpt2api/internal/version.Version=0.0.0-dev" -o chatgpt2api ./cmd/chatgpt2api
CHATGPT2API_ADMIN_PASSWORD=change_me_please ./chatgpt2api
```

后端默认监听：

```text
http://127.0.0.1:8000
```

也可以通过 `PORT` 指定端口：

```bash
PORT=8000 ./chatgpt2api
```

### 前端

```bash
cd web
npm ci
npm run dev
```

前端开发服务器默认会通过 `VITE_API_URL` 访问后端。未设置时，开发模式默认使用：

```text
http://127.0.0.1:8000
```

前端验证命令：

```bash
cd web
npm run lint
npm run build
npm run verify:dist
```

## 发布流程

项目使用 GitHub Actions + GoReleaser 发布。

### CI

`.github/workflows/ci.yml` 在 `main` push 和 pull request 上执行：

- `go test ./...`
- `npm ci`
- `npm run build`

### Release

推送 `v*` 标签会触发 `.github/workflows/release.yml`：

1. 构建前端。
2. 上传 `internal/web/dist` artifact。
3. 将前端 artifact 下载到 `internal/web/dist`。
4. GoReleaser 使用 `-tags=embed` 构建 Linux `amd64` / `arm64` 二进制。
5. 生成 GitHub Release archive 和 `checksums.txt`。
6. 使用 `Dockerfile.goreleaser` 构建多架构 Docker 镜像。
7. 推送 DockerHub 镜像。
8. 推送 GHCR 镜像。

发布命令示例：

```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

手工执行 GoReleaser 前，必须先按目标版本重建并校验嵌入前端：

```bash
npm ci --prefix web
VITE_APP_VERSION=1.0.0 npm run build --prefix web
npm run verify:dist --prefix web
goreleaser release --clean
```

`verify:dist` 会比较当前 `web` 源码与 `internal/web/dist/build-manifest.json`。源码或构建配置变化但未重建前端时，GoReleaser 会直接失败。

Release 构建会注入：

- `chatgpt2api/internal/version.Version`
- `chatgpt2api/internal/version.Commit`
- `chatgpt2api/internal/version.Date`
- `chatgpt2api/internal/version.BuildType=release`

### Docker 镜像标签

默认发布到 DockerHub：

```text
zyphrzero/chatgpt2api:<version>
zyphrzero/chatgpt2api:latest
zyphrzero/chatgpt2api:<major>.<minor>
```

同时发布到 GHCR：

```text
ghcr.io/zyphrzero/chatgpt2api:<version>
ghcr.io/zyphrzero/chatgpt2api:latest
ghcr.io/zyphrzero/chatgpt2api:<major>.<minor>
```

## API 接入

所有受保护的 AI 接口都需要请求头：

```http
Authorization: Bearer <session-or-api-token>
```

后台登录后可以在个人资料或用户管理中创建 API 令牌。

### 常用接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 健康检查 |
| `GET` | `/version` | 当前版本 |
| `GET` | `/v1/models` | 模型列表 |
| `POST` | `/v1/images/generations` | OpenAI 兼容图片生成 |
| `POST` | `/v1/images/edits` | OpenAI 兼容图片编辑 |
| `POST` | `/v1/chat/completions` | 面向图片场景的 Chat Completions |
| `POST` | `/v1/responses` | 面向图片工具调用场景的 Responses |
| `POST` | `/v1/messages` | Anthropic Messages 风格入口 |
| `GET` | `/api/creation-tasks?ids=<id1,id2>` | 查询异步创作任务 |
| `POST` | `/api/creation-tasks/image-generations` | 提交图片生成任务 |
| `POST` | `/api/creation-tasks/image-edits` | 提交图片编辑任务 |
| `POST` | `/api/creation-tasks/chat-completions` | 提交文本/对话补全任务 |
| `POST` | `/api/creation-tasks/{id}/cancel` | 取消任务 |

权限系统中，异步创作任务对应的 API 权限为 `GET /api/creation-tasks` 和 `POST /api/creation-tasks`，并按子路径生效。

### `GET /v1/models`

```bash
curl http://localhost:3000/v1/models \
  -H "Authorization: Bearer <session-or-api-token>"
```

### `POST /v1/images/generations`

```bash
curl http://localhost:3000/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <session-or-api-token>" \
  -d '{
    "model": "auto",
    "prompt": "一只漂浮在太空里的猫",
    "n": 1,
    "response_format": "b64_json"
  }'
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `model` | 图片模型，支持 `auto`、`gpt-image-2`、`grok-imagine-image*` |
| `prompt` | 图片生成提示词 |
| `n` | 生成数量，当前限制为 `1-4` |
| `response_format` | 默认 `b64_json` |

### `POST /v1/images/edits`

```bash
curl http://localhost:3000/v1/images/edits \
  -H "Authorization: Bearer <session-or-api-token>" \
  -F "model=auto" \
  -F "prompt=把这张图改成赛博朋克夜景风格" \
  -F "n=1" \
  -F "image=@./input.png"
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `model` | 图片模型，支持 `auto`、`gpt-image-2`、`grok-imagine-image*` |
| `prompt` | 图片编辑提示词 |
| `n` | 生成数量，当前限制为 `1-4` |
| `image` | 参考图片，使用 multipart/form-data 上传 |

### `POST /v1/chat/completions`

该接口面向图片场景，不是完整通用聊天代理。

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <session-or-api-token>" \
  -d '{
    "model": "auto",
    "messages": [
      {
        "role": "user",
        "content": "生成一张雨夜东京街头的赛博朋克猫"
      }
    ],
    "modalities": ["image"],
    "n": 1
  }'
```

### `POST /v1/responses`

该接口面向图片生成工具调用场景，不是完整通用 Responses API 代理。

```bash
curl http://localhost:3000/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <session-or-api-token>" \
  -d '{
    "model": "gpt-image-2",
    "input": "生成一张未来感城市天际线图片",
    "tools": [
      {
        "type": "image_generation"
      }
    ]
  }'
```

## 截图

以下截图均来自仓库的 `assets/` 目录。

<table>
  <tr>
    <td width="50%">
      <strong>创作台</strong><br />
      <img src="assets/image.png" alt="创作台" />
    </td>
    <td width="50%">
      <strong>任务队列</strong><br />
      <img src="assets/duilie.png" alt="任务队列" />
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>图片库</strong><br />
      <img src="assets/tuku.png" alt="图片库" />
    </td>
    <td width="50%">
      <strong>提示词管理</strong><br />
      <img src="assets/prompts.png" alt="提示词管理" />
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>号池管理</strong><br />
      <img src="assets/account_pool.png" alt="号池管理" />
    </td>
    <td width="50%">
      <strong>角色与权限</strong><br />
      <img src="assets/rabc.png" alt="角色与权限" />
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>日志管理</strong><br />
      <img src="assets/log.png" alt="日志管理" />
    </td>
    <td width="50%">
      <strong>注册管理</strong><br />
      <img src="assets/zhuceji.png" alt="注册管理" />
    </td>
  </tr>
</table>

## 规划与状态

- 当前推荐接入路径见上方 API 表格；实验性或历史功能状态以代码实现为准。
- 更多功能状态见：[功能清单](./docs/feature-status.en.md)。
- 上游 SSE 相关说明见：[upstream-sse-conversation](./docs/upstream-sse-conversation.md)。

## 社区与鸣谢

Telegram 群组：[ChatGPT2API](https://t.me/+YBR7t_CPOYBkYzU1)

学 AI，上 L 站：[LinuxDO](https://linux.do)

内置提示词参考：

- [banana-prompt-quicker](https://github.com/glidea/banana-prompt-quicker)，作者：[阿良](https://linux.do/u/ajd)
- [awesome-gpt-image-2-prompts](https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts)

生图配置参考：

- [ChatGpt-Image-Studio](https://github.com/peiyizhi0724/ChatGpt-Image-Studio)，作者：[小怪兽](https://linux.do/u/peiyizhi)

## Contributors

感谢所有为本项目做出贡献的开发者：

<a href="https://github.com/basketikun/chatgpt2api/graphs/contributors">
  <img alt="Contributors" src="https://contrib.rocks/image?repo=basketikun/chatgpt2api" />
</a>

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=basketikun/chatgpt2api&type=date&legend=top-left)](https://www.star-history.com/?repos=basketikun%2Fchatgpt2api&type=date&legend=top-left)
