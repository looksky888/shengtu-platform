import {
  FileCode2,
  Film,
  Image as ImageIcon,
  Layers,
  MessageSquareCode,
} from "lucide-react";

export type DocCategory = "all" | "image" | "video" | "chat" | "system";
export type CodeLang = "curl" | "python" | "javascript";

export type EndpointParam = {
  name: string;
  type: string;
  required?: boolean;
  defaultValue?: string;
  description: string;
};

export type EndpointDoc = {
  id: string;
  category: Exclude<DocCategory, "all">;
  method: "GET" | "POST" | "DELETE";
  path: string;
  title: string;
  summary: string;
  contentType?: string;
  params?: EndpointParam[];
  snippets: Record<CodeLang, string>;
  responseExample: string;
  notes?: string[];
};

export const DOC_CATEGORIES: Array<{
  value: DocCategory;
  label: string;
  icon: typeof Layers;
}> = [
  { value: "all", label: "全部接口", icon: Layers },
  { value: "image", label: "图片生成与编辑", icon: ImageIcon },
  { value: "video", label: "异步视频生成", icon: Film },
  { value: "chat", label: "对话与多模态", icon: MessageSquareCode },
  { value: "system", label: "模型与计费查询", icon: FileCode2 },
];

export const CODE_LANGS: Array<{ value: CodeLang; label: string }> = [
  { value: "curl", label: "cURL" },
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript / Node" },
];

export function buildEndpoints(baseUrl: string, apiKey: string): EndpointDoc[] {
  return [
    {
      id: "models-list",
      category: "system",
      method: "GET",
      path: "/v1/models",
      title: "获取可用模型列表（OpenAI 标准）",
      summary:
        "返回当前平台所有已启用的对话、文生图、图生图与视频生成模型，完全兼容 OpenAI SDK models.list()。",
      snippets: {
        curl: `curl -X GET "${baseUrl}/v1/models" \\
  -H "Authorization: Bearer ${apiKey}"`,
        python: `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="${apiKey}",
)

models = client.models.list()
for m in models.data:
    print(m.id)`,
        javascript: `const response = await fetch("${baseUrl}/v1/models", {
  headers: {
    Authorization: "Bearer ${apiKey}",
  },
});
const data = await response.json();
console.log(data.data.map((m) => m.id));`,
      },
      responseExample: `{
  "object": "list",
  "data": [
    { "id": "gpt-image-1", "object": "model", "owned_by": "system" },
    { "id": "grok-imagine", "object": "model", "owned_by": "xai" },
    { "id": "grok-imagine-video", "object": "model", "owned_by": "xai" },
    { "id": "gpt-4o", "object": "model", "owned_by": "openai" }
  ]
}`,
    },
    {
      id: "image-generations",
      category: "image",
      method: "POST",
      path: "/v1/images/generations",
      title: "文生图（Image Generations）",
      summary:
        "根据文本提示词生成 1~4 张高质量图片，支持 GPT Image、Grok Imagine 及后台配置的自定义生图渠道模型。",
      contentType: "application/json",
      params: [
        {
          name: "model",
          type: "string",
          required: false,
          defaultValue: '"gpt-image-1"',
          description:
            "模型名称，如 gpt-image-1、grok-imagine、auto 或渠道自定义模型 ID",
        },
        {
          name: "prompt",
          type: "string",
          required: true,
          description: "画面描述提示词（支持中英文）",
        },
        {
          name: "n",
          type: "integer",
          required: false,
          defaultValue: "1",
          description: "单次生成张数（1 ~ 4）",
        },
        {
          name: "size",
          type: "string",
          required: false,
          defaultValue: '"1024x1024"',
          description:
            "分辨率尺寸，支持 1024x1024、1536x1024（横版）、1024x1536（竖版）、auto，或比例 1:1 / 16:9 / 9:16",
        },
        {
          name: "quality",
          type: "string",
          required: false,
          defaultValue: '"auto"',
          description: "画质档位：auto、low、medium、high、hd",
        },
        {
          name: "response_format",
          type: "string",
          required: false,
          defaultValue: '"url"',
          description: "返回格式：url（图片直链）或 b64_json（Base64 编码）",
        },
      ],
      snippets: {
        curl: `curl -X POST "${baseUrl}/v1/images/generations" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-1",
    "prompt": "赛博朋克风格的雨夜霓虹街景，电影级光影，超高清细节",
    "n": 1,
    "size": "1024x1024",
    "quality": "high",
    "response_format": "url"
  }'`,
        python: `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="${apiKey}",
)

result = client.images.generate(
    model="gpt-image-1",
    prompt="赛博朋克风格的雨夜霓虹街景，电影级光影，超高清细节",
    n=1,
    size="1024x1024",
    quality="high",
)
print("生成图片 URL:", result.data[0].url)`,
        javascript: `const response = await fetch("${baseUrl}/v1/images/generations", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-image-1",
    prompt: "赛博朋克风格的雨夜霓虹街景，电影级光影，超高清细节",
    n: 1,
    size: "1024x1024",
    quality: "high",
  }),
});
const data = await response.json();
console.log("生成图片 URL:", data.data?.[0]?.url);`,
      },
      responseExample: `{
  "created": 1760968800,
  "data": [
    {
      "url": "${baseUrl}/images/20261020_a1b2c3d4.webp",
      "revised_prompt": "赛博朋克风格的雨夜霓虹街景，电影级光影，超高清细节"
    }
  ]
}`,
      notes: [
        "系统会在任务开始前预扣对应档位积分；若上游生成失败，系统将自动全额退还已预扣积分。",
      ],
    },
    {
      id: "image-edits",
      category: "image",
      method: "POST",
      path: "/v1/images/edits",
      title: "图生图与局部重绘（Image Edits）",
      summary:
        "通过 multipart/form-data 上传 1 张或多张参考图（及可选透明蒙版 mask），执行风格迁移、图像融合或局部重绘。",
      contentType: "multipart/form-data",
      params: [
        {
          name: "image / image[]",
          type: "file",
          required: true,
          description: "上传的参考图片文件（支持 PNG / WEBP / JPG，可传多张）",
        },
        {
          name: "mask",
          type: "file",
          required: false,
          description:
            "可选局部重绘蒙版 PNG（透明区域表示需要重绘的区域）",
        },
        {
          name: "prompt",
          type: "string",
          required: true,
          description: "改图或重绘指令描述",
        },
        {
          name: "model",
          type: "string",
          required: false,
          defaultValue: '"gpt-image-1"',
          description: "生图模型 ID（如 gpt-image-1、grok-imagine）",
        },
        {
          name: "n",
          type: "integer",
          required: false,
          defaultValue: "1",
          description: "生成张数（1 ~ 4）",
        },
        {
          name: "size",
          type: "string",
          required: false,
          defaultValue: '"1024x1024"',
          description: "输出尺寸，如 1024x1024、1536x1024、1024x1536、auto",
        },
      ],
      snippets: {
        curl: `curl -X POST "${baseUrl}/v1/images/edits" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -F "model=gpt-image-1" \\
  -F "prompt=将背景替换为日落海滩，保持人物主体不变" \\
  -F "n=1" \\
  -F "size=1024x1024" \\
  -F "image=@./reference.png"`,
        python: `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="${apiKey}",
)

with open("reference.png", "rb") as image_file:
    result = client.images.edit(
        model="gpt-image-1",
        image=image_file,
        prompt="将背景替换为日落海滩，保持人物主体不变",
        n=1,
        size="1024x1024",
    )
print("改图结果 URL:", result.data[0].url)`,
        javascript: `const form = new FormData();
form.append("model", "gpt-image-1");
form.append("prompt", "将背景替换为日落海滩，保持人物主体不变");
form.append("size", "1024x1024");
form.append("image", fileInput.files[0]);

const response = await fetch("${baseUrl}/v1/images/edits", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${apiKey}",
  },
  body: form,
});
const data = await response.json();
console.log(data.data?.[0]?.url);`,
      },
      responseExample: `{
  "created": 1760968900,
  "data": [
    {
      "url": "${baseUrl}/images/20261020_edit_9f8e7d.webp"
    }
  ]
}`,
    },
    {
      id: "videos-submit",
      category: "video",
      method: "POST",
      path: "/v1/videos",
      title: "提交异步视频生成任务（Submit Video）",
      summary:
        "支持文生视频与首帧/多参考图生视频（最多 8 张参考图）。接口立即返回 202 Accepted 与任务 ID，可通过 GET /v1/videos/{id} 轮询进度。",
      contentType: "application/json 或 multipart/form-data",
      params: [
        {
          name: "prompt",
          type: "string",
          required: true,
          description: "视频画面与运镜提示词",
        },
        {
          name: "model",
          type: "string",
          required: false,
          defaultValue: '"grok-imagine-video"',
          description: "视频生成模型名称",
        },
        {
          name: "size",
          type: "string",
          required: false,
          defaultValue: '"16:9"',
          description: "画面比例：16:9、9:16、1:1、3:2、2:3",
        },
        {
          name: "seconds",
          type: "integer",
          required: false,
          defaultValue: "6",
          description: "视频时长（秒），支持 6 或 10",
        },
        {
          name: "resolution_name",
          type: "string",
          required: false,
          defaultValue: '"480p"',
          description: "清晰度档位：480p 或 720p",
        },
        {
          name: "preset",
          type: "string",
          required: false,
          defaultValue: '"normal"',
          description: "风格预设：normal、fun、spicy",
        },
        {
          name: "image_reference",
          type: "string",
          required: false,
          description:
            "可选首帧参考图（支持 https:// 图片 URL 或 data:image/...;base64,...）",
        },
        {
          name: "Idempotency-Key (Header)",
          type: "string",
          required: false,
          description:
            "可选幂等键（1~128 字符），相同幂等键与参数不会重复扣费提交",
        },
      ],
      snippets: {
        curl: `curl -X POST "${baseUrl}/v1/videos" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: video-req-001" \\
  -d '{
    "model": "grok-imagine-video",
    "prompt": "航拍镜头缓缓掠过清晨云海中的雪山之巅，阳光洒满金色云层",
    "size": "16:9",
    "seconds": 6,
    "resolution_name": "720p",
    "preset": "normal"
  }'`,
        python: `import time
import requests

headers = {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json",
}

# 1. 提交视频任务
resp = requests.post(
    "${baseUrl}/v1/videos",
    headers=headers,
    json={
        "model": "grok-imagine-video",
        "prompt": "航拍镜头缓缓掠过清晨云海中的雪山之巅，阳光洒满金色云层",
        "size": "16:9",
        "seconds": 6,
        "resolution_name": "720p",
    },
)
task = resp.json()
video_id = task["id"]
print("已提交任务:", video_id)

# 2. 轮询直到完成
while True:
    status_resp = requests.get(f"${baseUrl}/v1/videos/{video_id}", headers=headers).json()
    print(f"状态: {status_resp['status']} 进度: {status_resp.get('progress', 0)}%")
    if status_resp["status"] in ("completed", "failed", "cancelled"):
        print("最终结果:", status_resp)
        break
    time.sleep(3)`,
        javascript: `const submitRes = await fetch("${baseUrl}/v1/videos", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "grok-imagine-video",
    prompt: "航拍镜头缓缓掠过清晨云海中的雪山之巅，阳光洒满金色云层",
    size: "16:9",
    seconds: 6,
    resolution_name: "720p",
  }),
});
const task = await submitRes.json();
console.log("任务 ID:", task.id);`,
      },
      responseExample: `{
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
}`,
    },
    {
      id: "videos-status-content",
      category: "video",
      method: "GET",
      path: "/v1/videos/{id} & /v1/videos/{id}/content",
      title: "查询视频状态、下载 MP4 与取消任务",
      summary:
        "轮询单任务进度（0~100%）、分页列出历史视频任务、流式下载生成的 MP4 文件或取消排队中的任务。",
      params: [
        {
          name: "GET /v1/videos/{id}",
          type: "endpoint",
          required: true,
          description:
            "返回 status（queued / in_progress / completed / failed / cancelled）、progress 与 content_url",
        },
        {
          name: "GET /v1/videos/{id}/content?download=1",
          type: "endpoint",
          required: false,
          description:
            "当 status=completed 时直接返回 video/mp4 二进制流；加 download=1 触发附件下载",
        },
        {
          name: "GET /v1/videos?limit=20&status=completed",
          type: "endpoint",
          required: false,
          description: "分页查询当前账号的视频任务列表",
        },
        {
          name: "DELETE /v1/videos/{id}",
          type: "endpoint",
          required: false,
          description: "取消正在排队或执行中的视频生成任务",
        },
      ],
      snippets: {
        curl: `# 1. 查询视频任务状态
curl -X GET "${baseUrl}/v1/videos/task_01j8x9k2m3n4p5q6r7s8" \\
  -H "Authorization: Bearer ${apiKey}"

# 2. 下载已完成的 MP4 视频文件
curl -L "${baseUrl}/v1/videos/task_01j8x9k2m3n4p5q6r7s8/content?download=1" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -o output.mp4`,
        python: `import requests

video_id = "task_01j8x9k2m3n4p5q6r7s8"
headers = {"Authorization": "Bearer ${apiKey}"}

# 下载 MP4 文件
with requests.get(
    f"${baseUrl}/v1/videos/{video_id}/content?download=1",
    headers=headers,
    stream=True,
) as r:
    r.raise_for_status()
    with open("output.mp4", "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
print("已保存 output.mp4")`,
        javascript: `// 查询任务状态
const res = await fetch("${baseUrl}/v1/videos/task_01j8x9k2m3n4p5q6r7s8", {
  headers: { Authorization: "Bearer ${apiKey}" },
});
const video = await res.json();
if (video.status === "completed") {
  console.log("下载链接:", "${baseUrl}" + video.content_url + "?download=1");
}`,
      },
      responseExample: `{
  "id": "task_01j8x9k2m3n4p5q6r7s8",
  "object": "video",
  "status": "completed",
  "model": "grok-imagine-video",
  "created_at": 1760969000,
  "seconds": 6,
  "size": "16:9",
  "resolution_name": "720p",
  "task_id": "task_01j8x9k2m3n4p5q6r7s8",
  "progress": 100,
  "content_url": "/v1/videos/task_01j8x9k2m3n4p5q6r7s8/content"
}`,
    },
    {
      id: "chat-completions",
      category: "chat",
      method: "POST",
      path: "/v1/chat/completions",
      title: "对话与多模态生成（Chat Completions）",
      summary:
        "100% 兼容 OpenAI Chat Completions 协议（支持流式 SSE stream: true），同时支持通过对话模型直接触发文生图与 Grok 对话。",
      contentType: "application/json",
      params: [
        {
          name: "model",
          type: "string",
          required: true,
          description: "对话或生图模型名称，如 gpt-4o、grok-3、gpt-image-1",
        },
        {
          name: "messages",
          type: "array",
          required: true,
          description: "OpenAI 标准消息数组 [{ role: 'user', content: '...' }]",
        },
        {
          name: "stream",
          type: "boolean",
          required: false,
          defaultValue: "false",
          description: "是否启用 Server-Sent Events (SSE) 流式输出",
        },
      ],
      snippets: {
        curl: `curl -X POST "${baseUrl}/v1/chat/completions" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      { "role": "user", "content": "请帮我写一段极具画面感的电影分镜提示词" }
    ],
    "stream": false
  }'`,
        python: `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="${apiKey}",
)

completion = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": "请帮我写一段极具画面感的电影分镜提示词"}
    ],
)
print(completion.choices[0].message.content)`,
        javascript: `const response = await fetch("${baseUrl}/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-4o",
    messages: [{ role: "user", content: "请帮我写一段极具画面感的电影分镜提示词" }],
  }),
});
const data = await response.json();
console.log(data.choices?.[0]?.message?.content);`,
      },
      responseExample: `{
  "id": "chatcmpl-9f8e7d6c",
  "object": "chat.completion",
  "created": 1760969100,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "镜头缓缓推进，暮色中的古老钟楼在雨雾中若隐若现……"
      },
      "finish_reason": "stop"
    }
  ]
}`,
    },
    {
      id: "responses-and-messages",
      category: "chat",
      method: "POST",
      path: "/v1/responses & /v1/messages",
      title: "OpenAI Responses API 与 Anthropic Messages 协议",
      summary:
        "支持新一代 OpenAI Responses API（含 image_generation 工具调用）以及 Anthropic Claude Messages 协议（支持 x-api-key 请求头）。",
      contentType: "application/json",
      snippets: {
        curl: `# OpenAI Responses API
curl -X POST "${baseUrl}/v1/responses" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "input": "用一句话介绍无限画布创作工作流"
  }'

# Anthropic Messages 兼容接口
curl -X POST "${baseUrl}/v1/messages" \\
  -H "x-api-key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "max_tokens": 1024,
    "messages": [{ "role": "user", "content": "Hello!" }]
  }'`,
        python: `import requests

resp = requests.post(
    "${baseUrl}/v1/responses",
    headers={"Authorization": "Bearer ${apiKey}"},
    json={"model": "gpt-4o", "input": "用一句话介绍无限画布创作工作流"},
)
print(resp.json())`,
        javascript: `const res = await fetch("${baseUrl}/v1/responses", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-4o",
    input: "用一句话介绍无限画布创作工作流",
  }),
});
console.log(await res.json());`,
      },
      responseExample: `{
  "id": "resp_01j8x9k",
  "object": "response",
  "status": "completed",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [{ "type": "output_text", "text": "无限画布将多模态生图、视频分镜与节点工作流融合在同一张自由空间中。" }]
    }
  ]
}`,
    },
    {
      id: "catalog-and-pricing",
      category: "system",
      method: "GET",
      path: "/api/model-catalog & /api/creation-pricing",
      title: "分类模型目录与实时积分计费标准查询",
      summary:
        "查询按「对话 / 文生图 / 图生图 / 视频」归类的完整模型列表，以及当前站点各清晰度档位的积分扣费标准。",
      snippets: {
        curl: `# 1. 获取分类模型目录
curl -X GET "${baseUrl}/api/model-catalog" \\
  -H "Authorization: Bearer ${apiKey}"

# 2. 获取创作积分计费单价
curl -X GET "${baseUrl}/api/creation-pricing" \\
  -H "Authorization: Bearer ${apiKey}"`,
        python: `import requests

headers = {"Authorization": "Bearer ${apiKey}"}
catalog = requests.get("${baseUrl}/api/model-catalog", headers=headers).json()
pricing = requests.get("${baseUrl}/api/creation-pricing", headers=headers).json()

print("文生图模型:", catalog.get("image_models"))
print("视频模型:", catalog.get("video_models"))
print("积分定价:", pricing)`,
        javascript: `const [catalogRes, pricingRes] = await Promise.all([
  fetch("${baseUrl}/api/model-catalog", { headers: { Authorization: "Bearer ${apiKey}" } }),
  fetch("${baseUrl}/api/creation-pricing", { headers: { Authorization: "Bearer ${apiKey}" } }),
]);
console.log("Catalog:", await catalogRes.json());
console.log("Pricing:", await pricingRes.json());`,
      },
      responseExample: `{
  "image_credit_cost_1080p": 1,
  "image_credit_cost_2k": 2,
  "image_credit_cost_4k": 4,
  "grok_image_credit_cost_1k": 1,
  "grok_image_credit_cost_2k": 2,
  "video_credit_cost_per_second": 2
}`,
    },
  ];
}
