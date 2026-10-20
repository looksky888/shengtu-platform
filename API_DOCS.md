# 生图平台 (Shengtu Platform) API 接口文档与接入指南

本文档适用于生图平台（`v4.7+`）对外开放的 **OpenAI 兼容接口 (`/v1/*`)**、**Anthropic Messages 兼容接口 (`/v1/messages`)**、**异步视频生成接口 (`/v1/videos`)** 以及 **模型目录与积分单价查询接口**。

> **在线交互式文档**：登录平台后前往 **「个人中心 → 接口密钥与 API 文档 (`/profile?tab=api`)」**，即可直接生成/管理个人 `sk-` 密钥、一键测试接口连通性，并复制自动带入当前域名与密钥的 `cURL` / `Python` / `JavaScript` 代码示例。

---

## 1. 接入准备与鉴权规范

### 1.1 获取 API Key
1. 登录平台后，点击右上角头像菜单 → **「接口密钥与文档」**（或访问 `/profile?tab=api`）。
2. 点击 **「立即生成接口密钥」**，获取形如 `sk-xxxxxxxxxxxxxxxxxxxxxxxx` 的令牌。
3. **安全说明**：服务端仅持久化存储密钥的 SHA-256 哈希（不可逆）及掩码提示 `key_hint`（如 `sk-abcd••••••••wxyz`）。您可以在个人中心开启「在当前浏览器记住密钥明文」，方便日常复制与调试。

### 1.2 基础地址 (Base URL)
假设您的平台访问地址为 `https://your-domain.com`：

| 接入场景 | Base URL 填写格式 | 说明 |
| :--- | :--- | :--- |
| **OpenAI 官方 SDK (Python / Node)** | `https://your-domain.com/v1` | SDK 会自动在后面拼接 `/images/generations`、`/chat/completions` 等 |
| **影策 (Open-AI-Canvas)** | `https://your-domain.com/v1` | 支持文生图、图生图、异步视频与对话模型全链路接入 |
| **LobeChat / OpenWebUI / Dify** | `https://your-domain.com/v1` | 选择 `OpenAI-Compatible` 渠道 |
| **Cherry Studio / NextChat** | `https://your-domain.com` | 客户端会自动补全 `/v1/...` 路径 |
| **原生 HTTP / cURL 调用** | `https://your-domain.com` | 完整请求路径见下文各接口定义 |

### 1.3 请求头鉴权 (Authentication Headers)
所有 `/v1/*` 接口均支持以下任意一种鉴权请求头：

```http
Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxx
```
或：
```http
X-API-Key: sk-xxxxxxxxxxxxxxxxxxxxxxxx
```
（Anthropic `/v1/messages` 接口同时支持小写 `x-api-key: sk-xxxxxxxxxxxxxxxxxxxxxxxx`）。

---

## 2. 模型目录与积分计费查询

### 2.1 获取可用模型列表（OpenAI 标准）
- **请求**：`GET /v1/models`
- **权限标识**：`GET /v1/models`

#### cURL 示例
```bash
curl -X GET "https://your-domain.com/v1/models" \
  -H "Authorization: Bearer sk-YOUR_API_KEY"
```

#### 响应示例 (`200 OK`)
```json
{
  "object": "list",
  "data": [
    { "id": "gpt-image-1", "object": "model", "owned_by": "system" },
    { "id": "grok-imagine", "object": "model", "owned_by": "xai" },
    { "id": "grok-imagine-video", "object": "model", "owned_by": "xai" },
    { "id": "gpt-4o", "object": "model", "owned_by": "openai" }
  ]
}
```

### 2.2 获取分类模型与渠道目录
- **请求**：`GET /api/model-catalog`
- **说明**：按 `chat_models`（对话）、`image_models`（文生图）、`image_edit_models`（图生图）、`video_models`（视频）分类返回模型列表及自定义生图渠道模型 `image_channel_models`。

### 2.3 查询实时积分计费标准
- **请求**：`GET /api/creation-pricing`
- **响应示例 (`200 OK`)**：
```json
{
  "image_credit_cost_1080p": 1,
  "image_credit_cost_2k": 2,
  "image_credit_cost_4k": 4,
  "grok_image_credit_cost_1k": 1,
  "grok_image_credit_cost_2k": 2,
  "video_credit_cost_per_second": 2
}
```

---

## 3. 图片生成与编辑接口

### 3.1 文生图 (`POST /v1/images/generations`)
- **请求头**：`Content-Type: application/json`
- **权限标识**：`POST /v1/images/generations`

#### 请求体参数
| 参数名 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :---: | :---: | :--- |
| `model` | `string` | 否 | `"gpt-image-1"` | 模型 ID：`gpt-image-1`、`grok-imagine`、`auto` 或自定义渠道模型 ID |
| `prompt` | `string` | **是** | — | 图像描述提示词 |
| `n` | `integer` | 否 | `1` | 生成图片数量（`1` ~ `4`） |
| `size` | `string` | 否 | `"1024x1024"` | 尺寸或比例，支持 `1024x1024`、`1536x1024`（横版）、`1024x1536`（竖版）、`auto`、`1:1`、`16:9`、`9:16` 等 |
| `quality` | `string` | 否 | `"auto"` | 画质档位：`auto`、`low`、`medium`、`high`、`hd` |
| `response_format` | `string` | 否 | `"url"` | 返回格式：`url`（托管图片 URL）或 `b64_json`（Base64 字符串） |
| `background` | `string` | 否 | `"auto"` | 背景模式：`auto`、`transparent`、`opaque`（模型支持时生效） |
| `output_format` | `string` | 否 | `"png"` | 输出格式：`png`、`webp`、`jpeg` |

#### cURL 示例
```bash
curl -X POST "https://your-domain.com/v1/images/generations" \
  -H "Authorization: Bearer sk-YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-1",
    "prompt": "赛博朋克风格的雨夜霓虹街景，电影级光影，超高清细节",
    "n": 1,
    "size": "1024x1024",
    "quality": "high",
    "response_format": "url"
  }'
```

#### Python (OpenAI SDK) 示例
```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-domain.com/v1",
    api_key="sk-YOUR_API_KEY",
)

result = client.images.generate(
    model="gpt-image-1",
    prompt="赛博朋克风格的雨夜霓虹街景，电影级光影，超高清细节",
    n=1,
    size="1024x1024",
    quality="high",
)
print(result.data[0].url)
```

#### 响应示例 (`200 OK`)
```json
{
  "created": 1760968800,
  "data": [
    {
      "url": "https://your-domain.com/images/20261020_a1b2c3d4.webp",
      "revised_prompt": "赛博朋克风格的雨夜霓虹街景，电影级光影，超高清细节"
    }
  ]
}
```

---

### 3.2 图生图与局部重绘 (`POST /v1/images/edits`)
- **请求头**：`Content-Type: multipart/form-data`
- **权限标识**：`POST /v1/images/edits`

#### 表单字段 (`multipart/form-data`)
| 字段名 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :---: | :---: | :--- |
| `image` 或 `image[]` | `File` | **是** | — | 1 张或多张参考图片文件（支持 PNG / WEBP / JPEG） |
| `mask` | `File` | 否 | — | 局部重绘蒙版 PNG（透明像素代表需要重绘的区域） |
| `prompt` | `string` | **是** | — | 编辑或重绘提示词 |
| `model` | `string` | 否 | `"gpt-image-1"` | 模型 ID：`gpt-image-1`、`grok-imagine` 等 |
| `n` | `integer` | 否 | `1` | 生成数量（`1` ~ `4`） |
| `size` | `string` | 否 | `"1024x1024"` | 输出尺寸：`1024x1024`、`1536x1024`、`1024x1536`、`auto` |

#### cURL 示例
```bash
curl -X POST "https://your-domain.com/v1/images/edits" \
  -H "Authorization: Bearer sk-YOUR_API_KEY" \
  -F "model=gpt-image-1" \
  -F "prompt=将背景替换为日落海滩，保持人物主体与服饰不变" \
  -F "n=1" \
  -F "size=1024x1024" \
  -F "image=@./reference.png"
```

---

## 4. 异步视频生成接口 (`/v1/videos`)

视频生成采用 **异步任务契约**：提交任务立即返回 `202 Accepted` 及 `id`，随后通过 `GET /v1/videos/{id}` 轮询状态，完成后通过 `GET /v1/videos/{id}/content` 获取 `video/mp4` 视频流。

### 4.1 提交视频生成任务 (`POST /v1/videos`)
- **请求头**：支持 `application/json` 或 `multipart/form-data`
- **可选幂等头**：`Idempotency-Key: <1~128位唯一字符串>`（防止网络重试导致重复提交与重复扣费）

#### 请求参数
| 参数名 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :---: | :---: | :--- |
| `prompt` | `string` | **是** | — | 视频内容与运镜提示词 |
| `model` | `string` | 否 | `"grok-imagine-video"` | 视频生成模型 |
| `size` | `string` | 否 | `"16:9"` | 画面比例：`16:9`、`9:16`、`1:1`、`3:2`、`2:3` |
| `seconds` | `integer` | 否 | `6` | 视频时长（秒）：`6` 或 `10` |
| `resolution_name` | `string` | 否 | `"480p"` | 分辨率档位：`480p` 或 `720p` |
| `preset` | `string` | 否 | `"normal"` | 风格预设：`normal`、`fun`、`spicy` |
| `image_reference` | `string` | 否 | — | 首帧参考图（图片 URL 或 `data:image/png;base64,...`；若使用 `multipart/form-data` 可直接上传 `image` 文件字段，最多 8 张） |
| `reference_images` | `string[]` | 否 | — | 额外参考图数组 |
| `client_task_id` | `string` | 否 | 自动生成 | 客户端幂等任务 ID（若同时传 `Idempotency-Key` 需保持一致） |

#### cURL 提交示例
```bash
curl -X POST "https://your-domain.com/v1/videos" \
  -H "Authorization: Bearer sk-YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: video-job-20261020-001" \
  -d '{
    "model": "grok-imagine-video",
    "prompt": "航拍镜头缓缓掠过清晨云海中的雪山之巅，阳光洒满金色云层",
    "size": "16:9",
    "seconds": 6,
    "resolution_name": "720p",
    "preset": "normal"
  }'
```

#### 响应示例 (`202 Accepted`)
```json
{
  "id": "task_01j8x9k2m3n4p5q6r7s8",
  "object": "video",
  "status": "queued",
  "model": "grok-imagine-video",
  "created_at": 1760969000,
  "seconds": 6,
  "size": "16:9",
  "resolution_name": "720p",
  "task_id": "task_01j8x9k2m3n4p5q6r7s8",
  "progress": 0
}
```

### 4.2 查询单个视频任务状态 (`GET /v1/videos/{id}`)
- **状态枚举 (`status`)**：
  - `queued`：排队等待执行
  - `in_progress`：生成中（`progress` 返回 `0` ~ `100` 进度百分比）
  - `completed`：生成成功（返回 `content_url: "/v1/videos/{id}/content"`）
  - `failed`：生成失败（`error` 字段返回具体失败原因，预扣积分自动退回）
  - `cancelled`：已取消

### 4.3 分页查询视频任务列表 (`GET /v1/videos`)
- **查询参数**：
  - `limit`：每页条数（默认 `20`）
  - `after`：游标分页 `next_cursor`
  - `status`：可选过滤 `queued` | `in_progress` | `completed` | `failed` | `cancelled`

### 4.4 下载生成的 MP4 视频流 (`GET /v1/videos/{id}/content`)
- **查询参数**：`?download=1`（可选，附加 `Content-Disposition: attachment` 触发文件下载）
- **返回类型**：`video/mp4` 二进制流

### 4.5 取消视频任务 (`DELETE /v1/videos/{id}`)
- 取消本人正在排队或运行中的视频任务，并返回更新后的任务对象。

---

## 5. 对话与多模态协议

### 5.1 OpenAI Chat Completions (`POST /v1/chat/completions`)
- 完全兼容 OpenAI Chat Completions 格式（支持 `stream: true` SSE 流式输出）。
- 当 `model` 指定为生图模型（或请求体包含生图标识）时，支持直接通过对话协议触发文生图并返回 Markdown 图片链接。

### 5.2 OpenAI Responses API (`POST /v1/responses`)
- 兼容 OpenAI Responses API，支持 `image_generation` 工具调用并自动联动积分结算。

### 5.3 Anthropic Messages API (`POST /v1/messages`)
- 兼容 Anthropic Claude Messages 协议，支持 `x-api-key` 或 `Authorization: Bearer` 鉴权头。

---

## 6. 速率限制 (Rate Limits)、状态码与自动退费机制

| HTTP 状态码 | 含义 | 处理建议 |
| :---: | :--- | :--- |
| `200 OK` | 请求成功 | 同步接口正常返回结果 |
| `202 Accepted` | 异步任务已受理 | 视频生成接口正常受理，请使用 `id` 轮询进度 |
| `400 Bad Request` | 参数校验失败或积分不足 | 检查 JSON 格式、模型尺寸限制或账户积分余额 |
| `401 Unauthorized` | 鉴权失败 | 检查 `Authorization: Bearer sk-...` 是否正确、密钥是否启用 |
| `403 Forbidden` | 权限不足 | 当前账号所属 RBAC 角色未勾选对应接口权限 |
| `429 Too Many Requests` | 触发 API Key 速率限制 | 响应头带 `Retry-After: 60`，请根据个人中心展示的 `RPM / 最大并发 / 每日上限` 控制并发节奏 |
| `502 / 503` | 上游服务暂时不可用 | 预扣积分会自动全额退还，可稍后重试 |
