# 3.5 功能开关

环境变量前缀：`CHATGPT2API_`。布尔：`true` / `false` / `1` / `0`。

| 变量 | 默认 | 含义 |
|------|------|------|
| `FEATURE_ICLOUD` | `false` | 启用 iCloud 代理路由与注册 provider |
| `FEATURE_GROK_REGISTER` | `false` | 注册目标允许 Grok（需 `REGISTER_BACKEND=python`） |
| `FEATURE_REGISTER_BACKEND` | `go` | `go`（过渡）\| `python`（3.5 目标） |
| `ICLOUD_PRIVACY_MAIL_BASE_URL` | `http://icloud-privacy-mail:8787` | sidecar 地址 |
| `GROK_RUNTIME_BASE_URL` | `http://grok-runtime:8091` | Python 侧车地址（Grok 生图唯一路径） |
| `INTERNAL_SERVICE_TOKEN` | 空 | 主站→侧车共享密钥（必填生产） |

## Grok 生图

`grok-*` 模型**固定**走 `GROK_RUNTIME_BASE_URL`（号池 + 内置 runtime），**不再**支持 `grok_proxy_*` 外部中转。

```env
GROK_RUNTIME_BASE_URL=http://grok-runtime:8091
INTERNAL_SERVICE_TOKEN=...
```

创作台前端默认展示 Grok 模型（`ENABLE_GROK_IMAGE_MODELS_IN_STUDIO=true`）。

## Grok 号池 UI

主站「号池管理」页切换 **Grok 号池** → `/api/grok/accounts*` 代理到 runtime。  
侧车持久化：`DATA_DIR/grok_accounts.json`。

## iCloud 邮箱 UI

```env
CHATGPT2API_FEATURE_ICLOUD=true
ICLOUD_PRIVACY_MAIL_BASE_URL=http://icloud-privacy-mail:8787
```

导航「iCloud 邮箱」→ `/icloud` → `/api/icloud/*` 反代侧车。

### 注册机与隐私邮箱（重要）

注册 provider `icloud_local` **不会**向 Apple 现场创建 Hide My Email，只从侧车 **claim 已有邮箱**：

1. iCloud 页：Apple 登录 →（可选）IMAP 取码登录 → **创建隐私邮箱**
2. 确认列表有库存
3. 再启动注册机

若日志 `没有可用隐私邮箱`：先回 iCloud 页创建，不要反复点注册。

### Grok 打码

注册页在 target=Grok 时配置 Turnstile：`yescaptcha` / `2captcha` / `local`。  
本地 solver 参考 gptGrok2api `captcha-solver/`，API Base 填 solver 地址。  
完整 Grok 注册建议：`CHATGPT2API_FEATURE_REGISTER_BACKEND=python`。

### 创作台 Grok 模型

作画模式仅展示 **一个** Grok 生图模型：`grok-imagine-image`（lite/pro 不进菜单）。

## 注册切到 Python

```env
CHATGPT2API_FEATURE_REGISTER_BACKEND=python
CHATGPT2API_FEATURE_GROK_REGISTER=true
GROK_RUNTIME_BASE_URL=http://grok-runtime:8091
```
