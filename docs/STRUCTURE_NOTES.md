# 结构说明（P3）

## API 出站约定（双轨收敛）

- **优先**：路由直接写 `*Public` / `*Typed`（如 `ListAccountsTyped`、`ListTaskLogsTyped`、`GetTyped`）。
- **兼容**：service 仍可返回 map 供写路径合并；`httpapi` 出站前应 `*PublicFromMap` / `*PublicFromRecord` 规范化。
- **新接口**：禁止新增「仅 map、无 Public 类型」的 JSON 响应字段。

## 任务中心（运维）

| 入口 | 说明 |
|------|------|
| 顶栏 **任务中心** `/task-queue` | 默认 Tab「实时队列」+「任务历史」 |
| `/task-queue?tab=history` | 历史分页排错 |
| `/image-task-logs` | **兼容路径**，重定向到 `?tab=history` |
| 顶栏小气泡 `ImageTaskQueue` | **用户自己的**进行中任务（本地会话），不是全站运维队列 |

## 大文件拆分

### `internal/backend`

| 文件 | 内容 |
|------|------|
| `backend.go` | Client 核心、会话/codex 流、headers、bootstrap |
| `backend_image.go` | 图片下载/上传/轮询/生成 |
| `backend_fingerprint.go` | UA / sec-ch-ua 指纹 |
| `backend_conversation_text.go` | 对话文本组装 |
| `backend_http.go` | postJSON/SSE/错误摘要/工具函数 |

### `internal/protocol`

| 文件 | 内容 |
|------|------|
| `api.go` | 图片 generations/edits 入口、模型路由 |
| `api_chat.go` | Chat Completions / 图生文图混聊 |
| `api_responses.go` | OpenAI Responses |
| `api_messages.go` | Anthropic Messages / tool XML |

## 号池处置

见 [ACCOUNT_DISPOSAL.md](./ACCOUNT_DISPOSAL.md)。
