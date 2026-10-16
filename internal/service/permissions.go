package service

import (
	"sort"
	"strings"
)

type MenuPermission struct {
	ID       string           `json:"id"`
	Label    string           `json:"label"`
	Path     string           `json:"path"`
	Icon     string           `json:"icon"`
	Order    int              `json:"order"`
	Children []MenuPermission `json:"children,omitempty"`
}

type APIPermission struct {
	Key     string `json:"key"`
	Method  string `json:"method"`
	Path    string `json:"path"`
	Label   string `json:"label"`
	Group   string `json:"group"`
	Subtree bool   `json:"subtree,omitempty"`
}

type PermissionSet struct {
	MenuPaths      []string `json:"menu_paths"`
	APIPermissions []string `json:"api_permissions"`
}

var fullMenuPermissions = []MenuPermission{
	{ID: "video", Label: "视频创作", Path: "/video", Icon: "video", Order: 20},
	{ID: "image", Label: "创作台", Path: "/image", Icon: "image", Order: 10},
	{ID: "image-manager", Label: "图片库", Path: "/image-manager", Icon: "images", Order: 30},
	{ID: "recharge", Label: "积分充值", Path: "/recharge", Icon: "wallet-cards", Order: 35},
	{ID: "accounts", Label: "号池管理", Path: "/accounts", Icon: "wallet-cards", Order: 40},
	{ID: "icloud", Label: "iCloud 邮箱", Path: "/icloud", Icon: "mail", Order: 45},
	{ID: "register", Label: "注册机", Path: "/register", Icon: "user-plus", Order: 50},
	{ID: "users", Label: "用户管理", Path: "/users", Icon: "users", Order: 60},
	{ID: "credits-admin", Label: "积分管理", Path: "/credits-admin", Icon: "coins", Order: 65},
	{ID: "payment-admin", Label: "支付管理", Path: "/payment-admin", Icon: "credit-card", Order: 67},
	{ID: "rbac", Label: "角色权限", Path: "/rbac", Icon: "shield-check", Order: 70},
	{ID: "logs", Label: "日志管理", Path: "/logs", Icon: "scroll-text", Order: 80},
	{ID: "task-queue", Label: "任务中心", Path: "/task-queue", Icon: "list-todo", Order: 82},
	// Legacy path kept for existing RBAC grants; UI redirects to /task-queue?tab=history
	{ID: "image-task-logs", Label: "任务历史（兼容）", Path: "/image-task-logs", Icon: "list-checks", Order: 85},
	{ID: "settings", Label: "设置", Path: "/settings", Icon: "settings", Order: 90},
}

var apiPermissionCatalog = []APIPermission{
	apiPermission("GET", "/api/videos", "查看视频库与视频文件", "视频库", true),
	apiPermission("DELETE", "/api/videos", "删除本人视频", "视频库", false),
	apiPermission("PATCH", "/api/videos/visibility", "管理视频发布状态", "视频库", false),
	apiPermission("GET", "/api/video-reference-assets", "查看个人视频参考图资产", "视频创作", true),
	apiPermission("POST", "/api/video-reference-assets", "上传个人视频参考图资产", "视频创作", false),
	apiPermission("DELETE", "/api/video-reference-assets", "删除个人视频参考图资产", "视频创作", true),
	apiPermission("GET", "/v1/models", "模型列表", "创作", false),
	apiPermission("GET", "/api/model-catalog", "创作台模型目录", "创作", false),
	apiPermission("POST", "/v1/images/generations", "文生图", "创作", false),
	apiPermission("POST", "/v1/images/edits", "图生图", "创作", false),
	apiPermission("POST", "/v1/videos", "提交视频生成任务", "创作", true),
	apiPermission("GET", "/v1/videos", "查询视频任务与内容", "创作", true),
	apiPermission("DELETE", "/v1/videos", "取消视频生成任务", "创作", true),
	apiPermission("POST", "/v1/chat/completions", "Chat Completions", "创作", false),
	apiPermission("POST", "/v1/responses", "Responses", "创作", false),
	apiPermission("POST", "/v1/messages", "Messages", "创作", false),
	apiPermission("GET", "/api/creation-tasks", "查看生图任务（管理员可看全量）", "创作", true),
	apiPermission("POST", "/api/creation-tasks", "运行/取消生图任务", "创作", true),
	apiPermission("GET", "/api/images", "查看图片库", "图片库", false),
	apiPermission("POST", "/api/images/download", "批量下载图片", "图片库", false),
	apiPermission("PATCH", "/api/images/visibility", "管理图片发布状态", "图片库", false),
	apiPermission("DELETE", "/api/images", "删除图片/管理图片库", "图片库", false),
	apiPermission("GET", "/api/auth/users", "查看个人 API 令牌", "用户令牌", true),
	apiPermission("POST", "/api/auth/users", "创建/更新个人 API 令牌", "用户令牌", true),
	apiPermission("DELETE", "/api/auth/users", "删除个人 API 令牌", "用户令牌", true),

	apiPermission("GET", "/api/accounts", "查看号池", "号池管理", false),
	apiPermission("GET", "/api/accounts/tokens", "导出号池 Token", "号池管理", false),
	apiPermission("POST", "/api/accounts", "导入号池 Token", "号池管理", false),
	apiPermission("POST", "/api/accounts/refresh", "刷新号池", "号池管理", false),
	apiPermission("POST", "/api/accounts/update", "编辑号池账号", "号池管理", false),
	apiPermission("DELETE", "/api/accounts", "删除号池账号", "号池管理", false),
	apiPermission("GET", "/api/grok", "查看 Grok 号池", "号池管理", true),
	apiPermission("POST", "/api/grok", "管理 Grok 号池", "号池管理", true),
	apiPermission("DELETE", "/api/grok", "删除 Grok 号池账号", "号池管理", true),
	apiPermission("GET", "/api/icloud", "查看 iCloud 邮箱", "iCloud 邮箱", true),
	apiPermission("POST", "/api/icloud", "管理 iCloud 邮箱", "iCloud 邮箱", true),
	apiPermission("DELETE", "/api/icloud", "删除 iCloud 资源", "iCloud 邮箱", true),
	apiPermission("GET", "/api/register", "查看注册机", "注册机", true),
	apiPermission("POST", "/api/register", "控制注册机", "注册机", true),
	apiPermission("GET", "/api/logs", "查看日志", "日志管理", false),
	apiPermission("GET", "/api/logs/governance", "查看日志治理", "日志管理", false),
	apiPermission("POST", "/api/logs/governance", "清理日志数据", "日志管理", false),
	// Task ops: subtree covers /cancel, /batch-cancel, /clear and /stats/today.
	apiPermission("GET", "/api/admin/image-task-logs", "查看生图任务日志", "任务日志", false),
	apiPermission("POST", "/api/admin/image-task-logs", "取消/清理生图任务", "任务队列", true),
	apiPermission("GET", "/api/admin/image-task-stats", "查看生图统计", "任务日志", true),
	apiPermission("GET", "/api/admin/task-queue/events", "任务中心实时事件流", "任务队列", false),
	apiPermission("GET", "/api/admin/account-pool/health", "查看号池健康", "号池管理", false),
	apiPermission("GET", "/api/admin/account-quarantine", "查看号池隔离", "号池管理", false),
	apiPermission("POST", "/api/admin/account-quarantine", "恢复号池隔离", "号池管理", false),
	apiPermission("DELETE", "/api/admin/account-quarantine", "删除永久隔离记录", "号池管理", false),
	apiPermission("GET", "/api/admin/credits", "查看积分后台", "积分管理", true),
	apiPermission("POST", "/api/admin/credits", "管理积分后台", "积分管理", true),
	apiPermission("GET", "/api/settings", "查看设置", "设置", false),
	apiPermission("POST", "/api/settings", "修改设置", "设置", false),
	apiPermission("GET", "/api/creation-pricing", "查看创作积分单价", "创作台", false),
	apiPermission("GET", "/api/admin/email-settings", "查看邮件服务设置", "设置", true),
	apiPermission("PUT", "/api/admin/email-settings", "修改邮件服务设置", "设置", true),
	apiPermission("POST", "/api/admin/email-settings", "测试邮件服务", "设置", true),
	apiPermission("GET", "/api/admin/image-channels", "查看生图渠道与模型", "设置", true),
	apiPermission("POST", "/api/admin/image-channels", "创建生图渠道与模型", "设置", true),
	apiPermission("PUT", "/api/admin/image-channels", "修改生图渠道与模型", "设置", true),
	apiPermission("PATCH", "/api/admin/image-channels", "修改生图渠道与模型", "设置", true),
	apiPermission("DELETE", "/api/admin/image-channels", "删除生图渠道与模型", "设置", true),
	apiPermission("GET", "/api/admin/payment-channels", "查看支付渠道", "支付管理", true),
	apiPermission("POST", "/api/admin/payment-channels", "管理支付渠道与凭据", "支付管理", true),
	apiPermission("PATCH", "/api/admin/payment-channels", "修改支付渠道", "支付管理", true),
	apiPermission("GET", "/api/admin/recharge-products", "查看充值套餐", "支付管理", true),
	apiPermission("POST", "/api/admin/recharge-products", "创建充值套餐", "支付管理", true),
	apiPermission("PATCH", "/api/admin/recharge-products", "修改充值套餐", "支付管理", true),
	apiPermission("DELETE", "/api/admin/recharge-products", "删除充值套餐", "支付管理", true),
	apiPermission("GET", "/api/admin/payment-orders", "查看支付订单", "支付管理", true),
	apiPermission("POST", "/api/admin/payment-orders", "主动查单支付订单", "支付管理", true),
	apiPermission("GET", "/api/admin/payment-reconciliations", "查看支付账单对账", "支付管理", true),
	apiPermission("POST", "/api/admin/payment-reconciliations", "手动触发支付账单对账", "支付管理", true),
	apiPermission("GET", "/api/admin/payment-settings", "查看支付业务设置", "支付管理", true),
	apiPermission("PUT", "/api/admin/payment-settings", "修改支付业务设置", "支付管理", true),
	apiPermission("GET", "/api/admin/payment-stats", "查看支付经营统计", "支付管理", false),
	apiPermission("GET", "/api/payment/products", "查看充值套餐", "积分充值", false),
	apiPermission("GET", "/api/payment/channels", "查看支付渠道", "积分充值", false),
	apiPermission("GET", "/api/payment/settings", "查看充值状态", "积分充值", false),
	apiPermission("GET", "/api/payment/storage-entitlement", "查看云存储权益", "积分充值", false),
	apiPermission("POST", "/api/payment/orders", "创建或取消充值订单", "积分充值", true),
	apiPermission("GET", "/api/payment/orders", "查询充值订单", "积分充值", true),
	apiPermission("GET", "/api/admin/registration-risk-settings", "查看注册风控", "设置", true),
	apiPermission("PUT", "/api/admin/registration-risk-settings", "修改注册风控", "设置", true),
	apiPermission("DELETE", "/api/admin/registration-risk-settings", "解除注册封禁", "设置", true),
	apiPermission("POST", "/api/settings/login-page-image", "修改登录页图片", "设置", false),
	apiPermission("POST", "/api/settings/image-proxy/models", "拉取中转站模型", "设置", false),
	apiPermission("GET", "/api/settings/image-proxy/health", "查看中转健康", "设置", false),
	apiPermission("GET", "/api/proxy", "查看代理", "设置", true),
	apiPermission("POST", "/api/proxy", "修改/测试代理", "设置", true),
	apiPermission("GET", "/api/storage/info", "查看存储状态", "设置", false),
	apiPermission("GET", "/api/admin/system", "查看系统版本和更新", "设置", true),
	apiPermission("POST", "/api/admin/system", "执行系统更新/重启", "设置", true),
	apiPermission("GET", "/api/admin/backup", "查看备份配置/状态", "设置", true),
	apiPermission("POST", "/api/admin/backup", "执行备份/恢复", "设置", true),
	apiPermission("GET", "/api/admin/media-storage", "查看媒体存储状态", "设置", true),
	apiPermission("POST", "/api/admin/media-storage", "测试或迁移媒体存储", "设置", true),
	apiPermission("GET", "/api/admin/announcements", "查看公告", "公告", true),
	apiPermission("POST", "/api/admin/announcements", "创建/修改公告", "公告", true),
	apiPermission("DELETE", "/api/admin/announcements", "删除公告", "公告", true),
	apiPermission("GET", "/api/cpa/pools", "查看 CPA 池", "导入", true),
	apiPermission("POST", "/api/cpa/pools", "修改/导入 CPA 池", "导入", true),
	apiPermission("DELETE", "/api/cpa/pools", "删除 CPA 池", "导入", true),
	apiPermission("GET", "/api/admin/users", "查看用户", "用户管理", true),
	apiPermission("POST", "/api/admin/users", "创建/修改用户", "用户管理", true),
	apiPermission("DELETE", "/api/admin/users", "删除用户", "用户管理", true),
	apiPermission("GET", "/api/admin/roles", "查看角色", "权限管理", true),
	apiPermission("POST", "/api/admin/roles", "创建/修改角色", "权限管理", true),
	apiPermission("DELETE", "/api/admin/roles", "删除角色", "权限管理", true),
	apiPermission("GET", "/api/admin/permissions", "查看权限目录", "权限管理", false),
}

func apiPermission(method, path, label, group string, subtree bool) APIPermission {
	method = strings.ToUpper(strings.TrimSpace(method))
	path = normalizePermissionPath(path)
	return APIPermission{
		Key:     APIPermissionKey(method, path),
		Method:  method,
		Path:    path,
		Label:   label,
		Group:   group,
		Subtree: subtree,
	}
}

func AllMenuPermissions() []MenuPermission {
	return cloneMenuPermissions(fullMenuPermissions)
}

func AllAPIPermissions() []APIPermission {
	return append([]APIPermission(nil), apiPermissionCatalog...)
}

func FilterMenuPermissions(menuPaths []string) []MenuPermission {
	allowed := sliceSet(NormalizeMenuPermissions(menuPaths))
	return filterMenuPermissions(fullMenuPermissions, allowed)
}

func DefaultPermissionSetForRole(role string) PermissionSet {
	if role == AuthRoleAdmin {
		return PermissionSet{
			MenuPaths:      allMenuPaths(),
			APIPermissions: allAPIPermissionKeys(),
		}
	}
	return PermissionSet{
		MenuPaths: NormalizeMenuPermissions([]string{
			"/image",
			"/video",
			"/image-manager",
			"/recharge",
		}),
		APIPermissions: NormalizeAPIPermissions([]string{
			APIPermissionKey("GET", "/v1/models"),
			APIPermissionKey("GET", "/api/model-catalog"),
			APIPermissionKey("POST", "/v1/images/generations"),
			APIPermissionKey("POST", "/v1/images/edits"),
			APIPermissionKey("POST", "/v1/videos"),
			APIPermissionKey("GET", "/v1/videos"),
			APIPermissionKey("DELETE", "/v1/videos"),
			APIPermissionKey("POST", "/v1/chat/completions"),
			APIPermissionKey("POST", "/v1/responses"),
			APIPermissionKey("POST", "/v1/messages"),
			APIPermissionKey("GET", "/api/creation-tasks"),
			APIPermissionKey("POST", "/api/creation-tasks"),
			APIPermissionKey("GET", "/api/videos"),
			APIPermissionKey("DELETE", "/api/videos"),
			APIPermissionKey("PATCH", "/api/videos/visibility"),
			APIPermissionKey("GET", "/api/video-reference-assets"),
			APIPermissionKey("POST", "/api/video-reference-assets"),
			APIPermissionKey("DELETE", "/api/video-reference-assets"),
			APIPermissionKey("GET", "/api/creation-pricing"),
			APIPermissionKey("GET", "/api/payment/products"),
			APIPermissionKey("GET", "/api/payment/channels"),
			APIPermissionKey("GET", "/api/payment/settings"),
			APIPermissionKey("GET", "/api/payment/storage-entitlement"),
			APIPermissionKey("POST", "/api/payment/orders"),
			APIPermissionKey("GET", "/api/payment/orders"),
			APIPermissionKey("GET", "/api/images"),
			APIPermissionKey("POST", "/api/images/download"),
			APIPermissionKey("PATCH", "/api/images/visibility"),
			APIPermissionKey("GET", "/api/auth/users"),
			APIPermissionKey("POST", "/api/auth/users"),
			APIPermissionKey("DELETE", "/api/auth/users"),
		}),
	}
}

// NormalizeManagedRoleAPIPermissions keeps the user-facing recharge panel
// coherent for persisted roles created before the storage entitlement route
// was added. A role that can read recharge settings can also read the user's
// own storage entitlement; it does not grant admin storage-management APIs.
func NormalizeManagedRoleAPIPermissions(keys []string) []string {
	normalized := NormalizeAPIPermissions(keys)
	if HasAPIPermission(PermissionSet{APIPermissions: normalized}, "GET", "/api/payment/settings") {
		normalized = append(normalized, APIPermissionKey("GET", "/api/payment/storage-entitlement"))
	}
	return NormalizeAPIPermissions(normalized)
}

func NormalizeMenuPermissions(paths []string) []string {
	known := map[string]struct{}{}
	for _, path := range allMenuPaths() {
		known[path] = struct{}{}
	}
	return normalizeKnownStrings(paths, known)
}

func NormalizeAPIPermissions(keys []string) []string {
	known := map[string]struct{}{}
	for _, permission := range apiPermissionCatalog {
		known[permission.Key] = struct{}{}
	}
	out := make([]string, 0, len(keys))
	seen := map[string]struct{}{}
	for _, key := range keys {
		normalized := normalizeAPIPermissionKey(key)
		if _, ok := known[normalized]; !ok {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		out = append(out, normalized)
	}
	sort.Strings(out)
	return out
}

func APIPermissionKey(method, path string) string {
	return strings.ToLower(strings.TrimSpace(method)) + normalizePermissionPath(path)
}

func MatchAPIPermissionKey(method, path string) (string, bool) {
	method = strings.ToUpper(strings.TrimSpace(method))
	path = normalizePermissionPath(path)
	for _, permission := range apiPermissionCatalog {
		if permission.Method != method {
			continue
		}
		if path == permission.Path {
			return permission.Key, true
		}
	}
	for _, permission := range apiPermissionCatalog {
		if permission.Method != method || !permission.Subtree {
			continue
		}
		base := strings.TrimRight(permission.Path, "/")
		if path == base || strings.HasPrefix(path, base+"/") {
			return permission.Key, true
		}
	}
	return "", false
}

func HasAPIPermission(set PermissionSet, method, path string) bool {
	key, ok := MatchAPIPermissionKey(method, path)
	if !ok {
		return false
	}
	for _, allowed := range NormalizeAPIPermissions(set.APIPermissions) {
		if allowed == key {
			return true
		}
	}
	return false
}

func normalizePermissionPath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	if path != "/" {
		path = strings.TrimRight(path, "/")
	}
	return path
}

func normalizeAPIPermissionKey(key string) string {
	key = strings.TrimSpace(key)
	if key == "" {
		return ""
	}
	if strings.Contains(key, " ") {
		method, path, _ := strings.Cut(key, " ")
		return migrateAPIPermissionKey(APIPermissionKey(method, path))
	}
	for _, method := range []string{"delete", "patch", "post", "put", "get"} {
		if strings.HasPrefix(strings.ToLower(key), method+"/") {
			return migrateAPIPermissionKey(method + normalizePermissionPath(key[len(method):]))
		}
	}
	return migrateAPIPermissionKey(strings.ToLower(key))
}

func migrateAPIPermissionKey(key string) string {
	switch key {
	case APIPermissionKey("GET", "/api/image-tasks"):
		return APIPermissionKey("GET", "/api/creation-tasks")
	case APIPermissionKey("POST", "/api/image-tasks"):
		return APIPermissionKey("POST", "/api/creation-tasks")
	default:
		return key
	}
}

func allMenuPaths() []string {
	var paths []string
	walkMenuPermissions(fullMenuPermissions, func(item MenuPermission) {
		if item.Path != "" {
			paths = append(paths, item.Path)
		}
	})
	sort.Strings(paths)
	return paths
}

func allAPIPermissionKeys() []string {
	out := make([]string, 0, len(apiPermissionCatalog))
	for _, permission := range apiPermissionCatalog {
		out = append(out, permission.Key)
	}
	sort.Strings(out)
	return out
}
