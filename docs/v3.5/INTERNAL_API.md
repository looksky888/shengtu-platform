# 内部侧车 API 契约（3.5）

鉴权：请求头 `X-Internal-Token: <INTERNAL_SERVICE_TOKEN>`（与主站 env 一致）。  
Content-Type：`application/json`（文件上传除外）。

## 0. 通用

### `GET /health`

```json
{ "ok": true, "service": "grok-runtime", "version": "3.5-20260715" }
```

---

## 1. Grok 运行时（`GROK_RUNTIME_BASE_URL`）

### 1.1 生图

`POST /internal/v1/images/generations`

Body（对齐 OpenAI 子集 + shengtu 扩展）：

```json
{
  "model": "grok-imagine-image",
  "prompt": "...",
  "n": 1,
  "size": "1024x1024",
  "response_format": "url"
}
```

响应：

```json
{
  "created": 0,
  "data": [{ "url": "https://...", "b64_json": null }],
  "meta": { "account_id": "...", "latency_ms": 0 }
}
```

### 1.2 改图

`POST /internal/v1/images/edits`  
multipart 或 JSON（含 image 引用），字段同 OpenAI edits 子集。

### 1.3 模型

`GET /internal/v1/models` → `{ "data": [ { "id": "grok-imagine-image", ... } ] }`

### 1.4 账号

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/internal/v1/accounts` | 列表（token 脱敏） |
| POST | `/internal/v1/accounts/import` | 导入 SSO/凭据 |
| POST | `/internal/v1/accounts/refresh` | 批量刷新 |
| POST | `/internal/v1/accounts/{id}/disable` | 禁用 |

---

## 2. 注册（同 grok-runtime 进程）

主站在 `FEATURE_REGISTER_BACKEND=python` 时 **反代** 下列路径到侧车（或直连实现相同 JSON 形状，兼容现前端）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/register` | 配置读写；body 含 `target: openai\|grok` |
| POST | `/api/register/start` | 启动 |
| POST | `/api/register/stop` | 停止 |
| POST | `/api/register/reset` | 重置统计 |
| GET | `/api/register/logs` | 若侧车提供 SSE/分页，主站转发 |

配置块需包含：`mail.providers[]`、`proxy`、`clearance`、`total`、`threads`、`target`、`grok`（Grok 专用 captcha/oauth）。

邮箱 provider `type`：

- 既有：`outlook_token` / `gptmail` / `duckmail` / …
- 新增：`icloud_local`（走 iCloud sidecar）、`icloud_api`

---

## 3. iCloud（主站反代 → `ICLOUD_PRIVACY_MAIL_BASE_URL`）

主站对外：`/api/icloud/*`（需管理员权限）  
映射规则对齐 gptGrok2api `api/icloud_privacy_mail.py`：

| 主站 path | sidecar |
|-----------|---------|
| `/api/icloud/status` | `/api/status` |
| `/api/icloud/health` | `/api/v1/health` |
| `/api/icloud/session` | `/api/icloud/session` |
| `/api/icloud/accounts…` | `/api/accounts…` |
| `/api/icloud/mailboxes…` | `/api/mailboxes…` |
| `/api/icloud/claim-status/sync` | 主站聚合后调 sidecar `api/v1/mailboxes/claim-status` |

内部头必须同时携带：

- `X-ChatGPT2API-Internal: icloud-privacy-mail`
- `X-Internal-Token: <INTERNAL_SERVICE_TOKEN>`

sidecar 仅在共享密钥常量时间校验通过后允许内部请求绕过 Web 登录。

---

## 4. 错误形状

```json
{
  "error": {
    "code": "cloudflare_challenge|no_account|upstream|unauthorized|not_implemented",
    "message": "人类可读说明"
  }
}
```

HTTP：`401` token 错；`503` 侧车不可用；`502` 上游协议失败。
