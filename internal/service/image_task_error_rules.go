package service

import "strings"

// imageErrorMatchCtx is the normalized input for table-driven classification.
type imageErrorMatchCtx struct {
	message string
	lower   string
	code    string
}

type imageErrorRule struct {
	code            string
	message         string
	troubleshooting string
	// match returns true when this rule applies. First match wins.
	match func(ctx imageErrorMatchCtx) bool
	// messageFn optionally overrides Message (e.g. multi-variant codes).
	messageFn func(ctx imageErrorMatchCtx) string
}

// imageTaskErrorRules is ordered: more specific / higher priority first.
var imageTaskErrorRules = []imageErrorRule{
	{
		code:            "sentinel_solver_unavailable",
		message:         "本地过盾与指纹服务（sentinel-solver）受阻或暂不可用，本次未消耗账号额度。请稍后重试，或联系管理员检查过盾服务与出口代理。",
		troubleshooting: "管理员请检查 sentinel-solver 与 flaresolverr 容器日志、SENTINEL_SOLVER_FLARESOLVERR_URL 是否连通，以及 CHATGPT2API_PROXY 出口是否触发 Cloudflare 403 Challenge。",
		match: func(ctx imageErrorMatchCtx) bool {
			return ctx.code == "sentinel_solver_unavailable" || IsSentinelSolverSignal(ctx.message)
		},
	},
	{
		code:            "video_generation_failed",
		message:         "视频上游生成失败，请检查视频额度、参考图和时长后重试。",
		troubleshooting: "检查 Grok Console 视频账号、剩余额度、参考图格式和 6–15 秒时长限制。",
		match: func(ctx imageErrorMatchCtx) bool {
			return ctx.code == "video_generation_failed" &&
				!IsUpstreamRateLimitSignal(ctx.lower) &&
				!IsUpstreamTimeoutSignal(ctx.lower) &&
				!IsUpstreamGatewaySignal(ctx.lower)
		},
	},
	{
		code:            "video_result_empty",
		message:         "视频上游未返回有效文件，请稍后重试。",
		troubleshooting: "检查上游任务状态与视频归档日志；确认 Console 返回了可下载的视频内容。",
		match:           func(ctx imageErrorMatchCtx) bool { return ctx.code == "video_result_empty" },
	},
	{
		code:            "video_content_empty",
		message:         "视频上游返回了空文件，请稍后重试。",
		troubleshooting: "检查上游视频内容接口是否返回非空 MP4，以及任务是否过早结束。",
		match:           func(ctx imageErrorMatchCtx) bool { return ctx.code == "video_content_empty" },
	},
	{
		code:            "video_content_read_failed",
		message:         "视频文件归档失败，请稍后重试。",
		troubleshooting: "检查服务器媒体目录权限、磁盘空间和上游视频下载响应。",
		match:           func(ctx imageErrorMatchCtx) bool { return ctx.code == "video_content_read_failed" },
	},
	{
		code:            "upstream_rate_limited",
		message:         "上游触发共享速率限制，本次请求已停止，未继续换号重放。请稍后再试或降低提交频率。",
		troubleshooting: "这是上游 429/共享出口速率限制，不代表某个账号额度耗尽。建议一次 1 张并降低频率；管理员可检查出口代理、上游限流窗口和中转额度。",
		match:           func(ctx imageErrorMatchCtx) bool { return IsUpstreamRateLimitSignal(ctx.lower) },
	},
	{
		code:            "grok_oauth_required",
		message:         "grok-4.5 需要 xAI CLI OAuth 账号。当前仅有注册号池时，请改用 grok-4.20-fast / grok-4.20-auto。",
		troubleshooting: "参考 gptGrok2api：Grok 4.5 走独立 OAuth 授权，与网页注册 SSO 不是同一套号。注册机里的 Grok 账号只能跑 4.20 系列对话与 Imagine 生图。",
		match: func(ctx imageErrorMatchCtx) bool {
			return (strings.Contains(ctx.lower, "oauth") && (strings.Contains(ctx.lower, "grok-4.5") || strings.Contains(ctx.lower, "grok 4.5") || strings.Contains(ctx.lower, "xai cli"))) ||
				strings.Contains(ctx.message, "没有活跃的xAI CLI OAuth") ||
				strings.Contains(ctx.lower, "no active xai cli oauth") ||
				strings.Contains(ctx.lower, "does not expose grok-4.5")
		},
	},
	{
		code:            "upstream_usage_limit",
		message:         "当前 Grok 账号已达到上游生图用量上限（Usage limit）。系统只会在明确识别到账号用量上限时轮换号池；若全部账号均达上限，请补充账号或稍后再试。",
		troubleshooting: "这是 xAI 对单个账号的用量限制，不是共享出口 429。默认 grok-imagine-image 使用 Basic/Lite 通道；只有明确的 usage_limit_reached 才会在本次请求内换号。",
		match: func(ctx imageErrorMatchCtx) bool {
			return strings.Contains(ctx.lower, "usage limit") || strings.Contains(ctx.lower, "usage_limit")
		},
	},
	{
		code:            "grok_account_pool_unavailable",
		troubleshooting: "4.3 默认 Grok 生图从 Basic 池开始选择，并可向 Super/Heavy 池回退。检查 Grok 号池 active 数量、是否被软删除、注册后是否写入 native accounts.db。",
		match: func(ctx imageErrorMatchCtx) bool {
			return strings.Contains(ctx.lower, "no available accounts for image generation") ||
				strings.Contains(ctx.lower, "no available accounts")
		},
		messageFn: func(ctx imageErrorMatchCtx) string {
			if strings.Contains(ctx.lower, "usage limit") || strings.Contains(ctx.lower, "tried account") {
				return "Grok 号池中当前可轮换账号均已触达上游生图上限，或刚注册号尚未可用。请再注册 Grok 账号后重试，或稍后再试。"
			}
			if strings.Contains(ctx.lower, "empty") || strings.Contains(ctx.lower, "not synced") {
				return "Grok 号池为空或新注册账号尚未同步进运行时。请到 Grok 号池确认账号存在，必要时点同步/刷新后再生图。"
			}
			return "当前没有可用于生图的 Grok 账号。请确认已注册并入库 Grok 号，模型为 grok-imagine-image，然后再试。"
		},
	},
	{
		code:            "gpt_account_pool_empty",
		troubleshooting: "gpt-image 系列走 ChatGPT 号池；刚注册的 Grok 账号不会进入 GPT 号池。请切换到 grok-imagine-image，或先注册/导入 ChatGPT 账号。",
		match: func(ctx imageErrorMatchCtx) bool {
			return strings.Contains(ctx.message, "GPT 号池为空") ||
				strings.Contains(ctx.message, "GPT 号池暂无可用") ||
				strings.Contains(ctx.message, "没有匹配筛选条件的 GPT")
		},
		messageFn: func(ctx imageErrorMatchCtx) string { return ctx.message },
	},
	{
		code:            "insufficient_credits",
		message:         "积分不足，请充值或联系管理员增加积分后再试。",
		troubleshooting: "请先充值、兑换卡密或联系管理员增加积分；管理员可在积分管理中查看用户余额和流水。",
		match:           func(ctx imageErrorMatchCtx) bool { return strings.Contains(ctx.lower, "insufficient credits") },
	},
	{
		code:            "upstream_connection_interrupted",
		message:         "上游连接中断，通常与高分辨率、生成数量或上游网关不稳定有关。请稍后重试，或降低分辨率/质量/数量。",
		troubleshooting: "建议降低分辨率/质量/数量后重试；若多次出现，请检查上游网关或代理稳定性。",
		match: func(ctx imageErrorMatchCtx) bool {
			return strings.Contains(ctx.message, "FLOW_CONTROL_ERROR") ||
				strings.Contains(ctx.lower, "stream error") ||
				strings.Contains(ctx.lower, "internal_error") ||
				strings.Contains(ctx.lower, "connection error") ||
				strings.Contains(ctx.lower, "connection reset") ||
				strings.Contains(ctx.lower, "unexpected eof")
		},
	},
	{
		code:            "upstream_timeout",
		message:         "图片生成超时，请稍后重试，或降低分辨率/质量/数量；如经常超时可在设置中调大图片任务超时时间。",
		troubleshooting: "建议降低分辨率/数量后重试；管理员可调大图片任务超时时间并检查代理。",
		match:           func(ctx imageErrorMatchCtx) bool { return IsUpstreamTimeoutSignal(ctx.lower) },
	},
	{
		code:            "upstream_gateway_error",
		message:         "上游网关异常（502/503/504），系统已自动换号重试；如果仍失败，请稍后再试或检查出口代理/号池状态。",
		troubleshooting: "号池模式：常见于 ChatGPT 上游/Cloudflare/机房出口不稳定，请检查 CHATGPT2API_PROXY、FlareSolverr clearance 与账号是否被 CF 冷却，而不是去改中转站。中转站模式：再检查中转 URL、模型与额度。",
		match:           func(ctx imageErrorMatchCtx) bool { return IsUpstreamGatewaySignal(ctx.lower) },
	},
	{
		code:            "upstream_safety_rejected",
		message:         "提示词可能违反了内容安全政策，本次未能生成图片。请修改提示词后重试；若您认为误判，可调整表述或去掉敏感描述后再试。",
		troubleshooting: "建议保留主体与风格，删除可能触发安全策略的敏感词，或弱化人物/身体/暴力/未成年/名人版权等描述；也可更换参考图后重试。",
		match:           func(ctx imageErrorMatchCtx) bool { return isUpstreamSafetyRejectedMessage(ctx.lower) },
	},
	{
		code:            "upstream_cloudflare_challenge",
		message:         "上游触发 Cloudflare 人机验证，账号出口或会话被拦截。请配置/检查代理（WARP/住宅代理）与 FlareSolverr clearance，稍后重试。",
		troubleshooting: "管理员：配置 CHATGPT2API_PROXY（如 Privoxy→WARP）、开启 CHATGPT2API_UPSTREAM_CLEARANCE_ENABLED，并确认 FlareSolverr 可用；避免无代理时连点多张加速烧号。",
		match: func(ctx imageErrorMatchCtx) bool {
			return IsCloudflareSignal(ctx.message)
		},
	},
	{
		code:            "account_pool_probe_exhausted",
		message:         "号池连续探测多个账号均不可用（常见于 Cloudflare 拦截或代理异常）。请稍后重试，或检查代理/号池状态。",
		troubleshooting: "查看任务事件中的 account_reject 原因；优先修复出口代理与 clearance，而非盲目提高并发。",
		match:           func(ctx imageErrorMatchCtx) bool { return strings.Contains(ctx.message, "号池探测次数过多") },
	},
	{
		code:            "account_pool_slot_busy",
		message:         "当前号池账号都在忙碌（并发槽已满）。请稍后重试，减少一次生成张数，或增加号池/提高单账号并发。",
		troubleshooting: "管理员可在设置中调整 image_account_concurrency，或补充更多可用账号；用户可先改为一张图重试。若日志含 Cloudflare，请优先处理代理而非加并发。",
		match: func(ctx imageErrorMatchCtx) bool {
			return strings.Contains(ctx.lower, "no available image account slot") ||
				strings.Contains(ctx.lower, "account slot") ||
				strings.Contains(ctx.lower, "pool slot") ||
				strings.Contains(ctx.message, "号池暂无可用账号槽位")
		},
	},
	{
		code:            "no_available_image_quota",
		message:         "当前没有可用图片额度。请稍后重试，或联系管理员检查号池额度。",
		troubleshooting: "管理员请检查号池额度、账号状态和是否触发速率限制。",
		match: func(ctx imageErrorMatchCtx) bool {
			return strings.Contains(ctx.lower, "no available image quota") || strings.Contains(ctx.lower, "insufficient_quota")
		},
	},
	{
		code:            "no_paid_image_account",
		message:         "当前没有可用的 Paid 图片账号。请联系管理员补充或刷新号池。",
		troubleshooting: "管理员请在号池管理中检查 Paid 标识、账号状态和剩余额度。",
		match: func(ctx imageErrorMatchCtx) bool {
			return strings.Contains(ctx.lower, "paid") && (strings.Contains(ctx.lower, "account") || strings.Contains(ctx.lower, "image"))
		},
	},
	{
		code:            "image_generation_text_response",
		message:         "上游返回了文本而不是图片。请调整提示词，明确要求生成图片，或换用图片模型后重试。",
		troubleshooting: "建议确认模型是图片模型，提示词中明确要求输出图片；如使用 Responses 工具，请检查 image_generation 工具调用。",
		match: func(ctx imageErrorMatchCtx) bool {
			return strings.Contains(ctx.lower, "text instead of image") ||
				strings.Contains(ctx.lower, "text response") ||
				strings.Contains(ctx.message, "返回了文本")
		},
	},
}
