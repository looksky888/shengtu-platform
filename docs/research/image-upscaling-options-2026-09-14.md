# 4.2 图片生成后超分方案调研

> 调研日期：2026-09-14  
> 范围：只分析选型与接入计划，不修改业务代码。外部事实只采用官方仓库、官方文档和原始论文。许可证判断属于工程建议，正式商用前仍应法务复核。

## 1. 结论与推荐排序

1. **Real-ESRGAN-ncnn-vulkan：首发推荐。** MIT 许可证，底层 ncnn 为 BSD-3-Clause；独立 CLI，无需 Python/CUDA，支持 Vulkan GPU、2/3/4 倍、tile、线程和多 GPU 参数，最适合当前 Go 项目以独立 Worker/sidecar 接入。
2. **PyTorch Real-ESRGAN：第二后端。** BSD-3-Clause；支持原生 x2、多种 x4、任意 `outscale`、可调去噪、Alpha/灰度/16-bit 和可选人脸增强，但 Python/PyTorch/BasicSR/OpenCV 依赖及显存治理更复杂。
3. **SwinIR：保真型评测候选。** Apache-2.0；支持经典 x2/x3/x4/x8、轻量 x2/x3/x4、真实世界 x4、去噪和 JPEG 修复，官方脚本支持 CUDA/CPU 和 tile。
4. **HAT：高质量实验候选。** Apache-2.0；支持经典 x2/x3/x4 和 Real-HAT GAN x4，质量潜力高，但计算与部署成本明显更高。
5. **SUPIR：暂不进入商业版本。** 官方许可证明确限非商业使用，商业服务器和收费服务需另行取得书面商业许可；依赖 SDXL、LLaVA、xformers、Triton，官方低显存组合仍约需 12 GB diffusion / 16 GB LLaVA，而且可能重绘原图细节。
6. **Upscayl：只参考 UI，不直接嵌入。** 主程序与 `upscayl-ncnn` 均为 AGPL-3.0；其推理核心仍是 Real-ESRGAN/ncnn 路线。

产品应始终采用：**保留原图 + 创建独立超分结果 + 记录派生关系**，不覆盖原图。

## 2. 与当前 4.2 项目的适配

本地源码显示：

- `internal/httpapi/app.go` 的 `wireImageTasks` 负责接入创作任务；
- `internal/service/image_task_workers.go` 已有图片/视频独立 Worker 队列；
- 当前任务体系已支持排队、取消、超时、事件、阶段耗时、重启恢复和积分退款；
- `internal/service/media_library.go` 已封装本地/R2 媒体归档、spool、容量预留、缩略图和上传并发；
- 图片结果操作入口位于 `web/src/app/image/components/image-turn-results-block.tsx` 及其子组件。

因此，超分应作为独立的 `upscale` 派生任务，不同步塞进 GPT/Grok 生图函数：

```text
原生图成功
  └─ 用户点击“超分”或启用“生成后自动超分”
       └─ 创建 upscale 派生任务
            └─ 独立 upscale 队列（默认 1 个 GPU Worker）
                 └─ ncnn CLI/sidecar 推理
                      └─ 校验尺寸、MIME、像素、文件大小
                           └─ MediaLibrary 原子归档本地或 R2
                                └─ 并列展示原图与 2×/4× 结果
```

这样可确保超分失败不污染原生图成功状态、不占用 GPT/Grok 并发槽，并可独立计费、取消、重试和统计。

## 3. 方案对比

| 方案 | 许可证/商业风险 | 能力 | 接口与硬件 | 部署判断 |
|---|---|---|---|---|
| Real-ESRGAN-ncnn-vulkan | MIT；ncnn BSD-3-Clause，保留 notice 后商用相对清晰 | jpg/png/webp；2/3/4 倍、tile、TTA、多 GPU、读/推理/写线程参数。官方提示 tile 可能块间不一致 | 独立 CLI；Intel/AMD/NVIDIA Vulkan GPU；无需 Python/CUDA。该官方 CLI 不应宣称为 CPU 模式 | **低，首选** |
| Real-ESRGAN PyTorch | BSD-3-Clause；BasicSR、GFPGAN及权重仍需逐项登记 | 原生 x2、多种 x4；任意 `outscale` 的额外倍率是 LANCZOS4 后缩放；支持 tile、去噪、灰度、Alpha、16-bit、人脸增强 | Python CLI/可 import；CUDA 优先，也有 CPU 路径，但 CPU 线上吞吐需实测 | **中，第二后端** |
| Upscayl | 主程序/后端 AGPL-3.0；自定义模型许可证另算 | 多模型、批处理、自定义模型和前后对比 | Electron + ncnn/Vulkan，偏桌面应用 | **不嵌入，只参考 UX** |
| SwinIR | Apache-2.0；需同时遵循引用组件及权重许可 | classical x2/x3/x4/x8，lightweight x2/x3/x4，real-world x4，另有去噪/JPEG 修复 | Python CLI；官方脚本自动 CUDA/CPU；支持 tile | **中高，评测候选** |
| HAT | Apache-2.0；权重/依赖仍需台账 | classical x2/x3/x4；Real-HAT GAN x4 有 fidelity/sharper 两类 | Python/PyTorch/BasicSR；支持 tile。官方 x4 表中 HAT 为 20.8M 参数、102.4G Multi-Adds（64×64 输入），明显重于同表 SwinIR | **高，离线候选** |
| SUPIR | 官方明确非商业；商用需单独许可 | 扩散式照片修复、文本引导、Q/F 模型、可调保真/观感 | Python/Gradio；SDXL、LLaVA、Triton、xformers；官方低显存说明仍为 12–16 GB | **极高，排除首发** |

## 4. 一手来源核验

### Real-ESRGAN / ncnn

首发优势是官方提供 Windows/Linux/macOS 便携包；`-i/-o/-s/-t/-m/-n/-g/-j/-f` 参数适合受控任务调用；tile 可降低显存。风险是需要 Vulkan 设备，且官方明确提示分块可能产生接缝或与 PyTorch 输出略有不同。GAN 纹理不是恢复真实信息，原始论文展示了纹理伪影和线条扭曲等局限。

- [Real-ESRGAN 官方仓库](https://github.com/xinntao/Real-ESRGAN)
- [Real-ESRGAN-ncnn-vulkan CLI](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan#-usages)
- [Real-ESRGAN-ncnn-vulkan MIT 许可证](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/blob/master/LICENSE)
- [ncnn 官方仓库、CPU/Vulkan 和 BSD-3-Clause](https://github.com/Tencent/ncnn)
- [Real-ESRGAN 原始论文](https://openaccess.thecvf.com/content/ICCV2021W/AIM/html/Wang_Real-ESRGAN_Training_Real-World_Blind_Super-Resolution_With_Pure_Synthetic_Data_ICCVW_2021_paper.html)
- [PyTorch 推理脚本](https://github.com/xinntao/Real-ESRGAN/blob/master/inference_realesrgan.py)
- [Real-ESRGAN BSD-3-Clause](https://github.com/xinntao/Real-ESRGAN/blob/master/LICENSE)

### SwinIR

适合与 Real-ESRGAN 对比文字、几何边缘和低纹理区域保真度。官方提供研究/测试脚本，并非完整生产服务。

- [SwinIR 官方仓库](https://github.com/JingyunLiang/SwinIR)
- [测试脚本、倍率、设备选择与 tile](https://github.com/JingyunLiang/SwinIR/blob/main/main_test_swinir.py)
- [Apache-2.0 许可证](https://github.com/JingyunLiang/SwinIR/blob/main/LICENSE)
- [SwinIR 原始论文](https://arxiv.org/abs/2108.10257)

### HAT

HAT 适合测试质量上限。官方提供 Real-HAT fidelity/sharper 模型和有限显存 tile 模式；官方约 20 GB/卡是训练默认批量数据，不应误当推理显存。

- [HAT 官方仓库](https://github.com/XPixelGroup/HAT)
- [Apache-2.0 许可证](https://github.com/XPixelGroup/HAT/blob/main/LICENSE)
- [CVPR 2023 原始论文](https://openaccess.thecvf.com/content/CVPR2023/html/Chen_Activating_More_Pixels_in_Image_Super-Resolution_Transformer_CVPR_2023_paper.html)
- [HAT 扩展论文](https://arxiv.org/abs/2309.05239)

### SUPIR

SUPIR 属于生成式照片修复，可能提升观感但偏离原图。当前许可证构成商业接入阻断项。

- [SUPIR 官方仓库、参数和显存说明](https://github.com/Fanghua-Yu/SUPIR)
- [SUPIR 官方许可证](https://github.com/Fanghua-Yu/SUPIR/blob/master/LICENSE)
- [官方依赖](https://github.com/Fanghua-Yu/SUPIR/blob/master/requirements.txt)
- [CVPR 2024 原始论文](https://openaccess.thecvf.com/content/CVPR2024/html/Yu_Scaling_Up_to_Excellence_Practicing_Model_Scaling_for_Photo-Realistic_Image_CVPR_2024_paper.html)

### Upscayl 与 Spandrel

Upscayl 只参考模型预设、倍率、批量进度和前后对比交互，不复制其 AGPL 代码。第二阶段如需统一装载 Real-ESRGAN、SwinIR、HAT，可评估 MIT 的 `Spandrel`。它不是完整推理服务，并明确警告 `.pth`/pickle 的任意代码执行风险；只加载固定官方来源和 SHA-256 的权重，优先 safetensors，不开放用户上传模型。

- [Upscayl 官方仓库与 AGPL-3.0](https://github.com/upscayl/upscayl)
- [Upscayl ncnn 后端](https://github.com/upscayl/upscayl-ncnn)
- [Spandrel 官方仓库、架构与安全说明](https://github.com/chaiNNer-org/spandrel)

## 5. MVP 产品与接口计划

每张成功图片增加“超分”入口：

- 倍率：2×、4×，默认 2×；
- 预设：通用（x4plus）、动漫/插画（anime 6B）；
- 显示预计尺寸，如 `1024×1024 → 2048×2048`；
- 展示排队、处理、完成、失败、取消；
- 完成后显示“原图 / 2× / 4×”，独立下载、删除；
- 首发不默认启用人脸增强，不开放社区模型上传。

建议新增独立接口：

```http
POST /api/creation-tasks/image-upscales
Content-Type: application/json

{
  "client_task_id": "uuid",
  "source_asset_path": "/api/media/...",
  "scale": 2,
  "preset": "general",
  "output_format": "png",
  "visibility": "private"
}
```

服务端只接受已归档且当前用户有权读取的媒体标识；不接受任意外部 URL 或本机路径，避免 SSRF、越权和路径穿越。结果需记录源/输出媒体、宽高、倍率、运行时、模型、模型版本/哈希和耗时。

内部 sidecar 最小契约：

- `GET /health`：运行时版本、模型哈希、Vulkan 设备与可用状态；
- `POST /v1/upscale`：受控输入、倍率、预设和输出格式；
- 支持 context 取消/终止子进程；
- 返回临时输出、宽高、MIME、字节数和推理耗时；
- 仅绑定 `127.0.0.1`，不向用户返回本机路径或内部错误原文。

CLI wrapper 必须使用参数数组而不是 shell 字符串；每个任务使用独立受限临时目录，校验成功后归档，失败/取消后清理。

## 6. 资源、安全和积分边界

建议首发默认：

- 独立超分 Worker：1；队列容量：8；
- 超时从 300 秒起步，最终按目标服务器 p95 调整；
- 只接受 png/jpeg/webp，解码后校验真实 MIME；
- 限制输入长边、输入像素、输出像素和输出字节数；
- 4× 边长产生 16× 像素：1024² 变成 4096²，约 1680 万像素，未压缩 RGBA 已约 64 MiB；
- tile 由管理员配置，用户不能任意提高；
- 用户独立并发/RPM，源图读取再次校验 owner/role；
- 权重固定版本和 SHA-256，禁止运行期任意下载或加载用户上传 `.pth`；
- 原图与派生图分别计入容量和清理策略。

错误码至少区分：`source_not_found`、`source_forbidden`、`decode_failed`、`pixel_limit_exceeded`、`device_unavailable`、`out_of_memory`、`timeout`、`cancelled`、`output_invalid`、`storage_failed`。

积分建议：独立 `charge_reason=image_upscale` 和稳定 `ref_id=endpoint:task_id`；按输出百万像素分档；接受时预扣，失败、取消、重启中断、输出校验失败或归档失败均退款；重试复用幂等指纹，禁止重复扣费；UI 提前显示扣分。

## 7. 实施顺序

### 阶段 0：离线 POC

1. 固定官方 ncnn release、模型、许可证和 SHA-256。
2. 在目标服务器验证 Vulkan 驱动和设备。
3. 建立 30–50 张图集：人像、建筑直线、天空渐变、动漫线稿、文字/UI、透明 PNG；覆盖 512/1024/1536 长边。
4. 对比通用/动漫、2×/4× 和多个 tile。
5. 记录 p50/p95、峰值显存/内存、输出大小、接缝、文字畸变、脸部改变和失败率。

### 阶段 1：后端闭环

1. 新建独立 `upscale-runtime` 或受控 CLI adapter。
2. 新增 `upscale` 任务模式和独立队列/Worker。
3. 接入源媒体鉴权、输出归档和 source→derived 关系。
4. 增加 runtime、并发、队列、超时、像素上限、倍率和模型配置。
5. 接入独立计费、退款和幂等。

### 阶段 2：前端

1. 增加“超分”按钮和确认弹窗。
2. 展示预计尺寸、预设、预计积分和“可能重构细节”。
3. 复用任务中心/SSE 状态与阶段耗时。
4. 展示原图/派生图、前后对比和独立下载。

### 阶段 3：高级模型

依次评测 PyTorch Real-ESRGAN 的原生 x2/透明 PNG/去噪，SwinIR 的文字和边缘保真，HAT 的质量收益。多架构统一加载前再审计 Spandrel 和权重反序列化安全。

### 阶段 4：自动超分

手动任务稳定后再加入“生成后自动超分”。它仍是原任务成功后创建的派生任务；超分失败时原生图保持成功，并可单独重试。

## 8. 验收与主要风险

验收覆盖：2×/4×、通用/动漫、本地/R2；原图不覆盖；队列满、取消、超时、重启、GPU 不可用、OOM、存储失败；权限、幂等、扣费退款；tile 接缝、直线、文字、五官、Alpha、颜色；超分不影响原生图 p95；Go/runtime/前端测试和浏览器冒烟。

主要风险：

1. 代码许可证不自动覆盖所有权重和依赖；发布物要维护版本、来源、SHA-256、许可证和 NOTICE。
2. GAN/扩散模型会创造纹理或改变文字、直线、脸部，不能宣传为恢复真实细节。
3. 4× 输出像素增长 16 倍，会放大显存、内存、临时盘、R2 和下载成本。
4. 超分若复用生图 Worker，会直接拖慢生图体验。
5. ncnn 官方提示 tile 可能块间不一致，必须用真实生成图验收。
6. `.pth`/pickle 有供应链风险，不开放用户模型。
7. OOM、超时和归档失败若未纳入退款闭环，会产生积分争议。

## 9. 实现前需确认

1. 首发是否只提供 2×/4×；
2. 超分按张还是按输出百万像素扣积分；
3. 目标服务器 Vulkan GPU 的型号、显存与驱动状态。

信息未知时可以先做阶段 0 POC，不应先耦合进线上生图链。