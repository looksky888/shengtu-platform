export type SettingsSectionAnchor = {
  id: string;
  label: string;
  summary: string;
  keywords: readonly string[];
};

export const SETTINGS_TABS = [
  {
    key: "config",
    label: "基础配置",
    description: "配置站点访问地址、全局并发与限流配额、无限画布联动及登录页品牌视觉。",
    sections: [
      {
        id: "settings-section-config-runtime",
        label: "运行并发与限流",
        summary: "服务基础 URL、生图/视频队列并发、用户与 API Key 默认 RPM 限额及自动淘汰",
        keywords: ["base_url", "并发", "队列", "限流", "rpm", "超时", "保留天数", "淘汰"],
      },
      {
        id: "settings-section-config-canvas",
        label: "无限画布联动",
        summary: "配置顶部导航「无限画布」跳转的外部画布工作台地址",
        keywords: ["canvas", "画布", "外链", "跳转"],
      },
      {
        id: "settings-section-config-login",
        label: "登录视觉与品牌",
        summary: "自定义登录页展示画作、裁切缩放比例与背景视觉",
        keywords: ["login", "登录页", "背景图", "品牌", "视觉", "封面"],
      },
    ],
  },
  {
    key: "channels",
    label: "生图渠道",
    description: "管理内置 ChatGPT / Grok 号池渠道、第三方 OpenAI 兼容渠道、gpt-image-2.6* / GIF 模型目录与阶梯积分定价。",
    sections: [
      {
        id: "settings-section-channels-models",
        label: "渠道与模型计费",
        summary: "配置生图渠道、Grok 与 gpt-image-2.6* 模型管理、GIF 输出格式、各分辨率积分单价与视频按秒计费",
        keywords: ["grok", "gpt-image", "gpt-image-2.6", "gif", "渠道", "模型管理", "积分", "计费", "单价", "video", "视频"],
      },
      {
        id: "settings-section-channels-routing",
        label: "本地号池路由",
        summary: "设置默认生图模型、内部 Slug 映射与上游失败自动降级链",
        keywords: ["account_pool", "号池", "路由", "默认模型", "slug", "fallback", "降级"],
      },
    ],
  },
  {
    key: "proxy",
    label: "过盾与代理",
    description: "治理生图与视频上游号池出站代理、FlareSolverr 自动过盾以及挑战冷却策略。",
    sections: [
      {
        id: "settings-section-proxy-upstream",
        label: "上游代理与 FlareSolverr",
        summary: "生图与视频上游号池出站代理、Cloudflare Clearance 模式与挑战冷却",
        keywords: ["proxy", "代理", "warp", "cloudflare", "cf", "过盾", "清障", "flaresolverr", "冷却"],
      },
    ],
  },
  {
    key: "cpa",
    label: "CPA 号池导入",
    description: "连接远程 CPA 号池节点、浏览远端可用账号并批量同步导入本地号池。",
    sections: [
      {
        id: "settings-section-cpa-pools",
        label: "CPA 远程号池连接",
        summary: "新增、测试或同步远程 CPA 号池服务并批量拉取账号凭据",
        keywords: ["cpa", "号池导入", "批量导入", "远程同步", "token"],
      },
    ],
  },
  {
    key: "email",
    label: "邮件与风控",
    description: "管理平台开放注册开关、SMTP 发信通道、验证码邮件模板与多维注册风控拦截。",
    sections: [
      {
        id: "settings-section-email-overview",
        label: "注册与发信总览",
        summary: "查看开放注册状态、SMTP 可用性与当前生效的风控封禁概览",
        keywords: ["注册开关", "开放注册", "总览"],
      },
      {
        id: "settings-section-email-smtp",
        label: "SMTP 邮件服务",
        summary: "配置发信主机、端口、加密凭据并发送测试验证码邮件",
        keywords: ["smtp", "邮件", "验证码", "邮箱", "发信"],
      },
      {
        id: "settings-section-email-risk",
        label: "多维注册风控",
        summary: "设置同 IP 注册频率阈值、邮箱后缀黑白名单与一次性邮箱拦截",
        keywords: ["风控", "黑名单", "白名单", "ip限制", "临时邮箱", "防刷"],
      },
      {
        id: "settings-section-email-blocks",
        label: "实时封禁名单",
        summary: "检索命中注册风控的封禁记录并支持管理员手动解封",
        keywords: ["封禁", "解封", "拦截记录"],
      },
    ],
  },
  {
    key: "media",
    label: "媒体存储",
    description: "统一管理云存储付费会员制（VIP 留存策略）总开关、Cloudflare R2 对象存储后端与历史媒体平滑迁移。",
    sections: [
      {
        id: "settings-section-media-vip",
        label: "云存储 VIP 留存策略总开关",
        summary: "管理云存储会员留存总开关、免费保留天数（默认 3 天）与双重宽限缓冲期",
        keywords: ["vip", "cloud_storage_enabled", "留存", "云存储会员", "free_retention_days"],
      },
      {
        id: "settings-section-media-r2",
        label: "存储后端与 R2 迁移",
        summary: "配置本地存储 / Cloudflare R2 桶凭据、自动清理与存量图片迁移",
        keywords: ["r2", "cloudflare", "s3", "对象存储", "bucket", "本地存储", "迁移", "清理"],
      },
    ],
  },
  {
    key: "announcements",
    label: "通知公告",
    description: "编排全站实时弹窗通知与工作台顶部 4 色常驻滚动横幅公告。",
    sections: [
      {
        id: "settings-section-announcements-list",
        label: "弹窗与顶部横幅发布",
        summary: "新建、编辑、全员广播或停用站内弹窗公告与 4 色常驻通知横幅",
        keywords: ["公告", "通知", "弹窗", "banner", "横幅", "消息", "广播"],
      },
    ],
  },
  {
    key: "backup",
    label: "备份与日志",
    description: "配置核心数据库定时快照策略、Cloudflare R2 异地容灾归档与系统运行日志滚动治理。",
    sections: [
      {
        id: "settings-section-backup-policy",
        label: "定时备份与异地容灾",
        summary: "管理本地与 R2 云端数据库备份计划、手动立即备份及快照恢复",
        keywords: ["backup", "备份", "恢复", "快照", "数据库", "容灾"],
      },
      {
        id: "settings-section-backup-logs",
        label: "日志级别与清理",
        summary: "调整日志级别过滤、保留天数并手动清理过期历史日志",
        keywords: ["log", "日志", "清理", "保留期", "debug", "error", "审计"],
      },
    ],
  },
  {
    key: "system",
    label: "系统更新",
    description: "检查 GitHub 最新发行版本、执行环境预检并在宿主机触发平滑在线升级。",
    sections: [
      {
        id: "settings-section-system-update",
        label: "版本预检与在线升级",
        summary: "查看当前运行版本、核验宿主机守护服务前置条件并平滑升级",
        keywords: ["update", "升级", "更新", "版本", "github", "release", "docker", "host updater"],
      },
    ],
  },
] as const;

export type SettingsTabMeta = (typeof SETTINGS_TABS)[number];
export type SettingsTabKey = SettingsTabMeta["key"];

export type LegacySettingsTabKey =
  | "base"
  | "appearance"
  | "image"
  | "register"
  | "clearance"
  | "imports"
  | "access"
  | "storage"
  | "announcement"
  | "maintenance"
  | "system-update";

export type AnySettingsTabKey = SettingsTabKey | LegacySettingsTabKey;

const LEGACY_TAB_ALIASES: Readonly<Record<LegacySettingsTabKey, SettingsTabKey>> = {
  base: "config",
  appearance: "config",
  image: "channels",
  register: "proxy",
  clearance: "proxy",
  imports: "cpa",
  access: "email",
  storage: "media",
  announcement: "announcements",
  maintenance: "backup",
  "system-update": "system",
};

export type SettingsDomainId = "core" | "access" | "content" | "ops";

export type SettingsDomainGroup = {
  id: SettingsDomainId;
  label: string;
  defaultTab: SettingsTabKey;
  tabs: readonly SettingsTabKey[];
};

export const SETTINGS_DOMAIN_GROUPS: readonly SettingsDomainGroup[] = [
  {
    id: "core",
    label: "核心与生图",
    defaultTab: "config",
    tabs: ["config", "channels"],
  },
  {
    id: "access",
    label: "代理与风控",
    defaultTab: "proxy",
    tabs: ["proxy", "cpa", "email"],
  },
  {
    id: "content",
    label: "存储与公告",
    defaultTab: "media",
    tabs: ["media", "announcements"],
  },
  {
    id: "ops",
    label: "备份与运维",
    defaultTab: "backup",
    tabs: ["backup", "system"],
  },
] as const;

export const SETTINGS_NAVIGATE_TAB_EVENT = "shengtu:settings-navigate-tab";
export const SETTINGS_TAB_REFRESH_EVENT = "shengtu:settings-tab-refresh";

export function parseSettingsTab(value: string | null | undefined): SettingsTabKey {
  const normalized = (value || "").trim();
  if (!normalized) {
    return "config";
  }
  if (SETTINGS_TABS.some((tab) => tab.key === normalized)) {
    return normalized as SettingsTabKey;
  }
  if (normalized in LEGACY_TAB_ALIASES) {
    return LEGACY_TAB_ALIASES[normalized as LegacySettingsTabKey];
  }
  return "config";
}

export function getSettingsTabMeta(tab: AnySettingsTabKey): SettingsTabMeta {
  const resolved = parseSettingsTab(tab);
  return SETTINGS_TABS.find((item) => item.key === resolved) ?? SETTINGS_TABS[0];
}

export function getSettingsDomainForTab(tab: AnySettingsTabKey): SettingsDomainId {
  const resolved = parseSettingsTab(tab);
  const found = SETTINGS_DOMAIN_GROUPS.find((group) =>
    group.tabs.includes(resolved),
  );
  return found?.id ?? "core";
}

export function getSettingsDomainGroup(domainId: SettingsDomainId): SettingsDomainGroup {
  return (
    SETTINGS_DOMAIN_GROUPS.find((group) => group.id === domainId) ??
    SETTINGS_DOMAIN_GROUPS[0]
  );
}

export type SettingsSearchMatch = {
  id: string;
  tab: SettingsTabKey;
  tabLabel: string;
  domainId: SettingsDomainId;
  domainLabel: string;
  sectionId?: string;
  sectionLabel?: string;
  summary: string;
  score: number;
};

export function searchSettingsCatalog(
  rawQuery: string,
  limit = 12,
): SettingsSearchMatch[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return SETTINGS_TABS.slice(0, limit).map((tab) => {
      const domainId = getSettingsDomainForTab(tab.key);
      const domain = getSettingsDomainGroup(domainId);
      return {
        id: `tab:${tab.key}`,
        tab: tab.key,
        tabLabel: tab.label,
        domainId,
        domainLabel: domain.label,
        summary: tab.description,
        score: 1,
      };
    });
  }

  const tokens = query.split(/\s+/).filter(Boolean);
  const results: SettingsSearchMatch[] = [];

  for (const tab of SETTINGS_TABS) {
    const domainId = getSettingsDomainForTab(tab.key);
    const domain = getSettingsDomainGroup(domainId);

    for (const section of tab.sections) {
      const haystackTitle = `${section.label} ${tab.label}`.toLowerCase();
      const haystackAll = `${section.label} ${section.summary} ${section.keywords.join(" ")} ${tab.label} ${tab.description} ${domain.label}`.toLowerCase();
      if (!tokens.every((token) => haystackAll.includes(token))) {
        continue;
      }
      let score = 10;
      if (section.label.toLowerCase().includes(query)) score += 30;
      if (tab.label.toLowerCase().includes(query)) score += 20;
      if (section.keywords.some((kw) => kw.toLowerCase().includes(query))) score += 25;
      if (tokens.every((token) => haystackTitle.includes(token))) score += 15;

      results.push({
        id: `section:${tab.key}:${section.id}`,
        tab: tab.key,
        tabLabel: tab.label,
        domainId,
        domainLabel: domain.label,
        sectionId: section.id,
        sectionLabel: section.label,
        summary: section.summary,
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
