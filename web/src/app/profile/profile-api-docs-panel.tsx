import { useMemo, useState } from "react";
import {
  BookOpen,
  Code2,
  Copy,
  FileCode2,
  Film,
  Image as ImageIcon,
  KeyRound,
  Layers,
  MessageSquareCode,
  ShieldAlert,
  Sparkles,
  Terminal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubNav } from "@/components/ui/sub-nav";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type DocCategory = "all" | "image" | "video" | "chat" | "system";
type CodeLang = "curl" | "python" | "javascript";

type EndpointParam = {
  name: string;
  type: string;
  required?: boolean;
  defaultValue?: string;
  description: string;
};

type EndpointDoc = {
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

const DOC_CATEGORIES: Array<{
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

const CODE_LANGS: Array<{ value: CodeLang; label: string }> = [
  { value: "curl", label: "cURL" },
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript / Node" },
];

function buildEndpoints(baseUrl: string, apiKey: string): EndpointDoc[] {
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

export function ProfileApiDocsPanel({
  activePlaintextKey,
  onCopy,
}: {
  activePlaintextKey: string;
  onCopy: (value: string, label?: string) => void;
}) {
  const [category, setCategory] = useState<DocCategory>("all");
  const [lang, setLang] = useState<CodeLang>("curl");
  const [injectRealKey, setInjectRealKey] = useState(true);

  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://your-domain.example.com";

  const effectiveKey =
    injectRealKey && activePlaintextKey
      ? activePlaintextKey
      : "sk-YOUR_API_KEY";

  const endpoints = useMemo(
    () => buildEndpoints(origin, effectiveKey),
    [origin, effectiveKey]
  );

  const filteredEndpoints = useMemo(
    () =>
      category === "all"
        ? endpoints
        : endpoints.filter((item) => item.category === category),
    [category, endpoints]
  );

  return (
    <Card id="profile-api-docs">
      <CardHeader className="border-b border-border/70 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-border bg-brand-soft text-brand">
              <BookOpen className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base font-semibold">
                  API 接口文档与对接指南
                </CardTitle>
                <Badge variant="info" className="rounded-md">
                  OpenAI / Anthropic 兼容
                </Badge>
              </div>
              <CardDescription className="mt-0.5">
                支持一键复制 cURL / Python / JS 调用代码，可直接对接影策
                (Open-AI-Canvas)、Cherry Studio、LobeChat、Dify 等客户端
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border/80 bg-surface-muted/55 px-3 py-1.5 text-xs">
              <KeyRound className="size-3.5 text-brand" />
              <span className="text-foreground">代码示例自动填入我的密钥</span>
              <Switch
                checked={injectRealKey && Boolean(activePlaintextKey)}
                disabled={!activePlaintextKey}
                onCheckedChange={setInjectRealKey}
                aria-label="代码示例自动填入我的密钥"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <SubNav
            items={DOC_CATEGORIES}
            value={category}
            onValueChange={setCategory}
            variant="pill"
            layoutId="api-docs-category-nav"
          />
          <SubNav
            items={CODE_LANGS}
            value={lang}
            onValueChange={setLang}
            variant="pill"
            size="sm"
            layoutId="api-docs-lang-nav"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        {/* 第三方客户端快速接入速查 */}
        <div className="rounded-xl border border-border/80 bg-surface-muted/35 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Sparkles className="size-4 text-brand" />
              主流 AI 客户端 / 工作流对接配置速查
            </div>
            <span className="text-[11px] text-muted-foreground">
              所有客户端均选择「OpenAI 兼容 (OpenAI-Compatible)」渠道类型
            </span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <ClientConfigCard
              name="影策 (Open-AI-Canvas)"
              baseUrl={`${origin}/v1`}
              models="gpt-image-1, grok-imagine, grok-imagine-video"
              note="生图/改图/异步视频全链路原生兼容"
              onCopy={(val) => onCopy(val, "影策 Base URL")}
            />
            <ClientConfigCard
              name="Cherry Studio / NextChat"
              baseUrl={origin}
              models="gpt-4o, grok-3, gpt-image-1"
              note="如客户端自动拼接 /v1，请填根域名；否则填 /v1"
              onCopy={(val) => onCopy(val, "客户端地址")}
            />
            <ClientConfigCard
              name="LobeChat / OpenWebUI"
              baseUrl={`${origin}/v1`}
              models="gpt-4o, gpt-image-1, grok-imagine"
              note="在「模型服务商 -> OpenAI」中填入代理地址与 API Key"
              onCopy={(val) => onCopy(val, "LobeChat 代理地址")}
            />
            <ClientConfigCard
              name="Dify / n8n / Coze 工作流"
              baseUrl={`${origin}/v1`}
              models="POST /v1/images/generations & /v1/videos"
              note="HTTP 节点添加 Header: Authorization: Bearer sk-..."
              onCopy={(val) => onCopy(val, "工作流 Base URL")}
            />
          </div>
        </div>

        {/* 接口列表 */}
        <div className="space-y-5">
          {filteredEndpoints.map((ep) => (
            <EndpointDocCard
              key={ep.id}
              endpoint={ep}
              lang={lang}
              onLangChange={setLang}
              onCopy={onCopy}
            />
          ))}
        </div>

        {/* 状态码与错误处理规范 */}
        <div className="rounded-xl border border-border/80 bg-surface-muted/30 p-4">
          <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-foreground">
            <ShieldAlert className="size-4 text-amber-500" />
            HTTP 状态码、限流与计费退费说明
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <StatusNote
              code="200 OK / 202 Accepted"
              desc="生图/对话同步返回 200；异步视频提交返回 202 Accepted 并附带 task_id。"
            />
            <StatusNote
              code="401 Unauthorized"
              desc="缺少 Authorization / X-API-Key 请求头，或密钥已被禁用、轮换失效。"
            />
            <StatusNote
              code="403 Forbidden"
              desc="当前用户角色未授权该 API 路径，或单次请求超出角色配额限制。"
            />
            <StatusNote
              code="400 / 402 积分不足"
              desc="账户积分余额不足以支付当前分辨率或视频时长，请前往充值中心或签到。"
            />
            <StatusNote
              code="429 Too Many Requests"
              desc="触发 API Key 的 RPM、并发数或每日调用上限，响应头包含 Retry-After: 60。"
            />
            <StatusNote
              code="失败自动退费保障"
              desc="生图或视频任务若因上游超时/异常失败，系统自动原路退还预扣积分。"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ClientConfigCard({
  name,
  baseUrl,
  models,
  note,
  onCopy,
}: {
  name: string;
  baseUrl: string;
  models: string;
  note: string;
  onCopy: (val: string) => void;
}) {
  return (
    <div className="flex flex-col justify-between gap-2 rounded-xl border border-border/75 bg-surface p-3">
      <div>
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-xs font-semibold text-foreground">{name}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onCopy(baseUrl)}
          >
            <Copy className="size-3" />
            复制地址
          </Button>
        </div>
        <code className="mt-1 block truncate rounded bg-surface-muted px-2 py-1 font-mono text-[11px] text-brand">
          {baseUrl}
        </code>
      </div>
      <div className="space-y-0.5 text-[11px] text-muted-foreground">
        <div className="truncate">
          <strong className="font-medium text-foreground">推荐模型：</strong>
          {models}
        </div>
        <p className="line-clamp-2">{note}</p>
      </div>
    </div>
  );
}

function EndpointDocCard({
  endpoint,
  lang,
  onLangChange,
  onCopy,
}: {
  endpoint: EndpointDoc;
  lang: CodeLang;
  onLangChange: (next: CodeLang) => void;
  onCopy: (value: string, label?: string) => void;
}) {
  const code = endpoint.snippets[lang];

  return (
    <div className="overflow-hidden rounded-2xl border border-border/85 bg-surface">
      <div className="flex flex-col gap-2 border-b border-border/70 bg-surface-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-md px-2 py-0.5 font-mono text-xs font-bold",
              endpoint.method === "GET" &&
                "bg-sky-500/15 text-sky-700 dark:text-sky-300",
              endpoint.method === "POST" &&
                "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
              endpoint.method === "DELETE" &&
                "bg-rose-500/15 text-rose-700 dark:text-rose-300"
            )}
          >
            {endpoint.method}
          </span>
          <code className="font-mono text-xs font-semibold text-foreground sm:text-sm">
            {endpoint.path}
          </code>
          <span className="text-xs font-medium text-muted-foreground">
            — {endpoint.title}
          </span>
        </div>
        {endpoint.contentType ? (
          <Badge variant="outline" className="w-fit font-mono text-[11px]">
            {endpoint.contentType}
          </Badge>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {endpoint.summary}
        </p>

        {endpoint.params && endpoint.params.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border/75">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/70 bg-surface-muted/60 text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">参数名</th>
                  <th className="px-3 py-2 font-semibold">类型</th>
                  <th className="px-3 py-2 font-semibold">必填</th>
                  <th className="px-3 py-2 font-semibold">默认值</th>
                  <th className="px-3 py-2 font-semibold">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {endpoint.params.map((param) => (
                  <tr key={param.name} className="hover:bg-surface-hover/50">
                    <td className="px-3 py-2 font-mono font-medium text-foreground whitespace-nowrap">
                      {param.name}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      {param.type}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {param.required ? (
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          必填
                        </span>
                      ) : (
                        <span className="text-muted-foreground">可选</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      {param.defaultValue ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {param.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[1.25fr_0.75fr]">
          {/* 请求示例 */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-border/80 bg-zinc-950 text-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-[11px]">
              <div className="flex items-center gap-1.5">
                <Terminal className="size-3.5 text-sky-400" />
                <span className="font-medium text-zinc-300">请求代码示例</span>
                <div className="ml-2 flex items-center gap-1">
                  {CODE_LANGS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => onLangChange(item.value)}
                      className={cn(
                        "rounded px-2 py-0.5 text-[11px] transition-colors",
                        lang === item.value
                          ? "bg-sky-500/20 font-semibold text-sky-300"
                          : "text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-6 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                onClick={() => onCopy(code, `${endpoint.title} 代码`)}
              >
                <Copy className="size-3" />
                复制代码
              </Button>
            </div>
            <pre className="thin-scrollbar overflow-x-auto p-3 font-mono text-xs leading-5 text-zinc-100">
              <code>{code}</code>
            </pre>
          </div>

          {/* 响应示例 */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-border/80 bg-zinc-950 text-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-medium text-zinc-300">
                <Code2 className="size-3.5 text-emerald-400" />
                JSON 响应示例
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-6 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                onClick={() =>
                  onCopy(endpoint.responseExample, `${endpoint.title} 响应示例`)
                }
              >
                <Copy className="size-3" />
                复制
              </Button>
            </div>
            <pre className="thin-scrollbar overflow-x-auto p-3 font-mono text-xs leading-5 text-emerald-300/95">
              <code>{endpoint.responseExample}</code>
            </pre>
          </div>
        </div>

        {endpoint.notes && endpoint.notes.length > 0 ? (
          <div className="rounded-lg bg-brand-soft/60 px-3 py-2 text-xs text-foreground">
            {endpoint.notes.map((note) => (
              <p key={note}>💡 {note}</p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusNote({ code, desc }: { code: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-surface p-2.5">
      <div className="font-mono text-xs font-semibold text-foreground">
        {code}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {desc}
      </p>
    </div>
  );
}
