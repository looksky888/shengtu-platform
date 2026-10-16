# grok-runtime（4.5）

Python 侧车：原生 Grok 生图（vendored 自 `gptGrok2api-main`）+ 后续注册机。

## 结构

```text
runtime/main.py      # FastAPI 入口（/health, /internal/v1/images/*）
upstream/            # 裁剪的 gptGrok2api 包（app/ api/ services/ utils/）
Dockerfile
requirements.txt
requirements-test.txt
```

## 本地验证

测试与审计工具单独安装，不进入生产镜像：

```powershell
python -m pip install -r requirements-test.txt
python -m pytest
python -m pip_audit -r requirements.txt
python -m bandit -r runtime upstream -x upstream/services/register/node_modules
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `INTERNAL_SERVICE_TOKEN` | 与主站一致 |
| `GROK_PROVIDER_CREDENTIAL_KEY` | Base64 编码的 32 字节独立密钥；Provider 凭据写入与转换时必需 |
| `DATA_DIR` | 默认 `/data` |
| `GROK_RUNTIME_ALLOW_ANON` | 仅本地调试可 true |
| `CHATGPT2API_PROXY` | 可选出口代理 |

## 主站配置

Grok 生图**仅**走本侧车（号池），已移除外部 `grok_proxy_*` 中转。

```env
GROK_RUNTIME_BASE_URL=http://grok-runtime:8091
INTERNAL_SERVICE_TOKEN=...
```

## 注意

1. 逆向栈完整导入依赖账号库/配置初始化；若 `health.features.image_generations=false`，看 `native_import_error`。
2. 生产需导入 Grok SSO 账号（Phase E 注册或手工导入接口后续补）。
3. 首版镜像体积较大（含 upstream）。
