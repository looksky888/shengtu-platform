# Phase F — 收尾

## 本阶段完成

| 项 | 说明 |
|----|------|
| 注册页 **平台选择** | OpenAI / Grok（`target` 字段，保存/启动时提交） |
| 根 README | 3.5 启用清单与 compose 说明 |
| 路线图状态汇总 | 见 `ROADMAP.md` |
| 默认建议 | `.env.example` 注释给出生产目标组合（**代码默认仍保守**，避免误开） |

## 默认策略（为何不强制改代码默认）

| 开关 | 代码默认 | 原因 |
|------|----------|------|
| `REGISTER_BACKEND` | `go` | 侧车导入失败时仍可本地注册 |
| `GROK_NATIVE` | `false` | 需账号库与镜像依赖就绪 |
| `ICLOUD` | `false` | 需 Apple 登录与 sidecar |

生产切换时请在 `.env` **显式打开**（见 README）。

## 已知后续（非阻塞收尾）

1. Grok 注册账号管理 UI / 导入到 native runtime  
2. ~~native 生图失败 fallback 中转~~（已取消：Grok 仅号池，已删 `grok_proxy_*`）  
3. 稳定后删除 Go `RegisterService` 实现  
4. 前端 npm build 嵌入正式 dist  

## 验收清单

- [ ] `docker compose --profile icloud up -d --build`
- [ ] `/health` 含 `features_v35`
- [ ] `REGISTER_BACKEND=python` 时注册配置可保存、`target` 可选 grok
- [ ] OpenAI 注册成功后主站号池出现新 token（`SHENGTU_POOL_SYNC`）
- [ ] `grok-*` 固定走 grok-runtime 侧车（需 `GROK_RUNTIME_BASE_URL` + 侧车 healthy）
