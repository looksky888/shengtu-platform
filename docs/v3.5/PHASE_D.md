# Phase D — Grok 原生运行时（号池 only）

## 已完成

1. **Vendoring**：`services/grok-runtime/upstream`（app/api/services/utils 自 gptGrok2api-main）
2. **侧车入口**：`/internal/v1/images/generations`、`/edits` → `api.grok.dispatch_*`
3. **主站路由**：`grok-*` **固定** → `grok_native` → HTTP 调侧车（已移除 `grok_proxy_*` 外部中转）

## 启用步骤

```env
GROK_RUNTIME_BASE_URL=http://grok-runtime:8091
INTERNAL_SERVICE_TOKEN=<强随机>
```

```bash
docker compose up -d --build grok-runtime app
curl -s http://127.0.0.1:8091/health   # 需在 compose 网络或临时映射端口
```

## 后续（D 续）

| 项 | 说明 |
|----|------|
| 账号导入 | SSO/cookie 写入侧车账号库，否则 native 无号可用 |
| 侧车 lifespan | 完整 `EmbeddedGrokRuntime` 启动与 refresh scheduler |

## 风险

- upstream 导入失败时 `health.features.image_generations=false`，见 `native_import_error`
- 依赖 curl-cffi 等原生扩展，镜像构建需网络
