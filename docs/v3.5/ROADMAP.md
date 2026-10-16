# shengtu 3.5 实施路线图

## 决策（已确认）

| 项 | 选择 |
|----|------|
| 工作区 | `releases/shengtu-v3.5-20260715`，不直接改 3.4 |
| OpenAI 注册 | **不保留 Go 生产路径**，与 Grok 注册一并迁入 Python `grok-runtime` |
| Grok 生图 | 去掉中转站；对接参考项目原生运行时（侧车） |
| iCloud | 整套 sidecar + 主站代理 |
| CF 清障 | Go 主站统一 profile，参考 gptGrok2api |

## Phase 顺序与状态

```text
A 基建契约 ✅  →  B iCloud ✅  →  C CF清障 ✅  →  D Grok原生 ✅  →  E 注册迁Python ✅  →  F 收尾 ✅
```

OpenAI 注册在 **E** 切换：`FEATURE_REGISTER_BACKEND=python` 后，Go 仅反代；实现位于 `grok-runtime`。  
号池同步见 E 续：`POST /internal/v1/accounts/import`。

## 数据目录

```text
source/data/                      # 主站现有
source/data/icloud-privacy-mail/  # Apple / 邮箱池
source/data/grok-runtime/         # Grok 账号 + 注册状态
```

## 服务端口（内网）

| 服务 | 默认 | 说明 |
|------|------|------|
| app | 3004→80 | 对外 |
| flaresolverr | 127.0.0.1:8191 | CF |
| icloud-privacy-mail | 内网 8787 | 不对公网 |
| grok-runtime | 内网 8091 | 不对公网 |

## 开关

见 `docs/v3.5/FEATURE_FLAGS.md` 与 `.env.example`。
