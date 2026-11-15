import {
  Coins,
  Film,
  Image as ImageIcon,
  Layers,
  MessageSquareCode,
} from "lucide-react";

export type DocCategory = "all" | "image" | "video" | "chat" | "account";
export type CodeLang = "curl" | "python" | "javascript";

export type EndpointParam = {
  name: string;
  type: string;
  required?: boolean;
  defaultValue?: string;
  description: string;
};

export type EndpointSnippetPreset = {
  id: string;
  label: string;
  badge?: string;
  note?: string;
  snippets: Record<CodeLang, string>;
  responseExample: string;
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
  presets?: EndpointSnippetPreset[];
  snippets: Record<CodeLang, string>;
  responseExample: string;
  notes?: string[];
};

export type ModelPricingRow = {
  model: string;
  recommended?: boolean;
  price: string;
  capabilities: string;
};

export const MODEL_PRICING_ROWS: ReadonlyArray<ModelPricingRow> = [
  {
    model: "gpt-image-2.6-flare",
    recommended: true,
    price: "5 积分/张",
    capabilities: "支持文生图、参考图改图、直出 GIF 动图",
  },
  {
    model: "gpt-image-2.6",
    price: "5 积分/张",
    capabilities: "支持文生图、改图、GIF 动图",
  },
  {
    model: "gpt-image-2.6-sunburst",
    price: "5 积分/张",
    capabilities: "支持文生图、改图、GIF 动图",
  },
  {
    model: "gpt-image-2.5-flare / gpt-image-2.5-sunburst",
    price: "3 积分/张",
    capabilities: "高清静态图 PNG / JPEG / WebP",
  },
  {
    model: "gpt-image-2.5",
    price: "2 积分/张",
    capabilities: "标准静态图 PNG / JPEG / WebP",
  },
  {
    model: "gpt-image-2",
    price: "1 积分/张",
    capabilities: "轻量快速静态图 PNG / JPEG / WebP",
  },
  {
    model: "grok-imagine-image",
    price: "1K 1 积分 / 2K 2 积分",
    capabilities: "Grok 生图与参考图改图",
  },
  {
    model: "grok-imagine-video",
    price: "1 积分/秒",
    capabilities: "Grok 视频生成（支持首帧参考图）",
  },
];

export const DOC_CATEGORIES: Array<{
  value: DocCategory;
  label: string;
  icon: typeof Layers;
}> = [
  { value: "all", label: "全部接口", icon: Layers },
  { value: "image", label: "生图与 GIF", icon: ImageIcon },
  { value: "video", label: "生成视频", icon: Film },
  { value: "chat", label: "对话方式调用", icon: MessageSquareCode },
  { value: "account", label: "查模型与查积分", icon: Coins },
];

export const CODE_LANGS: Array<{ value: CodeLang; label: string }> = [
  { value: "curl", label: "cURL" },
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript / Node" },
];

export function buildEndpoints(baseUrl: string, apiKey: string): EndpointDoc[] {
  const imageStandardSnippets: Record<CodeLang, string> = {
    curl: `curl -X POST "${baseUrl}/v1/images/generations" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2.6-flare",
    "prompt": "清晨阳光洒进木质咖啡馆，桌面一杯拿铁冒着热气，电影质感",
    "n": 1,
    "size": "1024x1024",
    "quality": "high",
    "response_format": "url"
  }'`,
    python: `import requests

resp = requests.post(
    "${baseUrl}/v1/images/generations",
    headers={
        "Authorization": "Bearer ${apiKey}",
        "Content-Type": "application/json",
    },
    json={
        "model": "gpt-image-2.6-flare",
        "prompt": "清晨阳光洒进木质咖啡馆，桌面一杯拿铁冒着热气，电影质感",
        "n": 1,
        "size": "1024x1024",
        "quality": "high",
        "response_format": "url",
    },
)
resp.raise_for_status()
print("生成图片链接:", resp.json()["data"][0]["url"])`,
    javascript: `const response = await fetch("${baseUrl}/v1/images/generations", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-image-2.6-flare",
    prompt: "清晨阳光洒进木质咖啡馆，桌面一杯拿铁冒着热气，电影质感",
    n: 1,
    size: "1024x1024",
    quality: "high",
    response_format: "url",
  }),
});
const data = await response.json();
console.log("生成图片链接:", data.data?.[0]?.url);`,
  };

  const imageStandardResponse = `{
  "created": 1760968800,
  "data": [
    {
      "url": "${baseUrl}/images/20261114_a1b2c3d4.png",
      "revised_prompt": "清晨阳光洒进木质咖啡馆，桌面一杯拿铁冒着热气，电影质感"
    }
  ]
}`;

  const imageGifSnippets: Record<CodeLang, string> = {
    curl: `curl -X POST "${baseUrl}/v1/images/generations" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2.6-flare",
    "prompt": "像素风橘猫在窗边轻轻摇尾巴眨眼，流畅循环小动画",
    "size": "1024x1024",
    "output_format": "gif",
    "frame_count": 12,
    "frame_duration_ms": 100,
    "response_format": "url"
  }'`,
    python: `import requests

resp = requests.post(
    "${baseUrl}/v1/images/generations",
    headers={
        "Authorization": "Bearer ${apiKey}",
        "Content-Type": "application/json",
    },
    json={
        "model": "gpt-image-2.6-flare",
        "prompt": "像素风橘猫在窗边轻轻摇尾巴眨眼，流畅循环小动画",
        "size": "1024x1024",
        "output_format": "gif",
        "frame_count": 12,
        "frame_duration_ms": 100,
        "response_format": "url",
    },
)
resp.raise_for_status()
print("GIF 动图链接:", resp.json()["data"][0]["url"])`,
    javascript: `const response = await fetch("${baseUrl}/v1/images/generations", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-image-2.6-flare",
    prompt: "像素风橘猫在窗边轻轻摇尾巴眨眼，流畅循环小动画",
    size: "1024x1024",
    output_format: "gif",
    frame_count: 12,
    frame_duration_ms: 100,
    response_format: "url",
  }),
});
const data = await response.json();
console.log("GIF 动图链接:", data.data?.[0]?.url);`,
  };

  const imageGifResponse = `{
  "created": 1760968860,
  "output_format": "gif",
  "data": [
    {
      "url": "${baseUrl}/images/20261114_cat_loop.gif"
    }
  ]
}`;

  const editStandardSnippets: Record<CodeLang, string> = {
    curl: `curl -X POST "${baseUrl}/v1/images/edits" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -F "model=gpt-image-2.6-flare" \\
  -F "prompt=把背景换成夕阳海边，保留人物表情和穿搭不变" \\
  -F "size=1024x1024" \\
  -F "image=@./photo1.png" \\
  -F "image=@./style_ref.png"`,
    python: `import requests

with open("photo1.png", "rb") as img1, open("style_ref.png", "rb") as img2:
    resp = requests.post(
        "${baseUrl}/v1/images/edits",
        headers={"Authorization": "Bearer ${apiKey}"},
        data={
            "model": "gpt-image-2.6-flare",
            "prompt": "把背景换成夕阳海边，保留人物表情和穿搭不变",
            "size": "1024x1024",
        },
        files=[
            ("image", ("photo1.png", img1, "image/png")),
            ("image", ("style_ref.png", img2, "image/png")),
        ],
    )
resp.raise_for_status()
print("改图结果链接:", resp.json()["data"][0]["url"])`,
    javascript: `const form = new FormData();
form.append("model", "gpt-image-2.6-flare");
form.append("prompt", "把背景换成夕阳海边，保留人物表情和穿搭不变");
form.append("size", "1024x1024");
form.append("image", fileInput.files[0]);
// 如有多张参考图，继续 append 同名 "image" 字段即可

const response = await fetch("${baseUrl}/v1/images/edits", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${apiKey}",
  },
  body: form,
});
const data = await response.json();
console.log("改图结果链接:", data.data?.[0]?.url);`,
  };

  const editGifSnippets: Record<CodeLang, string> = {
    curl: `curl -X POST "${baseUrl}/v1/images/edits" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -F "model=gpt-image-2.6-flare" \\
  -F "prompt=让画面里的角色轻轻挥手微笑，做成自然循环动图" \\
  -F "output_format=gif" \\
  -F "frame_count=12" \\
  -F "frame_duration_ms=100" \\
  -F "image=@./avatar.png"`,
    python: `import requests

with open("avatar.png", "rb") as img:
    resp = requests.post(
        "${baseUrl}/v1/images/edits",
        headers={"Authorization": "Bearer ${apiKey}"},
        data={
            "model": "gpt-image-2.6-flare",
            "prompt": "让画面里的角色轻轻挥手微笑，做成自然循环动图",
            "output_format": "gif",
            "frame_count": "12",
            "frame_duration_ms": "100",
        },
        files=[("image", ("avatar.png", img, "image/png"))],
    )
resp.raise_for_status()
print("图生 GIF 链接:", resp.json()["data"][0]["url"])`,
    javascript: `const form = new FormData();
form.append("model", "gpt-image-2.6-flare");
form.append("prompt", "让画面里的角色轻轻挥手微笑，做成自然循环动图");
form.append("output_format", "gif");
form.append("frame_count", "12");
form.append("frame_duration_ms", "100");
form.append("image", fileInput.files[0]);

const response = await fetch("${baseUrl}/v1/images/edits", {
  method: "POST",
  headers: { Authorization: "Bearer ${apiKey}" },
  body: form,
});
const data = await response.json();
console.log("图生 GIF 链接:", data.data?.[0]?.url);`,
  };

  return [
    {
      id: "image-generations",
      category: "image",
      method: "POST",
      path: "/v1/images/generations",
      title: "文生图 & 生成 GIF 动图",
      summary:
        "输入一段文字就能生成高清图片；把 output_format 设成 gif 并选用 2.6 系列模型（如 gpt-image-2.6-flare），还能直接生成 GIF 动图。",
      contentType: "application/json",
      presets: [
        {
          id: "standard",
          label: "A. 普通高清生图",
          snippets: imageStandardSnippets,
          responseExample: imageStandardResponse,
        },
        {
          id: "gif",
          label: "B. 生成 GIF 动图",
          badge: "2.6 专属",
          note: "注意：生成 GIF 时不要开启 stream: true 流式参数，且仅 gpt-image-2.6-flare / gpt-image-2.6 / gpt-image-2.6-sunburst 支持 gif。",
          snippets: imageGifSnippets,
          responseExample: imageGifResponse,
        },
      ],
      params: [
        {
          name: "model",
          type: "string",
          required: false,
          defaultValue: '"gpt-image-2.6-flare"',
          description:
            "模型名称，默认推荐 gpt-image-2.6-flare（支持静态图与 GIF）；也可选 gpt-image-2.6、gpt-image-2.6-sunburst、grok-imagine-image 等",
        },
        {
          name: "prompt",
          type: "string",
          required: true,
          description: "画面描述（中文、英文都可以）",
        },
        {
          name: "n",
          type: "integer",
          required: false,
          defaultValue: "1",
          description: "一次生成几张图（1 ~ 15），按实际张数扣积分",
        },
        {
          name: "size",
          type: "string",
          required: false,
          defaultValue: '"1024x1024"',
          description:
            "图片尺寸，常用 1024x1024（方图）、1536x1024（横图）、1024x1536（竖图）",
        },
        {
          name: "quality",
          type: "string",
          required: false,
          defaultValue: '"high"',
          description: "画质档位：low / medium / high",
        },
        {
          name: "output_format",
          type: "string",
          required: false,
          defaultValue: '"png"',
          description:
            "图片格式：png / jpeg / webp / gif（选 gif 时请用 2.6 系列模型，且不要开 stream: true）",
        },
        {
          name: "frame_count",
          type: "integer",
          required: false,
          description: "选填，生成 GIF 时的帧数提示（2 ~ 60，例如 12）",
        },
        {
          name: "frame_duration_ms",
          type: "integer",
          required: false,
          description: "选填，生成 GIF 时每帧停留毫秒数提示（20 ~ 2000，例如 100）",
        },
        {
          name: "response_format",
          type: "string",
          required: false,
          defaultValue: '"url"',
          description: "url 返回可直接打开的图片链接，或填 b64_json 返回 Base64 内容",
        },
      ],
      snippets: imageStandardSnippets,
      responseExample: imageStandardResponse,
      notes: [
        "生成 GIF 时不要传 stream: true，并且确保 model 选用 gpt-image-2.6-flare、gpt-image-2.6 或 gpt-image-2.6-sunburst。",
        "开始生成前会先预扣积分；如果上游报错或超时失败，系统会自动把积分退回你的账号。",
      ],
    },
    {
      id: "image-edits",
      category: "image",
      method: "POST",
      path: "/v1/images/edits",
      title: "上传参考图改图 / 图生 GIF",
      summary:
        "用 multipart/form-data 表单上传 1 张或多张参考图，写出你想怎么改（换背景、合图、改动作都行），同样支持直出 GIF 动图。",
      contentType: "multipart/form-data",
      presets: [
        {
          id: "edit-standard",
          label: "A. 上传参考图改图",
          snippets: editStandardSnippets,
          responseExample: `{
  "created": 1760968900,
  "data": [
    {
      "url": "${baseUrl}/images/20261114_edit_9f8e7d.png"
    }
  ]
}`,
        },
        {
          id: "edit-gif",
          label: "B. 参考图生成 GIF",
          badge: "图生 GIF",
          note: "传 output_format=gif 即可把参考图做成动图，同样仅支持 2.6 系列模型。",
          snippets: editGifSnippets,
          responseExample: `{
  "created": 1760968920,
  "output_format": "gif",
  "data": [
    {
      "url": "${baseUrl}/images/20261114_edit_wave.gif"
    }
  ]
}`,
        },
      ],
      params: [
        {
          name: "image",
          type: "file（可多个）",
          required: true,
          description:
            "上传的参考图片文件（支持 PNG / JPG / WEBP / GIF），传多张时重复添加同名 image 字段即可",
        },
        {
          name: "prompt",
          type: "string",
          required: true,
          description: "告诉模型想怎么修改或融合这些参考图",
        },
        {
          name: "model",
          type: "string",
          required: false,
          defaultValue: '"gpt-image-2.6-flare"',
          description: "默认推荐 gpt-image-2.6-flare，也可用 gpt-image-2.6、grok-imagine-image 等",
        },
        {
          name: "n",
          type: "integer",
          required: false,
          defaultValue: "1",
          description: "生成张数（1 ~ 15）",
        },
        {
          name: "size",
          type: "string",
          required: false,
          defaultValue: '"1024x1024"',
          description: "输出尺寸，如 1024x1024、1536x1024、1024x1536",
        },
        {
          name: "output_format",
          type: "string",
          required: false,
          defaultValue: '"png"',
          description: "输出格式：png / jpeg / webp / gif",
        },
        {
          name: "frame_count",
          type: "integer",
          required: false,
          description: "选填，output_format=gif 时的帧数提示（如 12）",
        },
        {
          name: "frame_duration_ms",
          type: "integer",
          required: false,
          description: "选填，output_format=gif 时每帧毫秒数提示（如 100）",
        },
      ],
      snippets: editStandardSnippets,
      responseExample: `{
  "created": 1760968900,
  "data": [
    {
      "url": "${baseUrl}/images/20261114_edit_9f8e7d.png"
    }
  ]
}`,
    },
    {
      id: "models-list",
      category: "account",
      method: "GET",
      path: "/v1/models",
      title: "查询当前可用模型列表",
      summary:
        "拉取网站当前开启的全部生图、视频和对话模型（包含新增的 gpt-image-2.6-flare 等模型）。在 Cherry Studio 等客户端点「获取模型」调用的就是这个接口。",
      snippets: {
        curl: `curl -X GET "${baseUrl}/v1/models" \\
  -H "Authorization: Bearer ${apiKey}"`,
        python: `import requests

resp = requests.get(
    "${baseUrl}/v1/models",
    headers={"Authorization": "Bearer ${apiKey}"},
)
resp.raise_for_status()
for item in resp.json()["data"]:
    print(item["id"])`,
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
    { "id": "gpt-image-2.6-flare", "object": "model", "owned_by": "openai" },
    { "id": "gpt-image-2.6", "object": "model", "owned_by": "openai" },
    { "id": "gpt-image-2.6-sunburst", "object": "model", "owned_by": "openai" },
    { "id": "grok-imagine-image", "object": "model", "owned_by": "xai" },
    { "id": "grok-imagine-video", "object": "model", "owned_by": "xai" },
    { "id": "gpt-5.4", "object": "model", "owned_by": "openai" }
  ]
}`,
    },
    {
      id: "videos-submit",
      category: "video",
      method: "POST",
      path: "/v1/videos",
      title: "第 1 步：提交视频生成任务",
      summary:
        "视频渲染需要几十秒，所以分两步走：第 1 步调这个接口提交任务并拿到 id，第 2 步隔几秒调 GET /v1/videos/{id} 查进度。",
      contentType: "application/json",
      params: [
        {
          name: "model",
          type: "string",
          required: false,
          defaultValue: '"grok-imagine-video"',
          description: "视频模型名称，填 grok-imagine-video",
        },
        {
          name: "prompt",
          type: "string",
          required: true,
          description: "视频画面与镜头运动描述",
        },
        {
          name: "size",
          type: "string",
          required: false,
          defaultValue: '"16:9"',
          description: "画面比例：16:9（横屏）、9:16（竖屏）、1:1、3:2、2:3",
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
          defaultValue: '"720p"',
          description: "清晰度：480p 或 720p",
        },
        {
          name: "image_reference",
          type: "string",
          required: false,
          description:
            "选填，首帧参考图（传 https:// 图片链接或 data:image/...;base64,...）",
        },
      ],
      snippets: {
        curl: `curl -X POST "${baseUrl}/v1/videos" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "grok-imagine-video",
    "prompt": "航拍清晨云海翻涌的雪山金顶，镜头平稳向前推进",
    "size": "16:9",
    "seconds": 6,
    "resolution_name": "720p"
  }'`,
        python: `import time
import requests

headers = {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json",
}

# 第 1 步：提交视频生成任务
submit = requests.post(
    "${baseUrl}/v1/videos",
    headers=headers,
    json={
        "model": "grok-imagine-video",
        "prompt": "航拍清晨云海翻涌的雪山金顶，镜头平稳向前推进",
        "size": "16:9",
        "seconds": 6,
        "resolution_name": "720p",
    },
)
submit.raise_for_status()
video_id = submit.json()["id"]
print("已提交视频任务 ID:", video_id)

# 第 2 步：每 3 秒查一次进度，直到 completed
while True:
    info = requests.get(f"${baseUrl}/v1/videos/{video_id}", headers=headers).json()
    print("当前状态:", info["status"], "进度:", info.get("progress", 0))
    if info["status"] in ("completed", "failed", "cancelled"):
        print("完成结果:", info)
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
    prompt: "航拍清晨云海翻涌的雪山金顶，镜头平稳向前推进",
    size: "16:9",
    seconds: 6,
    resolution_name": "720p",
  }),
});
const task = await submitRes.json();
console.log("已提交视频任务 ID:", task.id);`,
      },
      responseExample: `{
  "id": "task_01j8x9k2m3n4p5q6r7s8",
  "object": "video",
  "status": "queued",
  "model": "grok-imagine-video",
  "seconds": 6,
  "size": "16:9",
  "resolution_name": "720p",
  "progress": 0
}`,
    },
    {
      id: "videos-status-content",
      category: "video",
      method: "GET",
      path: "/v1/videos/{id}",
      title: "第 2 步：查询视频进度与下载 MP4",
      summary:
        "把上一步返回的 id 拼到地址后面，查询 status 是否变成 completed；完成后请求 /v1/videos/{id}/content?download=1 就能保存 MP4 文件。",
      params: [
        {
          name: "GET /v1/videos/{id}",
          type: "路径",
          required: true,
          description:
            "返回 status（queued 排队中 / in_progress 生成中 / completed 已完成 / failed 失败）与 progress 百分比",
        },
        {
          name: "GET /v1/videos/{id}/content?download=1",
          type: "路径",
          required: false,
          description: "当 status 为 completed 时，直接下载生成的 MP4 视频文件",
        },
      ],
      snippets: {
        curl: `# 1. 查询视频生成进度
curl -X GET "${baseUrl}/v1/videos/task_01j8x9k2m3n4p5q6r7s8" \\
  -H "Authorization: Bearer ${apiKey}"

# 2. 生成完成后保存为 output.mp4
curl -L "${baseUrl}/v1/videos/task_01j8x9k2m3n4p5q6r7s8/content?download=1" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -o output.mp4`,
        python: `import requests

video_id = "task_01j8x9k2m3n4p5q6r7s8"
headers = {"Authorization": "Bearer ${apiKey}"}

status_data = requests.get(f"${baseUrl}/v1/videos/{video_id}", headers=headers).json()
if status_data["status"] == "completed":
    with requests.get(
        f"${baseUrl}/v1/videos/{video_id}/content?download=1",
        headers=headers,
        stream=True,
    ) as r:
        r.raise_for_status()
        with open("output.mp4", "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    print("视频已保存为 output.mp4")`,
        javascript: `const videoId = "task_01j8x9k2m3n4p5q6r7s8";
const res = await fetch(\`${baseUrl}/v1/videos/\${videoId}\`, {
  headers: { Authorization: "Bearer ${apiKey}" },
});
const video = await res.json();
if (video.status === "completed") {
  console.log("MP4 下载地址:", \`${baseUrl}\${video.content_url}?download=1\`);
}`,
      },
      responseExample: `{
  "id": "task_01j8x9k2m3n4p5q6r7s8",
  "object": "video",
  "status": "completed",
  "model": "grok-imagine-video",
  "progress": 100,
  "content_url": "/v1/videos/task_01j8x9k2m3n4p5q6r7s8/content"
}`,
    },
    {
      id: "chat-completions",
      category: "chat",
      method: "POST",
      path: "/v1/chat/completions",
      title: "对话方式生图与聊天（兼容 Cherry Studio / NextChat）",
      summary:
        "适合在 Cherry Studio、LobeChat、NextChat 等聊天软件的对话框里直接发文字画图或对话。模型填 gpt-image-2.6-flare 可直接在回复里返回生成的图片，填 gpt-5.4 可进行日常文本对话。",
      contentType: "application/json",
      params: [
        {
          name: "model",
          type: "string",
          required: true,
          description: "在聊天窗口画图填 gpt-image-2.6-flare；纯文字对话可填 gpt-5.4",
        },
        {
          name: "messages",
          type: "array",
          required: true,
          description: "聊天消息数组，如 [{ \"role\": \"user\", \"content\": \"画一只戴宇航员头盔的柴犬\" }]",
        },
        {
          name: "stream",
          type: "boolean",
          required: false,
          defaultValue: "false",
          description: "是否流式返回文字（可选 true / false）",
        },
      ],
      snippets: {
        curl: `curl -X POST "${baseUrl}/v1/chat/completions" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2.6-flare",
    "messages": [
      { "role": "user", "content": "画一只戴着复古飞行员眼镜的柴犬，水彩插画风" }
    ],
    "stream": false
  }'`,
        python: `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="${apiKey}",
)

reply = client.chat.completions.create(
    model="gpt-image-2.6-flare",
    messages=[
        {"role": "user", "content": "画一只戴着复古飞行员眼镜的柴犬，水彩插画风"}
    ],
)
print(reply.choices[0].message.content)`,
        javascript: `const response = await fetch("${baseUrl}/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-image-2.6-flare",
    messages: [
      { role: "user", content: "画一只戴着复古飞行员眼镜的柴犬，水彩插画风" },
    ],
  }),
});
const data = await response.json();
console.log(data.choices?.[0]?.message?.content);`,
      },
      responseExample: `{
  "id": "chatcmpl-9f8e7d6c",
  "object": "chat.completion",
  "model": "gpt-image-2.6-flare",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "![image](${baseUrl}/images/20261114_shiba.png)"
      },
      "finish_reason": "stop"
    }
  ]
}`,
    },
    {
      id: "responses-api",
      category: "chat",
      method: "POST",
      path: "/v1/responses",
      title: "OpenAI Responses 接口调用",
      summary:
        "如果你的新版 OpenAI SDK 或客户端默认走 /v1/responses 接口，可以直接用它来对话或触发 image_generation 工具生图。平时自己写脚本画图，直接用上面的 /v1/images/generations 会更简单直观。",
      contentType: "application/json",
      snippets: {
        curl: `curl -X POST "${baseUrl}/v1/responses" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5.4",
    "input": "帮我写三条适合做节日海报的温暖插画提示词"
  }'`,
        python: `import requests

resp = requests.post(
    "${baseUrl}/v1/responses",
    headers={
        "Authorization": "Bearer ${apiKey}",
        "Content-Type": "application/json",
    },
    json={
        "model": "gpt-5.4",
        "input": "帮我写三条适合做节日海报的温暖插画提示词",
    },
)
resp.raise_for_status()
print(resp.json())`,
        javascript: `const res = await fetch("${baseUrl}/v1/responses", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-5.4",
    input: "帮我写三条适合做节日海报的温暖插画提示词",
  }),
});
console.log(await res.json());`,
      },
      responseExample: `{
  "id": "resp_01j8x9k",
  "object": "response",
  "status": "completed",
  "model": "gpt-5.4",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [
        { "type": "output_text", "text": "1. 冬日暖黄色街角书店橱窗……" }
      ]
    }
  ]
}`,
    },
    {
      id: "profile-credits",
      category: "account",
      method: "GET",
      path: "/api/profile/credits",
      title: "用 API Key 查询当前账号剩余积分",
      summary:
        "在脚本或自动化流程里随时查询当前账号还剩多少积分（看返回里的 balance 字段即可）。",
      snippets: {
        curl: `curl -X GET "${baseUrl}/api/profile/credits" \\
  -H "Authorization: Bearer ${apiKey}"`,
        python: `import requests

resp = requests.get(
    "${baseUrl}/api/profile/credits",
    headers={"Authorization": "Bearer ${apiKey}"},
)
resp.raise_for_status()
data = resp.json()
print("当前剩余积分:", data["balance"])`,
        javascript: `const res = await fetch("${baseUrl}/api/profile/credits", {
  headers: {
    Authorization: "Bearer ${apiKey}",
  },
});
const data = await res.json();
console.log("当前剩余积分:", data.balance);`,
      },
      responseExample: `{
  "balance": 125,
  "checked_in_today": true,
  "account": {
    "user_id": "usr_01j8x9k",
    "balance": 125,
    "updated_at": "2026-11-14T10:30:00Z"
  }
}`,
    },
  ];
}
