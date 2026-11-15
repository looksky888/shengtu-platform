import { httpRequest } from "@/lib/request";

export type OverviewPeriod = "today" | "7d" | "30d";
export type OverviewCapability = "all" | "image" | "video";

export interface AdminOverviewResponse {
  period: OverviewPeriod;
  capability: OverviewCapability;
  channel: string;
  model: string;
  generated_at: string;
  tasks: {
    total: number;
    succeeded: number;
    failed: number;
    running: number;
    queued: number;
    finished: number;
    success_rate: number;
    total_images: number;
    total_videos: number;
    avg_duration_ms: number;
  };
  series: Array<{
    bucket: string;
    label: string;
    total: number;
    succeeded: number;
    failed: number;
    images: number;
    videos: number;
  }>;
  models: Array<{
    model: string;
    channel_id: string;
    channel_name: string;
    capability: string;
    total: number;
    succeeded: number;
    failed: number;
    success_rate: number;
    avg_duration_ms: number;
  }>;
  errors: Array<{
    reason: string;
    model: string;
    channel_name: string;
    count: number;
    last_seen_at: string;
  }>;
  filter_options: {
    channels: Array<{ id: string; name: string; type: string; enabled: boolean }>;
    models: string[];
  };
  users: {
    total_users: number;
    active_users: number;
    paid_users: number;
    total_credits_balance: number;
  };
  payments: {
    period_amount_fen: number;
    period_succeeded_orders: number;
    period_total_orders: number;
    today_amount_fen: number;
    last_7d_amount_fen: number;
    last_30d_amount_fen: number;
    all_time_amount_fen: number;
    all_time_succeeded_orders: number;
    recharge_enabled: boolean;
    channel_breakdown: Array<{ channel: string; amount_fen: number; orders: number }>;
  };
  pools: {
    openai: {
      total: number;
      available: number;
      cooling: number;
      quarantined: number;
      disabled: number;
    };
    grok: {
      total: number;
      available: number;
      cooling: number;
      quarantined: number;
      disabled: number;
      theoretical_slots: number;
    };
    proxy_enabled: boolean;
    clearance_mode: string;
  };
}

export interface AdminOverviewQueryParams {
  period?: OverviewPeriod;
  capability?: OverviewCapability;
  channel?: string;
  model?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNonNegNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePeriod(value: unknown, fallback: OverviewPeriod = "7d"): OverviewPeriod {
  if (value === "today" || value === "7d" || value === "30d") return value;
  return fallback;
}

function normalizeCapability(
  value: unknown,
  fallback: OverviewCapability = "all",
): OverviewCapability {
  if (value === "all" || value === "image" || value === "video") return value;
  return fallback;
}

export function normalizeAdminOverviewResponse(
  raw: unknown,
  fallbackParams: AdminOverviewQueryParams = {},
): AdminOverviewResponse {
  const root = asRecord(raw);
  const rawTasks = asRecord(root.tasks);
  const rawFilterOptions = asRecord(root.filter_options);
  const rawUsers = asRecord(root.users);
  const rawPayments = asRecord(root.payments);
  const rawPools = asRecord(root.pools);
  const rawOpenAI = asRecord(rawPools.openai);
  const rawGrok = asRecord(rawPools.grok);

  const succeeded = asNonNegNumber(rawTasks.succeeded);
  const failed = asNonNegNumber(rawTasks.failed);
  const running = asNonNegNumber(rawTasks.running);
  const queued = asNonNegNumber(rawTasks.queued);
  const finished =
    rawTasks.finished !== undefined && rawTasks.finished !== null
      ? asNonNegNumber(rawTasks.finished)
      : succeeded + failed;
  const total =
    rawTasks.total !== undefined && rawTasks.total !== null
      ? asNonNegNumber(rawTasks.total)
      : finished + running + queued;
  const computedRate = finished > 0 ? (succeeded / finished) * 100 : 0;
  const rawSuccessRate = Number(rawTasks.success_rate);
  const successRate =
    finished > 0 && Number.isFinite(rawSuccessRate)
      ? Math.min(100, Math.max(0, rawSuccessRate))
      : computedRate;

  const series = Array.isArray(root.series)
    ? root.series.map((entry, idx) => {
        const row = asRecord(entry);
        const bucket = asString(row.bucket, String(idx));
        return {
          bucket,
          label: asString(row.label, bucket),
          total: asNonNegNumber(row.total),
          succeeded: asNonNegNumber(row.succeeded),
          failed: asNonNegNumber(row.failed),
          images: asNonNegNumber(row.images),
          videos: asNonNegNumber(row.videos),
        };
      })
    : [];

  const models = Array.isArray(root.models)
    ? root.models.map((entry) => {
        const row = asRecord(entry);
        const rowSucceeded = asNonNegNumber(row.succeeded);
        const rowFailed = asNonNegNumber(row.failed);
        const rowFinished = rowSucceeded + rowFailed;
        const rowRawRate = Number(row.success_rate);
        const rowSuccessRate =
          rowFinished > 0
            ? Number.isFinite(rowRawRate)
              ? Math.min(100, Math.max(0, rowRawRate))
              : (rowSucceeded / rowFinished) * 100
            : 0;
        return {
          model: asString(row.model, "unknown"),
          channel_id: asString(row.channel_id),
          channel_name: asString(row.channel_name),
          capability: asString(row.capability, "image"),
          total: asNonNegNumber(row.total),
          succeeded: rowSucceeded,
          failed: rowFailed,
          success_rate: rowSuccessRate,
          avg_duration_ms: asNonNegNumber(row.avg_duration_ms),
        };
      })
    : [];

  const errors = Array.isArray(root.errors)
    ? root.errors.map((entry) => {
        const row = asRecord(entry);
        return {
          reason: asString(row.reason, "未知异常"),
          model: asString(row.model),
          channel_name: asString(row.channel_name),
          count: asNonNegNumber(row.count),
          last_seen_at: asString(row.last_seen_at),
        };
      })
    : [];

  const channels = Array.isArray(rawFilterOptions.channels)
    ? rawFilterOptions.channels
        .map((entry) => {
          const row = asRecord(entry);
          const id = asString(row.id).trim();
          if (!id) return null;
          return {
            id,
            name: asString(row.name, id),
            type: asString(row.type),
            enabled: asBoolean(row.enabled, true),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : [];

  const modelOptions = Array.isArray(rawFilterOptions.models)
    ? Array.from(
        new Set(
          rawFilterOptions.models
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean),
        ),
      )
    : [];

  const channelBreakdown = Array.isArray(rawPayments.channel_breakdown)
    ? rawPayments.channel_breakdown.map((entry) => {
        const row = asRecord(entry);
        return {
          channel: asString(row.channel, "未知渠道"),
          amount_fen: asNonNegNumber(row.amount_fen),
          orders: asNonNegNumber(row.orders),
        };
      })
    : [];

  return {
    period: normalizePeriod(root.period, fallbackParams.period ?? "7d"),
    capability: normalizeCapability(root.capability, fallbackParams.capability ?? "all"),
    channel: asString(root.channel, fallbackParams.channel ?? ""),
    model: asString(root.model, fallbackParams.model ?? ""),
    generated_at: asString(root.generated_at),
    tasks: {
      total,
      succeeded,
      failed,
      running,
      queued,
      finished,
      success_rate: successRate,
      total_images: asNonNegNumber(rawTasks.total_images),
      total_videos: asNonNegNumber(rawTasks.total_videos),
      avg_duration_ms: asNonNegNumber(rawTasks.avg_duration_ms),
    },
    series,
    models,
    errors,
    filter_options: {
      channels,
      models: modelOptions,
    },
    users: {
      total_users: asNonNegNumber(rawUsers.total_users),
      active_users: asNonNegNumber(rawUsers.active_users),
      paid_users: asNonNegNumber(rawUsers.paid_users),
      total_credits_balance: asNonNegNumber(rawUsers.total_credits_balance),
    },
    payments: {
      period_amount_fen: asNonNegNumber(rawPayments.period_amount_fen),
      period_succeeded_orders: asNonNegNumber(rawPayments.period_succeeded_orders),
      period_total_orders: asNonNegNumber(rawPayments.period_total_orders),
      today_amount_fen: asNonNegNumber(rawPayments.today_amount_fen),
      last_7d_amount_fen: asNonNegNumber(rawPayments.last_7d_amount_fen),
      last_30d_amount_fen: asNonNegNumber(rawPayments.last_30d_amount_fen),
      all_time_amount_fen: asNonNegNumber(rawPayments.all_time_amount_fen),
      all_time_succeeded_orders: asNonNegNumber(rawPayments.all_time_succeeded_orders),
      recharge_enabled: asBoolean(rawPayments.recharge_enabled, false),
      channel_breakdown: channelBreakdown,
    },
    pools: {
      openai: {
        total: asNonNegNumber(rawOpenAI.total),
        available: asNonNegNumber(rawOpenAI.available),
        cooling: asNonNegNumber(rawOpenAI.cooling),
        quarantined: asNonNegNumber(rawOpenAI.quarantined),
        disabled: asNonNegNumber(rawOpenAI.disabled),
      },
      grok: {
        total: asNonNegNumber(rawGrok.total),
        available: asNonNegNumber(rawGrok.available),
        cooling: asNonNegNumber(rawGrok.cooling),
        quarantined: asNonNegNumber(rawGrok.quarantined),
        disabled: asNonNegNumber(rawGrok.disabled),
        theoretical_slots: asNonNegNumber(rawGrok.theoretical_slots),
      },
      proxy_enabled: asBoolean(rawPools.proxy_enabled, false),
      clearance_mode: asString(rawPools.clearance_mode),
    },
  };
}

export function buildAdminOverviewQueryString(params: AdminOverviewQueryParams = {}): string {
  const search = new URLSearchParams();
  search.set("period", params.period ?? "7d");
  search.set("capability", params.capability ?? "all");

  const channel = params.channel?.trim();
  if (channel && channel !== "all") {
    search.set("channel", channel);
  }

  const model = params.model?.trim();
  if (model && model !== "all") {
    search.set("model", model);
  }

  return search.toString();
}

export async function fetchAdminOverview(
  params: AdminOverviewQueryParams = {},
  signal?: AbortSignal,
): Promise<AdminOverviewResponse> {
  const qs = buildAdminOverviewQueryString(params);
  const raw = await httpRequest<unknown>(`/api/admin/overview?${qs}`, { signal });
  return normalizeAdminOverviewResponse(raw, params);
}
