export type SettingsSectionAnchor = {
  id: string;
  label: string;
  summary: string;
  keywords: readonly string[];
};

export const SETTINGS_TABS = [
  {
    key: "base",
    label: "基础与品牌",
    description: "配置站点访问地址、全局并发与限流配额、无限画布联动及登录页品牌视觉。",
    sections: [
      {
        id: "settings-section-base-runtime",
        label: "运行并发与限流",
        summary: "服务基础 URL、生图/视频队列并发、用户与 API Key 默认 RPM 限额及自动淘汰",
        keywords: ["base_url", "并发", "队列", "限流", "rpm", "超时", "保留天数", "淘汰"],
      },
      {
        id: "settings-section-base-canvas",
        label: "无限画布联动",
        summary: "配置顶部导航「无限画布」跳转的外部影策或画布工作台地址",
        keywords: ["canvas", "画布", "影策", "外链", "跳转"],
      },
      {
        id: "settings-section-base-login",
        label: "登录视觉与品牌",
        summary: "自定义登录页展示画作、裁切缩放比例与暗房背景氛围",
        keywords: ["login", "登录页", "背景图", "品牌", "视觉", "封面"],
      },
    ],
  },
  {
    key: "image",
    label: "生图与路由",
    description: "管理上游生图渠道、Grok 与 GPT 模型目录、积分单价、本地号池路由及任务观测统计。",
    sections: [
      {
        id: "settings-section-image-channels",
        label: "渠道与模型计费",
        summary: "配置生图渠道、Grok 模型管理、各分辨率积分单价与视频按秒计费",
        keywords: ["grok", "gpt-image", "渠道", "模型管理", "积分", "计费", "单价", "video", "视频"],
      },
      {
        id: "settings-section-image-routing",
        label: "本地号池路由",
        summary: "设置默认生图模型、内部 Slug 映射与上游失败自动降级链",
        keywords: ["account_pool", "号池", "路由", "默认模型", "slug", "fallback", "降级"],
      },
      {
        id: "settings-section-image-stats",
        label: "生图任务统计",
        summary: "实时观测各生图渠道成功率、阶段耗时分布与最近失败原因",
        keywords: ["统计", "成功率", "耗时", "监控", "错误率"],
      },
    ],
  },
  {
    key: "email",
    label: "邮箱与注册",
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
    key: "register",
    label: "代理与清障",
    description: "分别治理生图/视频上游号池出站代理、WARP 清障以及自动化注册机 Cloudflare 预热。",
    sections: [
      {
        id: "settings-section-register-upstream",
        label: "上游代理与 WARP",
        summary: "生图与视频上游号池出站代理、Cloudflare Clearance 模式与挑战冷却",
        keywords: ["proxy", "代理", "warp", "cloudflare", "cf", "清障", "flaresolverr", "冷却"],
      },
      {
        id: "settings-section-register-bot",
        label: "自动注册机清障",
        summary: "自动化注册机独立代理、清障超时与启动预热策略",
        keywords: ["注册机", "clearance", "预热", "验证码清障"],
      },
    ],
  },
  {
    key: "imports",
    label: "账号导入",
    description: "连接远程 CPA 号池节点、浏览远端可用账号并批量同步导入本地号池。",
    sections: [
      {
        id: "settings-section-imports-cpa",
        label: "CPA 远程号池连接",
        summary: "新增、测试或同步远程 CPA 号池服务并批量拉取账号凭据",
        keywords: ["cpa", "号池导入", "批量导入", "远程同步", "token"],
      },
    ],
  },
  {
    key: "storage",
    label: "媒体存储",
    description: "切换本地磁盘或 Cloudflare R2 对象存储后端，管理预签名有效期与历史媒体平滑迁移。",
    sections: [
      {
        id: "settings-section-storage-r2",
        label: "存储后端与 R2 迁移",
        summary: "配置本地存储 / Cloudflare R2 桶凭据、自动清理与存量图片迁移",
        keywords: ["r2", "cloudflare", "s3", "对象存储", "bucket", "本地存储", "迁移", "清理"],
      },
    ],
  },
  {
    key: "announcement",
    label: "站内公告",
    description: "编排全站弹窗通知与版本公告，支持随时启用、停用或更新面向创作者的提示内容。",
    sections: [
      {
        id: "settings-section-announcement-list",
        label: "公告发布与管理",
        summary: "新建、编辑、启停或删除站内弹窗公告通知",
        keywords: ["公告", "通知", "弹窗", "banner", "消息"],
      },
    ],
  },
  {
    key: "backup",
    label: "数据备份",
    description: "配置核心数据库定时快照策略、Cloudflare R2 异地容灾归档与历史备份恢复。",
    sections: [
      {
        id: "settings-section-backup-policy",
        label: "定时备份与异地容灾",
        summary: "管理本地与 R2 云端数据库备份计划、手动立即备份及快照恢复",
        keywords: ["backup", "备份", "恢复", "快照", "数据库", "容灾"],
      },
    ],
  },
  {
    key: "maintenance",
    label: "维护与日志",
    description: "治理系统运行日志采集级别、保留周期与磁盘空间释放，快速直达审计与队列中心。",
    sections: [
      {
        id: "settings-section-maintenance-shortcuts",
        label: "审计与队列入口",
        summary: "一键前往系统审计日志检索台或创作任务历史队列",
        keywords: ["审计", "任务历史", "队列入口"],
      },
      {
        id: "settings-section-maintenance-logs",
        label: "日志级别与清理",
        summary: "调整日志级别过滤、保留天数并手动清理过期历史日志",
        keywords: ["log", "日志", "清理", "保留期", "debug", "error"],
      },
    ],
  },
  {
    key: "system-update",
    label: "系统更新",
    description: "检查 GitHub 最新发行版本、执行环境预检并在宿主机触发平滑在线升级。",
    sections: [
      {
        id: "settings-section-update-center",
        label: "版本预检与在线升级",
        summary: "查看当前运行版本、核验升级前置条件并拉取最新镜像平滑重启",
        keywords: ["update", "升级", "更新", "版本", "github", "release", "docker"],
      },
    ],
  },
] as const;

export type SettingsTabMeta = (typeof SETTINGS_TABS)[number];
export type SettingsTabKey = SettingsTabMeta["key"];

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
    defaultTab: "base",
    tabs: ["base", "image"],
  },
  {
    id: "access",
    label: "账号与风控",
    defaultTab: "email",
    tabs: ["email", "register", "imports"],
  },
  {
    id: "content",
    label: "存储与公告",
    defaultTab: "storage",
    tabs: ["storage", "announcement"],
  },
  {
    id: "ops",
    label: "备份与运维",
    defaultTab: "backup",
    tabs: ["backup", "maintenance", "system-update"],
  },
] as const;

export const SETTINGS_NAVIGATE_TAB_EVENT = "shengtu:settings-navigate-tab";

export function parseSettingsTab(value: string | null): SettingsTabKey {
  return SETTINGS_TABS.some((tab) => tab.key === value)
    ? (value as SettingsTabKey)
    : "base";
}

export function getSettingsTabMeta(tab: SettingsTabKey): SettingsTabMeta {
  return SETTINGS_TABS.find((item) => item.key === tab) ?? SETTINGS_TABS[0];
}

export function getSettingsDomainForTab(tab: SettingsTabKey): SettingsDomainId {
  const found = SETTINGS_DOMAIN_GROUPS.find((group) =>
    group.tabs.includes(tab),
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

export function searchSettingsCatalog(rawQuery: string, limit = 12): SettingsSearchMatch[] {
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

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
