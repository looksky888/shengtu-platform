# shengtu 3.x 运维说明

## 进程重启

`POST /api/admin/system/restart` 会在响应后约 100ms 执行 `os.Exit(0)`。

**本进程不会自己拉起**，必须依赖外部守护：

| 环境 | 配置 |
|------|------|
| Docker Compose | `restart: unless-stopped`（默认 compose 已设） |
| systemd | `Restart=on-success` 或 `always` |
| 裸进程 | 需自行用 supervisor / 脚本重启 |

更新 / 回滚接口返回 `need_restart: true` 时，请手动重启或调用上述 restart 接口。

## 健康检查

`GET /health` 返回：

```json
{
  "status": "ok",
  "version": "...",
  "deployment": { "single_writer_required": true },
  "storage": { "account_pool_ready": true, "credits_ready": true },
  "account_pool": { "total": 0, "available": 0, "codes": { "account_pool_empty": true } },
  "image_proxy": { "http_502": 0, "http_524": 0, "success_rate": 0 }
}
```

- `status`：`ok` 或 `degraded`（号池/积分未成功加载时）。HTTP 仍为 200，避免 liveness 误杀；**就绪探针应检查 `status` 与 `storage.*_ready`**。  
- `deployment.single_writer_required`：号池租约、任务队列、登录限流为**进程内状态**，生产请 **单实例** 或保证单写节点。  
- `account_pool`：号池可用/限流/异常聚合（不含 token）  
- `image_proxy`：中转站最近请求健康（含 502/524 计数）

### 相关环境变量

| 变量 | 说明 |
|------|------|
| `CHATGPT2API_SHUTDOWN_TIMEOUT_SECONDS` | 优雅退出等待秒数，默认 120，范围 15–600 |
| `CHATGPT2API_TRUST_PROXY_HEADERS` | 见下节；默认关闭 |
| `CHATGPT2API_IMAGE_ATTEMPT_TIMEOUT_SECONDS` | 单账号生图尝试超时，默认 80；超时后换号重试；异步结果会在任务上下文内继续轮询 |
| `CHATGPT2API_PROXY` | 上游 HTTP/SOCKS 代理；WARP 栈填 `http://privoxy:8118` |
| `CHATGPT2API_UPSTREAM_CLEARANCE_ENABLED` | 生图/bootstrap 使用 FlareSolverr clearance |
| `CHATGPT2API_IMAGE_CHALLENGE_COOLDOWN_SECONDS` | CF 后账号冷却秒数，默认 900 |

## 客户端 IP 与 `TRUST_PROXY_HEADERS`

进程用同一套解析（`authClientIP`）服务于：

| 用途 | 说明 |
|------|------|
| 登录 / 注册频控 | 滑动窗口限流 |
| **注册额度** | 每 IP / 每设备成功注册次数（默认 30 天各 3 次，`registration_quota.json`） |
| 审计日志 `ip_address` | 管理操作与 API 调用记录 |

### 默认安全行为

- **默认不信任** `X-Forwarded-For` / `X-Real-IP` / `CF-Connecting-IP`。
- 只使用 TCP 对端 `RemoteAddr`。
- 公网用户伪造 `X-Forwarded-For` **不能** 拆成多个 IP 额度桶刷注册；额度键绑定真实对端 IP。

### 何时开启

仅当本进程**只**接受来自可信反向代理的连接，且代理会：

1. 覆盖或剥离客户端自带的转发头，并
2. 写入真实客户端 IP（如 Cloudflare `CF-Connecting-IP`、nginx `real_ip` + `X-Real-IP` / 重写后的 `X-Forwarded-For`）

时设置：

```bash
CHATGPT2API_TRUST_PROXY_HEADERS=true
```

信任后的读取顺序：`CF-Connecting-IP` → `X-Forwarded-For` 最左有效 IP → `X-Real-IP` → 回退 `RemoteAddr`。

**错误示例：** 进程直接暴露公网且 `TRUST_PROXY_HEADERS=true` → 攻击者轮换伪造 XFF 可绕过 **IP 维度**注册额度（设备 Cookie 仍限制同浏览器；清 Cookie / 多机仍可被滥用）。

### 注册组合风控

| 变量 | 默认 | 说明 |
|------|------|------|
| `CHATGPT2API_REGISTER_QUOTA_MAX_EVENTS` | 5000 | 账本最大事件数（窗口外剪枝后再硬截断） |
| `CHATGPT2API_DEVICE_ID_SECRET` | 自动生成 | 设备 Cookie **当前** HMAC 密钥（签名 + 校验） |
| `CHATGPT2API_DEVICE_ID_SECRET_PREVIOUS` | 空 | 轮换窗口内 **仅校验** 的旧密钥（可逗号分隔多把） |

阈值通过后台“设置 → 邮件服务 → 注册组合风控”管理，默认规则：设备 30 天成功 5 个封禁 30 天；IP 24 小时成功 3 个且涉及 3 个设备封禁 30 小时；同 IP＋设备 10 分钟第 2 次尝试冷却 300 小时；IPv4 `/24` 24 小时成功 20 个后拒绝；临时邮箱＋可信代理 CIDR＋重复设备直接拒绝。

代理/VPN 只按管理员配置的 CIDR 判断，不读取客户端自报的代理标记，也不调用第三方 IP 情报 API。`GET /auth/providers` 会下发设备 Cookie；注册走 `Reserve` → 成功 `Bind` / 失败 `Release`，失败只释放预占，不删除尝试记录。

#### 注册额度账本（`registration_quota.json`）

| 项 | 说明 |
|----|------|
| 存储 | 优先 `JSONDocumentBackend`（与 sqlite/json 存储后端一致）；并镜像写 `data/registration_quota.json` 便于备份 |
| 数据 | 成功/预占事件、注册尝试、带到期时间的设备/IP/IP＋设备封禁 |
| 启动剪枝 | 成功事件按策略最长窗口保留；尝试至少保留 24 小时；过期封禁删除；超过 30 分钟的预占删除 |
| 硬上限 | 三类记录分别受 `CHATGPT2API_REGISTER_QUOTA_MAX_EVENTS` 限制（默认 5000），保留最新尾部 |
| 并发 | 仍由进程内 mutex + Reserve/Bind/Release 保证原子；单实例部署 |

### 设备 Cookie 密钥轮换（`device_id.secret`）

Cookie 值格式：`{device_id}.{hmac_sha256_base64url}`。裸 `device_id` 不接受。

密钥加载优先级（当前密钥）：

1. 构造参数 / 显式配置  
2. 环境变量 `CHATGPT2API_DEVICE_ID_SECRET`  
3. 文件 `{dataDir}/device_id.secret`（首次启动自动生成 32 字节 hex，权限 0600）

#### 策略对照

| 模式 | 配置 | 旧 Cookie | 设备额度 |
|------|------|-----------|----------|
| **硬轮换（泄露/紧急）** | 只换当前密钥，**不**设 PREVIOUS | 全部校验失败 → 重新 `IssueDeviceID` | **新 device id**，旧设备桶不再绑定该浏览器 |
| **软轮换（推荐例行）** | 新密钥作当前，旧密钥放 PREVIOUS | 仍解析为**同一** device id，并在 `/auth/providers` 或注册时 **用当前密钥重签** Cookie | 连续计数，不重置 |
| **收口** | 去掉 PREVIOUS，只保留当前 | 未重签成功的旧签名失败 | 同硬轮换对该客户端 |

#### 软轮换步骤

1. 记下当前密钥（env 或 `data/device_id.secret` 内容）。  
2. 生成新密钥（建议 ≥32 字节随机）。  
3. 设置：
   ```bash
   CHATGPT2API_DEVICE_ID_SECRET=<new>
   CHATGPT2API_DEVICE_ID_SECRET_PREVIOUS=<old>
   ```
   若用文件：把新密钥写入 `device_id.secret`，旧密钥放进 env PREVIOUS（文件只承载当前密钥）。  
4. 滚动重启实例。访问登录/providers 会把 Cookie 重签为当前密钥。  
5. 等待足够流量覆盖（例如 7–30 天）后，**删除 PREVIOUS** 并再重启 → 未迁移 Cookie 失效。

#### 硬轮换步骤（密钥泄露）

1. 生成新密钥；**不要**设置 PREVIOUS。  
2. 更新 `CHATGPT2API_DEVICE_ID_SECRET` 或覆盖 `device_id.secret`。  
3. 重启。所有旧 Cookie 立即失效；各浏览器获得新 device id。  
4. **后果**：设备维度注册额度对该浏览器重置；IP 维度额度不受影响。账本 `registration_quota.json` 中旧 device 事件仍占用窗口计数（不会自动删除）。

#### 安全注意

- 勿把密钥提交 git；备份 `device_id.secret` 与 env 时按机密处理。  
- PREVIOUS 窗口不宜无限长；泄露场景应硬轮换。  
- 多实例必须共用**同一**当前密钥（及同一 PREVIOUS 列表），否则设备额度与 Cookie 校验会分裂。

## 管理端删除用户审计

`DELETE /api/admin/users/{id}` 成功后额外写入事件摘要 **`管理端删除用户`**（`operation_type=删除用户`，`log_level=warning`），便于在日志中心按摘要筛选追责。

| 字段 | 含义 |
|------|------|
| `username` / `subject_id` | 操作者（管理员） |
| `deleted_user_id` / `deleted_username` / `deleted_name` | 被删用户快照 |
| `deleted_role_id` / `deleted_provider` | 角色与来源 |
| `deleted_credit_balance` | 删除前积分 |
| `deleted_inactive_days` | 列表侧未活跃天数（若有） |
| `cleanup_context` | 是否带清理筛选上下文 |
| `cleanup` / `inactive_days_min` / `credit_max` | 可选 query（清理 UI 删除时前端会附带） |
| `reason` | 可选说明（最长 200） |
| `ip_address` / `user_agent` | 操作来源 |

通用 HTTP 审计仍会记录 `DELETE /api/admin/users/...` 路径；业务审计以 **`管理端删除用户`** 为准。

## 备份与灾难恢复（账号池 / 隔离仓 / 注册额度）

管理端备份（`POST /api/admin/backup/run`，定时任务同一套）在 `include` 含 **`data`** 时打包 `dataDir` 下业务状态。

### 与号池同套的关键文件（强制纳入）

| 文件 | 作用 |
|------|------|
| `accounts.json` / `chatgpt2api.db*` | 账号池（JSON 或 SQLite） |
| `auth_keys.json` | 用户密钥 / 会话凭证 |
| **`account_quarantine.json`** | **隔离仓**（永久/临时处置账号，可 Restore；有 cap，见下） |
| **`registration_quota.json`** | **注册额度账本**（IP/设备成功注册事件） |
| **`device_id.secret`** | 设备 Cookie HMAC 当前密钥（与额度设备维绑定） |
| 其它 `data/*.json` | 积分、设置、备份配置等 |

排除：`data/backups/` 历史 zip（避免嵌套）；未勾选 `images` 时排除图目录。

### 灾难恢复演练（建议定期做）

1. **备份**：设置页开启本地或 R2 备份 → 手动「立即备份」→ 确认 zip 内含上表文件（至少 quarantine + registration_quota + accounts/auth）。  
2. **停服**：停止 shengtu 进程（单实例）。  
3. **还原**：将 zip 解压覆盖到部署根/`data`（保持相对路径 `data/...`）；`device_id.secret` 权限建议 `0600`。  
4. **启动**：拉起进程；检查：
   - 号池列表与隔离仓条数  
   - 注册：同一设备 Cookie 仍计入设备额度（密钥未丢）  
   - 登录 / 积分账本  
5. **记录**：演练日期、备份文件名、耗时、差异项。

若只恢复号池却丢隔离仓：已处置 token 无法从隔离仓点恢复。若丢 `registration_quota.json`：注册额度重置（可能再次被刷号）。若丢 `device_id.secret` 且无 env 覆盖：会生成新密钥 → 旧设备 Cookie 全失效（等同硬轮换）。

多实例：备份/还原后须保证各节点共用同一 `data` 或同一密钥与账本，否则额度与 Cookie 会分裂。

### 隔离仓规模（`account_quarantine.json`）

| 项 | 说明 |
|----|------|
| 默认 cap | **2000** 条（原 500） |
| 环境变量 | `CHATGPT2API_QUARANTINE_MAX_ENTRIES`（1–10000） |
| 超限淘汰 | 最新在前；优先丢最旧 **temporary/unknown**，尽量保留 **permanent** 供人工恢复 |
| 列表/写入 | 进程内缓存，避免每次全文件解析 |
| 自动探活 | 每轮最多探测 **50** 条 temporary（最新优先），避免大仓卡刷新 |
| 健康字段 | `quarantine_count` / `quarantine_max`（号池 health） |

仍为单 JSON 文件（与号池备份同套）；未迁 DB。若持续顶满 cap，应清理 temporary 或提高 cap，并依赖备份恢复 permanent。

### 隔离仓与号池一致性（先写后删 + 启动协调）

JSON/文件存储**无法**对 `account_quarantine.json` 与 `accounts.json` 做单事务。实现策略：

| 步骤 | 结果 |
|------|------|
| 1. 原子写入隔离仓（`AtomicWriteFile` + fsync） | 失败 → 号池不动，账号不丢 |
| 2. 从号池删除并持久化 | 成功 → 干净状态 |
| 2 失败 / 进程在 1 与 2 之间被杀 | **双存在**：仓里有、池里也有 |
| 启动 `InitQuarantinePath` → `ReconcileQuarantinePool` | **以隔离仓为准**，从号池再删一遍 |

运维含义：掉电/杀进程不会「号从池删掉却没进隔离仓」；最坏是短暂双存在，重启后协调干净。真跨表事务需 DB 后端统一账本（后续可选）。

相关 `ops` 键：`quarantine_remove_pending`（写仓后池删失败）、`quarantine_reconcile_removed`（启动协调移除数）。

### 号池处置可观测性（`dispose`）

`GET /api/admin/account-pool/health` 的 `pool` 含：

| 字段 | 说明 |
|------|------|
| `ops` | 当日（中国时区日期）原始计数 map，键为 action 名 |
| `dispose` | 结构化汇总（推荐） |

`dispose` 主要计数（当日）：

- `deleted_permanent` / `marked_invalid` / `quarantine_write_failed`
- `refresh_recovered`（死号刷新恢复）
- `quarantined_temporary` / `cooled_temporary` / `soft_fail_unknown`
- `auto_restored_temporary` / `manual_restored`

比例（0–1）：

- `delete_share`：删除占全部处置动作比
- `recover_share`：永久路径中刷新恢复占比
- `quarantine_fail_share`：硬删尝试中写隔离仓失败占比

进程内累计、按自然日清零；重启会丢当日计数（非持久化）。任务队列侧栏展示今日删除/隔离/恢复与写仓失败率。

## CORS

- 带 Cookie 的跨域：仅允许与请求 Host 相同的 Origin，或双方均为 loopback。  
- 其它 Origin：回 `Access-Control-Allow-Origin: *`（无 credentials）。  
- 管理台与 API 同域部署时最安全。

## 静态资源

| 路径 | 鉴权 | 说明 |
|------|------|------|
| `/login-page-images/` | 公开 | 登录页装饰图 |
| `/announcement-images/` | 公开 | 公告图 |
| `/images/`、`/image-thumbnails/` | 私有图需登录；`visibility=public` 可匿名 | 见图片库权限 |

## 发布包形态

| 形态 | 包含 | 排除 |
|------|------|------|
| source-only | 源码、go.mod、web 源码 | node_modules、data、build-cache、.env |
| runtime | 二进制/镜像 + 空 data 卷 | — |
| dev-cache | 本地 go/npm 缓存 | 不要放进 releases |

## 相关环境变量（节选）

| 变量 | 说明 |
|------|------|
| `CHATGPT2API_IMAGE_UPLOAD_SETTLE_MS` | 图上传后等待 blob 就绪的毫秒数，默认 200 |
| `CHATGPT2API_IMAGE_POLL_*` | 生图轮询超时/间隔 |
| `STORAGE_BACKEND` | sqlite / json / postgres |
