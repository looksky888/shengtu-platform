# Phase E — 注册迁 Python（OpenAI + Grok）

## 决策

- **不再保留 Go 注册为生产路径**（`FEATURE_REGISTER_BACKEND=python`）
- Go 仅做：鉴权 + 反代 `/api/register*` + SSE 轮询侧车配置

## 已完成

| 项 | 说明 |
|----|------|
| 侧车 `register_bridge` | 内部 Token 鉴权，挂载 get/update/start/stop/reset/outlook/gptmail/grok accounts |
| vendored `register_service` + `openai_register` + `grok_register` + mail |
| `DATA_DIR` 环境变量 | 指向 `/data`（compose 卷 `data/grok-runtime`） |
| 主站反代 | `proxyRegisterToPython` |
| SSE | python 模式下 GET `/api/register` 轮询 |

## 启用

```env
CHATGPT2API_FEATURE_REGISTER_BACKEND=python
CHATGPT2API_FEATURE_GROK_REGISTER=true
GROK_RUNTIME_BASE_URL=http://grok-runtime:8091
INTERNAL_SERVICE_TOKEN=...
ICLOUD_PRIVACY_MAIL_BASE_URL=http://icloud-privacy-mail:8787
CHATGPT2API_FEATURE_ICLOUD=true
```

```bash
docker compose --profile icloud up -d --build
```

检查：

```bash
# 侧车
curl -s -H "X-Internal-Token: $TOKEN" http://grok-runtime:8091/health
# features.register_openai / register_grok 应为 true（导入成功时）
```

## 与 shengtu 号池写入

Python `openai_register` 成功后：

1. 写入侧车 `account_service`（`data/grok-runtime/accounts.json`）
2. **E 续已实现**：`services/shengtu_pool_sync.py` → 主站  
   `POST /internal/v1/accounts/import`（`X-Internal-Token`）

环境变量（侧车）：

```env
SHENGTU_BASE_URL=http://app:8092
INTERNAL_SERVICE_TOKEN=与主站相同
SHENGTU_POOL_SYNC_ENABLED=true
SHENGTU_POOL_SYNC_REFRESH=true
```

同步失败**不导致注册失败**（日志黄色 step）。

## 风险

- 上游依赖多，镜像首次 `import register_service` 可能失败（4.6 起 `/health` 只回布尔能力位，异常详情见侧车容器日志）
- Checkout / Sub2API 已挂在 register_service，首期可不配置
- 前端 `target: grok` UI 需补选择器（类型已扩展，设置页可后续加）
